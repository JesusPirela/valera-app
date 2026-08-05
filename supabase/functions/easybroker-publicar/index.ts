import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const EB = 'https://api.easybroker.com/v1'
const CIUDAD: Record<string, string> = { queretaro: 'Querétaro', monterrey: 'Monterrey', puebla: 'Puebla' }
const TIPO_EB: Record<string, string> = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno', local: 'Local comercial', oficina: 'Oficina' }

const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const err = (msg: string, status = 400) => new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: CORS })

// Publica (o actualiza) una propiedad de la app en EasyBroker, que a su vez la
// replica a los portales conectados en la cuenta. Solo admins. La API key vive
// en el secreto EASYBROKER_API_KEY (nunca en el cliente).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const KEY = Deno.env.get('EASYBROKER_API_KEY')
    if (!KEY) return err('Falta EASYBROKER_API_KEY en el servidor.', 500)
    const H = { accept: 'application/json', 'content-type': 'application/json', 'X-Authorization': KEY }

    const { propiedad_id } = await req.json().catch(() => ({}))
    if (!propiedad_id) return err('Falta propiedad_id.')

    const url = Deno.env.get('SUPABASE_URL')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── Autorización: solo admin ──────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return err('No autenticado.', 401)
    const db = createClient(url, service)
    const { data: perfil } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin') return err('Solo un administrador puede publicar en EasyBroker.', 403)

    // ── Cargar la propiedad + imágenes ────────────────────────────
    const { data: p } = await db.from('propiedades')
      .select('id, titulo, descripcion, precio, direccion, operacion, tipo, zona, lat, lng, recamaras, banos, medios_banos, estacionamientos, m2, m2_terreno, codigo, exclusiva, easybroker_id, propiedad_imagenes(url, orden)')
      .eq('id', propiedad_id).maybeSingle()
    if (!p) return err('Propiedad no encontrada.', 404)

    // ── Validaciones (mensajes claros de qué falta) ───────────────
    const faltan: string[] = []
    if (!p.titulo) faltan.push('título')
    if (!p.descripcion) faltan.push('descripción')
    if (p.precio == null || p.precio <= 0) faltan.push('precio')
    if (p.lat == null || p.lng == null) faltan.push('ubicación en el mapa (lat/lng)')
    if (!p.tipo) faltan.push('tipo')
    if (faltan.length) return err(`Faltan datos para publicar: ${faltan.join(', ')}.`)

    // ── Resolver la ubicación contra el catálogo de EasyBroker ────
    const nombreUbicacion = await resolverUbicacion(H, p.direccion ?? '', p.zona ?? '')
    if (!nombreUbicacion) return err('No se encontró la colonia/ciudad en el catálogo de EasyBroker. Ajusta la dirección.')

    // ── Armar el payload ──────────────────────────────────────────
    const property_type = TIPO_EB[norm(p.tipo)] ?? (p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1))
    const opType = norm(p.operacion) === 'renta' || norm(p.operacion) === 'rental' ? 'rental' : 'sale'
    const imgs = (p.propiedad_imagenes ?? [])
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((i: any) => ({ url: i.url }))

    const payload: Record<string, any> = {
      title: p.titulo,
      description: p.descripcion,
      property_type,
      status: 'published',
      operations: [{ type: opType, active: true, amount: Number(p.precio), currency: 'MXN', unit: 'total' }],
      location: { name: nombreUbicacion, street: p.direccion ?? undefined, latitude: p.lat, longitude: p.lng },
      bedrooms: p.recamaras ?? undefined,
      bathrooms: p.banos ?? undefined,
      half_bathrooms: p.medios_banos ?? undefined,
      parking_spaces: p.estacionamientos ?? undefined,
      construction_size: p.m2 ?? undefined,
      lot_size: p.m2_terreno ?? undefined,
      internal_id: p.codigo ?? undefined,
      exclusive: p.exclusiva ?? undefined,
    }
    if (imgs.length) payload.images = imgs

    // ── Crear (POST) o actualizar (PATCH) ─────────────────────────
    const esActualizar = !!p.easybroker_id
    const endpoint = esActualizar ? `${EB}/properties/${p.easybroker_id}` : `${EB}/properties`
    const r = await fetch(endpoint, { method: esActualizar ? 'PATCH' : 'POST', headers: H, body: JSON.stringify(payload) })
    const bodyTxt = await r.text()
    if (!r.ok) {
      console.error('[easybroker] ', r.status, bodyTxt.slice(0, 500))
      return err(`EasyBroker rechazó la propiedad (${r.status}): ${bodyTxt.slice(0, 300)}`, 502)
    }
    const data = JSON.parse(bodyTxt)
    const publicId = data.public_id ?? p.easybroker_id
    if (publicId && !esActualizar) {
      await db.from('propiedades').update({ easybroker_id: publicId }).eq('id', p.id)
    }

    return new Response(JSON.stringify({
      ok: true, actualizado: esActualizar, public_id: publicId, public_url: data.public_url ?? null,
    }), { headers: CORS })
  } catch (e) {
    return err(`Error inesperado: ${String((e as any)?.message ?? e)}`, 500)
  }
})

