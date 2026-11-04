// Script de UNA SOLA VEZ: convierte a JPG las propiedades disponibles cuya
// única foto apta (<=5MB) está en WebP (o algún otro formato que WhatsApp no
// acepta en carruseles de plantilla), y sube la copia a propiedades/wa/<id>.jpg.
// El RPC propiedades_campana_buscar (ver migración 20261075) prefiere esa
// copia cuando existe.
//
// Uso:
//   deno run --allow-net --allow-env supabase/scripts/convertir-fotos-wa.ts
//   deno run --allow-net --allow-env supabase/scripts/convertir-fotos-wa.ts --limit 20   (prueba con pocas)
//
// Variables de entorno requeridas (NO se piden como argumento, por seguridad):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Es idempotente: si wa/<id>.jpg ya existe se vuelve a subir con upsert, así
// que se puede re-correr sin duplicar nada ni hacer daño.
//
// Usa @matmen/imagescript v3 (jsr) — SÍ decodifica WebP estático (confirmado
// en su tabla de formatos soportados: PNG, JPEG, WebP, AVIF, JPEG XL, GIF,
// APNG, BMP, QOI, TGA, Netpbm, TIFF, ICO/CUR, HDR). Para WebP/GIF ANIMADOS
// Image.decode() no devuelve un frame único (eso es Animation.decode) — no es
// el caso esperado para fotos de propiedades, así que si llegara a pasar
// queda capturado como fallo normal del try/catch, no se cae el script.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'jsr:@matmen/imagescript@^3.14.0'

const LIMIT_FLAG = '--limit'
const limitIdx = Deno.args.indexOf(LIMIT_FLAG)
const limite = limitIdx !== -1 ? Number(Deno.args[limitIdx + 1]) : null
if (limitIdx !== -1 && (!Number.isFinite(limite) || (limite as number) <= 0)) {
  console.error(`Uso: --limit N (N entero positivo). Recibido: "${Deno.args[limitIdx + 1]}"`)
  Deno.exit(1)
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  Deno.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const MAX_ANCHO = 1600
const CALIDAD_JPG = 80
const LIMITE_5MB = 5 * 1024 * 1024

async function propiedadesSinFotoValida(): Promise<{ id: string; url: string }[]> {
  // Misma lógica que el RPC: disponible, no inventario, y SIN ninguna foto
  // jpg/jpeg/png <=5MB ni copia wa/ ya convertida. Trae la foto de menor
  // `orden` (sea cual sea su formato) para usarla como fuente de conversión.
  const { data, error } = await supabase.rpc('propiedades_sin_foto_wa_pendientes' as never)
  if (error) throw error
  return (data as { id: string; url: string }[] | null) ?? []
}

async function convertirYSubir(propiedadId: string, urlOriginal: string): Promise<number> {
  const resp = await fetch(urlOriginal)
  if (!resp.ok) throw new Error(`No se pudo descargar ${urlOriginal} (${resp.status})`)
  const bytes = new Uint8Array(await resp.arrayBuffer())

  const img = await Image.decode(bytes)

  if (img.width > MAX_ANCHO) {
    const alto = Math.round((img.height * MAX_ANCHO) / img.width)
    img.resize(MAX_ANCHO, alto)
  }

  const jpg = await img.encodeJPEG(CALIDAD_JPG)
  if (jpg.byteLength > LIMITE_5MB) {
    throw new Error(`Quedó en ${(jpg.byteLength / 1024 / 1024).toFixed(1)}MB, sigue pesando de más`)
  }

  const { error } = await supabase.storage
    .from('propiedades')
    .upload(`wa/${propiedadId}.jpg`, jpg, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error

  return jpg.byteLength
}

async function main() {
  let pendientes = await propiedadesSinFotoValida()
  const totalPendientes = pendientes.length
  if (limite !== null) pendientes = pendientes.slice(0, limite)
  console.log(
    limite !== null
      ? `${totalPendientes} propiedades por convertir en total — procesando ${pendientes.length} (--limit ${limite}).`
      : `${pendientes.length} propiedades por convertir.`,
  )

  const fallos: { id: string; error: string }[] = []
  const pesos: number[] = []

  for (const p of pendientes) {
    try {
      const bytes = await convertirYSubir(p.id, p.url)
      pesos.push(bytes)
      console.log(`✓ ${p.id} (${(bytes / 1024).toFixed(0)} KB)`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      fallos.push({ id: p.id, error: msg })
      console.error(`✗ ${p.id}: ${msg}`)
    }
    // Pausa corta para no saturar el storage ni la memoria del proceso.
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log('\n── Resumen ──')
  console.log(`Convertidas: ${pesos.length}`)
  console.log(`Fallidas:    ${fallos.length}`)
  if (fallos.length > 0) {
    console.log('\nFallos (id · error):')
    for (const f of fallos) console.log(`  ${f.id} · ${f.error}`)
  }
  if (pesos.length > 0) {
    const kb = pesos.map((b) => b / 1024)
    const prom = kb.reduce((a, b) => a + b, 0) / kb.length
    console.log(
      `\nPeso de las JPG resultantes: min ${Math.min(...kb).toFixed(0)} KB · ` +
      `prom ${prom.toFixed(0)} KB · max ${Math.max(...kb).toFixed(0)} KB`,
    )
  }
}

await main()
