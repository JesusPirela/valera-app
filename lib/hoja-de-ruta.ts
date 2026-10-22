// La hoja de ruta de un recorrido: el PDF que el asesor lleva el día de las
// citas, con el perfil del cliente y las paradas en orden.
//
// Sigue el mismo lenguaje visual que la ficha de propiedad —azul marino,
// dorado, fondo gris azulado y tarjetas con filo de color— porque la primera
// versión salió toda en blanco y no parecía del mismo juego de documentos.
//
// Por qué un generador propio y no el de la ficha: aquel tiene que adivinar
// dónde cortar las páginas (busca renglones en blanco en el canvas, esquiva
// fotos partidas a la mitad). Aquí no hace falta — este documento ya viene en
// páginas: portada, perfil, y una por parada. Cada <section class="hoja"> es
// exactamente una hoja A4, así que el corte es dato, no heurística. Por eso no
// se tocó el otro: es el PDF que más se usa en la app y ya ha costado caro.

import { Platform } from 'react-native'
import { thumb } from './img'
import { normalizarTelefono } from './telefono'

/** A4 a 96 dpi, que es la rejilla en la que miden los navegadores. */
const ANCHO_PX = 794
const ALTO_PX = 1123

const AZUL = '#0a2a5e'
const AZUL_MED = '#1e3a5f'
const AZUL_CLARO = '#2c5282'
const ORO = '#c9a84c'
const ORO_VIVO = '#FFD700'
const FONDO = '#f5f8fc'
const GRIS = '#6b7280'
const GRIS_SUAVE = '#8a94a6'

export type PerfilHoja = {
  nombre: string
  telefono: string
  correo: string
  origen: string
  formaPago: string
  presupuesto: string
  busca: string
}

export type ParadaHoja = {
  hora: string
  titulo: string
  ubicacion: string
  precio: string
  caracteristicas: string
  mapaUrl: string
  /** El link de la ficha. Sustituye al ID de EasyBroker, que casi ninguna
   *  propiedad tiene y que de todas formas no lleva a ningún lado. */
  linkPropiedad: string
  asesorNombre: string
  asesorTel: string
  /** Ya convertida a data: — las URLs sueltas no se ven en el PDF nativo. */
  fotoBase64: string
  /** Si la cita de esta parada ya está confirmada con quien abre la casa.
   *  Es lo primero que el asesor necesita saber del recorrido: a cuáles puede
   *  llegar derecho y en cuáles hay que llamar antes. */
  confirmada: boolean
}

export type DatosHoja = {
  fecha: string
  perfil: PerfilHoja
  paradas: ParadaHoja[]
  logoBase64: string
}

const esc = (s: string) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const hay = (s: string | null | undefined) => !!(s && s.trim())

/** Una fila de la tabla del perfil. Si no hay dato, no se escribe la fila. */
function fila(etiqueta: string, valor: string, destacado = false): string {
  if (!hay(valor)) return ''
  return `<tr><th>${esc(etiqueta)}</th><td${destacado ? ' class="fuerte"' : ''}>${esc(valor).replace(/\n/g, '<br>')}</td></tr>`
}

/**
 * El teléfono del asesor, tocable para abrir su WhatsApp.
 *
 * El día del recorrido lo que se hace con ese número es escribirle —"ya vamos
 * llegando", "¿abres tú?"— y teclearlo a mano desde un PDF es justo lo que
 * nadie hace. Si el número no se puede normalizar (una extensión, un fijo
 * raro), se deja como texto: más vale un dato suelto que un enlace muerto.
 */
function enlaceWhatsApp(tel: string): string {
  const n = normalizarTelefono(tel)
  if (n.length !== 12) return esc(tel)
  return `<a href="https://wa.me/${n}">${esc(tel)}</a>`
}

function dato(etiqueta: string, valor: string): string {
  if (!hay(valor)) return ''
  return `<div class="dato"><div class="dl">${esc(etiqueta)}</div>` +
    `<div class="dv">${esc(valor).replace(/\n/g, '<br>')}</div></div>`
}

// ── El plano del recorrido ───────────────────────────────────────────────────
// El documento original llevaba una ilustración fija de tres casas con horas
// inventadas. Esto la sustituye por un plano que se arma solo: tantas paradas
// como tenga el recorrido, en su orden, cada una con la hora que se le puso.
//
// Va en SVG y no como imagen para que no dependa de ningún archivo ni de
// internet: se dibuja dentro del PDF.

