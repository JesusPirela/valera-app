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
  idEb: string
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
      ${dato('ID EasyBroker', p.idEb)}
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
  .portada { text-align: center; padding-top: 88px; }
  .portada .logo { width: 190px; margin: 0 auto 34px; display: block; }
  .sello { font-size: 11px; letter-spacing: 2px; font-weight: 700; color: ${AZUL_CLARO}; margin-bottom: 20px; }
  .portada h1 { font-size: 36px; line-height: 1.22; color: ${AZUL}; margin: 0 0 22px; font-weight: 800; }
  .raya { width: 110px; height: 4px; background: ${ORO}; margin: 0 auto 26px; border-radius: 2px; }
  .intro { font-size: 13.5px; line-height: 1.75; color: ${GRIS}; max-width: 540px; margin: 0 auto 44px; }
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
        const canvas = await html2canvas(hojas[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
        if (i > 0) doc.addPage()
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, ancho, alto)
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

/**
 * Convierte una imagen a data: para que se vea dentro del PDF. Una URL suelta
 * no se renderiza en el PDF nativo, y en web la mancha el CORS.
 * Devuelve '' si no se pudo: la hoja sale sin foto, nunca rota.
 */
export async function imagenABase64(url: string | null | undefined): Promise<string> {
  if (!url) return ''
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(url, { mode: 'cors' })
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
  } catch {
    return ''
  }
}
