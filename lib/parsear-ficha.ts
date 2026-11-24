// Lee una ficha pegada (el texto del anuncio) y saca los campos.
//
// Vive aqui y no dentro de cada pantalla porque estaba DUPLICADO en
// nueva-propiedad y editar-propiedad, palabra por palabra. Al arreglar los
// topes de recamaras (24/nov/2026) el parche entro en una copia y no en la
// otra: editar seguia recortando a 5. Una sola copia para que no vuelva a
// pasar.
import { TOPE, conteo } from './conteos'

export type FichaParseada = ReturnType<typeof parsearFicha>

export function parsearFicha(texto: string) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Título: primera línea completa (sin emojis/símbolos al inicio)
  // Dirección: si hay "|" se toma lo que está después; si no, se extrae "en <Lugar>" del título
  let titulo = ''
  let direccion = ''
  if (lineas.length > 0) {
    const primera = lineas[0].replace(/^[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9$]+/, '').trim()
    if (primera.includes('|')) {
      const partes = primera.split('|')
      titulo = partes[0].trim()
      direccion = partes[1].trim()
    } else {
      titulo = primera
      // Extrae la ubicación tomando todo lo que sigue al último " en ",
      // ignorando si el resultado es solo "Venta" o "Renta"
      const enIdx = primera.toLowerCase().lastIndexOf(' en ')
      if (enIdx !== -1) {
        const candidato = primera.slice(enIdx + 4).trim()
        if (!/^(venta|renta)$/i.test(candidato)) direccion = candidato
      }
    }
  }

  // Precio: $X,XXX,XXX MXN
  let precio = ''
  const mPrecio = texto.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:MXN)?/i)
  if (mPrecio) precio = mPrecio[1].replace(/,/g, '')

  // M2 construcción y terreno — acepta AMBOS órdenes:
  //   "construcción: 295 m²"  y  "295 m² de construcción"
  let m2 = ''
  let m2Terreno = ''
  const mConst = texto.match(/construcci[oó]n\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
    ?? texto.match(/([\d,.]+)\s*m[²2]\s*(?:de\s+)?(?:construcci[oó]n|const\.?)/i)
  const mTerr = texto.match(/terreno\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
    ?? texto.match(/([\d,.]+)\s*m[²2]\s*(?:de\s+)?terreno/i)
  if (mConst) m2 = mConst[1].replace(/,/g, '')
  if (mTerr) m2Terreno = mTerr[1].replace(/,/g, '')

  // Recámaras. Los portales las nombran de cuatro maneras distintas y antes
  // sólo se leía "recámaras": una ficha que dijera "4 habitaciones" entraba
  // sin recámaras.
  let recamaras: number | null = null
  const mRec = texto.match(/(\d+)\s*(?:rec[aá]maras?|rec\.?|habitaciones?|dormitorios?)/i)
  if (mRec) recamaras = conteo(parseInt(mRec[1]), TOPE.recamaras)

  let banos: number | null = null
  let mediosBanos: number | null = null

  // Baños con el medio en una sola cifra: "2½ baños", "2 1/2 baños", "2.5
  // baños" → 2 completos + 1 medio. Va PRIMERO a propósito: el patrón de
  // abajo leía el "5" de "2.5 baños" y guardaba 5 baños completos.
  const mBanoMedio = texto.match(/(\d+)\s*(?:½|1\s*\/\s*2|[.,]5)\s*ba[ñn]os?/i)
  if (mBanoMedio) {
    banos = conteo(parseInt(mBanoMedio[1]), TOPE.banos)
    mediosBanos = 1
  } else {
    const mBanos = texto.match(/(\d+)\s*ba[ñn]os?\s*(?:completos?)?/i)
    if (mBanos) banos = conteo(parseInt(mBanos[1]), TOPE.banos)
  }

  // Medios baños. Acepta el plural: "2 medios baños" no se detectaba porque
  // el patrón pedía "medio baño" en singular.
  const mMedios = texto.match(/(\d+)\s*medios?\s*ba[ñn]os?/i)
  if (mMedios) mediosBanos = conteo(parseInt(mMedios[1]), TOPE.mediosBanos)

  // Estacionamientos. "cajones" y "cocheras" son los términos más usados en
  // Querétaro y tampoco se leían.
  let estacionamientos: number | null = null
  const mCochera = texto.match(/cochera\s+para\s+(\d+)/i)
  if (mCochera) {
    estacionamientos = conteo(parseInt(mCochera[1]), TOPE.estacionamientos)
  } else {
    const mEst = texto.match(/(\d+)\s*(?:autos?|estacionamientos?|lugares?|caj[oó]n(?:es)?|cocheras?)/i)
    if (mEst) estacionamientos = conteo(parseInt(mEst[1]), TOPE.estacionamientos)
  }

  // Tipo
  let tipo: 'casa' | 'departamento' | 'local' | 'terreno' | null = null
  if (/departamento/i.test(titulo)) tipo = 'departamento'
  else if (/\bcasa\b/i.test(titulo)) tipo = 'casa'
  else if (/local/i.test(titulo)) tipo = 'local'
  else if (/terreno/i.test(titulo)) tipo = 'terreno'

  // Operación
  let operacion: 'venta' | 'renta' | null = null
  const inicio = texto.slice(0, 120)
  if (/\brenta\b/i.test(inicio)) operacion = 'renta'
  else if (/\bventa\b/i.test(inicio)) operacion = 'venta'

  return { titulo, direccion, precio, m2, m2Terreno, recamaras, banos, mediosBanos, estacionamientos, tipo, operacion }
}
