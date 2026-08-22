import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function getHoyMX(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Mexico_City',
  })
}

const SYSTEM_PROMPT = `Eres Valera IA, el asistente interno de la plataforma Valera para administradores de inmobiliarias en México.

Tienes acceso a datos en tiempo real del equipo. SIEMPRE usa las herramientas disponibles antes de responder preguntas sobre datos — nunca inventes cifras.

Pautas:
- Responde siempre en español, de forma concisa y directa
- Usa emojis y listas para presentar datos de forma legible
- Si no tienes datos suficientes, dilo claramente
- Hoy es ${getHoyMX()}`

const HERRAMIENTAS = [
  {
    name: 'consultar_actividad_equipo',
    description: 'Obtiene la actividad del equipo: publicaciones, clientes nuevos, seguimientos e interacciones por prospectador. Ideal para ver quién trabajó más, quién estuvo inactivo, o el resumen del equipo en un período.',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Días hacia atrás (1=hoy, 7=semana, 30=mes). Default 7' },
        limite: { type: 'integer', description: 'Máximo de prospectadores en el resultado. Default 15' },
      },
    },
  },
  {
    name: 'consultar_inventario',
    description: 'Estadísticas del inventario de propiedades: totales, publicadas, por tipo y operación. Opcionalmente filtra por zona o tipo.',
    parameters: {
      type: 'object',
      properties: {
        zona: { type: 'string', description: 'Filtrar por zona o ciudad (opcional)' },
        tipo: { type: 'string', description: 'casa | departamento | terreno | local (opcional)' },
      },
    },
  },
  {
    name: 'consultar_leads_pool',
    description: 'Información del pool de leads sin asignar y leads recientes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_prospectos_inactivos',
    description: 'Lista los prospectadores que no han tenido actividad en los últimos N días (según su último acceso).',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Días sin actividad para considerar inactivo. Default 3' },
      },
    },
  },
  {
    name: 'consultar_pipeline_crm',
    description: 'Resumen del CRM: total de clientes, distribución por etapa/interés y top prospectadores con más clientes.',
    parameters: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Cuántos prospectadores mostrar en el ranking. Default 10' },
      },
    },
  },
  {
    name: 'consultar_ranking_publicaciones',
    description: 'Ranking de prospectadores por número de propiedades publicadas en un período.',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Período en días. Default 7' },
        limite: { type: 'integer', description: 'Cuántos mostrar. Default 10' },
      },
    },
  },
]

