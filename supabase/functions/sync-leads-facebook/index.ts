import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const GRAPH = 'https://graph.facebook.com/v19.0'
// Solo interesan los leads de este mes en adelante.
const DESDE = Date.parse('2026-08-01T00:00:00Z')

// Sincroniza campañas + leads de Meta (Lead Ads) hacia la app. Para leads nuevos
// de una campaña YA ASIGNADA a un asesor: crea el cliente en su CRM + notifica
// (push en la app y WhatsApp por Twilio). Cron cada 15 min; también manual (admin).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(url, service)

    // ── Autorización: cron (secreto) o admin (JWT) ─────────────────
    const authz = req.headers.get('Authorization') ?? ''
    let ok = req.headers.get('x-sync-secret') === Deno.env.get('SYNC_SECRET')
    if (!ok) {
      const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authz } } })
      const { data: { user } } = await asUser.auth.getUser()
      if (user) { const { data } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle(); ok = data?.role === 'admin' }
    }
    if (!ok) return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 401, headers: CORS })

    const TOKEN = Deno.env.get('FB_LEADS_TOKEN')!
    const ACC = Deno.env.get('FB_AD_ACCOUNT_ID')!

    // ── 1) Campañas → upsert ──────────────────────────────────────
    const campaigns = await gAll(`${GRAPH}/${ACC}/campaigns?fields=id,name,effective_status&limit=100&access_token=${TOKEN}`)
    // Detectar campañas NUEVAS activas (para avisar a los admins una sola vez).
    const { data: existentes } = await db.from('campanias').select('meta_id')
    const yaExistian = new Set((existentes ?? []).map((c: any) => c.meta_id))
    if (campaigns.length) {
      await db.from('campanias').upsert(
        campaigns.map((c: any) => ({ meta_id: c.id, nombre: c.name, estado: c.effective_status, updated_at: new Date().toISOString() })),
        { onConflict: 'meta_id' },
      )
    }
    const nuevasActivas = campaigns.filter((c: any) => !yaExistian.has(c.id) && c.effective_status === 'ACTIVE')
    if (nuevasActivas.length) {
      const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin')
      const notifs: any[] = []
      for (const na of nuevasActivas) for (const a of (admins ?? [])) {
        notifs.push({ user_id: a.id, tipo: 'sistema', titulo: '📢 Nueva campaña detectada', mensaje: na.name, accion_url: '/(admin)/leads-campanias' })
      }
      if (notifs.length) await db.from('notificaciones').insert(notifs)
    }
    // Mapa meta_id → {id, asignado_a}
    const { data: camps } = await db.from('campanias').select('id, meta_id, nombre, asignado_a')
    const porMeta = new Map((camps ?? []).map((c: any) => [c.meta_id, c]))

    // ── 2) Leads: solo de campañas ACTIVE o ya asignadas ──────────
    let nuevosTotal = 0, clientesCreados = 0
    for (const c of campaigns) {
      const camp = porMeta.get(c.id)
      if (!camp) continue
      const activa = c.effective_status === 'ACTIVE'
      if (!activa && !camp.asignado_a) continue   // pausada y sin asignar → saltar

      const rows = await leadsDeCampania(c.id, TOKEN)
      if (!rows.length) continue

      // Insertar solo los nuevos (dedup por meta_lead_id).
      const { data: insertados } = await db.from('leads_campania')
        .upsert(rows.map((r: any) => ({ ...r, campania_id: camp.id })), { onConflict: 'meta_lead_id', ignoreDuplicates: true })
        .select('id, meta_lead_id, nombre, telefono, email')
      const nuevos = insertados ?? []
      nuevosTotal += nuevos.length

      // Si la campaña está asignada, cada lead nuevo → cliente + notificación push.
      // (WhatsApp al prospectador queda pendiente; su número ya vive en profiles.telefono.)
      if (camp.asignado_a && nuevos.length) {
        for (const n of nuevos) {
          const { data: cli } = await db.from('clientes').insert({
            nombre: (n.nombre || '').trim() || 'Lead Facebook',
            telefono: n.telefono || '', email: n.email || null,
            fuente_lead: 'campana_fb', estado: 'por_perfilar', responsable_id: camp.asignado_a,
          }).select('id').single()
          if (cli) {
            clientesCreados++
            await db.from('leads_campania').update({ cliente_id: cli.id }).eq('id', n.id)
            await db.from('notificaciones').insert({
              user_id: camp.asignado_a, tipo: 'nuevo_cliente', cliente_id: cli.id,
              titulo: '📢 Nuevo lead de campaña',
              mensaje: `${n.nombre || 'Lead'} · ${n.telefono || ''} — ${camp.nombre}`,
              accion_url: `/(prospectador)/detalle-cliente?id=${cli.id}`,
            })
          }
        }
      }
    }

    // ── 3) Relay de WhatsApp: leads ya convertidos a cliente y sin enviar ──
    // Cubre tanto los leads nuevos del sync como los del lote de asignación.
    let waEnviados = 0
    const { data: pend } = await db.from('leads_campania')
      .select('id, nombre, telefono, extra, campanias!inner(asignado_a)')
      .not('cliente_id', 'is', null).eq('whatsapp_enviado', false).limit(50)
    if (pend && pend.length) {
      const ids = [...new Set(pend.map((p: any) => p.campanias?.asignado_a).filter(Boolean))]
      const { data: profs } = ids.length ? await db.from('profiles').select('id, telefono').in('id', ids) : { data: [] }
      const telDe = new Map((profs ?? []).map((p: any) => [p.id, p.telefono]))
      for (const p of pend as any[]) {
        const asesor = p.campanias?.asignado_a
        const tel = asesor ? telDe.get(asesor) : null
        let marcar = true
        if (tel) marcar = await enviarWhatsApp(tel, p.nombre, p.telefono, respuestasStr(p.extra))
        if (marcar) { await db.from('leads_campania').update({ whatsapp_enviado: true }).eq('id', p.id); if (tel) waEnviados++ }
      }
    }

    return new Response(JSON.stringify({ ok: true, nuevos: nuevosTotal, clientes: clientesCreados, whatsapp: waEnviados }), { headers: CORS })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message ?? e) }), { status: 500, headers: CORS })
  }
})

