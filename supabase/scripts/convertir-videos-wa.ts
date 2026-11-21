// Script de UNA SOLA VEZ (re-corrible): genera copias ligeras (<=16MB) de los
// videos de recorrido para mandarlas por WhatsApp. NO toca propiedades.video_url
// ni los videos originales — solo lee video_url, genera wa/<id>.mp4 y guarda su
// URL pública en la columna nueva propiedades.video_wa_url (ver migración
// 20261076_propiedad_video_wa_url.sql).
//
// Uso:
//   npx tsx supabase/scripts/convertir-videos-wa.ts                 (todas las pendientes)
//   npx tsx supabase/scripts/convertir-videos-wa.ts --limit 2       (prueba con pocas)
//   npx tsx supabase/scripts/convertir-videos-wa.ts --id <uuid>     (una propiedad específica)
//   npx tsx supabase/scripts/convertir-videos-wa.ts --force         (reprocesa aunque video_wa_url ya tenga valor)
//
// Variables de entorno requeridas (NO se piden como argumento, por seguridad):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Usa ffmpeg-static / ffprobe-static (binarios npm, no requieren ffmpeg
// instalado en el sistema). Es idempotente por construcción (solo toma
// propiedades con video_wa_url IS NULL), pero además sube con upsert, así que
// re-correrlo no duplica ni hace daño — solo reprocesa lo que aún no tiene
// video_wa_url.

import { createClient } from '@supabase/supabase-js'
import ffmpegPath from 'ffmpeg-static'
// @ts-expect-error -- sin tipos propios
import ffprobeStatic from 'ffprobe-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

const LIMIT_FLAG = '--limit'
const ID_FLAG = '--id'
const FORCE_FLAG = '--force'
const limitIdx = process.argv.indexOf(LIMIT_FLAG)
const idIdx = process.argv.indexOf(ID_FLAG)
const limite = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : null
const soloId = idIdx !== -1 ? process.argv[idIdx + 1] : null
const forzar = process.argv.includes(FORCE_FLAG)

if (limitIdx !== -1 && (!Number.isFinite(limite) || (limite as number) <= 0)) {
  console.error(`Uso: --limit N (N entero positivo). Recibido: "${process.argv[limitIdx + 1]}"`)
  process.exit(1)
}
if (idIdx !== -1 && !soloId) {
  console.error('Uso: --id <uuid>')
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const DURACION_MAX_S = 90
const PESO_OBJETIVO_MB = 14
const PESO_LIMITE_MB = 15.5
const MAX_REINTENTOS = 2
const KBPS_MIN = 500
const KBPS_MAX = 2500

interface Pendiente {
  id: string
  video_url: string
}

interface Resultado {
  id: string
  pesoOriginalMb: number | null
  duracionOriginalS: number | null
  pesoFinalMb: number | null
  resolucionFinal: string | null
  recortado: boolean
  estado: 'ok' | 'error'
  detalle: string
}

async function propiedadesPendientes(): Promise<Pendiente[]> {
  if (soloId) {
    const { data, error } = await supabase
      .from('propiedades')
      .select('id, video_url')
      .eq('id', soloId)
      .not('video_url', 'is', null)
    if (error) throw error
    return (data as Pendiente[] | null) ?? []
  }
  let query = supabase
    .from('propiedades')
    .select('id, video_url')
    .not('video_url', 'is', null)
  if (!forzar) query = query.is('video_wa_url', null)
  const { data, error } = await query
  if (error) throw error
  return (data as Pendiente[] | null) ?? []
}

async function descargar(url: string, destino: string): Promise<number> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`No se pudo descargar ${url} (${resp.status})`)
  const bytes = new Uint8Array(await resp.arrayBuffer())
  await fs.writeFile(destino, bytes)
  return bytes.byteLength
}

async function obtenerDuracionS(archivo: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeStatic.path, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    archivo,
  ])
  const duracion = Number(stdout.trim())
  if (!Number.isFinite(duracion) || duracion <= 0) {
    throw new Error(`ffprobe no pudo determinar la duración (salida: "${stdout.trim()}")`)
  }
  return duracion
}

async function codificar(
  entrada: string,
  salida: string,
  duracionFinalS: number,
  recortar: boolean,
  kbps: number,
): Promise<void> {
  const args = ['-y', '-i', entrada]
  if (recortar) args.push('-t', String(DURACION_MAX_S))
  args.push(
    // Lado CORTO a 720: horizontal queda alto=720 (ancho par, -2), vertical
    // queda ancho=720 (alto par, -2). Si el original es más chico, no agranda.
    '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-b:v', `${kbps}k`,
    '-maxrate', `${Math.round(kbps * 1.5)}k`,
    '-bufsize', `${kbps * 2}k`,
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ac', '2',
    '-movflags', '+faststart',
    salida,
  )
  await execFileAsync(ffmpegPath as string, args)
}

function calcularKbps(duracionFinalS: number): number {
  const kbps = Math.floor((PESO_OBJETIVO_MB * 8192) / duracionFinalS) - 96
  return Math.min(KBPS_MAX, Math.max(KBPS_MIN, kbps))
}

