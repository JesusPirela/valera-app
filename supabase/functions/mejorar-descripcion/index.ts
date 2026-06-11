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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY no configurado. Ve a Supabase → Project Settings → Edge Functions → Secrets y agrega ANTHROPIC_API_KEY con tu clave de api.anthropic.com'
      )
    }

    const emojiTipo = tipo === 'casa' ? '🏡' : tipo === 'departamento' ? '🏢' : tipo === 'local' ? '🏪' : tipo === 'terreno' ? '🌄' : '🏠'
    const tipoLabel = tipo === 'casa' ? 'Casa' : tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Propiedad'
    const opLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(precio).toLocaleString('es-MX')} MXN` : null

    // Construir encabezado de datos básicos
    const lineasDatos: string[] = []
    if (recamaras)           lineasDatos.push(`🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}`)
    if (banos)               lineasDatos.push(`🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}`)
    if (estacionamientos)    lineasDatos.push(`🚗 ${estacionamientos} estacionamiento${estacionamientos > 1 ? 's' : ''}`)
    const datosFijos = lineasDatos.join('\n')

    const prompt = `Eres un experto copywriter inmobiliario en México. Tu tarea es generar una descripción profesional, atractiva y detallada para una propiedad.

DATOS DE LA PROPIEDAD (usa estos valores exactos, NO inventes números):
- Tipo: ${tipoLabel} ${opLabel}
- Zona / Fraccionamiento: ${direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M² construcción: ${m2 ? `${m2} m²` : 'No especificado'}
- Recámaras: ${recamaras ?? 'No especificado'}
- Baños completos: ${banos ?? 'No especificado'}
- Medios baños: ${mediosBanos ?? 0}
- Estacionamientos: ${estacionamientos ?? 'No especificado'}
- Descripción original (úsala de referencia): ${descripcion || '(sin descripción)'}

FORMATO DE SALIDA OBLIGATORIO — responde ÚNICAMENTE con el texto de la descripción, sin comentarios ni explicaciones adicionales:

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${datosFijos ? '\n' + datosFijos : ''}
${m2 ? `\n📐 Construcción: ${m2} m²` : ''}

✨ [Escribe aquí 2-3 oraciones de presentación atractiva: qué hace especial esta propiedad, qué sensación genera, para quién es ideal]

🏠 Distribución

[Lista de los espacios interiores con emoji apropiado al inicio de cada línea. Ejemplo:
🛋️ Sala y comedor integrados
🍳 Cocina equipada
🛏️ Recámara principal con baño y clóset
Usa la descripción original como guía. Si no hay detalle, infiere espacios típicos para este tipo de propiedad]

${tipo !== 'terreno' ? `🏢 Equipamiento

[Lista de equipamiento del edificio/desarrollo: elevador, escaleras, lobby, bodega, etc. Solo incluir si es relevante para el tipo de propiedad. Si es casa sin copropiedad, omitir esta sección]

🌟 Amenidades

[Lista de amenidades: alberca, gimnasio, salón de eventos, canchas, juegos, vigilancia, etc. Basarse en la descripción original. Si no hay info, inferir amenidades típicas para un desarrollo de este tipo y zona]

` : ''}📍 [2-3 oraciones sobre la ubicación: nombre del fraccionamiento/colonia, qué tan bien conectado está, qué tiene cerca: plazas, supermercados, vialidades, hospitales, colegios según el tipo de zona]

📲 Agenda tu cita y conoce este excelente ${tipoLabel.toLowerCase()}.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      const errMsg = json?.error?.message ?? JSON.stringify(json)
      throw new Error(`Error de Anthropic (${response.status}): ${errMsg}`)
    }

    const texto: string = json.content?.[0]?.text ?? ''
    if (!texto) throw new Error('La IA no devolvió texto. Intenta de nuevo.')

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
