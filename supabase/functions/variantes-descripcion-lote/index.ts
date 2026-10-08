// Llena el banco de versiones de descripción, en lote, de a poquitas por
// corrida (la llama un cron). Al copiar, la app solo escoge una ya hecha: así
// cada persona publica un texto distinto sin esperar a ninguna IA, sin tope
// diario y sin gastar cuota en cada copia.
//
// Corre con service_role: NO pasa por el límite de 5/día de usar_desc_ia, que
// es el del botón manual del asesor.
//
// Lo importante de aquí: no basta cambiar la prosa. Si las 6 versiones salen
// con el mismo esqueleto (mismo "💰 Precio:", mismas secciones, mismo cierre)
// siguen pareciendo la misma publicación. Por eso cada versión usa una
// PLANTILLA distinta además de un enfoque distinto.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// Cuánto se genera por corrida.
const PROPIEDADES_POR_CORRIDA = 10
const VARIANTES_POR_PROPIEDAD = 3

// Cuántas versiones se piden a la vez. En serie una corrida apenas alcanzaba 1
// o 2 antes de que la plataforma la matara.
const EN_PARALELO = 8

// Las edge functions mueren a los 150s con "IDLE_TIMEOUT". Se corta en 115s
// para alcanzar a responder con el resumen de lo que sí se generó, en vez de
// que la respuesta se pierda.
const LIMITE_MS = 115_000

// Tope por llamada a una IA. Un modelo que se queda colgado se llevaba todo el
// presupuesto de la corrida completa.
const LIMITE_LLAMADA_MS = 30_000

// TOPE DIARIO DEL BANCO. Lo más importante de este archivo.
//
// Las cuotas gratis son COMPARTIDAS con el botón "mejorar descripción" que usan
// los asesores al crear una propiedad. El 07/10 este job generó 766 versiones
// en un día contra un límite de ~500 de Gemini: se comió la cuota entera y el
// botón de la gente empezó a fallar con "todos los modelos agotaron sus
// créditos".
//
// El banco es un lujo que puede tardar meses; el botón lo usa alguien que está
// dando de alta una propiedad AHORA. Así que el banco se queda con una parte
// chica y el resto es para las personas.
const TOPE_DIARIO = 150

// Los tres modelos :free que tenía (llama-3.3, deepseek-v3, mistral-7b) ya
// no existen en OpenRouter: responden "This model is unavailable for free" y
// "No endpoints found". Estos sí están vigentes (verificado contra
// openrouter.ai/api/v1/models).
const MODELOS_OPENROUTER = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
]
// llama-3.3-70b-versatile / llama-3.1-8b-instant YA NO están disponibles
// (Groq los retiró) — confirmado contra /openai/v1/models con la key real.
const MODELOS_GROQ = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']
const MODELOS_GEMINI = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-2.5-flash']

const ENFOQUES = [
  'Resalta el ESTILO DE VIDA y la comodidad para la familia.',
  'Enfócalo como una gran OPORTUNIDAD DE INVERSIÓN y plusvalía de la zona.',
  'Tono CÁLIDO y acogedor, como un hogar donde crear recuerdos.',
  'Tono ELEGANTE y premium, resaltando acabados y exclusividad.',
  'Destaca la UBICACIÓN y conectividad: lo práctico de vivir ahí.',
  'Enfócalo a quien busca ESPACIO y confort, ideal para crecer.',
  'Tono FRESCO y moderno, para un comprador joven.',
  'Tono DIRECTO y claro, sin adornos: qué es y por qué conviene.',
  'Cuéntalo como un RECORRIDO: lo que se va viendo al entrar.',
  'Arranca por lo que HACE DIFERENTE a esta propiedad del resto.',
]

