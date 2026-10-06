import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const err = (m: string, s = 400) => new Response(JSON.stringify({ ok: false, error: m }), { status: s, headers: CORS })
const ok = (data: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: true, ...data }), { headers: CORS })

// Un tema = un curso contenedor (título FIJO, debe calzar con
// 20261006c_university_videos_automaticos.sql) + la búsqueda que mejor trae
// contenido relevante en español para ese tema.
const TEMAS: { tema: string; cursoTitulo: string; query: string }[] = [
  { tema: 'ventas', cursoTitulo: 'Ventas · Videos recomendados', query: 'técnicas de ventas para asesores inmobiliarios' },
  { tema: 'inmobiliario', cursoTitulo: 'Inmobiliario · Videos recomendados', query: 'consejos para agentes inmobiliarios' },
  { tema: 'superacion_personal', cursoTitulo: 'Superación personal · Videos recomendados', query: 'motivación y superación personal para vendedores' },
  { tema: 'administracion_tiempo', cursoTitulo: 'Administración del tiempo · Videos recomendados', query: 'administración del tiempo y productividad' },
]

const MAX_POR_TEMA = 6

// "PT1H2M10S" → segundos. Los campos ausentes (H/M/S) simplemente no matchean.
function duracionASegundos(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const [, h, min, s] = m
  return (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0)
}

type ResultadoYoutube = {
  id: string
  titulo: string
  descripcion: string
  canal: string
  miniatura: string | null
  publicadoEn: string | null
}

async function buscarEnYoutube(query: string, apiKey: string): Promise<ResultadoYoutube[]> {
  const haceTresAnios = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString()
  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(MAX_POR_TEMA),
    relevanceLanguage: 'es',
    safeSearch: 'strict',
    videoEmbeddable: 'true',
    videoDuration: 'medium', // 4–20 min: evita shorts y documentales larguísimos
    order: 'relevance',
    publishedAfter: haceTresAnios,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) throw new Error(`YouTube search ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return ((json.items ?? []) as any[])
    .filter(it => it.id?.videoId)
    .map(it => ({
      id: it.id.videoId as string,
      titulo: String(it.snippet?.title ?? '').trim(),
      descripcion: String(it.snippet?.description ?? '').trim(),
      canal: String(it.snippet?.channelTitle ?? '').trim(),
      miniatura: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
      publicadoEn: it.snippet?.publishedAt ?? null,
    }))
}

// Duración real (search.list no la trae) en un solo request batched por ids.
async function obtenerDuraciones(ids: string[], apiKey: string): Promise<Record<string, number | null>> {
  if (!ids.length) return {}
  const params = new URLSearchParams({ key: apiKey, part: 'contentDetails', id: ids.join(',') })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube videos ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const out: Record<string, number | null> = {}
  for (const it of (json.items ?? []) as any[]) {
    out[it.id] = duracionASegundos(it.contentDetails?.duration ?? '')
  }
  return out
}

// Búsqueda semanal de videos para Valera University. Nunca publica nada solo:
// inserta candidatos 'pendiente' en vu_video_candidatos para que un admin los
// revise en /(admin)/university-videos-cola.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const apiKey = Deno.env.get('YOUTUBE_API_KEY')
    if (!apiKey) return err('Falta configurar el secreto YOUTUBE_API_KEY en Supabase.', 500)

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

    // Autorización: el cron llama con el service_role key directo (bypass);
    // el botón "Buscar ahora" del admin llama con su propia sesión — ahí se
    // exige que su perfil sea 'admin'. Así nadie más puede gastar la cuota de
    // YouTube llamando a la función a mano.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    let autorizado = token === serviceKey
    if (!autorizado && token) {
      const { data: { user } } = await db.auth.getUser(token)
      if (user) {
        const { data: perfil } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
        autorizado = perfil?.role === 'admin'
      }
    }
    if (!autorizado) return err('No autorizado.', 403)

    const { data: cursos, error: eCursos } = await db.from('vu_cursos').select('id, titulo')
    if (eCursos) return err('No se pudieron leer los cursos contenedor.', 500)
    const cursoIdPorTitulo = new Map((cursos ?? []).map((c: any) => [c.titulo, c.id as string]))

    const resumen: Record<string, number> = {}

    for (const { tema, cursoTitulo, query } of TEMAS) {
      const cursoId = cursoIdPorTitulo.get(cursoTitulo)
      if (!cursoId) { resumen[tema] = 0; continue } // curso contenedor no existe: no hay a dónde adjuntarlo

      const resultados = await buscarEnYoutube(query, apiKey)
      const duraciones = await obtenerDuraciones(resultados.map(r => r.id), apiKey)

      const filas = resultados.map(r => ({
        tema,
        curso_id: cursoId,
        youtube_video_id: r.id,
        youtube_url: `https://www.youtube.com/watch?v=${r.id}`,
        titulo: r.titulo,
        descripcion: r.descripcion || null,
        canal: r.canal || null,
        miniatura_url: r.miniatura,
        duracion_segundos: duraciones[r.id] ?? null,
        publicado_youtube_en: r.publicadoEn,
      }))

      if (filas.length) {
        // ignoreDuplicates = ON CONFLICT DO NOTHING por youtube_video_id: un
        // video que ya está en la cola (pendiente, aprobado o descartado) jamás
        // se vuelve a insertar ni se pisa su estado.
        const { error: eIns } = await db.from('vu_video_candidatos')
          .upsert(filas, { onConflict: 'youtube_video_id', ignoreDuplicates: true })
        if (eIns) { resumen[tema] = 0; continue }
      }
      resumen[tema] = filas.length
    }

    return ok({ resumen })
  } catch (e) {
    return err(`Error: ${String((e as Error)?.message ?? e)}`, 500)
  }
})
