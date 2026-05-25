import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/index.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, base64 } = await req.json()

    let imageData: Uint8Array
    if (url) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`No se pudo descargar la imagen: ${res.status}`)
      imageData = new Uint8Array(await res.arrayBuffer())
    } else if (base64) {
      const bin = atob(base64.replace(/^data:[^,]+,/, ''))
      imageData = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) imageData[i] = bin.charCodeAt(i)
    } else {
      throw new Error('Se requiere url o base64')
    }

    const img = await Image.decode(imageData)
    const resized = img.resize(8, 8)

    // Average hash (aHash): 8x8 → grayscale → compare each pixel vs average
    const pixels: number[] = []
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const [r, g, b] = resized.getRGBAAt(x, y)
        pixels.push(0.299 * r + 0.587 * g + 0.114 * b)
      }
    }
    const avg = pixels.reduce((a, b) => a + b, 0) / 64

    // Build 64-bit hash as hex string (avoids bigint sign issues)
    let hex = ''
    for (let byte = 0; byte < 8; byte++) {
      let val = 0
      for (let bit = 0; bit < 8; bit++) {
        if (pixels[byte * 8 + bit] >= avg) val |= (1 << bit)
      }
      hex += val.toString(16).padStart(2, '0')
    }

    return new Response(JSON.stringify({ phash: hex }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
