import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const err = (m: string, s = 400) => new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: CORS })
const ok = (data: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: true, ...data }), { headers: CORS })

type Origen = 'contacto_general' | 'interes_propiedad' | 'reclutamiento'
const ORIGENES: Origen[] = ['contacto_general', 'interes_propiedad', 'reclutamiento']

// Registro público de solicitudes que vienen de la landing page (proyecto
// aparte, sitio estático, sin sesión de Supabase). A propósito NO tocan la
// tabla `clientes` — son solicitudes crudas, sin perfilar, que no deben
// mezclarse con el pipeline de ventas del CRM.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const origen = body.origen as Origen
    if (!ORIGENES.includes(origen)) return err('Falta "origen" o no es válido.')

    const nombre = String(body.nombre ?? '').trim()
    const telefono = String(body.telefono ?? '').trim()
    if (!nombre || !telefono) return err('Nombre y teléfono son obligatorios.')

    const mensaje = body.mensaje != null ? String(body.mensaje).trim() || null : null

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let notifTitulo: string
    let notifMensaje: string

    if (origen === 'reclutamiento') {
      const email = body.email != null ? String(body.email).trim() || null : null

      const { error: eIns } = await db.from('candidatos_reclutamiento').insert({ nombre, telefono, email, mensaje })
      if (eIns) return err('No se pudo registrar. Intenta de nuevo.', 500)

      notifTitulo = '🧑‍💼 Nuevo candidato desde el sitio web'
      notifMensaje = `${nombre} · ${telefono}${email ? ` · ${email}` : ''}`
    } else {
      // contacto_general | interes_propiedad
      const esInteres = origen === 'interes_propiedad'

      const fila: Record<string, unknown> = { tipo: origen, nombre, telefono, mensaje }
      if (esInteres) {
        const propiedadCodigo = body.propiedad_codigo != null ? String(body.propiedad_codigo).trim() || null : null
        const propiedadTitulo = body.propiedad_titulo != null ? String(body.propiedad_titulo).trim() || null : null
        if (!propiedadCodigo && !propiedadTitulo) return err('Falta el código o título de la propiedad.')
        fila.propiedad_codigo = propiedadCodigo
        fila.propiedad_titulo = propiedadTitulo
      } else {
        fila.presupuesto = body.presupuesto != null ? String(body.presupuesto).trim() || null : null
        fila.zona = body.zona != null ? String(body.zona).trim() || null : null
      }

      const { error: eIns } = await db.from('solicitudes_sitio_web').insert(fila)
      if (eIns) return err('No se pudo registrar. Intenta de nuevo.', 500)

      notifTitulo = esInteres ? '🏠 Interés en propiedad desde el sitio web' : '📩 Nuevo contacto desde el sitio web'
      notifMensaje = esInteres
        ? `${nombre} · ${telefono} — ${fila.propiedad_titulo ?? fila.propiedad_codigo}`
        : `${nombre} · ${telefono}${fila.zona ? ` · Zona: ${fila.zona}` : ''}`
    }

    // Notificar a admins/supervisores dentro de la app.
    const { data: destinatarios } = await db.from('profiles').select('id').in('role', ['admin', 'supervisor'])
    if (destinatarios?.length) {
      await db.from('notificaciones').insert(
        destinatarios.map((p: { id: string }) => ({
          user_id: p.id,
          titulo: notifTitulo,
          mensaje: notifMensaje,
          tipo: 'solicitud_web',
          accion_url: '/(admin)/solicitudes-web',
        })),
      )
    }

    return ok()
  } catch (e) {
    return err(`Error: ${String((e as Error)?.message ?? e)}`, 500)
  }
})
