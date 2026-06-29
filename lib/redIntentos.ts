// Con internet lento/inestable una sola petición puede tardar mucho o fallar
// de forma transitoria. Sin timeout ni reintentos, un toggle optimista en la
// UI (ej. "Publicar") se queda marcado visualmente pero la escritura real
// nunca llega al servidor, y el siguiente refetch lo revierte sin avisar —
// se ve como un bug aleatorio. Estos helpers acotan cada intento con un
// timeout y reintentan con backoff antes de darse por vencidos.

export function conTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// Reintenta una operación con forma { error } (patrón supabase-js). Pensado
// para escrituras idempotentes (ej. upsert con un valor final fijo, no un
// incremento en servidor), donde reintentar tras un timeout nunca duplica
// el efecto.
// UUID v4 sin dependencias nativas — solo necesita ser único para detectar
// reintentos del mismo intento (no requiere ser criptográficamente seguro).
export function generarIdemKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function conReintento(
  intentar: (signal: AbortSignal) => PromiseLike<{ error: unknown }>,
  opciones: { intentos?: number; timeoutMs?: number; backoffMs?: number } = {},
): Promise<boolean> {
  const { intentos = 3, timeoutMs = 9000, backoffMs = 700 } = opciones
  for (let i = 1; i <= intentos; i++) {
    const controller = new AbortController()
    try {
      const { error } = await conTimeout(intentar(controller.signal), timeoutMs)
      if (!error) return true
    } catch {
      // Timeout/caída: abortar el intento aún en vuelo para no acumular
      // peticiones concurrentes que saturan una conexión lenta.
      try { controller.abort() } catch {}
    }
    if (i < intentos) await new Promise((r) => setTimeout(r, backoffMs * i))
  }
  return false
}

// Igual que conReintento, pero conserva el "data" de la respuesta (para RPCs
// que devuelven un payload, ej. publicar_propiedad_atomico).
// Solo reintenta errores de red/timeout; errores de servidor (RLS, función, etc.)
// fallan de inmediato y devuelven el mensaje real en errorMsg.
export async function conReintentoData<T>(
  intentar: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>,
  opciones: { intentos?: number; timeoutMs?: number; backoffMs?: number } = {},
): Promise<{ ok: boolean; data: T | null; errorMsg?: string }> {
  const { intentos = 3, timeoutMs = 9000, backoffMs = 700 } = opciones
  for (let i = 1; i <= intentos; i++) {
    const controller = new AbortController()
    try {
      const { data, error } = await conTimeout(intentar(controller.signal), timeoutMs)
      if (!error) return { ok: true, data }
      // Error devuelto por el servidor (RLS, función inválida, etc.):
      // no tiene sentido reintentar, fallar de inmediato con el mensaje real.
      const errorMsg = (error as any)?.message ?? String(error)
      return { ok: false, data: null, errorMsg }
    } catch {
      // Timeout/caída: abortar el intento aún en vuelo. Sin esto, en una
      // conexión lenta se acumulan 2-3 peticiones concurrentes compitiendo
      // por el poco ancho de banda y ninguna llega a completarse.
      try { controller.abort() } catch {}
    }
    if (i < intentos) await new Promise((r) => setTimeout(r, backoffMs * i))
  }
  return { ok: false, data: null }
}
