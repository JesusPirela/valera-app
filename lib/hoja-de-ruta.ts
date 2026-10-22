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

/** Tres fachadas distintas, para que el plano no se vea fotocopiado. */
const FACHADAS = [
  { muro: '#ffffff', techo: AZUL, puerta: ORO },
  { muro: '#f4ead9', techo: '#9c4221', puerta: '#7b341e' },
  { muro: '#e8eef4', techo: '#2c5282', puerta: '#1a365d' },
]

function casita(x: number, y: number, k: number, esc: number): string {
  const c = FACHADAS[k % FACHADAS.length]
  const a = 30 * esc, b = 26 * esc, t = 18 * esc
  return `
    <g transform="translate(${x}, ${y - 88 * esc})">
      <ellipse cx="0" cy="${b + 3}" rx="${a + 2}" ry="${4 * esc}" fill="rgba(10,42,94,0.13)"/>
      <rect x="${-a}" y="0" width="${a * 2}" height="${b}" rx="2" fill="${c.muro}" stroke="rgba(10,42,94,0.18)"/>
      <path d="M ${-a - 5} 0 L 0 ${-t} L ${a + 5} 0 z" fill="${c.techo}"/>
      <rect x="${-6 * esc}" y="${b - 14 * esc}" width="${12 * esc}" height="${14 * esc}" rx="1" fill="${c.puerta}"/>
      <rect x="${-a + 6 * esc}" y="${7 * esc}" width="${9 * esc}" height="${8 * esc}" rx="1" fill="#cfe0ef" stroke="rgba(10,42,94,0.18)" stroke-width="0.6"/>
      <rect x="${a - 15 * esc}" y="${7 * esc}" width="${9 * esc}" height="${8 * esc}" rx="1" fill="#cfe0ef" stroke="rgba(10,42,94,0.18)" stroke-width="0.6"/>
    </g>`
}

function arbol(x: number, y: number, r: number): string {
  return `<g><rect x="${x - 1.6}" y="${y - 2}" width="3.2" height="9" fill="#8a6a44"/>` +
    `<circle cx="${x}" cy="${y - 5}" r="${r}" fill="#9fc08a"/>` +
    `<circle cx="${x - r * 0.5}" cy="${y - 2}" r="${r * 0.62}" fill="#b2cf9e"/>` +
    `<circle cx="${x + r * 0.5}" cy="${y - 2.5}" r="${r * 0.58}" fill="#8fb67a"/></g>`
}