// ── Las siete composiciones ──────────────────────────────────────────────────
// Una por cada cantidad de paradas, de 1 a 7, con las casas colocadas a mano.
// La rejilla automática de antes repartía las casas por celdas y salía un
// esquema; estas están puestas a ojo para que la calle serpentee y el recorrido
// se lea como un paseo.
//
// Cada punto es el SUELO de la casa: el dibujo se levanta desde ahí.
const COMPOSICIONES: Record<number, [number, number][]> = {
  1: [[350, 268]],
  2: [[196, 316], [496, 214]],
  3: [[160, 330], [352, 206], [556, 318]],
  4: [[142, 332], [306, 200], [470, 332], [634, 200]],
  // Con cinco o más, las dos bandas se acercan: con la separación de antes el
  // recorrido salía en picos de sierra en vez de serpentear.
  5: [[126, 328], [256, 222], [388, 328], [520, 222], [650, 328]],
  6: [[116, 326], [224, 228], [332, 326], [440, 228], [548, 326], [656, 228]],
  7: [[108, 324], [200, 232], [292, 324], [384, 232], [476, 324], [568, 232], [660, 324]],
}

const ANCHO_MAPA = 700
const ALTO_MAPA = 430

/** Cinco fachadas distintas, para que el plano no se vea fotocopiado. */
const FACHADAS = [
  { muro: '#ffffff', techo: '#1a365d', puerta: '#c9a84c', marco: '#e2e8f0' },
  { muro: '#f6ead6', techo: '#9c4221', puerta: '#7b341e', marco: '#ead9bd' },
  { muro: '#e9eff5', techo: '#2c5282', puerta: '#1a365d', marco: '#d6e0ea' },
  { muro: '#fdf6ec', techo: '#4a5568', puerta: '#2d3748', marco: '#efe4d4' },
  { muro: '#eef2ec', techo: '#2f6b4f', puerta: '#1f4733', marco: '#dde6da' },
]

/**
 * Una casa con algo de cuerpo: zócalo, tejado con alero, puerta con escalón,
 * ventanas con crucero y un arbusto al lado. Nada de fotorrealismo — lo que se
 * busca es que parezca dibujada y no un diagrama.
 */
function casa(x: number, suelo: number, variante: number, k: number): string {
  const c = FACHADAS[variante % FACHADAS.length]
  const a = 40 * k            // media anchura del cuerpo
  const h = 40 * k            // alto del cuerpo
  const t = 26 * k            // alto del tejado
  const y0 = suelo - h        // arranque del cuerpo
  const ventanas = [-1, 1].map(s => {
    const vx = x + s * (a - 13 * k) - 6.5 * k
    const vy = y0 + 9 * k
    const w = 13 * k, hv = 11 * k
    return `<g>
      <rect x="${vx}" y="${vy}" width="${w}" height="${hv}" rx="1" fill="#cfe2f1" stroke="${c.marco}" stroke-width="${1.4 * k}"/>
      <line x1="${vx + w / 2}" y1="${vy}" x2="${vx + w / 2}" y2="${vy + hv}" stroke="${c.marco}" stroke-width="${1 * k}"/>
      <line x1="${vx}" y1="${vy + hv / 2}" x2="${vx + w}" y2="${vy + hv / 2}" stroke="${c.marco}" stroke-width="${1 * k}"/>
    </g>`
  }).join('')
  return `
    <g>
      <ellipse cx="${x}" cy="${suelo + 2}" rx="${a + 8 * k}" ry="${5 * k}" fill="rgba(10,42,94,0.14)"/>
      <rect x="${x - a}" y="${y0}" width="${a * 2}" height="${h}" rx="${2 * k}" fill="${c.muro}" stroke="rgba(10,42,94,0.16)" stroke-width="${0.9 * k}"/>
      <rect x="${x - a}" y="${suelo - 5 * k}" width="${a * 2}" height="${5 * k}" fill="rgba(10,42,94,0.07)"/>
      <path d="M ${x - a - 8 * k} ${y0 + 1} L ${x} ${y0 - t} L ${x + a + 8 * k} ${y0 + 1} z" fill="${c.techo}"/>
      <path d="M ${x - a - 8 * k} ${y0 + 1} L ${x} ${y0 - t} L ${x} ${y0 + 1} z" fill="rgba(255,255,255,0.10)"/>
      <rect x="${x - 7 * k}" y="${suelo - 18 * k}" width="${14 * k}" height="${18 * k}" rx="${1.5 * k}" fill="${c.puerta}"/>
      <circle cx="${x + 4 * k}" cy="${suelo - 9 * k}" r="${1.3 * k}" fill="rgba(255,255,255,0.75)"/>
      <rect x="${x - 10 * k}" y="${suelo - 2.5 * k}" width="${20 * k}" height="${2.5 * k}" rx="1" fill="rgba(10,42,94,0.12)"/>
      ${ventanas}
      <circle cx="${x + a + 7 * k}" cy="${suelo - 5 * k}" r="${7 * k}" fill="#9fc08a"/>
      <circle cx="${x + a + 2 * k}" cy="${suelo - 2 * k}" r="${5 * k}" fill="#b2cf9e"/>
    </g>`
}

