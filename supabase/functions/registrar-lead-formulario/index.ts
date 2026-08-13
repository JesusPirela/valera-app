import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const err = (m: string, s = 400) => new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: CORS })

// Campos permitidos (whitelist = columnas del CRM). Evita inyectar columnas raras.
const PERMITIDOS = ['nombre', 'telefono', 'email', 'tipo_operacion', 'zona_busqueda', 'presupuesto', 'tipo_credito', 'notas']

function normalizarTel(tel: string): string {
  let p = String(tel ?? '').replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  if (p.length === 10) p = '52' + p
  return p
}

// Registro público de un lead desde un formulario compartido (sin sesión).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { token, respuestas, favoritos } = await req.json().catch(() => ({}))
    if (!token || !respuestas) return err('Faltan datos.')

    // Propiedades que el cliente marcó como favoritas (solo colecciones).
    const favLista: { codigo?: string; titulo?: string }[] = Array.isArray(favoritos) ? favoritos : []
    const favTexto = favLista.length
      ? `❤️ Le gustaron: ${favLista.map(f => f.codigo || f.titulo).filter(Boolean).join(', ')}`
      : ''

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Formulario ────────────────────────────────────────────────
    const { data: form } = await db.from('formularios_captura').select('*').eq('id', token).maybeSingle()
    if (!form || !form.activo) return err('Este formulario ya no está disponible.', 404)

    const nombre = String(respuestas.nombre ?? '').trim()
    const telefono = String(respuestas.telefono ?? '').trim()
    if (!nombre || !telefono) return err('Nombre y teléfono son obligatorios.')

    // ── Armar el cliente (solo campos permitidos + configurados) ──
    const cli: Record<string, any> = { nombre, telefono, responsable_id: form.owner_id, estado: 'por_perfilar' }
    cli.fuente_lead = form.tipo === 'coleccion' ? 'coleccion_compartida' : 'ficha_compartida'
    // Guardar de QUÉ colección vino el registro (para el historial de la colección).
    if (form.tipo === 'coleccion') cli.coleccion_token = form.ref
    for (const k of PERMITIDOS) {
      if (k === 'nombre' || k === 'telefono') continue
      const v = respuestas[k]
      if (v == null || String(v).trim() === '') continue
      if (k === 'tipo_operacion' && !['venta', 'renta'].includes(String(v))) continue
      cli[k] = String(v).trim()
    }
    // Anexar las propiedades favoritas a las notas para que el asesor las vea.
    if (favTexto) cli.notas = [cli.notas, favTexto].filter(Boolean).join('\n')

    // ── ¿Ya existe ese teléfono para ese asesor? ─────────────────
    // Si ya existía NO se duplica, PERO igual se avisa (antes se descartaba en
    // silencio y por eso a veces "no notificaba").
    const telNorm = normalizarTel(telefono)
    const { data: existentes } = await db.from('clientes').select('id, telefono, notas').eq('responsable_id', form.owner_id).is('eliminado_at', null)
    const existente = (existentes ?? []).find((c: any) => normalizarTel(c.telefono ?? '') === telNorm)

    let clienteId: string
    const esDuplicado = !!existente
    if (existente) {
      clienteId = existente.id
      if (favTexto) {
        await db.from('clientes').update({ notas: [existente.notas, favTexto].filter(Boolean).join('\n') }).eq('id', clienteId)
      }
    } else {
      const { data: nuevo, error: eIns } = await db.from('clientes').insert(cli).select('id').single()
      if (eIns || !nuevo) return err('No se pudo registrar. Intenta de nuevo.', 500)
      clienteId = nuevo.id
    }

    // ── Notificar al asesor: push in-app + WhatsApp ───────────────
    await db.from('notificaciones').insert({
      user_id: form.owner_id, tipo: 'nuevo_cliente', cliente_id: clienteId,
      titulo: esDuplicado ? '🔁 Un cliente volvió a registrarse' : '📝 Nuevo registro desde tu link',
      mensaje: `${nombre} · ${telefono}${form.titulo ? ` — ${form.titulo}` : ''}${favTexto ? `\n${favTexto}` : ''}`,
      accion_url: `/(prospectador)/detalle-cliente?id=${clienteId}`,
    })
    try {
      const { data: asesor } = await db.from('profiles').select('telefono').eq('id', form.owner_id).maybeSingle()
      if (asesor?.telefono) {
        const resumen = [
          PERMITIDOS.filter(k => k !== 'nombre' && k !== 'telefono' && cli[k] && !(k === 'notas' && favTexto))
            .map(k => `${k.replace(/_/g, ' ')}: ${cli[k]}`).join(' · '),
          favTexto,
        ].filter(Boolean).join(' · ') || 'Sin datos adicionales'
        await enviarWhatsApp(asesor.telefono, nombre, telefono, resumen)
      }
    } catch { /* best-effort */ }

    return new Response(JSON.stringify({ ok: true, duplicado: esDuplicado }), { headers: CORS })
  } catch (e) {
    return err(`Error: ${String((e as any)?.message ?? e)}`, 500)
  }
})

async function enviarWhatsApp(to: string, nombre: string, numero: string, respuestas: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_SID'), tok = Deno.env.get('TWILIO_TOKEN'), from = Deno.env.get('TWILIO_FROM')
  const contentSid = Deno.env.get('TWILIO_CONTENT_SID')
  if (!sid || !tok || !from) return
  const auth = btoa(`${sid}:${tok}`)
  const params: Record<string, string> = { From: `whatsapp:${from}`, To: `whatsapp:+${normalizarTel(to)}` }
  if (contentSid) { params.ContentSid = contentSid; params.ContentVariables = JSON.stringify({ '1': nombre, '2': numero, '3': respuestas }) }
  else params.Body = `Nuevo registro\nNombre: ${nombre}\nTeléfono: ${numero}\n${respuestas}`
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
  })
}
