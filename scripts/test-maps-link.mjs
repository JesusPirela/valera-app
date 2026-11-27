// Pruebas del lector de links de Google Maps (lib/maps-link.ts).
//
// Son links REALES de los que da la app de Google Maps al compartir, no
// inventados: el de "place" con su !3d!4d, el de la cámara (@), el corto de
// maps.app.goo.gl y el de coordenadas pegadas a mano.
//
// Uso:  node scripts/test-maps-link.mjs      (no toca la red ni la base)
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(new URL('./_resolver-ts.mjs', import.meta.url))
const { parsearLinkMaps, esLinkMaps, esLinkCortoMaps } = await import('../lib/maps-link.ts')

const CASOS = [
  ['place con punto exacto (!3d!4d gana sobre @)',
   'https://www.google.com/maps/place/Zibat%C3%A1,+Quer%C3%A9taro/@20.7111,-100.3222,15z/data=!3m1!4b1!4m6!3m5!1s0x85d35b!8m2!3d20.7005!4d-100.3101!16s%2Fg%2F11c',
   { lat: 20.7005, lng: -100.3101, nombre: 'Zibatá, Querétaro' }],

  ['solo la cámara',
   'https://www.google.com/maps/@20.5888,-100.3899,17z',
   { lat: 20.5888, lng: -100.3899, nombre: null }],

  ['forma vieja con ?q=',
   'https://maps.google.com/?q=20.6100,-100.4050',
   { lat: 20.61, lng: -100.405, nombre: null }],

  ['enlace armado a mano (api=1&query=)',
   'https://www.google.com/maps/search/?api=1&query=20.5500,-100.3800',
   { lat: 20.55, lng: -100.38, nombre: null }],

  ['dominio de México',
   'https://www.google.com.mx/maps/place/Casa/@20.1,-100.2,17z/data=!4m2!3m1!1s0x0:0x0',
   { lat: 20.1, lng: -100.2, nombre: 'Casa' }],

  ['coordenadas pegadas tal cual (lo que copia el teléfono)',
   '20.588800, -100.389900',
   { lat: 20.5888, lng: -100.3899, nombre: null }],

  ['el "nombre" que en realidad son coordenadas no se usa',
   'https://www.google.com/maps/place/20.58,-100.38/@20.58,-100.38,17z',
   { lat: 20.58, lng: -100.38, nombre: null }],

  ['link corto: no trae coordenadas, hay que resolverlo primero',
   'https://maps.app.goo.gl/abc123XYZ', null],

  ['una dirección escrita no es un link', 'Juriquilla, Querétaro', null],

  ['un precio con coma no se confunde con coordenadas', '2,500,000', null],

  ['el (0,0) no es una propiedad',
   'https://www.google.com/maps/@0,0,17z', null],

  ['coordenadas imposibles',
   'https://www.google.com/maps/@200,-500,17z', null],
]

let mal = 0
for (const [titulo, entrada, esperado] of CASOS) {
  const r = parsearLinkMaps(entrada)
  const ok = esperado === null
    ? r === null
    : r !== null &&
      Math.abs(r.lat - esperado.lat) < 1e-6 &&
      Math.abs(r.lng - esperado.lng) < 1e-6 &&
      (r.nombre ?? null) === esperado.nombre
  if (!ok) mal++
  console.log(`${ok ? 'ok  ' : 'MAL '} ${titulo}`)
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)} · salió ${JSON.stringify(r)}`)
}

// Reconocer el link es otra cosa que leerlo: el corto se reconoce aunque no se
// pueda leer todavía.
const RECONOCE = [
  ['https://maps.app.goo.gl/abc', true, true],
  ['https://goo.gl/maps/abc', true, true],
  ['https://www.google.com/maps/@20.5,-100.3,17z', true, false],
  ['https://www.google.com.mx/maps/place/Casa', true, false],
  ['https://inmuebles24.com/propiedad', false, false],
  ['Juriquilla', false, false],
]
for (const [t, esMaps, esCorto] of RECONOCE) {
  const a = esLinkMaps(t) === esMaps
  const b = esLinkCortoMaps(t) === esCorto
  if (!a || !b) { mal++; console.log(`MAL  reconocer ${t}: maps=${esLinkMaps(t)} corto=${esLinkCortoMaps(t)}`) }
  else console.log(`ok   reconocer ${t.slice(0, 48)}`)
}

console.log(mal ? `\n${mal} FALLOS` : '\nTodas pasan')
process.exit(mal ? 1 : 0)
