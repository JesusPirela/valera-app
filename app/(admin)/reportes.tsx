import { useState, useCallback, useRef, createElement } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Platform, Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

// ── Types ─────────────────────────────────────────────────────────────────────
type Periodo = '24h' | '7dias' | '30dias'

type UsuarioMetricas = {
  id: string
  nombre: string | null
  clientes_nuevos: number
  propiedades_publicadas: number  // total del log (cuenta repetidas)
  propiedades_unicas: number      // casas distintas publicadas
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

type ReportProgramado = {
  id: string
  frecuencia: 'diario' | 'semanal' | 'mensual'
  hora_envio: string
  dia_semana: number | null
  destinatarios: string[]
  activo: boolean
  ultimo_envio: string | null
  periodo_reporte: Periodo | null
}

// ── Constantes ────────────────────────────────────────────────────────────────
const FREQ_LABELS: Record<string, string> = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' }
const PERIODO_LABELS: Record<Periodo, string> = { '24h': '24 horas', '7dias': '7 días', '30dias': '30 días' }
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const PERIODOS: { key: Periodo; label: string; sub: string }[] = [
  { key: '24h',   label: 'Hoy',       sub: 'Desde 12:00 am' },
  { key: '7dias', label: '7 días',   sub: 'Última semana'  },
  { key: '30dias',label: '30 días',  sub: 'Último mes'     },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRango(p: Periodo): { inicio: Date; fin: Date } {
  const now = new Date()
  switch (p) {
    case '24h': {
      const i = new Date(now)
      i.setHours(0, 0, 0, 0)
      const f = new Date(now)
      f.setHours(23, 59, 59, 999)
      return { inicio: i, fin: f }
    }
    case '7dias': {
      const i = new Date(now)
      i.setDate(i.getDate() - 7)
      return { inicio: i, fin: now }
    }
    case '30dias': {
      const i = new Date(now)
      i.setDate(i.getDate() - 30)
      return { inicio: i, fin: now }
    }
  }
}

function formatMinutos(m: number) {
  if (!m) return '—'
  const h   = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h ${min}m` : `${min}m`
}

function formatAcceso(iso: string | null, periodo: Periodo) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (periodo === '24h') {
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatFechaCorta(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRangoLabel(p: Periodo, inicio: Date, fin: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  switch (p) {
    case '24h':    return `Últimas 24 horas · ${inicio.toLocaleDateString('es-MX', opts)} – ${fin.toLocaleDateString('es-MX', opts)}`
    case '7dias':  return `Últimos 7 días · ${inicio.toLocaleDateString('es-MX', opts)} – ${fin.toLocaleDateString('es-MX', opts)}`
    case '30dias': return `Últimos 30 días · ${inicio.toLocaleDateString('es-MX', opts)} – ${fin.toLocaleDateString('es-MX', opts)}`
  }
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
  card:  { flex: 1, backgroundColor: '#111f2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, minWidth: 80 },
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
          const pct  = d.total_actividad / maxVal
          const barH = Math.max(pct * height, d.total_actividad > 0 ? 4 : 2)
          const col  = d.total_actividad === 0 ? '#1e3448' : d.usuarios_activos >= 3 ? '#1a6470' : '#c9a84c'
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

function UserCard({ u, rank, maxActividad, expanded, onToggle, periodo }: {
  u: UsuarioMetricas
  rank: number
  maxActividad: number
  expanded: boolean
  onToggle: () => void
  periodo: Periodo
}) {
  const st   = statusConfig(u.actividad_total, maxActividad)
  const pct  = maxActividad > 0 ? u.actividad_total / maxActividad : 0
  const horas = Math.floor(u.minutos_conexion / 60)
  const mins  = u.minutos_conexion % 60

  return (
    <View style={uS.card}>
      <TouchableOpacity style={uS.header} onPress={onToggle} activeOpacity={0.8}>
        <View style={[uS.rankBadge, rank <= 3 ? uS.rankTop : null]}>
          <Text style={[uS.rankTxt, rank <= 3 ? uS.rankTopTxt : null]}>#{rank}</Text>
        </View>
        <View style={[uS.statusDot, { backgroundColor: st.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={uS.nombre} numberOfLines={1}>{u.nombre ?? 'Usuario'}</Text>
          <Text style={[uS.statusLabel, { color: st.color }]}>{st.emoji} {st.label}</Text>
        </View>
        <View style={uS.quickMetrics}>
          <View style={uS.qm}><Text style={uS.qmVal}>{u.clientes_nuevos}</Text><Text style={uS.qmLbl}>clientes</Text></View>
          <View style={uS.qm}><Text style={uS.qmVal}>{u.seguimientos}</Text><Text style={uS.qmLbl}>seguim.</Text></View>
          <View style={uS.qm}><Text style={uS.qmVal}>{formatMinutos(u.minutos_conexion)}</Text><Text style={uS.qmLbl}>tiempo</Text></View>
        </View>
        <Text style={uS.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      <View style={uS.barBg}>
        <View style={[uS.barFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: st.color }]} />
      </View>

      {expanded && (
        <View style={uS.detail}>
          <View style={uS.detailGrid}>
            <View style={uS.detailCol}>
              <MetricRow icono="👥" label="Clientes nuevos"       valor={u.clientes_nuevos}        color="#1a6470" />
              <MetricRow icono="📤" label="Publicaciones"         valor={u.propiedades_publicadas} color="#1a6470" />
              <MetricRow icono="🏠" label="Propiedades"           valor={u.propiedades_unicas}     color="#1a9aaa" />
              <MetricRow icono="✅" label="Seguimientos"          valor={u.seguimientos}            color="#2ecc71" />
            </View>
            <View style={uS.detailCol}>
              <MetricRow icono="📅" label="Citas generadas"       valor={u.citas}                  color="#c9a84c" />
              <MetricRow icono="🎓" label="Cursos completados"    valor={u.cursos_completados}      />
              <MetricRow icono="👁️"  label="Propiedades vistas"         valor={u.vistas_propiedades}      />
              <MetricRow icono="📥" label="Propiedades descargadas"       valor={u.descargas_propiedades}   />
            </View>
          </View>
          <View style={uS.tiempoRow}>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>⏱ Tiempo activo</Text>
              <Text style={uS.tiempoVal}>{horas > 0 ? `${horas}h ${mins}m` : mins > 0 ? `${mins} min` : '—'}</Text>
            </View>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>🌅 Primera actividad</Text>
              <Text style={uS.tiempoVal}>{formatAcceso(u.primer_acceso, periodo)}</Text>
            </View>
            <View style={uS.tiempoItem}>
              <Text style={uS.tiempoLbl}>🌙 Última actividad</Text>
              <Text style={uS.tiempoVal}>{formatAcceso(u.ultimo_acceso, periodo)}</Text>
            </View>
          </View>
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
  barBg:      { height: 3, backgroundColor: '#1e3448' },
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

// ── HTML del reporte (para PDF web) ──────────────────────────────────────────
function generarReporteHTML(
  usuarios: UsuarioMetricas[],
  tendencia: DiaActividad[],
  rangoLabel: string,
  generadoEn: string,
): string {
  const activos        = usuarios.filter(u => u.actividad_total > 0).length
  const inactivos      = usuarios.length - activos
  const topUser        = usuarios[0]
  const totalAct       = usuarios.reduce((s, u) => s + u.actividad_total, 0)
  const totalClientes  = usuarios.reduce((s, u) => s + u.clientes_nuevos, 0)
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
        <td class="center">${u.propiedades_unicas}</td>
        <td class="center">${u.seguimientos}</td>
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
      <th class="center">Clientes</th><th class="center">Public.</th>
      <th class="center">Propied.</th><th class="center">Seguim.</th>
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
export default function Reportes() {
  const col = useColors()
  const [periodo, setPeriodo] = useState<Periodo>('24h')
  const [usuarios, setUsuarios]   = useState<UsuarioMetricas[]>([])
  const [tendencia, setTendencia] = useState<DiaActividad[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  // Email inmediato
  const [modalEmail, setModalEmail]   = useState(false)
  const [emails, setEmails]           = useState('valerarealestateqro@gmail.com')
  const [enviando, setEnviando]       = useState(false)
  const [enviandoMsg, setEnviandoMsg] = useState('')

  // Programaciones
  const [programados, setProgramados]     = useState<ReportProgramado[]>([])
  const [modalSchedule, setModalSchedule] = useState(false)
  const [schedFreq, setSchedFreq]       = useState<'diario' | 'semanal' | 'mensual'>('diario')
  const [schedHora, setSchedHora]       = useState('09:00')
  const [schedDia, setSchedDia]         = useState(1)
  const [schedEmails, setSchedEmails]   = useState('valerarealestateqro@gmail.com')
  const [schedPeriodo, setSchedPeriodo] = useState<Periodo>('7dias')

  const yaCargoRef = useRef(false)

  useFocusEffect(useCallback(() => { setPeriodo('24h'); cargar('24h'); cargarProgramados() }, []))
  const { refreshControl } = usePullRefresh(async () => { await Promise.all([cargar(periodo), cargarProgramados()]) })

  async function cargar(p: Periodo = periodo) {
    if (!yaCargoRef.current) setLoading(true)
    const { inicio, fin } = getRango(p)
    const [uRes, tRes] = await Promise.all([
      supabase.rpc('get_productividad_equipo', { p_inicio: inicio.toISOString(), p_fin: fin.toISOString() }),
      supabase.rpc('get_tendencia_equipo',     { p_inicio: inicio.toISOString(), p_fin: fin.toISOString() }),
    ])
    setUsuarios((uRes.data as UsuarioMetricas[] | null) ?? [])
    setTendencia((tRes.data as DiaActividad[] | null) ?? [])
    yaCargoRef.current = true
    setLoading(false)
  }

  async function cargarProgramados() {
    const { data } = await supabase
      .from('report_programados')
      .select('*')
      .eq('activo', true)
      .order('created_at')
    setProgramados((data as ReportProgramado[] | null) ?? [])
  }

  function exportarPDF() {
    if (Platform.OS !== 'web') { alerta('La exportación PDF está disponible en la versión web'); return }
    setExportando(true)
    const { inicio, fin } = getRango(periodo)
    const label       = formatRangoLabel(periodo, inicio, fin)
    const generadoEn  = new Date().toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })
    const html  = generarReporteHTML(usuarios, tendencia, label, generadoEn)
    const blob  = new Blob([html], { type: 'text/html' })
    const url   = URL.createObjectURL(blob)
    const win   = window.open(url, '_blank')
    if (win) {
      win.addEventListener('load', () => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 60_000) })
    }
    setExportando(false)
  }

  async function enviarEmailConFuncion() {
    const { inicio, fin } = getRango(periodo)
    const label    = formatRangoLabel(periodo, inicio, fin)
    const destinos = emails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean)
    if (!destinos.length) { alerta('Ingresa al menos un destinatario'); return }

    setEnviando(true)
    setEnviandoMsg('Generando reporte…')
    try {
      const { data, error } = await supabase.functions.invoke('enviar-reporte', {
        body: {
          destinatarios: destinos,
          rangoInicio:   inicio.toISOString(),
          rangoFin:      fin.toISOString(),
          rangoLabel:    label,
        },
      })
      if (error) throw error
      if ((data as any)?.error) throw new Error((data as any).error)
      setModalEmail(false)
      alerta(`✅ Reporte enviado a ${destinos.length} destinatario${destinos.length > 1 ? 's' : ''}`)
    } catch (err: any) {
      alerta('Error al enviar: ' + (err.message ?? 'Intenta de nuevo'))
    } finally {
      setEnviando(false)
      setEnviandoMsg('')
    }
  }

  async function guardarProgramado() {
    const hora = schedHora.trim()
    if (!/^\d{1,2}:\d{2}$/.test(hora)) { alerta('Formato de hora inválido. Usa HH:MM (ej. 09:00)'); return }
    const destinos = schedEmails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean)
    if (!destinos.length) { alerta('Ingresa al menos un destinatario'); return }

    const { data: { user } } = await getUsuarioActual()
    if (!user) { alerta('No autenticado'); return }

    const { error } = await supabase.from('report_programados').insert({
      admin_id:        user.id,
      frecuencia:      schedFreq,
      hora_envio:      hora,
      dia_semana:      schedFreq === 'semanal' ? schedDia : null,
      destinatarios:   destinos,
      activo:          true,
      periodo_reporte: schedPeriodo,
    })

    if (error) { alerta('Error al guardar: ' + error.message); return }
    await cargarProgramados()
    setModalSchedule(false)
    alerta(`✅ Programación guardada · ${FREQ_LABELS[schedFreq]} a las ${hora} · Reporte ${PERIODO_LABELS[schedPeriodo]}`)
  }

  async function eliminarProgramado(id: string) {
    await supabase.from('report_programados').update({ activo: false }).eq('id', id)
    setProgramados(prev => prev.filter(p => p.id !== id))
  }

  const { inicio, fin } = getRango(periodo)
  const rangoLabel    = formatRangoLabel(periodo, inicio, fin)
  const maxActividad  = usuarios[0]?.actividad_total ?? 0
  const activos       = usuarios.filter(u => u.actividad_total > 0).length
  const inactivos     = usuarios.length - activos
  const totalClientes = usuarios.reduce((s, u) => s + u.clientes_nuevos, 0)
  const totalSegui    = usuarios.reduce((s, u) => s + u.seguimientos, 0)

  return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a' }}>

      {/* ── Header con botón de regreso ── */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle}>Reportes</Text>
        <View style={{ width: 90 }} />
      </View>

      {/* ── Selector de período: 3 tabs prominentes ── */}
      <View style={s.tabsContainer}>
        {PERIODOS.map(p => {
          const activo = periodo === p.key
          return (
            <TouchableOpacity
              key={p.key}
              style={[s.tab, activo && s.tabActivo]}
              onPress={() => { if (!activo) { setPeriodo(p.key); cargar(p.key); cargarProgramados() } }}
              activeOpacity={0.75}
            >
              <Text style={[s.tabLabel, activo && s.tabLabelActivo]}>{p.label}</Text>
              <Text style={[s.tabSub, activo && s.tabSubActivo]}>{p.sub}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1a6470" />
          <Text style={{ color: '#556a7a', marginTop: 12, fontSize: 13 }}>Cargando datos del equipo…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>

          {/* Período header */}
          <View style={s.rangoHeader}>
            <Text style={s.rangoHeaderTxt}>{rangoLabel}</Text>
            {/* () => cargar(): pasar `cargar` directo metía el evento del tap
                como si fuera el periodo y rompía la recarga. */}
            <TouchableOpacity onPress={() => cargar()} style={s.recargarBtn}>
              <Text style={s.recargarTxt}>↻ Actualizar</Text>
            </TouchableOpacity>
          </View>

          {/* ── EXPORTAR Y PROGRAMAR ── */}
          <View style={s.exportTopCard}>
            <View style={s.exportTopHeader}>
              <Text style={s.exportTopTitle}>📤 Exportar reporte</Text>
              {programados.length > 0 && (
                <View style={s.schedBadge}>
                  <Text style={s.schedBadgeTxt}>⏰ {programados.length} activa{programados.length > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>

            <View style={s.exportRow}>
              <TouchableOpacity
                style={[s.exportBtn, exportando && { opacity: 0.6 }]}
                onPress={exportarPDF}
                disabled={exportando || usuarios.length === 0}
              >
                <Text style={s.exportBtnIcn}>📄</Text>
                <Text style={s.exportBtnTxt}>PDF</Text>
                <Text style={s.exportBtnSub}>Imprimir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.exportBtn, s.exportBtnGreen]}
                onPress={() => setModalEmail(true)}
                disabled={usuarios.length === 0}
              >
                <Text style={s.exportBtnIcn}>📧</Text>
                <Text style={s.exportBtnTxt}>Enviar</Text>
                <Text style={s.exportBtnSub}>Email ahora</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.exportBtn, s.exportBtnGold]}
                onPress={() => setModalSchedule(true)}
              >
                <Text style={s.exportBtnIcn}>⏰</Text>
                <Text style={s.exportBtnTxt}>Programar</Text>
                <Text style={s.exportBtnSub}>Automático</Text>
              </TouchableOpacity>
            </View>

            {programados.map(p => (
              <View key={p.id} style={s.schedItem}>
                <Text style={s.schedItemEmoji}>
                  {p.frecuencia === 'diario' ? '📅' : p.frecuencia === 'semanal' ? '📆' : '🗓️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.schedItemTitulo}>
                    {FREQ_LABELS[p.frecuencia]} · {p.hora_envio}
                    {p.frecuencia === 'semanal' ? ` · ${DIAS_SEMANA[p.dia_semana ?? 1]}` : ''}
                    {` · ${PERIODO_LABELS[p.periodo_reporte ?? '7dias']}`}
                  </Text>
                  <Text style={s.schedItemDest} numberOfLines={1}>{p.destinatarios.join(', ')}</Text>
                  {p.ultimo_envio && (
                    <Text style={s.schedItemUltimo}>Último envío: {formatFechaCorta(p.ultimo_envio)}</Text>
                  )}
                </View>
                <TouchableOpacity style={s.schedDeleteBtn} onPress={() => eliminarProgramado(p.id)}>
                  <Text style={{ fontSize: 18 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
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
              { emoji: '🟢', label: 'Muy activos',    n: usuarios.filter(u => u.actividad_total >= maxActividad * 0.5 && u.actividad_total > 0).length },
              { emoji: '🟡', label: 'Act. media',      n: usuarios.filter(u => u.actividad_total > 0 && u.actividad_total < maxActividad * 0.5).length },
              { emoji: '🔴', label: 'Sin actividad',   n: inactivos },
            ].map(st => (
              <View key={st.label} style={s.statusItem}>
                <Text style={s.statusEmoji}>{st.emoji}</Text>
                <Text style={s.statusN}>{st.n}</Text>
                <Text style={s.statusLbl}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Trend chart — solo para 7 y 30 días */}
          {periodo !== '24h' && tendencia.length > 0 && (
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
                periodo={periodo}
              />
            ))}
          </View>

          {/* Totales del equipo */}
          {usuarios.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Totales del equipo</Text>
              <View style={s.teamCard}>
                {[
                  { icono: '👥', label: 'Clientes nuevos',        val: usuarios.reduce((a,u)=>a+u.clientes_nuevos,0) },
                  { icono: '📤', label: 'Publicaciones',           val: usuarios.reduce((a,u)=>a+u.propiedades_publicadas,0) },
                  { icono: '🏠', label: 'Propiedades únicas',      val: usuarios.reduce((a,u)=>a+u.propiedades_unicas,0) },
                  { icono: '✅', label: 'Seguimientos',            val: usuarios.reduce((a,u)=>a+u.seguimientos,0) },
                  { icono: '📅', label: 'Citas generadas',         val: usuarios.reduce((a,u)=>a+u.citas,0) },
                  { icono: '🎓', label: 'Cursos completados',      val: usuarios.reduce((a,u)=>a+u.cursos_completados,0) },
                  { icono: '👁️',  label: 'Propiedades vistas',           val: usuarios.reduce((a,u)=>a+u.vistas_propiedades,0) },
                  { icono: '📥', label: 'Propiedades descargadas',         val: usuarios.reduce((a,u)=>a+u.descargas_propiedades,0) },
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

        </ScrollView>
      )}

      {/* ── Modal: Enviar email ── */}
      <Modal visible={modalEmail} transparent animationType="slide" onRequestClose={() => !enviando && setModalEmail(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: col.card }]}>
            <Text style={s.modalTitle}>📧 Enviar reporte por email</Text>

            {enviando ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator size="large" color="#1a6470" />
                <Text style={{ color: col.textSub, marginTop: 12, fontSize: 14 }}>{enviandoMsg || 'Enviando…'}</Text>
              </View>
            ) : (
              <>
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
                <TouchableOpacity style={s.modalBtn} onPress={enviarEmailConFuncion} disabled={usuarios.length === 0}>
                  <Text style={s.modalBtnTxt}>📤 Enviar reporte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalCancelar} onPress={() => setModalEmail(false)}>
                  <Text style={{ color: '#aaa', fontSize: 14 }}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Programar envío automático ── */}
      <Modal visible={modalSchedule} transparent animationType="slide" onRequestClose={() => setModalSchedule(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: col.card }]}>
            <Text style={s.modalTitle}>⏰ Programar envío automático</Text>

            <Text style={[s.fieldLabel, { color: col.textSub }]}>Frecuencia</Text>
            <View style={s.freqRow}>
              {(['diario', 'semanal', 'mensual'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[s.freqBtn, schedFreq === f && s.freqBtnActivo]}
                  onPress={() => setSchedFreq(f)}
                >
                  <Text style={[s.freqBtnTxt, schedFreq === f && s.freqBtnTxtActivo]}>{FREQ_LABELS[f]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {schedFreq === 'semanal' && (
              <>
                <Text style={[s.fieldLabel, { color: col.textSub }]}>Día de la semana</Text>
                <View style={s.diasRow}>
                  {DIAS_SEMANA.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.diaBtn, schedDia === i && s.diaBtnActivo]}
                      onPress={() => setSchedDia(i)}
                    >
                      <Text style={[s.diaBtnTxt, schedDia === i && s.diaBtnTxtActivo]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={[s.fieldLabel, { color: col.textSub }]}>Período del reporte</Text>
            <View style={s.freqRow}>
              {PERIODOS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.freqBtn, schedPeriodo === p.key && s.freqBtnActivo]}
                  onPress={() => setSchedPeriodo(p.key)}
                >
                  <Text style={[s.freqBtnTxt, schedPeriodo === p.key && s.freqBtnTxtActivo]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: col.textSub }]}>Hora de envío</Text>
            {Platform.OS === 'web' ? (
              createElement('input', {
                type: 'time',
                value: schedHora,
                onChange: (e: any) => setSchedHora(e.target.value),
                style: {
                  background: '#0d1b2a',
                  border: '1px solid #2a475e',
                  borderRadius: 10,
                  color: '#ffffff',
                  colorScheme: 'dark',
                  fontSize: 15,
                  fontWeight: '700',
                  padding: '10px 14px',
                  width: '100%',
                  marginBottom: 4,
                  outline: 'none',
                  cursor: 'pointer',
                },
              })
            ) : (
              <TextInput
                style={[s.modalInput, { backgroundColor: col.input, borderColor: col.inputBorder, color: col.inputText }]}
                value={schedHora}
                onChangeText={setSchedHora}
                placeholder="09:00"
                placeholderTextColor={col.textMute}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            )}
            <Text style={[s.modalHint, { color: col.textMute }]}>Hora de México (CST)</Text>

            <Text style={[s.fieldLabel, { color: col.textSub }]}>Destinatarios</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: col.input, borderColor: col.inputBorder, color: col.inputText }]}
              value={schedEmails}
              onChangeText={setSchedEmails}
              placeholder="correo@empresa.com, otro@ejemplo.com"
              placeholderTextColor={col.textMute}
              keyboardType="email-address"
              autoCapitalize="none"
              multiline
            />

            <TouchableOpacity style={s.modalBtn} onPress={guardarProgramado}>
              <Text style={s.modalBtnTxt}>💾 Guardar programación</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelar} onPress={() => setModalSchedule(false)}>
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
  // ── Header con regreso ──
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1b2a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3448',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  // ── Tabs de período ──
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0d1b2a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3448',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 0,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a475e',
    backgroundColor: '#111f2e',
    marginBottom: 10,
  },
  tabActivo: {
    backgroundColor: TEAL,
    borderColor: TEAL,
    shadowColor: TEAL,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tabLabel:      { fontSize: 14, fontWeight: '800', color: '#556a7a' },
  tabLabelActivo:{ color: '#fff' },
  tabSub:        { fontSize: 9, color: '#2a475e', marginTop: 2, fontWeight: '600' },
  tabSubActivo:  { color: 'rgba(255,255,255,.65)' },

  rangoHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rangoHeaderTxt:{ fontSize: 12, fontWeight: '700', color: '#7a9ab5' },
  recargarBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1e3448' },
  recargarTxt:   { fontSize: 12, color: GOLD, fontWeight: '700' },

  // ── Export top card ──
  exportTopCard:   { backgroundColor: '#111f2e', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1e3448' },
  exportTopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  exportTopTitle:  { fontSize: 12, fontWeight: '800', color: '#7a9ab5', textTransform: 'uppercase', letterSpacing: 0.5 },
  schedBadge:      { backgroundColor: '#1a1200', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + '44' },
  schedBadgeTxt:   { fontSize: 10, color: GOLD, fontWeight: '700' },

  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  exportBtn: {
    flex: 1, backgroundColor: TEAL, borderRadius: 12,
    padding: 12, alignItems: 'center', gap: 3,
  },
  exportBtnGreen: { backgroundColor: '#2e7d32' },
  exportBtnGold:  { backgroundColor: '#7a4f00' },
  exportBtnIcn:   { fontSize: 22 },
  exportBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 13 },
  exportBtnSub:   { color: 'rgba(255,255,255,.65)', fontSize: 9 },

  schedItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0d1b2a', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#1e3448' },
  schedItemEmoji:  { fontSize: 20 },
  schedItemTitulo: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 2 },
  schedItemDest:   { fontSize: 11, color: '#7a9ab5' },
  schedItemUltimo: { fontSize: 10, color: '#556a7a', marginTop: 2 },
  schedDeleteBtn:  { padding: 6 },

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

  teamCard:      { backgroundColor: '#111f2e', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1e3448' },
  teamMetric:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e3448', gap: 10 },
  teamMetricIcn: { fontSize: 16, width: 24 },
  teamMetricLbl: { fontSize: 13, color: '#c0d0dc' },
  teamMetricVal: { fontSize: 16, fontWeight: '900', color: '#fff', minWidth: 36, textAlign: 'right' },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: TEAL, marginBottom: 14 },
  fieldLabel:   { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  modalInput:   { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 48, textAlignVertical: 'top', marginBottom: 4 },
  modalHint:    { fontSize: 11, marginBottom: 14 },
  modalBtn:     { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalBtnTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalCancelar:{ alignItems: 'center', paddingVertical: 14 },

  freqRow:          { flexDirection: 'row', gap: 8, marginBottom: 14 },
  freqBtn:          { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2a475e', backgroundColor: '#0d1b2a' },
  freqBtnActivo:    { backgroundColor: TEAL, borderColor: TEAL },
  freqBtnTxt:       { fontSize: 12, fontWeight: '600', color: '#556a7a' },
  freqBtnTxtActivo: { color: '#fff' },
  diasRow:          { flexDirection: 'row', gap: 4, marginBottom: 14 },
  diaBtn:           { flex: 1, borderRadius: 6, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: '#2a475e', backgroundColor: '#0d1b2a' },
  diaBtnActivo:     { backgroundColor: TEAL, borderColor: TEAL },
  diaBtnTxt:        { fontSize: 9, fontWeight: '600', color: '#556a7a' },
  diaBtnTxtActivo:  { color: '#fff' },
})
