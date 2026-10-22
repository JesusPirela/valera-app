// La hoja de ruta de un recorrido: el PDF que el asesor lleva el día de las
// citas, con el perfil del cliente y las paradas en orden.
//
// Por qué un generador propio y no el de la ficha de propiedad: aquel tiene que
// adivinar dónde cortar las páginas (busca renglones en blanco en el canvas,
// esquiva fotos partidas a la mitad). Aquí no hace falta — este documento ya
// viene en páginas: portada, perfil, y una por parada. Cada <section class="hoja">
// es exactamente una hoja A4, así que el corte es dato, no heurística. Por eso
// no se tocó el otro: es el PDF que más se usa en la app y ya ha costado caro.

import { Platform } from 'react-native'
import { thumb } from './img'

/** A4 a 96 dpi, que es la rejilla en la que miden los navegadores. */
const ANCHO_PX = 794
const ALTO_PX = 1123

const AZUL = '#1e3a5f'
const AZUL_CLARO = '#2c5282'
const ORO = '#c9a84c'
const GRIS = '#6b7280'

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
function fila(etiqueta: string, valor: string): string {
  if (!hay(valor)) return ''
  return `<tr><th>${esc(etiqueta)}</th><td>${esc(valor).replace(/\n/g, '<br>')}</td></tr>`
}

function dato(etiqueta: string, valor: string, fuerte = false): string {
  if (!hay(valor)) return ''
  return `<div class="dato"><div class="dl">${esc(etiqueta)}</div>` +
    `<div class="dv${fuerte ? ' fuerte' : ''}">${esc(valor).replace(/\n/g, '<br>')}</div></div>`
}

/**
 * El mapa del recorrido de la portada, dibujado a partir de las paradas.
 *
 * El documento original llevaba una ilustración fija de tres casas con horas
 * inventadas. Esto la sustituye por un plano que se arma solo: tantas paradas
 * como tenga el recorrido, en su orden, cada una con la hora que se le puso.
 * Si el recorrido tiene una casa o doce, el plano se acomoda.
 *
 * Va en SVG y no como imagen para que no dependa de ningún archivo ni de
 * internet: se dibuja dentro del PDF.
 */
