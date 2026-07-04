// Generador de ZIP mínimo (método STORE, sin compresión) para el navegador.
//
// ¿Por qué? En web, descargar N fotos con N clicks de <a download> hace que el
// navegador las bloquee ("¿permitir descargas múltiples?") y al usuario solo le
// llega la primera. Un ZIP es UNA sola descarga (nunca se bloquea) y además al
// abrirlo crea una carpeta con el código de la propiedad. Las fotos ya son JPEG
// (comprimidas), así que STORE no pierde nada frente a DEFLATE.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export type ZipEntry = { name: string; data: Uint8Array }

// Construye el ZIP en memoria y devuelve el Blob listo para descargar.
export function crearZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const { time, date } = dosDateTime(new Date())
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff])
  const cat = (...arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0)
    const out = new Uint8Array(total)
    let p = 0
    for (const a of arrs) { out.set(a, p); p += a.length }
    return out
  }

  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    // Local file header (flag 0x0800 = nombre en UTF-8)
    const local = cat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
      u32(crc), u32(e.data.length), u32(e.data.length), u16(name.length), u16(0),
      name, e.data,
    )
    // Central directory record
    central.push(cat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
      u32(crc), u32(e.data.length), u32(e.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ))
    parts.push(local)
    offset += local.length
  }

  const cd = cat(...central)
  const end = cat(
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  )
  return new Blob([...parts, cd, end] as BlobPart[], { type: 'application/zip' })
}

// Descarga en el navegador un ZIP con las imágenes dadas, dentro de una carpeta
// nombrada con el código/ID. Devuelve cuántas fotos pudo incluir.
export async function descargarFotosZipWeb(
  urls: string[],
  carpeta: string,
): Promise<number> {
  const safe = (carpeta || 'propiedad').replace(/[^a-zA-Z0-9._-]/g, '_')
  const entries: ZipEntry[] = []
  // Descarga en tandas de 4 para no saturar la conexión.
  for (let i = 0; i < urls.length; i += 4) {
    const tanda = urls.slice(i, i + 4)
    const resultados = await Promise.all(tanda.map(async (url, j) => {
      try {
        const resp = await fetch(url)
        if (!resp.ok) return null
        const buf = new Uint8Array(await resp.arrayBuffer())
        if (buf.length < 100) return null
        const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase()
        return { name: `${safe}/foto-${i + j + 1}.${ext}`, data: buf } as ZipEntry
      } catch { return null }
    }))
    for (const r of resultados) if (r) entries.push(r)
  }
  if (entries.length === 0) return 0

  const blob = crearZip(entries)
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = `${safe}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return entries.length
}
