import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg'
import { supabase } from '../../lib/supabase'

type ActividadPeriodo = {
  clientes_nuevos:        number
  propiedades_publicadas: number
  seguimientos:           number
  interacciones:          number
  cursos_completados:     number
  primer_movimiento:      string | null
  ultimo_movimiento:      string | null
}

type ConexionDia = { fecha: string; minutos: number }

const DARK = '#0d1b2a'
const CARD = '#111f2e'
const TEAL = '#1a6470'
const GOLD = '#c9a84c'
const MID  = '#1e3448'

function formatMinutos(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function BarChart({ data, label }: { data: ConexionDia[]; label: string }) {
  const { width } = useWindowDimensions()
  const W = Math.min(width - 48, 520)
  const H = 160
  const padL = 38, padB = 36, padT = 16, padR = 8
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  if (!data.length) return (
    <Text style={{ color: '#556a7a', textAlign: 'center', paddingVertical: 20 }}>Sin datos de conexión</Text>
  )

  const maxMin = Math.max(...data.map(d => d.minutos), 30)
  const barW   = Math.max(6, Math.min(32, (chartW / data.length) * 0.65))
  const gap    = chartW / data.length
  const ticks  = [0, Math.round(maxMin / 2), maxMin]

  return (
    <View>
      <Text style={s.chartLabel}>{label}</Text>
      <Svg width={W} height={H}>
        {ticks.map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return <Line key={t} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e3448" strokeWidth={1} />
        })}
        {ticks.map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return (
            <SvgText key={`yt-${t}`} x={padL - 4} y={y + 4} fill="#556a7a" fontSize={9} textAnchor="end">
              {t < 60 ? `${t}m` : `${Math.round(t / 60)}h`}
            </SvgText>
          )
        })}
        {data.map((d, i) => {
          const x    = padL + i * gap + (gap - barW) / 2
          const barH = Math.max(2, (d.minutos / maxMin) * chartH)
          const y    = padT + chartH - barH
          return <Rect key={d.fecha} x={x} y={y} width={barW} height={barH} rx={3} fill={TEAL} opacity={0.85} />
        })}
        {data.map((d, i) => {
          const x   = padL + i * gap + gap / 2
          const dia = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          return (
            <SvgText key={`xl-${d.fecha}`} x={x} y={H - 6} fill="#556a7a" fontSize={8} textAnchor="middle">
              {dia}
            </SvgText>
          )
        })}
      </Svg>
    </View>
  )
}

