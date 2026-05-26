import { Platform } from 'react-native'

// Average hash (aHash): resize to 8x8 grayscale, compare each pixel vs average
// Returns 16-char hex string, or null if not supported

export async function computePhash(uri: string): Promise<string | null> {
  if (Platform.OS !== 'web') return null
  return new Promise((resolve) => {
    const img = new (window as any).Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 8
        canvas.height = 8
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, 8, 8)
        const { data } = ctx.getImageData(0, 0, 8, 8)
        const pixels: number[] = []
        for (let i = 0; i < 64; i++) {
          pixels.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
        }
        const avg = pixels.reduce((a, b) => a + b, 0) / 64
        let hex = ''
        for (let byte = 0; byte < 8; byte++) {
          let val = 0
          for (let bit = 0; bit < 8; bit++) {
            if (pixels[byte * 8 + bit] >= avg) val |= (1 << bit)
          }
          hex += val.toString(16).padStart(2, '0')
        }
        resolve(hex)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = uri
  })
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64
  let dist = 0
  for (let i = 0; i < a.length; i += 2) {
    const byteA = parseInt(a.slice(i, i + 2), 16)
    const byteB = parseInt(b.slice(i, i + 2), 16)
    let xor = byteA ^ byteB
    while (xor) { dist += xor & 1; xor >>= 1 }
  }
  return dist
}
