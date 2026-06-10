import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Platform, Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

// ── Types ─────────────────────────────────────────────────────────────────────
type Periodo = 'hoy' | 'ayer' | '7dias' | '30dias' | 'este_mes' | 'mes_pasado' | 'rango'

type UsuarioMetricas = {
  id: string
  nombre: string | null
  clientes_nuevos: number
  propiedades_publicadas: number
  seguimientos: number
  interacciones: number
  citas: number
  cursos_completados: number
  vistas_propiedades: number
  descargas_propiedades: number
  minutos_conexion: number
  primer_acceso: string | null
  ultimo_acceso: string | null
  actividad_total: number
}

type DiaActividad = {
  fecha: string
  total_actividad: number
  usuarios_activos: number
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────
function sdDia(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c }
function edDia(d: Date) { const c = new Date(d); c.setHours(23,59,59,999); return c }
function primerDiaMes(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function ultimoDiaMes(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999) }

function getRango(p: Periodo, ri?: Date, rf?: Date): { inicio: Date; fin: Date } {
  const now = new Date()
  switch (p) {
    case 'hoy':        return { inicio: sdDia(now),                        fin: now }
    case 'ayer':       { const a = new Date(now); a.setDate(a.getDate()-1); return { inicio: sdDia(a), fin: edDia(a) } }
    case '7dias':      { const i = new Date(now); i.setDate(i.getDate()-7); return { inicio: i, fin: now } }
    case '30dias':     { const i = new Date(now); i.setDate(i.getDate()-30); return { inicio: i, fin: now } }
    case 'este_mes':   return { inicio: primerDiaMes(now), fin: now }
    case 'mes_pasado': { const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); return { inicio: pm, fin: ultimoDiaMes(pm) } }
    case 'rango':      return { inicio: ri ?? sdDia(now), fin: rf ?? now }
  }
}

function formatMinutos(m: number) {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h ${min}m` : `${min}m`
}

function formatHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function formatFechaCorta(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function formatRangoLabel(inicio: Date, fin: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${inicio.toLocaleDateString('es-MX', opts)} – ${fin.toLocaleDateString('es-MX', opts)}`
}

function statusConfig(act: number, max: number) {
  if (act === 0) return { emoji: '🔴', label: 'Sin actividad', color: '#e74c3c', bg: '#1f0a0a' }
  if (max > 0 && act >= max * 0.5) return { emoji: '🟢', label: 'Muy activo', color: '#2ecc71', bg: '#0d2018' }
  return { emoji: '🟡', label: 'Actividad media', color: '#f39c12', bg: '#1a1200' }
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Reportes', msg)
}

// ── Subcomponentes ────────────────────────────────────────────────────────────
function KpiCard({ icono, label, valor, color, sub }: { icono: string; label: string; valor: string | number; color: string; sub?: string }) {
  return (
    <View style={[kS.card, { borderColor: color + '44' }]}>
      <Text style={kS.icono}>{icono}</Text>
      <Text style={[kS.valor, { color }]}>{valor}</Text>
      <Text style={kS.label}>{label}</Text>
      {sub ? <Text style={kS.sub}>{sub}</Text> : null}
    </View>
  )
}
const kS = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#111f2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, minWidth: 80 },
  icono: { fontSize: 22, marginBottom: 4 },
  valor: { fontSize: 22, fontWeight: '900', marginBottom: 2 },
  label: { fontSize: 10, color: '#7a9ab5', textAlign: 'center', fontWeight: '600' },
  sub:   { fontSize: 10, color: '#556a7a', marginTop: 2, textAlign: 'center' },
})