// Trae los leads de una campaña (campaign → adsets → ads → leads), solo desde DESDE.
async function leadsDeCampania(campaignId: string, token: string): Promise<any[]> {
  const out: any[] = []
  const adsets = await gAll(`${GRAPH}/${campaignId}/adsets?fields=id,name&limit=100&access_token=${token}`)
  for (const as of adsets) {
    const ads = await gAll(`${GRAPH}/${as.id}/ads?fields=id,name&limit=100&access_token=${token}`)
    for (const ad of ads) {
      const leads = await gAll(`${GRAPH}/${ad.id}/leads?fields=id,created_time,field_data&limit=100&access_token=${token}`)
      for (const l of leads) {
        if (Date.parse(l.created_time) < DESDE) continue
        const p = parseLead(l.field_data)
        out.push({
          meta_lead_id: l.id, nombre: p.nombre, telefono: p.telefono, email: p.email,
          ad_set: as.name, ad: ad.name, extra: p.extra, lead_created_at: l.created_time,
        })
      }
    }
  }
  return out
}

function parseLead(fd: any[]): { nombre: string; telefono: string; email: string; extra: Record<string, string> } {
  const extra: Record<string, string> = {}
  let nombre = '', telefono = '', email = ''
  for (const f of fd || []) {
    const v = (f.values && f.values[0]) || ''
    const n = String(f.name || '')
    if (['full_name', 'nombre', 'name'].includes(n)) nombre = v
    else if (['phone', 'phone_number', 'telefono'].includes(n)) telefono = v
    else if (['email', 'correo'].includes(n)) email = v
    else extra[n] = v
  }
  return { nombre, telefono, email, extra }
}

async function gAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  while (next) {
    const r = await fetch(next)
    const j: any = await r.json()
    if (j.error) { console.error('[fb]', j.error.message); break }
    for (const it of (j.data || [])) out.push(it)
    next = j.paging?.next ?? null
  }
  return out
}

// Envía la notificación al asesor por WhatsApp usando la PLANTILLA aprobada
// (obligatoria para mensajes de negocio) desde el número de producción del bot.
async function enviarWhatsApp(to: string, nombre: string | null, numero: string | null, respuestas: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_SID'), tok = Deno.env.get('TWILIO_TOKEN'), from = Deno.env.get('TWILIO_FROM')
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID')
  if (!sid || !tok || !from || !to) return false
  try {
    const auth = btoa(`${sid}:${tok}`)
    const params: Record<string, string> = { From: `whatsapp:${from}`, To: `whatsapp:${normalizarTel(to)}` }
    if (contentSid) {
      params.ContentSid = contentSid
      params.ContentVariables = JSON.stringify({ '1': nombre || 'Sin nombre', '2': numero || 's/n', '3': respuestas || 'Sin datos' })
    } else {
      params.Body = `Tienes un nuevo cliente en tu CRM de campaña\nNombre: ${nombre || 'Sin nombre'}\nNúmero: ${numero || 's/n'}\nRespuestas: ${respuestas}`
    }
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
    })
    return r.ok
  } catch { return false }
}

// Normaliza un teléfono mexicano a formato internacional (+52…) para WhatsApp.
function normalizarTel(tel: string): string {
  let p = String(tel ?? '').replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  if (p.length === 10) p = '52' + p
  return '+' + p
}

// Limpia los nombres de campo del formulario de Facebook (¿que_zona? → que zona).
function limpiar(s: string): string { return String(s ?? '').replace(/[¿?]/g, '').replace(/_/g, ' ').trim() }

// Junta las preguntas/respuestas del formulario en una sola línea para la plantilla.
function respuestasStr(extra: Record<string, string> | null): string {
  const ps = Object.entries(extra || {})
  if (!ps.length) return 'Sin datos adicionales'
  return ps.map(([k, v]) => `${limpiar(k)}: ${limpiar(String(v))}`).join(' · ')
}
