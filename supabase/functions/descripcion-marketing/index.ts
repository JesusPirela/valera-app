import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// Tope de generaciones por usuario por DÍA (hora de México). Disponible para
// TODOS los usuarios. 5/día por usuario mantiene el gasto dentro de las cuotas
// gratis de las IAs (OpenRouter + Gemini) aunque lo usen todos. Ajustable con esta línea.
const LIMITE_DIARIO = 5

// OpenRouter primero (cuota gratis confiable, funciona con la key configurada).
const MODELOS_OPENROUTER = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'mistralai/mistral-7b-instruct:free',
]

// Modelos Gemini vigentes (confirmados en agosto 2026).
const MODELOS_GEMINI = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
]

// Enfoques para diversificar: cada generación toma uno al azar → dos versiones
// de la misma propiedad salen distintas (para no ser detectada como duplicada).
const ENFOQUES = [
  'Resalta el ESTILO DE VIDA y la comodidad para la familia.',
  'Enfócalo como una gran OPORTUNIDAD DE INVERSIÓN y plusvalía de la zona.',
  'Tono CÁLIDO y acogedor, como un hogar donde crear recuerdos.',
  'Tono ELEGANTE y premium, resaltando acabados y exclusividad.',
  'Destaca la UBICACIÓN y conectividad: lo práctico de vivir ahí.',
  'Enfócalo a quien busca ESPACIO y confort, ideal para crecer.',
  'Tono FRESCO y moderno, para un comprador joven.',
]

async function llamarOpenRouter(apiKey: string, model: string, prompt: string, temp: number) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://valera.app',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: temp, max_tokens: 2000 }),
  })
  const json = await response.json()
  if (!response.ok) return { ok: false, status: response.status, err: json?.error?.message ?? JSON.stringify(json) }
  const crudo: string = json.choices?.[0]?.message?.content ?? ''
  const texto = crudo.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia' }
  return { ok: true, texto }
}

async function llamarGemini(apiKey: string, model: string, prompt: string, temp: number) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sin thinkingConfig: los modelos 3.x/-lite lo rechazan ("invalid argument").
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, maxOutputTokens: 3072 } }),
    },
  )
  const json = await response.json()
  if (!response.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  const texto = parts.filter(p => p && !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia de Gemini' }
  return { ok: true, texto }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const {
      propiedadId, titulo, direccion, precio, descripcion,
      tipo, operacion, recamaras, banos, mediosBanos, m2, estacionamientos,
    } = body

    if (!propiedadId) throw new Error('Falta propiedadId')

    // ── Límite por usuario/día (corre como el usuario, con su JWT) ───────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

    const { data: rl, error: rlErr } = await supa.rpc('usar_desc_ia', { p_limite: LIMITE_DIARIO, p_propiedad_id: propiedadId })
    if (rlErr) throw new Error('No se pudo validar el límite: ' + rlErr.message)
    if (!rl?.ok) {
      if (rl?.error === 'limite') {
        return new Response(JSON.stringify({
          error: 'limite',
          mensaje: `Llegaste al límite de ${LIMITE_DIARIO} descripciones con IA por hoy. Se reinicia mañana.`,
          usos: rl.usos, limite: rl.limite,
        }), { status: 429, headers: CORS })
      }
      throw new Error(rl?.error ?? 'No autorizado')
    }
    const restantes: number = rl.restantes ?? 0

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!openrouterKey && !geminiKey) {
      throw new Error('No hay ninguna IA configurada (falta OPENROUTER_API_KEY o GEMINI_API_KEY en Supabase Secrets).')
    }

    const emojiTipo = tipo === 'casa' ? '🏡' : tipo === 'departamento' ? '🏢' : tipo === 'local' ? '🏪' : tipo === 'terreno' ? '🌄' : '🏠'
    const tipoLabel = tipo === 'casa' ? 'Casa' : tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Propiedad'
    const opLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(String(precio)).toLocaleString('es-MX')} MXN` : null

    const lineasDatos: string[] = []
    if (recamaras)        lineasDatos.push(`🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}`)
    if (banos)            lineasDatos.push(`🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}`)
    if (estacionamientos) lineasDatos.push(`🚗 ${estacionamientos} estacionamiento${estacionamientos > 1 ? 's' : ''}`)

    const enfoque = ENFOQUES[Math.floor(Math.random() * ENFOQUES.length)]
    const semilla = Math.floor(Math.random() * 1e9)

    const prompt = `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional para publicar esta propiedad en portales y redes (Facebook Marketplace, grupos, etc.).

