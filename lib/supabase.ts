import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// En web usamos localStorage directamente para evitar race conditions con AsyncStorage
const webStorage = {
  getItem: (key: string) => { try { return Promise.resolve(localStorage.getItem(key)) } catch { return Promise.resolve(null) } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} return Promise.resolve() },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch {} return Promise.resolve() },
}

// ── Lock de auth: serializa EN MEMORIA (una cadena de promesas) ──────────────
// El problema que resuelve: Supabase ROTA el refresh_token en cada refresco
// (cada token es de un solo uso). Si dos refrescos corren a la vez —el automático
// de startAutoRefresh + uno que dispara una petición cuando el token está por
// expirar— el segundo usa un refresh_token ya rotado; Supabase lo trata como
// "token reusado" e INVALIDA la sesión entera. Sintoma: tras ~1 hora conectado,
// al usuario lo sacan solo y pierde lo que estaba haciendo.
//
// Antes se desactivaba el lock por completo (fn => fn()) para evitar deadlocks
// del lock por almacenamiento (navigator.locks en web, processLock en nativo).
// Pero eso es justo lo que permitia la carrera. Este lock serializa las
// operaciones de auth en una cadena de promesas EN MEMORIA: nunca dos refrescos
// a la vez, y como no toca el almacenamiento no puede reproducir aquellos
// deadlocks. Cada operacion tiene un tope de 30 s por si la red se cuelga, para
// que la cadena nunca se quede bloqueada para siempre.
let cadenaAuth: Promise<unknown> = Promise.resolve()

function conTope<R>(p: Promise<R>, ms: number): Promise<R> {
  // OJO: hay que CANCELAR el timer cuando la operación termina. Si no, aunque
  // `p` gane la carrera, el setTimeout sigue vivo y 30 s después rechaza una
  // promesa que ya nadie escucha → "promesa sin manejar: auth lock timeout"
  // (aparecía en el monitoreo aunque todo funcionara bien).
  let timer: ReturnType<typeof setTimeout>
  const tope = new Promise<R>((_, reject) => {
    timer = setTimeout(() => reject(new Error('auth lock timeout')), ms)
  })
  return Promise.race([p, tope]).finally(() => clearTimeout(timer))
}

function lockSerial<R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> {
  // Corre después de que la operación anterior termine (éxito o fallo).
  // 60 s: conexiones lentas/móviles en modo ahorro necesitan más margen.
  const resultado = cadenaAuth.then(() => conTope(fn(), 60000), () => conTope(fn(), 60000))
  cadenaAuth = resultado.then(() => undefined, () => undefined)
  return resultado
}

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
  const res = await fetchConTimeout(input as any, init, TIMEOUT_MS)
  if (res.status !== 401) return res
  const url = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url
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
    lock: lockSerial,
  },
  global: { fetch: fetchConAuth },
})
