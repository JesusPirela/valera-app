import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, navigatorLock, processLock } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// En web usamos localStorage directamente para evitar race conditions con AsyncStorage
const webStorage = {
  getItem: (key: string) => { try { return Promise.resolve(localStorage.getItem(key)) } catch { return Promise.resolve(null) } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} return Promise.resolve() },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch {} return Promise.resolve() },
}

// ── Lock de auth: el de la propia librería ──────────────────────────────────
// Sigue haciendo falta un lock: Supabase ROTA el refresh_token en cada refresco
// (cada token es de un solo uso). Si dos refrescos corren a la vez, el segundo
// usa un token ya rotado, Supabase lo toma como "token reusado" e INVALIDA la
// sesión entera.
//
// Aquí hubo un lock casero (una cadena de promesas en memoria con un tope de
// 60 s) y ESE era la causa del bug "dejo la app un rato, vuelvo, le doy guardar
// y ya no deja hasta recargar (y pierdo todo)":
//
//   · auth-js pone `lockAcquired = true` al entrar al lock y solo lo baja en su
//     `finally`, o sea cuando la operación TERMINA de verdad.
//   · Al vencer el tope, el lock casero abandonaba esa operación y seguía de
//     largo. El `finally` no corría nunca, así que `lockAcquired` se quedaba en
//     true para siempre.
//   · Desde ahí auth-js entra por su rama reentrante (`if (this.lockAcquired)`),
//     que NO pasa por el lock, y se queda esperando la promesa abandonada dentro
//     de su bucle `while (this.pendingInLock.length)`. Resultado: getSession(),
//     getUser() y los refrescos quedaban colgados PARA SIEMPRE y lo único que lo
//     curaba era recargar. En monitoreo se veía como "auth lock timeout" (12).
//
// Se comprobó en el navegador: con el lock casero, tras un socket muerto el
// guardado se quedaba girando indefinidamente aunque el refresh ya hubiera
// respondido 200.
//
// Los locks que trae auth-js están hechos a la medida de ese bucle interno y
// nunca abandonan la operación: navigatorLock (web, Web Locks API, además
// serializa entre PESTAÑAS) y processLock (nativo, cadena de promesas).

// ── Red de seguridad: fetch con auto-recuperación de sesión ──────────────────
// Aunque el token se mantiene fresco solo (startAutoRefresh + lock serializado),
// existe una ventana minúscula en la que una petición puede salir con el token
// recién vencido y el servidor la rechaza con 401. SIN esto, esa escritura se
// perdería en silencio. CON esto: si una petición de DATOS (rest/v1) vuelve 401,
// se refresca la sesión y se REINTENTA la misma petición UNA vez con el token
// nuevo. Así, aunque alguien lleve horas conectado y publique, ninguna acción se
// pierde por un token vencido: se recupera sola.
//
// Solo se reintenta rest/v1 (datos), no auth/v1 (login/refresh), para no entrar
// en bucle. Y solo 401 (token), no 403 (permiso de RLS).
// ── Timeout por petición ─────────────────────────────────────────────────────
// El problema: tras dejar la pantalla abierta un rato (idle), el socket TCP
// puede quedar MUERTO sin que el sistema lo detecte. La siguiente petición se
// queda colgada PARA SIEMPRE (fetch no tiene timeout propio) → el botón se queda
// cargando y atorado. Con esto, cualquier petición que pase de TIMEOUT_MS se
// ABORTA: la promesa se rechaza, el catch del botón corre y la UI se libera
// (React Query/mutaciones reintentan y abren una conexión fresca). Se respeta
// un signal que ya venga del caller (cancelación de React Query, etc.).
const TIMEOUT_MS = 30000
// Las peticiones de AUTH van dentro del lock serializado: mientras una siga
// viva, ninguna otra operación de auth puede correr. Por eso se les da un tope
// mucho más corto que a las de datos — es la garantía de que fn() SIEMPRE
// termina y de que el lock no se queda tomado (ver lockSerial). 12 s es de
// sobra para un refresh incluso en red móvil lenta.
const TIMEOUT_AUTH_MS = 12000
// Las Edge Functions (importar-propiedad, valera-ai, etc.) pueden hacer trabajo
// pesado del lado del servidor (scraping con reintentos, llamadas a IA) que
// legítimamente tarda más de 30s. Con el tope general, esas llamadas se
// abortaban del lado del cliente ANTES de que el servidor alcanzara a
// responder, mostrando "Failed to send a request to the Edge Function" sin
// importar cuánto se optimizara el servidor.
const TIMEOUT_FUNCTIONS_MS = 120000
function esAuth(url: string): boolean { return url.includes('/auth/v1/') }
function esFunction(url: string): boolean { return url.includes('/functions/v1/') }

