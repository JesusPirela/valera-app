// Leer un link de Google Maps y sacarle la ubicación.
//
// POR QUÉ
//
// Hasta ahora la única forma de fijar el punto en el mapa era escribir la
// dirección y que el buscador la encontrara. Cuando no la encuentra —un
// fraccionamiento nuevo, una calle sin nombre, un desarrollo que todavía no
// está en el mapa— no había manera, y la propiedad se guardaba sin punto.
//
// Pero el punto SÍ lo tiene quien fue a verla: su teléfono le da un link de
// Google Maps con las coordenadas exactas. Pegarlo es el camino corto.
//
// QUÉ HACE Y QUÉ NO
//
// Saca las coordenadas y, si el link las trae, el nombre del lugar. El nombre
// se PROPONE, no se impone: quien publica lo puede reescribir, que es justo
// lo que se pidió ("yo le pueda poner el nombre"). Y nunca inventa: si el
// link no trae coordenadas, devuelve null y se dice en pantalla.

export type UbicacionMaps = {
  lat: number
  lng: number
  /** El nombre del lugar que venía en el link, si traía. */
  nombre: string | null
}

/** Los dominios de Google Maps, incluidos los de cada país (google.com.mx). */
const DOMINIOS = /^https?:\/\/([a-z0-9-]+\.)*(google\.[a-z.]{2,6}|goo\.gl|maps\.app\.goo\.gl|g\.co)\//i

/**
 * Los links CORTOS no traen las coordenadas: son un identificador que hay que
 * canjear siguiendo la redirección, y eso no se puede hacer desde el navegador
 * (el otro dominio no da permiso). Por eso se resuelven en el servidor.
 */
const CORTOS = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i

export function esLinkMaps(texto: string): boolean {
  const t = (texto ?? '').trim()
  if (!DOMINIOS.test(t)) return false
  return /goo\.gl|g\.co|\/maps|maps\.google/i.test(t)
}

export function esLinkCortoMaps(texto: string): boolean {
  return CORTOS.test((texto ?? '').trim())
}

/** Coordenada válida: dentro del planeta y distinta del (0,0) del Atlántico. */
function valido(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false
  // El (0,0) es lo que sale cuando un link viene roto, no una propiedad.
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false
  return true
}

/** El nombre del lugar, tal y como lo escribe Google en la ruta del link. */
function nombreDelLink(t: string): string | null {
  const m = t.match(/\/maps\/place\/([^/@?]+)/i)
  if (!m) return null
  let n: string
  try { n = decodeURIComponent(m[1].replace(/\+/g, ' ')) } catch { n = m[1].replace(/\+/g, ' ') }
  n = n.replace(/\s+/g, ' ').trim()
  // Cuando el "lugar" son las propias coordenadas, Google pone algo como
  // "20.58,-100.38" o "20°35'19.2\"N": eso no es un nombre.
  if (!n || /^[-\d.,°'"\sNSEWO]+$/i.test(n)) return null
  return n
}

/**
 * Las coordenadas de un link de Google Maps (o de un texto con coordenadas).
 *
 * El orden importa y está medido contra links reales:
 *
 *  1. `!3d<lat>!4d<lng>` es el PUNTO del lugar. Es lo más exacto que trae el
 *     link y por eso va primero.
 *  2. `@<lat>,<lng>` es dónde estaba la CÁMARA cuando se compartió. Suele
 *     coincidir, pero si arrastraste el mapa antes de compartir, no.
 *  3. `?q=` / `?ll=` / `?query=` es la forma vieja y la de los links armados a
 *     mano.
 *  4. Un texto pegado con las dos coordenadas a secas ("20.5888, -100.3899"),
 *     que es lo que sale al copiar el punto en la app del teléfono.
 */
export function parsearLinkMaps(texto: string): UbicacionMaps | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  const nombre = nombreDelLink(t)

  const intentos: Array<RegExp> = [
    /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&](?:q|query|ll|center|destination|daddr|sll)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i,
  ]
  for (const re of intentos) {
    const m = t.match(re)
    if (!m) continue
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    if (valido(lat, lng)) return { lat, lng, nombre }
  }

  // Coordenadas sueltas: solo si el texto es ESO y nada más, para no
  // confundirlas con un precio o unos metros escritos en una dirección.
  const solo = t.match(/^\(?\s*(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*\)?$/)
  if (solo) {
    const lat = parseFloat(solo[1])
    const lng = parseFloat(solo[2])
    if (valido(lat, lng)) return { lat, lng, nombre: null }
  }
  return null
}

/**
 * El link de Maps que haya DENTRO de un texto.
 *
 * Pegar no siempre reemplaza: si el campo ya decía "Casa en Juriquilla" y se
 * pega el link al final, queda todo junto. Así se puede sacar el link y
 * quedarse con lo demás como nombre, que es justo lo que la persona quería
 * escribir.
 */
export function extraerLinkMaps(texto: string): { link: string; resto: string } | null {
  const t = texto ?? ''
  const m = t.match(/https?:\/\/[^\s]+/i)
  if (!m || !esLinkMaps(m[0])) return null
  const link = m[0].replace(/[),.]+$/, '')
  const resto = (t.slice(0, m.index ?? 0) + t.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim()
  return { link, resto }
}
