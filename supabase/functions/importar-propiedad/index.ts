import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMeta(html: string, prop: string): string {
  for (const attr of ['property', 'name', 'itemprop']) {
    const pats = [
      new RegExp(`<meta[^>]+${attr}=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${prop}["']`, 'i'),
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
  if (/departamento|apartment|condo|loft|penthouse|flat/.test(l)) return 'departamento'
  if (/\bcasa\b|house|home|residencia|singlefamily|townhouse|villa/.test(l)) return 'casa'
  if (/local|comercial|oficina|office|bodega|nave/.test(l)) return 'local'
  if (/terreno|lot\b|land\b|lote|predio/.test(l)) return 'terreno'
  return null
}

function mapOp(s: string): 'venta' | 'renta' | null {
  const l = s.toLowerCase()
  if (/sale|venta|preventa/.test(l)) return 'venta'
  if (/rent|renta|alquiler|lease/.test(l)) return 'renta'
  return null
}

function htmlText(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).trim()
}

// Decodifica las entidades HTML más comunes en portales en español.
// Necesario para que las expresiones de etiquetas (Recámaras, Construcción, m²…)
// hagan match aunque el portal las codifique (&aacute;, &ntilde;, &sup2;…).
function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&sup2;/gi, '²').replace(/&middot;/gi, '·')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 10)) } catch { return '' } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCharCode(parseInt(n, 16)) } catch { return '' } })
}

// ── JSON-LD (schema.org) ──────────────────────────────────────────────────
// Lamudi y muchos otros portales publican los datos en bloques
// <script type="application/ld+json">. Devuelve todos los nodos aplanados.
function extractJsonLdNodes(html: string): any[] {
  const out: any[] = []
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) { o.forEach(walk); return }
    out.push(o)
    if (o['@graph']) walk(o['@graph'])
  }
  for (const b of blocks) {
    try { walk(JSON.parse(b[1].trim())) } catch { /* ignore malformed */ }
  }
  return out
}

function ldType(node: any): string {
  const t = node?.['@type']
  return Array.isArray(t) ? t.join(' ') : String(t ?? '')
}

// Normaliza una etiqueta a minúsculas sin acentos ni signos: "Recámaras" → "recamaras".
function normLabel(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
}

function firstInt(v: unknown): number | null {
  if (v == null) return null
  const m = String(v).match(/\d{1,5}/)
  return m ? parseInt(m[0], 10) : null
}

