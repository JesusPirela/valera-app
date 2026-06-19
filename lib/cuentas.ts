// Gestión de varias cuentas en el mismo dispositivo (cambio rápido sin contraseña).
// Guardamos la sesión (tokens) de cada cuenta con la que se inició sesión aquí;
// el botón "cambiar de cuenta" solo aparece si hay 2 o más guardadas.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const KEY = '@valera_cuentas'

// Flag que bloquea el redirect a /login cuando Supabase emite SIGNED_OUT
// durante un cambio de cuenta (setSession dispara SIGNED_OUT+SIGNED_IN en secuencia).
export let cambiandoCuenta = false

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

// Guarda tokens frescos directamente desde un objeto de sesión ya obtenido.
// Usar cuando se tiene la sesión en mano (eventos SIGNED_IN / TOKEN_REFRESHED)
// para no depender de una llamada adicional a getSession().
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

// Guarda/actualiza nombre y role de la cuenta activa (sin tocar los tokens).
export async function guardarCuentaActual(extra?: { nombre?: string | null; role?: string | null }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return
  const lista = await listarCuentas()
  const uid = session.user.id
  const previa = lista.find(c => c.user_id === uid)
  if (!previa) return  // si aún no hay entrada, guardarTokensSesion la creará
  const cuenta: CuentaGuardada = {
    ...previa,
    nombre: extra?.nombre ?? previa.nombre,
    role: extra?.role ?? previa.role,
  }
  const otras = lista.filter(c => c.user_id !== uid)
  await AsyncStorage.setItem(KEY, JSON.stringify([...otras, cuenta]))
}

// Cambia a otra cuenta guardada usando sus tokens almacenados.
// Intencionalmente mínimo: solo llama a setSession y nada más. Cualquier
// llamada adicional a getSession/getUser antes o después compite con el lock
// interno de Supabase y puede colgar indefinidamente.
export async function cambiarACuenta(target: CuentaGuardada): Promise<{ ok: boolean; error?: string; role?: string | null }> {
  cambiandoCuenta = true
  try {
    const switchPromise = supabase.auth.setSession({
      access_token: target.access_token,
      refresh_token: target.refresh_token,
    })
    const timeoutPromise = new Promise<{ data: { session: null }, error: Error }>(resolve =>
      setTimeout(() => resolve({ data: { session: null }, error: new Error('timeout') }), 12000)
    )
    const { error } = await Promise.race([switchPromise, timeoutPromise])
    if (error) return { ok: false, error: error.message }
    return { ok: true, role: target.role }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo cambiar de cuenta' }
  } finally {
    setTimeout(() => { cambiandoCuenta = false }, 2000)
  }
}

// Quita una cuenta de la lista (ej. al cerrar sesión en ella).
export async function olvidarCuenta(user_id: string) {
  const lista = await listarCuentas()
  await AsyncStorage.setItem(KEY, JSON.stringify(lista.filter(c => c.user_id !== user_id)))
}
