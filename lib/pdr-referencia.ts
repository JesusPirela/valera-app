// PDR = Precios De Referencia (precios "desde" / lo mínimo del mercado por zona).
// Extraídos del archivo INVENTARIO (hoja de precios) del equipo — sirven como
// referencia de mercado y se muestran AL FINAL de la tabla de su respectiva zona.
// Cada PDR va bajo su zona real (respetando las sub-zonas del archivo:
// Centro, Centro Sur, La Vista, Campanario, Milenio, Real Solare, Monterrey, Puebla).
import { normalizar } from './texto'

export type PdrRef = {
  etiqueta: string          // colonia / referencia
  precio: number
  caract: string
  tipo: string | null       // 'Casa' | 'Departamento' | null
}

export const PDR_POR_ZONA: { zona: string; refs: PdrRef[] }[] = [
  { zona: 'Zibatá', refs: [
    { etiqueta: 'Depa Zibatá', precio: 1950000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa Zibatá', precio: 2700000, caract: '3 rec · 2 baños', tipo: 'Casa' },
  ]},
  { zona: 'Juriquilla', refs: [
    { etiqueta: 'Casa San Isidro', precio: 3000000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Depa usado Juriquilla', precio: 3100000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa Santa Fe Juriquilla', precio: 3200000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Depa Juriquilla Towers', precio: 3200000, caract: '3 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa Cumbres del Lago Juriquilla', precio: 3800000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Juriquilla', precio: 4000000, caract: '3 rec · 3 baños', tipo: 'Casa' },
  ]},
  { zona: 'Corregidora', refs: [
    { etiqueta: 'Fracc. Pirámides', precio: 1650000, caract: '3 rec · 1.5 baños', tipo: 'Casa' },
    { etiqueta: 'Candiles', precio: 2000000, caract: '3 rec · 1.5 baños', tipo: 'Casa' },
    { etiqueta: 'Paseos del Bosque', precio: 2150000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Los Olvera', precio: 2950000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Tejeda', precio: 2950000, caract: '2 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Puerta Real', precio: 3500000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Cañadas del Lago', precio: 4500000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Vista Real', precio: 5900000, caract: '3 rec · 4 baños', tipo: 'Casa' },
  ]},
  { zona: 'Ciudad del Sol', refs: [
    { etiqueta: 'Ciudad del Sol', precio: 1400000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Puerta Navarra', precio: 1600000, caract: '2 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Puerta Verona', precio: 1600000, caract: '2 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Cerrito Colorado', precio: 1650000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Tres Cantos', precio: 1700000, caract: '3 rec · 3 baños', tipo: 'Casa' },
    { etiqueta: 'Viñedos', precio: 1790000, caract: '3 rec · 3 baños', tipo: 'Casa' },
    { etiqueta: 'Sonterra', precio: 2000000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Meseta', precio: 2300000, caract: '2 rec · 2 baños', tipo: 'Casa' },
  ]},
  { zona: 'El Campanario', refs: [
    { etiqueta: 'Lomas del Campanario', precio: 8400000, caract: '3 rec · 4 baños', tipo: 'Casa' },
    { etiqueta: 'Campanario', precio: 19000000, caract: '4 rec · 5 baños', tipo: 'Casa' },
  ]},
  { zona: 'El Mirador', refs: [
    { etiqueta: 'Casa usada El Mirador', precio: 1971000, caract: '3 rec · 2.5 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Zen Life', precio: 3000000, caract: '3 rec · 2.5 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Zen House', precio: 3500000, caract: '3 rec · 2.5 baños', tipo: 'Casa' },
  ]},
  { zona: 'Milenio', refs: [
    { etiqueta: 'Depa usado Milenio', precio: 2600000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa usada Milenio', precio: 3200000, caract: '3 rec · 2 baños', tipo: 'Casa' },
  ]},
  { zona: 'Real Solare', refs: [
    { etiqueta: 'Depa usado Real Solare', precio: 890000, caract: '2 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Casa usada Real Solare', precio: 1370000, caract: '2 rec · 1.5 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Rincones del Marqués', precio: 1500000, caract: '2 rec · 1.5 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Ciudad Maderas', precio: 2200000, caract: '3 rec · 2 baños', tipo: 'Casa' },
  ]},
  { zona: 'Centro', refs: [
    { etiqueta: 'Avanta Gardens', precio: 2500000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa usada (Alcanfores)', precio: 2600000, caract: '3 rec · 2.5 baños', tipo: 'Casa' },
    { etiqueta: 'Col. Quintas del Marqués', precio: 2900000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Depa Centro usado', precio: 3000000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Col. Calesa', precio: 3400000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Col. Cimatario', precio: 3500000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Col. Villas del Sol', precio: 3500000, caract: '7 rec · 5 baños', tipo: 'Casa' },
    { etiqueta: 'Col. Carretas', precio: 4790000, caract: '3 rec · 3 baños', tipo: 'Casa' },
  ]},
  { zona: 'Centro Sur', refs: [
    { etiqueta: 'Avanta Gardens', precio: 2700000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Casa usada Colinas de Cimatario', precio: 3300000, caract: '3 rec · 2 baños', tipo: 'Casa' },
    { etiqueta: 'Koloria', precio: 3600000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Alia Sky', precio: 3700000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'Central Park', precio: 5000000, caract: '3 rec · 3 baños', tipo: 'Casa' },
    { etiqueta: 'Casa Cumbres de Cimatario', precio: 5900000, caract: '3 rec · 3 baños', tipo: 'Casa' },
    { etiqueta: 'Casa usada Centro Sur (Claustros)', precio: 5900000, caract: '3 rec · 3 baños', tipo: 'Casa' },
  ]},
  { zona: 'El Refugio', refs: [
    { etiqueta: 'La Vista', precio: 3550000, caract: '3 rec · 3 baños', tipo: null },
  ]},
  { zona: 'Monterrey', refs: [
    { etiqueta: 'Centro Monterrey', precio: 1500000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Apodaca, Nuevo León', precio: 1600000, caract: '2 rec · 1 baño', tipo: 'Casa' },
    { etiqueta: 'Apodaca, Nuevo León', precio: 2800000, caract: '2 rec · 2 baños', tipo: 'Departamento' },
    { etiqueta: 'San Jerónimo', precio: 3000000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Centro Monterrey', precio: 3200000, caract: '2 rec · 1.5 baños', tipo: 'Casa' },
    { etiqueta: 'Las Cumbres', precio: 3292000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'San Pedro Garza', precio: 3569000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Las Cumbres', precio: 4300000, caract: '5 rec · 3 baños', tipo: 'Casa' },
    { etiqueta: 'San Pedro Garza (inversión)', precio: 4650000, caract: '5 rec', tipo: 'Casa' },
    { etiqueta: 'San Jerónimo', precio: 6500000, caract: '2 rec · 2 baños', tipo: 'Casa' },
  ]},
  { zona: 'Puebla', refs: [
    { etiqueta: 'San Andrés Cholula', precio: 1930000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Lomas de Angelópolis', precio: 2100000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'San Andrés Cholula', precio: 2500000, caract: '3 rec · 2.5 baños', tipo: 'Casa' },
    { etiqueta: 'Lomas de Angelópolis', precio: 2830000, caract: '3 rec · 3.5 baños', tipo: 'Casa' },
    { etiqueta: 'Reserva Territorial Atlixcáyotl', precio: 2960000, caract: '1 rec · 1 baño', tipo: 'Departamento' },
    { etiqueta: 'Reserva Territorial Atlixcáyotl', precio: 4550000, caract: '4 rec · 4.5 baños', tipo: 'Casa' },
  ]},
]

// Índice normalizado zona → refs (para empatar con el nombre que produce el detector).
const IDX = new Map<string, PdrRef[]>()
for (const g of PDR_POR_ZONA) IDX.set(normalizar(g.zona), g.refs)

export function pdrDeZona(zona: string): PdrRef[] {
  return IDX.get(normalizar(zona)) ?? []
}
