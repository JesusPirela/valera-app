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
//   "2,500,000"             → ese precio exacto
//   "1,000,000 - 2,000,000" → ese rango
//   "> 2,000,000"           → de ahí para arriba
//   "< 2,000,000"           → de ahí para abajo
//
// Devuelve null si el texto no es una búsqueda de precio, y entonces el
// buscador sigue funcionando exactamente como antes.
export type RangoPrecio = { min: number | null; max: number | null }

function aNumero(s: string): number | null {
  const limpio = s.replace(/[$\s,]/g, '')
  if (!/^\d+$/.test(limpio)) return null
  const n = parseInt(limpio, 10)
  return Number.isFinite(n) ? n : null
}

export function parsearPrecioBusqueda(texto: string): RangoPrecio | null {
  const q = texto.trim()
  if (!q.includes(',')) return null

  const rango = q.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (rango) {
    const min = aNumero(rango[1])
    const max = aNumero(rango[2])
    if (min == null || max == null) return null
    return min <= max ? { min, max } : { min: max, max: min }
  }

  const acotado = q.match(/^([<>])\s*(.+)$/)
  if (acotado) {
    const n = aNumero(acotado[2])
    if (n == null) return null
    return acotado[1] === '>' ? { min: n, max: null } : { min: null, max: n }
  }

  const exacto = aNumero(q)
  if (exacto == null) return null
  return { min: exacto, max: exacto }
}
