import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type ConexionRow = { user_id: string; nombre: string; fecha: string; minutos: number }
type UserConexion = { user_id: string; nombre: string; dias: { fecha: string; minutos: number }[] }

const TEAL  = '#1a6470'

function formatMinutos(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function MiniBar({ minutos, maxMin }: { minutos: number; maxMin: number }) {
  const pct = maxMin > 0 ? minutos / maxMin : 0
  return (
    <View style={{ flex: 1, height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, marginRight: 6 }}>
      <View style={{ width: `${Math.max(2, pct * 100)}%`, height: 6, backgroundColor: TEAL, borderRadius: 3 }} />
    </View>
  )
}

function UserBarChart({ nombre, dias, width: W }: { nombre: string; dias: { fecha: string; minutos: number }[]; width: number }) {
  const H    = 120
  const padL = 32, padB = 30, padT = 10, padR = 6
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxMin = Math.max(...dias.map(d => d.minutos), 30)
  const barW   = Math.max(5, Math.min(28, (chartW / dias.length) * 0.6))
  const gap    = chartW / dias.length

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={ss.userName}>{nombre}</Text>
      <Text style={ss.userTotal}>
        Total: {formatMinutos(dias.reduce((a, d) => a + d.minutos, 0))}
      </Text>
      <Svg width={W} height={H}>
        {[0, Math.round(maxMin / 2), maxMin].map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return (
            <Line key={t} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e8eef0" strokeWidth={1} />
          )
        })}
        {[0, Math.round(maxMin / 2), maxMin].map(t => {
          const y = padT + chartH - (t / maxMin) * chartH
          return (
            <SvgText key={`yt-${t}`} x={padL - 4} y={y + 4} fill="#aaa" fontSize={8} textAnchor="end">
              {t < 60 ? `${t}m` : `${Math.round(t / 60)}h`}
            </SvgText>
          )
        })}
        {dias.map((d, i) => {
          const x    = padL + i * gap + (gap - barW) / 2
          const barH = Math.max(2, (d.minutos / maxMin) * chartH)
          const y    = padT + chartH - barH
          return (
            <Rect key={d.fecha} x={x} y={y} width={barW} height={barH} rx={2} fill={TEAL} opacity={0.8} />
          )
        })}
        {dias.map((d, i) => {
          const x   = padL + i * gap + gap / 2
          const dia = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          return (
            <SvgText key={`xl-${d.fecha}`} x={x} y={H - 4} fill="#aaa" fontSize={7} textAnchor="middle">
              {dia}
            </SvgText>
          )
        })}
      </Svg>
    </View>
  )
}

