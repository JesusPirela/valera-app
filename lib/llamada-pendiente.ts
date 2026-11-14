// La llamada que acabas de hacer, para preguntarte cómo te fue al volver.
//
// El problema que esto resuelve: tocas "Llamar", hablas diez minutos, y al
// volver a la app no pasa nada. Lo que sigue —si contestó, si hay que agendar,
// cuándo volver a marcar— depende de que el asesor se acuerde de entrar al
// cliente y ponerlo. Es por donde se cae el seguimiento.
//
// Se guarda en disco, no en memoria: durante una llamada larga el sistema
// operativo puede matar la app, y al volver a abrirla el aviso tiene que
// seguir ahí.

import AsyncStorage from '@react-native-async-storage/async-storage'

const CLAVE = '@valera_llamada_pendiente'

/** Antes de esto no se pregunta: colgar al instante es un número mal marcado. */
export const MINIMO_MS = 15_000
/** Después de esto ya no se pregunta: la llamada es de otro rato y el contexto se perdió. */
export const CADUCA_MS = 3 * 60 * 60 * 1000

export type LlamadaPendiente = {
  clienteId: string
  nombre: string
  telefono: string | null
  /** Cuándo se tocó "Llamar", en milisegundos. */
  en: number
}

/** Se llama justo al abrir el marcador. Nunca revienta: no vale perder la llamada por esto. */
export async function registrarLlamada(clienteId: string, nombre: string, telefono: string | null) {
  try {
    const dato: LlamadaPendiente = { clienteId, nombre, telefono, en: Date.now() }
    await AsyncStorage.setItem(CLAVE, JSON.stringify(dato))
  } catch { /* si no se pudo guardar, simplemente no se preguntará */ }
}

/**
 * La llamada sobre la que hay que preguntar, o null.
 *
 * Devuelve null si pasó muy poco (todavía está en la llamada o se colgó solo)
 * o si pasó demasiado. Una pendiente caducada se borra sola para que no
 * aparezca días después.
 */
export async function leerLlamadaPendiente(): Promise<LlamadaPendiente | null> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as LlamadaPendiente
    if (!dato?.clienteId || typeof dato.en !== 'number') { await limpiarLlamadaPendiente(); return null }
    const transcurrido = Date.now() - dato.en
    if (transcurrido > CADUCA_MS) { await limpiarLlamadaPendiente(); return null }
    if (transcurrido < MINIMO_MS) return null
    return dato
  } catch {
    return null
  }
}

export async function limpiarLlamadaPendiente() {
  try { await AsyncStorage.removeItem(CLAVE) } catch { /* da igual */ }
}
