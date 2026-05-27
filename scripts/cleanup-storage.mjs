/**
 * cleanup-storage.mjs
 *
 * Encuentra y elimina imágenes huérfanas del bucket "propiedades" en Supabase Storage.
 * Una imagen es huérfana si no tiene registro en la tabla propiedad_imagenes o si
 * su carpeta (propiedad_id) ya no existe en la tabla propiedades.
 *
 * Uso:
 *   node scripts/cleanup-storage.mjs
 *   node scripts/cleanup-storage.mjs --dry-run   (solo muestra, no borra)
 */

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

const SUPABASE_URL = 'https://ystxicgrryyzhrxinsbq.supabase.co'
const BUCKET = 'propiedades'
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

function extractPathFromUrl(url) {
  // URL ejemplo: https://xxx.supabase.co/storage/v1/object/public/propiedades/uuid/timestamp_0.jpg
  const marker = `/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

async function listAllFiles(supabase, folder = '') {
  const all = []
  let offset = 0
  const limit = 1000
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Error listando Storage: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < limit) break
    offset += limit
  }
  return all
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧹 Cleanup de Storage — bucket:', BUCKET)
  if (DRY_RUN) console.log('   Modo: DRY RUN (no se borra nada)\n')

  const serviceKey = await ask('Pega tu Supabase service_role key: ')
  if (!serviceKey || serviceKey.length < 20) {
    console.error('❌ Key inválida.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // 1. Obtener todas las carpetas del bucket (cada carpeta = un propiedad_id)
  console.log('\n📂 Listando carpetas en Storage...')
  const folders = await listAllFiles(supabase)
  const folderNames = folders.filter(f => f.id == null).map(f => f.name) // carpetas no tienen id
  // En Supabase Storage, los "folders" aparecen como items sin metadata.id o con id null
  // Las carpetas reales son prefijos — listamos el root para ver los propiedad_ids
  console.log(`   Encontradas ${folders.length} entradas en el root del bucket`)

  // 2. Obtener todos los propiedad_id existentes en la BD
  console.log('🗄️  Consultando propiedades activas en la BD...')
  const { data: propiedades, error: errProp } = await supabase
    .from('propiedades')
    .select('id')
  if (errProp) throw new Error(`Error leyendo propiedades: ${errProp.message}`)
  const propiedadIds = new Set(propiedades.map(p => p.id))
  console.log(`   ${propiedadIds.size} propiedades activas en la BD`)

  // 3. Obtener todas las URLs registradas en propiedad_imagenes
  console.log('🖼️  Consultando propiedad_imagenes...')
  const { data: imagenes, error: errImg } = await supabase
    .from('propiedad_imagenes')
    .select('url')
  if (errImg) throw new Error(`Error leyendo propiedad_imagenes: ${errImg.message}`)
  const urlsRegistradas = new Set(imagenes.map(i => extractPathFromUrl(i.url)).filter(Boolean))
  console.log(`   ${urlsRegistradas.size} imágenes registradas en la BD`)

  // 4. Recorrer cada carpeta en Storage y clasificar archivos
  const archivosHuerfanos = []   // en Storage pero no en BD
  const carpetasHuerfanas = []   // propiedad ya no existe en BD
  let totalArchivos = 0
  let totalBytes = 0

  // Las "carpetas" en Supabase Storage son simplemente prefijos.
  // Si listamos el root, los items sin metadata son carpetas.
  const rootItems = folders
  const carpetas = rootItems.filter(item => !item.metadata) // sin metadata = carpeta
  const archivosRoot = rootItems.filter(item => item.metadata) // con metadata = archivo suelto

  console.log(`\n🔍 Analizando ${carpetas.length} carpetas...`)

  for (const carpeta of carpetas) {
    const propiedadId = carpeta.name
    const esHuerfana = !propiedadIds.has(propiedadId)

    const archivos = await listAllFiles(supabase, propiedadId)
    totalArchivos += archivos.length

    for (const archivo of archivos) {
      const filePath = `${propiedadId}/${archivo.name}`
      const bytes = archivo.metadata?.size ?? 0
      totalBytes += bytes

      if (esHuerfana || !urlsRegistradas.has(filePath)) {
        archivosHuerfanos.push({ path: filePath, bytes, razon: esHuerfana ? 'propiedad_eliminada' : 'sin_registro_bd' })
      }
    }

    if (esHuerfana) carpetasHuerfanas.push(propiedadId)
  }

  // Archivos sueltos en el root (sin carpeta)
  for (const archivo of archivosRoot) {
    totalArchivos++
    const bytes = archivo.metadata?.size ?? 0
    totalBytes += bytes
    if (!urlsRegistradas.has(archivo.name)) {
      archivosHuerfanos.push({ path: archivo.name, bytes, razon: 'sin_registro_bd' })
    }
  }

  // 5. Resumen
  const bytesHuerfanos = archivosHuerfanos.reduce((s, f) => s + f.bytes, 0)
  const porPropiedadEliminada = archivosHuerfanos.filter(f => f.razon === 'propiedad_eliminada')
  const porSinRegistro = archivosHuerfanos.filter(f => f.razon === 'sin_registro_bd')

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 RESUMEN')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`   Total archivos en Storage:     ${totalArchivos}`)
  console.log(`   Total tamaño en Storage:       ${formatMB(totalBytes)}`)
  console.log(`   Carpetas sin propiedad en BD:  ${carpetasHuerfanas.length}`)
  console.log(`   ─ Archivos (prop. eliminadas): ${porPropiedadEliminada.length} (${formatMB(porPropiedadEliminada.reduce((s,f)=>s+f.bytes,0))})`)
  console.log(`   ─ Archivos sin registro en BD: ${porSinRegistro.length} (${formatMB(porSinRegistro.reduce((s,f)=>s+f.bytes,0))})`)
  console.log(`   TOTAL HUÉRFANOS A BORRAR:      ${archivosHuerfanos.length} (${formatMB(bytesHuerfanos)})`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (archivosHuerfanos.length === 0) {
    console.log('\n✅ No hay archivos huérfanos. El Storage está limpio.')
    return
  }

  if (DRY_RUN) {
    console.log('\nArchivos que se borrarían:')
    archivosHuerfanos.slice(0, 50).forEach(f => console.log(`   - ${f.path} (${formatMB(f.bytes)}) [${f.razon}]`))
    if (archivosHuerfanos.length > 50) console.log(`   ... y ${archivosHuerfanos.length - 50} más`)
    console.log('\n(Dry run: no se borró nada. Corre sin --dry-run para eliminar.)')
    return
  }

  const confirm = await ask(`\n¿Borrar ${archivosHuerfanos.length} archivos huérfanos? (escribe "si" para confirmar): `)
  if (confirm.toLowerCase() !== 'si') {
    console.log('❌ Cancelado.')
    return
  }

  // 6. Borrar en batches de 100
  console.log('\n🗑️  Borrando archivos...')
  const paths = archivosHuerfanos.map(f => f.path)
  const BATCH = 100
  let borrados = 0
  let errores = 0

  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) {
      console.error(`   ⚠️  Error en batch ${i}-${i + BATCH}: ${error.message}`)
      errores += batch.length
    } else {
      borrados += batch.length
      process.stdout.write(`   Borrados: ${borrados}/${paths.length}\r`)
    }
  }

  console.log(`\n✅ Completado: ${borrados} archivos borrados, ${errores} errores`)
  console.log(`   Espacio liberado aprox: ${formatMB(bytesHuerfanos)}`)
  console.log('\n   Nota: el dashboard de Supabase puede tardar ~1 hora en reflejar el cambio.')
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
