import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const err = (m: string, s = 400) => new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: CORS })
const ok = (data: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: true, ...data }), { headers: CORS })

type Origen = 'contacto_general' | 'interes_propiedad' | 'reclutamiento'
const ORIGENES: Origen[] = ['contacto_general', 'interes_propiedad', 'reclutamiento']

// ── Documentos de reclutamiento (identificación) ────────────────────────────
const BUCKET_DOCUMENTOS = 'candidatos-documentos'
const MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB, debe coincidir con file_size_limit del bucket
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
// <uuid>/<archivo> — el uuid es el que generamos nosotros al preparar la
// subida (buildRutaDocumento), nunca dato del cliente.
const RUTA_DOCUMENTO_RE = /^[0-9a-f-]{36}\/[\w.-]+$/
const MAX_DOCUMENTOS = 2

// Genera la URL firmada de subida para UN documento. No requiere nombre ni
// teléfono, y NO inserta nada en ninguna tabla — solo reserva el espacio en
// Storage para que la landing suba el archivo directo (sin pasar el binario
// por esta función). El candidato todavía no existe en este punto, por eso
// cada documento vive en su propia carpeta con un uuid nuevo.
async function prepararDocumento(db: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const tipo = String(body.tipo ?? '').trim()
  const nombreArchivo = String(body.nombre_archivo ?? '').trim()
  const mime = String(body.mime ?? '').trim()
  const size = Number(body.size)

  if (tipo !== 'identificacion') return err('Tipo de documento no soportado.')
  if (!nombreArchivo) return err('Falta el nombre del archivo.')
  if (!MIME_PERMITIDOS.includes(mime)) return err('Formato de archivo no permitido.')
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return err('El archivo supera el límite de 5 MB.')

  // Extensión derivada del MIME (no del nombre): el nombre lo pone el
  // usuario y no es de fiar para decidir cómo se sirve el archivo después.
  const ext = EXT_POR_MIME[mime]
  const carpeta = crypto.randomUUID()
  const n = Date.now()
  const ruta = `${carpeta}/${tipo}-${n}.${ext}`

  const { data, error } = await db.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(ruta)
  if (error || !data) return err('No se pudo preparar la subida. Intenta de nuevo.', 500)

  return ok({ ruta, token: data.token })
}

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

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Acción especial: preparar URL firmada de subida (solo reclutamiento) ──
    // Va ANTES de exigir nombre/teléfono: la landing sube el documento en
    // cuanto el usuario lo selecciona, antes de que termine de llenar el resto
    // del formulario.
    if (origen === 'reclutamiento' && body.accion === 'preparar_documento') {
      return await prepararDocumento(db, body)
    }

    const nombre = String(body.nombre ?? '').trim()
    const telefono = String(body.telefono ?? '').trim()
    if (!nombre || !telefono) return err('Nombre y teléfono son obligatorios.')

    const mensaje = body.mensaje != null ? String(body.mensaje).trim() || null : null

    let notifTitulo: string
    let notifMensaje: string

    if (origen === 'reclutamiento') {
      const email = body.email != null ? String(body.email).trim() || null : null

      const documentosIn = Array.isArray(body.documentos) ? body.documentos : []
      if (documentosIn.length > MAX_DOCUMENTOS) return err(`Máximo ${MAX_DOCUMENTOS} documentos.`)
      const documentos: { tipo: string; ruta: string; nombre: string }[] = []
      for (const d of documentosIn) {
        const ruta = String((d as Record<string, unknown>)?.ruta ?? '')
        if (!RUTA_DOCUMENTO_RE.test(ruta)) return err('Documento inválido.')
        documentos.push({
          tipo: String((d as Record<string, unknown>)?.tipo ?? 'identificacion'),
          ruta,
          nombre: String((d as Record<string, unknown>)?.nombre ?? '').trim() || 'Documento',
        })
      }

      const { error: eIns } = await db.from('candidatos_reclutamiento').insert({ nombre, telefono, email, mensaje, documentos })
      if (eIns) return err('No se pudo registrar. Intenta de nuevo.', 500)

      notifTitulo = '🧑‍💼 Nuevo candidato desde el sitio web'
      notifMensaje = `${nombre} · ${telefono}${email ? ` · ${email}` : ''}${documentos.length ? ` · 📎 ${documentos.length} doc.` : ''}`
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
