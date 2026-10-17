import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const HORAS_SIN_RESPUESTA = 24

// Mismo algoritmo que agregar-cliente-chatbot (debe coincidir con lo que ya
// trae guardado chatbot_leads.telefono para que el dedupe por teléfono funcione).
function normalizarTelefono(tel: string): string | null {
  let phone = (tel ?? '').replace(/\D/g, '')
  if (phone.startsWith('00')) phone = phone.slice(2)
  if (phone.startsWith('5201') && phone.length === 14) phone = '52' + phone.slice(4)
  if (phone.length === 10) phone = '52' + phone
  if (phone.length === 12 && phone.startsWith('52')) return phone
  return null
}

// Este endpoint lo dispara el cron (con el service_role key) o, a mano, un
// admin desde la app — igual que el patrón ya usado en
// university-buscar-videos (botón "Buscar ahora" + cron).
async function autorizado(req: Request, db: ReturnType<typeof createClient>): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (token === serviceKey) return true
  if (!token) return false
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return false
  const { data: perfil } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return perfil?.role === 'admin'
}

// Revisa leads de campaña sin confirmación de respuesta 24h después del
// primer contacto y, si la campaña sigue activa, los manda al chatbot —
// mismo mecanismo que agregar-cliente-chatbot (webhook de Make +
// chatbot_leads + chatbot_reactivaciones), pero SIN sus restricciones
// (presupuesto, tipo de operación, tope mensual): aquí decide el sistema,
// no el prospectador.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (!(await autorizado(req, db))) return json({ error: 'No autorizado' }, 401)

    const webhookUrl = Deno.env.get('MAKE_CHATBOT_WEBHOOK_URL')
    if (!webhookUrl) return json({ error: 'Falta configurar MAKE_CHATBOT_WEBHOOK_URL.' }, 500)

    const corte = new Date(Date.now() - HORAS_SIN_RESPUESTA * 3600 * 1000).toISOString()

    // Candidatos: lead de campaña, contactado hace 24h+, sin "sí" confirmado
    // en ningún canal, no archivado ni ya movido al CRM normal.
    const { data: candidatos, error: eCand } = await db
      .from('clientes')
      .select('id, nombre, telefono, responsable_id, primer_contacto_at')
      .eq('es_lead_campania', true)
      .is('eliminado_at', null)
      .not('enviado_crm', 'is', true)
      .not('primer_contacto_at', 'is', null)
      .lte('primer_contacto_at', corte)
      .or('respuesta_cliente.is.null,respuesta_cliente.eq.false')

    if (eCand) return json({ error: eCand.message }, 500)
    if (!candidatos?.length) return json({ ok: true, revisados: 0, enviados: 0, omitidos: 0 })

    // Cruzar contra campañas ACTIVAS: leads_campania.cliente_id -> campania_id -> campanias.estado
    const { data: leadsCamp } = await db
      .from('leads_campania')
      .select('cliente_id, campania_id')
      .in('cliente_id', candidatos.map(c => c.id))

    const campaniaPorCliente = new Map<string, string>()
    for (const lc of leadsCamp ?? []) {
      if (lc.cliente_id && lc.campania_id) campaniaPorCliente.set(lc.cliente_id, lc.campania_id)
    }
    const campaniaIds = [...new Set(campaniaPorCliente.values())]
    const { data: campanias } = campaniaIds.length
      ? await db.from('campanias').select('id, estado').in('id', campaniaIds)
      : { data: [] as { id: string; estado: string | null }[] }
    const activasSet = new Set((campanias ?? []).filter(c => c.estado === 'ACTIVE').map(c => c.id))

    let enviados = 0
    let omitidos = 0
    const errores: string[] = []

    for (const cli of candidatos) {
      const campId = campaniaPorCliente.get(cli.id)
      if (!campId || !activasSet.has(campId)) { omitidos++; continue } // campaña pausada/sin campaña: no se toca

      const telefono = normalizarTelefono(cli.telefono)
      if (!telefono) { omitidos++; continue }

      // Dedupe: si ya está en chatbot_leads (por este u otro camino), no se reenvía.
      const { data: yaExiste } = await db.from('chatbot_leads').select('id').eq('telefono', telefono).maybeSingle()
      if (yaExiste) { omitidos++; continue }

      // Email del prospectador dueño, para la fila que espera Make (mismo
      // shape que agregar-cliente-chatbot).
      let emailProspectador = ''
      if (cli.responsable_id) {
        const { data: authUser } = await db.auth.admin.getUserById(cli.responsable_id)
        emailProspectador = authUser?.user?.email ?? ''
      }

      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: cli.nombre, telefono,
            estado: 'Pendiente', botActivo: 'SI', prospectador: emailProspectador,
          }),
        })
        if (!resp.ok) { errores.push(`${cli.nombre}: webhook de Make respondió ${resp.status}`); continue }

        await db.from('chatbot_leads').upsert(
          { telefono, nombre: cli.nombre, prospectador_id: cli.responsable_id, estado: 'contactado' },
          { onConflict: 'telefono' },
        )
        await db.from('chatbot_reactivaciones').insert({
          prospectador_id: cli.responsable_id, cliente_id: cli.id,
          nombre: cli.nombre, telefono, origen: 'auto_campania',
        })
        enviados++
      } catch (e) {
        errores.push(`${cli.nombre}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return json({ ok: true, revisados: candidatos.length, enviados, omitidos, errores })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[revisar-respuesta-campania]', msg)
    return json({ error: msg }, 500)
  }
})
