// Orden de las fotos al descargarlas para publicar.
//
// Facebook detecta como duplicada una publicación con las mismas fotos en el
// mismo orden, y la misma propiedad la publican 8.3 personas en promedio
// (máximo medido: 58). Rotando el orden, cada persona sube una secuencia
// distinta de las mismas imágenes.
//
// LA PRIMERA NO SE MUEVE: casi siempre es la fachada, y es la que queda como
// portada del anuncio. Solo se rota de la segunda en adelante.
//
// Se ROTA, no se revuelve: así se conserva el agrupamiento con el que se
// tomaron las fotos (sala junto a comedor, recámaras juntas), nomás empezando
// en otro punto.

/** Hash estable y chico, sin dependencias (igual en web y en el teléfono). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Devuelve las fotos con la primera intacta y el resto rotado según la persona.
 * La misma persona y la misma propiedad dan SIEMPRE el mismo orden: si vuelve a
 * descargar porque le borraron el anuncio, baja las fotos igual que antes.
 *
 * Con 3 fotos o menos se devuelven tal cual: rotar 2 elementos solo los
 * intercambia y no aporta nada.
 */
export function rotarFotos<T>(fotos: T[], propiedadId: string, userId: string | null): T[] {
  if (!userId || fotos.length <= 3) return fotos
  const resto = fotos.slice(1)
  const giro = hash(propiedadId + userId) % resto.length
  if (giro === 0) return fotos
  return [fotos[0], ...resto.slice(giro), ...resto.slice(0, giro)]
}

// ── Lote de publicación ──────────────────────────────────────────────────────
//
// Rotar el orden ya no alcanza cuando la propiedad tiene muchas fotos: dos
// personas que suben LAS MISMAS 30 imágenes siguen publicando dos anuncios con
// el mismo contenido, nomás empezando en otro punto. Facebook compara las
// imágenes, no su orden.
//
// Con un lote distinto por persona, dos anuncios de la misma casa ya no
// comparten el juego completo de fotos. De 30 fotos tomando 20, hay millones de
// combinaciones posibles, así que dos personas prácticamente nunca coinciden.
//
// Esto NO le esconde nada a nadie: en cuanto la persona publica, se le ofrecen
// las que faltaron. El lote es para el primer anuncio, no un candado.

/** Cuántas fotos lleva el lote. Por debajo de esto no se recorta nada. */
export const TOPE_LOTE = 20

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
 * Devuelve el lote de fotos que le toca a esta persona para esta propiedad.
 *
 * La primera NO se mueve ni se quita: casi siempre es la fachada y es la que
 * queda de portada del anuncio.
 *
 * El resto se revuelve y se recorta. Se revuelve de verdad —no se rota— porque
 * al quitar fotos el agrupamiento original (sala con comedor, recámaras
 * juntas) ya se rompe de todas formas, y revolver separa más los anuncios.
 *
 * Es estable: la misma persona y la misma propiedad dan SIEMPRE el mismo lote.
 * Si le borran el anuncio y vuelve a bajar las fotos, baja exactamente las
 * mismas y el anuncio nuevo le queda igual que el anterior.
 */
export function lotePublicacion<T>(fotos: T[], propiedadId: string, userId: string | null): T[] {
  if (!userId || fotos.length <= TOPE_LOTE) return rotarFotos(fotos, propiedadId, userId)

  const resto = fotos.slice(1)
  const azar = generador(hash(propiedadId + userId))

  // Fisher-Yates: revuelve y selecciona de una vez, sin sesgo hacia ninguna
  // posición. Cortar las primeras N de una lista revuelta equivale a una
  // selección al azar sin repetición.
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[resto[i], resto[j]] = [resto[j], resto[i]]
  }

  return [fotos[0], ...resto.slice(0, TOPE_LOTE - 1)]
}

/** Las que quedaron fuera del lote, para ofrecerlas una vez publicada. */
export function fotosRestantes<T>(fotos: T[], lote: T[]): T[] {
  const enLote = new Set(lote)
  return fotos.filter(f => !enLote.has(f))
}
