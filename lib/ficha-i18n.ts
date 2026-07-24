import { supabase } from './supabase'

// Idiomas soportados por la ficha (PDF y link). Ampliable.
export type IdiomaFicha = 'es' | 'en'

// ── Etiquetas fijas de la ficha ──────────────────────────────────────────────
// El texto libre (título/descripción) lo traduce DeepL; esto es solo la
// "plantilla" (encabezados, unidades, botones), que no vale la pena mandar a un
// traductor porque nunca cambia.
type Dic = {
  precio: string
  descripcion: string
  ubicacion: string
  caracteristicas: string
  enRenta: string
  enVenta: string
  consultarPrecio: string
  abrirMaps: string
  noEncontrada: string
  noDisponible: string
  recamaras: string
  banos: string
  m2const: string
  m2terreno: string
  estacionamientos: string
  generarPDF: string
  compartida: string
  // Etiquetas largas (PDF)
  recamarasFull: string
  banosFull: string
  medioBanoSing: string
  medioBanoPlur: string
  m2constFull: string
  m2terrenoFull: string
  estacionamientosFull: string
  precioConsultar: string
}

const DIC: Record<IdiomaFicha, Dic> = {
  es: {
    precio: 'Precio',
    descripcion: 'Descripción',
    ubicacion: 'Ubicación',
    caracteristicas: 'Características',
    enRenta: 'en Renta',
    enVenta: 'en Venta',
    consultarPrecio: 'Consultar precio',
    abrirMaps: '🗺️ Abrir en Maps',
    noEncontrada: 'Propiedad no encontrada',
    noDisponible: 'Es posible que ya no esté disponible.',
    recamaras: 'Rec.',
    banos: 'Baños',
    m2const: 'm² const.',
    m2terreno: 'm² terr.',
    estacionamientos: 'Est.',
    generarPDF: 'Generar ficha PDF',
    compartida: 'Ficha compartida',
    recamarasFull: 'Recámaras',
    banosFull: 'Baños',
    medioBanoSing: 'Medio baño',
    medioBanoPlur: 'Medios baños',
    m2constFull: 'm² construcción',
    m2terrenoFull: 'm² terreno',
    estacionamientosFull: 'Estacionamientos',
    precioConsultar: 'Precio a consultar',
  },
  en: {
    precio: 'Price',
    descripcion: 'Description',
    ubicacion: 'Location',
    caracteristicas: 'Features',
    enRenta: 'for Rent',
    enVenta: 'for Sale',
    consultarPrecio: 'Price on request',
    abrirMaps: '🗺️ Open in Maps',
    noEncontrada: 'Property not found',
    noDisponible: 'It may no longer be available.',
    recamaras: 'Beds',
    banos: 'Baths',
    m2const: 'm² built',
    m2terreno: 'm² lot',
    estacionamientos: 'Parking',
    generarPDF: 'Generate PDF sheet',
    compartida: 'Property sheet',
    recamarasFull: 'Bedrooms',
    banosFull: 'Bathrooms',
    medioBanoSing: 'Half bath',
    medioBanoPlur: 'Half baths',
    m2constFull: 'm² built',
    m2terrenoFull: 'm² lot',
    estacionamientosFull: 'Parking spaces',
    precioConsultar: 'Price on request',
  },
}

// "Casa en Renta" (es) → "House for Rent" (en). Junta tipo + operación.
export function tipoOperacionLabel(
  tipo: string | null,
  operacion: string | null,
  lang: IdiomaFicha,
): string {
  const t = tipoLabel(tipo, lang)
  if (!operacion) return t
  const op = operacion === 'renta' ? tf(lang, 'enRenta') : tf(lang, 'enVenta')
  return [t, op].filter(Boolean).join(' ')
}

export function tf(lang: IdiomaFicha, key: keyof Dic): string {
  return DIC[lang][key]
}

// Tipos de propiedad más comunes → inglés. Si no está en la lista, se deja tal
// cual (capitalizado), que es mejor que no mostrar nada.
const TIPOS_EN: Record<string, string> = {
  casa: 'House',
  departamento: 'Apartment',
  terreno: 'Land',
  local: 'Retail space',
  oficina: 'Office',
  bodega: 'Warehouse',
  edificio: 'Building',
  local_comercial: 'Commercial space',
  casa_condominio: 'Townhouse',
  ph: 'Penthouse',
}

export function tipoLabel(tipo: string | null, lang: IdiomaFicha): string {
  if (!tipo) return ''
  if (lang === 'en') {
    const en = TIPOS_EN[tipo.toLowerCase().replace(/\s+/g, '_')]
    if (en) return en
  }
  return tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

// Precio: en inglés se usa el formato en-US, pero SIEMPRE en MXN (es el precio
// real; no se convierte moneda).
export function formatPrecioLang(precio: number | null, lang: IdiomaFicha): string {
  if (!precio) return lang === 'en' ? DIC.en.consultarPrecio : DIC.es.consultarPrecio
  const n = precio.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX')
  return `$${n} MXN`
}

// ── Traducción del texto libre vía Edge Function (DeepL, con caché) ───────────
// Devuelve el título y la descripción en inglés. La función del servidor guarda
// el resultado, así que la próxima vez es instantáneo.
export async function traducirFicha(
  codigo: string,
): Promise<{ titulo_en: string | null; descripcion_en: string | null } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('traducir-ficha', {
      body: { codigo },
    })
    if (error || !data?.ok) return null
    return { titulo_en: data.titulo_en ?? null, descripcion_en: data.descripcion_en ?? null }
  } catch {
    return null
  }
}
