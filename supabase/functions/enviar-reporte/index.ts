import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.13'

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

  // Totales del equipo
  const totalPropiedades   = usuarios.reduce((s: number, u: any) => s + u.propiedades_publicadas, 0)
  const totalInteracciones = usuarios.reduce((s: number, u: any) => s + u.interacciones, 0)
  const totalCitas         = usuarios.reduce((s: number, u: any) => s + u.citas, 0)
  const totalCursos        = usuarios.reduce((s: number, u: any) => s + u.cursos_completados, 0)
  const totalVistas        = usuarios.reduce((s: number, u: any) => s + u.vistas_propiedades, 0)
  const totalDescargas     = usuarios.reduce((s: number, u: any) => s + u.descargas_propiedades, 0)
  const muyActivos         = usuarios.filter((u: any) => u.actividad_total >= (usuarios[0]?.actividad_total ?? 1) * 0.5 && u.actividad_total > 0).length
  const actividadMedia     = usuarios.filter((u: any) => u.actividad_total > 0 && u.actividad_total < (usuarios[0]?.actividad_total ?? 1) * 0.5).length

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Reporte de Productividad – ${rangoLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:32px;max-width:900px;margin:0 auto}
  .header{background:linear-gradient(135deg,#1a6470,#0d3d45);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:24px}
  .header h1{font-size:24px;font-weight:900;margin-bottom:4px}
  .header p{font-size:13px;opacity:.8}
  .header-meta{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap}
  .header-meta div{background:rgba(255,255,255,.15);border-radius:8px;padding:10px 16px;text-align:center;min-width:80px}
  .header-meta strong{display:block;font-size:20px;font-weight:900;color:#c9a84c}
  .header-meta span{font-size:11px;opacity:.85}
  .section{margin-bottom:24px}
  .section-title{font-size:13px;font-weight:800;color:#1a6470;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  th{background:#1a6470;color:#fff;padding:9px 11px;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.5px}
  td{padding:9px 11px;border-bottom:1px solid #e2e8f0;font-size:12px}
  tr.even td{background:#f1f5f9}
  .center{text-align:center}
  .bold{font-weight:800}
  .status-grid{display:flex;gap:12px;margin-bottom:20px}
  .status-card{flex:1;background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08);border-top:3px solid}
  .status-card .num{font-size:28px;font-weight:900;margin-bottom:4px}
  .status-card .lbl{font-size:11px;color:#64748b}
  .totales-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .total-card{background:#fff;border-radius:10px;padding:12px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .total-card .ti{font-size:20px;margin-bottom:4px}
  .total-card .tv{font-size:18px;font-weight:900;color:#1a6470}
  .total-card .tl{font-size:10px;color:#64748b;margin-top:2px}
  .trend-bars{display:flex;gap:3px;align-items:flex-end;height:80px;padding:8px 0;background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .trend-legend{display:flex;gap:16px;margin-top:8px;font-size:11px;color:#64748b}
  .trend-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle}
  .user-detail{background:#fff;border-radius:10px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.07);border-left:4px solid}
  .user-name{font-size:14px;font-weight:800;margin-bottom:2px}
  .user-status{font-size:11px;margin-bottom:8px}
  .user-bar-bg{height:4px;background:#f1f5f9;border-radius:2px;margin-bottom:10px}
  .user-bar-fill{height:4px;border-radius:2px}
  .user-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .user-metric{background:#f8fafc;border-radius:6px;padding:7px;text-align:center}
  .user-metric .mv{font-size:15px;font-weight:900;color:#1a6470}
  .user-metric .ml{font-size:9px;color:#94a3b8;margin-top:1px}
  .user-score{display:flex;justify-content:space-between;align-items:center;border-radius:6px;padding:7px 10px;margin-top:8px}
  .footer{margin-top:32px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:16px}
  @media print{body{padding:16px}table{break-inside:avoid}.user-detail{break-inside:avoid}}
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
    ${topUser ? `<div><strong>${topUser.nombre?.split(' ')[0] ?? '—'}</strong><span>Top performer · ${topUser.actividad_total} pts</span></div>` : ''}
  </div>
</div>

<!-- Estado del equipo -->
<div class="section">
  <div class="section-title">Estado del equipo</div>
  <div class="status-grid">
    <div class="status-card" style="border-color:#22c55e">
      <div class="num" style="color:#22c55e">${muyActivos}</div>
      <div class="lbl">🟢 Muy activos</div>
    </div>
    <div class="status-card" style="border-color:#f59e0b">
      <div class="num" style="color:#f59e0b">${actividadMedia}</div>
      <div class="lbl">🟡 Actividad media</div>
    </div>
    <div class="status-card" style="border-color:#ef4444">
      <div class="num" style="color:#ef4444">${inactivos}</div>
      <div class="lbl">🔴 Sin actividad</div>
    </div>
  </div>
</div>

${tendencia.length > 0 ? `
<!-- Tendencia de actividad -->
<div class="section">
  <div class="section-title">Actividad diaria del equipo</div>
  <div class="trend-bars">${barrasTend}</div>
  <div class="trend-legend">
    <span><span class="trend-dot" style="background:#1a6470"></span>≥3 usuarios activos</span>
    <span><span class="trend-dot" style="background:#c9a84c"></span>Con actividad</span>
    <span><span class="trend-dot" style="background:#e5e7eb"></span>Sin actividad</span>
  </div>
</div>` : ''}

<!-- Totales del equipo -->
<div class="section">
  <div class="section-title">Totales del equipo</div>
  <div class="totales-grid">
    <div class="total-card"><div class="ti">👥</div><div class="tv">${totalClientes}</div><div class="tl">Clientes nuevos</div></div>
    <div class="total-card"><div class="ti">🏠</div><div class="tv">${totalPropiedades}</div><div class="tl">Propiedades publicadas</div></div>
    <div class="total-card"><div class="ti">✅</div><div class="tv">${totalSeguimientos}</div><div class="tl">Seguimientos</div></div>
    <div class="total-card"><div class="ti">💬</div><div class="tv">${totalInteracciones}</div><div class="tl">Interacciones</div></div>
    <div class="total-card"><div class="ti">📅</div><div class="tv">${totalCitas}</div><div class="tl">Citas generadas</div></div>
    <div class="total-card"><div class="ti">🎓</div><div class="tv">${totalCursos}</div><div class="tl">Cursos completados</div></div>
    <div class="total-card"><div class="ti">👁️</div><div class="tv">${totalVistas}</div><div class="tl">Fichas vistas</div></div>
    <div class="total-card"><div class="ti">📥</div><div class="tv">${totalDescargas}</div><div class="tl">Fotos guardadas</div></div>
  </div>
</div>

<!-- Ranking por usuario -->
<div class="section">
  <div class="section-title">Ranking del equipo · ${usuarios.length} usuarios</div>
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

<!-- Detalle expandido por usuario -->
<div class="section">
  <div class="section-title">Detalle por usuario</div>
  ${usuarios.map((u: any, i: number) => {
    const st = statusConfig(u.actividad_total, usuarios[0]?.actividad_total ?? 1)
    const pct = usuarios[0]?.actividad_total > 0 ? Math.round(u.actividad_total / usuarios[0].actividad_total * 100) : 0
    const horas = Math.floor(u.minutos_conexion / 60)
    const mins  = u.minutos_conexion % 60
    const tiempoStr = horas > 0 ? `${horas}h ${mins}m` : mins > 0 ? `${mins}m` : '—'
    const colBorder = st.emoji === '🟢' ? '#22c55e' : st.emoji === '🟡' ? '#f59e0b' : '#ef4444'
    return `
    <div class="user-detail" style="border-color:${colBorder}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="user-name">#${i+1} ${u.nombre ?? 'Usuario'}</div>
          <div class="user-status" style="color:${colBorder}">${st.emoji} ${st.label}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#94a3b8">
          ${u.primer_acceso ? `Primera: ${new Date(u.primer_acceso).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}` : ''}
          ${u.ultimo_acceso ? `<br>Última: ${new Date(u.ultimo_acceso).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}` : ''}
        </div>
      </div>
      <div class="user-bar-bg"><div class="user-bar-fill" style="width:${pct}%;background:${colBorder}"></div></div>
      <div class="user-metrics">
        <div class="user-metric"><div class="mv">${u.clientes_nuevos}</div><div class="ml">Clientes</div></div>
        <div class="user-metric"><div class="mv">${u.propiedades_publicadas}</div><div class="ml">Propiedades</div></div>
        <div class="user-metric"><div class="mv">${u.seguimientos}</div><div class="ml">Seguimientos</div></div>
        <div class="user-metric"><div class="mv">${u.interacciones}</div><div class="ml">Interacciones</div></div>
        <div class="user-metric"><div class="mv">${u.citas}</div><div class="ml">Citas</div></div>
        <div class="user-metric"><div class="mv">${u.cursos_completados}</div><div class="ml">Cursos</div></div>
        <div class="user-metric"><div class="mv">${u.vistas_propiedades}</div><div class="ml">Fichas vistas</div></div>
        <div class="user-metric"><div class="mv">${tiempoStr}</div><div class="ml">Tiempo activo</div></div>
      </div>
      <div class="user-score" style="background:${colBorder}18">
        <span style="font-size:12px;font-weight:700;color:${colBorder}">Puntaje de productividad</span>
        <span style="font-size:18px;font-weight:900;color:${colBorder}">${u.actividad_total} pts</span>
      </div>
    </div>`
  }).join('')}
</div>

<div class="footer">Valera Real Estate · Reporte generado automáticamente · ${generadoEn}</div>
</body></html>`
}

// ── Enviar email (SMTP o Resend según secrets configurados) ──────────────────

async function buildReporte(supabaseRpc: any, rangoInicio: string, rangoFin: string, rangoLabel: string) {
  const [{ data: usuarios, error: e1 }, { data: tendencia, error: e2 }] = await Promise.all([
    supabaseRpc.rpc('get_productividad_equipo', { p_inicio: rangoInicio, p_fin: rangoFin }),
    supabaseRpc.rpc('get_tendencia_equipo', { p_inicio: rangoInicio, p_fin: rangoFin }),
  ])
  if (e1) throw new Error(`RPC equipo: ${e1.message}`)
  if (e2) throw new Error(`RPC tendencia: ${e2.message}`)
  const generadoEn = new Date().toLocaleString('es-MX', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Mexico_City',
  })
  return generarHTML(usuarios ?? [], tendencia ?? [], rangoLabel, generadoEn)
}

async function enviarViaResend(resendKey: string, fromEmail: string, destinatarios: string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: destinatarios, subject, html }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Resend: ${JSON.stringify(data)}`)
  return (data as any).id
}

async function enviarViaSmtp(destinatarios: string[], subject: string, html: string) {
  const smtpUser = Deno.env.get('SMTP_USER')!
  const smtpPass = Deno.env.get('SMTP_PASS')!
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com'
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587')
  const smtpFrom = Deno.env.get('SMTP_FROM') ?? smtpUser

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from: `Valera App <${smtpFrom}>`,
    to: destinatarios.join(', '),
    subject,
    html,
  })
}

async function enviarEmail(
  supabaseRpc: any,
  destinatarios: string[],
  rangoInicio: string,
  rangoFin: string,
  rangoLabel: string,
) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const smtpUser  = Deno.env.get('SMTP_USER')
  const smtpPass  = Deno.env.get('SMTP_PASS')

  if (!resendKey && (!smtpUser || !smtpPass)) {
    throw new Error(
      'No hay proveedor de email configurado. Opciones:\n' +
      '① SMTP Gmail: agrega SMTP_USER (tu Gmail) y SMTP_PASS (contraseña de aplicación Google) en Supabase → Project Settings → Edge Functions → Secrets\n' +
      '② Resend: agrega RESEND_API_KEY desde resend.com'
    )
  }

  const html    = await buildReporte(supabaseRpc, rangoInicio, rangoFin, rangoLabel)
  const subject = `📊 Reporte de Productividad – ${rangoLabel}`

  if (resendKey) {
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Reportes Valera <noreply@resend.dev>'
    const emailId = await enviarViaResend(resendKey, fromEmail, destinatarios, subject, html)
    return { ok: true, enviado_a: destinatarios.length, proveedor: 'resend', email_id: emailId }
  }

  await enviarViaSmtp(destinatarios, subject, html)
  return { ok: true, enviado_a: destinatarios.length, proveedor: 'smtp' }
}

// ── Procesar programaciones automáticas ──────────────────────────────────────

async function procesarProgramados(supabase: any) {
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

    // CORREGIDO: usar periodo_reporte (24h/7dias/30dias) para el rango del reporte,
    // NO la frecuencia (diario/semanal/mensual) que solo indica con qué cadencia se envía.
    const fin = new Date()
    let inicio: Date
    const periodo = prog.periodo_reporte ?? '7dias'
    if (periodo === '24h') {
      inicio = new Date(fin.getTime() - 24 * 3_600_000)
    } else if (periodo === '7dias') {
      inicio = new Date(fin.getTime() - 7 * 24 * 3_600_000)
    } else {
      inicio = new Date(fin.getTime() - 30 * 24 * 3_600_000)
    }

    const rangoLabel = `${inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${fin.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`

    try {
      const resultado = await enviarEmail(supabase, prog.destinatarios, inicio.toISOString(), fin.toISOString(), rangoLabel)
      await supabase.from('report_programados').update({ ultimo_envio: ahora.toISOString() }).eq('id', prog.id)
      await supabase.from('report_logs').insert({
        report_programado_id: prog.id,
        destinatarios: prog.destinatarios,
        enviados: prog.destinatarios.length,
        estado: 'ok',
        proveedor: resultado.proveedor ?? null,
        rango_inicio: inicio.toISOString(),
        rango_fin: fin.toISOString(),
      })
      enviados++
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[enviar-reporte] Error en prog ${prog.id}:`, errMsg)
      await supabase.from('report_logs').insert({
        report_programado_id: prog.id,
        destinatarios: prog.destinatarios,
        enviados: 0,
        estado: 'error',
        error_msg: errMsg,
        rango_inicio: inicio.toISOString(),
        rango_fin: fin.toISOString(),
      })
    }
  }

  return { ok: true, enviados }
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Service role client — para operaciones de DB (report_programados, etc.)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({}))
    const { destinatarios, rangoInicio, rangoFin, rangoLabel, check_schedules } = body

    if (check_schedules) {
      const result = await procesarProgramados(supabase)
      return new Response(JSON.stringify(result), { headers: CORS })
    }

    if (!destinatarios?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan destinatarios' }), { headers: CORS })
    }

    // Para llamadas manuales, usar el JWT del usuario para que auth.uid() funcione en los RPCs
    const authHeader = req.headers.get('Authorization')
    const supabaseRpc = authHeader
      ? createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        )
      : supabase

    const result = await enviarEmail(supabaseRpc, destinatarios, rangoInicio, rangoFin, rangoLabel)
    return new Response(JSON.stringify(result), { headers: CORS })

  } catch (err: any) {
    console.error('[enviar-reporte]', err)
    return new Response(JSON.stringify({ ok: false, error: err.message ?? 'Error interno' }), { headers: CORS })
  }
})