function arbol(x: number, y: number, r: number): string {
  return `<g>
    <ellipse cx="${x}" cy="${y + 7}" rx="${r * 0.8}" ry="3" fill="rgba(10,42,94,0.10)"/>
    <rect x="${x - 1.8}" y="${y - 2}" width="3.6" height="10" rx="1.4" fill="#8a6a44"/>
    <circle cx="${x}" cy="${y - 6}" r="${r}" fill="#8fb67a"/>
    <circle cx="${x - r * 0.48}" cy="${y - 2}" r="${r * 0.62}" fill="#a9c995"/>
    <circle cx="${x + r * 0.5}" cy="${y - 3}" r="${r * 0.56}" fill="#7ea76a"/>
  </g>`
}

/** Curva suave que pasa por todos los puntos (Catmull-Rom convertido a bézier). */
function curvaSuave(pts: [number, number][]): string {
  if (pts.length === 1) return `M ${pts[0][0] - 150} ${pts[0][1] + 40} Q ${pts[0][0] - 70} ${pts[0][1] + 30}, ${pts[0][0]} ${pts[0][1]}`
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], [x2, y2] = p[i + 1], [x3, y3] = p[i + 2]
    d += ` C ${x1 + (x2 - x0) / 10} ${y1 + (y2 - y0) / 10}, ${x2 - (x3 - x1) / 10} ${y2 - (y3 - y1) / 10}, ${x2} ${y2}`
  }
  return d
}