function mapaDelRecorrido(paradas: ParadaHoja[]): string {
  const n = paradas.length
  if (n === 0) return ''

  const W = 700, H = 400
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4
  const filas = Math.ceil(n / cols)
  const anchoCelda = (W - 90) / cols
  const altoCelda = (H - 110) / filas
  const esc = filas >= 3 || cols >= 4 ? 0.82 : 1

  // Serpentina: la primera fila de izquierda a derecha, la siguiente de vuelta.
  // Así la línea punteada se lee como un recorrido y no como un zigzag suelto.
  // Las filas se centran en el alto del plano: con una sola parada el dibujo
  // quedaba pegado arriba y con medio plano vacío debajo.
  const margenY = (H - filas * altoCelda) / 2
  const puntos = paradas.map((_, i) => {
    const fila = Math.floor(i / cols)
    let col = i % cols
    if (fila % 2 === 1) col = cols - 1 - col
    return { x: 66 + col * anchoCelda + anchoCelda * 0.18, y: margenY + fila * altoCelda + altoCelda * 0.6 }
  })

  /** Una casita sobre la parada, para que el plano se lea de un vistazo. */
  const casa = (x: number, y: number) => {
    const a = 30 * esc           // media anchura
    const b = 26 * esc           // alto del cuerpo
    const t = 17 * esc           // alto del techo
    return `
      <g transform="translate(${x}, ${y - 86 * esc})">
        <rect x="${-a}" y="0" width="${a * 2}" height="${b}" rx="2" fill="#ffffff" stroke="#d9d4c3"/>
        <path d="M ${-a - 4} 0 L 0 ${-t} L ${a + 4} 0 z" fill="${AZUL}"/>
        <rect x="${-6 * esc}" y="${b - 13 * esc}" width="${12 * esc}" height="${13 * esc}" fill="${ORO}"/>
        <rect x="${-a + 6 * esc}" y="${7 * esc}" width="${9 * esc}" height="${8 * esc}" fill="#dfe7ee"/>
        <rect x="${a - 15 * esc}" y="${7 * esc}" width="${9 * esc}" height="${8 * esc}" fill="#dfe7ee"/>
      </g>`
  }

  const camino = puntos.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')

  const calles = Array.from({ length: 5 }, (_, i) =>
    `<line x1="20" y1="${50 + i * 72}" x2="${W - 20}" y2="${50 + i * 72}" stroke="#e4e0d2" stroke-width="7" stroke-linecap="round"/>`
  ).join('') + Array.from({ length: 6 }, (_, i) =>
    `<line x1="${50 + i * 110}" y1="20" x2="${50 + i * 110}" y2="${H - 20}" stroke="#e4e0d2" stroke-width="7" stroke-linecap="round"/>`
  ).join('')

  const marcas = puntos.map((p, i) => {
    const hora = (paradas[i].hora ?? '').trim()
    const anchoEtq = (hora ? 104 : 86) * esc
    const altoEtq = (hora ? 40 : 26) * esc
    // La etiqueta salta al otro lado si no cabe por la derecha.
    const dx = p.x + 20 * esc + anchoEtq > W - 14 ? -(anchoEtq + 18 * esc) : 20 * esc
    const ex = p.x + dx
    const ey = p.y - altoEtq / 2 - 8 * esc
    return `
      <g>
        ${casa(p.x, p.y)}
        <path d="M ${p.x} ${p.y} c -13 -9 -19 -18 -19 -27 a 19 19 0 1 1 38 0 c 0 9 -6 18 -19 27 z"
              fill="${AZUL}" transform="translate(0,2)"/>
        <circle cx="${p.x}" cy="${p.y - 27}" r="11.5" fill="#fff"/>
        <text x="${p.x}" y="${p.y - 22.5}" text-anchor="middle" font-size="14" font-weight="700" fill="${AZUL}"
              font-family="Helvetica, Arial, sans-serif">${i + 1}</text>
        <rect x="${ex}" y="${ey}" width="${anchoEtq}" height="${altoEtq}" rx="7" fill="#fff" stroke="#dfdbcc"/>
        ${hora ? `
          <circle cx="${ex + 14 * esc}" cy="${ey + 14 * esc}" r="${6.5 * esc}" fill="none" stroke="${AZUL_CLARO}" stroke-width="1.6"/>
          <line x1="${ex + 14 * esc}" y1="${ey + 14 * esc}" x2="${ex + 14 * esc}" y2="${ey + 10 * esc}" stroke="${AZUL_CLARO}" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="${ex + 14 * esc}" y1="${ey + 14 * esc}" x2="${ex + 17.5 * esc}" y2="${ey + 15.5 * esc}" stroke="${AZUL_CLARO}" stroke-width="1.6" stroke-linecap="round"/>
          <text x="${ex + 26 * esc}" y="${ey + 18 * esc}" font-size="${13 * esc}" font-weight="700" fill="${AZUL_CLARO}"
                font-family="Helvetica, Arial, sans-serif">${esc2(hora)}</text>
          <text x="${ex + 10 * esc}" y="${ey + 33 * esc}" font-size="${10.5 * esc}" font-weight="700" fill="${AZUL}"
                font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>
        ` : `
          <text x="${ex + 10 * esc}" y="${ey + 17 * esc}" font-size="${11 * esc}" font-weight="700" fill="${AZUL}"
                font-family="Helvetica, Arial, sans-serif">Propiedad ${i + 1}</text>
        `}
      </g>`
  }).join('')

  const p0 = puntos[0]
  return `
  <svg class="mapa" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="#f8f6ef"/>
    ${calles}
    <path d="${camino}" fill="none" stroke="${AZUL}" stroke-width="3" stroke-dasharray="9 8" stroke-linecap="round"/>
    <g>
      <rect x="${p0.x - 54}" y="${p0.y + 12}" width="46" height="20" rx="4" fill="${ORO}"/>
      <text x="${p0.x - 31}" y="${p0.y + 26}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff"
            font-family="Helvetica, Arial, sans-serif">INICIO</text>
      <line x1="${p0.x - 54}" y1="${p0.y + 12}" x2="${p0.x - 54}" y2="${p0.y + 42}" stroke="#9a7c22" stroke-width="2.5"/>
      <g transform="translate(${Math.max(16, p0.x - 118)}, ${p0.y + 14})">
        <rect x="0" y="0" width="54" height="23" rx="5" fill="${AZUL}"/>
        <rect x="38" y="4" width="12" height="9" rx="2" fill="#9fb6c9"/>
        <circle cx="13" cy="24" r="5" fill="#2d3748"/>
        <circle cx="42" cy="24" r="5" fill="#2d3748"/>
        <text x="5" y="15" font-size="7.5" font-weight="700" fill="${ORO}" font-family="Helvetica, Arial, sans-serif">VALERA</text>
      </g>
    </g>
    ${marcas}
  </svg>`
}

