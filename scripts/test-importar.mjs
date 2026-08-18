// Pruebas de humo del importador de propiedades (edge function importar-propiedad).
// Corre contra URLs reales y valida los campos clave, para atrapar regresiones
// cuando los portales cambian su HTML o cuando se toca el parser.
//
// Uso (lee la URL y anon key del entorno o de .env):
//   node scripts/test-importar.mjs
//
// No usa secretos: la anon key (sb_publishable_…) es pública por diseño.
import { readFileSync } from 'node:fs'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* sin .env, se usa el entorno */ }
  return env
}

const env = loadEnv()
const BASE = env.EXPO_PUBLIC_SUPABASE_URL
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!BASE || !KEY) {
  console.error('✗ Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (en entorno o .env).')
  process.exit(1)
}

// Cada caso: la URL y las aserciones esperadas sobre la respuesta.
const CASOS = [
  {
    nombre: 'GP Vivienda — Lisboa VI (Saltillo)',
    url: 'https://gpvivienda.com/lomas-villasol-modelo-lisboa-vi/',
    checa: (d) => [
      ['modelo = Lisboa VI', d.modelo === 'Lisboa VI'],
      ['estado detectado = Coahuila', /coahuila/i.test(d.direccion ?? '')],
    ],
  },
  {
    nombre: 'GP Vivienda — Toscana (½ baño)',
    url: 'https://gpvivienda.com/casas-venta-leon-cataluna-residencial-modelo-toscana/',
    checa: (d) => [
      ['modelo = Toscana', d.modelo === 'Toscana'],
      ['banos = 2', d.banos === 2],
      ['mediosBanos = 1', d.mediosBanos === 1],
      ['recamaras detectadas', typeof d.recamaras === 'number' && d.recamaras > 0],
    ],
  },
]

async function importar(url) {
  const res = await fetch(`${BASE}/functions/v1/importar-propiedad`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return res.json()
}

let fallos = 0
for (const caso of CASOS) {
  console.log(`\n▶ ${caso.nombre}`)
  let data
  try { data = await importar(caso.url) } catch (e) { console.log(`  ✗ error de red: ${e.message}`); fallos++; continue }
  if (data.error) { console.log(`  ✗ la función devolvió error: ${data.error}`); fallos++; continue }
  for (const [desc, ok] of caso.checa(data)) {
    console.log(`  ${ok ? '✓' : '✗'} ${desc}`)
    if (!ok) fallos++
  }
}

console.log(`\n${fallos === 0 ? '✓ TODO OK' : `✗ ${fallos} aserción(es) fallaron`}`)
process.exit(fallos === 0 ? 0 : 1)
