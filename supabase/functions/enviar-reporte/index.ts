import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// ── HTML helpers (duplicated from app for edge function context) ──────────────

function formatMinutos(m: number): string {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h ${min}m` : `${min}m`
}

function statusConfig(act: number, max: number) {
  if (act === 0) return { emoji: '🔴', label: 'Sin actividad' }
  if (max > 0 && act >= max * 0.5) return { emoji: '🟢', label: 'Muy activo' }
  return { emoji: '🟡', label: 'Actividad media' }
}

function generarHTML(
  usuarios: any[],
  tendencia: any[],
  rangoLabel: string,
  generadoEn: string,
): string {
  const activos = usuarios.filter((u: any) => u.actividad_total > 0).length
  const inactivos = usuarios.length - activos
  const topUser = usuarios[0]
  const totalAct = usuarios.reduce((s: number, u: any) => s + u.actividad_total, 0)
  const totalClientes = usuarios.reduce((s: number, u: any) => s + u.clientes_nuevos, 0)
  const totalSeguimientos = usuarios.reduce((s: number, u: any) => s + u.seguimientos, 0)

  const filas = usuarios.map((u: any, i: number) => {
    const st = statusConfig(u.actividad_total, usuarios[0]?.actividad_total ?? 1)
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>#${i + 1}</td>
      <td><strong>${u.nombre ?? 'Usuario'}</strong></td>
      <td class="center">${st.emoji} ${st.label}</td>
      <td class="center">${u.clientes_nuevos}</td>
      <td class="center">${u.propiedades_publicadas}</td>
      <td class="center">${u.seguimientos}</td>
      <td class="center">${u.interacciones}</td>
      <td class="center">${u.citas}</td>
      <td class="center">${formatMinutos(u.minutos_conexion)}</td>
      <td class="center bold">${u.actividad_total}</td>
    </tr>`
  }).join('')

  const maxTend = Math.max(...tendencia.map((d: any) => d.total_actividad), 1)
  const barrasTend = tendencia.slice(-14).map((d: any) => {
    const pct = Math.round((d.total_actividad / maxTend) * 100)
    const col = d.total_actividad === 0 ? '#e5e7eb' : d.usuarios_activos >= 3 ? '#1a6470' : '#c9a84c'
    const dia = new Date(d.fecha).getDate()
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
      <div style="background:${col};height:${Math.max(pct * 0.8, d.total_actividad > 0 ? 4 : 2)}px;width:100%;border-radius:3px"></div>
      <div style="font-size:9px;color:#9ca3af">${dia}</div>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Reporte de Productividad – ${rangoLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:32px}
  .header{background:linear-gradient(135deg,#1a6470,#0d3d45);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:24px}
  .header h1{font-size:24px;font-weight:900;margin-bottom:4px}
  .header p{font-size:13px;opacity:.8}
  .header-meta{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap}
  .header-meta div{background:rgba(255,255,255,.15);border-radius:8px;padding:10px 16px;text-align:center}
  .header-meta strong{display:block;font-size:22px;font-weight:900;color:#c9a84c}
  .header-meta span{font-size:11px;opacity:.85}
  .section{margin-bottom:24px}
  .section-title{font-size:14px;font-weight:800;color:#1a6470;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  th{background:#1a6470;color:#fff;padding:10px 12px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.5px}
  td{padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}
  tr.even td{background:#f1f5f9}
  .center{text-align:center}
  .bold{font-weight:800}
  .trend-bars{display:flex;gap:4px;align-items:flex-end;height:80px;padding:8px 0}
  .footer{margin-top:32px;font-size:11px;color:#94a3b8;text-align:center}
  @media print{body{padding:16px}.header{break-inside:avoid}table{break-inside:avoid}}
</style>
</head><body>
<div class="header">
  <h1>📊 Reporte de Productividad</h1>
  <p>Período: ${rangoLabel} &nbsp;·&nbsp; Generado: ${generadoEn}</p>
  <div class="header-meta">
    <div><strong>${activos}</strong><span>Usuarios activos</span></div>
    <div><strong>${inactivos}</strong><span>Sin actividad</span></div>
    <div><strong>${totalAct}</strong><span>Puntos equipo</span></div>
    <div><strong>${totalClientes}</strong><span>Clientes nuevos</span></div>
    <div><strong>${totalSeguimientos}</strong><span>Seguimientos</span></div>
    ${topUser ? `<div><strong>${topUser.nombre ?? '—'}</strong><span>Top performer</span></div>` : ''}
  </div>
</div>

${tendencia.length > 0 ? `
<div class="section">
  <div class="section-title">Tendencia de actividad</div>
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div class="trend-bars">${barrasTend}</div>
  </div>
</div>` : ''}

<div class="section">
  <div class="section-title">Detalle por usuario</div>
  <table>
    <thead><tr>
      <th>#</th><th>Usuario</th><th>Estado</th>
      <th class="center">Clientes</th><th class="center">Propied.</th>
      <th class="center">Seguim.</th><th class="center">Interac.</th>
      <th class="center">Citas</th><th class="center">Tiempo</th>
      <th class="center">Score</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
</div>

<div class="footer">Valera Real Estate · Reporte generado automáticamente · ${generadoEn}</div>
</body></html>`
}

// ── Enviar email vía Resend ───────────────────────────────────────────────────

async function enviarEmail(
  supabase: any,
  resendKey: string,
  fromEmail: string,
  destinatarios: string[],
  rangoInicio: string,
  rangoFin: string,
  rangoLabel: string,
) {
  const [{ data: usuarios, error: e1 }, { data: tendencia, error: e2 }] = await Promise.all([
    supabase.rpc('get_productividad_equipo', { p_inicio: rangoInicio, p_fin: rangoFin }),
    supabase.rpc('get_tendencia_equipo', { p_inicio: rangoInicio, p_fin: rangoFin }),
  ])

  if (e1) throw new Error(`RPC equipo: ${e1.message}`)
  if (e2) throw new Error(`RPC tendencia: ${e2.message}`)

  const generadoEn = new Date().toLocaleString('es-MX', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Mexico_City',
  })
  const html = generarHTML(usuarios ?? [], tendencia ?? [], rangoLabel, generadoEn)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: destinatarios,
      subject: `📊 Reporte de Productividad – ${rangoLabel}`,
      html,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Resend: ${JSON.stringify(data)}`)

  return { ok: true, enviado_a: destinatarios.length, email_id: (data as any).id }
}

// ── Procesar programaciones automáticas ──────────────────────────────────────

async function procesarProgramados(supabase: any, resendKey: string, fromEmail: string) {
  const { data: programados } = await supabase
    .from('report_programados')
    .select('*')
    .eq('activo', true)

  let enviados = 0
  const ahora = new Date()

  for (const prog of (programados ?? [])) {
    const [h, m] = prog.hora_envio.split(':').map(Number)

    // Hora actual en México
    const mxStr = ahora.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: 'numeric', hour12: false })
    const [haStr, maStr] = mxStr.split(':')
    const minutosActual = parseInt(haStr) * 60 + parseInt(maStr)
    const minutosProg = h * 60 + m

    // Solo enviar si estamos dentro de ±30 min de la hora programada
    if (Math.abs(minutosActual - minutosProg) > 30) continue

    // No reenviar si ya se envió recientemente según la frecuencia
    if (prog.ultimo_envio) {
      const horasDesdeUltimo = (ahora.getTime() - new Date(prog.ultimo_envio).getTime()) / 3_600_000
      if (prog.frecuencia === 'diario'   && horasDesdeUltimo < 20)      continue
      if (prog.frecuencia === 'semanal'  && horasDesdeUltimo < 6 * 24)  continue
      if (prog.frecuencia === 'mensual'  && horasDesdeUltimo < 28 * 24) continue
    }

    // Calcular rango del período
    const fin = new Date()
    let inicio: Date
    if (prog.frecuencia === 'diario') {
      inicio = new Date(fin.getTime() - 24 * 3_600_000)
    } else if (prog.frecuencia === 'semanal') {
      inicio = new Date(fin.getTime() - 7 * 24 * 3_600_000)
    } else {
      inicio = new Date(fin.getFullYear(), fin.getMonth() - 1, fin.getDate())
    }

    const rangoLabel = `${inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${fin.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`

    try {
      await enviarEmail(supabase, resendKey, fromEmail, prog.destinatarios, inicio.toISOString(), fin.toISOString(), rangoLabel)
      await supabase.from('report_programados').update({ ultimo_envio: ahora.toISOString() }).eq('id', prog.id)
      enviados++
    } catch (err) {
      console.error(`[enviar-reporte] Error en prog ${prog.id}:`, err)
    }
  }

  return { ok: true, enviados }
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Reportes Valera <noreply@resend.dev>'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({}))
    const { destinatarios, rangoInicio, rangoFin, rangoLabel, check_schedules } = body

    if (check_schedules) {
      if (!resendKey) {
        return new Response(JSON.stringify({ ok: true, enviados: 0, nota: 'RESEND_API_KEY no configurada' }), { headers: CORS })
      }
      const result = await procesarProgramados(supabase, resendKey, fromEmail)
      return new Response(JSON.stringify(result), { headers: CORS })
    }

    if (!destinatarios?.length) {
      return new Response(JSON.stringify({ error: 'Faltan destinatarios' }), { status: 400, headers: CORS })
    }

    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY no configurada. Ve a Supabase → Edge Functions → Secrets y agrega RESEND_API_KEY con tu clave de resend.com' }),
        { status: 503, headers: CORS },
      )
    }

    const result = await enviarEmail(supabase, resendKey, fromEmail, destinatarios, rangoInicio, rangoFin, rangoLabel)
    return new Response(JSON.stringify(result), { headers: CORS })

  } catch (err: any) {
    console.error('[enviar-reporte]', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Error interno' }), { status: 500, headers: CORS })
  }
})
