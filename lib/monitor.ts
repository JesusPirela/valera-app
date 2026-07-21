import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase } from './supabase'

// ── Monitoreo ligero (errores + analítica), 100% en JS ──────────────────────
// Escribe a las tablas error_log / event_log vía RPC. Es un "Sentry/PostHog"
// casero que vive en la propia base: sin servicios externos y sin módulos
// nativos, así que viaja por OTA. No captura crashes NATIVOS (eso sí necesita
// SDK nativo), pero sí todos los errores de JavaScript, promesas sin manejar y
// fallos que reportemos a mano — que es donde estaba casi todo lo que se rompió.

const VERSION = Constants.expoConfig?.version ?? null
const PLATAFORMA = Platform.OS

// Anti-spam: no reportar el mismo mensaje más de una vez cada 30 s.
const vistos = new Map<string, number>()
function repetido(clave: string): boolean {
  const ahora = Date.now()
  const antes = vistos.get(clave) ?? 0
  if (ahora - antes < 30_000) return true
  vistos.set(clave, ahora)
  // Limpieza para que el mapa no crezca sin fin.
  if (vistos.size > 200) vistos.clear()
  return false
}

// Mensajes de RUIDO benigno que no vale la pena registrar (la app se recupera
// sola y solo ensucian el panel). "auth lock timeout" es la red de seguridad
// del lock de auth: si un refresco tarda demasiado se aborta y se reintenta; con
// el timeout por petición del fetch ya casi nunca ocurre y nunca rompe nada.
const MENSAJES_RUIDO = ['auth lock timeout']

export function captureError(error: unknown, contexto?: string): void {
  try {
    const mensaje = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack ?? null : null
    if (!mensaje || MENSAJES_RUIDO.some(m => mensaje.includes(m)) || repetido(mensaje + (contexto ?? ''))) return
    supabase.rpc('log_error', {
      p_mensaje: mensaje,
      p_stack: stack,
      p_contexto: contexto ?? null,
      p_plataforma: PLATAFORMA,
      p_version: VERSION,
    }).then(undefined, () => {})   // reportar nunca debe romper
  } catch { /* no-op */ }
}

export function track(evento: string, props?: Record<string, unknown>): void {
  try {
    supabase.rpc('log_evento', {
      p_evento: evento,
      p_props: props ?? null,
      p_plataforma: PLATAFORMA,
    }).then(undefined, () => {})
  } catch { /* no-op */ }
}

// Engancha los errores GLOBALES una sola vez, al arrancar la app.
let iniciado = false
export function initMonitoreo(): void {
  if (iniciado) return
  iniciado = true

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (e) => captureError(e.error ?? e.message, 'window.onerror'))
      window.addEventListener('unhandledrejection', (e) =>
        captureError(e.reason ?? 'unhandledrejection', 'promesa sin manejar'))
    }
    return
  }

  // Nativo: handler global de errores de JS. Se conserva el handler anterior
  // (el de Expo/RedBox) para no perder el comportamiento normal en desarrollo.
  const g = globalThis as any
  if (g.ErrorUtils?.getGlobalHandler) {
    const anterior = g.ErrorUtils.getGlobalHandler()
    g.ErrorUtils.setGlobalHandler((err: any, fatal?: boolean) => {
      captureError(err, fatal ? 'error fatal' : 'error JS')
      anterior?.(err, fatal)
    })
  }
}