function TrendChart({ datos, height = 80 }: { datos: DiaActividad[]; height?: number }) {
  if (!datos.length) return null
  const maxVal = Math.max(...datos.map(d => d.total_actividad), 1)
  const barW = Math.max(8, Math.min(24, 280 / datos.length - 3))
  return (
    <View style={tS.wrap}>
      <View style={[tS.bars, { height }]}>
        {datos.map((d, i) => {
          const pct = d.total_actividad / maxVal
          const barH = Math.max(pct * height, d.total_actividad > 0 ? 4 : 2)
          const col = d.total_actividad === 0 ? '#1e3448' : d.usuarios_activos >= 3 ? '#1a6470' : '#c9a84c'
          return (
            <View key={i} style={tS.barWrap}>
              <View style={[tS.bar, { height: barH, width: barW, backgroundColor: col }]} />
              {datos.length <= 14 && (
                <Text style={tS.barLabel}>{new Date(d.fecha).getDate()}</Text>
              )}
            </View>
          )
        })}
      </View>
      <View style={tS.legend}>
        <View style={tS.legendItem}><View style={[tS.dot, { backgroundColor: '#1a6470' }]} /><Text style={tS.legendTxt}>≥3 usuarios</Text></View>
        <View style={tS.legendItem}><View style={[tS.dot, { backgroundColor: '#c9a84c' }]} /><Text style={tS.legendTxt}>activos</Text></View>
        <View style={tS.legendItem}><View style={[tS.dot, { backgroundColor: '#1e3448' }]} /><Text style={tS.legendTxt}>sin actividad</Text></View>
      </View>
    </View>
  )
}
const tS = StyleSheet.create({
  wrap:       { paddingVertical: 8 },
  bars:       { flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 4 },
  barWrap:    { alignItems: 'center', gap: 3 },
  bar:        { borderRadius: 3 },
  barLabel:   { fontSize: 8, color: '#556a7a' },
  legend:     { flexDirection: 'row', gap: 14, paddingTop: 8, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  legendTxt:  { fontSize: 10, color: '#556a7a' },
})

function MetricRow({ icono, label, valor, color }: { icono: string; label: string; valor: number; color?: string }) {
  return (
    <View style={mS.row}>
      <Text style={mS.icono}>{icono}</Text>
      <Text style={mS.label}>{label}</Text>
      <Text style={[mS.valor, color ? { color } : null]}>{valor}</Text>
    </View>
  )
}
const mS = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  icono: { fontSize: 15, width: 26 },
  label: { flex: 1, fontSize: 13, color: '#c0d0dc' },
  valor: { fontSize: 14, fontWeight: '800', color: '#fff', minWidth: 30, textAlign: 'right' },
})

