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
  {
    name: 'consultar_sin_publicaciones',
    description: 'Lista los prospectadores que NO han publicado ninguna propiedad en los últimos N días. Úsala para preguntas como "¿quién no ha publicado esta semana?" o "¿quién está inactivo en publicaciones?".',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Período en días. Default 7' },
      },
    },
  },
  {
    name: 'consultar_bloques',
    description: 'Muestra los bloques (grupos de prospectadores), sus miembros y actividad reciente. Puede filtrar por nombre de bloque. Incluye asistencia a reuniones y publicaciones de cada miembro.',
    parameters: {
      type: 'object',
      properties: {
        nombre_bloque: { type: 'string', description: 'Nombre o parte del nombre del bloque a consultar (opcional). Si se omite muestra todos.' },
        dias: { type: 'integer', description: 'Días hacia atrás para la actividad. Default 7' },
      },
    },
  },
  {
    name: 'consultar_citas',
    description: 'Consulta las citas coordinadas y citas de venta: cuántas hay, de quién, y en qué fechas. Úsala para "¿cuántas citas hay hoy/esta semana?", "¿quién tiene citas pendientes?", "¿cuántas ventas se han cerrado?".',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Días hacia adelante o atrás a consultar. Default 7' },
        tipo: { type: 'string', description: 'coordinacion | venta | ambas. Default ambas' },
      },
    },
  },
  {
    name: 'consultar_gamificacion',
    description: 'Ranking de XP, niveles, rachas y monedas del equipo. Úsala para "¿quién tiene más XP?", "¿quién lleva la racha más larga?", "¿quién está en nivel más alto?", "¿cómo van las misiones hoy?".',
    parameters: {
      type: 'object',
      properties: {
        metrica: { type: 'string', description: 'xp | racha | monedas | misiones. Default xp' },
        limite: { type: 'integer', description: 'Cuántos mostrar. Default 10' },
      },
    },
  },
  {
    name: 'consultar_university',
    description: 'Progreso del equipo en Valera University: cursos publicados, quién está estudiando, certificados obtenidos y ranking de avance.',
    parameters: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Cuántos prospectadores mostrar. Default 10' },
      },
    },
  },
  {
    name: 'consultar_tiempo_en_app',
    description: 'Tiempo que cada prospectador ha pasado en la app (minutos conectados). Úsala para "¿quién usa más la app?", "¿cuánto tiempo en promedio pasan conectados?".',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Período en días. Default 7' },
        limite: { type: 'integer', description: 'Cuántos mostrar. Default 10' },
      },
    },
  },
  {
    name: 'consultar_campanias',
    description: 'Estado de las campañas de leads: cuántos leads tiene cada campaña, cuántos fueron asignados y cuántos están pendientes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_recordatorios_vencidos',
    description: 'Recordatorios de clientes que ya pasaron su fecha y no han sido completados. Útil para "¿quién tiene seguimientos atrasados?" o "¿cuántos recordatorios vencidos hay?".',
    parameters: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Cuántos mostrar. Default 15' },
      },
    },
  },
]

