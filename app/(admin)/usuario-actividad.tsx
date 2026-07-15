import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, useWindowDimensions,
} from 'react-native'
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router'
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Dia = { dia: string; publicaciones: number; seguimientos: number; clientes: number }
type Detalle = { tipo: string; titulo: string; hora: string }
type Metrica = 'publicaciones' | 'seguimientos' | 'clientes'

const TEAL = '#1a6470'
const COLOR_METRICA: Record<Metrica, string> = {
  publicaciones: '#1a6470',
  seguimientos:  '#c9a84c',
  clientes:      '#7c3aed',
}
const LABEL_METRICA: Record<Metrica, string> = {
  publicaciones: '📤 Publicaciones',
  seguimientos:  '✅ Seguimientos',
  clientes:      '👤 Clientes nuevos',
}

// Día MX de hoy, como texto YYYY-MM-DD.
function hoyMX(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })
}
function sumarDias(fecha: string, delta: number): string {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
function fmtCorto(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function UsuarioActividad() {
  const c = useColors()
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const { width } = useWindowDimensions()

  const [dias, setDias] = useState<Dia[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<7 | 30 | 90>(30)
  const [metrica, setMetrica] = useState<Metrica>('publicaciones')
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Detalle[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)

  const cargar = useCallback(async () => {
    if (!id) return
    const hasta = hoyMX()
    const desde = sumarDias(hasta, -(rango - 1))
    const { data } = await supabase.rpc('get_actividad_diaria_serie', {
      p_user_id: id, p_desde: desde, p_hasta: hasta,
    })
    setDias((data ?? []) as Dia[])
    setLoading(false)
  }, [id, rango])

  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  async function abrirDia(fecha: string) {
    setDiaSel(fecha)
    setLoadingDet(true)
    setDetalle(null)
    const { data } = await supabase.rpc('get_actividad_dia_detalle', { p_user_id: id, p_dia: fecha })
    setDetalle((data ?? []) as Detalle[])
    setLoadingDet(false)
  }

  // Totales + tendencia (segunda mitad vs primera mitad del rango).
  const resumen = useMemo(() => {
    const val = (d: Dia) => d[metrica]
    const total = dias.reduce((a, d) => a + val(d), 0)
    const mitad = Math.floor(dias.length / 2)
    const prim = dias.slice(0, mitad).reduce((a, d) => a + val(d), 0)
    const seg  = dias.slice(mitad).reduce((a, d) => a + val(d), 0)
    // Tendencia: compara las dos mitades del rango.
    const tendencia: 'sube' | 'baja' | 'igual' =
      seg > prim * 1.1 ? 'sube' : seg < prim * 0.9 ? 'baja' : 'igual'
    const promedio = dias.length ? (total / dias.length) : 0
    return { total, tendencia, promedio, prim, seg }
  }, [dias, metrica])

  const W = Math.min(width - 32, 560)
  const H = 180
  const padL = 34, padB = 34, padT = 14, padR = 8
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const maxVal = Math.max(1, ...dias.map(d => d[metrica]))
  const gap    = dias.length ? chartW / dias.length : chartW
  const barW   = Math.max(3, Math.min(28, gap * 0.68))
  const ticks  = [0, Math.ceil(maxVal / 2), maxVal]
  // Con muchos días, no caben todas las etiquetas: se muestra 1 de cada N.
  const cadaN  = dias.length <= 10 ? 1 : dias.length <= 31 ? 5 : 10

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/prospectadores')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>📈 {nombre ?? 'Usuario'}</Text>
          <Text style={s.headerSub}>Rendimiento por día</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} refreshControl={refreshControl}>
        {/* Rango */}
        <View style={s.chipsRow}>
          {([[7, '7 días'], [30, '30 días'], [90, '90 días']] as const).map(([v, lbl]) => (
            <TouchableOpacity
              key={v}
              style={[s.chip, { borderColor: c.border }, rango === v && s.chipOn]}
              onPress={() => { setRango(v); setDiaSel(null) }}
            >
              <Text style={[s.chipTxt, { color: c.textSub }, rango === v && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Métrica */}
        <View style={s.chipsRow}>
          {(['publicaciones', 'seguimientos', 'clientes'] as Metrica[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[s.chip, { borderColor: c.border }, metrica === m && { backgroundColor: COLOR_METRICA[m], borderColor: COLOR_METRICA[m] }]}
              onPress={() => { setMetrica(m); setDiaSel(null) }}
            >
              <Text style={[s.chipTxt, { color: c.textSub }, metrica === m && s.chipTxtOn]}>{LABEL_METRICA[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 50 }} />
        ) : (
          <>
            {/* Resumen + tendencia */}
            <View style={[s.resumen, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.resTotal, { color: c.text }]}>{resumen.total}</Text>
                <Text style={[s.resLbl, { color: c.textMute }]}>
                  {LABEL_METRICA[metrica]} · {rango} días
                </Text>
                <Text style={[s.resLbl, { color: c.textMute }]}>
                  Promedio {resumen.promedio.toFixed(1)}/día
                </Text>
              </View>
              <View style={[
                s.tendencia,
                resumen.tendencia === 'baja' ? { backgroundColor: '#dc262618' }
                  : resumen.tendencia === 'sube' ? { backgroundColor: '#16a34a18' }
                  : { backgroundColor: c.bg },
              ]}>
                <Text style={s.tendIcono}>
                  {resumen.tendencia === 'baja' ? '📉' : resumen.tendencia === 'sube' ? '📈' : '➡️'}
                </Text>
                <Text style={[
                  s.tendTxt,
                  { color: resumen.tendencia === 'baja' ? '#dc2626' : resumen.tendencia === 'sube' ? '#16a34a' : c.textMute },
                ]}>
                  {resumen.tendencia === 'baja' ? 'Va de bajada' : resumen.tendencia === 'sube' ? 'Va en subida' : 'Estable'}
                </Text>
              </View>
            </View>

            {resumen.tendencia === 'baja' && (
              <View style={s.alerta}>
                <Text style={s.alertaTxt}>
                  ⚠️ La actividad bajó en la segunda mitad del periodo. Este usuario puede necesitar atención.
                </Text>
              </View>
            )}

            {/* Gráfica */}
            <View style={[s.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[s.chartHint, { color: c.textMute }]}>Toca una barra para ver ese día</Text>
              <Svg width={W} height={H}>
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <Line key={`g${t}`} x1={padL} y1={y} x2={W - padR} y2={y} stroke={c.border} strokeWidth={1} />
                })}
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <SvgText key={`yt${t}`} x={padL - 4} y={y + 4} fill={c.textMute} fontSize={9} textAnchor="end">{t}</SvgText>
                })}
                {dias.map((d, i) => {
                  const val  = d[metrica]
                  const x    = padL + i * gap + (gap - barW) / 2
                  const barH = Math.max(val > 0 ? 3 : 0, (val / maxVal) * chartH)
                  const y    = padT + chartH - barH
                  const sel  = diaSel === d.dia
                  return (
                    <Rect
                      key={d.dia}
                      x={x} y={y} width={barW} height={barH} rx={2}
                      fill={COLOR_METRICA[metrica]}
                      opacity={sel ? 1 : 0.55}
                      stroke={sel ? c.text : undefined}
                      strokeWidth={sel ? 1.5 : 0}
                      onPress={() => abrirDia(d.dia)}
                    />
                  )
                })}
                {/* Área táctil de toda la columna (para días con barra chica o en 0) */}
                {dias.map((d, i) => (
                  <Rect
                    key={`t${d.dia}`}
                    x={padL + i * gap} y={padT} width={gap} height={chartH}
                    fill="transparent"
                    onPress={() => abrirDia(d.dia)}
                  />
                ))}
                {dias.map((d, i) => (i % cadaN === 0 ? (
                  <SvgText key={`x${d.dia}`} x={padL + i * gap + gap / 2} y={H - 4} fill={c.textMute} fontSize={8} textAnchor="middle">
                    {new Date(d.dia + 'T12:00:00').getDate()}
                  </SvgText>
                ) : null))}
              </Svg>
            </View>

            {/* Detalle del día seleccionado */}
            {diaSel && (
              <View style={[s.detCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.detHead}>
                  <Text style={[s.detTitulo, { color: c.text }]}>📅 {fmtCorto(diaSel)}</Text>
                  <TouchableOpacity onPress={() => setDiaSel(null)}>
                    <Text style={{ color: c.textMute, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                {loadingDet ? (
                  <ActivityIndicator color={TEAL} style={{ marginVertical: 16 }} />
                ) : !detalle || detalle.length === 0 ? (
                  <Text style={[s.detVacio, { color: c.textMute }]}>Sin actividad registrada este día.</Text>
                ) : (
                  detalle.map((d, i) => (
                    <View key={i} style={[s.detFila, { borderBottomColor: c.border }]}>
                      <Text style={s.detIcono}>
                        {d.tipo === 'publicacion' ? '📤' : d.tipo === 'seguimiento' ? '✅' : '👤'}
                      </Text>
                      <Text style={[s.detTxt, { color: c.text }]} numberOfLines={1}>{d.titulo}</Text>
                      <Text style={[s.detHora, { color: c.textMute }]}>{d.hora}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    backgroundColor: TEAL, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },

  resumen: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  resTotal: { fontSize: 30, fontWeight: '900' },
  resLbl: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  tendencia: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 96 },
  tendIcono: { fontSize: 22 },
  tendTxt: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  alerta: { backgroundColor: '#dc262618', borderRadius: 10, padding: 11, marginBottom: 10 },
  alertaTxt: { color: '#dc2626', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },

  chartCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10, alignItems: 'center' },
  chartHint: { fontSize: 11, marginBottom: 6, alignSelf: 'flex-start' },

  detCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  detHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detTitulo: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  detVacio: { fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  detFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  detIcono: { fontSize: 15 },
  detTxt: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  detHora: { fontSize: 12, fontWeight: '600' },
})
