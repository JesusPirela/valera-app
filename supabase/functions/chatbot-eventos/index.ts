import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-make-secret',
}

// ── Normalización de teléfonos (duplicado de lib/telefono.ts para contexto Deno) ──

function normalizarTelefono(tel: string): string {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('5252')) phone = phone.slice(2)
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

// ── Push notifications (Expo) ────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function enviarPushExpo(supabase: any, mensajes: { to: string; title: string; body: string; sound: string }[]) {
  if (!mensajes.length) return
  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(mensajes),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      console.error('[Push] Expo respondió con error HTTP', resp.status, json)
      return
    }
    // Cada ticket en json.data corresponde al mensaje en la misma posición.
    // DeviceNotRegistered = el token ya no es válido (app desinstalada, etc.) -> limpiarlo.
    const tickets = json?.data ?? []
    const tokensInvalidos: string[] = []
    tickets.forEach((ticket: { status: string; message?: string; details?: { error?: string } }, i: number) => {
      if (ticket.status === 'error') {
        console.error('[Push] Error en ticket:', mensajes[i]?.to, ticket.message, ticket.details)
        if (ticket.details?.error === 'DeviceNotRegistered') tokensInvalidos.push(mensajes[i].to)
      }
    })
    if (tokensInvalidos.length > 0) {
      await supabase.from('profiles').update({ push_token: null }).in('push_token', tokensInvalidos)
    }
  } catch (e) {
    console.error('[Push] Error enviando:', e)
  }
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
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ error: 'No autorizado' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const evento = body.evento

    const telefono = normalizarTelefono(String(body.telefono ?? ''))
    if (telefono.length !== 12) return json({ error: 'telefono inválido' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Evento: el bot contactó al lead por primera vez ──────────────────────
    if (evento === 'lead_contactado') {
      const nombre = body.nombre ?? null
      const prospectadorEmail = body.prospectador_email ?? null
      const fecha = body.fecha ?? new Date().toISOString()
      const warnings: string[] = []

      let prospectadorId: string | null = null
      if (prospectadorEmail) {
        const { data: id, error } = await supabaseAdmin.rpc('get_profile_id_by_email', { p_email: prospectadorEmail })
        if (error) warnings.push(`Error resolviendo prospectador_email: ${error.message}`)
        else if (!id) warnings.push(`No se encontró un usuario con email ${prospectadorEmail}`)
        else prospectadorId = id
      } else {
        warnings.push('prospectador_email no fue enviado')
      }

      const { data: existente } = await supabaseAdmin
        .from('chatbot_leads')
        .select('id')
        .eq('telefono', telefono)
        .maybeSingle()

      if (existente) {
        const { error } = await supabaseAdmin
          .from('chatbot_leads')
          .update({ nombre, prospectador_id: prospectadorId, fecha_contactado: fecha })
          .eq('id', existente.id)
        if (error) return json({ error: error.message }, 500)
      } else {
        const { error } = await supabaseAdmin
          .from('chatbot_leads')
          .insert({ telefono, nombre, prospectador_id: prospectadorId, estado: 'contactado', fecha_contactado: fecha })
        if (error) return json({ error: error.message }, 500)
      }

      return json({ ok: true, telefono, prospectador_id: prospectadorId, warnings })
    }

    // ── Evento: el bot decide enviar el contacto del asesor (lead caliente) ─
    if (evento === 'lead_caliente') {
      const nombre = body.nombre ?? null
      const perfil = body.perfil ?? {}
      const fecha = body.fecha ?? new Date().toISOString()
      const prospectadorEmail = body.prospectador_email ?? null

      const { data: existente } = await supabaseAdmin
        .from('chatbot_leads')
        .select('id, prospectador_id')
        .eq('telefono', telefono)
        .maybeSingle()

      // El prospectador_email del payload tiene prioridad sobre el dueño ya guardado
      let prospectadorIdPorEmail: string | null = null
      if (prospectadorEmail) {
        const { data: id } = await supabaseAdmin.rpc('get_profile_id_by_email', { p_email: prospectadorEmail })
        if (id) prospectadorIdPorEmail = id
      }

      const prospectadorId: string | null = prospectadorIdPorEmail ?? existente?.prospectador_id ?? null

      const datosActualizacion: Record<string, unknown> = { nombre, perfil, estado: 'esperando_asesor', fecha_caliente: fecha }
      if (prospectadorIdPorEmail) datosActualizacion.prospectador_id = prospectadorIdPorEmail

      let leadId: string

      if (existente) {
        leadId = existente.id
        const { error } = await supabaseAdmin
          .from('chatbot_leads')
          .update(datosActualizacion)
          .eq('id', leadId)
        if (error) return json({ error: error.message }, 500)
      } else {
        const { data: inserted, error } = await supabaseAdmin
          .from('chatbot_leads')
          .insert({ telefono, nombre, perfil, estado: 'esperando_asesor', fecha_caliente: fecha, prospectador_id: prospectadorId })
          .select('id')
          .single()
        if (error) return json({ error: error.message }, 500)
        leadId = inserted.id
      }

      // ── Notificación para el dueño del lead (o fallback a admins) ──────────
      const nombreMostrado = nombre || 'Un lead'
      const titulo = `🔥 ${nombreMostrado} está listo — esperando ser atendido`
      const partes: string[] = []
      if (perfil.zona) partes.push(`Zona: ${perfil.zona}`)
      if (perfil.presupuesto) partes.push(`Presupuesto: ${perfil.presupuesto}`)
      if (perfil.tipo_operacion) partes.push(`Operación: ${perfil.tipo_operacion}`)
      partes.push(`Tel: ${telefono}`)
      const mensaje = partes.join(' · ')

      const destinatarios: string[] = prospectadorId
        ? [prospectadorId]
        : (await supabaseAdmin.from('profiles').select('id').eq('role', 'admin')).data?.map((a) => a.id) ?? []

      const pushMensajes: { to: string; title: string; body: string; sound: string }[] = []
      for (const userId of destinatarios) {
        // Idempotencia: si ya hay una notificación sin leer para este lead y usuario, no duplicar
        const { data: existenteNotif } = await supabaseAdmin
          .from('notificaciones')
          .select('id')
          .eq('chatbot_lead_id', leadId)
          .eq('user_id', userId)
          .eq('leida', false)
          .maybeSingle()

        if (existenteNotif) continue

        const { error: errNotif } = await supabaseAdmin.from('notificaciones').insert({
          user_id: userId,
          chatbot_lead_id: leadId,
          tipo: 'lead_caliente',
          titulo,
          mensaje,
          leida: false,
          push_enviado: true, // este evento envía el push directamente abajo
        })
        if (errNotif) continue

        const { data: perfilUsuario } = await supabaseAdmin
          .from('profiles')
          .select('push_token')
          .eq('id', userId)
          .maybeSingle()

        if (perfilUsuario?.push_token) {
          pushMensajes.push({ to: perfilUsuario.push_token, title: titulo, body: mensaje, sound: 'default' })
        }
      }

      await enviarPushExpo(supabaseAdmin, pushMensajes)

      return json({ ok: true, telefono, lead_id: leadId, notificados: destinatarios.length })
    }

    return json({ error: 'evento inválido. Usa "lead_contactado" o "lead_caliente"' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
