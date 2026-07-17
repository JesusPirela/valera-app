// Helper de optimización de imágenes.
//
// Las imágenes se guardan a resolución completa (200KB–3MB). Para listas y
// miniaturas eso es desperdicio: descargar 3MB para mostrarlas a 200px pesa y
// tarda. Antes usábamos la transformación de Supabase Storage
// (`/render/image/public/?width=...`), PERO el plan Pro solo incluye 100
// "imágenes origen" transformadas al mes y este catálogo tiene ~1500
// propiedades con varias fotos → se disparaba a >15,000/mes (15,000%+ del
// quota), poniendo el proyecto en riesgo de modo solo-lectura.
//
// Solución: redimensionar con un proxy de imágenes GRATUITO (wsrv.nl, sobre
// Cloudflare) que toma la URL pública original de Supabase, la reescala y la
// cachea. Ventajas: (1) NO consume el quota de transformaciones de Supabase,
// (2) miniaturas aún más chicas (medido: 128KB → ~7KB a 320px), (3) baja el
// egress de Supabase porque el proxy cachea. Si el proxy fallara, ThumbImage
// cae solo a la imagen original.

const OBJECT_SEG = '/storage/v1/object/public/'
const RENDER_SEG = '/storage/v1/render/image/public/'
const PROXY = 'https://wsrv.nl/'

export type ThumbOpts = {
  width?: number
  quality?: number
  // 'cover' (default) recorta para llenar; 'contain' encaja sin recortar.
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * Devuelve una URL de miniatura redimensionada por el proxy gratuito.
 * Si la URL no es del storage público de Supabase, la regresa intacta.
 */
export function thumb(url: string | null | undefined, opts: ThumbOpts = {}): string | undefined {
  if (!url) return undefined
  // Ya viene proxeada → no volver a envolver.
  if (url.startsWith(PROXY)) return url

  // Normalizar al ORIGINAL público de Supabase. Puede venir ya como URL de
  // transformación (`/render/image/`) desde caché viejo: la revertimos al
  // objeto público para que el proxy tome el original.
  let origen = url
  if (url.includes(RENDER_SEG)) {
    origen = url.split('?')[0].replace(RENDER_SEG, OBJECT_SEG)
  } else if (!url.includes(OBJECT_SEG)) {
    // No es del storage público de Supabase → dejar intacta.
    return url
  }

  const { width = 400, quality = 70, resize = 'cover' } = opts
  return `${PROXY}?url=${encodeURIComponent(origen)}&w=${width}&q=${quality}&fit=${resize}&output=jpg`
}
