import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const QUEUE_KEY = 'VALERA_OFFLINE_QUEUE_v1'

export type QueueOp = {
  id: string
  type: 'update_client' | 'create_client'
  ts: number
  clienteId: string          // para update: id real; para create: UUID generado localmente
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

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length
}

// Envía todas las operaciones pendientes a Supabase en orden cronológico.
// Devuelve cuántas tuvieron éxito y cuántas fallaron.
export async function flushQueue(): Promise<{ success: number; failed: number }> {
  const queue = await getQueue()
  if (queue.length === 0) return { success: 0, failed: 0 }

  let success = 0
  let failed = 0
  const failedOps: QueueOp[] = []

  for (const op of queue) {
    try {
      if (op.type === 'update_client') {
        const { error } = await supabase
          .from('clientes')
          .update(op.payload)
          .eq('id', op.clienteId)
        if (error) throw error
      } else if (op.type === 'create_client') {
        const { error } = await supabase
          .from('clientes')
          .insert(op.payload)
        if (error) throw error
      }
      success++
    } catch {
      failed++
      failedOps.push(op)
    }
  }

  // Solo conservar las que fallaron para reintentarlas después
  await saveQueue(failedOps)
  return { success, failed }
}
