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

// Busca en el catálogo de EasyBroker la mejor coincidencia de ubicación para la
// dirección/zona de la propiedad. Devuelve el full_name (lo que EB espera en
// location.name) o null si no hay match razonable.
async function resolverUbicacion(H: Record<string, string>, direccion: string, zona: string): Promise<string | null> {
  const ciudad = CIUDAD[norm(zona)] ?? 'Querétaro'
  const consulta = `${direccion} ${ciudad}`.trim()
  const r = await fetch(`${EB}/locations?query=${encodeURIComponent(consulta)}`, { headers: H })
  if (!r.ok) return null
  const j = await r.json()
  const raw: any[] = j.locations ?? j.content ?? []

  // Aplanar ciudades + colonias con su full_name.
  const cands: { full: string; tipo: string }[] = []
  for (const loc of raw) {
    if (loc.full_name || loc.name) cands.push({ full: loc.full_name ?? loc.name, tipo: loc.type ?? 'City' })
    for (const l of loc.localities ?? []) if (l.full_name || l.name) cands.push({ full: l.full_name ?? l.name, tipo: l.type ?? 'Neighborhood' })
  }
  if (!cands.length) return null

  // Elegir por solapamiento de palabras con la dirección + zona.
  const objetivo = new Set(norm(`${direccion} ${ciudad}`).split(/[^a-z0-9]+/).filter(w => w.length > 2))
  let mejor: { full: string; score: number } | null = null
  for (const c of cands) {
    const toks = norm(c.full).split(/[^a-z0-9]+/).filter(w => w.length > 2)
    let score = toks.reduce((n, t) => n + (objetivo.has(t) ? 1 : 0), 0)
    if (c.tipo === 'Neighborhood') score += 0.5   // preferir colonia sobre ciudad
    if (!mejor || score > mejor.score) mejor = { full: c.full, score }
  }
  // Si nada coincidió más allá de la ciudad, usar la primera ciudad como respaldo.
  return mejor && mejor.score > 0 ? mejor.full : (cands[0]?.full ?? null)
}
