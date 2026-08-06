import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const ML = 'https://api.mercadolibre.com'
const err = (msg: string, status = 400) => new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: CORS })
const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Publica (o actualiza) una propiedad de la app directamente en Mercado Libre.
// Solo admin. Usa el refresh_token guardado (tabla ml_integracion) y lo renueva
// solo. Independiente de EasyBroker.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { propiedad_id } = await req.json().catch(() => ({}))
    if (!propiedad_id) return err('Falta propiedad_id.')

    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── Autorización: solo admin ──────────────────────────────────
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return err('No autenticado.', 401)
    const { data: perfil } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin') return err('Solo un administrador puede publicar en Mercado Libre.', 403)

    // ── Token de ML (refrescar si venció) ─────────────────────────
    const token = await obtenerToken(db)
    if (!token) return err('La cuenta de Mercado Libre no está conectada o expiró. Reconéctala.', 400)
    const H = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    // ── Propiedad ─────────────────────────────────────────────────
    const { data: p } = await db.from('propiedades')
      .select('id, titulo, descripcion, precio, direccion, operacion, tipo, zona, lat, lng, recamaras, banos, medios_banos, estacionamientos, m2, m2_terreno, es_constructora, mercadolibre_id, propiedad_imagenes(url, orden)')
      .eq('id', propiedad_id).maybeSingle()
    if (!p) return err('Propiedad no encontrada.', 404)

    const faltan: string[] = []
    if (!p.titulo) faltan.push('título')
    if (!p.descripcion) faltan.push('descripción')
    if (p.precio == null || p.precio <= 0) faltan.push('precio')
    if (p.lat == null || p.lng == null) faltan.push('ubicación en el mapa')
    if (p.m2 == null && p.m2_terreno == null) faltan.push('superficie (m²)')
    if ((p.propiedad_imagenes ?? []).length === 0) faltan.push('al menos una foto')
    if (faltan.length) return err(`Faltan datos para publicar: ${faltan.join(', ')}.`)

    // ── Categoría según tipo + operación (predictor de ML) ────────
    const opTxt = norm(p.operacion) === 'renta' ? 'renta' : 'venta'
    const tipoTxt = ({ casa: 'casa', departamento: 'departamento', terreno: 'terreno', local: 'local', oficina: 'oficina' } as any)[norm(p.tipo)] ?? 'casa'
    const catRes = await fetch(`${ML}/sites/MLM/domain_discovery/search?limit=1&q=${encodeURIComponent(`${tipoTxt} en ${opTxt}`)}`, { headers: H })
    const catJson = await catRes.json()
    const category_id = Array.isArray(catJson) && catJson[0]?.category_id
    if (!category_id) return err('No se pudo determinar la categoría de Mercado Libre para esta propiedad.')

    // Publicar GRATIS. ML tiene cupo limitado de anuncios de inmuebles gratis por
    // cuenta; si se agota, ML devuelve el error y el usuario decide (pagar o
    // liberar cupo). Los tipos de paga son gold/gold_premium/silver.
    const listing_type_id = 'free'

    // ── Atributos requeridos ──────────────────────────────────────
    const totalM2 = p.m2_terreno ?? p.m2
    const covM2 = p.m2 ?? p.m2_terreno
    const attributes = [
      totalM2 != null && { id: 'TOTAL_AREA', value_name: `${totalM2} m²` },
      covM2 != null && { id: 'COVERED_AREA', value_name: `${covM2} m²` },
      p.recamaras != null && { id: 'BEDROOMS', value_name: String(p.recamaras) },
      p.banos != null && { id: 'FULL_BATHROOMS', value_name: String(p.banos) },
      p.estacionamientos != null && { id: 'PARKING_LOTS', value_name: String(p.estacionamientos) },
      { id: 'IS_PROPERTY_IN_AUCTION', value_name: 'No' },
      { id: 'OPERATION', value_name: opTxt === 'renta' ? 'Renta' : 'Venta' },
    ].filter(Boolean)

    const pictures = (p.propiedad_imagenes ?? [])
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      .slice(0, 12).map((i: any) => ({ source: i.url }))

    // ML exige ubicación hasta nivel ciudad (país/estado/ciudad). Geocodificamos
    // las coordenadas para obtener estado+ciudad exactos; si falla, usamos el
    // estado según la zona.
    const ESTADO: Record<string, string> = { queretaro: 'Querétaro', monterrey: 'Nuevo León', puebla: 'Puebla' }
    const g = await geocodificar(p.lat, p.lng)
    const estado = g.state ?? ESTADO[norm(p.zona)] ?? 'Querétaro'
    const ciudad = g.city ?? estado

    const item: Record<string, any> = {
      title: p.titulo.slice(0, 60),
      category_id,
      price: Number(p.precio),
      currency_id: 'MXN',
      available_quantity: 1,
      buying_mode: 'classified',
      listing_type_id,
      condition: p.es_constructora ? 'new' : 'used',
      location: {
        latitude: p.lat, longitude: p.lng,
        address_line: p.direccion ?? undefined,
        country: { name: 'México' },
        state: { name: estado },
        city: { name: ciudad },
        ...(g.neighborhood ? { neighborhood: { name: g.neighborhood } } : {}),
      },
      attributes,
      pictures,
    }

    const esActualizar = !!p.mercadolibre_id
    let itemId = p.mercadolibre_id as string | null
    let permalink: string | null = null
    let estadoMl: string | null = null

    if (esActualizar) {
      const r = await fetch(`${ML}/items/${itemId}`, { method: 'PUT', headers: H, body: JSON.stringify({ price: item.price, pictures: item.pictures, attributes: item.attributes, title: item.title }) })
      const j = await r.json()
      // Si el cuerpo trae id, la operación se aplicó (ML puede devolver status no-2xx).
      if (!j.id) {
        const errs = JSON.stringify(j)
        if (errs.includes('not_modifiable') || errs.includes('payment_required') || errs.includes('field_not_updatable')) {
          return err('El anuncio ya existe en Mercado Libre pero aún NO está activo (requiere pagar/activar el plan de inmuebles en tu cuenta ML). Actívalo y luego podrás actualizarlo.', 409)
        }
        return err(`Mercado Libre rechazó la actualización: ${errs.slice(0, 400)}`, 502)
      }
      permalink = j.permalink ?? null
      estadoMl = j.status ?? null
    } else {
      const r = await fetch(`${ML}/items`, { method: 'POST', headers: H, body: JSON.stringify(item) })
      const j = await r.json()
      // ML crea el anuncio aunque devuelva 'payment_required' (plan de inmuebles):
      // si el cuerpo trae id, se creó. Solo es error real si NO hay id.
      if (!j.id) {
        const errs = JSON.stringify(j)
        if (errs.includes('listing_type_id.unavailable') || errs.includes('run out of this listing type')) {
          return err('Se agotó tu cupo de anuncios GRATIS de inmuebles en Mercado Libre (ML da un número limitado por cuenta). Para publicar otra gratis, cierra o pausa una publicación gratuita existente en tu cuenta de ML y vuelve a intentar.', 409)
        }
        return err(`Mercado Libre rechazó la propiedad: ${JSON.stringify(j.cause ?? j.message ?? j).slice(0, 400)}`, 502)
      }
      itemId = j.id
      permalink = j.permalink ?? null
      estadoMl = j.status ?? null
    }

    // Descripción (recurso aparte en ML).
    try {
      await fetch(`${ML}/items/${itemId}/description`, { method: 'POST', headers: H, body: JSON.stringify({ plain_text: p.descripcion }) })
    } catch { /* la publicación ya existe; la descripción es best-effort */ }

    await db.from('propiedades').update({ mercadolibre_id: itemId, mercadolibre_url: permalink }).eq('id', p.id)

    return new Response(JSON.stringify({ ok: true, actualizado: esActualizar, item_id: itemId, permalink, estado: estadoMl }), { headers: CORS })
  } catch (e) {
    return err(`Error inesperado: ${String((e as any)?.message ?? e)}`, 500)
  }
})

