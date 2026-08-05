import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const QUEUE_KEY = 'VALERA_OFFLINE_QUEUE_v1'

export type QueueOp = {
  id: string
  type: 'update_client' | 'create_client' | 'publish_property'
  ts: number
  userId?: string            // quien creó la operación; evita que otro usuario la ejecute
  clienteId?: string         // para update: id real; para create: UUID generado localmente
  propiedadId?: string       // para publish_property
  idemKey?: string           // para publish_property: MISMO key en cada reintento → nunca duplica
  payload: Record<string, any>
}

// UUID v4 generado en cliente (compatible con el formato de Supabase)
export function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export async function getQueue(): Promise<QueueOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueueOp[]) : []
  } catch { return [] }
}

async function saveQueue(ops: QueueOp[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(ops))
}

// Encola una actualización de cliente (un campo o un objeto completo).
// Si ya existe una operación pendiente para ese clienteId, fusiona el payload
// (los campos más nuevos sobreescriben los viejos del mismo tipo).
export async function enqueueClienteUpdate(
  clienteId: string,
  payload: Record<string, any>,
): Promise<void> {
  const queue = await getQueue()
  const idx = queue.findIndex(q => q.type === 'update_client' && q.clienteId === clienteId)
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], ts: Date.now(), payload: { ...queue[idx].payload, ...payload } }
    await saveQueue(queue)
  } else {
    const op: QueueOp = { id: genUUID(), type: 'update_client', ts: Date.now(), clienteId, payload }
    await saveQueue([...queue, op])
  }
}

// Encola la creación de un nuevo cliente con un UUID generado localmente.
// Supabase acepta UUIDs explícitos en INSERT, así que el ID se mantiene
// tanto en el cache local como en la BD al sincronizar.
export async function enqueueClienteCreate(
  clienteId: string,
  payload: Record<string, any>,
): Promise<void> {
  const op: QueueOp = {
    id: genUUID(), type: 'create_client', ts: Date.now(),
    clienteId, payload: { ...payload, id: clienteId },
  }
  const queue = await getQueue()
  await saveQueue([...queue, op])
}

// Encola una publicación de propiedad que no pudo llegar al servidor (offline o
// red inestable). Guarda el idem_key ORIGINAL de la pulsación: la RPC
// publicar_propiedad_atomico es idempotente por ese key, así que reintentar desde
// la cola nunca duplica el conteo aunque la primera llamada sí hubiera llegado.
// userId es obligatorio: evita que la operación se ejecute con la sesión de otro
// usuario si cambian de cuenta en el mismo dispositivo antes de reconectar.
export async function enqueuePublicacion(propiedadId: string, idemKey: string, userId: string): Promise<void> {
  const queue = await getQueue()
  // Deduplicar por propiedadId+usuario: solo UNA publicación pendiente por propiedad/usuario.
  // Sin esto, múltiples clicks offline generan N entradas con idem_keys distintos
  // y al reconectar se ejecutan todas → el contador salta a N/10 de un golpe.
  if (queue.some(q => q.type === 'publish_property' && q.propiedadId === propiedadId && q.userId === userId)) return
  if (queue.some(q => q.type === 'publish_property' && q.idemKey === idemKey)) return
  const op: QueueOp = { id: genUUID(), type: 'publish_property', ts: Date.now(), userId, propiedadId, idemKey, payload: {} }
  await saveQueue([...queue, op])
}

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length
}

// Envía todas las operaciones pendientes a Supabase en orden cronológico.
// Solo ejecuta operaciones que pertenecen al usuario actualmente autenticado;
// las de otros usuarios quedan en cola hasta que ese usuario vuelva a iniciar sesión.
// Devuelve cuántas tuvieron éxito y cuántas fallaron.
export async function flushQueue(): Promise<{ success: number; failed: number }> {
  const queue = await getQueue()
  if (queue.length === 0) return { success: 0, failed: 0 }

  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id

  let success = 0
  let failed = 0
  // Ops de otros usuarios se preservan intactas en la cola.
  const skippedOps: QueueOp[] = []
  const failedOps: QueueOp[] = []

  for (const op of queue) {
    // Si la op tiene userId y no coincide con el usuario actual, no ejecutar.
    if (op.userId && op.userId !== currentUserId) {
      skippedOps.push(op)
      continue
    }
    try {
      if (op.type === 'update_client') {
        const { error } = await supabase
          .from('clientes')
          .update(op.payload)
          .eq('id', op.clienteId!)
        if (error) throw error
      } else if (op.type === 'create_client') {
        const { error } = await supabase
          .from('clientes')
          .insert(op.payload)
        if (error) throw error
      } else if (op.type === 'publish_property') {
        const { data, error } = await supabase.rpc('publicar_propiedad_atomico', {
          p_propiedad_id: op.propiedadId,
          p_idem_key: op.idemKey,
        })
        if (error) throw error
        // "limite" también cuenta como resuelta: reintentar jamás va a funcionar.
        if (data && data.ok === false && data.error !== 'limite') throw new Error(String(data.error))
      }
      success++
    } catch {
      failed++
      failedOps.push(op)
    }
  }

  // Conservar: las que fallaron (para reintentar) + las de otros usuarios (para su sesión)
  await saveQueue([...skippedOps, ...failedOps])
  return { success, failed }
}