// Municipios candidatos por estado. El endpoint /locations de EB NO acepta buscar
// por fraccionamiento (da 404): hay que consultar por MUNICIPIO y buscar el
// fraccionamiento entre sus `localities`.
const MUNICIPIOS: Record<string, string[]> = {
  queretaro: ['El Marqués, Querétaro', 'Querétaro, Querétaro', 'Corregidora, Querétaro', 'Huimilpan, Querétaro'],
  monterrey: ['Monterrey, Nuevo León', 'San Pedro Garza García, Nuevo León', 'Apodaca, Nuevo León', 'General Escobedo, Nuevo León', 'Guadalupe, Nuevo León', 'García, Nuevo León'],
  puebla: ['Puebla, Puebla', 'San Andrés Cholula, Puebla', 'San Pedro Cholula, Puebla'],
}

// Resuelve el location.name (full_name del catálogo de EB). Estrategia: tomar el
// fraccionamiento de la dirección, recorrer los municipios del estado y buscar
// una localidad que coincida. Si no hay match, usar la ciudad principal.
async function resolverUbicacion(H: Record<string, string>, direccion: string, zona: string): Promise<string | null> {
  const fracc = norm((direccion.split(',')[0] ?? '').trim())
  const fraccToks = new Set(fracc.split(/[^a-z0-9]+/).filter(w => w.length > 2))
  const munis = MUNICIPIOS[norm(zona)] ?? MUNICIPIOS.queretaro

  let mejor: { full: string; score: number } | null = null
  let ciudadRespaldo: string | null = null

  for (const muni of munis) {
    const r = await fetch(`${EB}/locations?query=${encodeURIComponent(muni)}`, { headers: H })
    if (!r.ok) continue
    const j = await r.json()
    const locs: any[] = Array.isArray(j) ? j : (j?.name ? [j] : (j?.locations ?? []))
    for (const loc of locs) {
      if (!ciudadRespaldo && loc.full_name) ciudadRespaldo = loc.full_name
      for (const l of loc.localities ?? []) {
        const nm = norm(l.name)
        let score = 0
        if (fracc && (nm.includes(fracc) || fracc.includes(nm))) score = 10
        else {
          const lt = nm.split(/[^a-z0-9]+/).filter(w => w.length > 2)
          score = lt.reduce((n, t) => n + (fraccToks.has(t) ? 1 : 0), 0)
        }
        if (score > 0 && (!mejor || score > mejor.score)) mejor = { full: l.full_name ?? l.name, score }
      }
    }
    if (mejor && mejor.score >= 10) break   // coincidencia exacta: no seguir buscando
  }
  return mejor ? mejor.full : ciudadRespaldo
}