function mapaDelRecorrido(paradas: ParadaHoja[]): string {
  const n = paradas.length
  if (n === 0) return ''

  const W = 700, H = 400
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4
  const filas = Math.ceil(n / cols)
  const anchoCelda = (W - 90) / cols
  const altoCelda = (H - 120) / filas
  const k = filas >= 3 || cols >= 4 ? 0.8 : 1

  // Serpentina: la primera fila de izquierda a derecha, la siguiente de vuelta.
  // Así la línea punteada se lee como un recorrido y no como un zigzag suelto.
  // Las filas se centran en el alto: con una sola parada el dibujo quedaba
  // pegado arriba y con medio plano vacío debajo.
  const margenY = (H - filas * altoCelda) / 2
  const puntos = paradas.map((_, i) => {
    const f = Math.floor(i / cols)
    let col = i % cols
    if (f % 2 === 1) col = cols - 1 - col
    return { x: 70 + col * anchoCelda + anchoCelda * 0.2, y: margenY + f * altoCelda + altoCelda * 0.68 }
  })

  const camino = puntos.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')

  // Manzanas de pasto entre las calles, para que no sea una rejilla pelada.
  const manzanas: string[] = []
  for (let fx = 0; fx < 6; fx++) {
    for (let fy = 0; fy < 4; fy++) {
      manzanas.push(`<rect x="${26 + fx * 114}" y="${22 + fy * 98}" width="96" height="80" rx="9" fill="#e6efe0"/>`)
    }
  }
  const calles =
    Array.from({ length: 5 }, (_, i) => `<line x1="14" y1="${12 + i * 98}" x2="${W - 14}" y2="${12 + i * 98}" stroke="#fbf9f3" stroke-width="18" stroke-linecap="round"/>`).join('') +
    Array.from({ length: 7 }, (_, i) => `<line x1="${16 + i * 114}" y1="12" x2="${16 + i * 114}" y2="${H - 12}" stroke="#fbf9f3" stroke-width="18" stroke-linecap="round"/>`).join('')

  const arboles = [
    arbol(60, 86, 11), arbol(640, 120, 12), arbol(96, 330, 10),
    arbol(610, 348, 11), arbol(352, 60, 10), arbol(300, 352, 11),
  ].join('')

  const lago = `<g><ellipse cx="358" cy="208" rx="46" ry="26" fill="#bcd9ea"/><ellipse cx="358" cy="204" rx="38" ry="20" fill="#a8cde3"/></g>`

  const marcas = puntos.map((p, i) => {
    const hora = (paradas[i].hora ?? '').trim()
    const anchoEtq = (hora ? 108 : 92) * k
    const altoEtq = (hora ? 42 : 27) * k
    // La etiqueta salta al otro lado si no cabe por la derecha.
    const dx = p.x + 22 * k + anchoEtq > W - 12 ? -(anchoEtq + 20 * k) : 22 * k
    const ex = p.x + dx
    const ey = p.y - altoEtq / 2 - 9 * k
    return `
      <g>
        ${casita(p.x, p.y, i, k)}
        <ellipse cx="${p.x}" cy="${p.y + 2}" rx="9" ry="3" fill="rgba(10,42,94,0.2)"/>
        <path d="M ${p.x} ${p.y} c -13 -9 -19 -18 -19 -27 a 19 19 0 1 1 38 0 c 0 9 -6 18 -19 27 z" fill="${AZUL}"/>
        <circle cx="${p.x}" cy="${p.y - 27}" r="11.5" fill="#fff"/>
        <text x="${p.x}" y="${p.y - 22.5}" text-anchor="middle" font-size="14" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">${i + 1}</text>
        <rect x="${ex + 1.5}" y="${ey + 2.5}" width="${anchoEtq}" height="${altoEtq}" rx="8" fill="rgba(10,42,94,0.13)"/>
        <rect x="${ex}" y="${ey}" width="${anchoEtq}" height="${altoEtq}" rx="8" fill="#fff"/>
        <rect x="${ex}" y="${ey}" width="${4 * k}" height="${altoEtq}" rx="2" fill="${ORO}"/>
        ${hora ? `
          <circle cx="${ex + 18 * k}" cy="${ey + 15 * k}" r="${6.5 * k}" fill="none" stroke="${AZUL_CLARO}" stroke-width="1.6"/>
          <line x1="${ex + 18 * k}" y1="${ey + 15 * k}" x2="${ex + 18 * k}" y2="${ey + 11 * k}" stroke="${AZUL_CLARO}" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="${ex + 18 * k}" y1="${ey + 15 * k}" x2="${ex + 21.5 * k}" y2="${ey + 16.5 * k}" stroke="${AZUL_CLARO}" stroke-width="1.6" stroke-linecap="round"/>
          <text x="${ex + 30 * k}" y="${ey + 19 * k}" font-size="${13 * k}" font-weight="700" fill="${AZUL_CLARO}" font-family="Helvetica, Arial, sans-serif">${esc(hora)}</text>
          <text x="${ex + 14 * k}" y="${ey + 34 * k}" font-size="${10.5 * k}" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>
        ` : `
          <text x="${ex + 14 * k}" y="${ey + 18 * k}" font-size="${11 * k}" font-weight="700" fill="${AZUL}" font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>
        `}
      </g>`
  }).join('')

  const p0 = puntos[0]
  const vanX = Math.max(14, p0.x - 122)
  return `
  <svg class="mapa" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
       preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="#f3f7ee"/>
    ${manzanas.join('')}
    ${calles}
    ${lago}
    ${arboles}
    <path d="${camino}" fill="none" stroke="rgba(10,42,94,0.18)" stroke-width="6" stroke-linecap="round"/>
    <path d="${camino}" fill="none" stroke="${AZUL}" stroke-width="3.2" stroke-dasharray="10 9" stroke-linecap="round"/>
    <g>
      <rect x="${p0.x - 56}" y="${p0.y + 14}" width="48" height="21" rx="4" fill="${ORO}"/>
      <text x="${p0.x - 32}" y="${p0.y + 28.5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" font-family="Helvetica, Arial, sans-serif">INICIO</text>
      <line x1="${p0.x - 56}" y1="${p0.y + 14}" x2="${p0.x - 56}" y2="${p0.y + 44}" stroke="#9a7c22" stroke-width="2.5"/>
    </g>
    <g transform="translate(${vanX}, ${p0.y + 14})">
      <ellipse cx="28" cy="29" rx="28" ry="4" fill="rgba(10,42,94,0.16)"/>
      <rect x="0" y="0" width="56" height="24" rx="6" fill="${AZUL}"/>
      <rect x="39" y="4" width="13" height="10" rx="2" fill="#9fb6c9"/>
      <circle cx="14" cy="25" r="5.5" fill="#2d3748"/><circle cx="14" cy="25" r="2" fill="#718096"/>
      <circle cx="44" cy="25" r="5.5" fill="#2d3748"/><circle cx="44" cy="25" r="2" fill="#718096"/>
      <text x="6" y="16" font-size="7.5" font-weight="700" fill="${ORO_VIVO}" font-family="Helvetica, Arial, sans-serif">VALERA</text>
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
    <div class="barra">${hay(p.hora) ? 'CITA — ' + esc(p.hora) : 'PROPIEDAD ' + (i + 1)}</div>

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
      ${hay(p.asesorTel) ? `<div class="as-tel">${esc(p.asesorTel)}</div>` : ''}
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
  .sello { font-size: 10.5px; letter-spacing: 2.4px; font-weight: 700; color: rgba(255,255,255,0.72); margin-bottom: 14px; }
  .portada h1 { font-size: 30px; line-height: 1.24; color: #fff; margin: 0 0 16px; font-weight: 800; }
  .raya { width: 120px; height: 4px; margin: 0 auto;
          background: linear-gradient(to right, ${ORO_VIVO} 0, ${ORO_VIVO} 60px, rgba(255,255,255,0.45) 60px); border-radius: 2px; }
  .intro { font-size: 12.5px; line-height: 1.7; color: ${GRIS}; max-width: 540px; margin: 22px auto 18px; }
  /* El ancho lo pone el contenedor con su padding: el SVG suelto con
     width fijo se descuadraba al renderizarlo y se salia por la derecha. */
  .mapa-wrap { padding: 0 52px; margin-bottom: 20px; }
  .mapa { width: 100%; height: auto; display: block; }
  .portada-datos { border: 2px solid ${AZUL}; border-radius: 12px; padding: 20px 28px; max-width: 460px; margin: 0 auto; background: #fff; }
  .pd-cliente { font-size: 23px; font-weight: 800; color: ${AZUL}; }
  .pd-fecha { font-size: 14px; color: ${AZUL_CLARO}; margin-top: 5px; font-weight: 700; }
  .pd-n { font-size: 12.5px; color: ${GRIS_SUAVE}; margin-top: 8px; }
  .uso { position: absolute; left: 0; right: 0; bottom: 88px; font-size: 11.5px; letter-spacing: 2.4px; font-weight: 700; color: ${AZUL_CLARO}; }
  .uso-sub { position: absolute; left: 0; right: 0; bottom: 62px; font-size: 11.5px; color: ${GRIS_SUAVE}; }

  /* ── Cabecera de las hojas interiores ────────────────────────────── */
  .cab { background: ${AZUL}; padding: 26px 46px 22px; display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; }
  .sello2 { font-size: 9.5px; letter-spacing: 1.6px; font-weight: 700; color: rgba(255,255,255,0.65); margin-bottom: 6px; }
  .cab h2 { font-size: 25px; color: #fff; margin: 0; font-weight: 800; line-height: 1.2; }
  .sub { font-size: 12px; color: rgba(255,255,255,0.72); font-style: italic; margin-top: 6px; }
  .cab-der { text-align: right; flex-shrink: 0; padding-top: 2px; }
  .cab-lbl { font-size: 10px; letter-spacing: 1.4px; color: rgba(255,255,255,0.6); font-weight: 700; }
  .cab-val { font-size: 14px; font-weight: 800; color: ${ORO_VIVO}; margin-top: 4px; }

  .barra { background: ${AZUL_MED}; color: #fff; font-size: 12.5px; font-weight: 800; letter-spacing: 1.5px;
           padding: 11px 46px; border-left: 6px solid ${ORO}; }

  .caja { background: #fff; border-radius: 12px; margin: 20px 46px 0; padding: 6px 20px;
          box-shadow: 0 1px 3px rgba(10,42,94,0.08); }

  /* ── Tabla del perfil ────────────────────────────────────────────── */
  table.perfil { width: 100%; border-collapse: collapse; }
  table.perfil th, table.perfil td { text-align: left; padding: 13px 10px; border-bottom: 1px solid #eaf0f6; font-size: 13.5px; vertical-align: top; }
  table.perfil tr:last-child th, table.perfil tr:last-child td { border-bottom: none; }
  table.perfil th { width: 172px; font-weight: 700; color: ${GRIS_SUAVE}; font-size: 11.5px; letter-spacing: 0.4px; text-transform: uppercase; }
  table.perfil td { color: #243b53; }
  table.perfil td.fuerte { font-weight: 800; color: ${AZUL}; font-size: 15px; }

  /* ── Resumen del recorrido en la hoja de perfil ──────────────────── */
  .resumen { margin: 22px 46px 0; }
  .resumen-tit { font-size: 11.5px; font-weight: 800; letter-spacing: 1.5px; color: ${AZUL}; margin-bottom: 10px; }
  .resumen-lista { list-style: none; margin: 0; padding: 0; }
  .resumen-lista li { display: flex; align-items: center; gap: 12px; background: #fff; border-left: 4px solid ${ORO};
                      border-radius: 9px; padding: 11px 14px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(10,42,94,0.06); }
  .rl-n { width: 22px; height: 22px; border-radius: 11px; background: ${AZUL}; color: #fff; font-size: 11.5px;
          font-weight: 800; text-align: center; line-height: 22px; flex-shrink: 0; }
  .rl-hora { font-size: 12.5px; font-weight: 800; color: ${AZUL_CLARO}; width: 76px; flex-shrink: 0; }
  .rl-tit { font-size: 12.5px; color: #243b53; overflow: hidden; }

  /* ── Hoja de propiedad ───────────────────────────────────────────── */
  .hero { position: relative; margin: 0; }
  .hero-foto { width: 100%; height: 318px; background-size: cover; background-position: center; background-repeat: no-repeat; background-color: #dde6ef; }
  .hero-foto.sin { display: flex; align-items: center; justify-content: center; color: ${GRIS_SUAVE}; font-size: 13px; }
  .hero-pie { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px 46px 16px;
              background-image: linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0) 100%); }
  .hero-precio { font-size: 30px; font-weight: 800; color: ${ORO_VIVO}; letter-spacing: 0.4px; }

  .cars { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 46px 0; }
  .car { background: #fff; border-radius: 10px; border-left: 4px solid ${AZUL}; padding: 11px 14px;
         font-size: 12.5px; font-weight: 700; color: ${AZUL}; box-shadow: 0 1px 3px rgba(10,42,94,0.08); }

  .datos { padding: 16px 20px; }
  .dato { margin-bottom: 14px; }
  .dato:last-child { margin-bottom: 0; }
  .dl { font-size: 10.5px; color: ${GRIS_SUAVE}; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
  .dv { font-size: 14px; color: #243b53; line-height: 1.5; }
  .dv.fuerte { font-weight: 800; color: ${AZUL}; font-size: 15.5px; }
  .dv.gris { color: ${GRIS}; font-size: 13px; }
  .dv a { color: #2563eb; text-decoration: none; }

  .asesor { margin: 18px 46px 0; background: ${AZUL}; border-radius: 12px; padding: 16px 20px; }
  .as-lbl { font-size: 10px; letter-spacing: 1.5px; font-weight: 700; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
  .as-nom { font-size: 15px; font-weight: 800; color: #fff; }
  .as-tel { font-size: 13.5px; color: ${ORO_VIVO}; margin-top: 3px; font-weight: 700; }

  .pie { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; font-size: 10.5px; color: ${GRIS_SUAVE}; }
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
          doc.link((r.left - caja.left) * kx, (r.top - caja.top) * ky, r.width * kx, r.height * ky, { url: a.href })
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
