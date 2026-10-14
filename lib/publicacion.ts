/**
 * Cuándo publicó cada quien por última vez, y cómo contarlo.
 *
 * Vive aparte porque la pregunta "¿quién no está publicando?" se hace desde
 * más de una pantalla y la respuesta tiene que ser la misma en todas: si una
 * cuenta los días por horas sueltas y otra por día de calendario, los números
 * no cuadran entre sí y deja de creerse ninguno.
 */

/** Lo que devuelve ultima_publicacion_por_usuario(), ya digerido. */
export type UltimaPublicacion = { ultima: number | null; total30: number }

/**
 * Días de calendario desde la última publicación. Infinity si nunca publicó.
 *
 * Se cuenta por día y no por horas: quien publicó anoche a las 23:00 publicó
 * "ayer", que es como lo diría cualquiera mirando la lista, y no "hace 9
 * horas", que además lo dejaría fuera del filtro de "no publicó ayer".
 */
export function diasSinPublicar(ultima: number | null | undefined): number {
  if (!ultima) return Infinity
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dia = new Date(ultima); dia.setHours(0, 0, 0, 0)
  return Math.round((hoy.getTime() - dia.getTime()) / 86400000)
}

/**
 * Los plazos del filtro, con los días que hay que llevar sin publicar.
 *
 * "hoy" es no haber publicado hoy; "ayer" es no haber publicado ni hoy ni
 * ayer. Así cada opción contesta la pregunta tal como se hace en voz alta:
 * "¿quién no publicó ayer?".
 */
export const PERIODOS_SIN_PUBLICAR = [
  ['hoy',  'hoy',      0],
  ['ayer', 'ayer',     1],
  ['7',    '7 días',   7],
  ['30',   '30 días', 30],
] as const

export type PeriodoSinPublicar = typeof PERIODOS_SIN_PUBLICAR[number][0]

/** Los días de ese plazo. */
export function diasDelPeriodo(p: PeriodoSinPublicar): number {
  return PERIODOS_SIN_PUBLICAR.find(([k]) => k === p)![2]
}

/** "publicó hoy", "hace 40 días", "nunca ha publicado". */
export function textoUltimaPublicacion(dias: number): string {
  if (dias === Infinity) return 'nunca ha publicado'
  if (dias === 0) return 'publicó hoy'
  if (dias === 1) return 'publicó ayer'
  return `hace ${dias} días`
}

/** Lee la respuesta cruda del RPC a un mapa por usuario. */
export function mapaUltimaPublicacion(filas: any[] | null): Map<string, UltimaPublicacion> {
  return new Map((filas ?? []).map((r: any) => [
    r.user_id as string,
    { ultima: r.ultima ? new Date(r.ultima).getTime() : null, total30: r.total_30d ?? 0 },
  ]))
}
