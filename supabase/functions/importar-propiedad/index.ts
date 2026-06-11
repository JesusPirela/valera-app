import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMetaContent(html: string, prop: string): string {
  for (const attr of ['property', 'name']) {
    const patterns = [
      new RegExp(`<meta[^>]+${attr}="${prop}"[^>]+content="([^"]*)"`, 'i'),
      new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attr}="${prop}"`, 'i'),
    ]
    for (const p of patterns) {
      const m = html.match(p)
      if (m?.[1]) return m[1].trim()
    }
  }
  return ''
}

function parseNum(val: unknown): number | null {
  if (val == null) return null
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function capNum(n: number | null, max: number): number | null {
  return n !== null ? Math.min(Math.round(n), max) : null
}

function mapTipo(s: string): 'casa' | 'departamento' | 'local' | 'terreno' | null {
  const l = s.toLowerCase()
  if (/departamento|apartment|condo/.test(l)) return 'departamento'
  if (/\bcasa\b|house|home|residencia/.test(l))  return 'casa'
  if (/local|comercial|comercio|oficina|office/.test(l)) return 'local'
  if (/terreno|lot\b|land\b|lote/.test(l))       return 'terreno'
  return null
}

function mapOp(s: string): 'venta' | 'renta' | null {
  const l = s.toLowerCase()
  if (/sale|venta/.test(l))  return 'venta'
  if (/rent|renta|alquiler/.test(l)) return 'renta'
  return null
}

// Busca recursivamente un objeto que parezca ficha de propiedad
function findProp(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || !obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (
    'bedrooms' in o || 'bathrooms' in o || 'construction_size' in o ||
    'property_type' in o || 'lot_size' in o || 'parking_spaces' in o
  ) return o
  for (const v of Object.values(o)) {
    const found = findProp(v, depth + 1)
    if (found) return found
  }
  return null
}

function extractImages(val: unknown): string[] {
  if (!val) return []
  const arr = Array.isArray(val) ? val : [val]
  return arr
    .slice(0, 20)
    .map((i) => (typeof i === 'string' ? i : (i as any)?.url || (i as any)?.source_url || (i as any)?.src || ''))
    .filter(Boolean)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { url } = await req.json()
    if (!url || !/^https?:\/\//.test(url)) throw new Error('URL inválida')

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.5',
      },
    })
    if (!res.ok) throw new Error(`No se pudo cargar la página (${res.status})`)
    const html = await res.text()

    let titulo = ''
    let descripcion = ''
    let precio = ''
    let direccion = ''
    let recamaras: number | null = null
    let banos: number | null = null
    let mediosBanos: number | null = null
    let estacionamientos: number | null = null
    let m2 = ''
    let m2Terreno = ''
    let tipo: 'casa' | 'departamento' | 'local' | 'terreno' | null = null
    let operacion: 'venta' | 'renta' | null = null
    let imagenes: string[] = []

    // ── 1. __NEXT_DATA__ (Next.js — EasyBroker usa Next.js) ─────────────────
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextMatch) {
      try {
        const nd = JSON.parse(nextMatch[1])
        const prop = findProp(nd)
        if (prop) {
          titulo       = String(prop.title ?? prop.name ?? prop.public_title ?? '')
          descripcion  = String(prop.description ?? prop.public_note ?? prop.notes ?? '')

          const p = parseNum(prop.price ?? prop.list_price ?? prop.sale_price ?? prop.amount)
          if (p) precio = String(Math.round(p))

          recamaras     = capNum(parseNum(prop.bedrooms ?? prop.rooms), 5)
          banos         = capNum(parseNum(prop.bathrooms ?? prop.full_bathrooms), 4)
          mediosBanos   = capNum(parseNum(prop.half_bathrooms ?? prop.half_baths), 2)
          estacionamientos = capNum(parseNum(prop.parking_spaces ?? prop.parking ?? prop.garage), 3)

          const cs = parseNum(prop.construction_size ?? prop.construction ?? prop.built_area ?? prop.area)
          if (cs) m2 = String(cs)
          const ls = parseNum(prop.lot_size ?? prop.land_size ?? prop.terrain ?? prop.plot_size)
          if (ls) m2Terreno = String(ls)

          if (prop.property_type) tipo = mapTipo(String(prop.property_type))
          if (prop.operation_type ?? prop.listing_type ?? prop.type) {
            operacion = mapOp(String(prop.operation_type ?? prop.listing_type ?? prop.type ?? ''))
          }

          // Dirección
          const loc = (prop.location ?? prop.address ?? {}) as Record<string, unknown>
          const parts = [loc.street, loc.colony, loc.neighborhood, loc.city, loc.municipality, loc.state]
            .map(v => String(v ?? '').trim()).filter(Boolean)
          if (parts.length) direccion = parts.join(', ')

          // Imágenes — buscar en el objeto de propiedad y en el árbol completo
          const imgs = extractImages(
            prop.property_images ?? prop.images ?? prop.photos ?? prop.gallery
          )
          if (imgs.length) imagenes = imgs
        }
      } catch { /* JSON parse error, continue */ }
    }

    // ── 2. JSON-LD ───────────────────────────────────────────────────────────
    if (!titulo) {
      const ldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
      let m
      while ((m = ldRe.exec(html)) !== null) {
        try {
          const ld = JSON.parse(m[1])
          const items: unknown[] = Array.isArray(ld) ? ld : [ld]
          for (const item of items) {
            const it = item as Record<string, unknown>
            if (!it?.['@type']) continue
            titulo      = titulo      || String(it.name ?? '')
            descripcion = descripcion || String(it.description ?? '')
            const offer = (it.offers ?? {}) as Record<string, unknown>
            if (!precio && offer.price) precio = String(Math.round(parseNum(offer.price) ?? 0))
            const addr = (it.address ?? {}) as Record<string, unknown>
            if (!direccion) {
              const p = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean)
              if (p.length) direccion = p.join(', ')
            }
            if (!imagenes.length) imagenes = extractImages(it.image)
          }
        } catch { /* continue */ }
      }
    }

    // ── 3. Meta tags ─────────────────────────────────────────────────────────
    if (!titulo)      titulo      = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title')
    if (!descripcion) descripcion = getMetaContent(html, 'og:description') || getMetaContent(html, 'description')
    if (!imagenes.length) {
      const og = getMetaContent(html, 'og:image')
      if (og) imagenes = [og]
    }

    // ── 4. Fallback regex sobre el HTML ──────────────────────────────────────
    if (!precio) {
      const mp = html.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:MXN|USD|pesos)?/i)
      if (mp) precio = mp[1].replace(/,/g, '')
    }
    if (!recamaras) {
      const mr = html.match(/(\d+)\s*(?:rec[aá]maras?|bedrooms?)/i)
      if (mr) recamaras = capNum(parseInt(mr[1]), 5)
    }
    if (!banos) {
      const mb = html.match(/(\d+)\s*(?:ba[ñn]os?\s*(?:completos?)?|bathrooms?)/i)
      if (mb) banos = capNum(parseInt(mb[1]), 4)
    }
    if (!m2) {
      const mc = html.match(/construcci[oó]n[\s\S]{0,30}?([\d,.]+)\s*m[²2]/i)
        || html.match(/([\d,.]+)\s*m[²2][\s\S]{0,30}?construcci[oó]n/i)
      if (mc) m2 = mc[1].replace(/,/g, '')
    }
    if (!m2Terreno) {
      const mt = html.match(/terreno[\s\S]{0,30}?([\d,.]+)\s*m[²2]/i)
        || html.match(/([\d,.]+)\s*m[²2][\s\S]{0,30}?terreno/i)
      if (mt) m2Terreno = mt[1].replace(/,/g, '')
    }
    if (!tipo)      tipo      = mapTipo(titulo + ' ' + getMetaContent(html, 'og:title'))
    if (!operacion) {
      const snippet = titulo + ' ' + html.slice(0, 3000)
      operacion = /\brenta\b/i.test(snippet) ? 'renta' : 'venta'
    }

    // Limpiar título: quitar sufijos de sitio
    titulo = titulo
      .replace(/\s*[-|–|·]\s*easy\s*broker.*/i, '')
      .replace(/\s*[-|–|·]\s*easybroker.*/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .trim()

    return new Response(JSON.stringify({
      titulo, descripcion, precio, direccion,
      recamaras, banos, mediosBanos, estacionamientos,
      m2, m2Terreno, tipo, operacion, imagenes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
