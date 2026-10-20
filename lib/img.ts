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
 *
 * Encoge TODO lo que venga por http, no solo lo de Supabase.
 *
 * Antes, cualquier foto que no estuviera en el storage de Supabase se devolvía
 * intacta. Eso dejaba **16,735 fotos de 933 propiedades** —las importadas de
 * EasyBroker, CloudFront, Lamudi, Firebase, Tokko— bajándose a tamaño completo
 * para enseñarlas a 200 píxeles.
 *
 * Lo que costaba, medido en una foto de VR-2419: 2,111 KB para una miniatura
 * que por el proxy pesa 3.6 KB. El selector de 20 fotos bajaba 41 MB en vez de
 * 72 KB. De ahí el reporte de "llevo 6 minutos esperando y algunas ni cargan".
 *
 * Es seguro porque ThumbImage ya cae a la imagen original si la miniatura
 * falla: si algún CDN bloqueara al proxy, se ve igual que antes.
 */
export function thumb(url: string | null | undefined, opts: ThumbOpts = {}): string | undefined {
  if (!url) return undefined
  // Ya proxeada, o thumbnail propio pregenerado (/thumbs/) → servir tal cual.
  if (url.startsWith(PROXY) || url.includes('/thumbs/')) return url
  // Archivos del propio teléfono (file://, content://, data:) y rutas locales:
  // el proxy no puede alcanzarlos. Son las fotos recién elegidas que todavía no
  // se suben.
  if (!/^https?:\/\//i.test(url)) return url

  // Normalizar al ORIGINAL público de Supabase cuando aplique.
  let origen = url
  if (url.includes(RENDER_SEG)) {
    // URL de transformación vieja (de caché): volver al objeto público para que
    // el proxy tome el original y no se dispare otra transformación de Supabase.
    origen = url.split('?')[0].replace(RENDER_SEG, OBJECT_SEG)
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

/**
 * La misma imagen, pero lista para guardarse en la galería del teléfono.
 *
 * El problema que resuelve: hay propiedades cuyas fotos son PNG con un bloque
 * EXIF adentro que dice "gírame 180 grados" (VR-2419 es el caso medido). La
 * app respeta esa etiqueta y se ven bien, pero la galería de Android y el
 * selector de Facebook la IGNORAN —en PNG casi nadie la respeta— y salen de
 * cabeza. El reporte que llega es "las guardo y en Facebook aparecen al revés".
 *
 * Pasarlas por el proxy aplica el giro a los píxeles de verdad y entrega un
 * JPEG sin metadatos, así que ya no hay etiqueta que nadie pueda ignorar.
 *
 * Se va SIN parámetro de ancho a propósito: conserva el tamaño original. Medido
 * en VR-2419: entra PNG de 1280x960 y 2,111 KB, sale JPEG de 1280x960 y 431 KB.
 * Misma imagen, derecha, y cinco veces más ligera.
 */
export function imagenParaGaleria(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith(PROXY)) return url
  return `${PROXY}?url=${encodeURIComponent(url)}&q=92&output=jpg`
}
