// Los estados de seguimiento de una cita de venta. UNA sola lista.
//
// Antes cada pantalla armaba la suya a partir del tablero del asesor y le
// añadía los que le faltaban, y así acabaron conviviendo tres formas de decir
// "realizada" y cuatro de decir "se cayó". El filtro de la columna enseñaba la
// misma cosa dos y tres veces.
//
// Estos nombres son EXACTAMENTE los que la base deja guardar: hay un
// disparador (estado_seguimiento_canonico) que normaliza cualquier variante
// que llegue, venga de donde venga. Si se cambia una etiqueta aquí, hay que
// cambiarla también allá o la base la va a corregir de vuelta.
export type EstadoCitaVenta = {
  label: string
  color: string
  emoji: string
}

export const ESTADOS_CITA_VENTA: EstadoCitaVenta[] = [
  { label: 'Por atender',                   color: '#16a34a', emoji: '🟢' },
  { label: 'Realizada',                     color: '#0d9488', emoji: '✅' },
  { label: 'Buscar más opciones',           color: '#ca8a04', emoji: '🔎' },
  // NO es rojo, y es a propósito.
  //
  // Hasta el 25/nov/2026 era #dc2626: EXACTAMENTE el mismo rojo que 'No
  // responde el cliente' (ΔE2000 = 0.0, el mismo color) y vecino del rojo de
  // 'Descartado'. O sea: el estado más caliente —el cliente a punto de
  // cerrar— se pintaba igual que los dos que significan que ya no va a pasar
  // nada, y en la lista se leía como una cita perdida.
  //
  // El cian se eligió barriendo la rueda de color entera con las dos listas
  // que se pintan juntas en la misma tarjeta (la de la cita y la del
  // accountability), midiendo ΔE2000 y exigiendo 3:1 contra la tarjeta clara
  // Y contra la oscura: queda a ΔE 61 de los dos rojos (no hay forma de
  // confundirlos) y a ΔE 17.1 de su vecino más parecido, que es más de lo que
  // separa a varios pares que ya convivían. La familia rosa/magenta, que
  // habría conservado el "calor", o se cae del contraste en tema oscuro
  // (#be185d: 2.76:1) o sigue leyéndose roja (#ff0561: ΔE 15.3 del rojo).
  // El calor lo pone el 🔥 y el texto.
  { label: 'Seguim. cierre · alto interés', color: '#0891b2', emoji: '🔥' },
  { label: 'Seguim. cierre · bajo interés', color: '#f97316', emoji: '🌡️' },
  { label: 'Falta perfilar / crédito',      color: '#8b5cf6', emoji: '📋' },
  { label: 'Compra a futuro',               color: '#0369a1', emoji: '⏭️' },
  { label: 'Apartó',                        color: '#c87f0a', emoji: '🏆' },
  // Cancelada y reagenda son UN solo estado, que es como lo decidió el equipo:
  // cuando una cita no se da se reporta así y se resuelve después.
  { label: 'Cancelada/Reagenda',            color: '#b45309', emoji: '🟤' },
  { label: 'No responde el cliente',        color: '#dc2626', emoji: '🔴' },
]

/** Color y emoji de un estado, tolerante a variantes viejas. */
export function infoEstadoCita(valor: string | null | undefined): EstadoCitaVenta | null {
  const v = (valor ?? '').trim()
  if (!v) return null
  const exacto = ESTADOS_CITA_VENTA.find(e => e.label === v)
  if (exacto) return exacto
  // Por si queda alguna fila vieja sin normalizar (una app sin actualizar que
  // escribió antes de que el disparador existiera).
  const k = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const porRaiz = (raiz: string) => ESTADOS_CITA_VENTA.find(e => e.label === raiz)!
  if (k.includes('apart')) return porRaiz('Apartó')
  if (k.includes('cancel') || k.includes('reagend')) return porRaiz('Cancelada/Reagenda')
  if (k.includes('realizada') || k.includes('esperando retro')) return porRaiz('Realizada')
  return null
}