function mapaDelRecorrido(paradas: ParadaHoja[]): string {
  const n = paradas.length
  if (n === 0) return ''

  const W = ANCHO_MAPA, H = ALTO_MAPA
  // Más de siete paradas en un día es rarísimo; si pasa, se reparten en una
  // serpentina y se achica todo, pero el recorrido sigue saliendo completo.
  const comp: [number, number][] = COMPOSICIONES[n] ?? Array.from({ length: n }, (_, i) => {
    const cols = Math.ceil(n / 2)
    return [86 + (i % cols) * ((W - 180) / Math.max(1, cols - 1)), i % 2 === 0 ? 340 : 200] as [number, number]
  })
  const k = n <= 3 ? 1 : n <= 5 ? 0.82 : 0.68
  // Con pocas paradas cabe la tarjeta al lado; con muchas, sólo la hora debajo.
  const tarjetaAmplia = n <= 4

  // La calle pasa POR DELANTE de las casas, no por encima: se baja el trazo
  // respecto al suelo de cada casa y se arranca desde la esquina de abajo a la
  // izquierda, que es donde esperan la camioneta y el letrero de INICIO.
  const SALIDA: [number, number] = [26, H - 44]
  const camino = curvaSuave([SALIDA, ...comp.map(([x, y]) => [x, y + 30] as [number, number])])

  // ── Escenario ───────────────────────────────────────────────────────────
  // Se siembran árboles en una retícula y se quitan los que caigan encima de
  // una casa. Así el paisaje cambia con la composición sin tener que colocarlo
  // a mano siete veces.
  const lejos = (x: number, y: number, d: number) =>
    comp.every(([cx, cy]) => Math.hypot(cx - x, cy - y) > d)
  // Un desorden a propósito: en retícula limpia salían en fila militar.
  const arboles: string[] = []
  let semilla = 7
  const az = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let gx = 40; gx < W - 24; gx += 62) {
    for (const gy of [58, 128, 392]) {
      const x = gx + (az() - 0.5) * 46
      const y = gy + (az() - 0.5) * 34
      if (az() < 0.3) continue
      if (x > 20 && x < W - 20 && lejos(x, y, 86 * k + 34) && arboles.length < 15) {
        arboles.push(arbol(x, y, 8.5 + az() * 5))
      }
    }
  }
  const lago = lejos(360, 118, 118)
    ? `<g><ellipse cx="360" cy="118" rx="54" ry="27" fill="#b4d5e8"/><ellipse cx="360" cy="113" rx="44" ry="20" fill="#a0c9e0"/>
       <path d="M 332 112 q 12 -5 24 0 q 12 5 24 0" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.55"/></g>`
    : ''

  // ── Marcas de cada parada ───────────────────────────────────────────────
  const marcas = comp.map(([x, y], i) => {
    const hora = (paradas[i].hora ?? '').trim()
    const pinY = y - 72 * k            // el pin flota sobre el tejado
    let etiqueta: string
    if (tarjetaAmplia) {
      const an = hora ? 126 : 108, al = hora ? 48 : 31
      const dx = x + 26 + an > W - 10 ? -(an + 26) : 26
      const ex = x + dx, ey = pinY - al / 2 - 10
      const reloj = hora ? `
          <circle cx="${ex + 19}" cy="${ey + 16}" r="7" fill="none" stroke="${AZUL_CLARO}" stroke-width="1.7"/>
          <line x1="${ex + 19}" y1="${ey + 16}" x2="${ex + 19}" y2="${ey + 11.6}" stroke="${AZUL_CLARO}" stroke-width="1.7" stroke-linecap="round"/>
          <line x1="${ex + 19}" y1="${ey + 16}" x2="${ex + 22.8}" y2="${ey + 17.6}" stroke="${AZUL_CLARO}" stroke-width="1.7" stroke-linecap="round"/>
          <text x="${ex + 32}" y="${ey + 20.5}" font-size="15" font-weight="700" fill="${AZUL_CLARO}" font-family="Helvetica, Arial, sans-serif">${esc(hora)}</text>
          <text x="${ex + 15}" y="${ey + 37}" font-size="11.5" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>`
        : `<text x="${ex + 15}" y="${ey + 19}" font-size="12.5" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>`
      etiqueta = `
        <rect x="${ex + 1.5}" y="${ey + 2.5}" width="${an}" height="${al}" rx="9" fill="rgba(10,42,94,0.15)"/>
        <rect x="${ex}" y="${ey}" width="${an}" height="${al}" rx="9" fill="#fff"/>
        <rect x="${ex}" y="${ey}" width="4.5" height="${al}" rx="2" fill="${ORO}"/>
        ${reloj}`
    } else {
      // Compacta: sólo la hora, centrada bajo la casa. El número ya va en el pin.
      const txt = hora || `Prop. ${i + 1}`
      const an = Math.max(58, txt.length * 7.4 + 18), al = 23
      const ex = Math.min(Math.max(x - an / 2, 6), W - an - 6), ey = y + 46
      etiqueta = `
        <rect x="${ex + 1}" y="${ey + 1.5}" width="${an}" height="${al}" rx="6" fill="rgba(10,42,94,0.15)"/>
        <rect x="${ex}" y="${ey}" width="${an}" height="${al}" rx="6" fill="#fff"/>
        <rect x="${ex}" y="${ey}" width="3.5" height="${al}" rx="1.8" fill="${ORO}"/>
        <text x="${ex + an / 2 + 2}" y="${ey + 16}" text-anchor="middle" font-size="12" font-weight="700" fill="${AZUL_CLARO}" font-family="Helvetica, Arial, sans-serif">${esc(txt)}</text>`
    }
    return `
      <g>
        ${casa(x, y, i, k)}
        <ellipse cx="${x}" cy="${pinY + 2}" rx="8" ry="2.8" fill="rgba(10,42,94,0.22)"/>
        <path d="M ${x} ${pinY} c -13 -9 -19 -18 -19 -27 a 19 19 0 1 1 38 0 c 0 9 -6 18 -19 27 z" fill="${AZUL}"/>
        <circle cx="${x}" cy="${pinY - 27}" r="11.5" fill="#fff"/>
        <text x="${x}" y="${pinY - 22.5}" text-anchor="middle" font-size="15" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">${i + 1}</text>
        <!-- Palomita verde si la cita está confirmada; punto ámbar si no. Es
             para saber de un vistazo a cuáles se puede llegar derecho. -->
        ${paradas[i].confirmada
          ? `<circle cx="${x + 13}" cy="${pinY - 36}" r="7.5" fill="#15803d" stroke="#fff" stroke-width="2"/>
             <path d="M ${x + 9.6} ${pinY - 36.2} l 2.3 2.4 l 4.4 -4.8" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<circle cx="${x + 13}" cy="${pinY - 36}" r="7.5" fill="#d97706" stroke="#fff" stroke-width="2"/>
             <circle cx="${x + 13}" cy="${pinY - 36}" r="2.4" fill="#fff"/>`}
        ${etiqueta}
      </g>`
  }).join('')

  // La salida va fija en la esquina, no pegada a la primera casa: ahí la
  // camioneta tapaba su etiqueta de la hora.
  const [sx, sy] = SALIDA
  return `
  <svg class="mapa" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
       preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#eef4e8"/>
    <circle cx="${W - 70}" cy="54" r="34" fill="#f6f1dd"/>
    ${lago}
    ${arboles.join('')}
    <path d="${camino}" fill="none" stroke="#e3dcc8" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${camino}" fill="none" stroke="#fbf8ef" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${camino}" fill="none" stroke="${AZUL}" stroke-width="3.2" stroke-dasharray="11 9" stroke-linecap="round"/>
    <g>
      <rect x="${sx + 68}" y="${sy - 34}" width="50" height="21" rx="4" fill="${ORO}"/>
      <text x="${sx + 93}" y="${sy - 19.5}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff" font-family="Helvetica, Arial, sans-serif">INICIO</text>
      <line x1="${sx + 68}" y1="${sy - 34}" x2="${sx + 68}" y2="${sy - 2}" stroke="#9a7c22" stroke-width="2.5"/>
    </g>
    <g transform="translate(${sx - 16}, ${sy - 30})">
      <ellipse cx="30" cy="31" rx="30" ry="4" fill="rgba(10,42,94,0.18)"/>
      <rect x="0" y="0" width="60" height="26" rx="7" fill="${AZUL}"/>
      <rect x="42" y="4" width="14" height="11" rx="2" fill="#9fb6c9"/>
      <circle cx="15" cy="27" r="6" fill="#2d3748"/><circle cx="15" cy="27" r="2.2" fill="#718096"/>
      <circle cx="47" cy="27" r="6" fill="#2d3748"/><circle cx="47" cy="27" r="2.2" fill="#718096"/>
      <text x="6" y="17" font-size="8" font-weight="700" fill="${ORO_VIVO}" font-family="Helvetica, Arial, sans-serif">VALERA</text>
    </g>
    ${marcas}
  </svg>`
}

