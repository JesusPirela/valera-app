// Estado en memoria (por sesión) de propiedades listas para publicar.
// Se marca cuando el prospectador copia la descripción o descarga imágenes.
const _unlocked = new Set<string>()

export function marcarDesbloqueada(propiedadId: string) {
  _unlocked.add(propiedadId)
}

export function estaDesbloqueada(propiedadId: string): boolean {
  return _unlocked.has(propiedadId)
}

export function getDesbloqueadas(): ReadonlySet<string> {
  return _unlocked
}
