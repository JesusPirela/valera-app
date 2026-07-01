// Utilidades de texto para búsqueda tolerante.

// Normaliza una cadena para comparaciones de búsqueda: minúsculas y sin
// acentos/diacríticos, de modo que "Querétaro" coincida con "queretaro".
export function normalizar(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
