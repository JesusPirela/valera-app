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
// La COMA es lo que marca que el usuario está buscando un precio. Sin coma,
// "004" o "2500" siguen buscándose como código/dirección/título, que es lo que
// la gente teclea el 99% del tiempo.
//
//   "2,5"                   → todo lo que EMPIECE con 25 (2,500,000, 2,550,000…)
//   "2,500,000"             → ese precio (y lo que empiece igual)
//   "1,000,000 - 2,000,000" → ese rango
//   "> 2,000,000"           → de ahí para arriba
//   "< 2,000,000"           → de ahí para abajo
//
// El caso normal es por PREFIJO: la gente escribe de a poco ("2,", "2,5",
// "2,50"…) y ve cómo se acota. Antes se exigía el número exacto completo, así
// que "2,5" se leía como 25 y no salía nada.
//
// parsearPrecioBusqueda devuelve un predicado (precio → coincide) o null si el
// texto no es una búsqueda de precio; en ese caso el buscador sigue como antes.
export type PredicadoPrecio = (precio: number | null | undefined) => boolean

function aNumero(s: string): number | null {
  const limpio = s.replace(/[$\s,]/g, '')
  if (!/^\d+$/.test(limpio)) return null
  const n = parseInt(limpio, 10)
  return Number.isFinite(n) ? n : null
}

function entre(min: number | null, max: number | null): PredicadoPrecio {
  return (precio) => precio != null &&
    (min == null || precio >= min) &&
    (max == null || precio <= max)
}

export function parsearPrecioBusqueda(texto: string): PredicadoPrecio | null {
  const q = texto.trim()
  if (!q.includes(',')) return null

  // Rango: "1,000,000 - 2,000,000"
  const rango = q.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (rango) {
    const a = aNumero(rango[1])
    const b = aNumero(rango[2])
    if (a == null || b == null) return null
    if (b >= a) return entre(a, b)

    // Aquí el de la derecha es MENOR que el de la izquierda, y eso casi
    // siempre es que lo están escribiendo todavía.
    //
    // El problema que esto arregla: al teclear "1,000,000 - 2,000,000" se pasa
    // por "1,000,000 - 2", "- 2,0", "- 2,00"… y en todos esos pasos el número
    // de la derecha es chiquito. Dándole la vuelta al rango, la búsqueda se
    // convertía en "de $2 a $1,000,000" y la lista se llenaba de rentas de
    // $12,000 justo mientras la persona escribía. Parecía que la app se
    // descomponía.
    //
    // Si el de la derecha trae MENOS dígitos, es que falta tecleo: se aplica
    // nada más el mínimo, que es una respuesta razonable a medio escribir y
    // se va cerrando sola al terminar. Si trae los mismos dígitos o más, sí
    // es un rango escrito al revés y ahí se voltea.
    const faltaTecleo = String(b).length < String(a).length
    return faltaTecleo ? entre(a, null) : entre(b, a)
  }

  // Umbral: "> 2,000,000" o "< 2,000,000"
  const acotado = q.match(/^([<>])\s*(.+)$/)
  if (acotado) {
    const n = aNumero(acotado[2])
    if (n == null) return null
    return acotado[1] === '>' ? entre(n, null) : entre(null, n)
  }

  // Prefijo: los dígitos tecleados deben ser el inicio del precio.
  // "2,5" → dígitos "25" → coincide 2,500,000 ("2500000" empieza con "25").
  const digitos = q.replace(/[$\s,]/g, '')
  if (!/^\d+$/.test(digitos)) return null
  return (precio) => precio != null && String(precio).startsWith(digitos)
}