export function construirHtmlHoja(d: DatosHoja): string {
  const { perfil, paradas } = d
  const total = paradas.length

  const portada = `
  <section class="hoja portada">
    <div class="pcab">
      ${d.logoBase64 ? `<img class="logo" src="${d.logoBase64}">` : ''}
      <div class="sello">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
      <h1>Recorrido de propiedades<br>Hoja de ruta</h1>
      <div class="raya"></div>
    </div>
    <p class="intro">
      Documento oficial de recorrido interno del asesor. Concentra el perfil del
      cliente y el orden exacto de las citas del día: en qué secuencia se visitan,
      a qué hora, cuál es cada propiedad y quién la atiende.
    </p>
    <div class="mapa-wrap">${mapaDelRecorrido(paradas)}</div>
    <div class="portada-datos">
      <div class="pd-cliente">${esc(perfil.nombre)}</div>
      <div class="pd-fecha">${esc(d.fecha)}</div>
      <div class="pd-n">${total} ${total === 1 ? 'propiedad' : 'propiedades'} por visitar</div>
    </div>
    <div class="uso">USO INTERNO DEL EQUIPO</div>
    <div class="uso-sub">No se comparte con el cliente ni con asesores externos</div>
  </section>`

  const hojaPerfil = `
  <section class="hoja interior">
    <div class="cab">
      <div>
        <div class="sello2">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
        <h2>Recorrido de propiedades</h2>
        <div class="sub">Intereses del cliente y propiedades a visitar en el recorrido de hoy.</div>
      </div>
      <div class="cab-der">
        <div class="cab-lbl">INFORMACIÓN DE CITA</div>
        <div class="cab-val">${esc(d.fecha)}</div>
      </div>
    </div>
    <div class="barra">PERFIL DEL CLIENTE</div>
    <div class="caja">
      <table class="perfil">
        ${fila('Nombre', perfil.nombre, true)}
        ${fila('Teléfono', perfil.telefono)}
        ${fila('Correo', perfil.correo)}
        ${fila('Origen', perfil.origen)}
        ${fila('Forma de pago', perfil.formaPago)}
        ${fila('Presupuesto máximo', perfil.presupuesto, true)}
        ${fila('Busca', perfil.busca)}
      </table>
    </div>
    <div class="resumen">
      <div class="resumen-tit">RECORRIDO DE HOY</div>
      <ol class="resumen-lista">
        ${paradas.map((p, i) => `<li>
          <span class="rl-n">${i + 1}</span>
          <span class="rl-hora">${hay(p.hora) ? esc(p.hora) : '—'}</span>
          <span class="rl-tit">${esc(p.titulo || 'Sin nombre')}</span>
          <span class="rl-estado ${p.confirmada ? 'ok' : 'pend'}">${p.confirmada ? '✓ Confirmada' : 'Por confirmar'}</span>
        </li>`).join('')}
      </ol>
    </div>
    <div class="pie">Valera Real Estate · Documento interno de uso exclusivo del equipo</div>
  </section>`

  const hojasParadas = paradas.map((p, i) => {
    const cars = (p.caracteristicas ?? '').split('·').map(x => x.trim()).filter(Boolean)
    return `
  <section class="hoja interior">
    <div class="cab">
      <div>
        <div class="sello2">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
        <h2>Propiedad ${i + 1}</h2>
        <div class="sub">${esc(perfil.nombre)}${hay(d.fecha) ? ' · ' + esc(d.fecha) : ''}</div>
      </div>
      <div class="cab-der"><div class="cab-lbl">${i + 1} DE ${total}</div></div>
    </div>
    <div class="barra">
      <span>${hay(p.hora) ? 'CITA — ' + esc(p.hora) : 'PROPIEDAD ' + (i + 1)}</span>
      <span class="${p.confirmada ? 'sello-ok' : 'sello-pend'}">${p.confirmada ? '✓ CONFIRMADA' : '• POR CONFIRMAR'}</span>
    </div>

    <!-- La foto va de fondo y no en un <img>: html2canvas ignora object-fit y
         estiraba las fotos para rellenar el recuadro. -->
    <div class="hero">
      ${p.fotoBase64
        ? `<div class="hero-foto" style="background-image:url('${p.fotoBase64}')"></div>`
        : '<div class="hero-foto sin"><span>Sin foto</span></div>'}
      ${hay(p.precio) ? `<div class="hero-pie"><span class="hero-precio">${esc(p.precio)}</span></div>` : ''}
    </div>

    ${cars.length >= 2 ? `<div class="cars">${cars.map(c => `<div class="car">${esc(c)}</div>`).join('')}</div>` : ''}

    <div class="caja datos">
      ${hay(p.titulo) || hay(p.ubicacion) ? `<div class="dato">
        <div class="dl">Propiedad</div>
        ${hay(p.titulo) ? `<div class="dv fuerte">${esc(p.titulo)}</div>` : ''}
        ${hay(p.ubicacion) ? `<div class="dv gris">${esc(p.ubicacion).replace(/\n/g, '<br>')}</div>` : ''}
      </div>` : ''}
      ${cars.length < 2 ? dato('Características', p.caracteristicas) : ''}
      ${hay(p.mapaUrl) ? `<div class="dato"><div class="dl">Ubicación</div><div class="dv"><a href="${esc(p.mapaUrl)}">Ver en Google Maps</a></div></div>` : ''}
      ${hay(p.linkPropiedad) ? `<div class="dato"><div class="dl">Link de la propiedad</div>` +
        `<div class="dv"><a href="${esc(p.linkPropiedad)}">${esc(p.linkPropiedad.replace(/^https?:\/\//i, ''))}</a></div></div>` : ''}
    </div>

    ${hay(p.asesorNombre) || hay(p.asesorTel) ? `<div class="asesor">
      <div class="as-lbl">ASESOR A CARGO</div>
      ${hay(p.asesorNombre) ? `<div class="as-nom">${esc(p.asesorNombre)}</div>` : ''}
      ${hay(p.asesorTel) ? `<div class="as-tel">${enlaceWhatsApp(p.asesorTel)}</div>` : ''}
    </div>` : ''}

    <div class="pie">Valera Real Estate · Documento interno de uso exclusivo del equipo</div>
  </section>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Hoja de ruta · ${esc(perfil.nombre)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; font-family: Helvetica, Arial, sans-serif; color: #243b53; }
  .hoja {
    width: ${ANCHO_PX}px; height: ${ALTO_PX}px;
    position: relative; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .hoja:last-child { page-break-after: auto; break-after: auto; }
  .interior { background: ${FONDO}; padding: 0 0 48px; }

  /* ── Portada ─────────────────────────────────────────────────────── */
  .portada { text-align: center; background: ${FONDO}; }
  .pcab { background: ${AZUL}; padding: 40px 52px 30px; }
  .pcab .logo { width: 142px; margin: 0 auto 16px; display: block; }
  .sello { font-size: 11.5px; letter-spacing: 2.4px; font-weight: 700; color: rgba(255,255,255,0.72); margin-bottom: 14px; }
  .portada h1 { font-size: 30px; line-height: 1.24; color: #fff; margin: 0 0 16px; font-weight: 800; }
  .raya { width: 120px; height: 4px; margin: 0 auto;
          background: linear-gradient(to right, ${ORO_VIVO} 0, ${ORO_VIVO} 60px, rgba(255,255,255,0.45) 60px); border-radius: 2px; }
  .intro { font-size: 13.5px; line-height: 1.7; color: ${GRIS}; max-width: 540px; margin: 22px auto 18px; }
  /* El ancho lo pone el contenedor con su padding: el SVG suelto con
     width fijo se descuadraba al renderizarlo y se salia por la derecha. */
  .mapa-wrap { padding: 0 52px; margin-bottom: 20px; }
  .mapa { width: 100%; height: auto; display: block; }
  .portada-datos { border: 2px solid ${AZUL}; border-radius: 12px; padding: 20px 28px; max-width: 460px; margin: 0 auto; background: #fff; }
  .pd-cliente { font-size: 25px; font-weight: 800; color: ${AZUL}; }
  .pd-fecha { font-size: 15px; color: ${AZUL_CLARO}; margin-top: 5px; font-weight: 700; }
  .pd-n { font-size: 13.5px; color: ${GRIS_SUAVE}; margin-top: 8px; }
  .uso { position: absolute; left: 0; right: 0; bottom: 88px; font-size: 12.5px; letter-spacing: 2.4px; font-weight: 700; color: ${AZUL_CLARO}; }
  .uso-sub { position: absolute; left: 0; right: 0; bottom: 62px; font-size: 12.5px; color: ${GRIS_SUAVE}; }

  /* ── Cabecera de las hojas interiores ────────────────────────────── */
  .cab { background: ${AZUL}; padding: 26px 46px 22px; display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; }
  .sello2 { font-size: 10.5px; letter-spacing: 1.6px; font-weight: 700; color: rgba(255,255,255,0.65); margin-bottom: 6px; }
  .cab h2 { font-size: 27px; color: #fff; margin: 0; font-weight: 800; line-height: 1.2; }
  .sub { font-size: 13px; color: rgba(255,255,255,0.72); font-style: italic; margin-top: 6px; }
  .cab-der { text-align: right; flex-shrink: 0; padding-top: 2px; }
  .cab-lbl { font-size: 11px; letter-spacing: 1.4px; color: rgba(255,255,255,0.6); font-weight: 700; }
  .cab-val { font-size: 15.5px; font-weight: 800; color: ${ORO_VIVO}; margin-top: 4px; }

  .barra { background: ${AZUL_MED}; color: #fff; font-size: 13.5px; font-weight: 800; letter-spacing: 1.5px;
           padding: 11px 46px; border-left: 6px solid ${ORO};
           display: flex; justify-content: space-between; align-items: center; }
  .sello-ok   { font-size: 11.5px; letter-spacing: 1px; color: #7ae0a8; }
  .sello-pend { font-size: 11.5px; letter-spacing: 1px; color: #ffcf7a; }

  .caja { background: #fff; border-radius: 12px; margin: 20px 46px 0; padding: 6px 20px;
          box-shadow: 0 1px 3px rgba(10,42,94,0.08); }

  /* ── Tabla del perfil ────────────────────────────────────────────── */
  table.perfil { width: 100%; border-collapse: collapse; }
  table.perfil th, table.perfil td { text-align: left; padding: 13px 10px; border-bottom: 1px solid #eaf0f6; font-size: 15px; vertical-align: top; }
  table.perfil tr:last-child th, table.perfil tr:last-child td { border-bottom: none; }
  table.perfil th { width: 178px; font-weight: 700; color: ${GRIS_SUAVE}; font-size: 12.5px; letter-spacing: 0.4px; text-transform: uppercase; }
  table.perfil td { color: #243b53; }
  table.perfil td.fuerte { font-weight: 800; color: ${AZUL}; font-size: 16.5px; }

  /* ── Resumen del recorrido en la hoja de perfil ──────────────────── */
  .resumen { margin: 22px 46px 0; }
  .resumen-tit { font-size: 12.5px; font-weight: 800; letter-spacing: 1.5px; color: ${AZUL}; margin-bottom: 10px; }
  .resumen-lista { list-style: none; margin: 0; padding: 0; }
  .resumen-lista li { display: flex; align-items: center; gap: 12px; background: #fff; border-left: 4px solid ${ORO};
                      border-radius: 9px; padding: 11px 14px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(10,42,94,0.06); }
  .rl-n { width: 24px; height: 24px; border-radius: 12px; background: ${AZUL}; color: #fff; font-size: 12.5px;
          font-weight: 800; text-align: center; line-height: 24px; flex-shrink: 0; }
  .rl-hora { font-size: 13.5px; font-weight: 800; color: ${AZUL_CLARO}; width: 76px; flex-shrink: 0; }
  .rl-tit { font-size: 13.5px; color: #243b53; overflow: hidden; flex: 1; }
  .rl-estado { font-size: 11px; font-weight: 800; border-radius: 6px; padding: 4px 9px; flex-shrink: 0; letter-spacing: 0.3px; }
  .rl-estado.ok   { background: #dcfce7; color: #15803d; }
  .rl-estado.pend { background: #fef3c7; color: #a16207; }

  /* ── Hoja de propiedad ───────────────────────────────────────────── */
  .hero { position: relative; margin: 0; }
  .hero-foto { width: 100%; height: 318px; background-size: cover; background-position: center; background-repeat: no-repeat; background-color: #dde6ef; }
  .hero-foto.sin { display: flex; align-items: center; justify-content: center; color: ${GRIS_SUAVE}; font-size: 13px; }
  .hero-pie { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px 46px 16px;
              background-image: linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0) 100%); }
  .hero-precio { font-size: 33px; font-weight: 800; color: ${ORO_VIVO}; letter-spacing: 0.4px; }

  .cars { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 46px 0; }
  .car { background: #fff; border-radius: 10px; border-left: 4px solid ${AZUL}; padding: 11px 14px;
         font-size: 13.5px; font-weight: 700; color: ${AZUL}; box-shadow: 0 1px 3px rgba(10,42,94,0.08); }

  .datos { padding: 16px 20px; }
  .dato { margin-bottom: 14px; }
  .dato:last-child { margin-bottom: 0; }
  .dl { font-size: 11.5px; color: ${GRIS_SUAVE}; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
  .dv { font-size: 15.5px; color: #243b53; line-height: 1.5; }
  .dv.fuerte { font-weight: 800; color: ${AZUL}; font-size: 17px; }
  .dv.gris { color: ${GRIS}; font-size: 14px; }
  .dv a { color: #2563eb; text-decoration: none; }

  .asesor { margin: 18px 46px 0; background: ${AZUL}; border-radius: 12px; padding: 16px 20px; }
  .as-lbl { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
  .as-nom { font-size: 16.5px; font-weight: 800; color: #fff; }
  .as-tel { font-size: 15px; color: ${ORO_VIVO}; margin-top: 3px; font-weight: 700; }
  .as-tel a { color: ${ORO_VIVO}; text-decoration: none; }

  .pie { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; font-size: 11.5px; color: ${GRIS_SUAVE}; }
</style></head><body>${portada}${hojaPerfil}${hojasParadas}</body></html>`
}

/** Espera a que todas las imágenes del contenedor estén listas (o fallen). */
function esperarImagenes(cont: HTMLElement): Promise<void> {
  const imgs = Array.from(cont.querySelectorAll('img'))
  return Promise.all(imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }),
  )).then(() => undefined)
}

/**
 * Genera y entrega el PDF. En web lo descarga; en el teléfono abre el menú de
 * compartir, que es donde vive WhatsApp.
 */
export async function generarPdfHojaDeRuta(datos: DatosHoja, nombreArchivo: string): Promise<void> {
  const html = construirHtmlHoja(datos)

  if (Platform.OS === 'web') {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const cont = document.createElement('div')
    cont.style.cssText = `position:fixed;left:-20000px;top:0;width:${ANCHO_PX}px;background:#fff;z-index:-1`
    cont.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    // Los estilos van aparte: innerHTML del body no arrastra el <head>.
    const estilo = document.createElement('style')
    estilo.textContent = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))
    cont.appendChild(estilo)
    document.body.appendChild(cont)
    try {
      await esperarImagenes(cont)
      const doc = new jsPDF('p', 'pt', 'a4')
      const ancho = doc.internal.pageSize.getWidth()
      const alto = doc.internal.pageSize.getHeight()
      const hojas = Array.from(cont.querySelectorAll('.hoja')) as HTMLElement[]
      for (let i = 0; i < hojas.length; i++) {
        const hoja = hojas[i]
        const canvas = await html2canvas(hoja, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
        if (i > 0) doc.addPage()
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, ancho, alto)

        // La página es una imagen, así que los enlaces del HTML se vuelven
        // píxeles: "Ver en Google Maps" se veía azul y subrayado pero no se
        // podía tocar. Se recorta cada enlace y se pega encima su área
        // clicable, convirtiendo los píxeles de la pantalla a puntos del PDF.
        const caja = hoja.getBoundingClientRect()
        const kx = ancho / caja.width
        const ky = alto / caja.height
        for (const a of Array.from(hoja.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
          const r = a.getBoundingClientRect()
          if (!r.width || !r.height) continue
          // Un poco de holgura alrededor: el teléfono del asesor mide 13
          // puntos de alto y en el teléfono es un blanco muy chico para el dedo.
          const hx = 3, hy = 5
          doc.link(
            (r.left - caja.left) * kx - hx,
            (r.top - caja.top) * ky - hy,
            r.width * kx + hx * 2,
            r.height * ky + hy * 2,
            { url: a.href },
          )
        }
      }
      doc.save(nombreArchivo)
    } finally {
      document.body.removeChild(cont)
    }
    return
  }

  const Print = await import('expo-print')
  const Share = await import('expo-sharing')
  const { uri } = await Print.printToFileAsync({ html, width: ANCHO_PX })
  if (await Share.isAvailableAsync()) {
    await Share.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: nombreArchivo })
  }
}

/** Baja un archivo y lo devuelve como data:. Sin proxy ni recortes. */
export async function bajarComoBase64(url: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error('http ' + res.status)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(String(fr.result ?? ''))
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
  }
  const FileSystem = await import('expo-file-system')
  const destino = FileSystem.cacheDirectory + 'hr_' + Math.random().toString(36).slice(2) + '.img'
  const { uri } = await FileSystem.downloadAsync(url, destino)
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return 'data:image/jpeg;base64,' + b64
}

/**
 * Convierte una FOTO DE PROPIEDAD a data: para que se vea dentro del PDF.
 *
 * Va por el proxy de thumb() y NO por la URL original. Las fotos de las
 * propiedades importadas viven en CDNs ajenos (EasyBroker, CloudFront) que no
 * permiten leerlas desde el navegador: la descarga fallaba y la hoja salía con
 * "Sin foto" aunque la propiedad tuviera sus fotos. De paso baja una imagen de
 * 1000 px en vez de la original de varios MB.
 *
 * OJO: esto NO sirve para el logo. El proxy entrega JPG, que no tiene
 * transparencia, y el logo —dorado sobre fondo transparente— se volvía
 * invisible. El logo se baja con bajarComoBase64, tal cual.
 *
 * Si el proxy falla se intenta la original, y si tampoco, se devuelve '': la
 * hoja sale sin foto, nunca rota.
 */
export async function imagenABase64(url: string | null | undefined): Promise<string> {
  if (!url) return ''
  const porProxy = thumb(url, { width: 1100, quality: 82 })
  for (const intento of [porProxy, url].filter(Boolean) as string[]) {
    try {
      const b64 = await bajarComoBase64(intento)
      if (b64) return b64
    } catch { /* se prueba el siguiente */ }
  }
  return ''
}