export default function MiActividad() {
  const [userId, setUserId]           = useState<string | null>(null)
  const [periodo, setPeriodo]         = useState<'hoy' | 'semana' | 'mes'>('hoy')
  const [actividad, setActividad]     = useState<ActividadPeriodo | null>(null)
  const [conexionData, setConexionData] = useState<ConexionDia[]>([])
  const [loading, setLoading]         = useState(true)
  const [cargandoPeriodo, setCargandoPeriodo] = useState(false)

  useFocusEffect(useCallback(() => { cargar('hoy') }, []))

  async function cargar(p: 'hoy' | 'semana' | 'mes') {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setPeriodo(p)
    await Promise.all([
      cargarActividad(user.id, p),
      cargarConexion(user.id, p),
    ])
    setLoading(false)
  }

  async function cargarActividad(uid: string, p: 'hoy' | 'semana' | 'mes') {
    const dias = p === 'hoy' ? 1 : p === 'semana' ? 7 : 30
    const { data } = await supabase.rpc('get_actividad_periodo', { p_dias: dias, p_user_id: uid })
    setActividad((data?.[0] as ActividadPeriodo) ?? null)
  }

  async function cargarConexion(uid: string, p: 'hoy' | 'semana' | 'mes') {
    const dias = p === 'hoy' ? 1 : p === 'semana' ? 7 : 30
    const { data } = await supabase.rpc('get_horas_conexion', { p_user_id: uid, p_dias: dias })
    setConexionData((data ?? []).map((d: any) => ({ fecha: d.fecha, minutos: Number(d.minutos) })))
  }

  async function cambiarPeriodo(p: 'hoy' | 'semana' | 'mes') {
    if (p === periodo || !userId) return
    setPeriodo(p)
    setCargandoPeriodo(true)
    await Promise.all([
      cargarActividad(userId, p),
      cargarConexion(userId, p),
    ])
    setCargandoPeriodo(false)
  }

  const totalMinutos   = conexionData.reduce((a, d) => a + d.minutos, 0)
  const periodoLabel   = periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'los últimos 7 días' : 'los últimos 30 días'
  const chartLabel     = periodo === 'hoy' ? 'Hoy (minutos)' : periodo === 'semana' ? 'Últimos 7 días (min/día)' : 'Últimos 30 días (min/día)'
  const fechaHoyLabel  = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long',
  })

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: DARK, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={GOLD} />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Header con selector de período */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Mi Actividad</Text>
          <Text style={s.sub}>
            {periodo === 'hoy' ? fechaHoyLabel : periodo === 'semana' ? 'Últimos 7 días' : 'Últimos 30 días'}
          </Text>
        </View>
        <View style={s.periodoRow}>
          {(['hoy', 'semana', 'mes'] as const).map(p => (
            <TouchableOpacity
              key={p}
              style={[s.periodoPill, periodo === p && s.periodoPillActive]}
              onPress={() => cambiarPeriodo(p)}
            >
              <Text style={[s.periodoPillTxt, periodo === p && s.periodoPillActiveTxt]}>
                {p === 'hoy' ? 'Hoy' : p === 'semana' ? '7d' : '30d'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {cargandoPeriodo && (
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <ActivityIndicator size="small" color={GOLD} />
        </View>
      )}

      {/* Estadísticas del período */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>📊 Actividad de {periodoLabel}</Text>
        <View style={s.statsGrid}>
          <StatBox icon="🏠" label="Publicadas"      val={actividad?.propiedades_publicadas ?? 0} />
          <StatBox icon="👤" label="Clientes nuevos" val={actividad?.clientes_nuevos ?? 0} />
          <StatBox icon="💬" label="Interacciones"   val={actividad?.interacciones ?? 0} />
          <StatBox icon="✅" label="Seguimientos"    val={actividad?.seguimientos ?? 0} />
          <StatBox icon="📚" label="Cursos"          val={actividad?.cursos_completados ?? 0} />
          <StatBox icon="⏱️" label="Conectado"       val={formatMinutos(totalMinutos)} isText />
        </View>

        {/* Primer y último movimiento */}
        {(actividad?.primer_movimiento || actividad?.ultimo_movimiento) ? (
          <View style={s.movimientoRow}>
            <View style={s.movimientoItem}>
              <Text style={s.movimientoLbl}>⏰ Primer movimiento</Text>
              <Text style={s.movimientoVal}>{formatFechaCorta(actividad?.primer_movimiento ?? null)}</Text>
            </View>
            <View style={s.movimientoDivider} />
            <View style={s.movimientoItem}>
              <Text style={s.movimientoLbl}>🏁 Último movimiento</Text>
              <Text style={s.movimientoVal}>{formatFechaCorta(actividad?.ultimo_movimiento ?? null)}</Text>
            </View>
          </View>
        ) : (
          <View style={s.sinActividad}>
            <Text style={s.sinActividadTxt}>Sin actividad registrada en este período</Text>
          </View>
        )}
      </View>

      {/* Gráfica de tiempo conectado */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>⏱️ Tiempo conectado</Text>

        {conexionData.length === 0 ? (
          <View style={s.emptyConexion}>
            <Text style={s.emptyConexionIcn}>⏱️</Text>
            <Text style={s.emptyConexionTxt}>Sin datos de conexión para este período.</Text>
            <Text style={s.emptyConexionSub}>Los datos aparecerán a medida que uses la app.</Text>
          </View>
        ) : (
          <>
            <BarChart data={conexionData} label={chartLabel} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total {periodoLabel}</Text>
              <Text style={s.totalVal}>{formatMinutos(totalMinutos)}</Text>
            </View>
          </>
        )}
      </View>

    </ScrollView>
  )
}

function StatBox({ icon, label, val, isText }: { icon: string; label: string; val: number | string; isText?: boolean }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text style={s.statVal}>{val}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, backgroundColor: '#122030', borderBottomWidth: 1, borderBottomColor: MID,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#fff' },
  sub:   { fontSize: 11, color: '#7a9ab5', marginTop: 2 },

  sectionCard: {
    backgroundColor: CARD, borderRadius: 16, margin: 16, marginBottom: 0,
    padding: 16, borderWidth: 1, borderColor: MID,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    flex: 1, minWidth: '30%', backgroundColor: '#0d1b2a', borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: MID,
  },
  statIcon:  { fontSize: 22, marginBottom: 4 },
  statVal:   { fontSize: 20, fontWeight: '800', color: GOLD },
  statLabel: { fontSize: 10, color: '#7a9ab5', textAlign: 'center', marginTop: 2 },

  periodoRow:           { flexDirection: 'row', gap: 6 },
  periodoPill:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: MID },
  periodoPillActive:    { backgroundColor: TEAL },
  periodoPillTxt:       { fontSize: 11, color: '#7a9ab5', fontWeight: '600' },
  periodoPillActiveTxt: { color: '#fff' },

  movimientoRow: {
    flexDirection: 'row', marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: MID,
  },
  movimientoItem:    { flex: 1 },
  movimientoDivider: { width: 1, backgroundColor: MID, marginHorizontal: 12 },
  movimientoLbl:     { fontSize: 10, color: '#556a7a', marginBottom: 4 },
  movimientoVal:     { fontSize: 12, fontWeight: '700', color: '#c0d0da' },

  sinActividad:    { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  sinActividadTxt: { fontSize: 12, color: '#556a7a' },

  chartLabel: { fontSize: 11, color: '#556a7a', marginBottom: 4 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: MID,
  },
  totalLabel: { fontSize: 13, color: '#7a9ab5' },
  totalVal:   { fontSize: 14, fontWeight: '800', color: GOLD },

  emptyConexion:    { alignItems: 'center', paddingVertical: 24 },
  emptyConexionIcn: { fontSize: 36, marginBottom: 10 },
  emptyConexionTxt: { fontSize: 13, color: '#7a9ab5', textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  emptyConexionSub: { fontSize: 11, color: '#556a7a', textAlign: 'center' },
})
