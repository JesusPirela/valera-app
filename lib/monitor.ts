import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase, setReporteFallos } from './supabase'
import { setReporteGuardados } from './db'

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
// El resto son errores de NAVEGADOR/EXTENSIONES (Firefox Reader, scripts de
// terceros con CORS, ResizeObserver) que NO son de nuestro código.
const MENSAJES_RUIDO = [
  'auth lock timeout',
  '__firefox__',                       // Firefox Reader / extensiones
  'Script error.',                     // error cross-origin sin detalle (script externo)
  'ResizeObserver loop',               // benigno del navegador
  'Non-Error promise rejection captured',
  'Load failed',                       // fetch abortado por el navegador (cambio de página)
  'The operation was aborted',         // AbortController al navegar
  'timeout exceeded',                  // timeout benigno en 2º plano; la app se recupera
]

// ¿Hay una sesión iniciada? Los errores GLOBALES de la web sin sesión provienen
// casi siempre de BOTS de previsualización de enlaces (Facebook/WhatsApp/Google)
// que ejecutan mal la ficha pública /ficha y ensucian el panel con basura
// minificada ("fa", "a.J", "Maximum call stack"). No los registramos.
let haySesion = false

// Pantalla en la que está el usuario, para adjuntarla al contexto del error.
// Los stacks de producción son ilegibles porque el bundle va minificado y sin
// sourcemaps ("index-3f7eb…js:1210:4931"), así que saber la PANTALLA es lo que
// convierte un reporte en algo accionable: reduce la búsqueda de toda la app a
// un archivo. Lo actualiza _layout.tsx en cada cambio de ruta.
let pantallaActual = ''
export function setPantalla(ruta: string): void { pantallaActual = ruta || '' }

export function captureError(error: unknown, contexto?: string): void {
  try {
    const mensaje = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack ?? null : null
    if (!mensaje || MENSAJES_RUIDO.some(m => mensaje.includes(m)) || repetido(mensaje + (contexto ?? ''))) return
    const ctx = [contexto, pantallaActual && `@ ${pantallaActual}`].filter(Boolean).join(' ') || null
    supabase.rpc('log_error', {
      p_mensaje: mensaje,
      p_stack: stack,
      p_contexto: ctx,
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

  // Registrar el reporte de fallos de la API (ver setReporteFallos en
  // supabase.ts): con esto, toda respuesta 4xx/5xx de Supabase llega al panel,
  // venga de donde venga, sin tocar las ~300 llamadas de la app.
  setReporteFallos((mensaje, contexto) => captureError(mensaje, contexto))
  // Y los guardados que RLS deja en 0 filas, que el fetch no puede ver porque
  // el servidor responde OK (ver lib/db.ts).
  setReporteGuardados((mensaje, contexto) => captureError(mensaje, contexto))

  if (Platform.OS === 'web') {
    // Mantener actualizado si hay sesión para descartar el ruido anónimo (bots).
    supabase.auth.getSession().then(({ data }) => { haySesion = !!data.session }, () => {})
    supabase.auth.onAuthStateChange((_e, session) => { haySesion = !!session })
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (e) => { if (haySesion) captureError(e.error ?? e.message, 'window.onerror') })
      window.addEventListener('unhandledrejection', (e) => { if (haySesion) captureError(e.reason ?? 'unhandledrejection', 'promesa sin manejar') })
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
