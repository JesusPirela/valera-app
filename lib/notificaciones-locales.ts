import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
})

export async function solicitarPermisosNotificaciones(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

// ── Web: notificaciones del navegador ──────────────────────────
// En web no hay notificaciones locales programadas; usamos la API Notification
// del navegador, que muestra avisos del SO mientras la pestaña está abierta
// (incluso en segundo plano) si el usuario dio permiso.
export async function solicitarPermisoWeb(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const p = await Notification.requestPermission()
    return p === 'granted'
  } catch { return false }
}

export function notificarWeb(title: string, body: string, onClick?: () => void) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, icon: '/favicon.png' })
    if (onClick) n.onclick = () => { try { window.focus() } catch {}; onClick() }
  } catch {}
}

export async function programarRecordatorios() {
  if (Platform.OS === 'web') return
  const permiso = await solicitarPermisosNotificaciones()
  if (!permiso) return

  // Cancelar notificaciones anteriores de recordatorios
  const programadas = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of programadas) {
    if (n.content.data?.tipo === 'recordatorio') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const ahora  = new Date()
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: recordatorios } = await supabase
    .from('recordatorios')
    .select('id, titulo, descripcion, fecha_hora, cliente_id, clientes(nombre)')
    .eq('user_id', user.id)
    .eq('completado', false)
    .gte('fecha_hora', ahora.toISOString())
    .lte('fecha_hora', en7dias.toISOString())
    .order('fecha_hora', { ascending: true })

  if (!recordatorios) return

  for (const rec of recordatorios) {
    const fechaHora     = new Date(rec.fecha_hora)
    const segs          = (fechaHora.getTime() - Date.now()) / 1000
    if (segs < 10) continue

    const cliente       = (rec.clientes as any)?.nombre ?? null
    const nombreCliente = cliente ? `con ${cliente}` : ''
    const data          = { tipo: 'recordatorio', recordatorio_id: rec.id, cliente_id: rec.cliente_id }

    // ── Notificación exacta ──────────────────────────────────────
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${rec.titulo}`,
        body:  [nombreCliente, rec.descripcion].filter(Boolean).join(' · ') || 'Seguimiento pendiente',
        sound: true,
        data,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fechaHora },
    })

    // ── Aviso 15 minutos antes ───────────────────────────────────
    if (segs > 20 * 60) {
      const quinceMins = new Date(fechaHora.getTime() - 15 * 60 * 1000)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏱ En 15 min: ${rec.titulo}`,
          body:  `Tienes un seguimiento ${nombreCliente} en 15 minutos.`,
          sound: true,
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quinceMins },
      })
    }

    // ── Aviso 1 hora antes ───────────────────────────────────────
    if (segs > 65 * 60) {
      const unaHora = new Date(fechaHora.getTime() - 60 * 60 * 1000)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🔔 En 1 hora: ${rec.titulo}`,
          body:  `Tienes un seguimiento ${nombreCliente} en 1 hora.`,
          sound: true,
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: unaHora },
      })
    }
  }
}
