export type ColoniaSugerida = {
  label: string
  zona: 'queretaro' | 'monterrey' | 'puebla'
  ciudad: string
  lat: number
  lng: number
}

export const COLONIAS: ColoniaSugerida[] = [
  // ── Querétaro ─────────────────────────────────────────────────────────────
  { label: 'Centro Histórico',    zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5881, lng: -100.3900 },
  { label: 'Centro Sur',          zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5650, lng: -100.3850 },
  { label: 'Corregidora',         zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5167, lng: -100.4417 },
  { label: 'Juriquilla',          zona: 'queretaro', ciudad: 'Querétaro', lat: 20.7050, lng: -100.4550 },
  { label: 'El Marqués',          zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6167, lng: -100.2800 },
  { label: 'Zibatá',              zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6800, lng: -100.3400 },
  { label: 'El Refugio',          zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6300, lng: -100.3700 },
  { label: 'Candiles',            zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6100, lng: -100.4200 },
  { label: 'Constituyentes',      zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5950, lng: -100.4100 },
  { label: 'Cumbres',             zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6500, lng: -100.4300 },
  { label: 'Milenio',             zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5750, lng: -100.4200 },
  { label: 'Santa Fe',            zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5500, lng: -100.4100 },
  { label: 'Interlomas',          zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6950, lng: -100.4600 },
  { label: 'Pedregal',            zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5400, lng: -100.4000 },
  { label: 'Lomas de Juriquilla', zona: 'queretaro', ciudad: 'Querétaro', lat: 20.7100, lng: -100.4600 },
  { label: 'San Juan del Río',    zona: 'queretaro', ciudad: 'Querétaro', lat: 20.3833, lng: -99.9833  },
  { label: 'Tequisquiapan',       zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5167, lng: -99.8833  },
  { label: 'Cimatario',           zona: 'queretaro', ciudad: 'Querétaro', lat: 20.5600, lng: -100.4050 },
  { label: 'Hércules',            zona: 'queretaro', ciudad: 'Querétaro', lat: 20.6050, lng: -100.3950 },
  { label: 'Punta Juriquilla',    zona: 'queretaro', ciudad: 'Querétaro', lat: 20.7200, lng: -100.4650 },
  // ── Monterrey ─────────────────────────────────────────────────────────────
  { label: 'San Pedro Garza García', zona: 'monterrey', ciudad: 'Monterrey', lat: 25.6500, lng: -100.4000 },
  { label: 'Santa Catarina',      zona: 'monterrey', ciudad: 'Monterrey', lat: 25.6731, lng: -100.4569 },
  { label: 'Guadalupe',           zona: 'monterrey', ciudad: 'Monterrey', lat: 25.6739, lng: -100.2533 },
  { label: 'Apodaca',             zona: 'monterrey', ciudad: 'Monterrey', lat: 25.7847, lng: -100.1875 },
  { label: 'San Nicolás',         zona: 'monterrey', ciudad: 'Monterrey', lat: 25.7444, lng: -100.3036 },
  { label: 'Escobedo',            zona: 'monterrey', ciudad: 'Monterrey', lat: 25.7978, lng: -100.3336 },
  { label: 'Cumbres',             zona: 'monterrey', ciudad: 'Monterrey', lat: 25.7500, lng: -100.3800 },
  { label: 'Valle Oriente',       zona: 'monterrey', ciudad: 'Monterrey', lat: 25.6400, lng: -100.3500 },
  { label: 'Centro MTY',          zona: 'monterrey', ciudad: 'Monterrey', lat: 25.6866, lng: -100.3161 },
  // ── Puebla ────────────────────────────────────────────────────────────────
  { label: 'Cholula',             zona: 'puebla', ciudad: 'Puebla', lat: 19.0556, lng: -98.3014 },
  { label: 'Angelópolis',         zona: 'puebla', ciudad: 'Puebla', lat: 19.0167, lng: -98.2500 },
  { label: 'Atlixco',             zona: 'puebla', ciudad: 'Puebla', lat: 18.9083, lng: -98.4386 },
  { label: 'Tehuacán',            zona: 'puebla', ciudad: 'Puebla', lat: 18.4617, lng: -97.3939 },
  { label: 'Centro Puebla',       zona: 'puebla', ciudad: 'Puebla', lat: 19.0414, lng: -98.2063 },
  { label: 'Lomas de Angelópolis',zona: 'puebla', ciudad: 'Puebla', lat: 19.0050, lng: -98.2600 },
]
