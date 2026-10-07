import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// OpenRouter primero (cuota gratis confiable, funciona con la key configurada).
// OpenRouter rota su catálogo de modelos ":free" seguido — si estos vuelven a
// fallar con "model unavailable for free"/"no endpoints found", hay que
// revisar https://openrouter.ai/api/v1/models y reemplazar por los vigentes
// (mismos usados en variantes-descripcion-lote/index.ts).
const MODELOS_OPENROUTER = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
]

// Groq como segundo respaldo: cuenta/cuota 100% independiente de OpenRouter.
// OJO: llama-3.3-70b-versatile / llama-3.1-8b-instant YA NO están disponibles
// (Groq los retiró) — confirmado contra /openai/v1/models con la key real.
// Los "gpt-oss" son modelos "reasoning": razonan antes de responder y ese
// razonamiento NO sale en choices[0].message.content (sale aparte en
// .message.reasoning), así que si no se limita con reasoning_effort:'low' se
// comen el max_tokens pensando y content queda vacío.
const MODELOS_GROQ = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
]

// Gemini como tercer respaldo (cuota gratis independiente, de Google). Se
// prueban varios nombres porque Google los descontinúa con frecuencia.
const MODELOS_GEMINI = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
]

async function llamarOpenRouter(apiKey: string, model: string, prompt: string): Promise<{ ok: boolean; texto?: string; status?: number; err?: string }> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://valera.app',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1200,
    }),
  })
  const json = await response.json()
  if (!response.ok) return { ok: false, status: response.status, err: json?.error?.message ?? JSON.stringify(json) }
  const crudo: string = json.choices?.[0]?.message?.content ?? ''
  const texto = crudo.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia' }
  return { ok: true, texto }
}

// Groq expone una API compatible con OpenAI (mismo formato que OpenRouter),
// así que el request es casi idéntico — solo cambian URL y key.
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
      max_tokens: 2000,
      reasoning_effort: 'low',
    }),
  })
  const json = await response.json()
  if (!response.ok) return { ok: false, status: response.status, err: json?.error?.message ?? JSON.stringify(json) }
  const crudo: string = json.choices?.[0]?.message?.content ?? ''
  const texto = crudo.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia' }
  return { ok: true, texto }
}