// Geocodificación inversa (OpenStreetMap) para obtener estado/ciudad de lat/lng.
async function geocodificar(lat: number, lng: number): Promise<{ state?: string; city?: string; neighborhood?: string }> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es&zoom=12`,
      { headers: { 'User-Agent': 'ValeraApp/1.0 (bienes raíces)' } })
    if (!r.ok) return {}
    const a = (await r.json())?.address ?? {}
    return {
      state: a.state,
      city: a.city ?? a.town ?? a.municipality ?? a.county,
      neighborhood: a.suburb ?? a.neighbourhood ?? a.quarter,
    }
  } catch { return {} }
}

// Devuelve un access_token válido, refrescándolo si está por vencer.
async function obtenerToken(db: any): Promise<string | null> {
  const { data } = await db.from('ml_integracion').select('*').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) return null
  const vigente = data.access_token && new Date(data.expires_at).getTime() - Date.now() > 120_000
  if (vigente) return data.access_token
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: Deno.env.get('ML_CLIENT_ID')!,
    client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
    refresh_token: data.refresh_token,
  })
  const r = await fetch(`${ML}/oauth/token`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
  const j = await r.json()
  if (!j.access_token) return null
  await db.from('ml_integracion').update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? data.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in ?? 21600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
  return j.access_token
}
