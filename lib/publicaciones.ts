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
