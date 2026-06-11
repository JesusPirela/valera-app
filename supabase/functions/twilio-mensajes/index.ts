import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NUMERO_BOT = 'whatsapp:+15559915197'
const DIAS_HISTORIAL = 30
const MAX_MENSAJES_POR_DIRECCION = 500
const PAGE_SIZE = 100

// ── Normalización de teléfonos (duplicado de lib/telefono.ts para contexto Deno) ──

function normalizarTelefono(tel: string): string {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('5252')) phone = phone.slice(2)
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

function variantesWhatsapp(telefono: string): string[] {
  const canonico = normalizarTelefono(telefono)
  if (canonico.length !== 12) return [`whatsapp:+${canonico}`]
  const sufijo = canonico.slice(2)
  return [`whatsapp:+52${sufijo}`, `whatsapp:+521${sufijo}`]
}

// ── Twilio ──────────────────────────────────────────────────────────────────

type TwilioMessage = {
  sid: string
  body: string | null
  from: string
  to: string
  direction: string
  status: string
  date_sent: string | null
}

async function fetchTwilioMessages(
  params: Record<string, string>,
  authHeader: string,
  accountSid: string,
  opts: { maxTotal?: number; cutoffMs?: number } = {}
): Promise<TwilioMessage[]> {
  const out: TwilioMessage[] = []
  let url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?` +
    new URLSearchParams({ PageSize: String(PAGE_SIZE), ...params }).toString()

  while (url) {
    const res = await fetch(url, { headers: { Authorization: authHeader } })
    if (!res.ok) throw new Error(`Twilio respondió ${res.status}`)
    const data = await res.json()
    const mensajes: TwilioMessage[] = data.messages ?? []

    for (const m of mensajes) {
      out.push(m)
      if (opts.cutoffMs && m.date_sent && new Date(m.date_sent).getTime() < opts.cutoffMs) {
        return out
      }
      if (opts.maxTotal && out.length >= opts.maxTotal) {
        return out
      }
    }

    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : ''
  }

  return out
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && profile?.role !== 'supervisor') {
      return json({ error: 'Acceso denegado' }, 403)
    }

    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = body.action ?? url.searchParams.get('action')

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const twilioAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`)

    if (action === 'hilos') {
      const cutoffMs = Date.now() - DIAS_HISTORIAL * 24 * 3600 * 1000

      const [salientes, entrantes] = await Promise.all([
        fetchTwilioMessages({ From: NUMERO_BOT }, twilioAuth, accountSid, { maxTotal: MAX_MENSAJES_POR_DIRECCION, cutoffMs }),
        fetchTwilioMessages({ To: NUMERO_BOT }, twilioAuth, accountSid, { maxTotal: MAX_MENSAJES_POR_DIRECCION, cutoffMs }),
      ])

      type Acumulado = {
        ultimo_mensaje: string
        fecha_ultimo: string
        direccion_ultimo: 'lead' | 'bot'
        total_mensajes: number
      }
      const hilos = new Map<string, Acumulado>()

      for (const m of [...salientes, ...entrantes]) {
        if (!m.date_sent) continue
        const contraparteRaw = m.direction === 'inbound' ? m.from : m.to
        const telefono = normalizarTelefono(String(contraparteRaw ?? ''))
        if (telefono.length !== 12) continue

        const fechaIso = new Date(m.date_sent).toISOString()
        const direccion: 'lead' | 'bot' = m.direction === 'inbound' ? 'lead' : 'bot'
        const existente = hilos.get(telefono)

        if (!existente) {
          hilos.set(telefono, { ultimo_mensaje: m.body ?? '', fecha_ultimo: fechaIso, direccion_ultimo: direccion, total_mensajes: 1 })
        } else {
          existente.total_mensajes++
          if (fechaIso > existente.fecha_ultimo) {
            existente.ultimo_mensaje = m.body ?? ''
            existente.fecha_ultimo = fechaIso
            existente.direccion_ultimo = direccion
          }
        }
      }

      // Cruzar contra clientes (service role: el rol ya fue validado arriba)
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      const { data: clientes } = await supabaseAdmin.from('clientes').select('id, nombre, telefono')

      const clientesPorTelefono = new Map<string, { id: string; nombre: string }>()
      for (const cl of clientes ?? []) {
        const tel = normalizarTelefono(cl.telefono ?? '')
        if (tel.length === 12 && !clientesPorTelefono.has(tel)) {
          clientesPorTelefono.set(tel, { id: cl.id, nombre: cl.nombre })
        }
      }

      const resultado = Array.from(hilos.entries()).map(([telefono, datos]) => {
        const cliente = clientesPorTelefono.get(telefono)
        return {
          telefono,
          nombre: cliente?.nombre ?? null,
          cliente_id: cliente?.id ?? null,
          ultimo_mensaje: datos.ultimo_mensaje,
          fecha_ultimo: datos.fecha_ultimo,
          direccion_ultimo: datos.direccion_ultimo,
          total_mensajes: datos.total_mensajes,
        }
      }).sort((a, b) => b.fecha_ultimo.localeCompare(a.fecha_ultimo))

      return json({ hilos: resultado })
    }

    if (action === 'mensajes') {
      const telefono = body.telefono ?? url.searchParams.get('telefono')
      if (!telefono) return json({ error: 'telefono es requerido' }, 400)

      const canonico = normalizarTelefono(String(telefono))
      if (canonico.length !== 12) return json({ error: 'Teléfono inválido' }, 400)

      const variantes = variantesWhatsapp(canonico)
      const lotes = await Promise.all(
        variantes.flatMap((v) => [
          fetchTwilioMessages({ From: v }, twilioAuth, accountSid, { maxTotal: MAX_MENSAJES_POR_DIRECCION }),
          fetchTwilioMessages({ To: v }, twilioAuth, accountSid, { maxTotal: MAX_MENSAJES_POR_DIRECCION }),
        ])
      )

      const vistos = new Map<string, TwilioMessage>()
      for (const lote of lotes) {
        for (const m of lote) {
          if (!vistos.has(m.sid)) vistos.set(m.sid, m)
        }
      }

      const mensajes = Array.from(vistos.values())
        .filter((m) => m.date_sent)
        .map((m) => ({
          sid: m.sid,
          body: m.body ?? '',
          direction: (m.direction === 'inbound' ? 'lead' : 'bot') as 'lead' | 'bot',
          fecha: new Date(m.date_sent as string).toISOString(),
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      return json({ mensajes })
    }

    return json({ error: 'action inválida. Usa "hilos" o "mensajes"' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
