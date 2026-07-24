import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// Traduce el texto libre de una ficha (título y descripción) al inglés y lo
// GUARDA en la propiedad, para no volver a traducir en cada vista del link.
//
// Se llama sin sesión (la ficha pública es abierta): usa el service role para
// escribir la caché. Solo traduce propiedades disponibles y publicadas.
//
// Motor principal: DeepL (mejor calidad). Respaldo: Groq (LLM) si DeepL no está
// configurado o falla, para que la función sirva aunque falte la key de DeepL.

// ── DeepL ────────────────────────────────────────────────────────────────────
async function traducirDeepL(textos: string[]): Promise<string[] | null> {
  const key = Deno.env.get('DEEPL_API_KEY')
  if (!key) return null
  // Las keys gratuitas terminan en ":fx" y usan otro host.
  const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const params = new URLSearchParams()
  for (const t of textos) params.append('text', t)
  params.append('source_lang', 'ES')
  params.append('target_lang', 'EN-US')
  const r = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!r.ok) { console.error('[traducir] DeepL', r.status, (await r.text()).slice(0, 200)); return null }
  const j = await r.json()
  const out = (j?.translations ?? []).map((x: any) => x.text as string)
  return out.length === textos.length ? out : null
}

// ── Groq (respaldo) ──────────────────────────────────────────────────────────
// Traduce cada texto por separado y devuelve SOLO la traducción, sin adornos.
async function traducirGroq(textos: string[]): Promise<string[] | null> {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return null
  const out: string[] = []
  for (const t of textos) {
    if (!t?.trim()) { out.push(''); continue }
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a professional real-estate translator. Translate the user text from Spanish to natural US English. Reply with ONLY the translation, no quotes, no notes, no preamble. Keep line breaks.' },
          { role: 'user', content: t },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })
    if (!r.ok) { console.error('[traducir] Groq', r.status); return null }
    const j = await r.json()
    const texto = (j?.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (!texto) return null
    out.push(texto)
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { codigo, id } = await req.json().catch(() => ({}))
    if (!codigo && !id) {
      return new Response(JSON.stringify({ ok: false, error: 'falta codigo o id' }), { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let q = supabase.from('propiedades')
      .select('id, titulo, descripcion, titulo_en, descripcion_en, titulo_en_src, descripcion_en_src')
      .eq('estado', 'disponible').eq('es_inventario', false).limit(1)
    q = codigo ? q.eq('codigo', codigo) : q.eq('id', id)
    const { data: prop, error } = await q.maybeSingle()
    if (error || !prop) {
      return new Response(JSON.stringify({ ok: false, error: 'propiedad no encontrada' }), { status: 404, headers: CORS })
    }

    // ¿La caché sigue vigente? (el origen guardado coincide con el texto actual)
    const tituloOk = prop.titulo_en != null && prop.titulo_en_src === (prop.titulo ?? '')
    const descOk   = prop.descripcion_en != null && prop.descripcion_en_src === (prop.descripcion ?? '')
    if (tituloOk && descOk) {
      return new Response(JSON.stringify({ ok: true, cache: true, titulo_en: prop.titulo_en, descripcion_en: prop.descripcion_en }), { headers: CORS })
    }

    // Traducir solo lo que haga falta, en un mismo lote para respetar el orden.
    const textos = [prop.titulo ?? '', prop.descripcion ?? '']
    let traducidos = await traducirDeepL(textos)
    let motor = 'deepl'
    if (!traducidos) { traducidos = await traducirGroq(textos); motor = 'groq' }
    if (!traducidos) {
      return new Response(JSON.stringify({ ok: false, error: 'no se pudo traducir (sin motor disponible)' }), { status: 502, headers: CORS })
    }

    const [tituloEn, descEn] = traducidos
    await supabase.from('propiedades').update({
      titulo_en: tituloEn,
      descripcion_en: descEn,
      titulo_en_src: prop.titulo ?? '',
      descripcion_en_src: prop.descripcion ?? '',
      traducido_at: new Date().toISOString(),
    }).eq('id', prop.id)

    return new Response(JSON.stringify({ ok: true, cache: false, motor, titulo_en: tituloEn, descripcion_en: descEn }), { headers: CORS })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), { status: 500, headers: CORS })
  }
})
