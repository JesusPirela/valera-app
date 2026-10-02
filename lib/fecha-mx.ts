// El "día de hoy" según México, no según el reloj del dispositivo.
//
// La app es de una inmobiliaria de Querétaro: un día de trabajo va de medianoche
// a medianoche EN MÉXICO, da igual dónde esté el teléfono o cómo lo tenga
// configurado. Las misiones diarias, los seguimientos del día y los
// recordatorios de hoy se cuentan con ese calendario, y el servidor hace lo
// mismo (hoy_mx() en la base).
//
// Esto ya ha mordido dos veces:
//
//  · La racha se reiniciaba cada día a quien usaba la app de tarde: "ayer" se
//    calculaba con toISOString(), que es UTC, y a partir de las 18:00 hora de
//    México en UTC ya es el día siguiente.
//  · Las misiones diarias se reiniciaban a las 23:00 en lugar de a medianoche
//    de abril a octubre, porque el offset estaba escrito a mano dando por hecho
//    el horario de verano — que MÉXICO ABOLIÓ EN 2022.
//
// Por eso aquí no se escribe ninguna regla de husos a mano: se le pregunta al
// sistema. Si las reglas vuelven a cambiar, esto sigue funcionando.

const TZ = 'America/Mexico_City'

/** Hoy en México, como 'YYYY-MM-DD'. */
export function hoyMX(): string {
  // 'sv-SE' da justo el formato ISO de fecha.
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

/** El día anterior a `fecha` ('YYYY-MM-DD'), en el calendario de México. */
export function ayerMX(fecha: string = hoyMX()): string {
  const d = new Date(fecha + 'T12:00:00Z')   // mediodía: lejos de los bordes
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Cuántas horas va México por detrás de UTC ese día (6, o 5 si algún día
 * vuelve el horario de verano). Sale de la propia zona horaria.
 *
 * El truco de la 'Z': toLocaleString('sv-SE') devuelve la hora de México como
 * texto, y al añadirle la Z se parsea como UTC en vez de en la zona del
 * dispositivo. La diferencia entre las dos marcas es el offset.
 */
export function offsetMX(fecha: string = hoyMX()): number {
  const mediodia = new Date(fecha + 'T12:00:00Z')
  const enMX = new Date(mediodia.toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T') + 'Z')
  return (mediodia.getTime() - enMX.getTime()) / 3600000
}

/**
 * Principio y fin de ese día en México, como ISO en UTC, listos para comparar
 * contra un timestamptz de la base.
 */
export function limitesDiaMX(fecha: string = hoyMX()): { inicio: string; fin: string } {
  const inicioMs = new Date(fecha + 'T00:00:00Z').getTime() + offsetMX(fecha) * 3600000
  return {
    inicio: new Date(inicioMs).toISOString(),
    fin: new Date(inicioMs + 86400000).toISOString(),
  }
}
