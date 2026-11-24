// Variación de la descripción al copiarla para publicar.
//
// POR QUÉ EXISTE
//
// La misma propiedad la publican 8.3 personas en promedio (máximo medido: 58)
// y casi siempre pegando el mismo texto, así que Facebook Marketplace los
// marca como duplicados.
//
// POR QUÉ NO LA ESCRIBE UNA IA
//
// Antes esto lo resolvía un banco de versiones reescritas por un modelo. Un
// modelo que reescribe AGREGA: medido sobre las 6,654 versiones que había, el
// 17% afirmaba amenidades que la propiedad no tiene —"gimnasio", "privada",
// "vestidor", "cocina integral"— y nadie las revisaba, porque el botón de
// copiar las sustituía en silencio. Se retiró el 24/nov/2026.
//
// Aquí NO se escribe una sola palabra nueva. Se reacomodan los bloques y los
// renglones que la descripción ya trae. Por eso es imposible que invente: el
// texto de salida tiene exactamente los mismos renglones que el de entrada,
// y eso está verificado sobre las 2,474 descripciones reales del inventario.
//
// Es más débil que reescribir para separar anuncios, y es a propósito: un
// anuncio parecido se puede volver a publicar, un cliente al que le prometiste
// un gimnasio que no existe ya hizo el viaje.

/** Hash estable y chico, sin dependencias (igual en web y en el teléfono). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** Generador reproducible: la misma semilla da siempre la misma secuencia. */
function generador(semilla: number): () => number {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * El último bloque suele ser la invitación a contactar ("📲 Agenda tu visita
 * con Valera Real Estate"). Se queda al final: moverlo a media descripción se
 * lee como si el anuncio se hubiera cortado.
 */
const CIERRE = /📲|whats|agenda|agende|agendar|visita|cita|cont[áa]ct|ll[áa]ma|escr[íi]b|informes|m[áa]s info/i

/** Reacomoda en el lugar, con la semilla dada (Fisher-Yates). */
function revolver<T>(arr: T[], azar: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Devuelve la descripción reacomodada para esta persona y esta propiedad.
 *
 * Garantía: los renglones de salida son EXACTAMENTE los de entrada, los
 * mismos y todos. Lo único que cambia es en qué orden van.
 *
 * Es estable: la misma persona y la misma propiedad dan siempre el mismo
 * texto, así que si vuelve a copiar porque le borraron el anuncio, le sale
 * igual que la primera vez.
 *
 * Si la descripción no da para reacomodar (es un solo párrafo, o son dos
 * bloques sin viñetas) se devuelve tal cual: vale más dejarla igual que
 * partirla en pedazos.
 */
export function variarDescripcion(
  descripcion: string | null | undefined,
  propiedadId: string,
  userId: string | null,
): string {
  const original = (descripcion ?? '').replace(/\r\n/g, '\n')
  if (!userId || !original.trim()) return original

  const bloques = original.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  if (bloques.length === 0) return original

  const azar = generador(hash(propiedadId + userId))

  // El primero es el encabezado (título y precio) y se queda al frente: es lo
  // que se lee en la vista previa del anuncio.
  const encabezado = bloques[0]
  let enmedio = bloques.slice(1)
  let cierre: string | null = null
  if (enmedio.length > 1 && CIERRE.test(enmedio[enmedio.length - 1])) {
    cierre = enmedio.pop()!
  }

  // Los renglones DENTRO de un bloque no se tocan, aunque se pudiera: una
  // lista de caracteristicas esta escrita en el orden en que importa
  // (recamaras antes que las medidas del terreno), y rotarla hacia que el
  // anuncio abriera con "8 m de frente x 19 m de fondo". Medido sobre las
  // 2,688 descripciones reales, rotarlas solo subia de 78.8% a 84.3% las
  // propiedades en las que 8 personas reciben 8 textos distintos: cinco
  // puntos no valen un anuncio que se lee al reves.
  if (enmedio.length > 1) enmedio = revolver(enmedio, azar)

  return [encabezado, ...enmedio, ...(cierre ? [cierre] : [])].join('\n\n')
}

/**
 * Los renglones que trae un texto, para comprobar que no se perdió ni se
 * agregó nada. Se usa en las pruebas y en el guardarraíl de la app.
 */
export function renglonesDe(texto: string): string[] {
  return texto.replace(/\r\n/g, '\n').split('\n').map(r => r.trim()).filter(Boolean).sort()
}

/** ¿Este texto dice exactamente lo mismo que el original, renglón por renglón? */
export function mismoContenido(a: string, b: string): boolean {
  const x = renglonesDe(a), y = renglonesDe(b)
  return x.length === y.length && x.every((r, i) => r === y[i])
}
