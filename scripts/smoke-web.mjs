// Prueba de humo: ¿la app ARRANCA?
//
// El deploy ya construye la web, así que un import roto o un error de sintaxis
// no llegan a producción. Lo que sí llega es un crash de RENDER: el bundle se
// construye perfecto y la pantalla revienta al montarse. Eso fue exactamente lo
// que pasó con "Cannot read properties of null (reading 'tipo_operacion')", que
// dejaba a la gente sin CRM.
//
// Esto sirve el dist/ ya construido, lo abre en un navegador de verdad y
// comprueba que la app monta y pinta algo. No hace falta iniciar sesión: con
// que llegue a la pantalla de login ya se ha ejercitado el bundle entero, el
// arranque de React, el router y la creación del cliente de Supabase.
//
// Uso:  node scripts/smoke-web.mjs        (requiere dist/ y playwright)

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { chromium } from 'playwright'

const DIST = process.env.SMOKE_DIST ?? 'dist'
const PUERTO = 8099
const ESPERA_MS = 25000

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
}

// Servidor estático con vuelta a index.html, como hace el .htaccess en producción.
const servidor = createServer(async (req, res) => {
  const limpia = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  for (const candidata of [join(DIST, limpia), join(DIST, limpia, 'index.html'), join(DIST, 'index.html')]) {
    try {
      const cuerpo = await readFile(candidata)
      res.writeHead(200, { 'Content-Type': TIPOS[extname(candidata)] ?? 'application/octet-stream' })
      res.end(cuerpo)
      return
    } catch { /* siguiente candidata */ }
  }
  res.writeHead(404); res.end('no encontrado')
})

function fallar(motivo, detalle) {
  console.error(`\n❌ HUMO: ${motivo}`)
  if (detalle) console.error(detalle)
  process.exitCode = 1
}

const erroresJs = []
const erroresReact = []
let navegador = null

try {
  await new Promise((ok, err) => servidor.listen(PUERTO, ok).on('error', err))
  console.log(`Sirviendo ${DIST}/ en http://localhost:${PUERTO}`)

  navegador = await chromium.launch()
  const pagina = await navegador.newPage()

  // Las excepciones de JS sin capturar SÍ son un fallo: es justo lo que rompe
  // una pantalla en producción.
  pagina.on('pageerror', (e) => erroresJs.push(e.message))
  // Los errores de consola se muestran pero no tumban la prueba: en CI no hay
  // Supabase de verdad, así que los fallos de red son de esperar. Los de React
  // (que delatan un crash de render) sí cuentan.
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return
    const txt = m.text()
    console.log(`   consola: ${txt.slice(0, 160)}`)
    if (/Minified React error|Rendered more hooks|Cannot read propert|is not a function|undefined is not an object/.test(txt)) {
      erroresReact.push(txt)
    }
  })

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'load', timeout: ESPERA_MS })
  // Esperar a que React monte de verdad: que el body tenga texto visible.
  await pagina.waitForFunction(() => (document.body.innerText ?? '').trim().length > 0, null, { timeout: ESPERA_MS })

  // Margen tras el montaje: los crashes no siempre saltan en el primer pintado.
  // Suelen aparecer un instante después, cuando llegan los datos y la pantalla
  // se vuelve a renderizar con ellos. Sin esta espera la prueba pasaba por
  // encima de ellos y daba verde a una app rota.
  await pagina.waitForTimeout(3000)

  const texto = (await pagina.innerText('body')).trim()
  console.log(`\nPantalla inicial (${texto.length} caracteres):\n   ${texto.slice(0, 200).replace(/\n/g, ' | ')}`)

  if (texto.length < 10) fallar('la app cargó en blanco (React no pintó nada)')
  if (erroresJs.length)    fallar('errores de JavaScript sin capturar', erroresJs.join('\n'))
  if (erroresReact.length) fallar('errores de React al renderizar', erroresReact.join('\n'))

  if (!process.exitCode) console.log('\n✅ HUMO: la app arranca y pinta.')
} catch (e) {
  fallar('no se pudo completar la prueba', e?.message ?? String(e))
} finally {
  // Cerrar SIEMPRE, también al fallar: si no, el navegador queda vivo y sus
  // conexiones mantienen el servidor abierto, así que el proceso nunca termina
  // y en CI el job se queda colgado hasta agotar su tiempo.
  try { await navegador?.close() } catch { /* no-op */ }
  servidor.close()
  // El cierre del servidor no basta si queda algún socket suelto; salir con el
  // código que ya se haya fijado.
  process.exit(process.exitCode ?? 0)
}
