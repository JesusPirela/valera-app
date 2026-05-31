import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg'
import { supabase } from '../../lib/supabase'

type ActividadDiaria = {
  propiedades_hoy: number
  clientes_hoy: number
  interacciones_hoy: number
  seguimientos_hoy: number
  clientes_modificados_hoy: number
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

function BarChart({ data, label }: { data: ConexionDia[]; label: string }) {
  const { width } = useWindowDimensions()
  const W = Math.min(width - 48, 520)
  const H = 160
  const padL = 38, padB = 36, padT = 16, padR = 8
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  if (!data.length) return (
    <Text style={{ color: '#556a7a', textAlign: 'center', paddingVertical: 20 }}>Sin datos</Text>
  )

  const maxMin = Math.max(...data.map(d => d.minutos), 30)
  const barW   = Math.max(6, Math.min(32, (chartW / data.length) * 0.65))
  const gap    = chartW / data.length

  const ticks = [0, Math.round(maxMin / 2), maxMin]

  return (
    <View>
      <Text style={s.chartLabel}>{label}</Text>
      <Svg width={W} height={H}>
        {/* Líneas de guía */}
        {ticks.map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return (
            <Line key={t} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e3448" strokeWidth={1} />
          )
        })}

        {/* Labels eje Y */}
        {ticks.map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return (
            <SvgText key={`yt-${t}`} x={padL - 4} y={y + 4} fill="#556a7a" fontSize={9} textAnchor="end">
              {t < 60 ? `${t}m` : `${Math.round(t / 60)}h`}
            </SvgText>
          )
        })}

        {/* Barras */}
        {data.map((d, i) => {
          const x = padL + i * gap + (gap - barW) / 2
          const barH = Math.max(2, (d.minutos / maxMin) * chartH)
          const y = padT + chartH - barH
          const dia = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          return (
            <Rect key={d.fecha} x={x} y={y} width={barW} height={barH} rx={3} fill={TEAL} opacity={0.85} />
          )
        })}

        {/* Labels eje X */}
        {data.map((d, i) => {
          const x = padL + i * gap + gap / 2
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
  const [actividad, setActividad]     = useState<ActividadDiaria | null>(null)
  const [periodo, setPeriodo]         = useState<'hoy' | 'semana' | 'mes'>('semana')
  const [conexionData, setConexionData] = useState<ConexionDia[]>([])
  const [loading, setLoading]         = useState(true)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [actRes] = await Promise.all([
      supabase.rpc('get_actividad_diaria'),
    ])
    setActividad((actRes.data?.[0] as ActividadDiaria) ?? null)

    await cargarConexion(user.id, periodo)
    setLoading(false)
  }

  async function cargarConexion(uid: string, p: 'hoy' | 'semana' | 'mes') {
    const dias = p === 'hoy' ? 1 : p === 'semana' ? 7 : 30
    const { data } = await supabase.rpc('get_horas_conexion', { p_user_id: uid, p_dias: dias })
    setConexionData((data ?? []).map((d: any) => ({ fecha: d.fecha, minutos: Number(d.minutos) })))
  }

  async function cambiarPeriodo(p: 'hoy' | 'semana' | 'mes') {
    setPeriodo(p)
    if (userId) await cargarConexion(userId, p)
  }

  // Fecha local del dispositivo (México), no UTC
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })
  const totalHoyMinutos = conexionData.find(d => d.fecha === hoy)?.minutos ?? 0

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: DARK, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={GOLD} />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Mi Actividad</Text>
        <Text style={s.sub}>Resumen del día y tiempo conectado</Text>
      </View>

      {/* Resumen del día */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>
          📊 Resumen de hoy — {new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <View style={s.statsGrid}>
          <StatBox icon="🏠" label="Publicadas" val={actividad?.propiedades_hoy ?? 0} />
          <StatBox icon="👤" label="Clientes nuevos" val={actividad?.clientes_hoy ?? 0} />
          <StatBox icon="🔄" label="Clientes modificados" val={actividad?.clientes_modificados_hoy ?? 0} />
          <StatBox icon="💬" label="Interacciones" val={actividad?.interacciones_hoy ?? 0} />
          <StatBox icon="✅" label="Seguimientos" val={actividad?.seguimientos_hoy ?? 0} />
          <StatBox icon="⏱️" label="Conectado hoy" val={formatMinutos(totalHoyMinutos)} isText />
        </View>
      </View>

      {/* Gráfica de conexión */}
      <View style={s.sectionCard}>
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { flex: 1, marginBottom: 0 }]}>⏱️ Tiempo conectado</Text>
          <View style={s.periodoRow}>
            {(['hoy', 'semana', 'mes'] as const).map(p => (
              <TouchableOpacity
                key={p}
                style={[s.periodoPill, periodo === p && s.periodoPillActive]}
                onPress={() => cambiarPeriodo(p)}
              >
                <Text style={[s.periodoPillTxt, periodo === p && s.periodoPillActiveTxt]}>
                  {p === 'hoy' ? 'Hoy' : p === 'semana' ? '7 días' : '30 días'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {conexionData.length === 0 ? (
          <View style={s.emptyConexion}>
            <Text style={s.emptyConexionIcn}>⏱️</Text>
            <Text style={s.emptyConexionTxt}>El registro de tiempo conectado comenzó con la última actualización de la app.</Text>
            <Text style={s.emptyConexionSub}>Los datos aparecerán a medida que uses la app.</Text>
          </View>
        ) : (
          <>
            <BarChart
              data={conexionData}
              label={periodo === 'hoy' ? 'Hoy (minutos)' : periodo === 'semana' ? 'Últimos 7 días (minutos por día)' : 'Últimos 30 días (minutos por día)'}
            />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'semana' : 'mes'}</Text>
              <Text style={s.totalVal}>
                {formatMinutos(conexionData.reduce((a, d) => a + d.minutos, 0))}
              </Text>
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
  header: { padding: 20, backgroundColor: '#122030', borderBottomWidth: 1, borderBottomColor: MID },
  title: { fontSize: 20, fontWeight: '900', color: '#fff' },
  sub:   { fontSize: 12, color: '#7a9ab5', marginTop: 2 },

  sectionCard: {
    backgroundColor: CARD, borderRadius: 16, margin: 16, marginBottom: 0,
    padding: 16, borderWidth: 1, borderColor: MID,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 12 },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    flex: 1, minWidth: '30%', backgroundColor: '#0d1b2a', borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: MID,
  },
  statIcon:  { fontSize: 22, marginBottom: 4 },
  statVal:   { fontSize: 20, fontWeight: '800', color: GOLD },
  statLabel: { fontSize: 10, color: '#7a9ab5', textAlign: 'center', marginTop: 2 },

  periodoRow:        { flexDirection: 'row', gap: 6 },
  periodoPill:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: MID },
  periodoPillActive: { backgroundColor: TEAL },
  periodoPillTxt:    { fontSize: 11, color: '#7a9ab5', fontWeight: '600' },
  periodoPillActiveTxt: { color: '#fff' },

  chartLabel: { fontSize: 11, color: '#556a7a', marginBottom: 4 },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: MID },
  totalLabel: { fontSize: 13, color: '#7a9ab5' },
  totalVal:   { fontSize: 14, fontWeight: '800', color: GOLD },

  emptyConexion:    { alignItems: 'center', paddingVertical: 24 },
  emptyConexionIcn: { fontSize: 36, marginBottom: 10 },
  emptyConexionTxt: { fontSize: 13, color: '#7a9ab5', textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  emptyConexionSub: { fontSize: 11, color: '#556a7a', textAlign: 'center' },
})
