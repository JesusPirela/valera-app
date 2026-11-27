// Canjear un link CORTO de Google Maps por el largo, que sí trae las
// coordenadas.
//
// POR QUÉ HACE FALTA UN SERVIDOR PARA ESTO
//
// El teléfono comparte `https://maps.app.goo.gl/xxxx`, que no tiene las
// coordenadas dentro: son un identificador que hay que canjear siguiendo la
// redirección. Desde el navegador no se puede —google.com no le da permiso a
// nuestra página para leer su respuesta—, así que la petición la hace esta
// función y devuelve el link largo. Quien lo lee es `lib/maps-link.ts`, la
// misma función en el teléfono y en la web: aquí NO se interpreta nada, para
// que no haya dos maneras de entender un link.
//
// SOLO GOOGLE MAPS
//
// Esta función descarga lo que le pidan, así que acepta únicamente los
// dominios de Google Maps. Sin esa lista sería un proxy abierto con el que
// cualquiera podría pedir cualquier página desde nuestro servidor.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

/** Los únicos dominios que esta función acepta descargar. */
const PERMITIDOS = [
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'maps.google.com',
]
function permitido(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase()
    if (PERMITIDOS.includes(h)) return true
    // google.com, google.com.mx, google.es… y sus subdominios (www, maps).
    return /(^|\.)google\.[a-z.]{2,6}$/.test(h)
  } catch { return false }
}

/** ¿Este link largo ya trae coordenadas? Mismo criterio que lib/maps-link.ts. */
const TIENE_COORDS = /!3d-?\d+\.?\d*!4d-?\d+\.?\d*|@-?\d+\.?\d*,-?\d+\.?\d*|[?&](?:q|query|ll|center)=-?\d+\.?\d*,-?\d+\.?\d*/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || !permitido(url)) {
      return new Response(JSON.stringify({ error: 'Solo se pueden resolver links de Google Maps.' }),
        { status: 400, headers: CORS })
    }

    // Se siguen las redirecciones a mano (hasta 5) para quedarse con la
    // dirección final aunque la última página no se pueda leer.
    let actual = url
    for (let i = 0; i < 5; i++) {
      const r = await fetch(actual, {
        redirect: 'manual',
        headers: {
          // Sin un navegador de verdad en la cabecera, Google contesta una
          // página de consentimiento sin coordenadas.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9',
        },
        signal: AbortSignal.timeout(12_000),
      })
      const siguiente = r.headers.get('location')
      if (siguiente && r.status >= 300 && r.status < 400) {
        actual = new URL(siguiente, actual).href
        if (TIENE_COORDS.test(actual)) break
        continue
      }
      // Ya no redirige. Si la página trae el link largo dentro (Google lo pone
      // en el <meta> de la vista previa), se usa ese.
      if (!TIENE_COORDS.test(actual)) {
        const html = await r.text().catch(() => '')
        const m = html.match(/https:\/\/www\.google\.com\/maps[^"'\\\s<>]{10,400}/i)
        if (m && TIENE_COORDS.test(m[0])) actual = m[0].replace(/&amp;/g, '&')
      }
      break
    }

    return new Response(JSON.stringify({ url: actual, tieneCoordenadas: TIENE_COORDS.test(actual) }),
      { headers: CORS })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: CORS })
  }
})
