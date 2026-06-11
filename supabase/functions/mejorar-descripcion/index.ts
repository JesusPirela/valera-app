import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const {
      titulo, direccion, precio, descripcion,
      tipo, operacion, recamaras, banos, mediosBanos, m2, estacionamientos,
    } = await req.json()

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) throw new Error('GROQ_API_KEY no configurado en Supabase Secrets.')

    const emojiTipo = tipo === 'casa' ? '🏡' : tipo === 'departamento' ? '🏢' : tipo === 'local' ? '🏪' : tipo === 'terreno' ? '🌄' : '🏠'
    const tipoLabel = tipo === 'casa' ? 'Casa' : tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Propiedad'
    const opLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(precio).toLocaleString('es-MX')} MXN` : null

    const lineasDatos: string[] = []
    if (recamaras)        lineasDatos.push(`🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}`)
    if (banos)            lineasDatos.push(`🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}`)
    if (estacionamientos) lineasDatos.push(`🚗 ${estacionamientos} estacionamiento${estacionamientos > 1 ? 's' : ''}`)

    const prompt = `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional para esta propiedad.

DATOS (usa estos números exactos, no inventes):
- Tipo: ${tipoLabel} ${opLabel}
- Zona: ${direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M²: ${m2 ? `${m2} m²` : 'No especificado'}
- Recámaras: ${recamaras ?? 'No especificado'}
- Baños completos: ${banos ?? 'No especificado'}
- Medios baños: ${mediosBanos ?? 0}
- Estacionamientos: ${estacionamientos ?? 'No especificado'}
- Descripción original: ${descripcion || '(sin descripción)'}

Responde ÚNICAMENTE con la descripción en este formato exacto:

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${m2 ? `\n📐 Construcción: ${m2} m²` : ''}

✨ [2-3 oraciones atractivas: qué hace especial esta propiedad, para quién es ideal]

🏠 Distribución

[Lista de espacios interiores, un emoji por línea. Basarte en la descripción original e inferir espacios típicos:
🛋️ Sala y comedor integrados
🍳 Cocina integral
🛏️ Recámara principal con clóset y baño completo
🛏️ Recámara secundaria
🚿 Baño completo
🧺 Área de lavado
🚗 Cajón(es) de estacionamiento]
${tipo !== 'terreno' ? `
🏢 Equipamiento

[Equipamiento del edificio/desarrollo con emoji. IMPORTANTE: Si no hay información de equipamiento en la descripción original, omite esta sección por completo. No pongas "No disponible". Ejemplo solo si hay datos:
🛗 Elevador
🚶 Escaleras de acceso]

🌟 Amenidades

[Amenidades del desarrollo con emoji. IMPORTANTE: Solo incluye amenidades que estén mencionadas en la descripción original. Si no hay información, omite esta sección por completo. NUNCA escribas "No disponible". Ejemplo solo si hay datos:
🏊 Alberca
🎉 Salón de eventos
🏀 Canchas deportivas
🛝 Juegos infantiles
🛡️ Vigilancia 24/7]
` : ''}📍 [2-3 oraciones sobre ubicación: fraccionamiento/colonia, conectividad, qué tiene cerca]

📲 Agenda tu cita y conoce este excelente ${tipoLabel.toLowerCase()}.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      const errMsg = json?.error?.message ?? JSON.stringify(json)
      throw new Error(`Error de Groq (${response.status}): ${errMsg}`)
    }

    const texto: string = json.choices?.[0]?.message?.content ?? ''
    if (!texto) throw new Error('Groq no devolvió texto. Intenta de nuevo.')

    return new Response(JSON.stringify({ texto }), { headers: CORS })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mejorar-descripcion]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: CORS,
    })
  }
})
