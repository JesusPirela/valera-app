// ── Zonas de interés del cliente (Querétaro) ──────────────────────────────────
// Catálogo canónico + matcher de variantes. El campo `clientes.zona_busqueda`
// guarda las zonas canónicas separadas por coma, seguidas opcionalmente de una
// zona libre ("Otra"). Ej: "Milenio, El Mirador" o "Milenio, Fraccionamiento X".
//
// El objetivo es des-ambiguar: quien escribió "campanario" o "lomas de campanario"
// cae en la misma zona "El Campanario", para poder seccionar/asignar a futuro.

export const ZONAS_INTERES: string[] = [
  'Milenio', 'El Marqués', 'El Mirador', 'Real Solare', 'Corregidora', 'Sonterra',
  'Zakia', 'Juriquilla', 'Ciudad del Sol', 'Zibatá', 'Centro', 'El Refugio', 'La Loma',
  'Ciudad Maderas', 'Centro Sur', 'Capital Sur', 'Valencia', 'Santaluz', 'Cumbres',
  'Los Héroes', 'Jurica', 'Riscos', 'Loma Dorada', 'El Campanario', 'Altozano',
]

// Alias por zona: regex sobre texto normalizado (minúsculas, SIN acentos).
// Se usan expresiones específicas primero para evitar solapes (ej. "Centro Sur"
// no debe también marcar "Centro"; "Cumbres del Marqués" cae solo en El Marqués).
const ALIASES: Array<[string, RegExp]> = [
  ['Ciudad Maderas', /ciudad maderas|cd\.? ?maderas/],
  ['Ciudad del Sol', /ciudad del ?sol|cd\.? ?del? ?sol|cd sol|puertas? del sol/],
  ['Centro Sur',     /centro ?sur/],
  ['Capital Sur',    /capital sur/],
  ['Milenio',        /milenio/],
  ['El Mirador',     /mirador|albia|provenza/],
  ['Real Solare',    /solare|\brs\b|valvento/],
  ['Corregidora',    /corregidora|correguidora|casa magna|paseos del bosque|mision mariana|mision cimatario/],
  ['El Marqués',     /marqu?e[sz]|sendas/],
  ['Zakia',          /zakia|la pradera/],
  ['Zibatá',         /zibat|\bzire\b|\bziran?\b|\bzaru\b/],
  ['Sonterra',       /sonterra|puerta navarra|vinedos/],
  ['Juriquilla',     /juriquilla|cumbres de lago|mykonos/],
  ['El Refugio',     /refugio/],
  ['La Loma',        /la loma|real de la loma|real la loma|rel la loma|loarca/],
  ['Santaluz',       /santaluz|santa luz/],
  ['Los Héroes',     /heroes/],
  ['Loma Dorada',    /loma dorada/],
  ['Valencia',       /valencia/],
  ['El Campanario',  /campanario/],
  ['Altozano',       /altozano/],
  ['Riscos',         /riscos/],
  // Genéricas al final (menos específicas):
  ['Centro',         /\bcentro\b(?! ?sur)|centro hist/],
  ['Cumbres',        /cumbres\b(?! de lago| del marqu)/],
  ['Jurica',         /jurica(?!\w)/],
]

export function normalizarZona(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Devuelve las zonas canónicas que coinciden con un texto libre (0, 1 o varias),
// en el orden del catálogo.
export function matchZonasInteres(raw: string): string[] {
  if (!raw) return []
  const t = normalizarZona(raw)
  const hits = new Set<string>()
  for (const [name, re] of ALIASES) if (re.test(t)) hits.add(name)
  return ZONAS_INTERES.filter(z => hits.has(z))
}

// Heurística: ¿el texto es en realidad una nota de crédito/presupuesto puesta en
// el campo de zona? (sin ninguna zona real reconocible). Se usa en la migración
// para moverlo a Notas y dejar la zona limpia.
export function esNotaCredito(raw: string): boolean {
  if (!raw) return false
  if (matchZonasInteres(raw).length) return false
  const t = normalizarZona(raw)
  return /infonavit|fovisste|fovissste|cofinavit|bancario|hipotecari|credito|escritur|contado|fovi\b|\bmdp\b|millon|\$\s*\d|\d\s*m\b|\d[.,]\d|^\s*\d+([.,]\d+)?\s*$|unamos/.test(t)
}

// Divide el valor guardado en zonas canónicas (chips) + resto de texto libre ("otra").
export function parseZonasGuardadas(value: string | null | undefined): { zonas: string[]; otra: string } {
  if (!value) return { zonas: [], otra: '' }
  const tokens = value.split(',').map(t => t.trim()).filter(Boolean)
  const zonas: string[] = []
  const otras: string[] = []
  for (const tok of tokens) {
    const canon = ZONAS_INTERES.find(z => normalizarZona(z) === normalizarZona(tok))
    if (canon) { if (!zonas.includes(canon)) zonas.push(canon) }
    else otras.push(tok)
  }
  return { zonas: ZONAS_INTERES.filter(z => zonas.includes(z)), otra: otras.join(', ') }
}

// Reconstruye el string a guardar: zonas canónicas + zona libre al final.
export function joinZonasGuardadas(zonas: string[], otra: string): string {
  const parts = ZONAS_INTERES.filter(z => zonas.includes(z))
  const o = (otra ?? '').trim()
  if (o) parts.push(o)
  return parts.join(', ')
}
