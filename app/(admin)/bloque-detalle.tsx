import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })

// ── Types ───────────────────────────────────────────────────────────────────
type Periodo = '24h' | '7dias' | '30dias'

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
  notas_bloque: string | null
  contesto_fecha: string | null
  contesto_ok: boolean
}

const GOLD = '#c9a84c'
const TEAL = '#1a6470'

const PERIODOS: { key: Periodo; label: string; sub: string }[] = [
  { key: '24h',    label: 'Hoy',    sub: 'Desde 12:00 am' },
  { key: '7dias',  label: '7 días', sub: 'Última semana'  },
  { key: '30dias', label: '30 días',sub: 'Último mes'     },
]

// ── Helpers ─────────────────────────────────────────────────────────────────
function getRango(p: Periodo): { inicio: Date; fin: Date } {
  const now = new Date()
  if (p === '24h') {
    const i = new Date(now); i.setHours(0, 0, 0, 0)
    const f = new Date(now); f.setHours(23, 59, 59, 999)
    return { inicio: i, fin: f }
  }
  const i = new Date(now)
  i.setDate(i.getDate() - (p === '7dias' ? 7 : 30))
  return { inicio: i, fin: now }
}

function formatMinutos(m: number) {
  if (!m) return '—'
  const h = Math.floor(m / 60), min = m % 60
  return h > 0 ? `${h}h ${min}m` : `${min}m`
}

function formatAcceso(iso: string | null, periodo: Periodo) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (periodo === '24h') return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRangoLabel(p: Periodo, inicio: Date, fin: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const pref = p === '24h' ? 'Últimas 24 horas' : p === '7dias' ? 'Últimos 7 días' : 'Últimos 30 días'
  return `${pref} · ${inicio.toLocaleDateString('es-MX', opts)} – ${fin.toLocaleDateString('es-MX', opts)}`
}

function statusConfig(act: number, max: number) {
  if (act === 0) return { emoji: '🔴', label: 'Sin actividad', color: '#e74c3c', bg: '#1f0a0a' }
  if (max > 0 && act >= max * 0.5) return { emoji: '🟢', label: 'Muy activo', color: '#2ecc71', bg: '#0d2018' }
  return { emoji: '🟡', label: 'Actividad media', color: '#f39c12', bg: '#1a1200' }
}

// ── Subcomponentes ──────────────────────────────────────────────────────────
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

