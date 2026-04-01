import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { titulo, direccion, precio, descripcion } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('API key no configurada')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Eres un experto en bienes raíces. Mejora la siguiente descripción de una propiedad para que sea profesional, atractiva y persuasiva. Responde ÚNICAMENTE con la descripción mejorada, sin comentarios ni explicaciones.

Título: ${titulo || 'Sin título'}
Dirección: ${direccion || 'Sin dirección'}
Precio: ${precio ? `$${precio} MXN` : 'No especificado'}
Descripción actual: ${descripcion || '(vacía)'}`,
        }],
      }),
    })

    const json = await response.json()
    if (!response.ok) throw new Error(`Anthropic ${response.status}: ${JSON.stringify(json.error)}`)

    const texto = json.content?.[0]?.text ?? ''

    return new Response(JSON.stringify({ texto }), {
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
