import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPREADSHEET_ID = '1IEPvWin1ghuXvl7uWwdl_qzDioQS0P2qDh-RUdezf_c'
const SHEET_NAME     = 'excel equipo'

// Parsea un CSV simple (sin campos con comas dentro de comillas — suficiente
// para hojas de cálculo de equipo que no tienen texto con comas internas).
function parseCsv(raw: string): string[][] {
  return raw
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      // Manejo básico de campos con comillas dobles
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
    // URL pública de exportación CSV — funciona si la hoja tiene acceso
    // "Cualquier usuario con el enlace puede ver".
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
    if (!raw || raw.trim() === '') {
      return json({ headers: [], rows: [] })
    }

    const filas = parseCsv(raw)
    if (filas.length === 0) return json({ headers: [], rows: [] })

    const [headerRow, ...dataRows] = filas
    const headers = headerRow.map(h => h.replace(/^"|"$/g, ''))

    // Filtrar filas completamente vacías
    const rows = dataRows
      .filter(r => r.some(cell => cell.trim() !== ''))
      .map(r => headers.map((_, i) => (r[i] ?? '').replace(/^"|"$/g, '')))

    return json({ headers, rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
