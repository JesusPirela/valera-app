import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'

// Caja normalizada (0..1) relativa al tamaño natural de la imagen.
export type CajaCensura = { x: number; y: number; w: number; h: number }

// El WebView no siempre puede cargar file:// (Android lo bloquea por defecto) ni
// descargar una URL remota sin esperar; en web, dibujar en canvas una imagen
// remota (ej. ya subida a Supabase Storage) y luego leerla con toDataURL()
// puede fallar por CORS si el navegador no la considera "same-origin" — el
// canvas queda "contaminado" y la operación se cuelga sin avisar. Por eso en
// AMBAS plataformas la fuente se convierte primero a un data URI base64: así
// el canvas siempre trabaja con un origen local, sin riesgo de bloqueo.
export async function prepararFuenteImagen(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri
  if (Platform.OS === 'web') {
    const res = await fetch(uri)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
      reader.readAsDataURL(blob)
    })
  }
  let localUri = uri
  if (uri.startsWith('http')) {
    const destino = FileSystem.cacheDirectory + 'censura_src_' + Math.random().toString(36).slice(2) + '.jpg'
    const { uri: descargada } = await FileSystem.downloadAsync(uri, destino)
    localUri = descargada
  }
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
  return `data:image/jpeg;base64,${base64}`
}

// Mismo algoritmo que el HTML inyectado en el WebView (ver htmlCensuraWebView),
// pero corrido directo con el DOM del navegador — en web no hace falta WebView.
// `src` ya viene como data URI (ver prepararFuenteImagen), así que no hace
// falta crossOrigin ni hay riesgo de canvas contaminado.
export function aplicarCensuraWeb(src: string, caja: CajaCensura): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        resolve(bakeCensuraEnCanvas(img, caja))
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

// RECORTAR: se queda SOLO con la región de la caja y descarta el resto.
export function aplicarRecorteWeb(src: string, caja: CajaCensura): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try { resolve(bakeRecorteEnCanvas(img, caja)) } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

function bakeRecorteEnCanvas(img: HTMLImageElement, caja: CajaCensura): string {
  const W = img.naturalWidth, H = img.naturalHeight
  const bx = Math.max(0, Math.round(caja.x * W))
  const by = Math.max(0, Math.round(caja.y * H))
  const bw = Math.max(1, Math.min(W - bx, Math.round(caja.w * W)))
  const bh = Math.max(1, Math.min(H - by, Math.round(caja.h * H)))
  const canvas = document.createElement('canvas')
  canvas.width = bw; canvas.height = bh
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, bx, by, bw, bh, 0, 0, bw, bh)
  return canvas.toDataURL('image/jpeg', 0.9)
}

function bakeCensuraEnCanvas(img: HTMLImageElement, caja: CajaCensura): string {
  const W = img.naturalWidth, H = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, W, H)

  const bx = Math.max(0, Math.round(caja.x * W))
  const by = Math.max(0, Math.round(caja.y * H))
  const bw = Math.min(W - bx, Math.round(caja.w * W))
  const bh = Math.min(H - by, Math.round(caja.h * H))

  // Difumina toda la imagen en un canvas aparte y solo se copia el recorte de
  // la caja sobre el canvas final — así el blur se "hornea" en los pixeles
  // reales en vez de ser un overlay visual que se podría quitar.
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = W; blurCanvas.height = H
  const bctx = blurCanvas.getContext('2d')!
  const blurPx = Math.max(10, Math.round(Math.min(bw, bh) * 0.25))
  ;(bctx as any).filter = `blur(${blurPx}px)`
  bctx.drawImage(img, 0, 0, W, H)

  ctx.drawImage(blurCanvas, bx, by, bw, bh, bx, by, bw, bh)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// HTML autocontenido para el WebView oculto en nativo: recibe { src, caja } por
// postMessage y responde con { ok, data | error }. Usa el mismo truco de blur
// en canvas que aplicarCensuraWeb, sin depender de ningún módulo nativo nuevo.
export const htmlCensuraWebView = `
<!DOCTYPE html>
<html>
<body style="margin:0">
<script>
function bake(srcDataUri, caja) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, W, H)
        const bx = Math.max(0, Math.round(caja.x * W))
        const by = Math.max(0, Math.round(caja.y * H))
        const bw = Math.min(W - bx, Math.round(caja.w * W))
        const bh = Math.min(H - by, Math.round(caja.h * H))
        const blurCanvas = document.createElement('canvas')
        blurCanvas.width = W; blurCanvas.height = H
        const bctx = blurCanvas.getContext('2d')
        const blurPx = Math.max(10, Math.round(Math.min(bw, bh) * 0.25))
        bctx.filter = 'blur(' + blurPx + 'px)'
        bctx.drawImage(img, 0, 0, W, H)
        ctx.drawImage(blurCanvas, bx, by, bw, bh, bx, by, bw, bh)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = srcDataUri
  })
}
function recortar(srcDataUri, caja) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight
        const bx = Math.max(0, Math.round(caja.x * W))
        const by = Math.max(0, Math.round(caja.y * H))
        const bw = Math.max(1, Math.min(W - bx, Math.round(caja.w * W)))
        const bh = Math.max(1, Math.min(H - by, Math.round(caja.h * H)))
        const canvas = document.createElement('canvas')
        canvas.width = bw; canvas.height = bh
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, bx, by, bw, bh, 0, 0, bw, bh)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = srcDataUri
  })
}
async function procesar(raw) {
  try {
    const { src, caja, op } = JSON.parse(raw)
    const data = op === 'recortar' ? await recortar(src, caja) : await bake(src, caja)
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: data }))
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
  }
}
window.addEventListener('message', (ev) => procesar(ev.data))
document.addEventListener('message', (ev) => procesar(ev.data))
</script>
</body>
</html>
`
