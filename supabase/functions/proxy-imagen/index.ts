import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Proxy de imágenes: descarga una imagen del lado del SERVIDOR y la devuelve con
// cabeceras CORS. Sirve para censurar/recortar fotos que vienen de portales
// externos (inmuebles24, EasyBroker CDN…), cuyo `fetch` desde el navegador se
// bloquea por CORS. Solo devuelve contenido de tipo imagen (evita usarlo como
// proxy abierto genérico).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = new URL(req.url).searchParams.get('url')
    if (!url || !/^https?:\/\//i.test(url)) {
      return new Response('URL inválida', { status: 400, headers: CORS })
    }
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValeraApp/1.0)' } })
    if (!r.ok) return new Response('No se pudo descargar', { status: 502, headers: CORS })
    const ct = r.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) {
      return new Response('El recurso no es una imagen', { status: 415, headers: CORS })
    }
    const buf = await r.arrayBuffer()
    return new Response(buf, { headers: { ...CORS, 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' } })
  } catch (e) {
    return new Response(`Error: ${String((e as any)?.message ?? e)}`, { status: 500, headers: CORS })
  }
})
