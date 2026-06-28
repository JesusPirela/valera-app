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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Bypass el mecanismo de lock en todos los entornos.
    // En web evita deadlocks con PersistQueryClient.
    // En React Native (monohilo) no hay concurrencia real, y el lock
    // basado en AsyncStorage puede causar que el token refresh se quede
    // colgado tras un background/foreground, generando SIGNED_OUT falsos.
    lock: <R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
})