async function ejecutarHerramienta(
  nombre: string,
  args: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
): Promise<unknown> {
  try {
    if (nombre === 'consultar_actividad_equipo') {
      const dias = args.dias ?? 7
      const limite = args.limite ?? 15
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)
      inicio.setHours(0, 0, 0, 0)
      const inicioISO = inicio.toISOString()

      const [prosRes, pubsRes, cliRes, segRes, interRes] = await Promise.all([
        supabase.from('prospectadores').select('id, nombre').limit(200),
        supabase.from('propiedad_publicacion').select('user_id').eq('publicada', true).gte('fecha_publicacion', inicioISO),
        supabase.from('clientes').select('responsable_id').gte('created_at', inicioISO),
        supabase.from('seguimientos_dia').select('user_id').gte('created_at', inicioISO),
        supabase.from('interacciones').select('user_id').in('tipo', ['mensaje', 'llamada']).gte('created_at', inicioISO),
      ])

      const prospectos = prosRes.data ?? []
      const mapa = new Map<string, any>()
      for (const p of prospectos) mapa.set(p.id, { nombre: p.nombre, pubs: 0, clientes: 0, seguimientos: 0, interacciones: 0 })

      for (const r of pubsRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).pubs++
      for (const r of cliRes.data ?? []) if (mapa.has(r.responsable_id)) mapa.get(r.responsable_id).clientes++
      for (const r of segRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).seguimientos++
      for (const r of interRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).interacciones++

      const lista = Array.from(mapa.values())
        .sort((a, b) => (b.pubs + b.clientes + b.seguimientos + b.interacciones) - (a.pubs + a.clientes + a.seguimientos + a.interacciones))
        .slice(0, limite)

      return { periodo_dias: dias, total_prospectadores: prospectos.length, actividad: lista }
    }

    if (nombre === 'consultar_inventario') {
      let query = supabase.from('propiedades').select('tipo, operacion, publicada')
      if (args.zona) query = query.ilike('zona', `%${args.zona}%`)
      if (args.tipo) query = query.eq('tipo', args.tipo)
      const { data } = await query.limit(2000)
      if (!data?.length) return { total: 0, mensaje: 'No se encontraron propiedades' }

      const por_tipo: Record<string, number> = {}
      const por_operacion: Record<string, number> = {}
      let publicadas = 0
      for (const p of data) {
        por_tipo[p.tipo] = (por_tipo[p.tipo] || 0) + 1
        por_operacion[p.operacion] = (por_operacion[p.operacion] || 0) + 1
        if (p.publicada) publicadas++
      }

      return { total: data.length, publicadas, sin_publicar: data.length - publicadas, por_tipo, por_operacion }
    }

    if (nombre === 'consultar_leads_pool') {
      const [totalRes, sinAsignarRes, recientesRes] = await Promise.all([
        supabase.from('leads_pool').select('*', { count: 'exact', head: true }),
        supabase.from('leads_pool').select('*', { count: 'exact', head: true }).eq('asignado', false),
        supabase.from('leads_pool').select('nombre, created_at').order('created_at', { ascending: false }).limit(5),
      ])
      return {
        total_leads: totalRes.count ?? 0,
        sin_asignar: sinAsignarRes.count ?? 0,
        leads_recientes: recientesRes.data ?? [],
      }
    }

    if (nombre === 'consultar_prospectos_inactivos') {
      const dias = args.dias ?? 3
      const corte = new Date()
      corte.setDate(corte.getDate() - dias)

      const [prosRes, statsRes] = await Promise.all([
        supabase.from('prospectadores').select('id, nombre').limit(200),
        supabase.from('user_stats').select('id, ultimo_acceso'),
      ])

      const prospectos = prosRes.data ?? []
      const accesos = new Map((statsRes.data ?? []).map((s: any) => [s.id, s.ultimo_acceso]))

      const inactivos = prospectos
        .filter((p: any) => {
          const ua = accesos.get(p.id)
          return !ua || new Date(ua) < corte
        })
        .map((p: any) => ({ nombre: p.nombre, ultimo_acceso: accesos.get(p.id) ?? 'Nunca' }))

      return { dias_umbral: dias, total_inactivos: inactivos.length, inactivos }
    }

    if (nombre === 'consultar_pipeline_crm') {
      const limite = args.limite ?? 10

      const [totalRes, etapaRes, porUserRes] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('clientes').select('interes').limit(2000),
        supabase.from('clientes').select('responsable_id').limit(2000),
      ])

      const por_etapa: Record<string, number> = {}
      for (const c of etapaRes.data ?? []) {
        const e = (c.interes || 'Sin clasificar').toString()
        por_etapa[e] = (por_etapa[e] || 0) + 1
      }

      const conteoPorId: Record<string, number> = {}
      for (const c of porUserRes.data ?? []) {
        conteoPorId[c.responsable_id] = (conteoPorId[c.responsable_id] || 0) + 1
      }

      const topIds = Object.entries(conteoPorId)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, limite)
        .map(([id]) => id)

      const { data: nombres } = await supabase
        .from('prospectadores').select('id, nombre').in('id', topIds)

      const nombresMap = new Map((nombres ?? []).map((p: any) => [p.id, p.nombre]))
      const ranking = topIds.map(id => ({ nombre: nombresMap.get(id) || id, clientes: conteoPorId[id] }))

      return { total_clientes: totalRes.count ?? 0, por_etapa, top_prospectadores: ranking }
    }

    if (nombre === 'consultar_ranking_publicaciones') {
      const dias = args.dias ?? 7
      const limite = args.limite ?? 10
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)

      const { data: pubs } = await supabase
        .from('propiedad_publicacion')
        .select('user_id')
        .eq('publicada', true)
        .gte('fecha_publicacion', inicio.toISOString())
        .limit(5000)

      const conteo: Record<string, number> = {}
      for (const p of pubs ?? []) conteo[p.user_id] = (conteo[p.user_id] || 0) + 1

      const topIds = Object.entries(conteo)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limite)
        .map(([id]) => id)

      const { data: nombres } = await supabase
        .from('prospectadores').select('id, nombre').in('id', topIds)

      const nombresMap = new Map((nombres ?? []).map((p: any) => [p.id, p.nombre]))
      const ranking = topIds.map((id, i) => ({
        posicion: i + 1,
        nombre: nombresMap.get(id) || id,
        publicaciones: conteo[id],
      }))

      return { periodo_dias: dias, ranking }
    }

    return { error: `Herramienta desconocida: ${nombre}` }
  } catch (e) {
    return { error: `Error al ejecutar ${nombre}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp']

async function llamarGemini(
  apiKey: string,
  model: string,
  contents: unknown[],
): Promise<{ ok: boolean; json?: any; err?: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ function_declarations: HERRAMIENTAS }],
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    },
  )
  const json = await res.json()
  if (!res.ok) return { ok: false, err: json?.error?.message ?? `HTTP ${res.status}` }
  return { ok: true, json }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) throw new Error('Falta GEMINI_API_KEY en los secrets de Supabase')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { mensaje, historial = [] } = await req.json()
    if (!mensaje?.trim()) throw new Error('El campo "mensaje" es requerido')

    // Construir historial en formato Gemini
    const contents: any[] = []
    for (const m of historial) {
      contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })
    }
    contents.push({ role: 'user', parts: [{ text: mensaje }] })

    // Bucle de function calling (máx 5 rondas para evitar loops infinitos)
    let respuestaFinal: string | null = null
    let intentos = 0

    while (!respuestaFinal && intentos < 5) {
      intentos++

      let resultado: { ok: boolean; json?: any; err?: string } = { ok: false, err: 'Sin modelos' }
      for (const modelo of MODELOS) {
        resultado = await llamarGemini(geminiKey, modelo, contents)
        if (resultado.ok) break
        console.warn(`[valera-ai] ${modelo} falló: ${resultado.err}`)
      }

      if (!resultado.ok || !resultado.json) {
        throw new Error(`Gemini no respondió: ${resultado.err}`)
      }

      const parts: any[] = resultado.json?.candidates?.[0]?.content?.parts ?? []
      const llamadas = parts.filter((p: any) => p.functionCall)
      const textos = parts.filter((p: any) => typeof p.text === 'string' && p.text.trim())

      if (llamadas.length > 0) {
        // Agregar respuesta del modelo (con las llamadas a funciones) al historial
        contents.push({ role: 'model', parts })

        // Ejecutar todas las funciones y agregar resultados
        const resultados = await Promise.all(
          llamadas.map(async (p: any) => {
            const { name, args } = p.functionCall
            console.log(`[valera-ai] herramienta: ${name}`, JSON.stringify(args))
            const res = await ejecutarHerramienta(name, args ?? {}, supabase)
            return { functionResponse: { name, response: res } }
          }),
        )
        contents.push({ role: 'user', parts: resultados })
      } else if (textos.length > 0) {
        respuestaFinal = textos.map((p: any) => p.text).join('').trim()
      } else {
        respuestaFinal = 'No pude generar una respuesta. Intenta de nuevo.'
      }
    }

    return new Response(JSON.stringify({ respuesta: respuestaFinal }), { headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[valera-ai]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS })
  }
})
