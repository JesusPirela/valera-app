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
