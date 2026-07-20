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
// Solución en dos capas (complementarias):
//  1) Al SUBIR una imagen se genera y guarda un thumbnail propio en `/thumbs/`
//     (ver editar-propiedad.tsx + columna propiedad_imagenes.thumb_url). Las
//     vistas usan `thumb_url ?? url`; cuando hay thumb pregenerado se sirve tal
//     cual, sin proxy ni transformación.
//  2) Para el resto (las ~15k imágenes YA existentes, sin thumb pregenerado)
//     redimensionamos con un proxy GRATUITO (wsrv.nl, sobre Cloudflare) que toma
//     la URL pública original y la reescala+cachea. Así NINGÚN camino consume el
//     quota de transformaciones de Supabase.
//
// Ventajas del proxy: no gasta el quota de Supabase, miniaturas más chicas
// (medido: 128KB → ~7KB a 320px) y baja el egress (el proxy cachea). Si el
// proxy fallara, ThumbImage cae solo a la imagen original.

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
  // Ya proxeada, o thumbnail propio pregenerado (/thumbs/) → servir tal cual.
  if (url.startsWith(PROXY) || url.includes('/thumbs/')) return url

  // Normalizar al ORIGINAL público de Supabase.
  let origen = url
  if (url.includes(RENDER_SEG)) {
    // URL de transformación vieja (de caché): volver al objeto público para que
    // el proxy tome el original y no se dispare otra transformación de Supabase.
    origen = url.split('?')[0].replace(RENDER_SEG, OBJECT_SEG)
  } else if (!url.includes(OBJECT_SEG)) {
    // No es del storage público de Supabase → dejar intacta.
    return url
  }

  const { width = 400, quality = 70, resize = 'cover' } = opts
  return `${PROXY}?url=${encodeURIComponent(origen)}&w=${width}&q=${quality}&fit=${resize}&output=jpg`
}

/**
 * Envía CUALQUIER imagen por el proxy (wsrv), sea de Supabase o de un CDN
 * externo. Agrega CORS (`Access-Control-Allow-Origin: *`) y normaliza el formato
 * a JPEG. Clave para convertir a base64 en el PDF: muchas propiedades importadas
 * tienen sus fotos en CDNs (p.ej. CloudFront) SIN CORS y con content-type raro,
 * lo que hacía fallar el canvas/fetch → fichas sin imágenes. Vía proxy sí cargan.
 */
export function proxyImagen(url: string | null | undefined, opts: { width?: number; quality?: number } = {}): string | undefined {
  if (!url) return undefined
  if (url.startsWith(PROXY)) return url
  const { width = 1080, quality = 72 } = opts
  return `${PROXY}?url=${encodeURIComponent(url)}&w=${width}&q=${quality}&output=jpg`
}
