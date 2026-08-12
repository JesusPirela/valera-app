import AsyncStorage from '@react-native-async-storage/async-storage'

// Historial de búsquedas de propiedades (tipo EasyBroker): guarda la combinación
// de filtros que usó el asesor para que la retome con un clic. Es local por
// dispositivo/usuario (como el historial de un navegador).

const KEY = 'busq_historial_v1'
const MAX = 8

export type FiltrosPropiedad = {
  busqueda?: string
  operacion?: string | null
  tipo?: string | null
  recamaras?: number | null
  precioMin?: string
  precioMax?: string
  nueva?: boolean
  exclusiva?: boolean
  destacada?: boolean
}

export type BusquedaGuardada = FiltrosPropiedad & { id: string; ts: number }

// ¿Vale la pena guardar? Solo si hay al menos un filtro con contenido.
export function esBusquedaSignificativa(f: FiltrosPropiedad): boolean {
  return !!(
    (f.busqueda && f.busqueda.trim()) ||
    f.operacion || f.tipo || (f.recamaras != null) ||
    (f.precioMin && f.precioMin.trim()) || (f.precioMax && f.precioMax.trim()) ||
    f.nueva || f.exclusiva || f.destacada
  )
}

// Firma para deduplicar (misma combinación = misma búsqueda).
function firma(f: FiltrosPropiedad): string {
  return JSON.stringify({
    b: (f.busqueda ?? '').trim().toLowerCase(),
    o: f.operacion ?? '', t: f.tipo ?? '', r: f.recamaras ?? '',
    mn: (f.precioMin ?? '').trim(), mx: (f.precioMax ?? '').trim(),
    n: !!f.nueva, e: !!f.exclusiva, d: !!f.destacada,
  })
}

function fmtDinero(v?: string): string | null {
  if (!v || !v.trim()) return null
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return v.trim()
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

// Etiqueta legible: "Juriquilla · $2M–$3M · Venta · 3+ rec"
export function etiquetaBusqueda(f: FiltrosPropiedad): string {
  const partes: string[] = []
  if (f.busqueda && f.busqueda.trim()) partes.push(f.busqueda.trim())
  const mn = fmtDinero(f.precioMin), mx = fmtDinero(f.precioMax)
  if (mn && mx) partes.push(`${mn}–${mx}`)
  else if (mn) partes.push(`desde ${mn}`)
  else if (mx) partes.push(`hasta ${mx}`)
  if (f.operacion) partes.push(f.operacion === 'venta' ? 'Venta' : f.operacion === 'renta' ? 'Renta' : f.operacion)
  if (f.tipo) partes.push(String(f.tipo))
  if (f.recamaras != null) partes.push(`${f.recamaras}+ rec`)
  if (f.nueva) partes.push('Nuevas')
  if (f.exclusiva) partes.push('Exclusivas')
  if (f.destacada) partes.push('Destacadas')
  return partes.join(' · ') || 'Búsqueda'
}

export async function leerHistorial(): Promise<BusquedaGuardada[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export async function guardarBusqueda(f: FiltrosPropiedad): Promise<BusquedaGuardada[]> {
  if (!esBusquedaSignificativa(f)) return leerHistorial()
  const actual = await leerHistorial()
  const sig = firma(f)
  const sinDup = actual.filter(b => firma(b) !== sig)
  const nueva: BusquedaGuardada = {
    id: `${Date.now()}`, ts: Date.now(),
    busqueda: f.busqueda?.trim() || undefined,
    operacion: f.operacion ?? undefined, tipo: f.tipo ?? undefined,
    recamaras: f.recamaras ?? undefined,
    precioMin: f.precioMin?.trim() || undefined, precioMax: f.precioMax?.trim() || undefined,
    nueva: f.nueva || undefined, exclusiva: f.exclusiva || undefined, destacada: f.destacada || undefined,
  }
  const lista = [nueva, ...sinDup].slice(0, MAX)
  try { await AsyncStorage.setItem(KEY, JSON.stringify(lista)) } catch {}
  return lista
}

export async function borrarBusqueda(id: string): Promise<BusquedaGuardada[]> {
  const lista = (await leerHistorial()).filter(b => b.id !== id)
  try { await AsyncStorage.setItem(KEY, JSON.stringify(lista)) } catch {}
  return lista
}

export async function limpiarHistorial(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY) } catch {}
}
