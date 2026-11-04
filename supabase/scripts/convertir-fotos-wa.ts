// Script de UNA SOLA VEZ: convierte a JPG las propiedades disponibles cuya
// única foto apta (<=5MB) está en WebP (o algún otro formato que WhatsApp no
// acepta en carruseles de plantilla), y sube la copia a propiedades/wa/<id>.jpg.
// El RPC propiedades_campana_buscar (ver migración 20261075) prefiere esa
// copia cuando existe.
//
// Uso:
//   deno run --allow-net --allow-env supabase/scripts/convertir-fotos-wa.ts
//
// Variables de entorno requeridas (NO se piden como argumento, por seguridad):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Es idempotente: si wa/<id>.jpg ya existe se vuelve a subir con upsert, así
// que se puede re-correr sin duplicar nada ni hacer daño.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode, Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts'

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

async function convertirYSubir(propiedadId: string, urlOriginal: string): Promise<void> {
  const resp = await fetch(urlOriginal)
  if (!resp.ok) throw new Error(`No se pudo descargar ${urlOriginal} (${resp.status})`)
  const bytes = new Uint8Array(await resp.arrayBuffer())

  const img = await decode(bytes)
  if (!(img instanceof Image)) throw new Error('Formato de imagen no soportado por imagescript')

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
}

async function main() {
  const pendientes = await propiedadesSinFotoValida()
  console.log(`${pendientes.length} propiedades por convertir.`)

  let ok = 0
  let fallos = 0
  for (const p of pendientes) {
    try {
      await convertirYSubir(p.id, p.url)
      ok++
      console.log(`✓ ${p.id}`)
    } catch (e) {
      fallos++
      console.error(`✗ ${p.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Pausa corta para no saturar el storage ni la memoria del proceso.
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`Listo: ${ok} subidas, ${fallos} fallos.`)
}

await main()