// Cada plantilla cambia el armazón: cómo abre, cómo rotula el precio, cómo
// titula las secciones y cómo cierra. Medido en la base: 1,239 descripciones
// terminaban con la misma frase y 1,344 traían el mismo bloque "Precio:" —
// esa huella repetida es justo lo que agarra un filtro antispam.
// Marcas que se resuelven al armar el prompt: {TIPO} → "casa"/"departamento",
// {ESTE} → este/esta y {LO} → lo/la, según el género del tipo. Los cierres se escriben
// COMPLETOS, con su punto final: la primera versión salía cortada ("conoce
// este excelente") porque el tipo se armaba aparte y aquí no se pegaba.
//
// Los cierres invitan a agendar o a venir a conocer la propiedad. Lo que NO
// hacen es nombrar un canal fuera de Marketplace (WhatsApp, teléfono,
// enlaces): eso es lo que Facebook penaliza, no la invitación en sí.
const PLANTILLAS = [
  { precio: '💰 Precio: ', distribucion: '🏠 Distribución',      equipo: '🏢 Equipamiento',   amenidades: '🌟 Amenidades',     cierre: 'Agenda una visita y conóce{LO}.' },
  { precio: '🏷️ ',         distribucion: '📐 Cómo está repartida', equipo: '🔧 Con qué cuenta', amenidades: '🎯 Extras',         cierre: 'Ven a conocer {ESTE} {TIPO}.' },
  { precio: '💵 Pide: ',   distribucion: '🗝️ Espacios',           equipo: '⚙️ Instalaciones',  amenidades: '🏖️ Para disfrutar', cierre: 'Agenda tu visita cuando gustes.' },
  { precio: '📊 En ',      distribucion: '🚪 Por dentro',          equipo: '🧰 Equipada con',   amenidades: '✨ Además',         cierre: 'Te invito a conocer{LO} en persona.' },
  { precio: '💲 ',         distribucion: '🧭 Distribución',        equipo: '🔌 Servicios',      amenidades: '🌳 Amenidades',     cierre: 'Pide tu cita para ver{LO}.' },
  { precio: '🪙 Precio ',  distribucion: '🛋️ Áreas',               equipo: '🚰 Incluye',        amenidades: '🎈 Disfruta de',    cierre: 'Agenda una cita y pása{LO} a ver.' },
  { precio: '🧾 Valor: ',  distribucion: '📋 Lo que tiene',        equipo: '🛠️ Equipamiento',   amenidades: '🥂 Amenidades',     cierre: 'Ven a ver{LO} y checa si es para ti.' },
  { precio: '💰 ',         distribucion: '🏡 Interior',            equipo: '💡 Equipada',       amenidades: '🌞 Comunidad',      cierre: 'Agenda tu recorrido por {ESTE} {TIPO}.' },
  { precio: '🔖 Precio: ', distribucion: '📏 Espacios y medidas',  equipo: '🧱 Acabados',       amenidades: '🏊 Amenidades',     cierre: 'Pása{LO} a conocer, agenda tu visita.' },
  { precio: '🤝 ',         distribucion: '🚶 Recorrido',           equipo: '📦 Lo que incluye', amenidades: '🎪 Zona común',     cierre: 'Te espero para mostrarte {ESTE} {TIPO}.' },
]

/** fetch con tope de tiempo: sin esto, un modelo colgado bloquea la corrida. */
async function fetchConTope(url: string, opciones: RequestInit) {
  const corte = AbortSignal.timeout(LIMITE_LLAMADA_MS)
  return await fetch(url, { ...opciones, signal: corte })
}

