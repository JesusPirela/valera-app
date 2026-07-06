import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Edge Function llamada por pg_cron cada minuto.
// Consulta todas las notificaciones con push_enviado=FALSE (últimas 24h),
// envía los push a Expo en batches de 100 y marca las filas como enviadas.
// Incluye data con tipo e IDs para que la app pueda hacer deep linking al tocar.

interface Notificacion {
  id: string
  user_id: string
  titulo: string
  mensaje: string
  tipo: string
  propiedad_id: string | null
  cliente_id: string | null
  chatbot_lead_id: string | null
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

async function enviarBatch(
  supabase: ReturnType<typeof createClient>,
  mensajes: { to: string; title: string; body: string; sound: string; data?: Record<string, unknown> }[]
) {
  if (!mensajes.length) return
  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mensajes),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      console.error('[Push] Expo error HTTP', resp.status, json)
      return
    }
    const tickets = (json?.data ?? []) as { status: string; details?: { error?: string } }[]
    const tokensInvalidos: string[] = []
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        tokensInvalidos.push(mensajes[i].to)
      }
    })
    if (tokensInvalidos.length > 0) {
      await supabase.from('profiles').update({ push_token: null }).in('push_token', tokensInvalidos)
    }
  } catch (e) {
    console.error('[Push] Error enviando batch:', e)
  }
}

serve(async (req) => {
  // Sólo acepta llamadas internas desde pg_net (cron) autenticadas con la
  // service role key. No se expone al cliente.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // Notificaciones pendientes de las últimas 24 horas
  const { data: notificaciones, error } = await supabase
    .from('notificaciones')
    .select('id, user_id, titulo, mensaje, tipo, propiedad_id, cliente_id, chatbot_lead_id')
    .eq('push_enviado', false)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[Push] Error consultando notificaciones:', error)
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const pendientes = (notificaciones ?? []) as Notificacion[]

  if (!pendientes.length) {
    return new Response(JSON.stringify({ ok: true, enviadas: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Marcar como enviadas ANTES de despachar para evitar doble envío si
  // la función falla a mitad del lote.
  const ids = pendientes.map(n => n.id)
  await supabase.from('notificaciones').update({ push_enviado: true }).in('id', ids)

  // Obtener push_tokens de todos los usuarios involucrados
  const userIds = [...new Set(pendientes.map(n => n.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', userIds)
    .not('push_token', 'is', null)

  const tokenMap = new Map<string, string>()
  for (const p of profiles ?? []) {
    if (p.push_token) tokenMap.set(p.id, p.push_token)
  }

  // Construir mensajes incluyendo data para deep linking al tocar la notificación
  const mensajes = pendientes
    .map(n => {
      const token = tokenMap.get(n.user_id)
      if (!token) return null
      const data: Record<string, unknown> = { tipo: n.tipo, notificacion_id: n.id }
      if (n.propiedad_id) data.propiedad_id = n.propiedad_id
      if (n.cliente_id) data.cliente_id = n.cliente_id
      if (n.chatbot_lead_id) data.chatbot_lead_id = n.chatbot_lead_id
      return { to: token, title: n.titulo, body: n.mensaje, sound: 'default', data }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  for (let i = 0; i < mensajes.length; i += BATCH_SIZE) {
    await enviarBatch(supabase, mensajes.slice(i, i + BATCH_SIZE))
  }

  console.log(`[Push] Enviadas: ${mensajes.length} / ${pendientes.length} pendientes`)

  return new Response(
    JSON.stringify({ ok: true, pendientes: pendientes.length, enviadas: mensajes.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