// ── Reporte de fallos de la API ─────────────────────────────────────────────
// Casi ninguna escritura de la app comprueba el error que devuelve Supabase:
// supabase.rpc() no LANZA, devuelve { error }, así que un try/catch alrededor
// nunca se entera y la app sigue como si hubiera guardado. De ahí salieron la
// retro que no se guardaba, el anuncio que no publicaba y los campos que se
// revertían al recargar: los tres tardaron días en detectarse porque nadie veía
// un error. Revisarlas una por una son ~300 llamadas; en vez de eso se observan
// TODAS aquí, que es el único sitio por el que pasan.
//
// Esto solo MIRA: no cambia la respuesta ni el flujo. Si el reporte falla, la
// petición sigue su curso igual.
//
// El reportero se inyecta desde monitor.ts (setReporteFallos) para no importar
// monitor aquí: monitor ya importa este módulo y sería un ciclo.
type ReporteFallo = (mensaje: string, contexto: string) => void
let reportarFallo: ReporteFallo | null = null
export function setReporteFallos(fn: ReporteFallo): void { reportarFallo = fn }

// "…/rest/v1/clientes?id=eq.123" → "clientes"; "…/rest/v1/rpc/get_ranking" →
// "rpc/get_ranking". Sin los parámetros, para que el panel agrupe las
// ocurrencias en una sola línea en vez de una por registro.
function rutaCorta(url: string): string {
  const m = url.match(/\/(?:rest|functions)\/v1\/([^?]+)/)
  return m ? m[1] : url.slice(0, 80)
}

function reportarSiFalla(res: Response, url: string, init: RequestInit | undefined): void {
  try {
    if (res.status < 400 || !reportarFallo) return
    if (esAuth(url)) return                       // login/refresh: los maneja auth-js
    if (res.status === 401) return                // ya se reintenta arriba con token nuevo
    if (res.status === 406) return                // .single() sin filas; es un caso normal
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const ruta = rutaCorta(url)
    // El detalle del error (el mensaje de Postgres, que es lo realmente útil:
    // "violates row-level security policy") se lee de una COPIA de la
    // respuesta, y solo en web. En nativo el fetch es un polyfill y no vale la
    // pena arriesgar que clonar interfiera con el cuerpo que va a leer
    // supabase-js: ahí se reporta el status y la ruta, que ya ubican el fallo.
    if (Platform.OS !== 'web') { reportarFallo(`API ${res.status} ${metodo} ${ruta}`, 'supabase'); return }
    res.clone().text().then(
      (txt) => {
        let detalle = ''
        try { const j = JSON.parse(txt); detalle = j.message ?? j.error ?? j.hint ?? '' } catch { detalle = txt.slice(0, 200) }
        reportarFallo?.(`API ${res.status} ${metodo} ${ruta}${detalle ? ` — ${detalle}` : ''}`, 'supabase')
      },
      () => { reportarFallo?.(`API ${res.status} ${metodo} ${ruta}`, 'supabase') },
    )
  } catch { /* observar nunca debe romper la petición */ }
}

function fetchConTimeout(input: any, init: RequestInit | undefined, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const callerSignal = init?.signal as AbortSignal | undefined | null
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort()
    else callerSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return fetch(input, { ...(init ?? {}), signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

const fetchConAuth: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url ?? ''
  const ms = esAuth(url) ? TIMEOUT_AUTH_MS : esFunction(url) ? TIMEOUT_FUNCTIONS_MS : TIMEOUT_MS
  const res = await fetchConTimeout(input as any, init, ms)
  if (res.status !== 401) { reportarSiFalla(res, url, init); return res }
  if (!url || !url.includes('/rest/v1/')) { reportarSiFalla(res, url, init); return res }

  try {
    const { data, error } = await supabase.auth.refreshSession()
    const token = data?.session?.access_token
    if (error || !token) return res
    const headers = new Headers(
      (init?.headers as HeadersInit | undefined) ??
      (typeof input === 'string' || input instanceof URL ? undefined : (input as Request).headers),
    )
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('apikey', supabaseAnonKey)
    const destino = typeof input === 'string' || input instanceof URL ? input : (input as Request).url
    const res2 = await fetchConTimeout(destino, { ...(init ?? {}), headers }, TIMEOUT_MS)
    reportarSiFalla(res2, url, init)   // el reintento con token nuevo también cuenta
    return res2
  } catch {
    return res  // si el refresh falla, devolvemos el 401 original
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: Platform.OS === 'web' ? navigatorLock : processLock,
    // Logs detallados del lock/refresh de auth. Apagado por defecto; se prende
    // con EXPO_PUBLIC_AUTH_DEBUG=1 para diagnosticar cuelgues de sesión.
    debug: process.env.EXPO_PUBLIC_AUTH_DEBUG === '1',
  },
  global: { fetch: fetchConAuth },
})