function UserCard({ u, rank, maxActividad, expanded, onToggle, periodo,
  notaEdit, onNotaChange, onNotaGuardar, notaGuardando,
  contestoGuardando, onToggleContesto,
}: {
  u: UsuarioMetricas; rank: number; maxActividad: number; expanded: boolean; onToggle: () => void; periodo: Periodo
  notaEdit: string; onNotaChange: (v: string) => void; onNotaGuardar: () => void; notaGuardando: boolean
  contestoGuardando: boolean; onToggleContesto: () => void
}) {
  const st = statusConfig(u.actividad_total, maxActividad)
  const pct = maxActividad > 0 ? u.actividad_total / maxActividad : 0
  const horas = Math.floor(u.minutos_conexion / 60), mins = u.minutos_conexion % 60
  const contestoHoy = u.contesto_fecha === hoyISO() && u.contesto_ok
  const notaCambio = notaEdit !== (u.notas_bloque ?? '')

  return (
    <View style={uS.card}>
      {/* ── Header (toca para expandir métricas) ── */}
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

      {/* ── Feedback strip — siempre visible ── */}
      <View style={uS.feedbackStrip}>
        {/* ¿Contestó hoy? — botones Sí / No */}
        {periodo === '24h' && (
          <View style={uS.contestoGroup}>
            <Text style={uS.contestoLbl}>¿Hoy?</Text>
            {contestoGuardando
              ? <ActivityIndicator size="small" color="#2ecc71" style={{ marginHorizontal: 4 }} />
              : <>
                  <TouchableOpacity
                    style={[uS.contestoBtn, contestoHoy && uS.contestoBtnSi]}
                    onPress={() => { if (!contestoHoy) onToggleContesto() }}
                  >
                    <Text style={[uS.contestoBtnTxt, contestoHoy && uS.contestoBtnTxtSi]}>✓ Sí</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[uS.contestoBtn, !contestoHoy && uS.contestoBtnNo]}
                    onPress={() => { if (contestoHoy) onToggleContesto() }}
                  >
                    <Text style={[uS.contestoBtnTxt, !contestoHoy && uS.contestoBtnTxtNo]}>✗ No</Text>
                  </TouchableOpacity>
                </>}
          </View>
        )}

        {/* Nota inline */}
        <View style={uS.notaInlineWrap}>
          <TextInput
            style={uS.notaInline}
            placeholder="Nota..."
            placeholderTextColor="#3a5468"
            value={notaEdit}
            onChangeText={onNotaChange}
            onBlur={() => { if (notaCambio) onNotaGuardar() }}
            returnKeyType="done"
            onSubmitEditing={() => { if (notaCambio) onNotaGuardar() }}
          />
          {notaCambio && (
            <TouchableOpacity
              style={[uS.notaSaveBtn, { opacity: notaGuardando ? 0.5 : 1 }]}
              onPress={onNotaGuardar}
              disabled={notaGuardando}
            >
              {notaGuardando
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={uS.notaSaveTxt}>✓</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Detalle expandido — solo métricas (como antes) ── */}
      {expanded && (
        <View style={uS.detail}>
          <View style={uS.detailGrid}>
            <View style={uS.detailCol}>
              <MetricRow icono="👥" label="Clientes nuevos"     valor={u.clientes_nuevos}        color="#1a6470" />
              <MetricRow icono="🏠" label="Propiedades public." valor={u.propiedades_publicadas} color="#1a6470" />
              <MetricRow icono="✅" label="Seguimientos"        valor={u.seguimientos}            color="#2ecc71" />
              <MetricRow icono="💬" label="Interacciones"       valor={u.interacciones}           />
            </View>
            <View style={uS.detailCol}>
              <MetricRow icono="📅" label="Citas generadas"     valor={u.citas}                  color="#c9a84c" />
              <MetricRow icono="🎓" label="Cursos completados"  valor={u.cursos_completados}      />
              <MetricRow icono="👁️"  label="Fichas vistas"       valor={u.vistas_propiedades}      />
              <MetricRow icono="📥" label="Fotos guardadas"     valor={u.descargas_propiedades}   />
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
  barFill:    { height: 3 },

  // Feedback strip — siempre visible debajo del header
  feedbackStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    borderTopWidth: 1, borderTopColor: '#182636',
    backgroundColor: '#0d1b2a',
  },
  contestoGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contestoLbl:   { fontSize: 11, color: '#556a7a', fontWeight: '600', marginRight: 2 },
  contestoBtn:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#2a475e' },
  contestoBtnSi: { backgroundColor: '#1a3d1a', borderColor: '#2ecc71' },
  contestoBtnNo: { backgroundColor: '#2a1a1a', borderColor: '#e74c3c' },
  contestoBtnTxt:    { fontSize: 11, fontWeight: '700', color: '#556a7a' },
  contestoBtnTxtSi:  { color: '#2ecc71' },
  contestoBtnTxtNo:  { color: '#e74c3c' },

  notaInlineWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notaInline: {
    flex: 1, height: 28, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: '#111f2e', borderWidth: 1, borderColor: '#1e3448',
    borderRadius: 6, fontSize: 12, color: '#c0d0dc',
  },
  notaSaveBtn: {
    width: 28, height: 28, backgroundColor: '#1a6470', borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  notaSaveTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },

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

// ── Pantalla ────────────────────────────────────────────────────────────────
export default function BloqueDetalle() {
  useSupervisorBlock()
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const [periodo, setPeriodo] = useState<Periodo>('24h')
  const [usuarios, setUsuarios] = useState<UsuarioMetricas[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notasEdit, setNotasEdit] = useState<Record<string, string>>({})
  const [notasGuardando, setNotasGuardando] = useState<Set<string>>(new Set())
  const [contestoGuardando, setContesoGuardando] = useState<Set<string>>(new Set())
  const yaCargoRef = useRef(false)

  useFocusEffect(useCallback(() => { setPeriodo('24h'); cargar('24h') }, []))

  async function cargar(p: Periodo) {
    if (!yaCargoRef.current) setLoading(true)
    const { inicio, fin } = getRango(p)
    const [miembrosRes, prodRes] = await Promise.all([
      supabase.from('profiles').select('id, notas_bloque, contesto_fecha, contesto_ok').eq('bloque_id', id),
      supabase.rpc('get_productividad_equipo', { p_inicio: inicio.toISOString(), p_fin: fin.toISOString() }),
    ])
    const perfilMap: Record<string, { notas_bloque: string | null; contesto_fecha: string | null; contesto_ok: boolean }> = {}
    for (const m of (miembrosRes.data ?? []) as any[]) {
      perfilMap[m.id] = { notas_bloque: m.notas_bloque ?? null, contesto_fecha: m.contesto_fecha ?? null, contesto_ok: m.contesto_ok ?? false }
    }
    const ids = new Set(Object.keys(perfilMap))
    const todos = (prodRes.data as UsuarioMetricas[] | null) ?? []
    const delBloque = todos
      .filter((u) => ids.has(u.id))
      .map((u) => ({ ...u, ...(perfilMap[u.id] ?? { notas_bloque: null, contesto_fecha: null, contesto_ok: false }) }))
      .sort((a, b) => b.actividad_total - a.actividad_total)
    setUsuarios(delBloque)
    setNotasEdit(prev => {
      const n: Record<string, string> = {}
      for (const u of delBloque) n[u.id] = prev[u.id] ?? (u.notas_bloque ?? '')
      return n
    })
    yaCargoRef.current = true
    setLoading(false)
  }

  async function guardarNota(userId: string) {
    const nota = (notasEdit[userId] ?? '').trim()
    setNotasGuardando(prev => new Set([...prev, userId]))
    const { error } = await supabase.rpc('guardar_nota_bloque', { p_user_id: userId, p_nota: nota })
    if (!error) setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, notas_bloque: nota || null } : u))
    setNotasGuardando(prev => { const n = new Set(prev); n.delete(userId); return n })
  }

  async function toggleContesto(userId: string, valorActual: boolean) {
    const nuevoValor = !valorActual
    setContesoGuardando(prev => new Set([...prev, userId]))
    setUsuarios(prev => prev.map(u =>
      u.id === userId ? { ...u, contesto_ok: nuevoValor, contesto_fecha: nuevoValor ? hoyISO() : null } : u
    ))
    const { error } = await supabase.rpc('marcar_contesto_hoy', { p_user_id: userId, p_ok: nuevoValor })
    if (error) {
      setUsuarios(prev => prev.map(u =>
        u.id === userId ? { ...u, contesto_ok: valorActual, contesto_fecha: valorActual ? hoyISO() : null } : u
      ))
    }
    setContesoGuardando(prev => { const n = new Set(prev); n.delete(userId); return n })
  }

  const { inicio, fin } = getRango(periodo)
  const rangoLabel = formatRangoLabel(periodo, inicio, fin)
  const maxActividad = usuarios[0]?.actividad_total ?? 0
  const activos = usuarios.filter((u) => u.actividad_total > 0).length
  const inactivos = usuarios.length - activos
  const totalClientes = usuarios.reduce((s, u) => s + u.clientes_nuevos, 0)
  const totalSegui = usuarios.reduce((s, u) => s + u.seguimientos, 0)

  return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a' }}>
      {/* Header */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle} numberOfLines={1}>🧩 {nombre ?? 'Bloque'}</Text>
        <View style={{ width: 90 }} />
      </View>

      {/* Tabs de período */}
      <View style={s.tabsContainer}>
        {PERIODOS.map((p) => {
          const activo = periodo === p.key
          return (
            <TouchableOpacity key={p.key} style={[s.tab, activo && s.tabActivo]} onPress={() => { if (!activo) setPeriodo(p.key) }} activeOpacity={0.75}>
              <Text style={[s.tabLabel, activo && s.tabLabelActivo]}>{p.label}</Text>
              <Text style={[s.tabSub, activo && s.tabSubActivo]}>{p.sub}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1a6470" />
          <Text style={{ color: '#556a7a', marginTop: 12, fontSize: 13 }}>Cargando estadísticas del bloque…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <View style={s.rangoHeader}>
            <Text style={s.rangoHeaderTxt}>{rangoLabel}</Text>
            <TouchableOpacity onPress={() => cargar(periodo)} style={s.recargarBtn}>
              <Text style={s.recargarTxt}>↻ Actualizar</Text>
            </TouchableOpacity>
          </View>

          {/* KPIs generales del bloque */}
          <View style={s.kpiRow}>
            <KpiCard icono="👥" label="Activos"        valor={activos}       color="#2ecc71" sub={`${inactivos} inactivos`} />
            <KpiCard icono="🏆" label="Top performer"  valor={usuarios[0]?.nombre?.split(' ')[0] ?? '—'} color="#c9a84c" sub={`${maxActividad} pts`} />
            <KpiCard icono="👤" label="Clientes nuevos" valor={totalClientes} color="#1a6470" />
            <KpiCard icono="✅" label="Seguimientos"    valor={totalSegui}    color="#3498db" />
          </View>

          {/* Resumen de estado */}
          <View style={s.statusRow}>
            {[
              { emoji: '🟢', label: 'Muy activos',  n: usuarios.filter((u) => u.actividad_total >= maxActividad * 0.5 && u.actividad_total > 0).length },
              { emoji: '🟡', label: 'Act. media',   n: usuarios.filter((u) => u.actividad_total > 0 && u.actividad_total < maxActividad * 0.5).length },
              { emoji: '🔴', label: 'Sin actividad', n: inactivos },
            ].map((st) => (
              <View key={st.label} style={s.statusItem}>
                <Text style={s.statusEmoji}>{st.emoji}</Text>
                <Text style={s.statusN}>{st.n}</Text>
                <Text style={s.statusLbl}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Ranking individual del bloque */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Usuarios del bloque · {usuarios.length}</Text>
            {usuarios.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Este bloque no tiene usuarios asignados.</Text>
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
                notaEdit={notasEdit[u.id] ?? (u.notas_bloque ?? '')}
                onNotaChange={v => setNotasEdit(prev => ({ ...prev, [u.id]: v }))}
                onNotaGuardar={() => guardarNota(u.id)}
                notaGuardando={notasGuardando.has(u.id)}
                contestoGuardando={contestoGuardando.has(u.id)}
                onToggleContesto={() => toggleContesto(u.id, u.contesto_ok && u.contesto_fecha === hoyISO())}
              />
            ))}
          </View>

          {/* Totales del bloque */}
          {usuarios.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Totales del bloque</Text>
              <View style={s.teamCard}>
                {[
                  { icono: '👥', label: 'Clientes nuevos',       val: usuarios.reduce((a, u) => a + u.clientes_nuevos, 0) },
                  { icono: '🏠', label: 'Propiedades publicadas', val: usuarios.reduce((a, u) => a + u.propiedades_publicadas, 0) },
                  { icono: '✅', label: 'Seguimientos',           val: usuarios.reduce((a, u) => a + u.seguimientos, 0) },
                  { icono: '💬', label: 'Interacciones',          val: usuarios.reduce((a, u) => a + u.interacciones, 0) },
                  { icono: '📅', label: 'Citas generadas',        val: usuarios.reduce((a, u) => a + u.citas, 0) },
                  { icono: '🎓', label: 'Cursos completados',     val: usuarios.reduce((a, u) => a + u.cursos_completados, 0) },
                  { icono: '👁️',  label: 'Fichas vistas',          val: usuarios.reduce((a, u) => a + u.vistas_propiedades, 0) },
                  { icono: '📥', label: 'Fotos guardadas',        val: usuarios.reduce((a, u) => a + u.descargas_propiedades, 0) },
                ].map((m) => (
                  <View key={m.label} style={s.teamMetric}>
                    <Text style={s.teamMetricIcn}>{m.icono}</Text>
                    <View style={{ flex: 1 }}><Text style={s.teamMetricLbl}>{m.label}</Text></View>
                    <Text style={s.teamMetricVal}>{m.val}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0d1b2a', borderBottomWidth: 1, borderBottomColor: '#1e3448', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 16 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'center' },

  tabsContainer: { flexDirection: 'row', backgroundColor: '#0d1b2a', borderBottomWidth: 1, borderBottomColor: '#1e3448', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2a475e', backgroundColor: '#111f2e', marginBottom: 10 },
  tabActivo: { backgroundColor: TEAL, borderColor: TEAL },
  tabLabel: { fontSize: 14, fontWeight: '800', color: '#556a7a' },
  tabLabelActivo: { color: '#fff' },
  tabSub: { fontSize: 9, color: '#2a475e', marginTop: 2, fontWeight: '600' },
  tabSubActivo: { color: 'rgba(255,255,255,.65)' },

  rangoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rangoHeaderTxt: { fontSize: 12, fontWeight: '700', color: '#7a9ab5' },
  recargarBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#1e3448' },
  recargarTxt: { fontSize: 12, color: GOLD, fontWeight: '700' },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },

  statusRow: { flexDirection: 'row', backgroundColor: '#111f2e', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  statusItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: 1, borderRightColor: '#1e3448' },
  statusEmoji: { fontSize: 18, marginBottom: 2 },
  statusN: { fontSize: 20, fontWeight: '900', color: '#fff' },
  statusLbl: { fontSize: 9, color: '#556a7a', marginTop: 1, textAlign: 'center' },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#7a9ab5', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { color: '#556a7a', fontSize: 14 },

  teamCard: { backgroundColor: '#111f2e', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#1e3448' },
  teamMetric: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e3448', gap: 10 },
  teamMetricIcn: { fontSize: 16, width: 24 },
  teamMetricLbl: { fontSize: 13, color: '#c0d0dc' },
  teamMetricVal: { fontSize: 16, fontWeight: '900', color: '#fff', minWidth: 36, textAlign: 'right' },
})