// Construye un mapa userId → nombre desde profiles.nombre
// (crear-prospectador siempre guarda el nombre ahí al crear el usuario).
async function buildNombresMap(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('profiles')
    .select('id, nombre')
    .in('role', ['prospectador', 'prospectador_plus', 'supervisor', 'nuevo'])
    .limit(500)
  return new Map<string, string>(
    (data ?? []).map((p: any) => [p.id as string, (p.nombre as string) || p.id]),
  )
}

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

      const [nombresMap, pubsRes, cliRes, segRes, interRes] = await Promise.all([
        buildNombresMap(supabase),
        supabase.from('propiedad_publicacion').select('user_id').eq('publicada', true).gte('fecha_publicacion', inicioISO),
        supabase.from('clientes').select('responsable_id').gte('created_at', inicioISO),
        supabase.from('seguimientos_dia').select('user_id').gte('created_at', inicioISO),
        supabase.from('interacciones').select('user_id').in('tipo', ['mensaje', 'llamada']).gte('created_at', inicioISO),
      ])

      // Inicializar con todos los miembros del equipo (aunque tengan 0 actividad)
      const mapa = new Map<string, any>()
      for (const [uid, nom] of nombresMap) {
        mapa.set(uid, { nombre: nom, pubs: 0, clientes: 0, seguimientos: 0, interacciones: 0 })
      }

      for (const r of pubsRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).pubs++
      for (const r of cliRes.data ?? []) if (mapa.has(r.responsable_id)) mapa.get(r.responsable_id).clientes++
      for (const r of segRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).seguimientos++
      for (const r of interRes.data ?? []) if (mapa.has(r.user_id)) mapa.get(r.user_id).interacciones++

      const lista = Array.from(mapa.values())
        .sort((a, b) => (b.pubs + b.clientes + b.seguimientos + b.interacciones) - (a.pubs + a.clientes + a.seguimientos + a.interacciones))
        .slice(0, limite)

      return { periodo_dias: dias, total_prospectadores: mapa.size, actividad: lista }
    }

    if (nombre === 'consultar_inventario') {
      let query = supabase.from('propiedades').select('tipo, operacion, publicada')
      if (args.zona) query = query.ilike('zona', `%${args.zona}%`)
      if (args.tipo) query = query.eq('tipo', args.tipo)
      const { data } = await query.limit(5000)
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

      const [nombresMap, statsRes] = await Promise.all([
        buildNombresMap(supabase),
        supabase.from('user_stats').select('id, ultimo_acceso'),
      ])

      const accesos = new Map<string, string>(
        (statsRes.data ?? []).map((s: any) => [s.id as string, s.ultimo_acceso as string]),
      )

      const inactivos: { nombre: string; ultimo_acceso: string }[] = []
      for (const [uid, nom] of nombresMap) {
        const ua = accesos.get(uid)
        if (!ua || new Date(ua) < corte) {
          inactivos.push({ nombre: nom, ultimo_acceso: ua ?? 'Nunca' })
        }
      }

      return { dias_umbral: dias, total_inactivos: inactivos.length, inactivos }
    }

    if (nombre === 'consultar_pipeline_crm') {
      const limite = args.limite ?? 10

      const [totalRes, etapaRes, porUserRes, nombresMap] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('clientes').select('interes').limit(5000),
        supabase.from('clientes').select('responsable_id').limit(5000),
        buildNombresMap(supabase),
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

      const ranking = Object.entries(conteoPorId)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limite)
        .map(([uid, total]) => ({ nombre: nombresMap.get(uid) ?? uid, clientes: total }))

      return { total_clientes: totalRes.count ?? 0, por_etapa, top_prospectadores: ranking }
    }

    if (nombre === 'consultar_ranking_publicaciones') {
      const dias = args.dias ?? 7
      const limite = args.limite ?? 10
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)

      const [pubsRes, nombresMap] = await Promise.all([
        supabase.from('propiedad_publicacion').select('user_id')
          .eq('publicada', true)
          .gte('fecha_publicacion', inicio.toISOString())
          .limit(5000),
        buildNombresMap(supabase),
      ])

      const conteo: Record<string, number> = {}
      for (const p of pubsRes.data ?? []) conteo[p.user_id] = (conteo[p.user_id] || 0) + 1

      const ranking = Object.entries(conteo)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limite)
        .map(([uid, pubs], i) => ({
          posicion: i + 1,
          nombre: nombresMap.get(uid) ?? uid,
          publicaciones: pubs,
        }))

      return { periodo_dias: dias, ranking }
    }

    if (nombre === 'consultar_sin_publicaciones') {
      const dias = args.dias ?? 7
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)

      const [nombresMap, pubsRes] = await Promise.all([
        buildNombresMap(supabase),
        supabase.from('propiedad_publicacion').select('user_id')
          .eq('publicada', true)
          .gte('fecha_publicacion', inicio.toISOString()),
      ])

      const publicaronIds = new Set((pubsRes.data ?? []).map((r: any) => r.user_id as string))
      const sinPublicar = Array.from(nombresMap.entries())
        .filter(([uid]) => !publicaronIds.has(uid))
        .map(([, nom]) => nom)
        .sort()

      return {
        periodo_dias: dias,
        total_sin_publicar: sinPublicar.length,
        total_equipo: nombresMap.size,
        sin_publicar: sinPublicar,
      }
    }

    if (nombre === 'consultar_bloques') {
      const dias = args.dias ?? 7
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)
      inicio.setHours(0, 0, 0, 0)
      const inicioISO = inicio.toISOString()

      // Obtener todos los bloques
      let bloquesQuery = supabase.from('bloques').select('id, nombre').order('orden')
      if (args.nombre_bloque) bloquesQuery = bloquesQuery.ilike('nombre', `%${args.nombre_bloque}%`)
      const { data: bloques } = await bloquesQuery

      if (!bloques?.length) return { mensaje: 'No se encontraron bloques' }

      // Miembros de cada bloque (profiles con bloque_id)
      const bloquesIds = bloques.map((b: any) => b.id)
      const [miembrosRes, pubsRes, asistenciaRes] = await Promise.all([
        supabase.from('profiles').select('id, nombre, bloque_id')
          .in('bloque_id', bloquesIds)
          .in('role', ['prospectador', 'prospectador_plus', 'supervisor', 'nuevo']),
        supabase.from('propiedad_publicacion').select('user_id')
          .eq('publicada', true)
          .gte('fecha_publicacion', inicioISO),
        supabase.from('bloque_asistencia').select('user_id, fecha, asistio')
          .gte('fecha', inicio.toISOString().slice(0, 10)),
      ])

      const pubsPorUser: Record<string, number> = {}
      for (const p of pubsRes.data ?? []) pubsPorUser[p.user_id] = (pubsPorUser[p.user_id] || 0) + 1

      const asistioSet = new Set(
        (asistenciaRes.data ?? []).filter((a: any) => a.asistio).map((a: any) => a.user_id),
      )
      const faltoSet = new Set(
        (asistenciaRes.data ?? []).filter((a: any) => !a.asistio).map((a: any) => a.user_id),
      )

      const resumen = bloques.map((b: any) => {
        const miembros = (miembrosRes.data ?? []).filter((m: any) => m.bloque_id === b.id)
        return {
          bloque: b.nombre,
          total_miembros: miembros.length,
          miembros: miembros.map((m: any) => ({
            nombre: m.nombre || m.id,
            publicaciones: pubsPorUser[m.id] ?? 0,
            asistencia_reunion: asistioSet.has(m.id) ? 'asistió' : faltoSet.has(m.id) ? 'no asistió' : 'sin registro',
          })).sort((a, b) => b.publicaciones - a.publicaciones),
        }
      })

      return { periodo_dias: dias, bloques: resumen }
    }

    if (nombre === 'consultar_citas') {
      const dias = args.dias ?? 7
      const tipo = args.tipo ?? 'ambas'
      const ahora = new Date()
      const inicio = new Date()
      inicio.setDate(ahora.getDate() - dias)

      const nombresMap = await buildNombresMap(supabase)
      const resultados: any = { periodo_dias: dias }

      if (tipo === 'coordinacion' || tipo === 'ambas') {
        const { data: citas } = await supabase
          .from('citas_coordinacion')
          .select('user_id, fecha_cita, estado')
          .gte('fecha_cita', inicio.toISOString())
          .order('fecha_cita', { ascending: false })
          .limit(200)

        const por_prospectador: Record<string, { nombre: string; total: number; estados: Record<string, number> }> = {}
        for (const c of citas ?? []) {
          const nom = nombresMap.get(c.user_id) ?? c.user_id
          if (!por_prospectador[nom]) por_prospectador[nom] = { nombre: nom, total: 0, estados: {} }
          por_prospectador[nom].total++
          const est = c.estado ?? 'sin_estado'
          por_prospectador[nom].estados[est] = (por_prospectador[nom].estados[est] || 0) + 1
        }
        resultados.citas_coordinacion = {
          total: citas?.length ?? 0,
          por_prospectador: Object.values(por_prospectador).sort((a, b) => b.total - a.total),
        }
      }

      if (tipo === 'venta' || tipo === 'ambas') {
        const { data: ventas } = await supabase
          .from('citas_venta')
          .select('user_id, fecha_cita, estado, tipo_operacion')
          .gte('fecha_cita', inicio.toISOString())
          .order('fecha_cita', { ascending: false })
          .limit(200)

        const por_prospectador: Record<string, { nombre: string; total: number; estados: Record<string, number> }> = {}
        for (const c of ventas ?? []) {
          const nom = nombresMap.get(c.user_id) ?? c.user_id
          if (!por_prospectador[nom]) por_prospectador[nom] = { nombre: nom, total: 0, estados: {} }
          por_prospectador[nom].total++
          const est = c.estado ?? 'sin_estado'
          por_prospectador[nom].estados[est] = (por_prospectador[nom].estados[est] || 0) + 1
        }
        resultados.citas_venta = {
          total: ventas?.length ?? 0,
          por_prospectador: Object.values(por_prospectador).sort((a, b) => b.total - a.total),
        }
      }

      return resultados
    }

    if (nombre === 'consultar_gamificacion') {
      const metrica = args.metrica ?? 'xp'
      const limite = args.limite ?? 10

      const nombresMap = await buildNombresMap(supabase)

      if (metrica === 'misiones') {
        const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
        const { data: misiones } = await supabase
          .from('user_misiones')
          .select('user_id, completada, fecha_reset')
          .eq('fecha_reset', hoyMX)

        const progreso: Record<string, { nombre: string; completadas: number; pendientes: number }> = {}
        for (const [uid, nom] of nombresMap) {
          progreso[uid] = { nombre: nom, completadas: 0, pendientes: 0 }
        }
        for (const m of misiones ?? []) {
          if (!progreso[m.user_id]) progreso[m.user_id] = { nombre: nombresMap.get(m.user_id) ?? m.user_id, completadas: 0, pendientes: 0 }
          if (m.completada) progreso[m.user_id].completadas++
          else progreso[m.user_id].pendientes++
        }
        return {
          metrica: 'misiones_hoy',
          fecha: hoyMX,
          ranking: Object.values(progreso)
            .sort((a, b) => b.completadas - a.completadas)
            .slice(0, limite),
        }
      }

      const columna = metrica === 'racha' ? 'streak_dias' : metrica === 'monedas' ? 'valera_coins' : 'xp'
      const { data: stats } = await supabase
        .from('user_stats')
        .select('id, xp, valera_coins, streak_dias')
        .order(columna, { ascending: false })
        .limit(limite)

      // nivel se calcula desde xp: L = 1 + floor((-485 + sqrt(235225 + 60*xp)) / 30)
      const calcNivel = (xp: number) => xp <= 0 ? 1 : 1 + Math.floor((-485 + Math.sqrt(235225 + 60 * xp)) / 30)

      return {
        metrica,
        ranking: (stats ?? []).map((s: any, i: number) => ({
          posicion: i + 1,
          nombre: nombresMap.get(s.id) ?? s.id,
          xp: s.xp,
          nivel: calcNivel(s.xp ?? 0),
          racha_dias: s.streak_dias,
          monedas: s.valera_coins,
        })),
      }
    }

    if (nombre === 'consultar_university') {
      const limite = args.limite ?? 10
      const nombresMap = await buildNombresMap(supabase)

      const [cursosRes, progresoRes, certRes] = await Promise.all([
        supabase.from('vu_cursos').select('id, titulo, nivel, publicado').eq('publicado', true),
        supabase.from('vu_progreso').select('user_id, completada_at').not('completada_at', 'is', null),
        supabase.from('vu_certificados').select('user_id').limit(5000),
      ])

      const leccionesCompletadasPorUser: Record<string, number> = {}
      for (const p of progresoRes.data ?? []) {
        leccionesCompletadasPorUser[p.user_id] = (leccionesCompletadasPorUser[p.user_id] || 0) + 1
      }

      const certsPorUser: Record<string, number> = {}
      for (const c of certRes.data ?? []) {
        certsPorUser[c.user_id] = (certsPorUser[c.user_id] || 0) + 1
      }

      const ranking = Array.from(nombresMap.entries())
        .map(([uid, nom]) => ({
          nombre: nom,
          lecciones_completadas: leccionesCompletadasPorUser[uid] ?? 0,
          certificados: certsPorUser[uid] ?? 0,
        }))
        .sort((a, b) => b.lecciones_completadas - a.lecciones_completadas)
        .slice(0, limite)

      return {
        total_cursos_activos: cursosRes.data?.length ?? 0,
        cursos: cursosRes.data?.map((c: any) => c.titulo) ?? [],
        ranking_progreso: ranking,
      }
    }

    if (nombre === 'consultar_tiempo_en_app') {
      const dias = args.dias ?? 7
      const limite = args.limite ?? 10
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - dias)

      const nombresMap = await buildNombresMap(supabase)

      const { data: sesiones } = await supabase
        .from('user_sessions')
        .select('user_id, inicio, fin')
        .gte('inicio', inicio.toISOString())
        .limit(5000)

      if (!sesiones?.length) {
        return { mensaje: 'No hay datos de sesiones en este período', periodo_dias: dias }
      }

      const ahora2 = Date.now()
      const tiempos: Record<string, number> = {}
      for (const s of sesiones) {
        const finMs = s.fin ? new Date(s.fin).getTime() : ahora2
        const mins = Math.max(0, (finMs - new Date(s.inicio).getTime()) / 60000)
        tiempos[s.user_id] = (tiempos[s.user_id] || 0) + mins
      }

      const ranking = Object.entries(tiempos)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limite)
        .map(([uid, mins], i) => ({
          posicion: i + 1,
          nombre: nombresMap.get(uid) ?? uid,
          minutos: mins,
          horas: parseFloat((mins / 60).toFixed(1)),
        }))

      const totalMinutos = Object.values(tiempos).reduce((a, b) => a + b, 0)
      return {
        periodo_dias: dias,
        total_minutos_equipo: totalMinutos,
        promedio_minutos_por_persona: parseFloat((totalMinutos / Object.keys(tiempos).length).toFixed(1)),
        ranking,
      }
    }

    if (nombre === 'consultar_campanias') {
      const { data: campanias } = await supabase
        .from('campanias')
        .select('id, nombre, activa, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (!campanias?.length) return { mensaje: 'No hay campañas registradas' }

      const ids = campanias.map((c: any) => c.id)
      const { data: leads } = await supabase
        .from('leads_campania')
        .select('campania_id, asignado')
        .in('campania_id', ids)
        .limit(10000)

      const conteo: Record<string, { total: number; asignados: number; pendientes: number }> = {}
      for (const l of leads ?? []) {
        if (!conteo[l.campania_id]) conteo[l.campania_id] = { total: 0, asignados: 0, pendientes: 0 }
        conteo[l.campania_id].total++
        if (l.asignado) conteo[l.campania_id].asignados++
        else conteo[l.campania_id].pendientes++
      }

      return {
        total_campanias: campanias.length,
        campanias: campanias.map((c: any) => ({
          nombre: c.nombre,
          activa: c.activa,
          ...conteo[c.id] ?? { total: 0, asignados: 0, pendientes: 0 },
        })),
      }
    }

    if (nombre === 'consultar_recordatorios_vencidos') {
      const limite = args.limite ?? 15
      const ahoraMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })

      const nombresMap = await buildNombresMap(supabase)

      const { data: vencidos } = await supabase
        .from('recordatorios')
        .select('user_id, cliente_id, fecha, descripcion, completado')
        .eq('completado', false)
        .lt('fecha', ahoraMX)
        .order('fecha', { ascending: true })
        .limit(limite)

      const porUser: Record<string, { nombre: string; vencidos: number }> = {}
      for (const r of vencidos ?? []) {
        const nom = nombresMap.get(r.user_id) ?? r.user_id
        if (!porUser[nom]) porUser[nom] = { nombre: nom, vencidos: 0 }
        porUser[nom].vencidos++
      }

      return {
        total_vencidos: vencidos?.length ?? 0,
        por_prospectador: Object.values(porUser).sort((a, b) => b.vencidos - a.vencidos),
        detalle: (vencidos ?? []).map((r: any) => ({
          prospectador: nombresMap.get(r.user_id) ?? r.user_id,
          fecha: r.fecha,
          descripcion: r.descripcion ?? '(sin descripción)',
        })),
      }
    }

    return { error: `Herramienta desconocida: ${nombre}` }
  } catch (e) {
    return { error: `Error en ${nombre}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const MODELOS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash']

async function llamarGemini(
  apiKey: string,
  model: string,
  contents: unknown[],
): Promise<{ ok: boolean; json?: any; err?: string; retryAfter?: number }> {
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
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    },
  )
  const json = await res.json()
  if (!res.ok) {
    const errMsg = json?.error?.message ?? `HTTP ${res.status}`
    const match = errMsg.match(/Please retry in ([\d.]+)s/)
    const retryAfter = match ? Math.ceil(parseFloat(match[1])) : undefined
    return { ok: false, err: errMsg, retryAfter }
  }
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

    const contents: any[] = []
    for (const m of historial) {
      contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })
    }
    contents.push({ role: 'user', parts: [{ text: mensaje }] })

    let respuestaFinal: string | null = null
    let intentos = 0

    while (!respuestaFinal && intentos < 5) {
      intentos++

      let resultado: { ok: boolean; json?: any; err?: string; retryAfter?: number } = { ok: false, err: 'Sin modelos' }
      let primerError = ''
      for (const modelo of MODELOS) {
        resultado = await llamarGemini(geminiKey, modelo, contents)
        if (resultado.ok) break
        // Si es quota con tiempo de espera corto, esperamos y reintentamos una vez
        if (resultado.retryAfter && resultado.retryAfter <= 25) {
          console.log(`[valera-ai] ${modelo} quota, esperando ${resultado.retryAfter}s...`)
          await new Promise(r => setTimeout(r, resultado.retryAfter! * 1000))
          resultado = await llamarGemini(geminiKey, modelo, contents)
          if (resultado.ok) break
        }
        if (!primerError) primerError = `${modelo}: ${resultado.err}`
        console.warn(`[valera-ai] ${modelo} falló definitivamente: ${resultado.err}`)
      }

      if (!resultado.ok || !resultado.json) {
        const esQuota = primerError.toLowerCase().includes('quota') || primerError.toLowerCase().includes('exceeded')
        throw new Error(esQuota
          ? 'El servicio de IA está temporalmente saturado. Espera unos segundos e intenta de nuevo.'
          : `Gemini no respondió: ${primerError}`)
      }

      const parts: any[] = resultado.json?.candidates?.[0]?.content?.parts ?? []
      const llamadas = parts.filter((p: any) => p.functionCall)
      const textos = parts.filter((p: any) => typeof p.text === 'string' && p.text.trim())

      if (llamadas.length > 0) {
        contents.push({ role: 'model', parts })
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
    // Devolvemos 200 para que el cliente pueda leer el error real en data.error
    return new Response(JSON.stringify({ error: msg }), { headers: CORS })
  }
})
