// Helper de optimización de imágenes vía transformaciones de Supabase Storage.
//
// Las imágenes se guardan a resolución completa (200KB–3MB). Para listas y
// miniaturas eso es desperdicio: descargar 3MB para mostrarlos a 200px tarda y
// pesa. Supabase tiene transformación de imágenes habilitada en este proyecto,
// así que convertimos la URL pública `/object/public/` a la versión
// redimensionada `/render/image/public/?width=...&quality=...`.
//
// Medido: una imagen de 210KB baja a ~58KB con width=400&quality=70 (3.6× menos).

const OBJECT_SEG = '/storage/v1/object/public/'
const RENDER_SEG = '/storage/v1/render/image/public/'

export type ThumbOpts = {
  width?: number
  quality?: number
  // 'cover' (default) recorta para llenar; 'contain' encaja sin recortar.
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * Devuelve una URL de imagen redimensionada por el CDN de Supabase.
 * Si la URL no es del storage público de Supabase, la regresa intacta.
 */
export function thumb(url: string | null | undefined, opts: ThumbOpts = {}): string | undefined {
  if (!url) return undefined
  // Ya transformada, no es del storage público, o es un thumbnail pregenerado → no tocar
  if (url.includes(RENDER_SEG) || !url.includes(OBJECT_SEG) || url.includes('/thumbs/')) return url

  const { width = 400, quality = 70, resize = 'cover' } = opts
  const base = url.replace(OBJECT_SEG, RENDER_SEG)
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}width=${width}&quality=${quality}&resize=${resize}`
}
