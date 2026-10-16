import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-make-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function formatearPrecio(valor: string | null): string {
  if (!valor) return 'a consultar'
  const num = Number(String(valor).replace(/\D/g, ''))
  return isNaN(num) ? valor : `$${num.toLocaleString('es-MX')}`
}

// Normaliza a 12 dígitos (52XXXXXXXXXX) — mismo formato que guarda
// chatbot_leads.telefono (ver chatbot-eventos/buscar-propiedades).
function normalizarTelefono(tel: string): string {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

// deno-lint-ignore no-explicit-any
async function enviarPushExpo(supabase: any, mensajes: { to: string; title: string; body: string; sound: string; data?: Record<string, unknown> }[]) {
  if (!mensajes.length) return
  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mensajes),
    })
    const respJson = await resp.json().catch(() => null)
    if (!resp.ok) { console.error('[notificar-asesor] push HTTP error', resp.status, respJson); return }
    const tickets = respJson?.data ?? []
    const tokensInvalidos: string[] = []
    tickets.forEach((ticket: { status: string; details?: { error?: string } }, i: number) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        tokensInvalidos.push(mensajes[i].to)
      }
    })
    if (tokensInvalidos.length > 0) {
      await supabase.from('profiles').update({ push_token: null }).in('push_token', tokensInvalidos)
    }
  } catch (e) {
    console.error('[notificar-asesor] error enviando push:', e)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Validar secreto compartido con Make
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ ok: false, error: 'No autorizado' }, 401)
    }

    // 2. Parsear payload form-urlencoded (mismo formato que buscar-propiedades)
    const rawText = await req.text()
    const params = new URLSearchParams(rawText)

    const emailAsesor     = params.get('email_asesor')?.trim()     ?? ''
    const telefonoCliente = params.get('telefono_cliente')?.trim() ?? ''
    const nombreCliente   = params.get('nombre_cliente')?.trim()   ?? 'Cliente'
    const tipo            = params.get('tipo')?.trim()             ?? ''
    const operacion       = params.get('operacion')?.trim()        ?? ''
    const colonia         = params.get('colonia')?.trim()          ?? ''
    const precioMax       = params.get('precio_max')?.trim()       ?? ''

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 3. Resolver al DUEÑO del lead. Primero por telefono_cliente (misma cadena
    // que buscar-propiedades: chatbot_leads.telefono → prospectador_id), que es
    // la fuente más confiable porque es la que de verdad "es dueña" del cliente
    // en el CRM. email_asesor (el texto libre que arma Gemini) queda de respaldo.
    let userId: string | null = null
    let resueltoPor: 'telefono_cliente' | 'email_asesor' | null = null

    if (telefonoCliente) {
      const telNorm = normalizarTelefono(telefonoCliente)
      if (telNorm.length === 12) {
        const { data: lead } = await supabaseAdmin
          .from('chatbot_leads')
          .select('prospectador_id')
          .eq('telefono', telNorm)
          .maybeSingle()
        if (lead?.prospectador_id) { userId = lead.prospectador_id; resueltoPor = 'telefono_cliente' }
      }
    }

    if (!userId && emailAsesor) {
      const { data: idPorEmail, error: rpcError } = await supabaseAdmin.rpc('get_user_id_by_email', {
        p_email: emailAsesor.trim().toLowerCase(),
      })
      if (rpcError) console.error('[notificar-asesor] rpc get_user_id_by_email error:', rpcError)
      else if (idPorEmail) { userId = idPorEmail; resueltoPor = 'email_asesor' }
    }

    // 4. Armar contenido de la notificación (sirve tanto para el asesor dueño
    // como para el fallback a admins).
    const resumen = [
      tipo && `${tipo}`,
      colonia && `en ${colonia}`,
      operacion && `(${operacion})`,
      precioMax && `hasta ${formatearPrecio(precioMax)}`,
    ].filter(Boolean).join(' ')
    const cuerpo = `${nombreCliente}${telefonoCliente ? ` (+${telefonoCliente})` : ''} busca ${resumen}. Sin match en inventario — contáctalo.`
    const waLink = telefonoCliente ? `https://wa.me/${telefonoCliente}` : undefined

    // 5. Sin dueño resuelto (ni por teléfono ni por email) → antes esto
    // terminaba aquí sin avisarle a nadie ('sin_email_asesor'/'asesor_no_encontrado').
    // Ahora cae a TODOS los admins, igual que chatbot-eventos en lead_caliente
    // cuando el lead no tiene dueño — así el lead nunca se pierde en silencio.
    const titulo = userId
      ? '🔔 Lead para búsqueda personalizada'
      : '⚠️ Lead sin asesor asignado — búsqueda personalizada'

    const destinatarios: string[] = userId
      ? [userId]
      : (await supabaseAdmin.from('profiles').select('id').eq('role', 'admin')).data?.map((a: { id: string }) => a.id) ?? []

    if (destinatarios.length === 0) {
      console.warn('[notificar-asesor] sin dueño resuelto y sin admins a quién avisar')
      return json({ ok: true, resuelto_por: null, notificados: 0, motivo: 'sin_destinatarios' })
    }

    const pushMensajes: { to: string; title: string; body: string; sound: string; data?: Record<string, unknown> }[] = []

    for (const destId of destinatarios) {
      const { error: notifError } = await supabaseAdmin.from('notificaciones').insert({
        user_id: destId,
        titulo,
        mensaje: cuerpo,
        tipo: 'sistema',
        leida: false,
      })
      if (notifError) { console.error('[notificar-asesor] error insertando notificación:', notifError); continue }

      const { data: perfil } = await supabaseAdmin
        .from('profiles')
        .select('push_token')
        .eq('id', destId)
        .maybeSingle()

      if (perfil?.push_token) {
        pushMensajes.push({
          to: perfil.push_token, title: titulo, body: cuerpo, sound: 'default',
          data: { tipo: 'sistema', url: waLink },
        })
      }
    }

    await enviarPushExpo(supabaseAdmin, pushMensajes)

    return json({ ok: true, resuelto_por: userId ? resueltoPor : 'admins_fallback', notificados: destinatarios.length })
  } catch (err) {
    console.error('[notificar-asesor] error inesperado:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
