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
  const resultado = cadenaAuth.then(() => conTope(fn(), 30000), () => conTope(fn(), 30000))
  cadenaAuth = resultado.then(() => undefined, () => undefined)
  return resultado
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: lockSerial,
  },
})
