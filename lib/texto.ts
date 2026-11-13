// Utilidades de texto para búsqueda tolerante.

// Normaliza una cadena para comparaciones de búsqueda: minúsculas y sin
// acentos/diacríticos, de modo que "Querétaro" coincida con "queretaro".
export function normalizar(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// ── Búsqueda por precio ─────────────────────────────────────────────────────
//
// Antes, la COMA era lo único que encendía la búsqueda por precio. Medido en
// la app: escribir "2500000" daba **0 resultados**, y "2,500,000" daba 7.
// Quien teclea un monto sin comas —que es como lo teclea casi todo el mundo—
// veía la lista vacía y parecía que no había nada en ese precio. Eso es justo
// lo que reportaron los usuarios.
//
// Ahora se reconoce un monto con o sin comas:
//
//   "2,5" / "2500000"       → todo lo que EMPIECE con esos dígitos
//   "2.5m" / "2.5 millones" → 2,500,000
//   "850k" / "850 mil"      → 850,000
//   "1,000,000 - 2,000,000" → ese rango
//   "> 2,000,000"           → de ahí para arriba
//   "< 2,000,000"           → de ahí para abajo
//
// Un número corto NO se toma como precio: "4" y "004" son códigos (VR-004).
// Desde 4 dígitos sí, porque el precio más barato del catálogo tiene 4.
//
// Y el buscador SUMA los dos resultados en vez de elegir uno, así que "1701"
// sigue encontrando VR-1701 aunque también sea un prefijo de precio válido.
// Medido sobre el catálogo: un prefijo de 4 dígitos choca con entre 0 y 21
// propiedades, así que sumarlos no inunda la búsqueda por código.
//
// parsearPrecioBusqueda devuelve un predicado (precio → coincide) o null si el
// texto no es una búsqueda de precio; en ese caso el buscador sigue como antes.
export type PredicadoPrecio = (precio: number | null | undefined) => boolean

/** Dígitos mínimos para que un número sin comas cuente como precio y no como código. */
const DIGITOS_MINIMOS_PRECIO = 4

function aNumero(s: string): number | null {
  const limpio = s.replace(/[$\s,]/g, '')
  if (!/^\d+$/.test(limpio)) return null
  const n = parseInt(limpio, 10)
  return Number.isFinite(n) ? n : null
}

/** "2.5m", "850 mil", "1.2 mdp" → el monto en pesos. null si no es eso. */
function conSufijo(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/[$\s]/g, '')
    .match(/^([\d.]+)(mdp|millones|millon|mil|m|k)$/)
  if (!m) return null
  const base = parseFloat(m[1])
  if (!Number.isFinite(base) || base <= 0) return null
  const factor = m[2] === 'k' || m[2] === 'mil' ? 1_000 : 1_000_000
  return Math.round(base * factor)
}

/** Los dígitos tecleados deben ser el INICIO del precio: "25" → 2,500,000. */
const porPrefijo = (digitos: string): PredicadoPrecio =>
  (precio) => precio != null && String(precio).startsWith(digitos)

function entre(min: number | null, max: number | null): PredicadoPrecio {
  return (precio) => precio != null &&
    (min == null || precio >= min) &&
    (max == null || precio <= max)
}

export function parsearPrecioBusqueda(texto: string): PredicadoPrecio | null {
  const q = texto.trim()
  if (!q) return null

  // Rango: "1,000,000 - 2,000,000". Si los lados no son números NO se corta
  // aquí: "roof-garden" también cae en este patrón y tiene que seguir de largo.
  const rango = q.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (rango) {
    const a = aNumero(rango[1]) ?? conSufijo(rango[1])
    const b = aNumero(rango[2]) ?? conSufijo(rango[2])
    if (a != null && b != null) {
      if (b >= a) return entre(a, b)

      // Aquí el de la derecha es MENOR que el de la izquierda, y eso casi
      // siempre es que lo están escribiendo todavía.
      //
      // El problema que esto arregla: al teclear "1,000,000 - 2,000,000" se
      // pasa por "1,000,000 - 2", "- 2,0", "- 2,00"… y en todos esos pasos el
      // número de la derecha es chiquito. Dándole la vuelta al rango, la
      // búsqueda se convertía en "de $2 a $1,000,000" y la lista se llenaba de
      // rentas de $12,000 justo mientras la persona escribía. Parecía que la
      // app se descomponía.
      //
      // Si el de la derecha trae MENOS dígitos, es que falta tecleo: se aplica
      // nada más el mínimo, que es una respuesta razonable a medio escribir y
      // se va cerrando sola al terminar. Si trae los mismos dígitos o más, sí
      // es un rango escrito al revés y ahí se voltea.
      const faltaTecleo = String(b).length < String(a).length
      return faltaTecleo ? entre(a, null) : entre(b, a)
    }
  }

  // Umbral: "> 2,000,000" o "< 2,000,000"
  const acotado = q.match(/^([<>])\s*(.+)$/)
  if (acotado) {
    const n = aNumero(acotado[2]) ?? conSufijo(acotado[2])
    if (n == null) return null
    return acotado[1] === '>' ? entre(n, null) : entre(null, n)
  }

  // Con sufijo: "2.5m", "850 mil", "1.2 mdp".
  const sufijo = conSufijo(q)
  if (sufijo != null) return porPrefijo(String(sufijo))

  // Dígitos pelones, con o sin comas y con o sin "$".
  const digitos = q.replace(/[$\s,]/g, '')
  if (!/^\d+$/.test(digitos)) return null
  // Con coma la intención ya es clara aunque sean pocos dígitos ("2,5"). Sin
  // coma hacen falta 4, para no pisar los códigos cortos ("4" es VR-004).
  if (!q.includes(',') && digitos.length < DIGITOS_MINIMOS_PRECIO) return null
  return porPrefijo(digitos)
}
