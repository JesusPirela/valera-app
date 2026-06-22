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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

// Descarga el HTML. Algunos portales (p.ej. Inmobay) sirven una cadena de
// certificados incompleta que el runtime de Deno rechaza ("UnknownIssuer"),
// o bloquean por IP/bot. En esos casos se reintenta vía un proxy de lectura
// que descarga el contenido del lado del servidor y lo devuelve crudo.
async function fetchHtml(url: string): Promise<string> {
  try {
    const opts: any = { headers: BROWSER_HEADERS }
    if (extraCaClient) opts.client = extraCaClient
    const res = await fetch(url, opts)
    if (res.ok) return await res.text()
    // 403/429/5xx: intentar proxy antes de rendirse.
  } catch (_) {
    // Error de red/TLS: caer al proxy.
  }
  try {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const res2 = await fetch(proxy, { headers: BROWSER_HEADERS })
    if (res2.ok) {
      const t = await res2.text()
      if (t && t.length > 200) return t
    }
  } catch (_) { /* el proxy también falló */ }
  throw new Error('No se pudo acceder a la página. El sitio puede estar bloqueando accesos automáticos o tener un certificado de seguridad incompleto. Copia la ficha y pégala manualmente en el campo de descripción.')
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { url } = await req.json()
    if (!url || !/^https?:\/\//.test(url)) throw new Error('URL inválida')

    const html = await fetchHtml(url)
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

    // ── 0. NocNok platform (realtydreamsmexico.com y similares) ──────────────
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
    // Skipped when already populated (e.g. by NocNok parser from pictureUrls)
    if (!imagenes.length) {
    const imgPatterns = [
      /https?:\/\/assets\.easybroker\.com\/property_images\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/static\.tokkobroker\.com\/pictures\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,    // reval (Tokko)
      /https?:\/\/[^\s"'<>?]*inmobay\.com\/upload\/inmuebles\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi, // inmobay
      /https?:\/\/[^\s"'<>?]+\/wp-content\/uploads\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,        // WordPress (gminmobiliaria)
      /https?:\/\/[^\s"'<>?]+\.(?:cloudfront\.net|amazonaws\.com)\/[^\s"'<>?]+\.(?:jpg|jpeg|png|webp)/gi,
      // Lamudi: URLs base64 SIN extensión (img.lamudi.com.mx/<token>)
      /https?:\/\/img\.lamudi\.com\.mx\/[^\s"'<>)]+/gi,
    ]
    const rawImgs: string[] = []
    for (const pat of imgPatterns) {
      for (const m of html.matchAll(pat)) rawImgs.push(m[0].split('?')[0])
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
