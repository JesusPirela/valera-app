import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mejora una foto de propiedad con IA (img2img) MANTENIENDO la fachada:
// realista (no render), luz de día, nítida. El token de IA vive aquí (secreto),
// nunca en la app. Cadena de proveedores: cuando se acaba la cuota de uno, usa
// el siguiente. Hoy: Cloudflare Workers AI (SD1.5 img2img). Fácil de sumar más.

const PROMPT = 'professional real estate photograph of this exact same house, photorealistic, bright sunny day, natural realistic daylight, sharp focus high detail, keep the exact same building facade architecture and layout, do not change or invent anything'
const NEG = 'blurry, out of focus, cartoon, 3d render, cgi, illustration, distorted, deformed, different building, extra floors, extra windows, low quality, watermark, text, night, dark'

// ── Proveedor 1: Cloudflare Workers AI (SD1.5 img2img) ───────────────────────
// OJO: CF invierte width/height, por eso se pasan 512x768 para obtener 768x512
// (landscape). strength 0.4 conserva la fachada; más alto la empieza a cambiar.
async function mejorarCloudflare(bytes: Uint8Array): Promise<Uint8Array | null> {
  const acc = Deno.env.get('CF_ACCOUNT_ID')
  const tok = Deno.env.get('CF_API_TOKEN')
  if (!acc || !tok) return null
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: PROMPT, negative_prompt: NEG,
        image: [...bytes], strength: 0.4, guidance: 7.5, num_steps: 20,
        width: 512, height: 768,
      }),
    },
  )
  if (!r.headers.get('content-type')?.includes('image')) {
    console.error('[mejorar] Cloudflare falló:', r.status, (await r.text()).slice(0, 200))
    return null
  }
  return new Uint8Array(await r.arrayBuffer())
}

// Redimensiona/normaliza vía wsrv (proxy): sirve para preparar la entrada al
// tamaño que espera el modelo y para agrandar la salida a algo más grande.
async function porWsrv(url: string, w: number, h: number, fit: string): Promise<Uint8Array> {
  const u = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&h=${h}&fit=${fit}&output=png`
  return new Uint8Array(await (await fetch(u)).arrayBuffer())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'No autorizado' }, 401)

    const { imagenUrl } = await req.json()
    if (!imagenUrl) return json({ error: 'Falta imagenUrl' }, 400)

    // 1) Preparar entrada: 768x512 landscape (wsrv) — así entra con buen aspecto.
    const entrada = await porWsrv(imagenUrl, 768, 512, 'cover')

    // 2) Mejorar con la cadena de proveedores (hoy: Cloudflare).
    const mejorada = await mejorarCloudflare(entrada)
    if (!mejorada) return json({ error: 'El servicio de IA no está disponible o se agotó la cuota. Intenta más tarde.' }, 502)

    // 3) Subir el resultado a storage con el service role.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const path = `mejoradas/${user.id}/${Date.now()}.png`
    const up = await admin.storage.from('propiedades').upload(path, mejorada, { contentType: 'image/png', upsert: true })
    if (up.error) return json({ error: 'No se pudo guardar la imagen mejorada' }, 500)
    const { data: pub } = admin.storage.from('propiedades').getPublicUrl(path)

    return json({ url: pub.publicUrl })
  } catch (e) {
    console.error('[mejorar] error:', e)
    return json({ error: 'Error al mejorar la imagen' }, 500)
  }
})
