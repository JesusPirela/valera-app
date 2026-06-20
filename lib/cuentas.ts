import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const KEY = '@valera_cuentas'

// Objeto mutable compartido entre módulos. Usar un objeto (no un `export let`)
// garantiza que el consumidor siempre lea el valor actual del campo, sin depender
// de cómo el bundler (Metro/Babel) maneje los live bindings de ES modules.
export const accountSwitch = { pending: false }

export type CuentaGuardada = {
  user_id: string
  email: string
  nombre: string | null
  role: string | null
  access_token: string
  refresh_token: string
}

export async function listarCuentas(): Promise<CuentaGuardada[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CuentaGuardada[]) : []
  } catch { return [] }
}

// Guarda tokens frescos directamente desde la sesión que ya tenemos (del evento
// SIGNED_IN / TOKEN_REFRESHED), sin llamar a getSession() que puede tener datos viejos.
export async function guardarTokensSesion(session: {
  user: { id: string; email?: string | null }
  access_token: string
  refresh_token: string
}): Promise<void> {
  const lista = await listarCuentas()
  const uid = session.user.id
  const previa = lista.find(c => c.user_id === uid)
  const cuenta: CuentaGuardada = {
    user_id: uid,
    email: session.user.email ?? previa?.email ?? '',
    nombre: previa?.nombre ?? null,
    role: previa?.role ?? null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }
  const otras = lista.filter(c => c.user_id !== uid)
  await AsyncStorage.setItem(KEY, JSON.stringify([...otras, cuenta]))
}

// Actualiza nombre y role de una cuenta ya guardada sin tocar sus tokens.
// Si no existe entrada previa (nunca se guardaron los tokens), no hace nada.
export async function actualizarNombreRole(
  userId: string,
  extra: { nombre?: string | null; role?: string | null },
): Promise<void> {
  const lista = await listarCuentas()
  const previa = lista.find(c => c.user_id === userId)
  if (!previa) return
  const cuenta: CuentaGuardada = {
    ...previa,
    nombre: extra.nombre ?? previa.nombre,
    role: extra.role ?? previa.role,
  }
  const otras = lista.filter(c => c.user_id !== userId)
  await AsyncStorage.setItem(KEY, JSON.stringify([...otras, cuenta]))
}

// Cambia a otra cuenta guardada usando sus tokens almacenados.
// Mínimo intencional: solo llama a setSession. Cualquier llamada adicional
// a getSession/getUser antes o después compite con el lock interno de Supabase
// y puede colgar indefinidamente.
export async function cambiarACuenta(
  target: CuentaGuardada,
): Promise<{ ok: boolean; error?: string; tokenVencido?: boolean; role?: string | null }> {
  accountSwitch.pending = true
  try {
    const timeoutMs = 12_000
    const result = await Promise.race([
      supabase.auth.setSession({
        access_token: target.access_token,
        refresh_token: target.refresh_token,
      }),
      new Promise<{ data: { session: null }; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: { session: null }, error: new Error('Tiempo de espera agotado') }),
          timeoutMs,
        ),
      ),
    ])
    const { data, error } = result
    if (error) {
      // Errores de red/timeout: la sesión puede ser válida, vale la pena reintentar.
      // AuthRetryableFetchError = fetch falló por red. Nuestro timeout usa Error plano.
      // Todo lo demás (AuthApiError, AuthInvalidJWTError, etc.) = tokens inválidos.
      const isNetworkError =
        (error as any).name === 'AuthRetryableFetchError' ||
        (error as any).name === 'FetchError' ||
        (error as any).name === 'TypeError' ||
        error.message === 'Tiempo de espera agotado'
      return { ok: false, error: error.message, tokenVencido: !isNetworkError }
    }
    // setSession completó sin error pero no devolvió sesión: tokens nulos o malformados.
    if (!data.session) return { ok: false, error: 'No se pudo establecer la sesión', tokenVencido: true }
    return { ok: true, role: target.role }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error desconocido', tokenVencido: false }
  } finally {
    // Limpiar el flag un tick después para que el handler de SIGNED_OUT
    // ya lo haya leído antes de que lo borremos.
    setTimeout(() => { accountSwitch.pending = false }, 500)
  }
}

// Quita una cuenta de la lista (solo cuando los tokens ya no sirven).
export async function olvidarCuenta(user_id: string): Promise<void> {
  const lista = await listarCuentas()
  await AsyncStorage.setItem(KEY, JSON.stringify(lista.filter(c => c.user_id !== user_id)))
}