function UserCard({ u, rank, maxActividad, expanded, onToggle, onPress }: {
  u: UsuarioMetricas
  rank: number
  maxActividad: number
  expanded: boolean
  onToggle: () => void
  onPress: () => void
}) {
  const st = statusConfig(u.actividad_total, maxActividad)
  const pct = maxActividad > 0 ? u.actividad_total / maxActividad : 0
  const horas = Math.floor(u.minutos_conexion / 60)
  const mins  = u.minutos_conexion % 60

  return (
    <View style={uS.card}>
      <TouchableOpacity style={uS.header} onPress={onToggle} activeOpacity={0.8}>
        {/* Rank */}
        <View style={[uS.rankBadge, rank <= 3 ? uS.rankTop : null]}>
          <Text style={[uS.rankTxt, rank <= 3 ? uS.rankTopTxt : null]}>#{rank}</Text>
        </View>

        {/* Status dot */}
        <View style={[uS.statusDot, { backgroundColor: st.color }]} />

        {/* Name + label */}
        <View style={{ flex: 1 }}>
          <Text style={uS.nombre} numberOfLines={1}>{u.nombre ?? 'Usuario'}</Text>
          <Text style={[uS.statusLabel, { color: st.color }]}>{st.emoji} {st.label}</Text>
        </View>

        {/* Quick metrics */}
        <View style={uS.quickMetrics}>
          <View style={uS.qm}><Text style={uS.qmVal}>{u.clientes_nuevos}</Text><Text style={uS.qmLbl}>clientes</Text></View>
          <View style={uS.qm}><Text style={uS.qmVal}>{u.seguimientos}</Text><Text style={uS.qmLbl}>seguim.</Text></View>
          <View style={uS.qm}><Text style={uS.qmVal}>{formatMinutos(u.minutos_conexion)}</Text><Text style={uS.qmLbl}>tiempo</Text></View>
        </View>

        <Text style={uS.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Activity bar */}
      <View style={uS.barBg}>
        <View style={[uS.barFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: st.color }]} />
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={uS.detail}>
          <View style={uS.detailGrid}>
            <View style={uS.detailCol}>
              <MetricRow icono="👥" label="Clientes nuevos"       valor={u.clientes_nuevos}        color="#1a6470" />
              <MetricRow icono="🏠" label="Propiedades public."   valor={u.propiedades_publicadas} color="#1a6470" />
              <MetricRow icono="✅" label="Seguimientos"          valor={u.seguimientos}            color="#2ecc71" />
              <MetricRow icono="💬" label="Interacciones"         valor={u.interacciones}           />
            </View>
            <View style={uS.detailCol}>
              <MetricRow icono="📅" label="Citas generadas"       valor={u.citas}                  color="#c9a84c" />
              <MetricRow icono="🎓" label="Cursos completados"    valor={u.cursos_completados}      />
              <MetricRow icono="👁️"  label="Fichas vistas"         valor={u.vistas_propiedades}      />
              <MetricRow icono="📥" label="Fotos guardadas"       valor={u.descargas_propiedades}   />
            </View>
          </View>

          {/* Tiempo */}
          <View style={uS.tiempoRow}>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>⏱ Tiempo activo</Text>
              <Text style={uS.tiempoVal}>{horas > 0 ? `${horas}h ${mins}m` : mins > 0 ? `${mins} min` : '—'}</Text>
            </View>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>🌅 Primera actividad</Text>
              <Text style={uS.tiempoVal}>{formatHora(u.primer_acceso)}</Text>
            </View>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>🌙 Última actividad</Text>
              <Text style={uS.tiempoVal}>{formatHora(u.ultimo_acceso)}</Text>
            </View>
          </View>

          {/* Score */}
          <View style={[uS.scoreRow, { backgroundColor: st.bg }]}>
            <Text style={[uS.scoreLbl, { color: st.color }]}>Puntaje de productividad</Text>
            <Text style={[uS.scoreVal, { color: st.color }]}>{u.actividad_total} pts</Text>
          </View>
        </View>
      )}
    </View>
  )
}
const uS = StyleSheet.create({
  card:       { backgroundColor: '#111f2e', borderRadius: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#1e3448' },
  header:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  rankBadge:  { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  rankTop:    { backgroundColor: '#1a1500' },
  rankTxt:    { fontSize: 11, fontWeight: '800', color: '#7a9ab5' },
  rankTopTxt: { color: '#c9a84c' },
  statusDot:  { width: 10, height: 10, borderRadius: 5 },
  nombre:     { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statusLabel:{ fontSize: 10, fontWeight: '600' },
  chevron:    { fontSize: 12, color: '#556a7a' },
  quickMetrics: { flexDirection: 'row', gap: 8 },
  qm:         { alignItems: 'center', minWidth: 42 },
  qmVal:      { fontSize: 14, fontWeight: '900', color: '#fff' },
  qmLbl:      { fontSize: 9, color: '#556a7a', marginTop: 1 },
  barBg:      { height: 3, backgroundColor: '#1e3448', marginHorizontal: 0 },
  barFill:    { height: 3, borderRadius: 0 },
  detail:     { padding: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1e3448' },
  detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  detailCol:  { flex: 1 },
  tiempoRow:  { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tiempoItem: { flex: 1, backgroundColor: '#0d1b2a', borderRadius: 8, padding: 8, alignItems: 'center' },
  tiempoLbl:  { fontSize: 9, color: '#556a7a', marginBottom: 3, textAlign: 'center' },
  tiempoVal:  { fontSize: 13, fontWeight: '800', color: '#fff', textAlign: 'center' },
  scoreRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  scoreLbl:   { fontSize: 12, fontWeight: '700' },
  scoreVal:   { fontSize: 20, fontWeight: '900' },
})

// ── HTML del reporte ──────────────────────────────────────────────────────────
function generarReporteHTML(
  usuarios: UsuarioMetricas[],
  tendencia: DiaActividad[],
  rangoLabel: string,
  generadoEn: string,
): string {
  const activos  = usuarios.filter(u => u.actividad_total > 0).length
  const inactivos = usuarios.length - activos
  const topUser  = usuarios[0]
  const totalAct = usuarios.reduce((s, u) => s + u.actividad_total, 0)
  const totalClientes = usuarios.reduce((s, u) => s + u.clientes_nuevos, 0)
  const totalSeguimientos = usuarios.reduce((s, u) => s + u.seguimientos, 0)

  const filas = usuarios.map((u, i) => {
    const st = statusConfig(u.actividad_total, usuarios[0]?.actividad_total ?? 1)
    return `
      <tr class="${i % 2 === 0 ? 'even' : ''}">
        <td>#${i+1}</td>
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

  const maxTend = Math.max(...tendencia.map(d => d.total_actividad), 1)
  const barrasTend = tendencia.slice(-14).map(d => {
    const pct = Math.round((d.total_actividad / maxTend) * 100)
    const col = d.total_actividad === 0 ? '#e5e7eb' : d.usuarios_activos >= 3 ? '#1a6470' : '#c9a84c'
    const dia = new Date(d.fecha).getDate()
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
      <div style="background:${col};height:${Math.max(pct*0.8,d.total_actividad>0?4:2)}px;width:100%;border-radius:3px;min-height:2px"></div>
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
  .header-meta{display:flex;gap:24px;margin-top:16px}
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

<div class="footer">
  Valera Real Estate · Reporte generado automáticamente · ${generadoEn}
</div>
</body></html>`
}

// ── Pantalla principal ────────────────────────────────────────────────────────
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy',        label: 'Hoy' },
  { key: 'ayer',       label: 'Ayer' },
  { key: '7dias',      label: '7 días' },
  { key: '30dias',     label: '30 días' },
  { key: 'este_mes',   label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes anterior' },
  { key: 'rango',      label: 'Rango' },
]

export default function Reportes() {
  const col = useColors()
  const [periodo, setPeriodo]       = useState<Periodo>('7dias')
  const [rangoInicio, setRangoInicio] = useState(new Date(Date.now() - 7*24*3600*1000))
  const [rangoFin, setRangoFin]       = useState(new Date())
  const [rangoInicioTxt, setRangoInicioTxt] = useState('')
  const [rangoFinTxt, setRangoFinTxt]       = useState('')
  const [usuarios, setUsuarios]   = useState<UsuarioMetricas[]>([])
  const [tendencia, setTendencia] = useState<DiaActividad[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalEmail, setModalEmail] = useState(false)
  const [emails, setEmails]         = useState('valerarealestateqro@gmail.com')
  const [exportando, setExportando] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, [periodo, rangoInicio, rangoFin]))

  async function cargar() {
    setLoading(true)
    const { inicio, fin } = getRango(periodo, rangoInicio, rangoFin)
    const [uRes, tRes] = await Promise.all([
      supabase.rpc('get_productividad_equipo', {
        p_inicio: inicio.toISOString(),
        p_fin:    fin.toISOString(),
      }),
      supabase.rpc('get_tendencia_equipo', {
        p_inicio: inicio.toISOString(),
        p_fin:    fin.toISOString(),
      }),
    ])
    setUsuarios((uRes.data as UsuarioMetricas[] | null) ?? [])
    setTendencia((tRes.data as DiaActividad[] | null) ?? [])
    setLoading(false)
  }

  function aplicarRango() {
    const i = new Date(rangoInicioTxt)
    const f = new Date(rangoFinTxt + 'T23:59:59')
    if (isNaN(i.getTime()) || isNaN(f.getTime())) { alerta('Fechas inválidas'); return }
    if (i > f) { alerta('La fecha de inicio debe ser anterior al fin'); return }
    setRangoInicio(i)
    setRangoFin(f)
  }

  function exportarPDF() {
    if (Platform.OS !== 'web') { alerta('La exportación PDF está disponible en la versión web'); return }
    setExportando(true)
    const { inicio, fin } = getRango(periodo, rangoInicio, rangoFin)
    const label = formatRangoLabel(inicio, fin)
    const generadoEn = new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })
    const html = generarReporteHTML(usuarios, tendencia, label, generadoEn)
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank')
    if (win) {
      win.addEventListener('load', () => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 60_000) })
    }
    setExportando(false)
  }

  function enviarEmail() {
    const { inicio, fin } = getRango(periodo, rangoInicio, rangoFin)
    const label = formatRangoLabel(inicio, fin)
    const top = usuarios.slice(0, 3).map((u, i) => `#${i+1} ${u.nombre ?? 'Usuario'}: ${u.actividad_total} pts`).join('\n')
    const resumen = [
      `📊 Reporte de Productividad – ${label}`,
      '',
      `👥 Usuarios activos: ${usuarios.filter(u => u.actividad_total > 0).length}/${usuarios.length}`,
      `🏆 Top performers:`,
      top,
      '',
      `📅 Clientes nuevos (equipo): ${usuarios.reduce((s,u)=>s+u.clientes_nuevos,0)}`,
      `✅ Seguimientos (equipo): ${usuarios.reduce((s,u)=>s+u.seguimientos,0)}`,
      `📅 Citas generadas (equipo): ${usuarios.reduce((s,u)=>s+u.citas,0)}`,
    ].join('\n')

    const destinos = emails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean).join(',')
    const mailto = `mailto:${destinos}?subject=${encodeURIComponent(`Reporte Productividad – ${label}`)}&body=${encodeURIComponent(resumen)}`
    if (Platform.OS === 'web') window.open(mailto, '_blank')
    else { /* React Native Linking */ alerta('Copia el resumen y envíalo manualmente.') }
    setModalEmail(false)
  }

  const { inicio, fin } = getRango(periodo, rangoInicio, rangoFin)
  const rangoLabel   = formatRangoLabel(inicio, fin)
  const maxActividad = usuarios[0]?.actividad_total ?? 0
  const activos      = usuarios.filter(u => u.actividad_total > 0).length
  const inactivos    = usuarios.length - activos
  const totalClientes = usuarios.reduce((s, u) => s + u.clientes_nuevos, 0)
  const totalSegui    = usuarios.reduce((s, u) => s + u.seguimientos, 0)

  return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a' }}>

      {/* Period selector */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.periodoScroll}
        contentContainerStyle={s.periodoRow}
      >
        {PERIODOS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[s.periodoBtn, periodo === p.key && s.periodoBtnActivo]}
            onPress={() => setPeriodo(p.key)}
          >
            <Text style={[s.periodoTxt, periodo === p.key && s.periodoTxtActivo]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Rango personalizado */}
      {periodo === 'rango' && (
        <View style={s.rangoRow}>
          <TextInput
            style={s.rangoInput}
            placeholder="Inicio  yyyy-mm-dd"
            placeholderTextColor="#556a7a"
            value={rangoInicioTxt}
            onChangeText={setRangoInicioTxt}
          />
          <Text style={{ color: '#556a7a', fontSize: 14 }}>→</Text>
          <TextInput
            style={s.rangoInput}
            placeholder="Fin  yyyy-mm-dd"
            placeholderTextColor="#556a7a"
            value={rangoFinTxt}
            onChangeText={setRangoFinTxt}
          />
          <TouchableOpacity style={s.rangoBtn} onPress={aplicarRango}>
            <Text style={s.rangoBtnTxt}>Aplicar</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1a6470" />
          <Text style={{ color: '#556a7a', marginTop: 12, fontSize: 13 }}>Cargando datos del equipo…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* Período header */}
          <View style={s.rangoHeader}>
            <Text style={s.rangoHeaderTxt}>{rangoLabel}</Text>
            <TouchableOpacity onPress={cargar} style={s.recargarBtn}>
              <Text style={s.recargarTxt}>↻ Actualizar</Text>
            </TouchableOpacity>
          </View>

          {/* KPI Cards */}
          <View style={s.kpiRow}>
            <KpiCard icono="👥" label="Usuarios activos"  valor={activos}        color="#2ecc71" sub={`${inactivos} inactivos`} />
            <KpiCard icono="🏆" label="Top performer"     valor={usuarios[0]?.nombre?.split(' ')[0] ?? '—'} color="#c9a84c" sub={`${maxActividad} pts`} />
            <KpiCard icono="👤" label="Clientes nuevos"   valor={totalClientes}  color="#1a6470" />
            <KpiCard icono="✅" label="Seguimientos"       valor={totalSegui}     color="#3498db" />
          </View>

          {/* Activity status summary */}
          <View style={s.statusRow}>
            {[
              { emoji: '🟢', label: 'Muy activos',     n: usuarios.filter(u => u.actividad_total >= maxActividad * 0.5 && u.actividad_total > 0).length },
              { emoji: '🟡', label: 'Actividad media',  n: usuarios.filter(u => u.actividad_total > 0 && u.actividad_total < maxActividad * 0.5).length },
              { emoji: '🔴', label: 'Sin actividad',    n: inactivos },
            ].map(st => (
              <View key={st.label} style={s.statusItem}>
                <Text style={s.statusEmoji}>{st.emoji}</Text>
                <Text style={s.statusN}>{st.n}</Text>
                <Text style={s.statusLbl}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Trend chart */}
          {tendencia.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Actividad diaria del equipo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: Math.max(tendencia.length * 20, 300) }}>
                  <TrendChart datos={tendencia} height={90} />
                </View>
              </ScrollView>
            </View>
          )}

          {/* Ranking de usuarios */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Ranking del equipo · {usuarios.length} usuarios</Text>
            {usuarios.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Sin datos para este período</Text>
              </View>
            ) : usuarios.map((u, i) => (
              <UserCard
                key={u.id}
                u={u}
                rank={i + 1}
                maxActividad={maxActividad}
                expanded={expandedId === u.id}
                onToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
                onPress={() => setExpandedId(u.id)}
              />
            ))}
          </View>

          {/* Métricas del equipo (resumen) */}
          {usuarios.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Totales del equipo</Text>
              <View style={s.teamCard}>
                {[
                  { icono: '👥', label: 'Clientes nuevos',       val: usuarios.reduce((s,u)=>s+u.clientes_nuevos,0) },
                  { icono: '🏠', label: 'Propiedades publicadas', val: usuarios.reduce((s,u)=>s+u.propiedades_publicadas,0) },
                  { icono: '✅', label: 'Seguimientos',           val: usuarios.reduce((s,u)=>s+u.seguimientos,0) },
                  { icono: '💬', label: 'Interacciones',          val: usuarios.reduce((s,u)=>s+u.interacciones,0) },
                  { icono: '📅', label: 'Citas generadas',        val: usuarios.reduce((s,u)=>s+u.citas,0) },
                  { icono: '🎓', label: 'Cursos completados',     val: usuarios.reduce((s,u)=>s+u.cursos_completados,0) },
                  { icono: '👁️',  label: 'Fichas vistas',          val: usuarios.reduce((s,u)=>s+u.vistas_propiedades,0) },
                  { icono: '📥', label: 'Fotos guardadas',        val: usuarios.reduce((s,u)=>s+u.descargas_propiedades,0) },
                ].map(m => (
                  <View key={m.label} style={s.teamMetric}>
                    <Text style={s.teamMetricIcn}>{m.icono}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.teamMetricLbl}>{m.label}</Text>
                    </View>
                    <Text style={s.teamMetricVal}>{m.val}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Export section */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Exportar reporte</Text>
            <View style={s.exportRow}>
              <TouchableOpacity
                style={[s.exportBtn, exportando && { opacity: 0.6 }]}
                onPress={exportarPDF}
                disabled={exportando || usuarios.length === 0}
              >
                <Text style={s.exportBtnIcn}>📄</Text>
                <Text style={s.exportBtnTxt}>Descargar PDF</Text>
                <Text style={s.exportBtnSub}>Abre vista de impresión</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.exportBtn, s.exportBtnGreen]}
                onPress={() => setModalEmail(true)}
                disabled={usuarios.length === 0}
              >
                <Text style={s.exportBtnIcn}>📧</Text>
                <Text style={s.exportBtnTxt}>Enviar por email</Text>
                <Text style={s.exportBtnSub}>Abre cliente de correo</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      )}

      {/* Modal email */}
      <Modal visible={modalEmail} transparent animationType="slide" onRequestClose={() => setModalEmail(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: col.card }]}>
            <Text style={s.modalTitle}>📧 Enviar reporte por email</Text>
            <Text style={[s.modalDesc, { color: col.textSub }]}>
              Ingresa los correos separados por coma. Se abrirá tu cliente de correo con el resumen del reporte.
            </Text>
            <Text style={[s.fieldLabel, { color: col.textSub }]}>Destinatarios</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: col.input, borderColor: col.inputBorder, color: col.inputText }]}
              value={emails}
              onChangeText={setEmails}
              placeholder="correo@empresa.com, otro@ejemplo.com"
              placeholderTextColor={col.textMute}
              keyboardType="email-address"
              autoCapitalize="none"
              multiline
            />
            <Text style={[s.modalHint, { color: col.textMute }]}>
              Período: {rangoLabel}
            </Text>
            <TouchableOpacity style={s.modalBtn} onPress={enviarEmail}>
              <Text style={s.modalBtnTxt}>📤 Abrir cliente de correo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelar} onPress={() => setModalEmail(false)}>
              <Text style={{ color: '#aaa', fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const GOLD = '#c9a84c'
const TEAL = '#1a6470'

const s = StyleSheet.create({
  periodoScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#1e3448', backgroundColor: '#0d1b2a' },
  periodoRow:    { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  periodoBtn:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#2a475e' },
  periodoBtnActivo: { backgroundColor: TEAL, borderColor: TEAL },
  periodoTxt:    { fontSize: 12, fontWeight: '600', color: '#556a7a' },
  periodoTxtActivo: { color: '#fff' },

  rangoRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#111f2e', borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  rangoInput: { flex: 1, backgroundColor: '#0d1b2a', borderRadius: 8, borderWidth: 1, borderColor: '#2a475e', paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: '#fff' },
  rangoBtn:   { backgroundColor: TEAL, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  rangoBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 12 },

  rangoHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rangoHeaderTxt:{ fontSize: 14, fontWeight: '700', color: '#7a9ab5' },
  recargarBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1e3448' },
  recargarTxt:  { fontSize: 12, color: '#c9a84c', fontWeight: '700' },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },

  statusRow:  { flexDirection: 'row', backgroundColor: '#111f2e', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  statusItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: 1, borderRightColor: '#1e3448' },
  statusEmoji:{ fontSize: 18, marginBottom: 2 },
  statusN:    { fontSize: 20, fontWeight: '900', color: '#fff' },
  statusLbl:  { fontSize: 9, color: '#556a7a', marginTop: 1, textAlign: 'center' },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#7a9ab5', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { color: '#556a7a', fontSize: 14 },

  teamCard: { backgroundColor: '#111f2e', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1e3448' },
  teamMetric: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e3448', gap: 10 },
  teamMetricIcn: { fontSize: 16, width: 24 },
  teamMetricLbl: { fontSize: 13, color: '#c0d0dc' },
  teamMetricVal: { fontSize: 16, fontWeight: '900', color: '#fff', minWidth: 36, textAlign: 'right' },

  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1, backgroundColor: TEAL, borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 4,
  },
  exportBtnGreen: { backgroundColor: '#2e7d32' },
  exportBtnIcn:   { fontSize: 24 },
  exportBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 14 },
  exportBtnSub:   { color: 'rgba(255,255,255,.65)', fontSize: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: TEAL, marginBottom: 8 },
  modalDesc:    { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  fieldLabel:   { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  modalInput:   { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  modalHint:    { fontSize: 11, marginTop: 6, marginBottom: 16 },
  modalBtn:     { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalCancelar:{ alignItems: 'center', paddingVertical: 14 },
})