async function llamarGemini(apiKey: string, model: string, prompt: string): Promise<{ ok: boolean; texto?: string; err?: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 3072 } }),
    },
  )
  const json = await response.json()
  if (!response.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  const texto = parts.filter(p => p && !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim()
  if (!texto) return { ok: false, err: 'Respuesta vacia de Gemini' }
  return { ok: true, texto }
}

// Esta función es la que arma la descripción que se GUARDA al crear o editar
// una propiedad. Antes el armazón era fijo, y se notaba: de 2,255 propiedades,
// 1,239 terminaban con la misma frase exacta y 1,344 traían el mismo bloque
// "💰 Precio:". Esa huella repetida es justo lo que un filtro antispam de
// Facebook agarra para decir que son la misma publicación.
//
// Ahora cada propiedad toma una plantilla al azar: cambia el rótulo del precio,
// los títulos de las secciones y el cierre.
//
// Los cierres invitan a agendar o a venir a conocer la propiedad. Lo que NO
// hacen es nombrar un canal fuera de Marketplace (WhatsApp, teléfono,
// enlaces): eso es lo que Facebook penaliza, no la invitación en sí.
const PLANTILLAS = [
  { precio: '💰 Precio: ', distribucion: '🏠 Distribución',       equipo: '🏢 Equipamiento',   amenidades: '🌟 Amenidades',     cierre: 'Agenda una visita y conóce{LO}.' },
  { precio: '🏷️ ',         distribucion: '📐 Cómo está repartida', equipo: '🔧 Con qué cuenta', amenidades: '🎯 Extras',         cierre: 'Ven a conocer {ESTE} {TIPO}.' },
  { precio: '💵 Pide: ',   distribucion: '🗝️ Espacios',            equipo: '⚙️ Instalaciones',  amenidades: '🏖️ Para disfrutar', cierre: 'Agenda tu visita cuando gustes.' },
  { precio: '📊 En ',      distribucion: '🚪 Por dentro',          equipo: '🧰 Equipada con',   amenidades: '✨ Además',         cierre: 'Te invito a conocer{LO} en persona.' },
  { precio: '💲 ',         distribucion: '🧭 Distribución',        equipo: '🔌 Servicios',      amenidades: '🌳 Amenidades',     cierre: 'Pide tu cita para ver{LO}.' },
  { precio: '🪙 Precio ',  distribucion: '🛋️ Áreas',               equipo: '🚰 Incluye',        amenidades: '🎈 Disfruta de',    cierre: 'Agenda una cita y pása{LO} a ver.' },
  { precio: '🧾 Valor: ',  distribucion: '📋 Lo que tiene',        equipo: '🛠️ Equipamiento',   amenidades: '🥂 Amenidades',     cierre: 'Ven a ver{LO} y checa si es para ti.' },
  { precio: '💰 ',         distribucion: '🏡 Interior',            equipo: '💡 Equipada',       amenidades: '🌞 Comunidad',      cierre: 'Agenda tu recorrido por {ESTE} {TIPO}.' },
  { precio: '🔖 Precio: ', distribucion: '📏 Espacios y medidas',  equipo: '🧱 Acabados',       amenidades: '🏊 Amenidades',     cierre: 'Pása{LO} a conocer, agenda tu visita.' },
  { precio: '🤝 ',         distribucion: '🚶 Recorrido',           equipo: '📦 Lo que incluye', amenidades: '🎪 Zona común',     cierre: 'Te espero para mostrarte {ESTE} {TIPO}.' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const {
      titulo, direccion, precio, descripcion,
      tipo, operacion, recamaras, banos, mediosBanos, m2, m2Terreno, estacionamientos, modelo,
    } = await req.json()

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!openrouterKey && !groqKey && !geminiKey) {
      throw new Error('No hay ninguna IA configurada (falta OPENROUTER_API_KEY, GROQ_API_KEY o GEMINI_API_KEY en Supabase Secrets).')
    }

    const emojiTipo = tipo === 'casa' ? '🏡' : tipo === 'departamento' ? '🏢' : tipo === 'local' ? '🏪' : tipo === 'terreno' ? '🌄' : '🏠'
    const tipoLabel = tipo === 'casa' ? 'Casa' : tipo === 'departamento' ? 'Departamento' : tipo === 'local' ? 'Local' : tipo === 'terreno' ? 'Terreno' : 'Propiedad'
    const opLabel = operacion === 'renta' ? 'en Renta' : 'en Venta'
    const precioFmt = precio ? `$${parseInt(precio).toLocaleString('es-MX')} MXN` : null

    const lineasDatos: string[] = []
    if (recamaras)        lineasDatos.push(`🛏️ ${recamaras} recámara${recamaras > 1 ? 's' : ''}`)
    if (banos)            lineasDatos.push(`🚿 ${banos} baño${banos > 1 ? 's completos' : ' completo'}${mediosBanos ? ` + ${mediosBanos} medio baño${mediosBanos > 1 ? 's' : ''}` : ''}`)
    if (estacionamientos) lineasDatos.push(`🚗 ${estacionamientos} estacionamiento${estacionamientos > 1 ? 's' : ''}`)

    // Al azar y no derivado de la propiedad: lo que se busca es repartir las
    // plantillas entre el inventario, no que una propiedad siempre reciba la
    // misma. Si el asesor vuelve a tocar "mejorar descripción", le toca otro
    // armazón, que es justo lo deseable.
    const t = PLANTILLAS[Math.floor(Math.random() * PLANTILLAS.length)]

    // Concordancia: casa y propiedad son femeninas; departamento, local y
    // terreno, masculinos. Sin esto salía "Ven a conocer esta departamento".
    const fem = tipo === 'casa' || !['departamento', 'local', 'terreno'].includes(tipo)
    const cierreResuelto = t.cierre
      .replace(/\{TIPO\}/g, tipoLabel.toLowerCase())
      .replace(/\{ESTE\}/g, fem ? 'esta' : 'este')
      .replace(/\{LO\}/g, fem ? 'la' : 'lo')

    const prompt = `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional para esta propiedad.

DATOS (usa estos números exactos, no inventes):
- Tipo: ${tipoLabel} ${opLabel}
- Zona: ${direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M² de construcción: ${m2 ? `${m2} m²` : 'No especificado'}
- M² de terreno: ${m2Terreno ? `${m2Terreno} m²` : 'No especificado'}
- Recámaras: ${recamaras ?? 'No especificado'}
- Baños completos: ${banos ?? 'No especificado'}
- Medios baños: ${mediosBanos ?? 0}
- Estacionamientos: ${estacionamientos ?? 'No especificado'}
- Descripción original: ${descripcion || '(sin descripción)'}

⛔ REGLAS ESTRICTAS (OBLIGATORIAS — la descripción se rechaza si las incumples):
1. NUNCA incluyas nombres de inmobiliarias, agencias, marcas, asesores, brokers ni nombres de personas. Aunque aparezcan en la descripción original, elimínalos por completo.
2. NUNCA incluyas números de teléfono, WhatsApp, claves/códigos de propiedad (EB-XXXX, VR-XXXX, MLS, folios), correos, sitios web ni enlaces.
3. NUNCA hables de comisiones, "comparto comisión", porcentajes de comisión, honorarios ni acuerdos entre asesores. Omite por completo cualquier mención.
4. En el texto libre (las secciones de prosa: ✨, distribución, equipamiento, amenidades y 📍) NO escribas cifras numéricas: nada de precios, metros, cantidades de recámaras/baños ni años. Los únicos números permitidos en toda la respuesta son los de las líneas de datos estructurados (el precio, 📐 Construcción, 🛏️/🚿/🚗) que se generan abajo con los datos exactos. La prosa describe cualidades, no números.
5. La descripción debe ser exclusivamente sobre la propiedad: sus espacios, acabados, ambiente y entorno. Nada de información de contacto, condiciones comerciales ni terceros.
6. EMOJIS — regla crítica: cada emoji debe representar visualmente lo que dice su línea (🍳 cocina, 🛋️ sala, 🌳 jardín, 🚗 estacionamiento, 🏊 alberca, 🏋️ gimnasio, 🔒 seguridad, etc.). NUNCA uses el mismo emoji más de una vez en toda la descripción, salvo 🛏️ cuando hay varias recámaras distintas. Varía los emojis; no pongas ✨ o 🏠 repetidamente.
7. Si abajo aparece la línea "🏷️ Modelo: …", CONSÉRVALA TAL CUAL y EXACTAMENTE en su lugar: justo DEBAJO de la línea del precio. No la muevas al final ni a otra sección, no la borres ni la modifiques.

Responde ÚNICAMENTE con la descripción en este formato exacto:

${emojiTipo} ${tipoLabel} ${opLabel}${direccion ? ` en ${direccion}` : ''}

${t.precio}${precioFmt || 'Consultar precio'}${modelo && String(modelo).trim() ? `\n🏷️ Modelo: ${String(modelo).trim()}` : ''}
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${m2 ? `\n📐 Construcción: ${m2} m²` : ''}${m2Terreno ? `\n🌐 Terreno: ${m2Terreno} m²` : ''}

✨ [2-3 oraciones atractivas: qué hace especial esta propiedad, para quién es ideal. Sin números, sin nombres de inmobiliarias/personas, sin comisiones]

${t.distribucion}

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
${t.equipo}

🛗 (elemento)
...
(línea en blanco)]

[SI hay amenidades mencionadas en la descripción original, escribe exactamente:
${t.amenidades}

🏊 (elemento)
...
(línea en blanco)]
` : ''}📍 [2-3 oraciones sobre ubicación: fraccionamiento/colonia, conectividad, qué tiene cerca. Sin números, sin nombres de inmobiliarias/personas, sin teléfonos]

📲 ${cierreResuelto}`

    const errores: string[] = []

    // 1) OpenRouter (primario — cuota gratis confiable)
    if (openrouterKey) {
      for (const mdl of MODELOS_OPENROUTER) {
        const r = await llamarOpenRouter(openrouterKey, mdl, prompt)
        if (r.ok) return new Response(JSON.stringify({ texto: r.texto, modelo: mdl }), { headers: CORS })
        errores.push(`openrouter/${mdl}: ${r.err}`)
        console.warn(`[mejorar-descripcion] openrouter ${mdl} fallo (${r.status}): ${r.err}`)
      }
    }

    // 2) Groq (respaldo — cuota/cuenta independiente de OpenRouter)
    if (groqKey) {
      for (const mdl of MODELOS_GROQ) {
        const r = await llamarGroq(groqKey, mdl, prompt)
        if (r.ok) return new Response(JSON.stringify({ texto: r.texto, modelo: `groq/${mdl}` }), { headers: CORS })
        errores.push(`groq/${mdl}: ${r.err}`)
        console.warn(`[mejorar-descripcion] groq ${mdl} fallo (${r.status}): ${r.err}`)
      }
    }

    // 3) Gemini (último respaldo; se prueban varios nombres de modelo)
    if (geminiKey) {
      for (const mdl of MODELOS_GEMINI) {
        const g = await llamarGemini(geminiKey, mdl, prompt)
        if (g.ok) return new Response(JSON.stringify({ texto: g.texto, modelo: `gemini/${mdl}` }), { headers: CORS })
        errores.push(`gemini/${mdl}: ${g.err}`)
        console.warn(`[mejorar-descripcion] gemini ${mdl} fallo: ${g.err}`)
      }
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
