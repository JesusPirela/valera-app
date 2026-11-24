// Pruebas del lector de fichas pegadas (lib/parsear-ficha.ts) y de los topes
// de conteo (lib/conteos.ts).
//
// Nace de un bug que llego a los clientes: al importar, una casa de 6
// recamaras se guardaba con 5 y una de 5 banos con 4, porque el import hacia
// Math.min(n, 5). Medido el 24/nov/2026: en 2,691 propiedades no habia NI UNA
// con 6 recamaras. 88 tenian su propia descripcion contradiciendo al dato.
//
// Uso:  node scripts/test-ficha.mjs      (no toca la red ni la base)
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Node no resuelve los imports sin extension de los .ts (Metro si). Se le
// ensena, para probar el codigo REAL y no una copia.
register(new URL('./_resolver-ts.mjs', import.meta.url))

const { parsearFicha } = await import('../lib/parsear-ficha.ts')
const { conteo, TOPE, opcionesConteo } = await import('../lib/conteos.ts')

const CASOS = [
  ['7 recamaras: antes se recortaban a 5',
   'Casa en Venta en Jurica\n$18,500,000 MXN\n7 recámaras\n6 baños completos\n4 estacionamientos',
   { recamaras: 7, banos: 6, estacionamientos: 4 }],
  ['"2.5 baños" no son 5 baños',
   'Casa en Venta en Milenio\n$4,000,000 MXN\n3 recámaras\n2.5 baños\n2 estacionamientos',
   { recamaras: 3, banos: 2, mediosBanos: 1, estacionamientos: 2 }],
  ['"2 1/2 baños"',
   'Casa en Venta\n3 recámaras\n2 1/2 baños',
   { recamaras: 3, banos: 2, mediosBanos: 1 }],
  ['"2 medios baños" en plural',
   'Casa en Venta\n6 recámaras\n4 baños completos\n2 medios baños\n3 cajones',
   { recamaras: 6, banos: 4, mediosBanos: 2, estacionamientos: 3 }],
  ['"habitaciones" en vez de "recámaras"',
   'Departamento en Renta en Centro\n$22,000 MXN\n4 habitaciones\n2 baños',
   { recamaras: 4, banos: 2 }],
  ['"dormitorios"',
   'Casa en Venta\n5 dormitorios\n3 baños',
   { recamaras: 5, banos: 3 }],
  ['"cajones de estacionamiento"',
   'Casa en Venta\n3 recámaras\n2 baños\n4 cajones de estacionamiento',
   { recamaras: 3, banos: 2, estacionamientos: 4 }],
  ['"1 medio baño" en singular sigue leyendose',
   'Casa en Venta\n3 recámaras\n2 baños completos\n1 medio baño\n2 estacionamientos',
   { recamaras: 3, banos: 2, mediosBanos: 1, estacionamientos: 2 }],
  ['un numero mal leido se DESCARTA, no se recorta',
   'Casa en Venta\n249 recámaras\n2 baños',
   { recamaras: null, banos: 2 }],
  ['la ficha que genera la app no cambia',
   'Casa en Venta en Zibatá | Zibatá, El Marqués\n💰 Precio: $3,200,000 MXN\n📐 Terreno: 160 m²\n🏗️ Construcción: 142 m²\n🛏️ 3 recámaras\n🚿 2 baños completos\n🚻 1 medio baño\n🚗 2 estacionamientos',
   { recamaras: 3, banos: 2, mediosBanos: 1, estacionamientos: 2,
     precio: '3200000', m2: '142', m2Terreno: '160', tipo: 'casa', operacion: 'venta' }],
]

let fallos = 0
for (const [nombre, texto, espera] of CASOS) {
  const r = parsearFicha(texto)
  const malos = Object.entries(espera).filter(([k, v]) => r[k] !== v)
  if (malos.length) {
    fallos++
    console.log(`✗ ${nombre}`)
    for (const [k, v] of malos) console.log(`    ${k}: esperado ${JSON.stringify(v)}, recibido ${JSON.stringify(r[k])}`)
  } else console.log(`✓ ${nombre}`)
}

// conteo(): credible se guarda, no creible se descarta
const CONTEOS = [
  [6, TOPE.recamaras, 6], [12, TOPE.recamaras, 12], [0, TOPE.recamaras, 0],
  [249, TOPE.recamaras, null], [-1, TOPE.recamaras, null], [null, TOPE.recamaras, null],
  [2.4, TOPE.banos, 2], [2.6, TOPE.banos, 3],
]
for (const [n, tope, esp] of CONTEOS) {
  const got = conteo(n, tope)
  if (got !== esp) { fallos++; console.log(`✗ conteo(${n}) = ${got}, esperado ${esp}`) }
}
if (!CONTEOS.some(([n, t, e]) => conteo(n, t) !== e)) console.log('✓ conteo() acepta lo creible y descarta lo demas')

// El desplegable TIENE que poder ensenar un valor fuera de su rango: si no,
// DropdownModal no lo encuentra, ensena el placeholder y el siguiente
// guardado lo borraria.
for (const v of [12, 25]) {
  const ops = opcionesConteo(0, 10, v)
  if (!ops.some(o => o.value === v)) { fallos++; console.log(`✗ opcionesConteo no incluye el valor guardado ${v}`) }
}
if (!fallos) console.log('✓ opcionesConteo incluye el valor guardado aunque se salga del rango')

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ TODO OK')
process.exit(fallos ? 1 : 0)
