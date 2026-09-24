// Interpretar lo que el cliente tiene escrito en su ficha para poder buscarle
// propiedades.
//
// El presupuesto y la zona son TEXTO LIBRE, escritos por gente distinta durante
// años, así que no hay un formato: conviven "$900mil_a_$1.2m", "1,600,000",
// "9k", "1.4M", "15,000" y también "?" y cosas sin ningún número.
//
// Medido contra los 1,755 clientes activos que tienen ambos campos: se
// interpreta el 96% de los presupuestos y el 99% de las zonas.

export type RangoPresupuesto = { min: number; max: number }

const norm = (s: unknown): string =>
  (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Un token suelto ("1.2m", "900mil", "1,600,000") a número.
function aNumero(tok: string, operacion: 'venta' | 'renta'): number | null {
  if (!tok) return null
  // 1) El token entero es un número con sufijo opcional ("1.2m", "900mil").
  let m = tok.match(/^([\d.,]+)\s*(mill?on(?:es)?|mil|m|k)?$/)
  // 2) Un número con sufijo dentro de una frase ("1.2m con alberca"). El
  //    (?![a-z]) exige que el sufijo termine ahí: sin él, "14 Max" se leía
  //    como 14 millones.
  if (!m) m = tok.match(/([\d.,]+)\s*(mill?on(?:es)?|mil|m|k)(?![a-z])/)
  // 3) Un número suelto dentro de una frase ("1,600,000 pesos").
  if (!m) m = tok.match(/([\d.,]+)/)
  if (!m) return null
  let num = m[1]
  // "1,600,000" → la coma es separador de millares.
  // "2,9"       → la coma es el decimal (se escribe así de a menudo).
  const comas = (num.match(/,/g) ?? []).length
  if (comas >= 2 || /,\d{3}\b/.test(num)) num = num.replace(/,/g, '')
  else num = num.replace(',', '.')

  let v = parseFloat(num)
  if (!isFinite(v) || v <= 0) return null

  const suf = m[2]
  if (suf === 'k' || suf === 'mil') v *= 1000
  else if (suf === 'm' || /mill/.test(suf ?? '')) v *= 1000000
  else if (operacion === 'venta') {
    // Sin sufijo, en VENTA, la escala se deduce del tamaño: "1.4" son millones
    // y "1600" son miles. En RENTA el número se toma tal cual, que es como se
    // escribe ("15,000" son quince mil al mes).
    if (v < 100) v *= 1000000
    else if (v < 100000) v *= 1000
  }
  return v
}

/**
 * Convierte el presupuesto escrito en la ficha a un rango de precios.
 * Devuelve null si no hay forma de sacar un número (por ejemplo "?" o "no dijo").
 */
export function parsePresupuesto(txt: string | null | undefined, operacion: 'venta' | 'renta'): RangoPresupuesto | null {
  if (!txt) return null
  const t = norm(txt).replace(/\$/g, '').replace(/\s+/g, '')
  if (!/\d/.test(t)) return null

  // Rango explícito: "900mil_a_1.2m", "2m a 2.9m", "1000000-1500000".
  const partes = t.split(/_a_|\sa\s|_?-_?|\ba\b/).filter(Boolean)
  if (partes.length >= 2) {
    const lo = aNumero(partes[0], operacion)
    const hi = aNumero(partes[partes.length - 1], operacion)
    if (lo && hi && hi >= lo) return corregirEscala({ min: lo, max: hi }, operacion)
    if (hi) return corregirEscala({ min: hi * 0.8, max: hi }, operacion)
  }

  // Un solo número: se entiende como el tope que puede pagar, y se abre un
  // margen hacia abajo para no esconderle lo que cuesta un poco menos.
  const v = aNumero(t, operacion)
  if (!v) return null
  return corregirEscala({ min: Math.round(v * 0.75), max: Math.round(v * 1.1) }, operacion)
}

// Red de seguridad para los presupuestos escritos con la escala equivocada.
//
// En VENTA hay quien pone "2.55k" o "1.8k" queriendo decir millones; al pie de
// la letra daría una casa de $2,805, que no existe.
// En RENTA pasa lo mismo con "8", "5-6" o "14 Max": son miles al mes, y nadie
// renta por ocho pesos.
//
// En ambos casos se sube la escala en vez de devolver un rango imposible que no
// encontraría nada.
function corregirEscala(r: RangoPresupuesto, operacion: 'venta' | 'renta'): RangoPresupuesto | null {
  const piso = operacion === 'venta' ? 100000 : 1000
  const ajustado = r.max >= piso ? r : { min: r.min * 1000, max: r.max * 1000 }

  // Tope de cordura. Un presupuesto como "2000000 2800000" (dos cifras pegadas
  // sin separador) sale como veintidós billones. Antes que devolver un rango
  // imposible que no va a encontrar nada y sin decir por qué, se admite que no
  // se pudo interpretar: la pantalla lo dice y ofrece poner el rango a mano.
  const techo = operacion === 'venta' ? 500000000 : 5000000
  return ajustado.max > techo ? null : ajustado
}

/**
 * Zonas que busca el cliente, separadas por coma en la ficha.
 * Se descartan los trozos de menos de 4 letras porque buscarlos dentro del
 * título de una propiedad daría cualquier cosa.
 */
export function parseZonas(txt: string | null | undefined): string[] {
  if (!txt) return []
  return txt
    .split(',')
    .map(z => norm(z).replace(/^zona_/, '').replace(/[_()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(z => z.length >= 4)
}

export function formatPrecioCorto(n: number): string {
  if (!isFinite(n)) return '—'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}