/** Escapa texto dentro de un <text> de SVG. */
const esc2 = (s: string) => esc(s)

export function construirHtmlHoja(d: DatosHoja): string {
  const { perfil, paradas } = d
  const total = paradas.length

  const portada = `
  <section class="hoja portada">
    ${d.logoBase64 ? `<img class="logo" src="${d.logoBase64}">` : ''}
    <div class="sello">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
    <h1>Recorrido de propiedades<br>Hoja de ruta</h1>
    <div class="raya"></div>
    <p class="intro">
      Documento oficial de recorrido interno del asesor. Concentra el perfil del
      cliente y el orden exacto de las citas del día: en qué secuencia se visitan,
      a qué hora, cuál es cada propiedad y quién la atiende.
    </p>
    ${mapaDelRecorrido(paradas)}
    <div class="portada-datos">
      <div class="pd-cliente">${esc(perfil.nombre)}</div>
      <div class="pd-fecha">${esc(d.fecha)}</div>
      <div class="pd-n">${total} ${total === 1 ? 'propiedad' : 'propiedades'} por visitar</div>
    </div>
    <div class="uso">USO INTERNO DEL EQUIPO</div>
    <div class="uso-sub">No se comparte con el cliente ni con asesores externos</div>
  </section>`

  const hojaPerfil = `
  <section class="hoja">
    <div class="cab">
      <div>
        <div class="sello2">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
        <h2>Recorrido de propiedades — Hoja de ruta</h2>
        <div class="sub">Intereses del cliente y propiedades a visitar en el recorrido de hoy.</div>
      </div>
      <div class="cab-der">
        <div class="cab-lbl">INFORMACIÓN DE CITA</div>
        <div class="cab-val">${esc(d.fecha)}</div>
      </div>
    </div>
    <div class="barra">PERFIL DEL CLIENTE</div>
    <table class="perfil">
      ${fila('Nombre', perfil.nombre)}
      ${fila('Teléfono', perfil.telefono)}
      ${fila('Correo', perfil.correo)}
      ${fila('Origen', perfil.origen)}
      ${fila('Forma de pago', perfil.formaPago)}
      ${fila('Presupuesto máximo', perfil.presupuesto)}
      ${fila('Busca', perfil.busca)}
    </table>
    <div class="pie">Valera Real Estate · Documento interno de uso exclusivo del equipo</div>
  </section>`

  const hojasParadas = paradas.map((p, i) => `
  <section class="hoja">
    <div class="cab">
      <div>
        <div class="sello2">VALERA REAL ESTATE · DOCUMENTO INTERNO</div>
        <h2>Propiedad ${i + 1}</h2>
        <div class="sub">${esc(perfil.nombre)}${hay(d.fecha) ? ' · ' + esc(d.fecha) : ''}</div>
      </div>
      <div class="cab-der"><div class="cab-lbl">${i + 1} DE ${total}</div></div>
    </div>
    <div class="barra">${hay(p.hora) ? 'CITA — ' + esc(p.hora) : 'PROPIEDAD ' + (i + 1)}</div>
    ${p.fotoBase64 ? `<img class="foto" src="${p.fotoBase64}">` : '<div class="sin-foto">Sin foto</div>'}
    <div class="datos">
      ${hay(p.titulo) || hay(p.ubicacion) ? `<div class="dato">
        <div class="dl">Propiedad</div>
        ${hay(p.titulo) ? `<div class="dv fuerte">${esc(p.titulo)}</div>` : ''}
        ${hay(p.ubicacion) ? `<div class="dv">${esc(p.ubicacion).replace(/\n/g, '<br>')}</div>` : ''}
      </div>` : ''}
      ${dato('Precio', p.precio)}
      ${dato('Características', p.caracteristicas)}
      ${hay(p.mapaUrl) ? `<div class="dato"><div class="dl">Ubicación</div><div class="dv"><a href="${esc(p.mapaUrl)}">Ver en Google Maps</a></div></div>` : ''}
      ${hay(p.linkPropiedad) ? `<div class="dato"><div class="dl">Link de la propiedad</div>` +
        `<div class="dv"><a href="${esc(p.linkPropiedad)}">${esc(p.linkPropiedad.replace(/^https?:\/\//i, ''))}</a></div></div>` : ''}
      ${hay(p.asesorNombre) || hay(p.asesorTel) ? `<div class="dato">
        <div class="dl">Asesor a cargo</div>
        ${hay(p.asesorNombre) ? `<div class="dv fuerte">${esc(p.asesorNombre)}</div>` : ''}
        ${hay(p.asesorTel) ? `<div class="dv enlace">${esc(p.asesorTel)}</div>` : ''}
      </div>` : ''}
    </div>
    <div class="pie">Valera Real Estate · Documento interno de uso exclusivo del equipo</div>
  </section>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Hoja de ruta · ${esc(perfil.nombre)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; font-family: Helvetica, Arial, sans-serif; color: #1f2937; }
  .hoja {
    width: ${ANCHO_PX}px; height: ${ALTO_PX}px; padding: 48px 52px;
    background: #fff; position: relative; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .hoja:last-child { page-break-after: auto; break-after: auto; }

  /* ── Portada ─────────────────────────────────────────────────────── */
  .portada { text-align: center; padding-top: 52px; }
  .portada .logo { width: 150px; margin: 0 auto 22px; display: block; }
  .sello { font-size: 11px; letter-spacing: 2px; font-weight: 700; color: ${AZUL_CLARO}; margin-bottom: 20px; }
  .portada h1 { font-size: 31px; line-height: 1.22; color: ${AZUL}; margin: 0 0 22px; font-weight: 800; }
  .raya { width: 110px; height: 4px; background: ${ORO}; margin: 0 auto 26px; border-radius: 2px; }
  .intro { font-size: 12.5px; line-height: 1.7; color: ${GRIS}; max-width: 540px; margin: 0 auto 22px; }
  .mapa { width: 100%; height: auto; display: block; margin: 0 auto 22px; }
  .portada-datos { border: 2px solid ${AZUL}; border-radius: 12px; padding: 22px 28px; max-width: 460px; margin: 0 auto; }
  .pd-cliente { font-size: 23px; font-weight: 800; color: ${AZUL}; }
  .pd-fecha { font-size: 14px; color: ${AZUL_CLARO}; margin-top: 6px; font-weight: 600; }
  .pd-n { font-size: 12.5px; color: ${GRIS}; margin-top: 10px; }
  .uso { position: absolute; left: 0; right: 0; bottom: 92px; font-size: 11.5px; letter-spacing: 2.4px; font-weight: 700; color: ${AZUL_CLARO}; }
  .uso-sub { position: absolute; left: 0; right: 0; bottom: 64px; font-size: 11.5px; color: #9ca3af; }

  /* ── Cabecera de las hojas interiores ────────────────────────────── */
  .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 22px; margin-bottom: 26px; }
  .sello2 { font-size: 10px; letter-spacing: 1.5px; font-weight: 700; color: ${AZUL_CLARO}; margin-bottom: 7px; }
  .cab h2 { font-size: 25px; color: ${AZUL}; margin: 0; font-weight: 800; line-height: 1.22; }
  .sub { font-size: 12.5px; color: ${GRIS}; font-style: italic; margin-top: 7px; }
  .cab-der { text-align: right; flex-shrink: 0; padding-top: 2px; }
  .cab-lbl { font-size: 10.5px; letter-spacing: 1.4px; color: #9ca3af; font-weight: 700; }
  .cab-val { font-size: 14px; font-weight: 800; color: ${AZUL}; margin-top: 4px; }

  .barra { background: ${AZUL}; color: #fff; font-size: 12.5px; font-weight: 800; letter-spacing: 1.4px; padding: 11px 18px; border-radius: 4px; }

  /* ── Tabla del perfil ────────────────────────────────────────────── */
  table.perfil { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.perfil th, table.perfil td { text-align: left; padding: 13px 18px; border-bottom: 1px solid #e5e7eb; font-size: 13.5px; vertical-align: top; }
  table.perfil th { width: 170px; font-weight: 700; color: #374151; }
  table.perfil td { color: #1f2937; }

  /* ── Hoja de propiedad ───────────────────────────────────────────── */
  .foto { width: 100%; height: 300px; object-fit: cover; display: block; margin-top: 14px; border-radius: 3px; }
  .sin-foto { width: 100%; height: 300px; margin-top: 14px; background: #f3f4f6; border-radius: 3px;
              display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
  .datos { margin-top: 20px; }
  .dato { margin-bottom: 15px; }
  .dl { font-size: 11.5px; color: #9ca3af; margin-bottom: 3px; }
  .dv { font-size: 14px; color: #1f2937; line-height: 1.5; }
  .dv.fuerte { font-weight: 800; }
  .dv.enlace, .dv a { color: #2563eb; text-decoration: none; }

  .pie { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font-size: 10.5px; color: #9ca3af; }
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

async function bajarComoBase64(url: string): Promise<string> {
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
  const destino = FileSystem.cacheDirectory + 'hr_' + Math.random().toString(36).slice(2) + '.jpg'
  const { uri } = await FileSystem.downloadAsync(url, destino)
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return 'data:image/jpeg;base64,' + b64
}

/**
 * Convierte una imagen a data: para que se vea dentro del PDF. Una URL suelta
 * no se renderiza en el PDF nativo, y en web la bloquea el CORS.
 *
 * Va por el proxy de thumb() y NO por la URL original. Las fotos de las
 * propiedades importadas viven en CDNs ajenos (EasyBroker, CloudFront) que no
 * permiten leerlas desde el navegador: la descarga fallaba y la hoja salía con
 * "Sin foto" aunque la propiedad tuviera sus fotos. De paso baja una imagen de
 * 1000 px en vez de la original de varios MB.
 *
 * Si el proxy falla se intenta la original, y si tampoco, se devuelve '': la
 * hoja sale sin foto, nunca rota.
 */
export async function imagenABase64(url: string | null | undefined): Promise<string> {
  if (!url) return ''
  const porProxy = thumb(url, { width: 1000, quality: 80 })
  for (const intento of [porProxy, url].filter(Boolean) as string[]) {
    try {
      const b64 = await bajarComoBase64(intento)
      if (b64) return b64
    } catch { /* se prueba el siguiente */ }
  }
  return ''
}
