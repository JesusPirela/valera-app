import { supabase } from './supabase'

// Fuente ÚNICA de la query 'publicaciones-usuario' (las propiedades que el
// usuario actual ya marcó como publicadas, con su conteo y fecha).
//
// Vive aquí porque DOS pantallas la usan con la MISMA queryKey y por lo tanto
// comparten caché de React Query: el listado (propiedades.tsx) y el detalle
// (detalle-propiedad.tsx). Cuando cada una tenía su propia implementación, la
// del detalle —sin paginar— sobrescribía en caché la del listado y el bug
// reaparecía nada más abrir una propiedad.
//
// PAGINADO OBLIGATORIO: PostgREST corta en 1000 filas por petición. Sin esto,
// un usuario con más de 1000 propiedades publicadas recibía solo las primeras
// 1000 y todas las demás llegaban como si no existieran → aparecían bajo
// "Sin publicar" aunque en la BD tuvieran veces_publicada > 0. Solo lo notaban
// los prospectadores más activos, los únicos que cruzan las 1000.
// El .order() es imprescindible: sin un orden estable, .range() puede repetir
// u omitir filas entre páginas.

export type PublicacionesData = {
  publicacionesMap: Record<string, number>
  publicacionFechasMap: Record<string, string>
}

type Fila = {
  propiedad_id: string
  veces_publicada: number
  fecha_publicacion: string | null
}

const PAGE = 1000

export async function fetchPublicacionesUsuario(uid: string): Promise<PublicacionesData> {
  let filas: Fila[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('propiedad_publicacion')
      .select('propiedad_id, veces_publicada, fecha_publicacion')
      .eq('user_id', uid)
      .gt('veces_publicada', 0)
      .order('propiedad_id', { ascending: true })
      .range(from, from + PAGE - 1)
    // El error se PROPAGA a propósito: antes se ignoraba (`const { data } = ...`)
    // y una petición fallida dejaba el mapa vacío, o sea TODO "sin publicar".
    // Propagándolo, React Query reintenta y la pantalla muestra estado de carga.
    if (error) throw error
    filas = filas.concat((data ?? []) as Fila[])
    if (!data || data.length < PAGE) break
  }

  return {
    publicacionesMap: Object.fromEntries(
      filas.map(r => [r.propiedad_id, r.veces_publicada ?? 0])
    ),
    publicacionFechasMap: Object.fromEntries(
      filas
        .filter(r => r.fecha_publicacion)
        .map(r => [r.propiedad_id, r.fecha_publicacion as string])
    ),
  }
}

// ── Bloqueos de publicación ────────────────────────────────────────────────
// Vive aquí, y no en una pantalla, porque las DOS que publican tienen que
// decir lo mismo. Cuando solo lo tenía el detalle, el listado mostraba el
// código crudo del servidor ("una_por_semana") y se leía como app rota.

/**
 * Convierte el código de error del servidor en algo que una persona entienda.
 *
 * Los bloqueos de publicación no son un fallo de la app: son a propósito, para
 * que Facebook no vea la misma casa repetida y empiece a bajar anuncios y a
 * restringir cuentas. Si el aviso no explica eso, se lee como que la app está
 * rota y la gente insiste una y otra vez, que es lo peor que puede pasar.
 *
 * Cada mensaje responde tres cosas: qué pasó, por qué, y qué hacer ahora.
 */
export function explicarBloqueo(data: any): { titulo: string; mensaje: string } {
  if (data?.error === 'saturada') {
    const veces = data.veces_semana ?? 10
    const personas = data.personas ?? 0
    const quienes = personas > 1 ? ` por ${personas} personas distintas` : ''
    let cuando = ''
    if (data.libre_desde) {
      const d = new Date(data.libre_desde)
      if (!isNaN(d.getTime())) {
        cuando = `\n\nSe desbloquea el ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.`
      }
    }
    return {
      titulo: '🚦 Esta propiedad está saturada',
      mensaje:
        `Entre todo el equipo ya se publicó ${veces} veces este mes${quienes}.\n\n` +
        'Cuando la misma casa aparece tantas veces, Facebook los toma por anuncios ' +
        'repetidos: los baja y puede restringir las cuentas de quienes los subieron. ' +
        'Por eso se frena aquí.' + cuando + '\n\n' +
        'Mientras tanto publica otra: hay inventario de sobra y esas sí te van a durar ' +
        'arriba. Si de verdad necesitas esta, pide luz verde a dirección.',
    }
  }

  if (data?.error === 'una_por_semana') {
    let cuando = ''
    if (data.libre_mia) {
      const d = new Date(data.libre_mia)
      if (!isNaN(d.getTime())) {
        const hoy = new Date()
        const dias = Math.max(1, Math.ceil((d.getTime() - hoy.getTime()) / 86_400_000))
        cuando = `\n\nLa vuelves a tener disponible en ${dias} ${dias === 1 ? 'día' : 'días'}, ` +
                 `el ${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}.`
      }
    }
    return {
      titulo: '🚦 Ya publicaste esta casa este mes',
      mensaje:
        'Ahora es una publicación por propiedad cada 30 días.\n\n' +
        'Subir la misma casa varias veces desde tu cuenta es lo que Facebook lee como ' +
        'anuncio duplicado: te la baja y puede restringirte. Dejándola el mes ' +
        'completo, tu anuncio dura arriba y lo ve más gente.' + cuando + '\n\n' +
        'Hoy publica otra: cuenta igual para tus números.',
    }
  }

  if (data?.error === 'limite') {
    return {
      titulo: '🚦 Ya la publicaste 10 veces',
      mensaje:
        'Ese es el máximo de una misma propiedad por persona.\n\n' +
        'Repetirla desde tu cuenta es justo lo que Facebook detecta como anuncio ' +
        'duplicado, y lo que hace que empiecen a bajarte publicaciones.\n\n' +
        'Elige otra propiedad: cuenta igual para tus números y te va a durar publicada.',
    }
  }

  if (data?.error === 'No autenticado') {
    return {
      titulo: 'Tu sesión expiró',
      mensaje: 'Cierra la app y vuelve a abrirla para seguir publicando.',
    }
  }

  // Cualquier otro caso: al menos no dejar al usuario sin saber qué hacer.
  return {
    titulo: 'No se pudo publicar',
    mensaje:
      `${data?.error ?? 'El servidor no respondió como se esperaba'}.\n\n` +
      'Vuelve a intentarlo en un momento. Si sigue igual, avísale a dirección.',
  }
}