async function pesoMb(archivo: string): Promise<number> {
  const stat = await fs.stat(archivo)
  return stat.size / 1024 / 1024
}

async function obtenerResolucion(archivo: string): Promise<string> {
  const { stdout } = await execFileAsync(ffprobeStatic.path, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    archivo,
  ])
  return stdout.trim()
}

async function procesarPropiedad(p: Pendiente, tmpDir: string): Promise<Resultado> {
  const entrada = path.join(tmpDir, `${p.id}-in`)
  const salida = path.join(tmpDir, `${p.id}-out.mp4`)
  try {
    const pesoOriginalBytes = await descargar(p.video_url, entrada)
    const pesoOriginalMb = pesoOriginalBytes / 1024 / 1024
    const duracionOriginalS = await obtenerDuracionS(entrada)
    const recortar = duracionOriginalS > DURACION_MAX_S
    const duracionFinalS = Math.min(duracionOriginalS, DURACION_MAX_S)

    let kbps = calcularKbps(duracionFinalS)
    let intento = 0
    let pesoFinalMb = Infinity
    while (intento <= MAX_REINTENTOS) {
      await codificar(entrada, salida, duracionFinalS, recortar, kbps)
      pesoFinalMb = await pesoMb(salida)
      if (pesoFinalMb <= PESO_LIMITE_MB) break
      kbps = Math.max(KBPS_MIN, Math.floor(kbps * 0.8))
      intento++
    }

    if (pesoFinalMb > PESO_LIMITE_MB) {
      return {
        id: p.id,
        pesoOriginalMb,
        duracionOriginalS,
        pesoFinalMb,
        resolucionFinal: null,
        recortado: recortar,
        estado: 'error',
        detalle: `Quedó en ${pesoFinalMb.toFixed(1)}MB tras ${MAX_REINTENTOS} reintentos, sigue pesando de más`,
      }
    }

    const resolucionFinal = await obtenerResolucion(salida)
    const bytesFinal = await fs.readFile(salida)
    const { error: uploadError } = await supabase.storage
      .from('propiedades-videos')
      .upload(`wa/${p.id}.mp4`, bytesFinal, { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw uploadError

    const { data: pub } = supabase.storage.from('propiedades-videos').getPublicUrl(`wa/${p.id}.mp4`)
    const { error: updateError } = await supabase
      .from('propiedades')
      .update({ video_wa_url: pub.publicUrl })
      .eq('id', p.id)
    if (updateError) throw updateError

    return {
      id: p.id,
      pesoOriginalMb,
      duracionOriginalS,
      pesoFinalMb,
      resolucionFinal,
      recortado: recortar,
      estado: 'ok',
      detalle: pub.publicUrl,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      id: p.id,
      pesoOriginalMb: null,
      duracionOriginalS: null,
      pesoFinalMb: null,
      resolucionFinal: null,
      recortado: false,
      estado: 'error',
      detalle: msg,
    }
  } finally {
    await fs.rm(entrada, { force: true })
    await fs.rm(salida, { force: true })
  }
}

async function main() {
  let pendientes = await propiedadesPendientes()
  const totalPendientes = pendientes.length
  if (limite !== null) pendientes = pendientes.slice(0, limite)
  console.log(
    soloId
      ? `Procesando únicamente la propiedad ${soloId}${forzar ? ' (--force)' : ''}.`
      : limite !== null
        ? `${totalPendientes} propiedades pendientes en total${forzar ? ' (--force)' : ''} — procesando ${pendientes.length} (--limit ${limite}).`
        : `${pendientes.length} propiedades pendientes${forzar ? ' (--force)' : ''}.`,
  )

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'videos-wa-'))
  const resultados: Resultado[] = []
  try {
    for (const p of pendientes) {
      console.log(`→ ${p.id} …`)
      const r = await procesarPropiedad(p, tmpDir)
      resultados.push(r)
      console.log(r.estado === 'ok' ? `  ✓ ok` : `  ✗ error: ${r.detalle}`)
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }

  console.log('\n── Resumen ──')
  console.log(
    'id'.padEnd(38) +
    'peso orig'.padEnd(12) +
    'dur orig'.padEnd(10) +
    'peso final'.padEnd(12) +
    'resolución'.padEnd(12) +
    'recortado'.padEnd(11) +
    'estado',
  )
  for (const r of resultados) {
    console.log(
      r.id.padEnd(38) +
      (r.pesoOriginalMb != null ? `${r.pesoOriginalMb.toFixed(1)}MB` : '—').padEnd(12) +
      (r.duracionOriginalS != null ? `${r.duracionOriginalS.toFixed(0)}s` : '—').padEnd(10) +
      (r.pesoFinalMb != null ? `${r.pesoFinalMb.toFixed(1)}MB` : '—').padEnd(12) +
      (r.resolucionFinal ?? '—').padEnd(12) +
      (r.recortado ? 'sí' : 'no').padEnd(11) +
      (r.estado === 'ok' ? 'ok' : `error: ${r.detalle}`),
    )
  }
  const ok = resultados.filter((r) => r.estado === 'ok').length
  const errores = resultados.filter((r) => r.estado === 'error').length
  console.log(`\nOK: ${ok} · Errores: ${errores}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