🎲 VARIACIÓN OBLIGATORIA (semilla ${semilla}): esta es una versión NUEVA y ÚNICA. Redáctala DISTINTA a cualquier versión previa de esta misma propiedad: cambia la apertura, el orden de las ideas, los adjetivos y la estructura de las frases. El objetivo es que dos generaciones NO se parezcan, para que Facebook/Marketplace no la detecten como duplicada. ⚠️ Los DATOS y NÚMEROS deben ser EXACTAMENTE los mismos; solo cambia la redacción.
🎯 ENFOQUE de esta versión: ${enfoque}

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

⛔ REGLAS ESTRICTAS (OBLIGATORIAS):
1. NUNCA incluyas nombres de inmobiliarias, agencias, marcas, asesores, brokers ni personas.
2. NUNCA incluyas teléfonos, WhatsApp, claves/códigos (EB-XXXX, MLS, folios), correos, sitios web ni enlaces.
3. NUNCA hables de comisiones, "comparto comisión", porcentajes ni acuerdos entre asesores.
4. En el texto libre (✨, 🏠 Distribución, 🏢, 🌟 y 📍) NO escribas cifras: nada de precios, metros, cantidades ni años. Los únicos números permitidos son los de las líneas de datos (💰, 📐, 🛏️/🚿/🚗) generadas abajo. La prosa describe cualidades, no números.
5. La descripción es SOLO sobre la propiedad: espacios, acabados, ambiente y entorno.
6. EMOJIS: cada emoji debe representar lo que dice su línea. No repitas el mismo emoji (salvo 🛏️ para varias recámaras). Varía.

Responde ÚNICAMENTE con la descripción en este formato:

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

💰 Precio: ${precioFmt || 'Consultar precio'}
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${m2 ? `\n📐 Construcción: ${m2} m²` : ''}

✨ [2-3 oraciones atractivas según el enfoque indicado. Sin números, sin nombres, sin comisiones]

🏠 Distribución

[Lista de espacios, un emoji por línea, inferidos de la descripción original]
${tipo !== 'terreno' ? `
[Si la descripción original menciona equipamiento, agrega la sección "🏢 Equipamiento" con sus líneas; si no, omítela por completo.]
[Si menciona amenidades, agrega "🌟 Amenidades" con sus líneas; si no, omítela.]
` : ''}
📍 [2-3 oraciones sobre ubicación/conectividad. Sin números, sin nombres, sin teléfonos]

📲 Agenda tu cita y conoce este excelente ${tipoLabel.toLowerCase()}.`

    const errores: string[] = []

    // 1) OpenRouter (primario — cuota gratis confiable)
    if (openrouterKey) {
      for (const modelo of MODELOS_OPENROUTER) {
        const r = await llamarOpenRouter(openrouterKey, modelo, prompt, 0.95)
        if (r.ok) return new Response(JSON.stringify({ texto: r.texto, modelo, restantes }), { headers: CORS })
        errores.push(`openrouter/${modelo}: ${r.err}`)
        console.warn(`[descripcion-marketing] openrouter ${modelo} fallo (${r.status}): ${r.err}`)
      }
    }

    // 2) Gemini (respaldo; se prueban varios nombres de modelo)
    if (geminiKey) {
      for (const modelo of MODELOS_GEMINI) {
        const g = await llamarGemini(geminiKey, modelo, prompt, 0.95)
        if (g.ok) return new Response(JSON.stringify({ texto: g.texto, modelo: `gemini/${modelo}`, restantes }), { headers: CORS })
        errores.push(`gemini/${modelo}: ${g.err}`)
        console.warn(`[descripcion-marketing] gemini ${modelo} fallo: ${g.err}`)
      }
    }

    throw new Error(`Todas las IAs agotaron su cuota o fallaron (se reinician cada día). Detalle: ${errores.join(' | ')}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[descripcion-marketing]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS })
  }
})
