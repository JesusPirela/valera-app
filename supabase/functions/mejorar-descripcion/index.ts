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
    const { titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, mediosBanos, m2, estacionamientos } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('API key no configurada')

    const tipoLabel = tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Casa'
    const operacionLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(precio).toLocaleString('es-MX')} MXN` : null

    const prompt = `Eres un experto en marketing inmobiliario de alto nivel en México. Genera una descripción profesional y atractiva para esta propiedad con el siguiente formato EXACTO (con emojis y estructura). Usa ÚNICAMENTE los datos proporcionados para los números; el resto puedes crearlo de forma creativa y persuasiva basándote en la descripción original y el tipo de propiedad.

DATOS DE LA PROPIEDAD:
- Título: ${titulo || `${tipoLabel} ${operacionLabel}`}
- Dirección/Zona: ${direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- Tipo: ${tipoLabel} ${operacionLabel}
- M² (construcción o terreno): ${m2 ? `${m2} m²` : 'No especificado'}
- Recámaras: ${recamaras ?? 'No especificado'}
- Baños completos: ${banos ?? 'No especificado'}
- Medios baños: ${mediosBanos ?? 0}
- Estacionamientos: ${estacionamientos ?? 'No especificado'}
- Descripción original: ${descripcion || '(sin descripción)'}

FORMATO DE SALIDA (responde ÚNICAMENTE con esto, sin comentarios ni explicaciones):

🏡 ${tipoLabel} ${operacionLabel}${direccion ? ` | ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${m2 ? `\n📐 Superficie: ${m2} m²` : ''}
${recamaras ? `\n🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}` : ''}
${banos ? `\n🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}` : ''}
${estacionamientos ? `\n🚗 Cochera para ${estacionamientos} auto${estacionamientos > 1 ? 's' : ''}` : ''}

📍 [Párrafo de 2-3 oraciones sobre la ubicación y zona: por qué es una zona exclusiva/conveniente, qué tiene cerca, plusvalía]

✨ [Párrafo de 2-3 oraciones describiendo los acabados, estilo y sensación general de la propiedad]

🔹 Características principales
[Lista de 5-8 características destacadas de la propiedad con emoji al inicio de cada línea, basándote en los datos y la descripción original. Ejemplo: 🛋️ Sala amplia y luminosa]

🌟 Lo mejor de esta propiedad
[Lista de 4-6 puntos clave que hacen destacar esta propiedad con ✨ al inicio]

📞 Agenda tu visita y conoce tu próximo hogar.

⚠️ Precio y disponibilidad sujetos a cambio sin previo aviso.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
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