// Extrae el "cuadro de características" como mapa etiqueta→valor.
// Cubre dos patrones muy comunes:
//  a) "Etiqueta: <valor numérico>" dentro de un nodo (Tokko/reval, Inmobay <li>)
//  b) wpsight (gminmobiliaria): <div class="listing-details-label">Etiqueta</div>
//     … <div class="listing-details-value">valor</div>
function extractSpecs(dhtml: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const m of dhtml.matchAll(/>\s*([A-Za-zÁÉÍÓÚáéíóúñÑ.\s]{3,28}?)\s*:\s*([0-9][^<]{0,28})</g)) {
    const k = normLabel(m[1])
    if (k && !(k in specs)) specs[k] = m[2].trim()
  }
  for (const m of dhtml.matchAll(/listing-details-label["'][^>]*>\s*([^<]+?)\s*<[\s\S]{0,160}?listing-details-value["'][^>]*>\s*([^<]+?)\s*</gi)) {
    const k = normLabel(m[1])
    if (k) specs[k] = m[2].trim()
  }
  return specs
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
    // Versión con entidades decodificadas: se usa para extraer etiquetas/valores.
    const dhtml = decodeEntities(html)
    // Cuadro de características etiqueta→valor (Tokko/reval, Inmobay, gminmobiliaria…).
    const specs = extractSpecs(dhtml)
    const getSpec = (...keys: string[]): string | null => {
      for (const k of keys) if (specs[k] != null) return specs[k]
      return null
    }
    const specInt = (...keys: string[]): number | null => firstInt(getSpec(...keys))

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
    let zona: 'queretaro' | 'monterrey' | 'puebla' | null = null
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

        const parts = [eb['Property Neighborhood'], eb['Property City'], eb['Property State']].filter(Boolean).map(String)
        if (parts.length) direccion = parts.join(', ')

        const locStr = [eb['Property City'], eb['Property State']].filter(Boolean).join(' ').toLowerCase()
        if (/quer[eé]taro/.test(locStr))                              zona = 'queretaro'
        else if (/monterrey|nuevo\s*le[oó]n/.test(locStr))           zona = 'monterrey'
        else if (/puebla/.test(locStr))                               zona = 'puebla'
      } catch { /* continue */ }
    }

    // ── 2. JSON-LD schema.org (Lamudi y portales estándar) ────────────────────
    let ldPrice = ''
    if (!ebMatch) {
      const nodes = extractJsonLdNodes(html)
      // Nodo de la propiedad: tipo inmobiliario o que traiga oferta/recámaras.
      const propNode = nodes.find(n =>
        /Residence|House|Apartment|RealEstate|Product|Offer|Place|Accommodation/i.test(ldType(n)) &&
        (n.offers || n.numberOfBedrooms != null || n.numberOfRooms != null || n.floorSize || n.name)
      )
      if (propNode) {
        if (propNode.name && !titulo) titulo = decodeEntities(String(propNode.name)).trim()
        if (propNode.description && !descripcion) descripcion = htmlText(String(propNode.description))

        const beds = parseNum(propNode.numberOfBedrooms ?? propNode.numberOfRooms)
        if (beds != null && recamaras === null) recamaras = cap(beds, 5)
        const baths = parseNum(propNode.numberOfBathroomsTotal ?? propNode.numberOfBathrooms)
        if (baths != null && banos === null) banos = cap(baths, 4)

        const floor = propNode.floorSize?.value ?? propNode.floorSize
        const floorN = parseNum(typeof floor === 'object' ? floor?.value : floor)
        if (floorN && !m2) m2 = String(Math.round(floorN))

        const offer = Array.isArray(propNode.offers) ? propNode.offers[0] : propNode.offers
        const p = parseNum(offer?.price ?? offer?.lowPrice ?? offer?.highPrice)
        if (p) { ldPrice = String(Math.round(p)); operacion = operacion || mapOp(ldType(offer) + ' ' + (offer?.businessFunction ?? '')) }

        if (!tipo) tipo = mapTipo(ldType(propNode) + ' ' + (titulo || ''))

        // Dirección desde address (objeto PostalAddress o string)
        const addr = propNode.address
        if (addr && !direccion) {
          if (typeof addr === 'string') direccion = decodeEntities(addr).trim()
          else {
            const ap = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean).map((x: any) => decodeEntities(String(x)))
            if (ap.length) direccion = ap.join(', ')
          }
        }
      }
      // Operación desde breadcrumb del JSON-LD (Lamudi: "Venta")
      if (!operacion) {
        const crumb = nodes.find(n => /BreadcrumbList/i.test(ldType(n)))
        const names = (crumb?.itemListElement ?? []).map((e: any) => e?.name).filter(Boolean).join(' ')
        operacion = mapOp(names)
      }
    }

    // ── 3. Descripción completa desde markup conocido ─────────────────────────
    // EasyBroker: <p class="text-description">; otros portales: contenedores comunes.
    if (!descripcion) {
      const descSelectors = [
        /<p[^>]+class="[^"]*text-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,                 // EasyBroker
        /<div[^>]+class="[^"]*listing-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,          // wpsight (gminmobiliaria)
        /<div[^>]+(?:id|class)="[^"]*(?:descripcion|description|property-description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      ]
      for (const sel of descSelectors) {
        const m = html.match(sel)
        if (m?.[1]) { descripcion = htmlText(m[1]); if (descripcion.length > 30) break }
      }
    }

    // ── 4. Título ─────────────────────────────────────────────────────────────
    if (!titulo) {
      titulo = getMeta(html, 'og:title')
            || getMeta(html, 'twitter:title')
            || (html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '')
    }
    titulo = decodeEntities(titulo)
      .replace(/\s*[-|–·]\s*(easy\s*broker|easybroker|gm\s*agencia|gm\s*inmobiliaria|lamudi|inmobay|reval).*/i, '')
      // Quita precios incrustados en el título (Inmobay: "Departamento en Venta MXN 4,200,000.00 ...")
      .replace(/\s*(?:MXN|MX\$|USD|\$)\s*[\d][\d,]*(?:\.\d+)?/i, '')
      .replace(/\s+ubicad[oa]\s+en\s+.*/i, '')
      .replace(/\s*\|\s*[^|]*$/, '')
      .trim()

    // ── 5. Dirección desde el título ("... ubicada en <Lugar>") ───────────────
    if (!direccion) {
      const ogt = decodeEntities(getMeta(html, 'og:title') || titulo)
      const mUbic = ogt.match(/ubicad[oa]\s+en\s+(.+?)(?:\s*$)/i)
      if (mUbic) direccion = mUbic[1].replace(/\s*[-|].*$/, '').trim()
    }

    // ── 6. Descripción fallback desde meta og ─────────────────────────────────
    if (!descripcion) {
      const cand = decodeEntities(getMeta(html, 'og:description') || getMeta(html, 'description'))
      // Evita basura tipo "valerareal.inmobay.com" o dominios/sitios muy cortos.
      if (cand.length > 40 && !/^[\w.-]+\.(com|mx|net|org)\b/i.test(cand)) descripcion = cand
    }

    // ── 7. Campos del cuadro de características (spec map) ─────────────────────
    // El spec map ya cubre reval (Tokko), Inmobay y gminmobiliaria (wpsight).
    // JSON-LD (Lamudi) tiene prioridad porque ya pobló estos campos arriba.
    if (recamaras === null) {
      recamaras = cap(specInt('recamaras', 'dormitorios', 'habitaciones', 'recamara') ??
        firstInt(dhtml.match(/(\d+)\s*rec[aá]maras?/i)?.[1]), 5)
    }
    if (banos === null) {
      const full = dhtml.match(/(\d+)\s*ba[ñn]os?\s*completos?/i)?.[1]
      banos = cap(firstInt(full) ?? specInt('banos', 'banos completos', 'bano') ??
        firstInt(dhtml.match(/(\d+)\s*ba[ñn]os?/i)?.[1]), 4)
    }
    if (mediosBanos === null) {
      mediosBanos = cap(specInt('medios banos', 'num medios banos', 'medio bano') ??
        firstInt(dhtml.match(/(\d+)\s*medios?\s*ba[ñn]os?/i)?.[1]), 2)
    }
    if (estacionamientos === null) {
      estacionamientos = cap(specInt('estacionamientos', 'estacionamiento', 'cocheras', 'cajones', 'parking', 'garage') ??
        firstInt(dhtml.match(/(\d+)\s*(?:estacionamientos?|cajones?|parking)/i)?.[1]), 3)
    }

    // ── 8. Superficies (construcción / terreno) ───────────────────────────────
    if (!m2) {
      const sp = specInt('construccion', 'construida', 'superficie construida', 'sup construida', 'total construido', 'construido', 'm construccion')
      // Lamudi: <div class="area-value">306 m²</div>
      const lam = dhtml.match(/area-value["'][^>]*>\s*([\d,.]+)/i)
      const mc = dhtml.match(/construcci[oó]n[\s\S]{0,80}?([\d,.]+)\s*m[²2]/i)
              || dhtml.match(/([\d,.]+)\s*m[²2][\s\S]{0,40}?construcci[oó]n/i)
      if (sp != null) m2 = String(sp)
      else if (lam) m2 = lam[1].replace(/,/g, '')
      else if (mc) m2 = mc[1].replace(/,/g, '')
    }
    if (!m2Terreno) {
      const sp = specInt('terreno', 'superficie terreno', 'superficie del terreno', 'sup terreno', 'm terreno')
      // Lamudi: <span class="lot-area-value">251 m²</span>
      const lot = dhtml.match(/lot-area-value["'][^>]*>\s*([\d,.]+)/i)
      const mt = dhtml.match(/terreno[\s\S]{0,80}?([\d,.]+)\s*m[²2]/i)
              || dhtml.match(/([\d,.]+)\s*m[²2][\s\S]{0,40}?terreno/i)
      if (sp != null) m2Terreno = String(sp)
      else if (lot) m2Terreno = lot[1].replace(/,/g, '')
      else if (mt) m2Terreno = mt[1].replace(/,/g, '')
    }

    // ── 9. Precio (orden de prioridad por fiabilidad) ─────────────────────────
    if (!precio) {
      // a) JSON-LD
      if (ldPrice) precio = ldPrice
      // a2) microdata / meta de precio (gminmobiliaria: itemprop="price" content="12300")
      if (!precio) {
        const mp = getMeta(html, 'product:price:amount') || getMeta(html, 'og:price:amount')
          || html.match(/itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i)?.[1]
          || html.match(/content=["']([\d.,]+)["'][^>]+itemprop=["']price["']/i)?.[1] || ''
        const n = parseNum(mp)
        if (n && n >= 1000) precio = String(Math.round(n))
      }
      // b) og:title con MXN/$ (Inmobay)
      if (!precio) {
        const ot = decodeEntities(getMeta(html, 'og:title')).match(/(?:MXN|MX\$|\$)\s*([\d][\d,]*(?:\.\d{1,2})?)/i)
        if (ot) precio = ot[1].replace(/,/g, '').split('.')[0]
      }
      // c) "MXN 17,899,000" en el cuerpo (Tokko/reval)
      if (!precio) {
        const mxn = dhtml.match(/MXN\s*\$?\s*([\d]{1,3}(?:,[\d]{3})+(?:\.\d+)?)/i)
        if (mxn) precio = mxn[1].replace(/,/g, '').split('.')[0]
      }
      // d) Genérico "$X,XXX..." ignorando mantenimiento/enganche/apartado
      if (!precio) {
        for (const m of dhtml.matchAll(/\$\s*([\d]{1,3}(?:,[\d]{3})+(?:\.\d+)?)/g)) {
          const ctx = dhtml.slice(Math.max(0, (m.index ?? 0) - 32), m.index).toLowerCase()
          if (/manten|engan|aparta|abono|m²|metro/.test(ctx)) continue
          precio = m[1].replace(/,/g, '').split('.')[0]
          break
        }
      }
    }

    // ── 10. Imágenes: CDNs conocidos + genéricos, deduplicadas ────────────────
    const imgPatterns = [
      /https?:\/\/assets\.easybroker\.com\/property_images\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/static\.tokkobroker\.com\/pictures\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,    // reval (Tokko)
      /https?:\/\/[^\s"'<>?]*inmobay\.com\/upload\/inmuebles\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi, // inmobay
      /https?:\/\/[^\s"'<>?]+\/wp-content\/uploads\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,        // WordPress (gminmobiliaria)
      /https?:\/\/[^\s"'<>?]+\.(?:cloudfront\.net|amazonaws\.com)\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
    ]
    const rawImgs: string[] = []
    for (const pat of imgPatterns) {
      for (const m of html.matchAll(pat)) rawImgs.push(m[0].split('?')[0])
    }
    // Descarta logos, íconos, avatares y recortes (no son fotos de la propiedad).
    const junk = /(logo|icon|favicon|avatar|sprite|placeholder|cropped-|whatsapp-image-2021|-32x32|-150x150|-180x180|-192x192|-270x270)/i
    const limpiados = rawImgs.filter(u => !junk.test(u))
    // Dedup de variantes de tamaño (-1024x668, -540x405…): conserva la más grande.
    const best = new Map<string, { url: string; w: number }>()
    for (const u of limpiados) {
      const m = u.match(/-(\d+)x(\d+)(\.(?:jpe?g|png|webp))$/i)
      const w = m ? parseInt(m[1], 10) : 999999
      const base = m ? u.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, '$1') : u
      const cur = best.get(base)
      if (!cur || w > cur.w) best.set(base, { url: u, w })
    }
    imagenes = [...best.values()].map(v => v.url)

    // ── 11. Fallbacks finales para tipo / operación / imágenes / zona ─────────
    if (!tipo) {
      tipo = mapTipo(titulo + ' ' + getMeta(html, 'og:title'))
    }
    if (!operacion) {
      const snippet = titulo + ' ' + getMeta(html, 'og:title') + ' ' + url + ' ' + html.slice(0, 3000)
      operacion = /\brenta\b|alquiler/i.test(snippet) ? 'renta' : 'venta'
    }
    if (!imagenes.length) {
      const og = getMeta(html, 'og:image') || getMeta(html, 'og:image:secure_url')
      if (og) imagenes = [og.split('?')[0]]
    }
    if (!zona) {
      const haystack = (direccion + ' ' + titulo + ' ' + url).toLowerCase()
      if (/quer[eé]taro|qro\b/.test(haystack))               zona = 'queretaro'
      else if (/monterrey|nuevo\s*le[oó]n|\bmty\b/.test(haystack)) zona = 'monterrey'
      else if (/puebla/.test(haystack))                  zona = 'puebla'
    }

    return new Response(JSON.stringify({
      titulo, descripcion, precio, direccion, zona,
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
