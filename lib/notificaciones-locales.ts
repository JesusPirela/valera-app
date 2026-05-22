import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configurar cómo se muestran las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function solicitarPermisosNotificaciones(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
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

  // Traer recordatorios pendientes de los próximos 7 días
  const ahora = new Date()
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: recordatorios } = await supabase
    .from('recordatorios')
    .select('id, titulo, descripcion, fecha_hora, cliente_id')
    .eq('user_id', user.id)
    .eq('completado', false)
    .gte('fecha_hora', ahora.toISOString())
    .lte('fecha_hora', en7dias.toISOString())
    .order('fecha_hora', { ascending: true })

  if (!recordatorios) return

  for (const rec of recordatorios) {
    const fechaHora = new Date(rec.fecha_hora)
    const segs = (fechaHora.getTime() - Date.now()) / 1000
    if (segs < 10) continue // Demasiado pronto

    // Notificación en el momento exacto
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${rec.titulo}`,
        body: rec.descripcion ?? 'Tienes un seguimiento pendiente.',
        sound: true,
        data: { tipo: 'recordatorio', recordatorio_id: rec.id, cliente_id: rec.cliente_id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fechaHora },
    })

    // Aviso anticipado 1 hora antes (si quedan más de 65 min)
    if (segs > 65 * 60) {
      const unaHoraAntes = new Date(fechaHora.getTime() - 60 * 60 * 1000)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🔔 En 1 hora: ${rec.titulo}`,
          body: 'Tienes un seguimiento en 1 hora.',
          sound: true,
          data: { tipo: 'recordatorio', recordatorio_id: rec.id, cliente_id: rec.cliente_id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: unaHoraAntes },
      })
    }
  }
}
