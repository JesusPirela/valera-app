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
  const s = String(val).trim().replace(/\s/g, '')
  // Formato europeo/español: "4.080" o "1.234.567" (punto = miles, coma = decimal)
  if (/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(s)) {
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  // Formato US/MX: coma = miles, punto = decimal
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function cap(n: number | null, max: number): number | null {
  return n !== null ? Math.min(Math.round(n), max) : null
}

function mapTipo(s: string): 'casa' | 'departamento' | 'local' | 'terreno' | null {
  const l = s.toLowerCase()
  // "casa" primero: en México "casa en condominio" es una casa, no un depto.
  // "residencia(?!l)": evita que "Residencial" (común en nombres de zona) marque casa.
  if (/\bcasa\b|house|home|residencia(?!l)|singlefamily|townhouse|villa|chalet/.test(l)) return 'casa'
  if (/departamento|\bdepto\b|apartment|\bcondo\b|loft|penthouse|\bflat\b/.test(l)) return 'departamento'
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

// Detecta el NOMBRE DEL MODELO de un desarrollo (ej. "Lisboa VI") a partir del
// patrón "Modelo <X>" en título/og:title/h1, o del slug "...modelo-<x>/" del URL.
// Muchas constructoras (GP Vivienda, etc.) publican una página por modelo.
function tituloModelo(s: string): string {
  return s.replace(/\b\w/g, ch => ch.toUpperCase())
}
function detectarModelo(html: string, titulo: string, url: string): string {
  const ogt = getMeta(html, 'og:title')
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, ' ')
  // Se prueban en orden de mejor mayúsculas/limpieza. `titulo` y `<title>` suelen
  // traer "Lisboa VI" bien escrito; og:title a veces lo pasa a "Lisboa Vi".
  const fuentes = [titulo, titleTag, ogt, h1]
    .map(x => decodeEntities(String(x || '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  // "Modelo <nombre>" hasta " en/de/del", un separador (| : - –) o el final.
  const re = /modelo\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9.]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9.]+){0,3}?)(?=\s+(?:en|de|del)\b|\s*[|:\-–]|\s*$)/i
  for (const f of fuentes) {
    const m = f.match(re)
    const nombre = m?.[1]?.trim()
    if (nombre && nombre.length >= 2 && nombre.length <= 40) return nombre
  }
  // Respaldo: slug del URL "...-modelo-lisboa-vi/"
  const slug = url.match(/modelo-([a-z0-9-]+?)\/?(?:$|[?#])/i)?.[1]
  if (slug) {
    const nombre = slug.replace(/-/g, ' ').trim()
    if (nombre.length >= 2 && nombre.length <= 40) return tituloModelo(nombre)
  }
  return ''
}

// Parser dedicado: GP Vivienda (y otras constructoras con WordPress) publican un
// bloque <... ModeloActual_InfoJson>{...}</...> con la ubicación estructurada
// (proyecto/fraccionamiento, municipio y estado). Es mucho más confiable que
// adivinar la ubicación del texto libre.
function parseInfoJsonWp(html: string): { proyecto: string; zona: string; estado: string } | null {
  const m = html.match(/ModeloActual_InfoJson[^>]*>\s*(\{[\s\S]*?\})\s*</i)
  if (!m) return null
  try {
    const j = JSON.parse(m[1])
    const proyecto = String(j.proyecto ?? '').trim()
    const zona = String(j.zona ?? '').trim()
    const estado = String(j.estado ?? '').trim()
    if (!estado && !zona && !proyecto) return null
    return { proyecto, zona, estado }
  } catch { return null }
}

function htmlText(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).trim()
}

// Normaliza una URL de imagen. Por defecto quita el query (params de resize/caché)
// para deduplicar. PERO Firebase Storage y las URLs firmadas NECESITAN su query
// (alt=media&token=…, firmas de S3) o devuelven 403 — en esos casos se conserva
// completa. Decodifica &amp; primero (algunos portales codifican la URL en HTML).
function limpiarUrlImg(u: string): string {
  // decodeEntities: &amp; -> &  (HTML).  & -> &  y  \/ -> /  (escapes de JSON,
  // cuando la URL viene dentro de un <script> con datos, ej. Sadasi/Remix).
  const dec = decodeEntities(u).replace(/\\u0026/gi, '&').replace(/\\\//g, '/').trim()
  try {
    const p = new URL(dec)
    if (/(^|\.)firebasestorage\.googleapis\.com$/i.test(p.hostname) ||
        p.searchParams.has('token') || p.searchParams.get('alt') === 'media' ||
        p.searchParams.has('X-Amz-Signature') || p.searchParams.has('Signature') || p.searchParams.has('Expires')) {
      return dec
    }
    return dec.split('?')[0]
  } catch {
    return dec.split('?')[0]
  }
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

// ── Vinte (vinte.com.mx) ─────────────────────────────────────────────────────
// La URL tiene formato /{estado}/{desarrollo}. Algunos desarrollos embeben los
// modelos en un JSON-LD RealEstateListing > offers (ej. Catania); otros solo
// usan HTML con secciones id="property-market-{slug}" (ej. Punta Cuerna).
// Las imágenes están en S3: multimedia/{desarrollo}/models{slug}/galery/*.
// Devuelve un array de modelos o [] si no es una página Vinte reconocida.
interface VinteModelo {
  nombre: string
  precio: number
  recamaras: number | null
  banos: number | null
  mediosBanos?: number | null
  estacionamientos: number | null
  m2: string | null
  m2Terreno?: string | null
  imagenes: string[]
  direccion: string
  desarrollo: string
}

function _vinteImgBySlug(html: string): Map<string, string[]> {
  const imgBySlug = new Map<string, string[]>()
  for (const m of html.matchAll(/https?:\/\/[^"'\s<>]*vinte\.com\.mx\/[^"'\s<>]+\.(?:jpe?g|png|webp)/gi)) {
    const imgUrl = m[0]
    const sm = imgUrl.match(/models([a-z0-9_-]+)\/galery\//i)
    if (sm) {
      const slug = sm[1].toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!imgBySlug.has(slug)) imgBySlug.set(slug, [])
      const arr = imgBySlug.get(slug)!
      if (!arr.includes(imgUrl)) arr.push(imgUrl)
    }
  }
  return imgBySlug
}

function parseVinteModelos(html: string, url: string): VinteModelo[] {
  try {
    if (!/(^|\.)vinte\.com\.mx$/i.test(new URL(url).hostname)) return []
  } catch { return [] }

  const segs = new URL(url).pathname.split('/').filter(Boolean)
  const desarrollo = tituloModelo((segs[1] ?? '').replace(/-/g, ' '))
  const estadoRaw = tituloModelo((segs[0] ?? '').replace(/-/g, ' '))

  const imgBySlug = _vinteImgBySlug(html)

  // RUTA 1: JSON-LD RealEstateListing
  const nodes = extractJsonLdNodes(html)
  const listing = nodes.find(n => ldType(n).includes('RealEstateListing'))
  if (listing && Array.isArray(listing.offers) && listing.offers.length > 0) {
    const modelos: VinteModelo[] = []
    for (const offer of listing.offers) {
      const seller = offer.seller ?? offer
      const nombre = String(seller.name ?? '').trim()
      if (!nombre) continue

      const precio = parseNum(offer.price) ?? 0
      const recamaras = cap(parseNum(seller.numberOfRooms), 5)
      const banos = cap(parseNum(seller.numberOfBathroomsTotal), 4)

      const desc = String(seller.description ?? '')
      const m2Match = desc.match(/([\d.]+)\s*m[²2]/i)
      const m2 = m2Match ? String(parseFloat(m2Match[1])) : null

      const estMatch = desc.match(/[Ee]stacionamientos?\s+(\d+)/)
      const estacionamientos = estMatch ? parseInt(estMatch[1], 10) : 2

      const addr = seller.address ?? {}
      const localidad = String(addr.addressLocality ?? '').trim()
      const region = String(addr.addressRegion ?? '').trim()
      const direccion = [desarrollo, localidad, region].filter(Boolean).join(', ')

      const slug = nombre.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
      const imgs = imgBySlug.get(slug) ?? (seller.image ? [String(seller.image)] : [])

      modelos.push({ nombre, precio, recamaras, banos, estacionamientos, m2, imagenes: imgs, direccion, desarrollo })
    }
    if (modelos.length > 0) {
      // Cruzar con secciones HTML para: (1) corregir precios, (2) agregar modelos
      // que están en HTML pero no en JSON-LD (ej. Vizzini en Real Segovia)
      const htmlSections = [...html.matchAll(/id="property-market-([a-z0-9-]+)"\s+role="tabpanel"/gi)]
      if (htmlSections.length > 0) {
        const htmlSlugs = htmlSections.map(m => m[1].toLowerCase())

        // Nombres display del nav para modelos HTML
        const nombrePorSlugHtml = new Map<string, string>()
        for (const m of html.matchAll(/href="#property-market-([a-z0-9-]+)"[^>]*>[\s\S]{0,400}?<h3[^>]*>([\s\S]*?)<\/h3>/gi)) {
          const s = m[1].toLowerCase()
          const n = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
          if (n && !nombrePorSlugHtml.has(s)) nombrePorSlugHtml.set(s, n)
        }

        // Slugs de modelos ya obtenidos de JSON-LD
        const slugsJsonLd = new Set(modelos.map(m =>
          m.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
        ))

        for (let i = 0; i < htmlSlugs.length; i++) {
          const sSlug = htmlSlugs[i].replace(/[^a-z0-9]/g, '')
          const endIdx = i + 1 < htmlSlugs.length ? htmlSections[i + 1].index! : html.length
          const sec = html.slice(htmlSections[i].index!, endIdx)

          // Precio de la sección HTML (más fiable que JSON-LD)
          const pm = sec.match(/Desde\s*\$\s*([\d,]+(?:,\d{3})+)/i)
            ?? sec.match(/\$\s*([\d,]+(?:,\d{3})+)/)
          const precioHtml = pm ? parseInt(pm[1].replace(/,/g, ''), 10) : 0

          // Verificar si este slug HTML ya tiene correspondencia en JSON-LD
          const modeloExistente = modelos.find(m => {
            const ms = m.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
            return ms === sSlug || ms.startsWith(sSlug) || sSlug.startsWith(ms)
          })

          if (modeloExistente) {
            // Sobreescribir precio con el de la página
            if (precioHtml > 100_000) modeloExistente.precio = precioHtml
          } else {
            // Modelo nuevo que no estaba en JSON-LD — extraer specs del HTML
            if (/AGOTADO/i.test(sec.slice(0, 800))) continue
            const recM = sec.match(/Rec[aá]maras<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)
            const banM = sec.match(/Ba[ñn]os<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)
            const m2M = sec.match(/Metros de construcci[oó]n<\/dt>\s*<dd[^>]*>\s*([\d.]+)/i)
            const estM = sec.match(/Estacionamientos?<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)
            const slugKey = htmlSlugs[i].replace(/[^a-z0-9]/g, '')
            const nombre = nombrePorSlugHtml.get(htmlSlugs[i]) ?? tituloModelo(htmlSlugs[i].replace(/-/g, ' '))
            modelos.push({
              nombre,
              precio: precioHtml > 100_000 ? precioHtml : 0,
              recamaras: recM ? parseInt(recM[1], 10) : null,
              banos: banM ? parseInt(banM[1], 10) : null,
              estacionamientos: estM ? parseInt(estM[1], 10) : null,
              m2: m2M ? m2M[1] : null,
              imagenes: imgBySlug.get(slugKey) ?? [],
              direccion: modelos[0]?.direccion ?? desarrollo,
              desarrollo,
            })
          }
        }
      }
      return modelos
    }
  }

  // RUTA 2: Fallback HTML — secciones id="property-market-{slug}"
  // Extrae slugs en orden de aparición en el HTML
  const slugMatches = [...html.matchAll(/id="property-market-([a-z0-9-]+)"\s+role="tabpanel"/gi)]
  if (slugMatches.length === 0) return []

  // Extraer nombre display de cada modelo desde el nav de tabs
  const nombrePorSlug = new Map<string, string>()
  for (const m of html.matchAll(/href="#property-market-([a-z0-9-]+)"[^>]*>[\s\S]{0,400}?<h3[^>]*>([\s\S]*?)<\/h3>/gi)) {
    const slug = m[1].toLowerCase()
    const nombre = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (nombre && !nombrePorSlug.has(slug)) nombrePorSlug.set(slug, nombre)
  }

  // Precio a nivel de desarrollo (ej. "$1,759,000*") como precio por defecto
  const precioDevMatch = html.match(/\$\s*([\d,]+(?:,\d{3})+)/)
  const precioDesarrollo = precioDevMatch
    ? parseInt(precioDevMatch[1].replace(/,/g, ''), 10)
    : 0

  // Localidad y estado para dirección
  const localM = html.match(/fa-map-marker-alt[^<]{0,80}<\/i>\s*([^<]{3,60}?)\s*<\//)
  const localidad = localM ? localM[1].trim() : ''
  const direccionBase = [desarrollo, localidad, estadoRaw].filter(Boolean).join(', ')

  const slugsOrdenados = slugMatches.map(m => m[1].toLowerCase())
  const modelos: VinteModelo[] = []

  for (let i = 0; i < slugsOrdenados.length; i++) {
    const slug = slugsOrdenados[i]
    const marker = slugMatches[i].index!
    const endIdx = i + 1 < slugsOrdenados.length ? slugMatches[i + 1].index! : html.length
    const seccion = html.slice(marker, endIdx)

    // Saltar modelos agotados
    if (/AGOTADO/i.test(seccion.slice(0, 800))) continue

    // Extraer specs desde dt/dd
    const recM = seccion.match(/Rec[aá]maras<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)
    const banM = seccion.match(/Ba[ñn]os<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)
    const m2M = seccion.match(/Metros de construcci[oó]n<\/dt>\s*<dd[^>]*>\s*([\d.]+)/i)
    const estM = seccion.match(/Estacionamientos?<\/dt>\s*<dd[^>]*>\s*([\d]+)/i)

    const recamaras = recM ? parseInt(recM[1], 10) : null
    const banos = banM ? parseInt(banM[1], 10) : null
    const m2 = m2M ? m2M[1] : null
    const estacionamientos = estM ? parseInt(estM[1], 10) : null

    // Precio del modelo si viene en la sección, si no usar el del desarrollo
    const precioM = seccion.match(/\$\s*([\d,]+(?:,\d{3})+)/)
    const precio = precioM ? parseInt(precioM[1].replace(/,/g, ''), 10) : precioDesarrollo

    // Imágenes del modelo (solo las del bucket models{slug}/galery/)
    const slugKey = slug.replace(/[^a-z0-9]/g, '')
    const imgs = imgBySlug.get(slugKey) ?? []

    const nombre = nombrePorSlug.get(slug) ?? tituloModelo(slug.replace(/-/g, ' '))
    modelos.push({ nombre, precio, recamaras, banos, estacionamientos, m2, imagenes: imgs, direccion: direccionBase, desarrollo })
  }

  return modelos
}

// ── BPC Casa (bpccasa.com.mx) — fraccionamientos con varios modelos ──────────
// La página /fraccionamientos/{slug}/ es un SPA de Vite pre-renderizado: cada
// modelo aparece como una tarjeta con el patrón de texto
//   "<Nombre> Desde $X MXN  Y m²  Z recámaras  W baños"
// (W.5 = W baños + 1 medio). La ubicación y el nombre del fraccionamiento vienen
// en el JSON-LD (ApartmentComplex), y "Cochera para N autos" es la cochera común
// a todos los modelos. Devuelve un modelo por tarjeta para que la app deje
// elegir e importar uno por uno.
async function parseBpcCasaModelos(html: string, url: string): Promise<VinteModelo[]> {
  let fracc = ''
  try {
    if (!/(^|\.)bpccasa\.com\.mx$/i.test(new URL(url).hostname)) return []
    fracc = (new URL(url).pathname.match(/\/fraccionamientos\/([^/]+)/i)?.[1] ?? '').toLowerCase()
  } catch { return [] }
  const modelos: VinteModelo[] = []

  // Nombre del fraccionamiento + dirección desde el JSON-LD.
  let desarrollo = ''
  let direccion = ''
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)
  if (ld) {
    try {
      const j = JSON.parse(ld[1])
      desarrollo = String(j.name ?? '')
      const a = j.address ?? {}
      direccion = [a.streetAddress, a.addressLocality].filter(Boolean).join(', ')
    } catch { /* JSON-LD no parseable */ }
  }

  // Cochera común: "Cochera para N autos".
  const coch = html.replace(/<[^>]+>/g, ' ').match(/Cochera\s+para\s+(\d+)\s+autos?/i)
  const estac = coch ? parseInt(coch[1], 10) : null

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Galería completa por modelo: el HTML del listado solo trae la fachada; las
  // demás fotos (sala, cocina, recámaras…) están en el bundle JS de Vite, en
  // objetos con src:`/images/fraccionamientos/<fracc>/modelos/<slug>/…webp`. Se
  // descarga el bundle y se extraen SOLO las de ESTE fraccionamiento (así no se
  // mezcla con otro que reuse el mismo nombre de modelo).
  const imgsPorSlug = new Map<string, string[]>()
  const addImg = (slug: string, path: string) => {
    const full = 'https://bpccasa.com.mx' + path
    const arr = imgsPorSlug.get(slug) ?? []
    if (!arr.includes(full)) arr.push(full)
    imgsPorSlug.set(slug, arr)
  }
  // Fallback: la fachada que ya viene en el HTML del listado.
  for (const m of html.matchAll(/\/images\/fraccionamientos\/[^"'\s]+\/modelos\/([a-z0-9-]+)\/[^"'\s?]+\.(?:webp|jpe?g|png)/gi)) {
    addImg(m[1].toLowerCase(), m[0])
  }
  let jsText = ''
  try {
    const jsRef = html.match(/<script[^>]*src="(\/assets\/[^"]+\.js)"/i)?.[1]
    if (jsRef && fracc) {
      const jsRes = await fetch('https://bpccasa.com.mx' + jsRef, { headers: BROWSER_HEADERS })
      if (jsRes.ok) {
        jsText = await jsRes.text()
        const reJs = new RegExp(`/images/fraccionamientos/${fracc}/modelos/([a-z0-9-]+)/[^"'\\\`?\\s]+\\.(?:webp|jpe?g|png)`, 'gi')
        const nuevas = new Map<string, string[]>()
        for (const m of jsText.matchAll(reJs)) {
          const slug = m[1].toLowerCase()
          const arr = nuevas.get(slug) ?? []
          if (!arr.includes(m[0])) arr.push(m[0])
          nuevas.set(slug, arr)
        }
        // El bundle trae la galería completa → reemplaza la fachada suelta.
        for (const [slug, paths] of nuevas) {
          paths.sort()  // 01-fachada, 02-…, orden natural con fachada primero
          imgsPorSlug.set(slug, paths.map(p => 'https://bpccasa.com.mx' + p))
        }
      }
    }
  } catch { /* si falla el bundle, queda al menos la fachada del HTML */ }

  // Texto plano (sin svg ni tags) para leer las tarjetas.
  const texto = html.replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const re = /([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+Desde\s*\$([\d,]+)\s*MXN\s+([\d.]+)\s*m²\s+(\d+)\s*rec[aá]maras?\s+([\d.]+)\s*ba[nñ]os?/gi
  let mm: RegExpExecArray | null
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  while ((mm = re.exec(texto)) !== null) {
    const nombre = mm[1].trim()
    const precio = parseInt(mm[2].replace(/,/g, ''), 10) || 0
    const m2raw = mm[3]                       // "136.10" (para emparejar en el JS)
    const m2 = String(Math.round(parseFloat(m2raw)))
    const recamaras = parseInt(mm[4], 10) || null
    const banoF = parseFloat(mm[5])
    const banos = Math.floor(banoF)
    const mediosBanos = (banoF - Math.floor(banoF)) >= 0.5 ? 1 : null

    // Terreno: el bundle JS tiene {nombre:`X`,terreno:`A m²`,m2:`B m²`,…}. Se
    // empareja por nombre + m² de construcción (único: otro fraccionamiento
    // reusa el nombre "Lisboa" pero con otro m²), para no tomar el terreno ajeno.
    let m2Terreno: string | null = null
    if (jsText) {
      const reT = new RegExp('nombre:`' + escRe(nombre) + '`,\\s*terreno:`([\\d.]+)\\s*m²`,\\s*m2:`' + escRe(m2raw) + '\\s*m²`', 'i')
      const tm = jsText.match(reT)
      if (tm) m2Terreno = String(Math.round(parseFloat(tm[1])))
    }

    modelos.push({
      nombre, precio, recamaras, banos, mediosBanos, estacionamientos: estac,
      m2, m2Terreno, imagenes: imgsPorSlug.get(norm(nombre)) ?? [], direccion, desarrollo,
    })
  }
  return modelos
}

// ── Sadasi (sadasi.com) — parser multi-modelo ────────────────────────────
// Soporta páginas de DESARROLLO (2 segmentos: /{ciudad-estado}/{desarrollo})
// que listan varios modelos. Para páginas de modelo individual (3 segmentos)
// devuelve [] y el flujo genérico ya maneja el resto (ver bloque SADASI más
// abajo en serve()).
//
// SADASI embebe un array de productos en un bloque <script> como JSON plano;
// los campos clave son: model_name, price, square_meters_of_construction,
// square_meters_of_land, number_of_bedrooms, number_of_bathrooms,
// parking_spaces. Las imágenes están en Firebase Storage.
function parseSadasiModelos(html: string, url: string): VinteModelo[] {
  try {
    const u = new URL(url)
    if (!/(^|\.)sadasi\.com$/i.test(u.hostname)) return []
    const segs = u.pathname.split('/').filter(Boolean)
    // Páginas de modelo individual (3 segmentos) → flujo genérico
    if (segs.length !== 2) return []
  } catch { return [] }

  const segs = new URL(url).pathname.split('/').filter(Boolean)
  const ciudadEstado = segs[0]   // ej. "queretaro-queretaro"
  const desarrolloSlug = segs[1] // ej. "ex-hacienda-el-jacal"
  const desarrolloNombre = tituloModelo(desarrolloSlug.replace(/-/g, ' '))
  const ciudadNombre = tituloModelo(ciudadEstado.replace(/-/g, ' ').split(' ').slice(0, -1).join(' ') || ciudadEstado.replace(/-/g, ' '))
  const direccionBase = `${desarrolloNombre}, ${ciudadNombre}`

  // ── Pre-index: todas las imágenes Firebase agrupadas por product_id ──────
  // Las URLs de Firebase tienen el formato:
  //   /v0/b/sadasi-integraciones.appspot.com/o/products%2F{PRODUCT_ID}%2F...
  // Agrupar por product_id permite recuperar TODAS las fotos de cada modelo
  // desde el HTML completo sin depender del tamaño del snippet local.
  // Palabras clave en la URL de Firebase que indican imagen NO es foto de la
  // propiedad: banners promocionales, concursos, logos de marca, etc.
  // Nota: "ganar" cubre "gana-un-millon", "ganar-premio", etc.
  //       "modelo-" NO se filtra porque es la fachada principal de cada modelo.
  const SADASI_JUNK = /concurso|sorteo|ganar?[-_%]|participa|promo[-_%]|banner[-_%]|campa[nñ]|publicidad|newsletter|flyer[-_%]|evento[-_%]/i
  const imgsByProductId = new Map<string, string[]>()
  for (const m of html.matchAll(/https?:\/\/firebasestorage\.googleapis\.com\/[^\s"'<>\\]+/gi)) {
    const raw = m[0].replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/gi, '&')
    const idM = raw.match(/products(?:%2F|\/)([a-zA-Z0-9]{15,})/i)
    if (!idM) continue
    const pathPart = raw.split('?')[0]
    if (!/\.(jpg|jpeg|png|webp)/i.test(pathPart)) continue
    // Excluir imágenes promocionales/banners
    if (SADASI_JUNK.test(decodeURIComponent(pathPart))) continue
    const productId = idM[1]
    const cleaned = limpiarUrlImg(raw)
    if (!cleaned) continue
    if (!imgsByProductId.has(productId)) imgsByProductId.set(productId, [])
    const arr = imgsByProductId.get(productId)!
    if (!arr.includes(cleaned)) arr.push(cleaned)
  }

  // Dado un fragmento de texto (cerca de un modelo), extrae su product_id y
  // devuelve TODAS las imágenes de ese producto del índice completo.
  function imgsParaContexto(ctx: string): string[] {
    const m = ctx.match(/products(?:%2F|\/)([a-zA-Z0-9]{15,})/i)
    if (!m) return []
    return imgsByProductId.get(m[1]) ?? []
  }

  // ── RUTA 1: JSON embebido en <script> ──────────────────────────────────
  // SADASI inyecta los datos de cada modelo como JSON en el HTML (Remix/SSR).
  const modelos: VinteModelo[] = []
  const jsonBlocks = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of jsonBlocks) {
    const src = block[1]
    if (!src.includes('model_name') && !src.includes('square_meters_of_construction')) continue
    for (const objMatch of src.matchAll(/\{[^{}]*"model_name"[^{}]*\}/g)) {
      try {
        const dec = decodeEntities(objMatch[0]).replace(/\\u0026/gi, '&').replace(/\\\//g, '/')
        const obj = JSON.parse(dec)
        const nombre = String(obj.model_name ?? obj.name ?? '').trim()
        if (!nombre) continue
        const precio = parseNum(obj.price ?? obj.listing_price ?? 0) ?? 0
        const m2 = obj.square_meters_of_construction
          ? String(Math.round(parseFloat(obj.square_meters_of_construction))) : null
        const m2Terreno = obj.square_meters_of_land
          ? String(Math.round(parseFloat(obj.square_meters_of_land))) : null
        const recamaras = obj.number_of_bedrooms != null ? parseInt(obj.number_of_bedrooms, 10) : null
        const banos = obj.number_of_bathrooms != null ? parseFloat(obj.number_of_bathrooms) : null
        const estacionamientos = obj.parking_spaces != null ? parseInt(obj.parking_spaces, 10) : null

        // Contexto amplio alrededor del objeto para encontrar el product_id
        const ctxStart = Math.max(0, objMatch.index! - 200)
        const ctxEnd = Math.min(src.length, objMatch.index! + objMatch[0].length + 1000)
        const ctx = src.slice(ctxStart, ctxEnd)
        // Si el product_id está en el JSON mismo (campo "id" o similar), usarlo primero
        const productIdFromJson = String(obj.id ?? obj.product_id ?? obj.firebase_id ?? '').trim()
        const imgs = (productIdFromJson && imgsByProductId.has(productIdFromJson))
          ? imgsByProductId.get(productIdFromJson)!
          : imgsParaContexto(ctx)

        if (!modelos.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
          modelos.push({ nombre, precio, recamaras, banos: banos ? Math.floor(banos) : null,
            estacionamientos, m2, m2Terreno, imagenes: imgs, direccion: direccionBase, desarrollo: desarrolloNombre })
        }
      } catch { /* JSON malformado — continuar */ }
    }
  }
  if (modelos.length > 0) return modelos

  // ── RUTA 2: HTML — enlaces a modelos (/ciudad-estado/desarrollo/modelo) ──
  const linkPat = new RegExp(`href=["']\\/${ciudadEstado}\\/${desarrolloSlug}\\/([a-z0-9][a-z0-9-]*)["']`, 'gi')
  const slugsSeen = new Set<string>()
  for (const m of html.matchAll(linkPat)) slugsSeen.add(m[1])
  if (slugsSeen.size === 0) return []

  // Todos los índices de cada ocurrencia del href para delimitar secciones
  const hrefOccurrences: { slug: string; idx: number }[] = []
  for (const slug of slugsSeen) {
    let pos = 0
    const needle = `/${ciudadEstado}/${desarrolloSlug}/${slug}`
    while (true) {
      const i = html.indexOf(needle, pos)
      if (i === -1) break
      hrefOccurrences.push({ slug, idx: i })
      pos = i + 1
    }
  }
  hrefOccurrences.sort((a, b) => a.idx - b.idx)

  for (let i = 0; i < hrefOccurrences.length; i++) {
    const { slug, idx } = hrefOccurrences[i]
    // Tomar la sección desde antes de este href hasta antes del siguiente
    const secStart = Math.max(0, idx - 600)
    const nextIdx = hrefOccurrences[i + 1]?.idx ?? html.length
    const secEnd = Math.min(html.length, Math.max(idx + 4000, nextIdx))
    const sec = html.slice(secStart, secEnd)
    if (/AGOTADO/i.test(sec.slice(0, 1500))) continue

    const precioM = sec.match(/\$\s*([\d,]+(?:,\d{3})+)/)
    const precio = precioM ? parseInt(precioM[1].replace(/,/g, ''), 10) : 0

    const tituloM = sec.match(/<h[1-6][^>]*>(?:<[^>]+>)?([^<]{2,60}?)(?:<\/[^>]+>)?<\/h[1-6]>/i)
    const nombreRaw = tituloM ? decodeEntities(tituloM[1]).trim() : ''
    const nombre = nombreRaw.replace(/^Casa\s+modelo\s+/i, '').trim()
      || tituloModelo(slug.replace(/-/g, ' '))

    const m2Raw = sec.match(/([\d.]+)\s*m[²2]/i)
    const m2 = m2Raw ? String(Math.round(parseFloat(m2Raw[1]))) : null
    const recM = sec.match(/(\d)\s*[Rr]ec[aá]mara/i)
    const banM = sec.match(/([\d.]+)\s*[Bb]a[ñn]o/i)
    const estM = sec.match(/(\d)\s*[Ee]stacionamiento/i)

    // Imágenes: product_id del contexto → todas las fotos del producto
    const imgs = imgsParaContexto(sec)

    if (!modelos.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
      modelos.push({
        nombre,
        precio,
        recamaras: recM ? parseInt(recM[1], 10) : null,
        banos: banM ? Math.floor(parseFloat(banM[1])) : null,
        estacionamientos: estM ? parseInt(estM[1], 10) : null,
        m2,
        imagenes: imgs,
        direccion: direccionBase,
        desarrollo: desarrolloNombre,
      })
    }
  }
  return modelos
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

// Strips thousands separators from a raw number string (supports 4.080 and 4,080).
function stripThousands(s: string): string {
  if (/^\d{1,3}(\.\d{3})+$/.test(s.trim())) return s.replace(/\./g, '')
  return s.replace(/,/g, '')
}

// Texto visible de la página, sin scripts, estilos ni etiquetas. Buscar sobre
// esto (y no sobre el HTML crudo) evita que un nombre de archivo o una clase
// CSS haga match: en gpvivienda.com, "construccion.svg" era el ícono de OTRA
// casa listada más abajo y el importador le robaba los m² a esa.
function textoPlano(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

// Superficies de construcción y terreno a partir del texto visible.
//
// Hay dos formatos en la calle y son ambiguos entre sí:
//   valor→etiqueta:  "122 m² Constr. 108 m² Terreno"     (gpvivienda)
//   etiqueta→valor:  "Construcción 180 m² Terreno 200 m²" (portales clásicos)
// Leer el primero con la regla del segundo (o al revés) devuelve el número de la
// otra superficie. Como una misma página es consistente, se cuenta cuál de las
// dos formas aparece más y se usa esa para ambas superficies.
const RE_POST = /([\d,.]+)\s*m[²2][^\d]{0,15}?(constr(?:\.|u)|terreno)/gi
const RE_PRE  = /(constr(?:\.|ucci[oó]n|uido)|terreno)[^\d]{0,25}([\d,.]+)\s*m[²2]/gi

function superficies(texto: string): { constr: string | null; terreno: string | null } {
  const post = [...texto.matchAll(RE_POST)].map(m => ({ etq: m[2].toLowerCase(), val: m[1] }))
  const pre  = [...texto.matchAll(RE_PRE)].map(m => ({ etq: m[1].toLowerCase(), val: m[2] }))
  const usar = post.length >= pre.length ? post : pre
  const primero = (p: string) => usar.find(x => x.etq.startsWith(p))?.val ?? null
  return { constr: primero('constr'), terreno: primero('terreno') }
}

function firstInt(v: unknown): number | null {
  if (v == null) return null
  const s = String(v)
  // Miles con separador punto o coma: "4.080", "4,080", "1.234.567"
  const th = s.match(/\d{1,3}(?:[,.]\d{3})+/)
  if (th) return parseInt(th[0].replace(/[,.]/g, ''), 10)
  // Entero simple
  const m = s.match(/\d+/)
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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.5',
}

// User-Agent de Googlebot. Algunos portales protegidos por AWS WAF (pincali.com)
// o firewalls que sólo miran el UA dejan pasar a los buscadores con el HTML
// completo prerenderizado (con JSON-LD, og tags, etc.). Se usa como capa de
// respaldo cuando el fetch normal choca con un desafío anti-bot.
const BOT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.5',
}

// Certificados intermedios/raíz que algunos portales NO envían en su cadena TLS,
// haciendo que Deno los rechace ("UnknownIssuer"). Inmobay (*.inmobay.com) está
// firmado por "Sectigo Public Server Authentication CA DV R36" pero su servidor
// manda un intermedio equivocado. Se agregan como CA de confianza ADICIONAL
// (no reemplazan las raíces por defecto), así el resto de sitios no se afecta.
const EXTRA_CA_CERTS = [
`-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`,
`-----BEGIN CERTIFICATE-----
MIIFijCCA3KgAwIBAgIQdY39i658BwD6qSWn4cetFDANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNNDYwMzIxMjM1OTU5WjBfMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQDEy1TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYwggIiMA0GCSqGSIb3DQEB
AQUAA4ICDwAwggIKAoICAQCTvtU2UnXYASOgHEdCSe5jtrch/cSV1UgrJnwUUxDa
ef0rty2k1Cz66jLdScK5vQ9IPXtamFSvnl0xdE8H/FAh3aTPaE8bEmNtJZlMKpnz
SDBh+oF8HqcIStw+KxwfGExxqjWMrfhu6DtK2eWUAtaJhBOqbchPM8xQljeSM9xf
iOefVNlI8JhD1mb9nxc4Q8UBUQvX4yMPFF1bFOdLvt30yNoDN9HWOaEhUTCDsG3X
ME6WW5HwcCSrv0WBZEMNvSE6Lzzpng3LILVCJ8zab5vuZDCQOc2TZYEhMbUjUDM3
IuM47fgxMMxF/mL50V0yeUKH32rMVhlATc6qu/m1dkmU8Sf4kaWD5QazYw6A3OAS
VYCmO2a0OYctyPDQ0RTp5A1NDvZdV3LFOxxHVp3i1fuBYYzMTYCQNFu31xR13NgE
SJ/AwSiItOkcyqex8Va3e0lMWeUgFaiEAin6OJRpmkkGj80feRQXEgyDet4fsZfu
+Zd4KKTIRJLpfSYFplhym3kT2BFfrsU4YjRosoYwjviQYZ4ybPUHNs2iTG7sijbt
8uaZFURww3y8nDnAtOFr94MlI1fZEoDlSfB1D++N6xybVCi0ITz8fAr/73trdf+L
HaAZBav6+CuBQug4urv7qv094PPK306Xlynt8xhW6aWWrL3DkJiy4Pmi1KZHQ3xt
zwIDAQABo0IwQDAdBgNVHQ4EFgQUVnNYZJX5khqwEioEYnmhQBWIIUkwDgYDVR0P
AQH/BAQDAgGGMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEMBQADggIBAC9c
mTz8Bl6MlC5w6tIyMY208FHVvArzZJ8HXtXBc2hkeqK5Duj5XYUtqDdFqij0lgVQ
YKlJfp/imTYpE0RHap1VIDzYm/EDMrraQKFz6oOht0SmDpkBm+S8f74TlH7Kph52
gDY9hAaLMyZlbcp+nv4fjFg4exqDsQ+8FxG75gbMY/qB8oFM2gsQa6H61SilzwZA
Fv97fRheORKkU55+MkIQpiGRqRxOF3yEvJ+M0ejf5lG5Nkc/kLnHvALcWxxPDkjB
JYOcCj+esQMzEhonrPcibCTRAUH4WAP+JWgiH5paPHxsnnVI84HxZmduTILA7rpX
DhjvLpr3Etiga+kFpaHpaPi8TD8SHkXoUsCjvxInebnMMTzD9joiFgOgyY9mpFui
TdaBJQbpdqQACj7LzTWb4OE4y2BThihCQRxEV+ioratF4yUQvNs+ZUH7G6aXD+u5
dHn5HrwdVw1Hr8Mvn4dGp+smWg9WY7ViYG4A++MnESLn/pmPNPW56MORcr3Ywx65
LvKRRFHQV80MNNVIIb/bE/FmJUNS0nAiNs2fxBx1IK1jcmMGDw4nztJqDby1ORrp
0XZ60Vzk50lJLVU3aPAaOpg+VBeHVOmmJ1CJeyAvP/+/oYtKR5j/K3tJPsMpRmAY
QqszKbrAKbkTidOIijlBO8n9pu0f9GBj39ItVQGL
-----END CERTIFICATE-----`,
]

// Cliente HTTP con las CA extra. Si createHttpClient no está disponible, queda undefined.
let extraCaClient: unknown
try {
  extraCaClient = (Deno as any).createHttpClient({ caCerts: EXTRA_CA_CERTS })
} catch { extraCaClient = undefined }

// Detecta la página-desafío de Cloudflare / anti-bot (NO es el contenido real).
// Portales como inmuebles24 devuelven un "Just a moment…" con un reto de JS que
// los proxies simples no resuelven; hay que reconocerlo para no extraer basura.
function esDesafioBot(html: string): boolean {
  const h = html.slice(0, 4000).toLowerCase()
  return /just a moment|attention required|cf-browser-verification|challenge-platform|_cf_chl|cf_chl_opt|verifying you are human|performing security verification|enable javascript and cookies|datadome|px-captcha|gokuprops|awswafcookie|awswaf|token\.awswaf/.test(h)
}

// Unblocker con renderizado (ScraperAPI). Solo se usa si está configurada la
// variable SCRAPER_API_KEY (secreto de la función). Es la única forma de pasar
// el Cloudflare de inmuebles24 y similares desde el servidor. `render=true`
// ejecuta el JS del reto; `premium`/`country_code=mx` usa IPs residenciales MX.
async function fetchViaUnblocker(url: string): Promise<string | null> {
  const key = (globalThis as any).Deno?.env?.get?.('SCRAPER_API_KEY')
  if (!key) return null
  // Se usa la API ASÍNCRONA de ScraperAPI: el endpoint síncrono con render en el
  // plan free es intermitente (Cloudflare bloquea la IP de datacenter y devuelve
  // 500), pero el async reintenta/rota internamente hasta lograrlo. Se envía el
  // job con render (ejecuta el reto de Cloudflare) e IP de México, y se sondea el
  // resultado hasta ~130s (dentro del límite de la función).
  try {
    const sub = await fetch('https://async.scraperapi.com/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, url, apiParams: { render: true, country_code: 'mx' } }),
    })
    if (!sub.ok) return null
    const job = await sub.json()
    const statusUrl = job?.statusUrl
    if (!statusUrl) return null
    const deadline = Date.now() + 130_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000))
      let sj: any
      try {
        const st = await fetch(statusUrl)
        if (!st.ok) continue
        sj = await st.json()
      } catch (_) { continue }
      if (sj?.status === 'finished') {
        const body = sj?.response?.body
        return (body && body.length > 500 && !esDesafioBot(body)) ? body : null
      }
      if (sj?.status === 'failed') return null
    }
  } catch (_) { /* el unblocker falló o agotó cuota */ }
  return null
}

// Descarga el HTML. Estrategia en capas:
//  1) fetch directo (con CA extra para portales con cadena TLS incompleta).
//  2) proxy de lectura simple (allorigins) para sitios sin anti-bot fuerte.
//  3) unblocker con render (ScraperAPI) para Cloudflare/anti-bot — requiere key.
// En cada capa se descarta la página-desafío para no pasar contenido falso.
async function fetchHtml(url: string): Promise<string> {
  let huboDesafio = false
  try {
    const opts: any = { headers: BROWSER_HEADERS }
    if (extraCaClient) opts.client = extraCaClient
    const res = await fetch(url, opts)
    if (res.ok) {
      const t = await res.text()
      if (!esDesafioBot(t)) return t
      huboDesafio = true
    }
  } catch (_) {
    // Error de red/TLS: caer a las siguientes capas.
  }

  // Capa 1b: reintento con UA de Googlebot. Portales tras AWS WAF (pincali) o
  // firewalls que sólo filtran por UA sirven el HTML completo a los buscadores.
  try {
    const opts: any = { headers: BOT_HEADERS }
    if (extraCaClient) opts.client = extraCaClient
    const res = await fetch(url, opts)
    if (res.ok) {
      const t = await res.text()
      if (t && t.length > 500 && !esDesafioBot(t)) return t
      if (esDesafioBot(t)) huboDesafio = true
    }
  } catch (_) { /* el UA de bot tampoco pasó */ }

  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const res2 = await fetch(proxy, { headers: BROWSER_HEADERS })
    if (res2.ok) {
      const t = await res2.text()
      if (t && t.length > 200 && !esDesafioBot(t)) return t
      if (esDesafioBot(t)) huboDesafio = true
    }
  } catch (_) { /* el proxy también falló */ }

  // Última capa: unblocker con render (inmuebles24 y otros con Cloudflare).
  const viaApi = await fetchViaUnblocker(url)
  if (viaApi) return viaApi

  if (huboDesafio) {
    throw new Error('Este portal bloquea accesos automáticos con Cloudflare (anti-bot). Para importarlo hay que configurar un servicio unblocker (SCRAPER_API_KEY) en la función; mientras tanto, copia la ficha y pégala manualmente.')
  }
  throw new Error('No se pudo acceder a la página. El sitio puede estar bloqueando accesos automáticos o tener un certificado de seguridad incompleto. Copia la ficha y pégala manualmente en el campo de descripción.')
}

// ── Next.js __NEXT_DATA__ extractor ─────────────────────────────────────────
function extractNextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

// Recorre un objeto buscando la primera hoja que parezca ser la propiedad.
function findPropertyNode(obj: any, depth = 0): any {
  if (depth > 6 || !obj || typeof obj !== 'object') return null
  const keys = Object.keys(obj)
  const looksLikeProp = keys.some(k =>
    /^(precio|price|valorVenta|habitaciones|bedrooms|recamaras|imagenes|fotos|photos|images|title|description|bathrooms|rooms|area|nid|area_construida|price_cop|tipo_inmueble)$/.test(k))
  if (looksLikeProp) return obj
  for (const k of keys) {
    const val = obj[k]
    if (Array.isArray(val)) {
      // Buscar dentro de los primeros 3 elementos del array
      for (const item of val.slice(0, 3)) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const found = findPropertyNode(item, depth + 1)
          if (found) return found
        }
      }
      continue
    }
    const found = findPropertyNode(val, depth + 1)
    if (found) return found
  }
  return null
}

// ── NocNok platform helper ────────────────────────────────────────────────────
// realtydreamsmexico.com and other NocNok-powered sites embed all property data
// in Next.js RSC flight format: self.__next_f.push([1,"...escaped JSON..."]).
// This helper decodes the outer JS string escape sequences and then extracts
// the "property":{...} object using a proper brace-depth parser that accounts
// for string values (so braces inside descriptions don't confuse the counter).
function extractNocNokProperty(html: string): Record<string, unknown> | null {
  const PUSH_PREFIX = 'self.__next_f.push([1,"'
  const PROP_MARKER = '\\"property\\":'
  let searchFrom = 0
  while (true) {
    const pushStart = html.indexOf(PUSH_PREFIX, searchFrom)
    if (pushStart === -1) return null
    const contentStart = pushStart + PUSH_PREFIX.length
    // Quick check: does this block contain the property key?
    const nextPush = html.indexOf(PUSH_PREFIX, contentStart + 1)
    const blockEnd = nextPush !== -1 ? nextPush : Math.min(contentStart + 400000, html.length)
    if (!html.slice(contentStart, blockEnd).includes(PROP_MARKER)) {
      searchFrom = contentStart
      continue
    }
    // Decode JS string escape sequences from the push argument
    const chars: string[] = []
    let i = contentStart
    while (i < html.length) {
      const ch = html[i]
      if (ch === '\\' && i + 1 < html.length) {
        const nx = html[i + 1]
        if (nx === '"') { chars.push('"'); i += 2; continue }
        if (nx === '\\') { chars.push('\\'); i += 2; continue }
        if (nx === 'n') { chars.push('\n'); i += 2; continue }
        if (nx === 'r') { chars.push('\r'); i += 2; continue }
        if (nx === 't') { chars.push('\t'); i += 2; continue }
        chars.push(nx); i += 2; continue
      }
      if (ch === '"') break // end of JS string
      chars.push(ch); i++
    }
    const content = chars.join('')
    // Find "property":{ and extract the object with a proper depth/string parser
    const pkIdx = content.indexOf('"property":')
    if (pkIdx === -1) { searchFrom = contentStart; continue }
    let j = pkIdx + '"property":'.length // points to '{'
    let depth = 0
    let inStr = false
    while (j < content.length) {
      const c = content[j]
      if (inStr) {
        if (c === '\\') { j += 2; continue }
        if (c === '"') inStr = false
      } else {
        if (c === '"') inStr = true
        else if (c === '{') depth++
        else if (c === '}') { depth--; if (depth === 0) break }
      }
      j++
    }
    if (depth !== 0) { searchFrom = contentStart; continue }
    try {
      return JSON.parse(content.slice(pkIdx + '"property":'.length, j + 1)) as Record<string, unknown>
    } catch { searchFrom = contentStart; continue }
  }
}

// ── EasyBroker: construir respuesta a partir de un objeto de la API ──────────
function buildEbApiResponse(p: any, corsH: Record<string, string>): Response {
  const opObj = Array.isArray(p.operations) ? p.operations.find((o: any) => o.active) : null
  const opType = opObj?.type === 'rental' ? 'renta' : 'venta'
  const precio = opObj?.amount ? String(Math.round(Number(opObj.amount))) : ''
  const tipo = mapTipo(String(p.property_type ?? ''))
  const loc = p.location ?? {}
  const direccion = [loc.neighborhood, loc.city, loc.state].filter(Boolean).join(', ')
  let zona: 'queretaro' | 'monterrey' | 'puebla' | null = null
  const locStr = [loc.city ?? '', loc.state ?? ''].join(' ').toLowerCase()
  if (/quer[eé]taro/.test(locStr))                zona = 'queretaro'
  else if (/monterrey|nuevo\s*le[oó]n/.test(locStr)) zona = 'monterrey'
  else if (/puebla/.test(locStr))                 zona = 'puebla'
  const imagenes: string[] = (p.images ?? [])
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((i: any) => i.url ?? i.original_url ?? '')
    .filter(Boolean)
    .slice(0, 30)
  return new Response(JSON.stringify({
    titulo: p.title ?? '', descripcion: p.description ?? '',
    precio, direccion, zona, modelo: '',
    recamaras: p.bedrooms ?? null, banos: p.bathrooms ?? null,
    mediosBanos: p.half_bathrooms ?? null, estacionamientos: p.parking_spaces ?? null,
    m2: p.construction_size ? String(p.construction_size) : '',
    m2Terreno: p.lot_size ? String(p.lot_size) : '',
    tipo, operacion: opType, imagenes,
  }), { headers: corsH })
}

// Busca una propiedad en el catálogo de EasyBroker comparando el slug de la URL
// contra el slug del public_url de cada propiedad. Pagina hasta 20 páginas (1000 props).
async function buscarEbPorSlug(apiKey: string, urlSlug: string): Promise<any | null> {
  const slugWords = new Set(urlSlug.toLowerCase().split('-').filter(w => w.length > 3))
  for (let page = 1; page <= 20; page++) {
    let j: any
    try {
      const r = await fetch(`https://api.easybroker.com/v1/properties?limit=50&page=${page}`, {
        headers: { accept: 'application/json', 'X-Authorization': apiKey },
      })
      if (!r.ok) break
      j = await r.json()
    } catch { break }
    const props: any[] = j?.content ?? []
    if (!props.length) break
    for (const p of props) {
      // Comparar contra el slug del public_url de la propiedad
      const propSlug = (p.public_url ?? '').split('/').filter(Boolean).pop()?.toLowerCase() ?? ''
      if (propSlug && propSlug === urlSlug) return p
      // Coincidencia por palabras comunes (mínimo 4 palabras de >3 letras en común)
      const propWords = new Set(propSlug.split('-').filter((w: string) => w.length > 3))
      const common = [...slugWords].filter(w => propWords.has(w)).length
      if (common >= 4) return p
    }
    if (props.length < 50) break // Última página
  }
  return null
}

// ── EasyBroker: importar desde URL de easybroker.com ───────────────────────
async function importarEasyBroker(url: string): Promise<Response | null> {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (!/(?:^|\.)easybroker\.com$/i.test(parsed.hostname)) return null

  const corsH = { ...corsHeaders, 'Content-Type': 'application/json' }
  const apiKey = (Deno as any).env?.get?.('EASYBROKER_API_KEY')

  // URL con EB-XXXXXX explícito → fetch directo por ID
  const idMatch = parsed.pathname.match(/\/(EB-[A-Z0-9]+)/i)
  if (idMatch) {
    if (!apiKey) return null
    const r = await fetch(`https://api.easybroker.com/v1/properties/${idMatch[1].toUpperCase()}`, {
      headers: { accept: 'application/json', 'X-Authorization': apiKey },
    })
    if (r.ok) return buildEbApiResponse(await r.json(), corsH)
    return null
  }

  // URL de agente o MLS → buscar en el catálogo por slug
  const segments = parsed.pathname.split('/').filter(Boolean)
  const urlSlug = segments[segments.length - 1] ?? ''
  if (urlSlug.length < 10) return null // No parece un slug de propiedad

  if (!apiKey) {
    // Sin API key no podemos buscar: avisamos sin timeout
    return new Response(JSON.stringify({
      error: 'No se puede importar desde el portal de agente de EasyBroker sin la API key configurada en el servidor.',
    }), { status: 200, headers: corsH })
  }

  const match = await buscarEbPorSlug(apiKey, urlSlug)
  if (match) return buildEbApiResponse(match, corsH)

  return new Response(JSON.stringify({
    error: 'No se encontró esta propiedad en el catálogo de EasyBroker. Prueba con la URL pública de Lamudi, Inmuebles24 u otro portal.',
  }), { status: 200, headers: corsH })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { url } = await req.json()
    if (!url || !/^https?:\/\//.test(url)) throw new Error('URL inválida')

    // ── EasyBroker nativo (API o error temprano para URLs de agente) ──────────
    const ebApiResp = await importarEasyBroker(url)
    if (ebApiResp) return ebApiResp

    const html = await fetchHtml(url)

    // ── Vinte: devuelve todos los modelos del desarrollo ──────────────────────
    const vinteModelos = parseVinteModelos(html, url)
    if (vinteModelos.length > 0) {
      const primero = vinteModelos[0]
      return new Response(JSON.stringify({
        titulo: '',
        descripcion: '',
        precio: primero.precio > 0 ? String(primero.precio) : '',
        direccion: primero.direccion,
        zona: null,
        modelo: primero.nombre,
        recamaras: primero.recamaras,
        banos: primero.banos,
        mediosBanos: null,
        estacionamientos: primero.estacionamientos,
        m2: primero.m2 ?? '',
        m2Terreno: null,
        tipo: 'casa',
        operacion: 'venta',
        imagenes: primero.imagenes,
        _modelos: vinteModelos,
        _desarrollo: primero.desarrollo,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Sadasi: devuelve todos los modelos del desarrollo ─────────────────────
    const sadasiModelos = parseSadasiModelos(html, url)
    if (sadasiModelos.length > 0) {
      const primero = sadasiModelos[0]
      return new Response(JSON.stringify({
        titulo: '',
        descripcion: '',
        precio: primero.precio > 0 ? String(primero.precio) : '',
        direccion: primero.direccion,
        zona: null,
        modelo: primero.nombre,
        recamaras: primero.recamaras,
        banos: primero.banos,
        mediosBanos: null,
        estacionamientos: primero.estacionamientos,
        m2: primero.m2 ?? '',
        m2Terreno: primero.m2Terreno ?? null,
        tipo: 'casa',
        operacion: 'venta',
        imagenes: primero.imagenes,
        _modelos: sadasiModelos,
        _desarrollo: primero.desarrollo,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── BPC Casa: devuelve todos los modelos del fraccionamiento ──────────────
    const bpcModelos = await parseBpcCasaModelos(html, url)
    if (bpcModelos.length > 0) {
      const primero = bpcModelos[0]
      const loc = (primero.direccion || '').toLowerCase()
      const zonaBpc = /quer[eé]taro/.test(loc) ? 'queretaro'
        : /monterrey|nuevo\s*le[oó]n/.test(loc) ? 'monterrey'
        : /puebla/.test(loc) ? 'puebla' : null
      return new Response(JSON.stringify({
        titulo: '',
        descripcion: '',
        precio: primero.precio > 0 ? String(primero.precio) : '',
        direccion: primero.direccion,
        zona: zonaBpc,
        modelo: primero.nombre,
        recamaras: primero.recamaras,
        banos: primero.banos,
        mediosBanos: primero.mediosBanos ?? null,
        estacionamientos: primero.estacionamientos,
        m2: primero.m2 ?? '',
        m2Terreno: primero.m2Terreno ?? null,
        tipo: 'casa',
        operacion: 'venta',
        imagenes: primero.imagenes,
        _modelos: bpcModelos,
        _desarrollo: primero.desarrollo,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

    // ── 0. brokers.tuhabi.mx ─────────────────────────────────────────────────
    // SPA privada que requiere login — el HTML es un shell vacío.
    if (/brokers\.tuhabi\.mx/i.test(url)) {
      throw new Error(
        'El portal de brokers de TuHabi requiere inicio de sesión y no puede importarse automáticamente. ' +
        'Usa el enlace público de tuficha.mx si el portal lo genera, o copia los datos manualmente.'
      )
    }

    // ── 0b. TuFicha (tuficha.mx) — API pública de Habi/TuHabi MX ────────────
    // SPA React que usa la API de Habi. Llamamos directamente al endpoint
    // cms-globack-api con la clave embebida en el bundle de tuficha.mx.
    if (/tuficha\.mx/i.test(url)) {
      const idMatch = url.match(/inmueble[_/](\d+)/) ?? url.match(/inmueble_id=(\d+)/)
      if (!idMatch) throw new Error('No se encontró el ID de inmueble en la URL de TuFicha.')
      const propertyId = idMatch[1]

      const habiRes = await fetch(
        `https://apiv2.habi.co/cms-globack-api/get_property_card?property_id=${propertyId}&country=MX`,
        {
          headers: {
            'x-api-key': 'eevddBBln771X9bIi7ltt5uooE4lxWef4ITpZR2n',
            'Content-Type': 'application/json',
            'Origin': 'https://tuficha.mx',
            'Referer': 'https://tuficha.mx/',
            ...BROWSER_HEADERS,
          },
        }
      )
      if (!habiRes.ok) throw new Error(`Error al obtener datos de TuFicha (HTTP ${habiRes.status})`)
      const habiJson = await habiRes.json()
      if (!habiJson?.data?.property) throw new Error('La propiedad no fue encontrada en TuFicha.')

      const p   = habiJson.data.property
      const det = p.property_detail ?? {}
      const ico = habiJson.data.icon_details?.distribution_details ?? {}

      // Título: si viene vacío construir desde tipo + colonia
      titulo = p.title?.trim()
        || [det.property_type, det.suburb, det.city_name].filter(Boolean).join(' en ')

      descripcion = p.description ?? ''

      const pv = parseNum(det.price)
      if (pv && pv >= 1000) { precio = String(Math.round(pv)); operacion = 'venta' }
      else {
        const rv = parseNum(det.price_old)
        if (rv && rv >= 1000) { precio = String(Math.round(rv)); operacion = 'venta' }
      }

      recamaras        = cap(parseNum(det.room_num  ?? ico.number_rooms), 5)
      banos            = cap(parseNum(det.bath       ?? ico.toilets), 4)
      estacionamientos = cap(parseNum(det.garage     ?? ico.garages), 3)
      const areaVal    = parseNum(det.area ?? ico.area)
      if (areaVal) m2  = String(Math.round(areaVal))

      const rawTipo = String(det.property_type ?? '')
      tipo = mapTipo(rawTipo) ?? tipo

      // Dirección y zona
      const parts = [det.suburb, det.city_name].filter(Boolean)
      if (parts.length) direccion = parts.join(', ')
      const locHay = [det.metropolitan_zone, det.city_name, det.median_zone].join(' ').toLowerCase()
      if (/quer[eé]taro|qro\b/.test(locHay))                zona = 'queretaro'
      else if (/monterrey|nuevo\s*le[oó]n|\bmty\b/.test(locHay)) zona = 'monterrey'
      else if (/puebla/.test(locHay))                        zona = 'puebla'

      // Imágenes: URLs relativas → CDN Habi MX
      const CDN = 'https://d1yv9l2s30ohmg.cloudfront.net/'
      if (Array.isArray(p.images)) {
        imagenes = p.images
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((img: any) => {
            const u = typeof img === 'string' ? img : (img.url ?? '')
            return u.startsWith('http') ? u : (u ? CDN + u : '')
          })
          .filter((u: string) => u)
          .slice(0, 30)
      }
    }

    // ── 0b2. ficha.info (fichas de Tokko Broker) ────────────────────────────
    // Next.js App Router con RSC streaming. Los datos vienen embebidos en los
    // scripts self.__next_f.push([1,"..."]) — extractNocNokProperty ya lee ese
    // formato. El objeto "property" contiene todo: tipo, precio, m2, fotos, etc.
    if (/ficha\.info\/p\//i.test(url)) {
      const np = extractNocNokProperty(html)
      if (np) {
        if (!tipo) tipo = mapTipo(String((np as any).type?.name ?? ''))

        if (!precio) {
          const ops = (np as any).operations as Record<string, string[]> | undefined
          const rawSale = String(ops?.Sale?.[0] ?? ops?.sale?.[0] ?? '').replace(/\D/g, '')
          const rawRent = String(ops?.Rent?.[0] ?? ops?.rent?.[0] ?? '').replace(/\D/g, '')
          if (rawSale) { precio = rawSale; operacion = 'venta' }
          else if (rawRent) { precio = rawRent; operacion = 'renta' }
        }

        for (const m of ((np as any).measurement ?? []) as any[]) {
          if (m.key === 'total_surface' && !m2) m2 = String(m.original_value ?? '')
          if (m.key === 'surface' && !m2Terreno) m2Terreno = String(m.original_value ?? '')
        }

        for (const b of ((np as any).basic_info ?? []) as any[]) {
          const v = parseNum(b.value)
          if (b.key === 'suite_amount'       && recamaras       === null) recamaras       = cap(v, 5)
          if (b.key === 'bathroom_amount'    && banos           === null) banos           = cap(v, 4)
          if (b.key === 'toilet_amount'      && mediosBanos     === null) mediosBanos     = cap(v, 2)
          if (b.key === 'parking_lot_amount' && estacionamientos=== null) estacionamientos= cap(v, 3)
        }

        if (!direccion) {
          const loc = String((np as any).location ?? (np as any).address ?? '')
          if (loc) direccion = loc.replace(/\|/g, ',').replace(/\s{2,}/g, ' ').trim()
        }

        if (!zona) {
          const l = String((np as any).location ?? '').toLowerCase()
          if (/quer[eé]taro/.test(l))                zona = 'queretaro'
          else if (/monterrey|nuevo\s*le[oó]n/.test(l)) zona = 'monterrey'
          else if (/puebla/.test(l))                 zona = 'puebla'
        }

        if (!imagenes.length) {
          const imgs = (np as any).pictures?.images
          if (Array.isArray(imgs)) imagenes = imgs.filter(Boolean).slice(0, 30)
        }
      }

      // Título desde edited_ficha.title (más limpio que property.address)
      if (!titulo) {
        const m = html.match(/"edited_ficha"\s*:\s*\{[^{}]{0,800}"title"\s*:\s*"([^"]+)"/)
        if (m?.[1]) titulo = decodeEntities(m[1])
      }

      // Descripción en texto plano desde los chunks RSC (id:T<hex>,<texto>)
      if (!descripcion) {
        const allRsc = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)]
          .map(b => b[1]
            .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
          ).join('')
        // Tomar el chunk de texto plano (el de menor tamaño entre los T<hex>,<text>)
        // ficha.info emite dos: HTML (~17:T7fa) y plano (~18:T518)
        const txtMatches = [...allRsc.matchAll(/\d+:T[0-9a-f]+,([\s\S]+?)(?=\n?\d+:|$)/g)]
        const plainChunk = txtMatches.reduce<string | null>((best, m) =>
          (!best || m[1].length < best.length) ? m[1] : best, null)
        if (plainChunk) {
          descripcion = plainChunk
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ').trim().slice(0, 3000)
        }
      }
    }

    // ── 0c. NocNok platform (realtydreamsmexico.com y similares) ────────────
    if (html.includes('nocnok-img')) {
      const np = extractNocNokProperty(html)
      if (np) {
        if (np.title) titulo = String(np.title)
        if (np.description) descripcion = String(np.description)
        const sp = parseNum(np.salePrice)
        const rp = parseNum(np.rentPrice)
        if (sp) { precio = String(Math.round(sp)); operacion = 'venta' }
        else if (rp) { precio = String(Math.round(rp)); operacion = 'renta' }
        if (!operacion) operacion = np.isSale ? 'venta' : np.isRent ? 'renta' : null
        recamaras = cap(parseNum(np.bedrooms), 5)
        banos = cap(parseNum(np.fullBathrooms), 4)
        mediosBanos = cap(parseNum(np.halfBathrooms), 2)
        estacionamientos = cap(parseNum(np.parkingSpaces), 3)
        const cs = parseNum(np.constructionSize); if (cs) m2 = String(Math.round(cs))
        const ls = parseNum(np.lotSize); if (ls) m2Terreno = String(Math.round(ls))
        if (!tipo) tipo = mapTipo(String(np.type ?? '') + ' ' + String(np.subtype ?? ''))
        if (!direccion) {
          const parts = [np.settlement, np.county, np.state].filter(Boolean).map(String)
          if (parts.length) direccion = parts.join(', ')
        }
        if (!zona) {
          const loc = [np.state ?? '', np.county ?? ''].join(' ').toLowerCase()
          if (/quer[eé]taro/.test(loc)) zona = 'queretaro'
          else if (/monterrey|nuevo\s*le[oó]n/.test(loc)) zona = 'monterrey'
          else if (/puebla/.test(loc)) zona = 'puebla'
        }
        if (Array.isArray(np.pictureUrls)) {
          imagenes = (np.pictureUrls as unknown[]).slice(0, 30).map(u => String(u))
        }
      }
    }

    // ── 0d. Inmobay — tipo/operación desde slug + __NEXT_DATA__ ─────────────────
    if (/inmobay\.com/i.test(url)) {
      // Slug contiene tipo y operación siempre (ej: "terreno-en-venta-hacienda-...")
      const slugMatch = url.match(/\/(?:propiedad|property)\/([^/?#]+)/i)
      if (slugMatch) {
        const slugWords = slugMatch[1].replace(/-/g, ' ')
        if (!tipo) tipo = mapTipo(slugWords)
        if (!operacion) operacion = mapOp(slugWords)
        if (!zona) {
          if (/quer[eé]taro|queretaro/.test(slugMatch[1])) zona = 'queretaro'
          else if (/monterrey|nuevo[\s-]?leon/.test(slugMatch[1])) zona = 'monterrey'
          else if (/puebla/.test(slugMatch[1])) zona = 'puebla'
        }
      }
      // __NEXT_DATA__ si el sitio usa Next.js (datos embebidos en el HTML)
      const nd = extractNextData(html)
      if (nd) {
        const pn = findPropertyNode(nd)
        if (pn) {
          if (!titulo && (pn.titulo ?? pn.title)) titulo = String(pn.titulo ?? pn.title)
          if (!descripcion && pn.description) descripcion = htmlText(String(pn.description))
          const sp = parseNum(pn.precio ?? pn.price ?? pn.precio_venta ?? pn.sale_price)
          if (sp && !precio) { precio = String(Math.round(sp)); operacion = operacion ?? 'venta' }
          const beds = parseNum(pn.recamaras ?? pn.bedrooms ?? pn.habitaciones)
          if (beds != null && recamaras === null) recamaras = cap(beds, 5)
          const bths = parseNum(pn.banos ?? pn.bathrooms ?? pn.banos_completos)
          if (bths != null && banos === null) banos = cap(bths, 4)
          const est = parseNum(pn.estacionamientos ?? pn.parking ?? pn.garage)
          if (est != null && estacionamientos === null) estacionamientos = cap(est, 3)
          const m2c = parseNum(pn.m2 ?? pn.area ?? pn.superficie_construida ?? pn.construccion)
          if (m2c && !m2) m2 = String(Math.round(m2c))
          const m2t = parseNum(pn.m2_terreno ?? pn.lot_size ?? pn.terreno)
          if (m2t && !m2Terreno) m2Terreno = String(Math.round(m2t))
        }
      }
      // Imágenes: patrón amplio para cualquier ruta de Inmobay (CDN puede variar)
      if (!imagenes.length) {
        const inm: string[] = []
        for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+inmobay\.com\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi)) {
          const u = m[0].split('?')[0]
          if (!inm.includes(u)) inm.push(u)
        }
        if (inm.length) imagenes = inm.slice(0, 30)
      }
    }

    // ── 0e. inmuebles24: tipo/operación desde el slug de la URL ─────────────────
    // El título contiene el nombre de la colonia (p. ej. "Villas La Joya"), y
    // "villa" haría que mapTipo lo clasifique como casa. El slug es autoritativo:
    // "…-departamento-en-venta-villas-la-joya-<id>".
    if (/inmuebles24\.com/i.test(url)) {
      const sm = url.match(/\/clasificado\/([^/?#]+)/i)
      if (sm) {
        const words = sm[1].replace(/-/g, ' ')
        const tm = words.match(/\b(departamento|depto|casa|terreno|lote|local|oficina|bodega|nave|penthouse|loft|villa)\b/i)
        if (tm && !tipo) tipo = mapTipo(tm[1])
        const om = words.match(/\ben\s+(venta|renta|preventa|alquiler)\b/i)
        if (om && !operacion) operacion = mapOp(om[1])
      }
    }

    // ── 1. EasyBroker: JSON embebido HTML-encoded ─────────────────────────────
    // El HTML puede contener &quot;Property ID&quot; dentro de un atributo HTML.
    // Usamos un extractor con contador de profundidad para soportar JSON anidado.
    let ebData: Record<string, any> | null = null
    {
      const KEY = '&quot;Property ID&quot;'
      const keyIdx = html.indexOf(KEY)
      if (keyIdx !== -1) {
        // Buscar la llave de apertura { más cercana hacia atrás
        let braceStart = keyIdx
        while (braceStart > 0 && html[braceStart] !== '{') braceStart--
        if (html[braceStart] === '{') {
          // Decodificar entidades HTML en la subcadena
          const raw = html.slice(braceStart, Math.min(braceStart + 30000, html.length))
          const dec = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
          // Encontrar la llave de cierre } correspondiente contando profundidad
          let depth = 0, i = 0, inStr = false
          for (; i < dec.length; i++) {
            const c = dec[i]
            if (inStr) {
              if (c === '\\') { i++; continue }
              if (c === '"') inStr = false
            } else {
              if (c === '"') inStr = true
              else if (c === '{') depth++
              else if (c === '}') { depth--; if (depth === 0) break }
            }
          }
          if (depth === 0) {
            try { ebData = JSON.parse(dec.slice(0, i + 1)) } catch { /* continúa */ }
          }
        }
      }
    }
    const ebMatch = ebData !== null
    if (ebData) {
      try {
        const eb = ebData

        recamaras       = cap(parseNum(eb['Bedrooms']), 5)
        banos           = cap(parseNum(eb['Bathrooms'] ?? eb['Full Bathrooms']), 4)
        mediosBanos     = cap(parseNum(eb['Half Bathrooms'] ?? eb['Half Baths']), 2)
        estacionamientos = cap(parseNum(eb['Parking Spaces'] ?? eb['Parking']), 3)

        const constArea = parseNum(eb['Area M2'] ?? eb['Construction M2'] ?? eb['Constructed Area'])
        if (constArea) m2 = String(constArea)
        const lotArea = parseNum(eb['Lot M2'] ?? eb['Lot Size M2'] ?? eb['Land M2'])
        if (lotArea) m2Terreno = String(lotArea)

        // El precio puede venir como número o como objeto { amount, currency }
        const extractPrice = (v: any): number | null => {
          if (v == null) return null
          if (typeof v === 'object') return parseNum(v?.amount ?? v?.Amount)
          return parseNum(v)
        }
        const saleP = extractPrice(eb['Sale Price'] ?? eb['sale_price'])
        const rentP = extractPrice(eb['Rent Price'] ?? eb['rent_price'])
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
    // Se ejecuta también cuando ya hay una descripción MUY corta: en pincali/
    // EasyBroker el JSON-LD trae un resumen pobre ("Casa en condominio en X")
    // mientras el cuerpo (text-description) tiene la ficha real y más rica.
    if (!descripcion || descripcion.length < 80) {
      const descSelectors = [
        /<p[^>]+class="[^"]*text-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,                 // EasyBroker
        /<div[^>]+class="[^"]*listing-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,          // wpsight (gminmobiliaria)
        /<div[^>]+(?:id|class)="[^"]*(?:descripcion|description|property-description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      ]
      for (const sel of descSelectors) {
        const m = html.match(sel)
        if (m?.[1]) {
          const cand = htmlText(m[1])
          if (cand.length > 30 && cand.length > descripcion.length) { descripcion = cand; break }
        }
      }
    }

    // ── 4. Título ─────────────────────────────────────────────────────────────
    if (!titulo) {
      titulo = getMeta(html, 'og:title')
            || getMeta(html, 'twitter:title')
            || (html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '')
    }
    titulo = decodeEntities(titulo)
      .replace(/\s*[-|–·]\s*(easy\s*broker|easybroker|gm\s*agencia|gm\s*inmobiliaria|lamudi|inmobay|reval|inmuebles\s*24|inmuebles24).*/i, '')
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
    // Baños con medio en una sola cifra: "2½ Baños", "2 1/2 baños", "2.5 baños"
    // (común en constructoras como GP Vivienda) → 2 completos + 1 medio baño.
    {
      const mBanoMedio = dhtml.match(/(\d+)\s*(?:½|1\s*\/\s*2|[.,]5)\s*ba[ñn]os?/i)
      if (mBanoMedio) {
        if (banos === null)       banos       = cap(parseInt(mBanoMedio[1], 10), 4)
        if (mediosBanos === null) mediosBanos = 1
      }
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
    // Se busca sobre el texto visible, no sobre el HTML: así "construccion.svg"
    // (un ícono) ya no cuenta como la etiqueta "construcción".
    // El patrón "122 m² Constr." (valor ANTES de la etiqueta) se prueba primero,
    // porque con "122 m² Constr. 108 m² Terreno" el patrón inverso se saltaría al
    // 108 del terreno. La ventana entre número y etiqueta se deja corta a
    // propósito para que no cruce de una ficha a la otra.
    const sup = superficies(textoPlano(dhtml))
    if (!m2) {
      const sp = specInt('construccion', 'construida', 'superficie construida', 'sup construida', 'total construido', 'construido', 'm construccion')
      // Lamudi: <div class="area-value">306 m²</div>
      const lam = dhtml.match(/area-value["'][^>]*>\s*([\d,.]+)/i)
      if (sp != null) m2 = String(sp)
      else if (lam) m2 = stripThousands(lam[1])
      else if (sup.constr) m2 = stripThousands(sup.constr)
    }
    if (!m2Terreno) {
      const sp = specInt('terreno', 'superficie terreno', 'superficie del terreno', 'sup terreno', 'm terreno')
      // Lamudi: <span class="lot-area-value">251 m²</span>
      const lot = dhtml.match(/lot-area-value["'][^>]*>\s*([\d,.]+)/i)
      if (sp != null) m2Terreno = String(sp)
      else if (lot) m2Terreno = stripThousands(lot[1])
      else if (sup.terreno) m2Terreno = stripThousands(sup.terreno)
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
    // Skipped when already populated (e.g. by NocNok parser from pictureUrls)
    if (!imagenes.length) {
    const imgPatterns = [
      /https?:\/\/[^\s"'<>?]*tuhabi\.(?:mx|co)\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,     // TuHabi MX/CO
      /https?:\/\/[^\s"'<>?]*habi\.co\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,               // Habi (filial)
      /https?:\/\/assets\.easybroker\.com\/property_images\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/static\.tokkobroker\.com\/pictures\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,    // reval (Tokko)
      /https?:\/\/[^\s"'<>?]*inmobay\.com\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi, // inmobay (cualquier ruta)
      /https?:\/\/[^\s"'<>?]+\/wp-content\/uploads\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,        // WordPress (gminmobiliaria)
      /https?:\/\/[^\s"'<>?]+\.(?:cloudfront\.net|amazonaws\.com)\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      // Lamudi: URLs base64 SIN extensión (img.lamudi.com.mx/<token>)
      /https?:\/\/img\.lamudi\.com\.mx\/[^\s"'<>)]+/gi,
      // Firebase Storage (Sadasi, etc.): CON su query (alt=media&token=…) que es
      // obligatorio para cargar. &amp; incluido porque la URL viene HTML-escapada.
      /https?:\/\/firebasestorage\.googleapis\.com\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi,
    ]
    const rawImgs: string[] = []
    for (const pat of imgPatterns) {
      for (const m of html.matchAll(pat)) rawImgs.push(limpiarUrlImg(m[0]))
    }
    // Descarta logos, íconos, avatares y recortes (no son fotos de la propiedad).
    const junk = /(logo|icon|favicon|avatar|sprite|placeholder|cropped-|whatsapp-image-2021|-32x32|-150x150|-180x180|-192x192|-270x270)/i
    const limpiados = rawImgs.filter(u => !junk.test(u))
    // Dedup conservando la variante más grande de cada imagen.
    const best = new Map<string, { url: string; w: number }>()
    for (const u of limpiados) {
      let base = u
      let w = 999999
      const lam = u.match(/img\.lamudi\.com\.mx\/(.+)$/)
      if (lam) {
        // El token base64 codifica la imagen ("key") y el tamaño ("resize"):
        // deduplicamos por la imagen real y conservamos el ancho mayor.
        try {
          let tok = lam[1].replace(/-/g, '+').replace(/_/g, '/')
          while (tok.length % 4) tok += '='
          const j = JSON.parse(atob(tok))
          base = `lamudi:${j?.key ?? lam[1]}`
          w = Number(j?.edits?.resize?.width) || 0
        } catch { base = u; w = 999999 }
      } else {
        const m = u.match(/-(\d+)x(\d+)(\.(?:jpe?g|png|webp))$/i)
        w = m ? parseInt(m[1], 10) : 999999
        base = m ? u.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, '$1') : u
      }
      const cur = best.get(base)
      if (!cur || w > cur.w) best.set(base, { url: u, w })
    }
    imagenes = [...best.values()].map(v => v.url)
    } // end !imagenes.length block

    // ── 10a-eb. EasyBroker (pincali y portales EB): sólo la carpeta de ESTA
    // propiedad. Las fotos viven en
    //   assets.easybroker.com/property_images/<carpetaPropiedad>/<foto>/EB-XXXX.jpg
    // y la página incluye galerías de "propiedades similares" (otras carpetas).
    // Se conserva la carpeta del og:image/JSON-LD (la principal) o, si no se
    // puede leer, la carpeta que más fotos aporta.
    if (imagenes.some(u => /assets\.easybroker\.com\/property_images\//.test(u))) {
      const folderOf = (u: string) => u.match(/property_images\/(\d+)\//)?.[1] ?? ''
      let target = folderOf(getMeta(html, 'og:image') || getMeta(html, 'og:image:secure_url'))
      if (!target) {
        const count = new Map<string, number>()
        for (const u of imagenes) { const f = folderOf(u); if (f) count.set(f, (count.get(f) ?? 0) + 1) }
        let max = 0
        for (const [f, n] of count) if (n > max) { max = n; target = f }
      }
      if (target) {
        imagenes = imagenes.filter(u =>
          !/assets\.easybroker\.com\/property_images\//.test(u) || folderOf(u) === target)
      }
    }

    // ── 10a-navent. inmuebles24 / Navent: fotos del aviso en máxima resolución ─
    // Las fotos viven en img*.naventcdn.com/avisos/<carpeta>/<tamaño>/<id>.jpg.
    // La página trae la galería del aviso + miniaturas de "propiedades similares"
    // (otras carpetas). Se agrupa por carpeta y se toma la que MÁS fotos tiene
    // (la propiedad), reconstruyendo cada foto en 1200x1200 (la variante grande).
    if (imagenes.length < 3 && /naventcdn\.com\/avisos\//i.test(html)) {
      const porCarpeta = new Map<string, Set<string>>()
      for (const m of html.matchAll(/(https?:\/\/[a-z0-9.]*naventcdn\.com\/avisos\/[\d/]+?)\/\d+x\d+\/(\d+)\.(?:jpe?g|png|webp)/gi)) {
        const carpeta = m[1]
        if (!porCarpeta.has(carpeta)) porCarpeta.set(carpeta, new Set())
        porCarpeta.get(carpeta)!.add(m[2])
      }
      let mejor = ''
      let max = 0
      for (const [carpeta, ids] of porCarpeta) {
        if (ids.size > max) { max = ids.size; mejor = carpeta }
      }
      if (mejor && max >= 1) {
        imagenes = [...porCarpeta.get(mejor)!].map(id => `${mejor}/1200x1200/${id}.jpg`).slice(0, 40)
      }
    }

    // ── 10a-wix. Wix (static.wixstatic.com): fotos reales, sin íconos ni logos ─
    // Los sitios Wix sirven muchísimas variantes de static.wixstatic.com: íconos de
    // amenidades, logos, redes sociales y miniaturas borrosas. Filtramos a fotos de
    // contenido: media-id con hash largo (descarta íconos con nombre tipo
    // "football.png"/"facebook.png") que además aparezcan grandes (≥200px) o como
    // placeholder borroso de galería (blur_ = foto real que Wix carga en diferido).
    // Se reconstruye la URL original (sin el transform /v1/fill/…) para máxima calidad.
    if (imagenes.length < 3 && /static\.wixstatic\.com\/media\//i.test(html)) {
      const info = new Map<string, { w: number; blur: boolean }>()
      for (const m of html.matchAll(/https:\/\/static\.wixstatic\.com\/media\/[^"'\s)]+/gi)) {
        const u = m[0]
        const idm = u.match(/\/media\/([0-9a-f]{6,}_[0-9a-f]{16,}(?:~mv2)?\.(?:jpe?g|png|webp))/i)
        if (!idm) continue
        const id = idm[1]
        const wm = u.match(/[,/]w_(\d+)/)
        const w = wm ? parseInt(wm[1], 10) : 9999
        const blur = /[,/]blur_/.test(u)
        const cur = info.get(id) ?? { w: 0, blur: false }
        info.set(id, { w: Math.max(cur.w, w), blur: cur.blur || blur })
      }
      const wix = [...info.entries()]
        .filter(([, v]) => v.w >= 200 || v.blur)
        .map(([id]) => `https://static.wixstatic.com/media/${id}`)
      if (wix.length) imagenes = [...new Set([...imagenes, ...wix])].slice(0, 40)
    }

    // ── 10b. Fallback genérico: cualquier <img>/<source>, resolviendo rutas
    // relativas a absolutas. Cubre sitios propios de desarrolladoras que no usan
    // un CDN conocido (p. ej. procesadesarrollos.com.mx, con src="img/foto.webp").
    if (imagenes.length < 3) {
      const found: string[] = []
      const addImg = (raw: string) => {
        if (!raw) return
        const v = raw.trim()
        if (!v || v.startsWith('data:')) return
        try {
          const abs = new URL(decodeEntities(v), url).href
          // La extensión se valida en la RUTA (sin query); la URL final conserva
          // el query si lo necesita (Firebase/firmadas) vía limpiarUrlImg.
          if (/\.(jpe?g|png|webp)$/i.test(abs.split('?')[0])) {
            const final = limpiarUrlImg(abs)
            if (!found.includes(final)) found.push(final)
          }
        } catch { /* url inválida/relativa irresoluble */ }
      }
      // src / lazy-load attrs (toma la primera URL si viene un srcset)
      for (const m of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-original|data-lazy|data-srcset)=["']([^"']+)["']/gi)) {
        addImg(m[1].split(',')[0].trim().split(/\s+/)[0])
      }
      for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
        addImg(m[1].split(',')[0].trim().split(/\s+/)[0])
      }
      // Descarta logos, íconos y adornos; conserva fotos.
      const junkGen = /(logo|icon|favicon|avatar|sprite|placeholder|banner|header|footer|whatsapp|bg[-_]|background)/i
      const limpiadosGen = found.filter(u => !junkGen.test(u))
      if (limpiadosGen.length) {
        imagenes = [...new Set([...imagenes, ...limpiadosGen])].slice(0, 40)
      }
    }

    // ── 11. Fallbacks finales para tipo / operación / imágenes / zona ─────────
    if (!tipo) {
      tipo = mapTipo(titulo + ' ' + getMeta(html, 'og:title'))
    }
    // Sitios de desarrolladora (gpvivienda…) no dicen "casa" en el título ni en
    // og:title. Se decide por la palabra dominante del texto visible, exigiendo
    // ventaja clara para no clasificar mal un portal que menciona ambas.
    if (!tipo) {
      const t = textoPlano(dhtml).toLowerCase()
      const cuenta = (re: RegExp) => (t.match(re) ?? []).length
      const candidatos: [typeof tipo, number][] = [
        ['casa',          cuenta(/\bcasas?\b/g)],
        ['departamento',  cuenta(/\bdepartamentos?\b|\bdeptos?\b/g)],
        ['local',         cuenta(/\blocales?\b|\boficinas?\b|\bbodegas?\b/g)],
        ['terreno',       cuenta(/\bterrenos?\b|\blotes?\b/g)],
      ]
      candidatos.sort((a, b) => b[1] - a[1])
      const [mejor, nMejor] = candidatos[0]
      const nSegundo = candidatos[1][1]
      if (nMejor >= 3 && nMejor >= nSegundo * 3) tipo = mejor
    }
    if (!operacion) {
      const snippet = titulo + ' ' + getMeta(html, 'og:title') + ' ' + url + ' ' + html.slice(0, 3000)
      operacion = /\brenta\b|alquiler/i.test(snippet) ? 'renta' : 'venta'
    }
    if (!imagenes.length) {
      const og = getMeta(html, 'og:image') || getMeta(html, 'og:image:secure_url')
      if (og) imagenes = [limpiarUrlImg(og)]
    }
    if (!zona) {
      const haystack = (direccion + ' ' + titulo + ' ' + url).toLowerCase()
      if (/quer[eé]taro|qro\b/.test(haystack))               zona = 'queretaro'
      else if (/monterrey|nuevo\s*le[oó]n|\bmty\b/.test(haystack)) zona = 'monterrey'
      else if (/puebla/.test(haystack))                  zona = 'puebla'
    }

    // ── Sadasi (sadasi.com) ────────────────────────────────────────────────
    // Trae los m² en un JSON de la página y la ubicación/modelo en la ruta del
    // URL: /<ciudad-estado>/<desarrollo>/<modelo>. Ej:
    // /aguascalientes-aguascalientes/villas-de-montecassino/milan
    let modeloHint = ''
    try {
      if (/(^|\.)sadasi\.com$/i.test(new URL(url).hostname)) {
        const segs = new URL(url).pathname.split('/').filter(Boolean)
        if (segs.length >= 2 && !direccion) {
          const desarrollo = tituloModelo(segs[1].replace(/-/g, ' '))
          const ubic = [...new Set(tituloModelo(segs[0].replace(/-/g, ' ')).split(' '))].join(' ')
          direccion = `${desarrollo}, ${ubic}`
        }
        // La página embebe VARIOS modelos del desarrollo; hay que tomar los datos
        // del modelo EXACTO de esta URL (por slug/título), no del primero que
        // aparezca — si no, salían recámaras/m² de otro modelo (o faltaban).
        const slugMod = (segs[2] ?? '').replace(/-/g, ' ').toLowerCase().trim()
        const tituloNorm = (titulo ?? '').toLowerCase().trim()
        let mejor: any = null
        for (const om of html.matchAll(/\{[^{}]*"model_name"[^{}]*\}/g)) {
          try {
            const obj = JSON.parse(decodeEntities(om[0]).replace(/\\u0026/gi, '&').replace(/\\\//g, '/'))
            const nm = String(obj.model_name ?? obj.name ?? '').toLowerCase().trim()
            if (!nm) continue
            if (nm === slugMod || nm === tituloNorm) { mejor = obj; break }        // match exacto
            if (!mejor && (slugMod.includes(nm) || nm.includes(slugMod))) mejor = obj // parcial
          } catch { /* json malformado */ }
        }
        if (mejor) {
          if (mejor.number_of_bedrooms != null)  recamaras = parseInt(String(mejor.number_of_bedrooms), 10) || recamaras
          if (mejor.number_of_bathrooms != null) banos = Math.floor(parseFloat(String(mejor.number_of_bathrooms))) || banos
          if (mejor.parking_spaces != null)      estacionamientos = parseInt(String(mejor.parking_spaces), 10) || estacionamientos
          if (mejor.square_meters_of_construction) m2 = String(Math.round(parseFloat(String(mejor.square_meters_of_construction))))
          if (mejor.square_meters_of_land)         m2Terreno = String(Math.round(parseFloat(String(mejor.square_meters_of_land))))
        }
        // Fallback (sin match): tomar el primer valor del HTML, como con m².
        if (!m2)       { const mc = html.match(/square_meters_of_construction"\s*:\s*([\d.]+)/i); if (mc) m2 = String(Math.round(parseFloat(mc[1]))) }
        if (!m2Terreno){ const ml = html.match(/square_meters_of_land"\s*:\s*([\d.]+)/i);         if (ml) m2Terreno = String(Math.round(parseFloat(ml[1]))) }
        if (recamaras == null)       { const nb = html.match(/number_of_bedrooms"\s*:\s*"?(\d+)/i);        if (nb) recamaras = parseInt(nb[1], 10) || null }
        // Sadasi describe los deptos como "X habitaciones" (no "recámaras"); tomar
        // el número de la descripción del modelo. Ej: "Departamento de 2 habitaciones".
        if (recamaras == null)       { const rm = ((descripcion || '') + ' ' + html).match(/(\d+)\s*(?:rec[aá]maras?|habitaci[oó]n(?:es)?)/i); if (rm) recamaras = parseInt(rm[1], 10) || null }
        // FUENTE AUTORITATIVA de Sadasi: array de features del modelo, ej.
        // {"feature":"Recamaras","quantity":3}, {"feature":"Baños","quantity":3.5}
        // (3.5 = 3 baños + 1 medio baño), {"feature":"Espacios para auto","quantity":2}.
        // Sobrescribe lo demás porque describe EXACTAMENTE este modelo (la descripción
        // a veces trae el número como palabra "tres" y otros "N recámaras" son de otro modelo).
        for (const fm of html.matchAll(/"feature"\s*:\s*"([^"]+)"\s*,\s*"quantity"\s*:\s*([\d.]+)/g)) {
          const fn = fm[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          const q = parseFloat(fm[2])
          if (!isFinite(q) || q <= 0) continue
          if (/recamara|habitacion|dormitor/.test(fn)) recamaras = Math.round(q)
          else if (/bano/.test(fn)) { banos = Math.floor(q); if (q - Math.floor(q) >= 0.5) mediosBanos = 1 }
          else if (/espacio|auto|estacionamiento|cajon|cochera|garage/.test(fn)) estacionamientos = Math.round(q)
          else if (/construccion/.test(fn)) m2 = String(Math.round(q))
          else if (/terreno/.test(fn)) m2Terreno = String(Math.round(q))
        }
        if (banos == null)           { const nba = html.match(/number_of_bathrooms"\s*:\s*"?([\d.]+)/i);   if (nba) banos = Math.floor(parseFloat(nba[1])) || null }
        if (estacionamientos == null){ const np = html.match(/parking_spaces"\s*:\s*"?(\d+)/i);            if (np) estacionamientos = parseInt(np[1], 10) || null }

        // Sadasi titula la página con el nombre del modelo (ej. "Milán").
        if (titulo && titulo.length <= 30 && !/\s(en|de)\s/i.test(titulo)) modeloHint = titulo.trim()
        // Tipo: Sadasi vende DEPARTAMENTOS como "planta baja/alta", "roof top",
        // loft, penthouse; y CASAS como "Casa modelo". La ruta/título lo delata.
        const rutaTit = (new URL(url).pathname + ' ' + (titulo ?? '')).toLowerCase()
        if (/planta\s*(baja|alta)|departamento|\bdepto\b|\bloft\b|penthouse|roof\s*top|roof\s*garden/.test(rutaTit)) tipo = 'departamento'
        else if (!tipo && /\bcasa\b/.test(rutaTit)) tipo = 'casa'
      }
    } catch { /* URL inválida */ }

    const modelo = detectarModelo(html, titulo, url) || modeloHint

    // Enriquecer la ubicación con el JSON estructurado de WordPress (GP Vivienda,
    // etc.). Si trae estado y la dirección no lo menciona, se arma una dirección
    // limpia "proyecto, municipio, estado" para que el estado_mx salga correcto.
    const info = parseInfoJsonWp(html)
    if (info?.estado) {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (!direccion || !norm(direccion).includes(norm(info.estado))) {
        direccion = [info.proyecto, info.zona, info.estado].filter(Boolean).join(', ')
      }
    }

    // ── casasplatino.com — specs autoritativos del modelo principal ───────────
    // El HTML genérico saca bien título/precio/imágenes, pero los specs viven en
    // un bloque "Otras características" ("2 Habitaciones", "2 Lugares de
    // estacionamiento") y en <b class="terrain"> (Construcción / Terreno, con el
    // número DESPUÉS del ícono SVG). Sobrescribimos aquí con esos valores reales.
    try {
      if (/(^|\.)casasplatino\.com$/i.test(new URL(url).hostname)) {
        const carM = dhtml.match(/Otras\s+características([\s\S]*?)(?:<span class="price"|<\/section)/i)
        const carTxt = carM ? carM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : ''
        if (carTxt) {
          const rec = carTxt.match(/(\d+)\s*(?:Habitacion|Rec[aá]mara|Dormitor)/i)
          recamaras = rec ? cap(parseInt(rec[1], 10), 8) : null
          const est = carTxt.match(/(\d+)\s*Lugares?\s+de\s+estacionamiento/i)
          estacionamientos = est ? cap(parseInt(est[1], 10), 5) : estacionamientos
          // El sitio no siempre publica baños; si no está, no lo inventamos.
          const ba = carTxt.match(/(\d+(?:\.\d+)?)\s*Ba[nñ]os?/i)
          if (ba) { const bv = parseFloat(ba[1]); banos = Math.floor(bv); mediosBanos = (bv - Math.floor(bv) >= 0.5) ? 1 : null }
          else { banos = null; mediosBanos = null }
        }
        // Construcción / Terreno: primer par (= modelo principal); el número va
        // después del <svg> del ícono, así que lo quitamos antes de leerlo.
        m2 = ''; m2Terreno = ''
        for (const tb of dhtml.matchAll(/<b class="terrain">([\s\S]*?)<\/b>/gi)) {
          const inner = tb[1].replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ')
          const numM = inner.match(/([\d.]+)\s*(?:㎡|m²|m2)/i)
          if (!numM) continue
          const val = String(Math.round(parseFloat(numM[1])))
          if (/construcci/i.test(inner) && !m2) m2 = val
          else if (/terreno/i.test(inner) && !m2Terreno) m2Terreno = val
        }
        // Tipo: casa (tiene terreno) salvo que el modelo se anuncie como depto.
        tipo = /departamento|\bdepto\b|planta\s*(?:baja|alta)|penthouse|\bloft\b/i.test(`${titulo} ${url}`)
          ? 'departamento' : 'casa'
        if (!operacion) operacion = 'venta'
        // Dirección: nombre del desarrollo desde el breadcrumb (posición 2). No
        // fijamos ciudad/estado porque Casas Platino vende en varias plazas.
        if (!direccion) {
          const bc = html.match(/"position"\s*:\s*2\s*,\s*"name"\s*:\s*"([^"]+)"/)
          if (bc) direccion = decodeEntities(bc[1])
        }
      }
    } catch { /* URL inválida */ }

    return new Response(JSON.stringify({
      titulo, descripcion, precio, direccion, zona, modelo,
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
