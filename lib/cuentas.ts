// Gestión de varias cuentas en el mismo dispositivo (cambio rápido sin contraseña).
// Guardamos la sesión (tokens) de cada cuenta con la que se inició sesión aquí;
// el botón "cambiar de cuenta" solo aparece si hay 2 o más guardadas.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const KEY = '@valera_cuentas'

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

// Guarda/actualiza la cuenta actualmente activa con su sesión fresca.
export async function guardarCuentaActual(extra?: { nombre?: string | null; role?: string | null }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return
  const cuenta: CuentaGuardada = {
    user_id: session.user.id,
    email: session.user.email ?? '',
    nombre: extra?.nombre ?? null,
    role: extra?.role ?? null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }
  const lista = await listarCuentas()
  const previa = lista.find(c => c.user_id === cuenta.user_id)
  // Conservar nombre/role previos si no se pasaron ahora
  if (previa) {
    cuenta.nombre = cuenta.nombre ?? previa.nombre
    cuenta.role = cuenta.role ?? previa.role
  }
  const otras = lista.filter(c => c.user_id !== cuenta.user_id)
  await AsyncStorage.setItem(KEY, JSON.stringify([...otras, cuenta]))
}

// Cambia a otra cuenta guardada. Antes refresca la sesión de la cuenta actual
// para no perder sus tokens al volver.
export async function cambiarACuenta(target: CuentaGuardada): Promise<{ ok: boolean; error?: string }> {
  try {
    // Capturar la sesión actual por si hay que restaurarla
    const { data: { session: actual } } = await supabase.auth.getSession()
    await guardarCuentaActual() // captura tokens frescos de la cuenta actual

    const { error } = await supabase.auth.setSession({
      access_token: target.access_token,
      refresh_token: target.refresh_token,
    })
    if (error) {
      // La sesión guardada caducó. Restaurar la sesión actual para no dejar al
      // usuario sin sesión en ninguna cuenta.
      if (actual) {
        try {
          await supabase.auth.setSession({
            access_token: actual.access_token,
            refresh_token: actual.refresh_token,
          })
        } catch {}
      }
      return { ok: false, error: error.message }
    }
    // Guardar la sesión (posiblemente rotada) de la cuenta a la que entramos
    await guardarCuentaActual({ nombre: target.nombre, role: target.role })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo cambiar de cuenta' }
  }
}

// Quita una cuenta de la lista (ej. al cerrar sesión en ella).
export async function olvidarCuenta(user_id: string) {
  const lista = await listarCuentas()
  await AsyncStorage.setItem(KEY, JSON.stringify(lista.filter(c => c.user_id !== user_id)))
}
