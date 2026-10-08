import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase } from './supabase'

import { getUsuarioActual } from './sesion'
// El handler global (qué tan visible es la notificación con la app abierta)
// se define una sola vez en app/_layout.tsx, que siempre se carga primero.

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

// Identificadores del canal y de la categoría de las alarmas.
//
// El canal lleva "_v1" a propósito. Android congela la configuración de un
// canal en el momento de crearlo: el sonido, la importancia y la vibración no
// se pueden cambiar después, porque a partir de ahí manda el usuario desde
// ajustes. La única forma de cambiar el tono más adelante es publicar un canal
// nuevo, y para eso el nombre tiene que poder subir a _v2.
export const CANAL_ALARMAS = 'alarmas_v1'
export const CATEGORIA_ALARMA = 'alarma'

// Canal de Android para los push de alarma que manda el servidor.
//
// Sin esto, todo push del servidor cae en el canal "default" que crea Expo con
// importancia media: Android lo mete en la bandeja sin cartel ni sonido
// garantizado. Este va en MAX, que es lo que saca el cartel encima de lo que
// estés viendo aunque el celular esté bloqueado.
//
// El sonido es alarma_valera.wav, 20 segundos de pitidos. Android reproduce el
// sonido del canal UNA vez por notificación y no hay forma de pedirle que lo
// repita, así que para que "suene como alarma" el archivo tiene que durar. El
// nombre va sin extensión: Android lo busca en res/raw, donde el plugin de
// expo-notifications lo deja al compilar.
// El wav vive dentro del binario, no en el paquete OTA: lo mete el plugin de
// expo-notifications al compilar. Esta es la primera versión que lo trae.
const VERSION_CON_SONIDO = [1, 0, 7]

function binarioTraeElSonido(): boolean {
  const v = (Constants.expoConfig?.version ?? '0.0.0').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const a = v[i] ?? 0, b = VERSION_CON_SONIDO[i]
    if (a !== b) return a > b
  }
  return true
}

export async function crearCanalesAndroid() {
  if (Platform.OS !== 'android') return
  // Si este código llega por OTA a un binario viejo, el canal se crearía
  // apuntando a un res/raw que ahí no existe: quedaría mudo PARA SIEMPRE,
  // porque Android congela la configuración del canal al crearlo y ni siquiera
  // instalar la versión nueva lo arregla. Mejor no crearlo todavía.
  if (!binarioTraeElSonido()) return
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ALARMAS, {
      name: 'Alarmas de pendientes',
      description: 'Leads sin contactar y citas sin retroalimentar',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 600, 300, 600, 300, 600, 300, 600],
      sound: 'alarma_valera',
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
  } catch { /* si falla, el push cae en el canal por defecto: peor, pero llega */ }
}

// Botones que salen EN la notificación, para no tener que buscar la pantalla.
//
// Los dos abren la app. Se intentó que "Posponer" no la abriera
// (opensAppToForeground: false), pero esa variante solo funciona si el proceso
// de la app sigue vivo: con la app cerrada —que es justo cuando importa— el
// botón no haría nada y el usuario creería que pospuso. Abrir y posponer de
// inmediato es menos elegante y siempre funciona.
export async function crearCategoriasNotificacion() {
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORIA_ALARMA, [
      { identifier: 'atender',  buttonTitle: 'Atender',      options: { opensAppToForeground: true } },
      { identifier: 'posponer', buttonTitle: 'Posponer 1 h', options: { opensAppToForeground: true } },
    ])
  } catch { /* sin categoría la notificación sale igual, solo que sin botones */ }
}

export async function programarRecordatorios() {
  if (Platform.OS === 'web') return
  const permiso = await solicitarPermisosNotificaciones()
  if (!permiso) return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recordatorios', {
      name: 'Recordatorios',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    })
  }

  // Cancelar notificaciones anteriores de recordatorios
  const programadas = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of programadas) {
    if (n.content.data?.tipo === 'recordatorio') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }

  const { data: { user } } = await getUsuarioActual()
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

    const channelId = Platform.OS === 'android' ? 'recordatorios' : undefined

    // ── Notificación exacta ──────────────────────────────────────
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${rec.titulo}`,
        body:  [nombreCliente, rec.descripcion].filter(Boolean).join(' · ') || 'Seguimiento pendiente',
        sound: true,
        data,
        ...(channelId ? { channelId } : {}),
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
          ...(channelId ? { channelId } : {}),
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
          ...(channelId ? { channelId } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: unaHora },
      })
    }
  }
}