export default function ConexionUsuarios() {
  useSupervisorBlock()
  const c = useColors()
  const [usuarios, setUsuarios]   = useState<UserConexion[]>([])
  const [periodo, setPeriodo]     = useState<1 | 7 | 30>(1)
  const [loading, setLoading]     = useState(true)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const { width }                 = useWindowDimensions()
  const chartW                    = Math.min(width - 80, 480)
  const yaCargoRef                = useRef(false)

  useFocusEffect(useCallback(() => {
    setPeriodo(1)
    cargar(1, yaCargoRef.current)  // al volver, refresca sin spinner completo
  }, []))

  async function cargar(dias: 1 | 7 | 30, silencioso = false) {
    if (!silencioso) setLoading(true)
    setErrorMsg(null)
    const { data, error } = await supabase.rpc('get_conexion_todos_usuarios', { p_dias: dias })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
      return
    }

    const rows: ConexionRow[] = (data ?? []).map((r: any) => ({
      user_id: r.user_id,
      nombre:  r.nombre ?? 'Sin nombre',
      fecha:   typeof r.fecha === 'string' ? r.fecha : String(r.fecha),
      minutos: Number(r.minutos),
    }))

    const map = new Map<string, UserConexion>()
    for (const r of rows) {
      if (!map.has(r.user_id)) map.set(r.user_id, { user_id: r.user_id, nombre: r.nombre, dias: [] })
      map.get(r.user_id)!.dias.push({ fecha: r.fecha, minutos: Math.min(r.minutos, 1440) })
    }
    setUsuarios(Array.from(map.values()).sort((a, b) => {
      const ta = a.dias.reduce((s, d) => s + d.minutos, 0)
      const tb = b.dias.reduce((s, d) => s + d.minutos, 0)
      return tb - ta
    }))
    yaCargoRef.current = true
    setLoading(false)
  }

  async function cambiarPeriodo(p: 1 | 7 | 30) {
    setPeriodo(p)
    await cargar(p)
  }

  return (
    <ScrollView style={[ss.container, { backgroundColor: c.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={ss.header}>
        <View>
          <Text style={[ss.title, { color: c.text }]}>Tiempo conectado</Text>
          <Text style={[ss.sub, { color: c.textMute }]}>Horas de conexión por prospectador</Text>
        </View>
        <View style={ss.periodoRow}>
          {([1, 7, 30] as const).map(p => (
            <TouchableOpacity
              key={p}
              style={[ss.periodoPill, { backgroundColor: c.card }, periodo === p && ss.periodoPillActive]}
              onPress={() => cambiarPeriodo(p)}
            >
              <Text style={[ss.periodoPillTxt, { color: c.textMute }, periodo === p && ss.periodoPillActiveTxt]}>
                {p === 1 ? 'Hoy' : `${p} días`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : errorMsg ? (
        <View style={ss.empty}>
          <Text style={[ss.emptyTxt, { color: '#c0392b' }]}>Error: {errorMsg}</Text>
        </View>
      ) : usuarios.length === 0 ? (
        <View style={ss.empty}>
          <Text style={[ss.emptyTxt, { color: c.textMute }]}>Sin conexiones registradas en este periodo.</Text>
          <Text style={[ss.emptyTxt, { fontSize: 12, marginTop: 6, color: c.textMute }]}>
            El tracking comenzó hoy — los datos se acumulan con cada sesión.
          </Text>
        </View>
      ) : (
        <>
          {/* Resumen tabla */}
          <View style={[ss.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={ss.cardTitle}>Resumen</Text>
            {usuarios.map(u => {
              const total = u.dias.reduce((s, d) => s + d.minutos, 0)
              const maxGlobal = Math.max(...usuarios.map(x => x.dias.reduce((s, d) => s + d.minutos, 0)))
              return (
                <View key={u.user_id} style={ss.rankRow}>
                  <Text style={[ss.rankNombre, { color: c.text }]} numberOfLines={1}>{u.nombre}</Text>
                  <MiniBar minutos={total} maxMin={maxGlobal} />
                  <Text style={ss.rankTotal}>{formatMinutos(total)}</Text>
                </View>
              )
            })}
          </View>

          {/* Gráficas por usuario */}
          <View style={[ss.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={ss.cardTitle}>Detalle por usuario</Text>
            {usuarios.map(u => (
              <UserBarChart key={u.user_id} nombre={u.nombre} dias={u.dias} width={chartW} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

const ss = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingTop: 8,
  },
  title: { fontSize: 20, fontWeight: '900' },
  sub:   { fontSize: 12, marginTop: 2 },

  periodoRow:        { flexDirection: 'row', gap: 6 },
  periodoPill:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  periodoPillActive: { backgroundColor: TEAL },
  periodoPillTxt:    { fontSize: 12, fontWeight: '600' },
  periodoPillActiveTxt: { color: '#fff' },

  card: { borderRadius: 16, margin: 16, marginBottom: 0, padding: 16, borderWidth: 1 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: TEAL, marginBottom: 14 },

  rankRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rankNombre: { width: 110, fontSize: 12, fontWeight: '600' },
  rankTotal:  { fontSize: 12, fontWeight: '800', color: TEAL, width: 48, textAlign: 'right' },

  userName:  { fontSize: 13, fontWeight: '700', marginBottom: 0 },
  userTotal: { fontSize: 11, marginBottom: 4 },

  empty:    { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyTxt: { fontSize: 15 },
})
