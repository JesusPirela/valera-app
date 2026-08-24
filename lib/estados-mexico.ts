// Detecta el ESTADO de México a partir de un texto libre (dirección/título).
// Sirve para seccionar el catálogo "Nacional" de constructoras por estado sin
// depender solo del campo `zona` (que es a nivel ciudad y casi siempre Qro).

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}

// Estado canónico → variantes (nombre del estado y ciudades grandes que lo delatan).
const ESTADOS: [string, string[]][] = [
  ['Querétaro', ['queretaro', 'qro', 'el marques', 'corregidora', 'san juan del rio', 'tequisquiapan']],
  ['Nuevo León', ['nuevo leon', 'monterrey', 'san pedro garza', 'garcia n.l', 'apodaca', 'guadalupe n', 'santa catarina']],
  ['Jalisco', ['jalisco', 'guadalajara', 'zapopan', 'tlaquepaque', 'tonala', 'puerto vallarta']],
  ['Ciudad de México', ['ciudad de mexico', 'cdmx', 'distrito federal', ' df ', 'benito juarez, ciudad', 'miguel hidalgo, ciudad']],
  ['Estado de México', ['estado de mexico', 'edomex', 'toluca', 'naucalpan', 'tlalnepantla', 'ecatepec', 'metepec', 'huixquilucan']],
  ['Puebla', ['puebla', 'cholula', 'atlixco']],
  ['Guanajuato', ['guanajuato', 'leon, gto', 'leon gto', 'irapuato', 'celaya', 'salamanca gto', 'san miguel de allende']],
  ['Aguascalientes', ['aguascalientes']],
  ['Baja California Sur', ['baja california sur', 'los cabos', 'la paz, b', 'cabo san lucas', 'san jose del cabo']],
  ['Baja California', ['baja california', 'tijuana', 'mexicali', 'ensenada', 'rosarito']],
  ['Campeche', ['campeche']],
  ['Chiapas', ['chiapas', 'tuxtla', 'san cristobal de las casas']],
  ['Chihuahua', ['chihuahua', 'ciudad juarez', 'cd juarez']],
  ['Coahuila', ['coahuila', 'saltillo', 'torreon', 'monclova', 'piedras negras']],
  ['Colima', ['colima', 'manzanillo']],
  ['Durango', ['durango']],
  ['Guerrero', ['guerrero', 'acapulco', 'chilpancingo', 'zihuatanejo', 'ixtapa']],
  ['Hidalgo', ['hidalgo', 'pachuca', 'tulancingo', 'tizayuca']],
  ['Michoacán', ['michoacan', 'morelia', 'uruapan', 'zamora mich']],
  ['Morelos', ['morelos', 'cuernavaca', 'jiutepec', 'temixco']],
  ['Nayarit', ['nayarit', 'tepic', 'nuevo vallarta', 'bahia de banderas']],
  ['Oaxaca', ['oaxaca', 'huatulco', 'puerto escondido']],
  ['Quintana Roo', ['quintana roo', 'cancun', 'playa del carmen', 'tulum', 'cozumel', 'riviera maya']],
  ['San Luis Potosí', ['san luis potosi', 's.l.p', ' slp']],
  ['Sinaloa', ['sinaloa', 'culiacan', 'mazatlan', 'los mochis']],
  ['Sonora', ['sonora', 'hermosillo', 'ciudad obregon', 'nogales', 'san carlos son']],
  ['Tabasco', ['tabasco', 'villahermosa']],
  ['Tamaulipas', ['tamaulipas', 'tampico', 'reynosa', 'matamoros', 'nuevo laredo', 'ciudad victoria']],
  ['Tlaxcala', ['tlaxcala', 'apizaco']],
  ['Veracruz', ['veracruz', 'xalapa', 'jalapa', 'boca del rio', 'coatzacoalcos', 'cordoba, ver', 'orizaba']],
  ['Yucatán', ['yucatan', 'merida', 'progreso yuc']],
  ['Zacatecas', ['zacatecas', 'fresnillo']],
]

// Devuelve el estado detectado o null. Querétaro se prueba primero para que su
// inventario (la mayoría) no se confunda; el resto por coincidencia de variante.
export function detectarEstadoMexico(texto: string): string | null {
  const t = ' ' + norm(texto) + ' '
  for (const [estado, variantes] of ESTADOS) {
    for (const v of variantes) {
      if (t.includes(v)) return estado
    }
  }
  return null
}

export const ESTADO_PRINCIPAL = 'Querétaro'

export type InfoEstado = {
  estado: string | null   // estado resuelto (o null si no se pudo determinar)
  esQueretaro: boolean     // true si es del estado principal
  foraneo: boolean         // true si es de OTRO estado (dato conocido y ≠ Querétaro)
  desconocido: boolean     // true si no se pudo determinar (NO asumir Querétaro)
}

// Resuelve la ubicación de una propiedad SIN inventar: usa estado_mx si viene;
// si no, lo detecta de la dirección/título. Regla de oro: si no se sabe, queda
// "desconocido" y NUNCA se asume Querétaro (para no disfrazar una foránea).
export function infoEstadoPropiedad(p: { estado_mx?: string | null; direccion?: string | null; titulo?: string | null }): InfoEstado {
  const estado = (p.estado_mx && p.estado_mx.trim())
    || detectarEstadoMexico(`${p.direccion ?? ''} ${p.titulo ?? ''}`)
    || null
  if (!estado) return { estado: null, esQueretaro: false, foraneo: false, desconocido: true }
  const esQueretaro = norm(estado) === norm(ESTADO_PRINCIPAL)
  return { estado, esQueretaro, foraneo: !esQueretaro, desconocido: false }
}
