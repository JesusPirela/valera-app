// Resolver un link de Google Maps a coordenadas, incluidos los cortos.
//
// Vive aparte de `maps-link.ts` a propósito: ese archivo no importa nada (por
// eso se puede probar con `node scripts/test-maps-link.mjs` sin levantar la
// app), y aquí es donde entra Supabase.
import { supabase } from './supabase'
import { parsearLinkMaps, esLinkCortoMaps, type UbicacionMaps } from './maps-link'

export type ResultadoMaps =
  | { ok: true; ubicacion: UbicacionMaps }
  | { ok: false; motivo: string }

/**
 * Las coordenadas de un link.
 *
 * Los largos se leen aquí mismo, sin pedirle nada a nadie. Los cortos
 * (maps.app.goo.gl) hay que canjearlos primero, y eso solo se puede hacer
 * desde el servidor: el navegador no tiene permiso para leer la respuesta de
 * otro dominio.
 */
export async function ubicacionDesdeLink(texto: string): Promise<ResultadoMaps> {
  const directo = parsearLinkMaps(texto)
  if (directo) return { ok: true, ubicacion: directo }

  if (!esLinkCortoMaps(texto)) {
    return { ok: false, motivo: 'Ese link no trae coordenadas. En Google Maps, abre el lugar y usa Compartir → Copiar vínculo.' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('resolver-maps', {
      body: { url: texto.trim() },
    })
    if (error) return { ok: false, motivo: 'No se pudo abrir el link (sin conexión o el servicio no respondió).' }
    const largo = (data as any)?.url
    const u = typeof largo === 'string' ? parsearLinkMaps(largo) : null
    if (!u) {
      return { ok: false, motivo: 'El link se abrió pero no traía coordenadas. Abre el lugar en Google Maps y vuelve a copiar el vínculo.' }
    }
    return { ok: true, ubicacion: u }
  } catch {
    return { ok: false, motivo: 'No se pudo abrir el link (sin conexión).' }
  }
}
