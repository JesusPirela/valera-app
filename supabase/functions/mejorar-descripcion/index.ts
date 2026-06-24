import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// Cadena de respaldo: cada modelo de Groq tiene su PROPIA cuota diaria gratis.
// Si uno se queda sin tokens (429) o no existe (404), se intenta el siguiente.
// llama-3.1-8b-instant tiene ~5x mas cuota diaria que el 70b.
const MODELOS_GROQ = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
]

async function llamarGroq(apiKey: string, model: string, prompt: string): Promise<{ ok: boolean; texto?: string; status?: number; err?: string }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1200,
    }),
  })
  const json = await response.json()
  if (!response.ok) {
    return { ok: false, status: response.status, err: json?.error?.message ?? JSON.stringify(json) }
  }
  // Algunos modelos (qwen) incluyen su razonamiento en <think>...</think>: quitarlo
  const crudo: string = json.choices?.[0]?.message?.content ?? ''
  const texto = crudo.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia' }
  return { ok: true, texto }
}

// Respaldo final opcional: Google Gemini (cuota gratis independiente de Groq).
// Solo se usa si GEMINI_API_KEY esta configurada en Supabase Secrets.
async function llamarGemini(apiKey: string, prompt: string): Promise<{ ok: boolean; texto?: string; err?: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
      }),
    },
  )
  const json = await response.json()
  if (!response.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const texto: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!texto) return { ok: false, err: 'Respuesta vacia de Gemini' }
  return { ok: true, texto }
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
    const geminiKey = Deno.env.get('GEMINI_API_KEY')

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

⛔ REGLAS ESTRICTAS (OBLIGATORIAS — la descripción se rechaza si las incumples):
1. NUNCA incluyas nombres de inmobiliarias, agencias, marcas, asesores, brokers ni nombres de personas. Aunque aparezcan en la descripción original, elimínalos por completo.
2. NUNCA incluyas números de teléfono, WhatsApp, claves/códigos de propiedad (EB-XXXX, MLS, folios), correos, sitios web ni enlaces.
3. NUNCA hables de comisiones, "comparto comisión", porcentajes de comisión, honorarios ni acuerdos entre asesores. Omite por completo cualquier mención.
4. En el texto libre (secciones ✨, 🏠 Distribución, 🏢, 🌟 y 📍) NO escribas cifras numéricas: nada de precios, metros, cantidades de recámaras/baños ni años. Los únicos números permitidos en toda la respuesta son los de las líneas de datos estructurados (💰 Precio, 📐 Construcción, 🛏️/🚿/🚗) que se generan abajo con los datos exactos. La prosa describe cualidades, no números.
5. La descripción debe ser exclusivamente sobre la propiedad: sus espacios, acabados, ambiente y entorno. Nada de información de contacto, condiciones comerciales ni terceros.
6. EMOJIS — regla crítica: cada emoji debe representar visualmente lo que dice su línea (🍳 cocina, 🛋️ sala, 🌳 jardín, 🚗 estacionamiento, 🏊 alberca, 🏋️ gimnasio, 🔒 seguridad, etc.). NUNCA uses el mismo emoji más de una vez en toda la descripción, salvo 🛏️ cuando hay varias recámaras distintas. Varía los emojis; no pongas ✨ o 🏠 repetidamente.

Responde ÚNICAMENTE con la descripción en este formato exacto:

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${m2 ? `\n📐 Construcción: ${m2} m²` : ''}

✨ [2-3 oraciones atractivas: qué hace especial esta propiedad, para quién es ideal. Sin números, sin nombres de inmobiliarias/personas, sin comisiones]

🏠 Distribución

[Lista de espacios interiores, un emoji por línea. Basarte en la descripción original e inferir espacios típicos:
🛋️ Sala y comedor integrados
🍳 Cocina integral
🛏️ Recámara principal con clóset y baño completo
🛏️ Recámara secundaria
🚿 Baño completo
🧺 Área de lavado
🚗 Cajón(es) de estacionamiento]
${tipo !== 'terreno' ? `[INSTRUCCIÓN CRÍTICA: Las siguientes dos secciones (Equipamiento y Amenidades) SOLO aparecen si hay información real en la descripción original. Si no hay datos, NO escribas el encabezado ni nada relacionado con esa sección. Elimínala completamente del texto.]

[SI hay equipamiento mencionado en la descripción original, escribe exactamente:
🏢 Equipamiento

🛗 (elemento)
...
(línea en blanco)]

[SI hay amenidades mencionadas en la descripción original, escribe exactamente:
🌟 Amenidades

🏊 (elemento)
...
(línea en blanco)]
` : ''}📍 [2-3 oraciones sobre ubicación: fraccionamiento/colonia, conectividad, qué tiene cerca. Sin números, sin nombres de inmobiliarias/personas, sin teléfonos]

📲 Agenda tu cita y conoce este excelente ${tipoLabel.toLowerCase()}.`

    // ── Cadena de respaldo ────────────────────────────────────────────────
    const errores: string[] = []

    for (const modelo of MODELOS_GROQ) {
      const r = await llamarGroq(apiKey, modelo, prompt)
      if (r.ok) {
        return new Response(JSON.stringify({ texto: r.texto, modelo }), { headers: CORS })
      }
      errores.push(`${modelo}: ${r.err}`)
      // 429 = sin creditos/rate limit -> probar siguiente modelo.
      // 404/400 = modelo no existe -> probar siguiente.
      // Otros errores tambien continuan: el siguiente modelo puede funcionar.
      console.warn(`[mejorar-descripcion] ${modelo} fallo (${r.status}): ${r.err}`)
    }

    // Respaldo final: Gemini (si esta configurado)
    if (geminiKey) {
      const g = await llamarGemini(geminiKey, prompt)
      if (g.ok) {
        return new Response(JSON.stringify({ texto: g.texto, modelo: 'gemini-2.0-flash' }), { headers: CORS })
      }
      errores.push(`gemini: ${g.err}`)
    }

    throw new Error(`Todos los modelos de IA agotaron sus créditos o fallaron. Se reintenta mañana (las cuotas gratis se reinician cada día). Detalle: ${errores.join(' | ')}`)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mejorar-descripcion]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: CORS,
    })
  }
})
