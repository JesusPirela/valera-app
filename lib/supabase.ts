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
function esAuth(url: string): boolean { return url.includes('/auth/v1/') }

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
  const res = await fetchConTimeout(input as any, init, esAuth(url) ? TIMEOUT_AUTH_MS : TIMEOUT_MS)
  if (res.status !== 401) return res
  if (!url || !url.includes('/rest/v1/')) return res

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
    return await fetchConTimeout(destino, { ...(init ?? {}), headers }, TIMEOUT_MS)
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
  },
  global: { fetch: fetchConAuth },
})
