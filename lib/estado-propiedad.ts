// Estado de una propiedad.
//
// Durante mucho tiempo solo hubo 'disponible' y 'vendida', y el código quedó
// lleno de `estado === 'vendida'` para decir en realidad "ya no se puede
// ofrecer". Al aparecer 'rentada' (ver la migración 20260928_estado_rentada.sql)
// esas comparaciones se quedaron cortas: una renta cerrada tampoco se ofrece.
//
// Por eso la pregunta se hace aquí y no suelta por las pantallas: si mañana se
// añade otro estado de cierre, se cambia en un solo sitio.

export type EstadoPropiedad = 'disponible' | 'vendida' | 'rentada'

export const ESTADOS_PROPIEDAD: EstadoPropiedad[] = ['disponible', 'vendida', 'rentada']

/** ¿Ya se cerró? (vendida o rentada). Es lo contrario de "se puede ofrecer". */
export function esCerrada(estado: string | null | undefined): boolean {
  return estado === 'vendida' || estado === 'rentada'
}

export function etiquetaEstado(estado: string | null | undefined): string {
  if (estado === 'vendida') return 'Vendida'
  if (estado === 'rentada') return 'Rentada'
  return 'Disponible'
}

/** El color con el que se pinta la etiqueta en listas y fichas. */
export function colorEstado(estado: string | null | undefined): string {
  if (estado === 'vendida') return '#c0392b'
  if (estado === 'rentada') return '#2c7fb8'
  return '#0f9d58'
}
