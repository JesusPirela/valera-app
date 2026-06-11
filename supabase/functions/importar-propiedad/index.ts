import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMeta(html: string, prop: string): string {
  for (const attr of ['property', 'name', 'itemprop']) {
    const pats = [
      new RegExp(`<meta[^>]+${attr}="${prop}"[^>]+content="([^"]*)"`, 'i'),
      new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attr}="${prop}"`, 'i'),
    ]
    for (const p of pats) {
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

function cap(n: number | null, max: number): number | null {
  return n !== null ? Math.min(Math.round(n), max) : null
}

function mapTipo(s: string): 'casa' | 'departamento' | 'local' | 'terreno' | null {
  const l = s.toLowerCase()
  if (/departamento|apartment|condo/.test(l)) return 'departamento'
  if (/\bcasa\b|house|home|residencia/.test(l)) return 'casa'
  if (/local|comercial|oficina|office/.test(l)) return 'local'
  if (/terreno|lot\b|land\b|lote/.test(l)) return 'terreno'
  return null
}

function mapOp(s: string): 'venta' | 'renta' | null {
  const l = s.toLowerCase()
  if (/sale|venta/.test(l)) return 'venta'
  if (/rent|renta|alquiler/.test(l)) return 'renta'
  return null
}

function htmlText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
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

    // ── 1. EasyBroker: JSON embebido HTML-encoded ─────────────────────────────
    // Patrón: {"Property ID":"EB-XXXX","Bedrooms":N,...}
    const ebMatch = html.match(/\{[^{}]*&quot;Property ID&quot;[^{}]*\}/)
    if (ebMatch) {
      try {
        const decoded = ebMatch[0]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
        const eb = JSON.parse(decoded)

        recamaras       = cap(parseNum(eb['Bedrooms']), 5)
        banos           = cap(parseNum(eb['Bathrooms'] ?? eb['Full Bathrooms']), 4)
        mediosBanos     = cap(parseNum(eb['Half Bathrooms'] ?? eb['Half Baths']), 2)
        estacionamientos = cap(parseNum(eb['Parking Spaces'] ?? eb['Parking']), 3)

        const constArea = parseNum(eb['Area M2'] ?? eb['Construction M2'] ?? eb['Constructed Area'])
        if (constArea) m2 = String(constArea)
        const lotArea = parseNum(eb['Lot M2'] ?? eb['Lot Size M2'] ?? eb['Land M2'])
        if (lotArea) m2Terreno = String(lotArea)

        const saleP = parseNum(eb['Sale Price'])
        const rentP = parseNum(eb['Rent Price'])
        if (saleP)      { precio = String(Math.round(saleP)); operacion = operacion || 'venta' }
        else if (rentP) { precio = String(Math.round(rentP)); operacion = operacion || 'renta' }

        if (eb['Property Type']) tipo = mapTipo(String(eb['Property Type']))
        if (eb['Operation Type']) operacion = mapOp(String(eb['Operation Type'])) ?? operacion

        // Dirección desde campos de localización
        const parts = [
          eb['Property Neighborhood'],
          eb['Property City'],
          eb['Property State'],
        ].filter(Boolean).map(String)
        if (parts.length) direccion = parts.join(', ')
      } catch { /* continue */ }
    }

    // ── 2. Descripción completa desde <p class="text-description"> ───────────
    const descTagM = html.match(/<p[^>]+class="[^"]*text-description[^"]*"[^>]*>([\s\S]*?)<\/p>/)
    if (descTagM) {
      descripcion = htmlText(descTagM[1])
    }

    // ── 3. Título ─────────────────────────────────────────────────────────────
    titulo = getMeta(html, 'og:title')
          || getMeta(html, 'twitter:title')
          || (html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '')
    titulo = titulo
      .replace(/\s*[-|–·]\s*(easy\s*broker|easybroker).*/i, '')
      .replace(/\s*\|\s*[^|]*$/, '')
      .trim()

    // ── 4. Descripción fallback desde meta og ─────────────────────────────────
    if (!descripcion) {
      descripcion = getMeta(html, 'og:description') || getMeta(html, 'description')
    }

    // ── 5. Imágenes: todos los assets.easybroker.com únicos, sin query params ─
    // También busca otros CDN comunes (cloudfront, amazonaws, etc.)
    const imgPatterns = [
      /https?:\/\/assets\.easybroker\.com\/property_images\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/[^\s"'<>?]+\.(?:cloudfront\.net|amazonaws\.com)\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
    ]
    const rawImgs: string[] = []
    for (const pat of imgPatterns) {
      for (const m of html.matchAll(pat)) rawImgs.push(m[0].split('?')[0])
    }
    imagenes = [...new Set(rawImgs)]

    // ── 6. Fallbacks genéricos para otros portales ────────────────────────────
    if (!precio) {
      const mp = html.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:MXN|USD|pesos)?/i)
      if (mp) precio = mp[1].replace(/,/g, '')
    }
    if (recamaras === null) {
      const mr = html.match(/(\d+)\s*(?:rec[aá]maras?|bedrooms?)/i)
      if (mr) recamaras = cap(parseInt(mr[1]), 5)
    }
    if (banos === null) {
      const mb = html.match(/(\d+)\s*(?:ba[ñn]os?\s*(?:completos?)?|bathrooms?)/i)
      if (mb) banos = cap(parseInt(mb[1]), 4)
    }
    if (estacionamientos === null) {
      const me = html.match(/(\d+)\s*(?:estacionamientos?|cajones?|parking\s*spaces?)/i)
      if (me) estacionamientos = cap(parseInt(me[1]), 3)
    }
    if (!m2) {
      const mc = html.match(/construcci[oó]n[\s\S]{0,40}?([\d,.]+)\s*m[²2]/i)
              || html.match(/([\d,.]+)\s*m[²2][\s\S]{0,40}?construcci[oó]n/i)
      if (mc) m2 = mc[1].replace(/,/g, '')
    }
    if (!m2Terreno) {
      const mt = html.match(/terreno[\s\S]{0,40}?([\d,.]+)\s*m[²2]/i)
              || html.match(/([\d,.]+)\s*m[²2][\s\S]{0,40}?terreno/i)
      if (mt) m2Terreno = mt[1].replace(/,/g, '')
    }
    if (!tipo) {
      tipo = mapTipo(titulo + ' ' + getMeta(html, 'og:title'))
    }
    if (!operacion) {
      const snippet = titulo + ' ' + html.slice(0, 3000)
      operacion = /\brenta\b/i.test(snippet) ? 'renta' : 'venta'
    }
    if (!imagenes.length) {
      const og = getMeta(html, 'og:image')
      if (og) imagenes = [og.split('?')[0]]
    }

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
