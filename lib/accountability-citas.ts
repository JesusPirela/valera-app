// Accountability de citas: qué pasó DESPUÉS de cada cita de venta.
//
// Es un eje distinto al de citas_venta.estado_seguimiento. Ese dice si la cita
// ocurrió (Realizada, Cancelada/Reagenda, Apartó…). Este dice qué contestó el
// asesor o el prospectador cuando le preguntamos en qué quedó el cliente.
//
// Dos campos separados a propósito: una cita "Realizada" puede acabar
// descartada o en apartado, y mezclarlos en una sola columna borraría justo lo
// que se quiere medir.

export type EstadoSeguimiento =
  | 'sin_contactar'
  | 'sin_respuesta'
  | 'mandar_opciones'
  | 'se_contactaran'
  | 'compra_futuro'
  | 'falta_credito'
  | 'descartado'
  | 'aparto_compro'

type Info = {
  label: string
  /** Lo que significa, para que dos personas no lo usen distinto. */
  ayuda: string
  color: string
  /** Fondo claro para la píldora; en oscuro se calcula con tenue(). */
  bg: string
  /** Si la oportunidad sigue viva. Alimenta el resumen de las gráficas. */
  grupo: 'pendiente' | 'viva' | 'cerrada' | 'perdida'
}

/** El orden es el del recorrido: de "no hemos preguntado" a "ya se resolvió". */
export const ESTADOS_SEGUIMIENTO: Record<EstadoSeguimiento, Info> = {
  sin_contactar:   { label: 'Sin contactar',            ayuda: 'Todavía no le preguntamos al asesor',            color: '#64748b', bg: '#f1f5f9', grupo: 'pendiente' },
  sin_respuesta:   { label: 'Le escribimos, no contesta', ayuda: 'Ya se le preguntó y no ha respondido',          color: '#9a7018', bg: '#fdf8e6', grupo: 'pendiente' },
  mandar_opciones: { label: 'Hay que mandar opciones',  ayuda: 'Le interesó pero necesita ver más propiedades',   color: '#1a6470', bg: '#e0f4f5', grupo: 'viva' },
  se_contactaran:  { label: 'Se pondrán en contacto',   ayuda: 'El asesor lo va a buscar él mismo',               color: '#7a5230', bg: '#f8ede0', grupo: 'viva' },
  compra_futuro:   { label: 'Compra a futuro',          ayuda: 'Quiere, pero más adelante',                       color: '#8b5e2a', bg: '#fef6ec', grupo: 'viva' },
  falta_credito:   { label: 'Falta crédito / perfilar', ayuda: 'Depende de resolver su crédito',                  color: '#8b2252', bg: '#fdf0f7', grupo: 'viva' },
  descartado:      { label: 'Descartado',               ayuda: 'Ya no va a comprar',                              color: '#9b2020', bg: '#fff1f2', grupo: 'perdida' },
  aparto_compro:   { label: 'Apartó o compró',          ayuda: 'Se cerró',                                        color: '#1a5e32', bg: '#e5f5ea', grupo: 'cerrada' },
}

export const ORDEN_SEGUIMIENTO = Object.keys(ESTADOS_SEGUIMIENTO) as EstadoSeguimiento[]

export const infoSeguimiento = (e: string | null | undefined): Info =>
  ESTADOS_SEGUIMIENTO[(e ?? 'sin_contactar') as EstadoSeguimiento] ?? ESTADOS_SEGUIMIENTO.sin_contactar

export const GRUPOS: Record<Info['grupo'], { label: string; color: string }> = {
  pendiente: { label: 'Falta preguntar', color: '#9a7018' },
  viva:      { label: 'Sigue viva',      color: '#1a6470' },
  cerrada:   { label: 'Cerrada',         color: '#1a5e32' },
  perdida:   { label: 'Perdida',         color: '#9b2020' },
}

/** Desde cuándo entra una cita al accountability. */
export const DESDE = '2026-09-01'

/**
 * La fecha que cuenta para una cita: si se apartó, manda la del apartado.
 * Misma regla que la tabla de citas de venta, para que las dos pantallas
 * metan la misma cita en el mismo mes.
 */
export function fechaEfectivaCita(f: { fecha_apartado?: string | null; fecha_cita?: string | null }): string | null {
  return f.fecha_apartado ?? f.fecha_cita ?? null
}

/** "2026-09" → "septiembre 2026", para agrupar y para los chips de mes. */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function mesDe(iso: string | null): string | null {
  if (!iso) return null
  return iso.slice(0, 7)
}
export function mesLegible(mes: string): string {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}
