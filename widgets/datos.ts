// Fuente de datos del widget "Mi Día". Se usa desde DOS lugares:
//  1) widget-task-handler.tsx — cuando Android pide refrescar el widget
//     (WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED / WIDGET_CLICK), corre en
//     una tarea headless sin UI, así que no puede depender de ningún estado de
//     React ni de pantallas montadas.
//  2) lib/widgetUpdate.ts — cuando la propia app quiere forzar un refresco
//     inmediato tras una acción (publicar una propiedad, por ejemplo).
//
// Misma fuente en ambos casos para que el número que ves en el widget SIEMPRE
// coincida con "Mi Día" dentro de la app (mismos límites de fecha, misma tabla).
import { supabase } from '../lib/supabase'
import type { DatosWidgetMiDia } from './MiDiaWidget'

const META_PUBLICACIONES = 20

export async function obtenerDatosWidget(): Promise<DatosWidgetMiDia | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return null

  // Límites de "hoy" en la hora LOCAL del dispositivo — el widget vive en el
  // mismo teléfono que la app, así que coincide con lo que el usuario ve ahí
  // sin necesidad de matemática de zona horaria (a diferencia de reportes que
  // agregan datos de gente en distintas zonas).
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)

  const [pubRes, recsRes, rachaRes] = await Promise.all([
    supabase.from('publicacion_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', hoy.toISOString()),
    supabase.from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completado', false)
      .gte('fecha_hora', hoy.toISOString())
      .lt('fecha_hora', manana.toISOString()),
    supabase.rpc('get_estado_racha'),
  ])

  // meta_diaria/misiones_hoy vienen de la MISMA rpc que ya se pedía para la
  // racha (get_estado_racha) — es la fuente que también usa PanelRacha.tsx en
  // la app, así que el número siempre coincide con lo que se ve ahí.
  const racha = rachaRes.data as { racha?: number; meta_diaria?: number; misiones_hoy?: number } | null

  return {
    publicacionesHoy: pubRes.count ?? 0,
    metaPublicaciones: META_PUBLICACIONES,
    seguimientosHoy: recsRes.count ?? 0,
    racha: racha?.racha ?? 0,
    misionesHoy: racha?.misiones_hoy ?? 0,
    metaMisiones: racha?.meta_diaria ?? 1,
  }
}
