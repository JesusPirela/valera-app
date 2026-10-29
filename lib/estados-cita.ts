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
  { label: 'Seguim. cierre · alto interés', color: '#dc2626', emoji: '🔥' },
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
