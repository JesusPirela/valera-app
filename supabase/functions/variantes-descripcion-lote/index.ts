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

// Cuánto se genera por corrida. Con el cron cada 2 min son ~4,300 al día, que
// es lo que aguantan las cuotas gratis de OpenRouter + Gemini juntas. Si se
// agotan, la corrida falla sin daño y la siguiente reintenta. Ajustable aquí.
const PROPIEDADES_POR_CORRIDA = 3
const VARIANTES_POR_PROPIEDAD = 2

const MODELOS_OPENROUTER = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'mistralai/mistral-7b-instruct:free',
]
const MODELOS_GEMINI = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']

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
// {TIPO} se reemplaza por "casa"/"departamento"/etc. Los cierres se escriben
// COMPLETOS, con su punto final: la primera versión salía cortada ("conoce
// este excelente") porque el tipo se armaba aparte y aquí no se pegaba.
//
// Los cierres NO mandan a contactar por fuera ("escríbeme", "mándame mensaje",
// "déjame tus datos"). Marketplace penaliza los anuncios que sacan la
// conversación de la plataforma: el comprador ya tiene ahí su botón de
// mensaje. Son frases neutras, y varias ni siquiera piden nada.
const PLANTILLAS = [
  { precio: '💰 Precio: ', distribucion: '🏠 Distribución',      equipo: '🏢 Equipamiento',   amenidades: '🌟 Amenidades',     cierre: 'Se muestra con cita previa.' },
  { precio: '🏷️ ',         distribucion: '📐 Cómo está repartida', equipo: '🔧 Con qué cuenta', amenidades: '🎯 Extras',         cierre: 'Una {TIPO} que se aprecia mejor en persona.' },
  { precio: '💵 Pide: ',   distribucion: '🗝️ Espacios',           equipo: '⚙️ Instalaciones',  amenidades: '🏖️ Para disfrutar', cierre: 'Disponible para visitas.' },
  { precio: '📊 En ',      distribucion: '🚪 Por dentro',          equipo: '🧰 Equipada con',   amenidades: '✨ Además',         cierre: 'Quedo al pendiente de cualquier duda sobre la propiedad.' },
  { precio: '💲 ',         distribucion: '🧭 Distribución',        equipo: '🔌 Servicios',      amenidades: '🌳 Amenidades',     cierre: 'Vale la pena conocerla.' },
  { precio: '🪙 Precio ',  distribucion: '🛋️ Áreas',               equipo: '🚰 Incluye',        amenidades: '🎈 Disfruta de',    cierre: 'Se pueden coordinar visitas.' },
  { precio: '🧾 Valor: ',  distribucion: '📋 Lo que tiene',        equipo: '🛠️ Equipamiento',   amenidades: '🥂 Amenidades',     cierre: 'Una opción a considerar en la zona.' },
  { precio: '💰 ',         distribucion: '🏡 Interior',            equipo: '💡 Equipada',       amenidades: '🌞 Comunidad',      cierre: 'Lista para visitas.' },
  { precio: '🔖 Precio: ', distribucion: '📏 Espacios y medidas',  equipo: '🧱 Acabados',       amenidades: '🏊 Amenidades',     cierre: 'El recorrido completo se hace en la visita.' },
  { precio: '🤝 ',         distribucion: '🚶 Recorrido',           equipo: '📦 Lo que incluye', amenidades: '🎪 Zona común',     cierre: 'Esta {TIPO} está disponible para conocerla.' },
]

async function llamarOpenRouter(apiKey: string, model: string, prompt: string) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://valera.app' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.95, max_tokens: 4000 }),
  })
  const json = await r.json()
  if (!r.ok) return { ok: false, err: json?.error?.message ?? JSON.stringify(json) }
  const texto = (json.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return texto ? { ok: true, texto } : { ok: false, err: 'Respuesta vacia' }
}

