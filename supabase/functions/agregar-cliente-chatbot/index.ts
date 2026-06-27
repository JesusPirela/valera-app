import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOPE_MENSUAL = 10
const PRESUPUESTO_MINIMO = 1_800_000

// ── Normalización de teléfono (algoritmo específico de esta integración) ──
// Si queda mal, el mensaje del bot no se envía — más estricto que el
// normalizarTelefono() usado en twilio-mensajes/chatbot-eventos.
function normalizarTelefonoSheet(tel: string): string | null {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('00')) phone = phone.slice(2)
  if (phone.startsWith('5201') && phone.length === 14) phone = '52' + phone.slice(4)
  if (phone.length === 10) phone = '52' + phone
  if (phone.length === 12 && phone.startsWith('52')) return phone
  return null
}

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
    if (authError || !user || !user.email) return json({ error: 'No autorizado' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['prospectador_plus', 'asesor', 'supervisor'].includes(profile?.role ?? '')) {
      return json({ error: 'Acceso denegado' }, 403)
    }

    const body = await req.json()
    const nombre = String(body.nombre ?? '').trim()
    const tipoOperacion = String(body.tipoOperacion ?? '').trim().toLowerCase()
    const presupuesto = Number(body.presupuesto)
    const clienteId = body.clienteId ? String(body.clienteId) : null

    if (!nombre) return json({ error: 'El nombre es requerido.' }, 400)
    if (tipoOperacion !== 'venta') {
      return json({ error: 'Solo se pueden enviar clientes de venta al chatbot.' }, 400)
    }
    if (!Number.isFinite(presupuesto) || presupuesto <= PRESUPUESTO_MINIMO) {
      return json({ error: 'El presupuesto debe ser mayor a $1,800,000.' }, 400)
    }

    const telefono = normalizarTelefonoSheet(String(body.telefono ?? ''))
    if (!telefono) {
      return json({ error: 'El teléfono no es válido. Debe tener 10 dígitos (o ya incluir el 52).' }, 400)
    }

    // Tope de 10 clientes por mes por usuario.
    const inicioMes = new Date()
    inicioMes.setUTCDate(1)
    inicioMes.setUTCHours(0, 0, 0, 0)
    const { count } = await supabaseAdmin
      .from('chatbot_reactivaciones')
      .select('id', { count: 'exact', head: true })
      .eq('prospectador_id', user.id)
      .gte('created_at', inicioMes.toISOString())

    if ((count ?? 0) >= TOPE_MENSUAL) {
      return json({ error: `Ya alcanzaste el límite de ${TOPE_MENSUAL} clientes este mes.` }, 400)
    }

    const webhookUrl = Deno.env.get('MAKE_CHATBOT_WEBHOOK_URL')
    if (!webhookUrl) {
      return json({ error: 'El chatbot no está configurado todavía (falta el webhook de Make).' }, 500)
    }

    // Evitar doble envío: el teléfono ya es UNIQUE en chatbot_leads, que
    // acumula a todos los clientes que el bot ha contactado (orgánicos y
    // reactivaciones manuales).
    const { data: leadExistente } = await supabaseAdmin
      .from('chatbot_leads')
      .select('id')
      .eq('telefono', telefono)
      .maybeSingle()
    if (leadExistente) {
      return json({ error: 'Este cliente ya fue agregado al chatbot.' }, 400)
    }

    // Solo lo estrictamente necesario para que el bot funcione (A, B, M, T, U).
    // El resto de columnas del sheet (C–L, N–S, V) quedan vacías — son
    // opcionales y las gestiona el propio bot o no se capturan en el form.
    const fila = {
      nombre,                    // A Nombre
      telefono,                  // B Teléfono
      estado: 'Pendiente',       // M Estado
      botActivo: 'SI',           // T Bot_Activo
      prospectador: user.email,  // U Prospectador
    }

    const webhookResp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fila),
    })
    if (!webhookResp.ok) {
      return json({ error: 'No se pudo enviar al chatbot (falló el webhook de Make).' }, 500)
    }

    // Para que la conversación que arranque el bot se atribuya a este
    // prospectador en el chat del CRM (mismo mecanismo que twilio-mensajes).
    await supabaseAdmin
      .from('chatbot_leads')
      .upsert(
        { telefono, nombre, prospectador_id: user.id, estado: 'contactado' },
        { onConflict: 'telefono' }
      )

    await supabaseAdmin.from('chatbot_reactivaciones').insert({
      prospectador_id: user.id,
      cliente_id: clienteId,
      nombre,
      telefono,
    })

    return json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