async function llamarOpenRouter(apiKey: string, model: string, prompt: string) {
  const r = await fetchConTope('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://valera.app' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.95, max_tokens: 4000 }),
  })
  const json = await r.json()
  if (!r.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const texto = (json.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return texto ? { ok: true, texto } : { ok: false, err: 'Respuesta vacia' }
}

async function llamarGroq(apiKey: string, model: string, prompt: string) {
  const r = await fetchConTope('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    // reasoning_effort:'low' — los "gpt-oss" son modelos de razonamiento: sin
    // esto, el razonamiento se come max_tokens y el content queda vacío.
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.95, max_tokens: 4500, reasoning_effort: 'low' }),
  })
  const json = await r.json()
  if (!r.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const texto = (json.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return texto ? { ok: true, texto } : { ok: false, err: 'Respuesta vacia' }
}

async function llamarGemini(apiKey: string, model: string, prompt: string) {
  const r = await fetchConTope(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, maxOutputTokens: 6500 } }),
  })
  const json = await r.json()
  if (!r.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? []
  const texto = parts.filter(p => p && !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim()
  return texto ? { ok: true, texto } : { ok: false, err: 'Respuesta vacia de Gemini' }
}

function armarPrompt(p: any, idx: number) {
  const emojiTipo = p.tipo === 'casa' ? '🏡' : p.tipo === 'departamento' ? '🏢' : p.tipo === 'local' ? '🏪' : p.tipo === 'terreno' ? '🌄' : '🏠'
  const tipoLabel = p.tipo === 'casa' ? 'Casa' : p.tipo === 'departamento' ? 'Departamento' : p.tipo === 'local' ? 'Local' : p.tipo === 'terreno' ? 'Terreno' : 'Propiedad'
  const opLabel = p.operacion === 'renta' ? 'en Renta' : 'en Venta'
  const precioFmt = p.precio ? `$${parseInt(String(p.precio)).toLocaleString('es-MX')} MXN` : null

  const t = PLANTILLAS[idx % PLANTILLAS.length]
  const enfoque = ENFOQUES[(idx * 3 + 1) % ENFOQUES.length]

  const lineasDatos: string[] = []
  if (p.recamaras)        lineasDatos.push(`🛏️ ${p.recamaras} recámara${p.recamaras > 1 ? 's' : ''}`)
  if (p.banos)            lineasDatos.push(`🚿 ${p.banos} baño${p.banos > 1 ? 's completos' : ' completo'}${p.medios_banos ? ` + ${p.medios_banos} medio baño${p.medios_banos > 1 ? 's' : ''}` : ''}`)
  if (p.estacionamientos) lineasDatos.push(`🚗 ${p.estacionamientos} estacionamiento${p.estacionamientos > 1 ? 's' : ''}`)

  // Concordancia: casa y propiedad son femeninas; departamento, local y
  // terreno, masculinos. Sin esto salía "Ven a conocer esta departamento".
  const fem = p.tipo === 'casa' || !['departamento', 'local', 'terreno'].includes(p.tipo)
  const cierreResuelto = t.cierre
    .replace(/\{TIPO\}/g, tipoLabel.toLowerCase())
    .replace(/\{ESTE\}/g, fem ? 'esta' : 'este')
    .replace(/\{LO\}/g, fem ? 'la' : 'lo')

  return `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional para publicar esta propiedad en portales y redes (Facebook Marketplace, grupos, etc.).

🎲 ESTA ES LA VERSIÓN #${idx + 1} de esta propiedad. Cada versión la publica una persona DISTINTA, así que debe leerse como un anuncio escrito por otra persona: cambia la apertura, el orden de las ideas, los adjetivos y el largo de las frases. ⚠️ Los DATOS y NÚMEROS deben ser EXACTAMENTE los mismos; solo cambia la redacción.
🎯 ENFOQUE de esta versión: ${enfoque}

DATOS (usa estos números exactos, no inventes):
- Tipo: ${tipoLabel} ${opLabel}
- Zona: ${p.direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M² de construcción: ${p.m2 ? `${p.m2} m²` : 'No especificado'}
- M² de terreno: ${p.m2_terreno ? `${p.m2_terreno} m²` : 'No especificado'}
- Recámaras: ${p.recamaras ?? 'No especificado'}
- Baños completos: ${p.banos ?? 'No especificado'}
- Medios baños: ${p.medios_banos ?? 0}
- Estacionamientos: ${p.estacionamientos ?? 'No especificado'}
- Descripción original: ${p.descripcion || '(sin descripción)'}

⛔ REGLAS ESTRICTAS (OBLIGATORIAS):
1. NUNCA incluyas nombres de inmobiliarias, agencias, marcas, asesores, brokers ni personas.
2. NUNCA incluyas teléfonos, WhatsApp, claves/códigos (EB-XXXX, VR-XXXX, MLS, folios), correos, sitios web ni enlaces.
3. NUNCA hables de comisiones, "comparto comisión", porcentajes ni acuerdos entre asesores.
4. En el texto libre NO escribas cifras: nada de precios, metros, cantidades ni años. Los únicos números permitidos son los de las líneas de datos (precio, 📐, 🛏️/🚿/🚗). La prosa describe cualidades, no números.
5. La descripción es SOLO sobre la propiedad: espacios, acabados, ambiente y entorno.
6. EMOJIS: cada emoji debe representar lo que dice su línea. No repitas el mismo emoji (salvo 🛏️ para varias recámaras). Varía.
7. Todo hecho que menciones tiene que salir de los DATOS o de la descripción original. Si algo no viene ahí, no lo pongas.

Responde ÚNICAMENTE con la descripción en este formato:

${emojiTipo} ${tipoLabel} ${opLabel}${p.direccion ? ` en ${p.direccion}` : ''}

${t.precio}${precioFmt || 'Consultar precio'}
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${p.m2 ? `\n📐 Construcción: ${p.m2} m²` : ''}${p.m2_terreno ? `\n🌐 Terreno: ${p.m2_terreno} m²` : ''}

✨ [2-3 oraciones atractivas según el enfoque indicado. Sin números, sin nombres, sin comisiones]

${t.distribucion}

[Lista de espacios, un emoji por línea, inferidos de la descripción original]
${p.tipo !== 'terreno' ? `
[Si la descripción original menciona equipamiento, agrega la sección "${t.equipo}" con sus líneas; si no, omítela por completo.]
[Si menciona amenidades, agrega "${t.amenidades}" con sus líneas; si no, omítela.]
` : ''}
📍 [2-3 oraciones sobre ubicación/conectividad. Sin números, sin nombres, sin teléfonos]

📲 ${cierreResuelto}`
}

// Último filtro antes de guardar: si la IA se saltó una regla, la versión no
// entra al banco. Vale más dejar el hueco (la app cae a la descripción
// guardada) que servir un texto que Marketplace rechaza.
function pasaRevision(texto: string): string | null {
  if (texto.length < 150) return 'muy corta'
  // La IA a veces se corta a media frase (se le acaban los tokens). Un texto
  // completo termina en puntuación; uno cortado termina en una palabra sola.
  if (!/[.!?)"»]\s*$/.test(texto)) return 'quedó cortada a media frase'
  if (/\b\d{10}\b/.test(texto.replace(/[\s-]/g, ''))) return 'trae un teléfono'
  if (/whatsapp|wa\.me|https?:\/\/|@[a-z0-9.-]+\.[a-z]{2,}/i.test(texto)) return 'trae contacto o enlace'
  if (/\b(EB|VR|MLS)-?\d{3,}/i.test(texto)) return 'trae una clave de inventario'
  if (/comisi[oó]n/i.test(texto)) return 'menciona comisión'
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!openrouterKey && !groqKey && !geminiKey) throw new Error('No hay ninguna IA configurada')

    let cuerpo: any = {}
    try { cuerpo = await req.json() } catch { /* el cron manda {} */ }
    const nProps = Math.min(Number(cuerpo.propiedades) || PROPIEDADES_POR_CORRIDA, 10)
    const nVars = Math.min(Number(cuerpo.porPropiedad) || VARIANTES_POR_PROPIEDAD, 10)

    // ── Freno: el banco no se come la cuota que necesitan las personas ───────
    // Se cuenta lo generado en las últimas 24h y se para en seco al llegar al
    // tope. Sin esto, el job agota las cuotas gratis y el botón de "mejorar
    // descripción" de los asesores empieza a fallar.
    const { count: hechasHoy } = await supa
      .from('propiedad_descripcion_variantes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if ((hechasHoy ?? 0) >= TOPE_DIARIO) {
      return new Response(JSON.stringify({
        ok: true, pausado: true, hechas_24h: hechasHoy, tope: TOPE_DIARIO,
        mensaje: 'Tope diario del banco alcanzado. La cuota que queda es para el botón de los asesores.',
      }), { headers: CORS })
    }
    // No pasarse del tope dentro de esta misma corrida.
    const margen = TOPE_DIARIO - (hechasHoy ?? 0)

    const { data: pendientes, error: ePend } = await supa.rpc('propiedades_sin_variantes', { p_limite: nProps })
    if (ePend) throw new Error('No se pudo leer la cola: ' + ePend.message)
    if (!pendientes?.length) {
      return new Response(JSON.stringify({ ok: true, mensaje: 'Banco completo, nada por generar.' }), { headers: CORS })
    }

    const resumen: any[] = []

    // ── 1) Se arma la lista de trabajos (propiedad + índice que falta) ────────
    // Una sola consulta para las propiedades y otra para los índices ya
    // ocupados, en vez de dos por propiedad: con 8 propiedades eran 16 viajes
    // a la base antes de llamar a la primera IA.
    const ids = pendientes.map((p: any) => p.propiedad_id)
    const [{ data: props }, { data: yaHay }] = await Promise.all([
      supa.from('propiedades')
        .select('id, codigo, titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos')
        .in('id', ids),
      supa.from('propiedad_descripcion_variantes').select('propiedad_id, idx').in('propiedad_id', ids),
    ])
    const porId = new Map((props ?? []).map((p: any) => [p.id, p]))
    const ocupados = new Map<string, Set<number>>()
    for (const v of yaHay ?? []) {
      if (!ocupados.has(v.propiedad_id)) ocupados.set(v.propiedad_id, new Set())
      ocupados.get(v.propiedad_id)!.add(v.idx)
    }

    type Trabajo = { prop: any; idx: number }
    const trabajos: Trabajo[] = []
    for (const pend of pendientes) {
      const prop = porId.get(pend.propiedad_id)
      if (!prop) { resumen.push({ codigo: pend.codigo, error: 'no encontrada' }); continue }
      const usados = ocupados.get(pend.propiedad_id) ?? new Set<number>()
      let puestas = 0
      for (let idx = 0; idx < pend.objetivo && puestas < nVars; idx++) {
        if (usados.has(idx)) continue
        trabajos.push({ prop, idx })
        puestas++
      }
    }

    // ── 2) Se generan en PARALELO, con presupuesto de tiempo ─────────────────
    // Las edge functions mueren a los 150s ("IDLE_TIMEOUT"). En serie, una
    // corrida apenas alcanzaba 1 o 2 versiones porque cada llamada a la IA
    // tarda segundos y encima se iban round-trips tropezando con modelos
    // muertos. En paralelo entran muchas más en el mismo presupuesto.
    //
    // Cada versión que sale se guarda de inmediato, así que si la corrida se
    // corta a medias lo ya generado NO se pierde y la siguiente sigue donde
    // quedó.
    const arranque = Date.now()
    const quedaTiempo = () => Date.now() - arranque < LIMITE_MS

    async function generarUna({ prop, idx }: Trabajo) {
      const prompt = armarPrompt(prop, idx)
      const fallos: string[] = []

      // Se prueba OpenRouter y luego Gemini, pero con tope por llamada: un
      // modelo colgado se llevaba todo el presupuesto de la corrida.
      const intentos: Array<() => Promise<{ ok: boolean; texto?: string; err?: string; modelo: string }>> = []
      if (openrouterKey) for (const m of MODELOS_OPENROUTER) {
        intentos.push(async () => ({ ...(await llamarOpenRouter(openrouterKey, m, prompt)), modelo: m }))
      }
      if (groqKey) for (const m of MODELOS_GROQ) {
        intentos.push(async () => ({ ...(await llamarGroq(groqKey, m, prompt)), modelo: `groq/${m}` }))
      }
      if (geminiKey) for (const m of MODELOS_GEMINI) {
        intentos.push(async () => ({ ...(await llamarGemini(geminiKey, m, prompt)), modelo: `gemini/${m}` }))
      }

      for (const intento of intentos) {
        if (!quedaTiempo()) return { codigo: prop.codigo, idx, error: 'se acabó el tiempo de la corrida' }
        let r
        try { r = await intento() } catch (e: any) { fallos.push('excepción: ' + (e?.message ?? e)); continue }
        if (!r.ok) { fallos.push(`${r.modelo}: ${String(r.err).slice(0, 90)}`); continue }

        const motivo = pasaRevision(r.texto!)
        // Si el texto no pasa revisión se prueba el siguiente modelo en vez de
        // rendirse: antes se descartaba la versión y quedaba el hueco.
        if (motivo) { fallos.push(`${r.modelo}: descartado (${motivo})`); continue }

        const { error: eIns } = await supa
          .from('propiedad_descripcion_variantes')
          .insert({ propiedad_id: prop.id, idx, texto: r.texto, modelo: r.modelo })
        // 23505 = ya existe ese (propiedad, idx). Pasa si dos corridas se
        // cruzan; no es un error que valga la pena reportar.
        if (eIns) return { codigo: prop.codigo, idx, error: eIns.code === '23505' ? 'ya existía' : eIns.message }
        return { codigo: prop.codigo, idx, ok: true, modelo: r.modelo, largo: r.texto!.length }
      }
      return { codigo: prop.codigo, idx, error: 'ninguna IA dio un texto válido', fallos }
    }

    // El margen recorta la tanda para no rebasar el tope diario a mitad de
    // corrida.
    const aGenerar = trabajos.slice(0, margen)
    for (let i = 0; i < aGenerar.length && quedaTiempo(); i += EN_PARALELO) {
      const tanda = aGenerar.slice(i, i + EN_PARALELO)
      resumen.push(...await Promise.all(tanda.map(generarUna)))
    }

    const generadas = resumen.filter(r => r.ok).length
    const segundos = Math.round((Date.now() - arranque) / 1000)
    console.log(`[variantes-lote] ${generadas}/${aGenerar.length} en ${segundos}s (tope diario ${TOPE_DIARIO}, llevaba ${hechasHoy})`)
    return new Response(JSON.stringify({
      ok: true, generadas, pedidas: aGenerar.length, hechas_24h: hechasHoy, tope: TOPE_DIARIO, segundos, detalle: resumen,
    }), { headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[variantes-descripcion-lote]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS })
  }
})
