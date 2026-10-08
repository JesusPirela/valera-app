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
  accion_url: string | null
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

// Los avisos que no admiten espera. El resto puede llegar cuando el celular
// despierte; estos no, porque su razón de ser es insistir.
const TIPOS_ALARMA = new Set(['alarma_lead', 'alarma_retro'])

type MensajePush = {
  to: string
  title: string
  body: string
  sound: string
  data?: Record<string, unknown>
  priority: 'default' | 'high'
  channelId?: string
  categoryId?: string
}

// Tienen que coincidir EXACTO con lib/notificaciones-locales.ts. Si el nombre
// del canal no existe en el celular, Android manda el push al canal por defecto
// y se pierden el sonido largo y el cartel, sin dar ningún error.
const CANAL_ALARMAS = 'alarmas_v1'
const CATEGORIA_ALARMA = 'alarma'
const SONIDO_ALARMA = 'alarma_valera.wav'

// El wav y la categoría viven dentro del binario; la 1.0.7 es la primera que
// los trae. Pedírselos a una app vieja no es inofensivo: en iOS, un sonido que
// no está en el paquete deja la notificación MUDA, que es justo lo contrario de
// lo que busca una alarma. Así que a quien siga en una versión anterior se le
// manda el aviso normal.
const VERSION_CON_SONIDO = [1, 0, 7]

function traeElSonido(version: string | null): boolean {
  if (!version) return false
  const v = version.split('.').map(n => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    const a = v[i] ?? 0, b = VERSION_CON_SONIDO[i]
    if (a !== b) return a > b
  }
  return true
}

async function enviarBatch(
  supabase: ReturnType<typeof createClient>,
  mensajes: MensajePush[]
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

serve(async (_req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // Notificaciones pendientes de las últimas 24 horas
  const { data: notificaciones, error } = await supabase
    .from('notificaciones')
    .select('id, user_id, titulo, mensaje, tipo, propiedad_id, cliente_id, chatbot_lead_id, accion_url')
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
    .select('id, push_token, app_version')
    .in('id', userIds)
    .not('push_token', 'is', null)

  const tokenMap = new Map<string, string>()
  const sonidoOk = new Map<string, boolean>()
  for (const p of profiles ?? []) {
    if (p.push_token) {
      tokenMap.set(p.id, p.push_token as string)
      sonidoOk.set(p.id, traeElSonido(p.app_version as string | null))
    }
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
      if (n.accion_url) data.accion_url = n.accion_url
      // Alarma de verdad solo si la app de esa persona ya trae el sonido.
      const esAlarma = TIPOS_ALARMA.has(n.tipo) && sonidoOk.get(n.user_id) === true
      return {
        to: token,
        title: n.titulo,
        body: n.mensaje,
        // En Android el sonido lo pone el canal y este campo solo sirve para
        // encenderlo; en iOS, que no tiene canales, es el que elige el archivo.
        sound: esAlarma ? SONIDO_ALARMA : 'default',
        data,
        // Sin priority 'high', Android guarda el push mientras el celular está
        // en reposo y lo suelta cuando algo lo despierta —abrir la app, por
        // ejemplo—. Por eso el aviso "solo salía al entrar".
        priority: 'high' as const,
        // El canal manda sobre el cartel y el sonido: el de alarmas está en
        // importancia MAX con 20 s de pitidos. El resto de avisos siguen en el
        // canal por defecto para no volverlos igual de ruidosos.
        // La categoría es la que dibuja los botones Atender / Posponer 1 h.
        ...(esAlarma ? { channelId: CANAL_ALARMAS, categoryId: CATEGORIA_ALARMA } : {}),
      }
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
