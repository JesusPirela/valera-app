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

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY no configurado. Ve a Supabase → Project Settings → Edge Functions → Secrets y agrega GEMINI_API_KEY con tu clave de aistudio.google.com'
      )
    }

    const emojiTipo = tipo === 'casa' ? '🏡' : tipo === 'departamento' ? '🏢' : tipo === 'local' ? '🏪' : tipo === 'terreno' ? '🌄' : '🏠'
    const tipoLabel = tipo === 'casa' ? 'Casa' : tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Propiedad'
    const opLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(precio).toLocaleString('es-MX')} MXN` : null

    const lineasDatos: string[] = []
    if (recamaras)        lineasDatos.push(`🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}`)
    if (banos)            lineasDatos.push(`🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}`)
    if (estacionamientos) lineasDatos.push(`🚗 ${estacionamientos} estacionamiento${estacionamientos > 1 ? 's' : ''}`)
    const datosFijos = lineasDatos.join('\n')

    const prompt = `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional y atractiva para esta propiedad.

DATOS EXACTOS (no inventes números, úsalos tal cual):
- Tipo: ${tipoLabel} ${opLabel}
- Zona: ${direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M² construcción: ${m2 ? `${m2} m²` : 'No especificado'}
- Recámaras: ${recamaras ?? 'No especificado'}
- Baños completos: ${banos ?? 'No especificado'}
- Medios baños: ${mediosBanos ?? 0}
- Estacionamientos: ${estacionamientos ?? 'No especificado'}
- Descripción original: ${descripcion || '(sin descripción)'}

FORMATO EXACTO DE SALIDA (responde SOLO con esto, sin texto adicional):

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${datosFijos ? '\n' + datosFijos : ''}
${m2 ? `\n📐 Construcción: ${m2} m²` : ''}

✨ [2-3 oraciones de presentación: qué hace especial esta propiedad, sensación, para quién es ideal]

🏠 Distribución

[Lista de espacios interiores con emoji apropiado por línea. Basa en descripción original e infiere espacios típicos del tipo de propiedad. Ejemplo:
🛋️ Sala y comedor integrados
🍳 Cocina integral con barra
🛏️ Recámara principal con clóset y baño completo
🛏️ Recámara secundaria con clóset
🚿 Baño completo
🧺 Área de lavado
🚗 ${estacionamientos ?? 1} cajón${(estacionamientos ?? 1) > 1 ? 'es' : ''} de estacionamiento]
${tipo !== 'terreno' ? `
🏢 Equipamiento

[Lista del equipamiento del edificio/desarrollo con emoji. Solo incluir si es relevante. Ejemplo:
🛗 Elevador
🚶 Escaleras de acceso
Si es casa sola sin copropiedad, omitir esta sección completamente]

🌟 Amenidades

[Lista de amenidades con emoji. Basarse en descripción original. Si no hay info, inferir amenidades típicas del desarrollo. Ejemplo:
🏊 Alberca
🎉 Salón de eventos
🏀 Canchas deportivas
🛝 Juegos infantiles
🛡️ Vigilancia 24/7]
` : ''}
📍 [2-3 oraciones sobre la ubicación: nombre del fraccionamiento/colonia, conectividad, qué tiene cerca]

📲 Agenda tu cita y conoce este excelente ${tipoLabel.toLowerCase()}.`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      const errMsg = json?.error?.message ?? JSON.stringify(json)
      throw new Error(`Error de Gemini (${response.status}): ${errMsg}`)
    }

    const texto: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!texto) throw new Error('Gemini no devolvió texto. Intenta de nuevo.')

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