async function llamarGemini(apiKey: string, model: string, prompt: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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

  return `Eres un experto copywriter inmobiliario en México. Genera una descripción profesional para publicar esta propiedad en portales y redes (Facebook Marketplace, grupos, etc.).

🎲 ESTA ES LA VERSIÓN #${idx + 1} de esta propiedad. Cada versión la publica una persona DISTINTA, así que debe leerse como un anuncio escrito por otra persona: cambia la apertura, el orden de las ideas, los adjetivos y el largo de las frases. ⚠️ Los DATOS y NÚMEROS deben ser EXACTAMENTE los mismos; solo cambia la redacción.
🎯 ENFOQUE de esta versión: ${enfoque}

DATOS (usa estos números exactos, no inventes):
- Tipo: ${tipoLabel} ${opLabel}
- Zona: ${p.direccion || 'No especificada'}
- Precio: ${precioFmt || 'Consultar'}
- M²: ${p.m2 ? `${p.m2} m²` : 'No especificado'}
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
${lineasDatos.length ? '\n' + lineasDatos.join('\n') : ''}${p.m2 ? `\n📐 Construcción: ${p.m2} m²` : ''}

✨ [2-3 oraciones atractivas según el enfoque indicado. Sin números, sin nombres, sin comisiones]

${t.distribucion}

[Lista de espacios, un emoji por línea, inferidos de la descripción original]
${p.tipo !== 'terreno' ? `
[Si la descripción original menciona equipamiento, agrega la sección "${t.equipo}" con sus líneas; si no, omítela por completo.]
[Si menciona amenidades, agrega "${t.amenidades}" con sus líneas; si no, omítela.]
` : ''}
📍 [2-3 oraciones sobre ubicación/conectividad. Sin números, sin nombres, sin teléfonos]

📲 ${t.cierre.replace('{TIPO}', tipoLabel.toLowerCase())}`
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
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!openrouterKey && !geminiKey) throw new Error('No hay ninguna IA configurada')

    let cuerpo: any = {}
    try { cuerpo = await req.json() } catch { /* el cron manda {} */ }
    const nProps = Math.min(Number(cuerpo.propiedades) || PROPIEDADES_POR_CORRIDA, 10)
    const nVars = Math.min(Number(cuerpo.porPropiedad) || VARIANTES_POR_PROPIEDAD, 10)

    const { data: pendientes, error: ePend } = await supa.rpc('propiedades_sin_variantes', { p_limite: nProps })
    if (ePend) throw new Error('No se pudo leer la cola: ' + ePend.message)
    if (!pendientes?.length) {
      return new Response(JSON.stringify({ ok: true, mensaje: 'Banco completo, nada por generar.' }), { headers: CORS })
    }

    const resumen: any[] = []

    for (const pend of pendientes) {
      const { data: prop, error: eProp } = await supa
        .from('propiedades')
        .select('id, codigo, titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, medios_banos, m2, estacionamientos')
        .eq('id', pend.propiedad_id)
        .single()
      if (eProp || !prop) { resumen.push({ codigo: pend.codigo, error: eProp?.message ?? 'no encontrada' }); continue }

      // Qué índices ya existen, para rellenar solo los huecos.
      const { data: yaHay } = await supa
        .from('propiedad_descripcion_variantes')
        .select('idx').eq('propiedad_id', prop.id)
      const ocupados = new Set((yaHay ?? []).map((v: any) => v.idx))

      let hechas = 0
      for (let idx = 0; idx < pend.objetivo && hechas < nVars; idx++) {
        if (ocupados.has(idx)) continue

        const prompt = armarPrompt(prop, idx)
        let texto: string | null = null
        let modelo = ''
        const fallos: string[] = []

        if (openrouterKey) {
          for (const m of MODELOS_OPENROUTER) {
            const r = await llamarOpenRouter(openrouterKey, m, prompt)
            if (r.ok) { texto = r.texto!; modelo = m; break }
            fallos.push(`or/${m.split('/')[1]}: ${String(r.err).slice(0, 90)}`)
          }
        }
        if (!texto && geminiKey) {
          for (const m of MODELOS_GEMINI) {
            const g = await llamarGemini(geminiKey, m, prompt)
            if (g.ok) { texto = g.texto!; modelo = `gemini/${m}`; break }
            fallos.push(`gem/${m}: ${String(g.err).slice(0, 90)}`)
          }
        }
        // Se corta la propiedad entera: si ninguna IA responde, las siguientes
        // versiones tampoco van a salir. La próxima corrida reintenta.
        if (!texto) { resumen.push({ codigo: prop.codigo, idx, error: 'todas las IAs fallaron', fallos }); break }

        const motivo = pasaRevision(texto)
        if (motivo) { resumen.push({ codigo: prop.codigo, idx, descartada: motivo, final: texto.slice(-70) }); continue }

        const { error: eIns } = await supa
          .from('propiedad_descripcion_variantes')
          .insert({ propiedad_id: prop.id, idx, texto, modelo })
        if (eIns) { resumen.push({ codigo: prop.codigo, idx, error: eIns.message }); continue }

        hechas++
        resumen.push({ codigo: prop.codigo, idx, ok: true, modelo, largo: texto.length })
      }
    }

    const generadas = resumen.filter(r => r.ok).length
    console.log(`[variantes-lote] ${generadas} generadas de ${pendientes.length} propiedades`)
    return new Response(JSON.stringify({ ok: true, generadas, detalle: resumen }), { headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[variantes-descripcion-lote]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS })
  }
})
