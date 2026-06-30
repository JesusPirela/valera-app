import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPREADSHEET_ID = '1IEPvWin1ghuXvl7uWwdl_qzDioQS0P2qDh-RUdezf_c'
const SHEET_NAME     = 'excel equipo'

function parseCsv(raw: string): string[][] {
  return raw
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const cols: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          cols.push(current.trim()); current = ''
        } else {
          current += ch
        }
      }
      cols.push(current.trim())
      return cols
    })
}

function isSeparator(v: string) {
  const t = v.trim()
  return !t || t === '—' || t === '-' || t === '--'
}

// Detecta grupos de columnas repetidos y normaliza: una fila por registro.
// Ej: (Desarrollo, Modelo, Precio, Tipo) × N grupos  →  N filas con esas 4 columnas.
function normalizeGroups(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  // Busca el primer encabezado no-separador que se repite → marca inicio de grupo 2
  const seen = new Map<string, number>()
  let groupSize = 0
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase()
    if (isSeparator(h)) continue
    if (seen.has(h)) { groupSize = i; break }
    seen.set(h, i)
  }

  if (groupSize < 2) return { headers, rows } // Sin patrón repetido

  // Columnas del primer grupo (sin separadores)
  const templateCols: { name: string; localIdx: number }[] = []
  for (let i = 0; i < groupSize; i++) {
    if (!isSeparator(headers[i])) templateCols.push({ name: headers[i].trim(), localIdx: i })
  }

  const numGroups = Math.ceil(headers.length / groupSize)
  const templateHeaders = templateCols.map(c => c.name)

  const normalizedRows: string[][] = []
  for (const row of rows) {
    for (let g = 0; g < numGroups; g++) {
      const offset = g * groupSize
      const vals = templateCols.map(c => (row[offset + c.localIdx] ?? '').replace(/^"|"$/g, '').trim())
      if (vals.some(v => !isSeparator(v))) normalizedRows.push(vals)
    }
  }

  return { headers: templateHeaders, rows: normalizedRows }
}

// Elige la mejor fila de encabezados entre las primeras N filas:
// prefiere la que tenga más celdas no-vacías y un patrón repetido.
function findHeaderRow(filas: string[][], maxLook = 4): number {
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(filas.length, maxLook); i++) {
    const nonEmpty = filas[i].filter(c => !isSeparator(c)).length
    // Bonus si tiene un patrón que se repite (indica fila de encabezados multi-grupo)
    const seen = new Set<string>()
    let repeats = 0
    for (const c of filas[i]) {
      const t = c.trim().toLowerCase()
      if (!isSeparator(t)) { if (seen.has(t)) repeats++; seen.add(t) }
    }
    const score = nonEmpty + repeats * 3
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const encodedSheet = encodeURIComponent(SHEET_NAME)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`

    const resp = await fetch(csvUrl, {
      headers: { 'User-Agent': 'Valera-App/1.0' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      return json({ error: `No se pudo acceder a la hoja: HTTP ${resp.status}. Verifica que el documento sea accesible para "cualquiera con el enlace".` }, 502)
    }

    const raw = await resp.text()
    if (!raw || raw.trim() === '') return json({ headers: [], rows: [] })

    const filas = parseCsv(raw)
    if (filas.length === 0) return json({ headers: [], rows: [] })

    const headerRowIdx = findHeaderRow(filas)
    const headerRow    = filas[headerRowIdx]
    const dataRows     = filas.slice(headerRowIdx + 1)

    const headers = headerRow.map(h => h.replace(/^"|"$/g, '').trim())

    const rows = dataRows
      .filter(r => r.some(cell => !isSeparator(cell)))
      .map(r => headers.map((_, i) => (r[i] ?? '').replace(/^"|"$/g, '').trim()))

    const result = normalizeGroups(headers, rows)
    return json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
