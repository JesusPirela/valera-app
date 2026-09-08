// Sub-apartado de ESTADÍSTICAS del bloque (en gráficas). Se llega desde el
// detalle del bloque. Muestra la actividad AGREGADA del bloque por día
// (publicaciones, seguimientos, clientes) con selector de métrica y rango, más
// un resumen con total, promedio y tendencia. Basado en usuario-actividad.
import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, useWindowDimensions, Platform,
} from 'react-native'
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router'
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type Dia = { dia: string; publicaciones: number; seguimientos: number; clientes: number }
type Metrica = 'publicaciones' | 'seguimientos' | 'clientes'
type MiembroStat = { id: string; nombre: string; publicaciones: number; seguimientos: number; clientes: number }
const MEDALLA = ['🥇', '🥈', '🥉']

const TEAL = '#1a6470'
const COLOR_METRICA: Record<Metrica, string> = { publicaciones: '#1a6470', seguimientos: '#c9a84c', clientes: '#7c3aed' }
const LABEL_METRICA: Record<Metrica, string> = {
  publicaciones: '📤 Casas publicadas', seguimientos: '✅ Seguimientos', clientes: '👤 Clientes nuevos',
}

function hoyMX(): string { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' }) }
function sumarDias(fecha: string, delta: number): string {
  const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10)
}

export default function BloqueEstadisticas() {
  useSupervisorBlock()
  const c = useColors()
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const { width } = useWindowDimensions()

  const [dias, setDias] = useState<Dia[]>([])
  const [miembros, setMiembros] = useState<MiembroStat[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<7 | 30 | 90>(30)
  const [metrica, setMetrica] = useState<Metrica>('publicaciones')
  const [hover, setHover] = useState<{ dia: string; val: number; i: number } | null>(null)

  const cargar = useCallback(async () => {
    if (!id) return
    const hasta = hoyMX()
    const desde = sumarDias(hasta, -(rango - 1))
    // Periodo para el ranking por miembro (mismos datos que el resto del bloque).
    const inicio = new Date(desde + 'T00:00:00'); const fin = new Date()
    const [serieRes, miembrosRes, prodRes] = await Promise.all([
      supabase.rpc('get_actividad_diaria_serie_bloque', { p_bloque_id: id, p_desde: desde, p_hasta: hasta }),
      supabase.from('profiles').select('id').eq('bloque_id', id),
      supabase.rpc('get_productividad_equipo', { p_inicio: inicio.toISOString(), p_fin: fin.toISOString() }),
    ])
    setDias((serieRes.data ?? []) as Dia[])
    const ids = new Set(((miembrosRes.data ?? []) as any[]).map(m => m.id as string))
    const stats: MiembroStat[] = ((prodRes.data ?? []) as any[])
      .filter(u => ids.has(u.id))
      .map(u => ({
        id: u.id, nombre: u.nombre ?? 'Usuario',
        publicaciones: u.propiedades_publicadas ?? 0,
        seguimientos: u.seguimientos ?? 0,
        clientes: u.clientes_nuevos ?? 0,
      }))
    setMiembros(stats)
    setLoading(false)
  }, [id, rango])

  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  const resumen = useMemo(() => {
    const val = (d: Dia) => d[metrica]
    const total = dias.reduce((a, d) => a + val(d), 0)
    const mitad = Math.floor(dias.length / 2)
    const prim = dias.slice(0, mitad).reduce((a, d) => a + val(d), 0)
    const seg = dias.slice(mitad).reduce((a, d) => a + val(d), 0)
    const tendencia: 'sube' | 'baja' | 'igual' = seg > prim * 1.1 ? 'sube' : seg < prim * 0.9 ? 'baja' : 'igual'
    const promedio = dias.length ? total / dias.length : 0
    // Cuánto se hizo HOY (último día del rango).
    const hoy = dias.length ? val(dias[dias.length - 1]) : 0
    return { total, tendencia, promedio, hoy }
  }, [dias, metrica])

  // Ranking de prospectadores del bloque según la métrica elegida (mismos datos).
  const ranking = useMemo(() => {
    const val = (m: MiembroStat) => m[metrica]
    const ordenados = [...miembros].sort((a, b) => val(b) - val(a))
    const top = ordenados.filter(m => val(m) > 0).slice(0, 3)
    const topIds = new Set(top.map(m => m.id))
    const peores = ordenados.slice().reverse().filter(m => !topIds.has(m.id)).slice(0, 3)
    return { top, peores, val }
  }, [miembros, metrica])

  const CONTENIDO = Math.min(width - 28, 1040)
  const W = CONTENIDO - 24
  const H = 320
  const padL = 56, padB = 56, padT = 24, padR = 18
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxVal = Math.max(1, ...dias.map(d => d[metrica]))
  const gap = dias.length ? chartW / dias.length : chartW
  const barW = Math.max(6, Math.min(52, gap * 0.72))
  const ticks = [0, Math.ceil(maxVal / 2), maxVal]
  const cadaN = dias.length <= 12 ? 1 : dias.length <= 31 ? 4 : 9
  const colorMet = COLOR_METRICA[metrica]
  const isWeb = Platform.OS === 'web'
  const fmtDiaMes = (fecha: string) => new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/bloques')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>📊 {nombre ?? 'Bloque'}</Text>
          <Text style={s.headerSub}>Estadísticas del bloque por día</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, alignItems: 'center' }} refreshControl={refreshControl}>
       <View style={{ width: CONTENIDO }}>
        {/* Rango */}
        <View style={s.chipsRow}>
          {([[7, '7 días'], [30, '30 días'], [90, '90 días']] as const).map(([v, lbl]) => (
            <TouchableOpacity key={v} style={[s.chip, { borderColor: c.border }, rango === v && s.chipOn]} onPress={() => setRango(v)}>
              <Text style={[s.chipTxt, { color: c.textSub }, rango === v && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Métrica */}
        <View style={s.chipsRow}>
          {(['publicaciones', 'seguimientos', 'clientes'] as Metrica[]).map(m => (
            <TouchableOpacity key={m} style={[s.chip, { borderColor: c.border }, metrica === m && { backgroundColor: COLOR_METRICA[m], borderColor: COLOR_METRICA[m] }]} onPress={() => setMetrica(m)}>
              <Text style={[s.chipTxt, { color: c.textSub }, metrica === m && s.chipTxtOn]}>{LABEL_METRICA[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 50 }} />
        ) : (
          <>
            {/* Resumen */}
            <View style={[s.resumen, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.resTotal, { color: c.text }]}>{resumen.total}</Text>
                <Text style={[s.resLbl, { color: c.textMute }]}>{LABEL_METRICA[metrica]} · {rango} días</Text>
                <Text style={[s.resLbl, { color: c.textMute }]}>Hoy: {resumen.hoy} · Promedio {resumen.promedio.toFixed(1)}/día</Text>
              </View>
              <View style={[s.tendencia,
                resumen.tendencia === 'baja' ? { backgroundColor: '#dc262618' }
                  : resumen.tendencia === 'sube' ? { backgroundColor: '#16a34a18' } : { backgroundColor: c.bg }]}>
                <Text style={s.tendIcono}>{resumen.tendencia === 'baja' ? '📉' : resumen.tendencia === 'sube' ? '📈' : '➡️'}</Text>
                <Text style={[s.tendTxt, { color: resumen.tendencia === 'baja' ? '#dc2626' : resumen.tendencia === 'sube' ? '#16a34a' : c.textMute }]}>
                  {resumen.tendencia === 'baja' ? 'Va de bajada' : resumen.tendencia === 'sube' ? 'Va en subida' : 'Estable'}
                </Text>
              </View>
            </View>

            {/* Gráfica */}
            <View style={[s.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[s.chartTitulo, { color: c.text }]}>{LABEL_METRICA[metrica]} por día</Text>
              <Text style={[s.chartHint, { color: c.textMute }]}>{isWeb ? 'Pasa el mouse sobre una barra para ver el dato exacto' : 'Toca una barra para ver el dato'}</Text>
              <Svg width={W} height={H}>
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <Line key={`g${t}`} x1={padL} y1={y} x2={W - padR} y2={y} stroke={c.border} strokeWidth={1} />
                })}
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <SvgText key={`yt${t}`} x={padL - 8} y={y + 4} fill={c.textMute} fontSize={12} textAnchor="end">{t}</SvgText>
                })}
                <SvgText x={16} y={padT + chartH / 2} fill={c.textSub} fontSize={12} fontWeight="bold" textAnchor="middle" transform={`rotate(-90, 16, ${padT + chartH / 2})`}>Cantidad</SvgText>

                {dias.map((d, i) => {
                  const val = d[metrica]
                  const x = padL + i * gap + (gap - barW) / 2
                  const barH = Math.max(val > 0 ? 4 : 0, (val / maxVal) * chartH)
                  const y = padT + chartH - barH
                  const act = hover?.dia === d.dia
                  return <Rect key={d.dia} x={x} y={y} width={barW} height={barH} rx={3} fill={colorMet} opacity={hover && !act ? 0.4 : 1} stroke={act ? c.text : undefined} strokeWidth={act ? 2 : 0} />
                })}
                {dias.length <= 31 && dias.map((d, i) => {
                  const val = d[metrica]
                  if (val === 0) return null
                  const barH = Math.max(4, (val / maxVal) * chartH)
                  const y = padT + chartH - barH
                  return <SvgText key={`v${d.dia}`} x={padL + i * gap + gap / 2} y={y - 5} fill={c.text} fontSize={barW < 16 ? 9 : 11} fontWeight="bold" textAnchor="middle">{val}</SvgText>
                })}
                {dias.map((d, i) => {
                  const webHover = isWeb ? {
                    onMouseEnter: () => setHover({ dia: d.dia, val: d[metrica], i }),
                    onMouseLeave: () => setHover(h => (h?.dia === d.dia ? null : h)),
                  } : {}
                  return <Rect key={`t${d.dia}`} x={padL + i * gap} y={padT} width={gap} height={chartH} fill="transparent" onPress={() => setHover({ dia: d.dia, val: d[metrica], i })} {...(webHover as any)} />
                })}
                {dias.map((d, i) => (i % cadaN === 0 ? (
                  <SvgText key={`x${d.dia}`} x={padL + i * gap + gap / 2} y={padT + chartH + 18} fill={c.textMute} fontSize={11} textAnchor="middle">{fmtDiaMes(d.dia)}</SvgText>
                ) : null))}
                <SvgText x={padL + chartW / 2} y={H - 6} fill={c.textSub} fontSize={12} fontWeight="bold" textAnchor="middle">Fecha</SvgText>

                {hover && (() => {
                  const cx = padL + hover.i * gap + gap / 2
                  const tw = 120, th = 40
                  const tx = Math.max(padL, Math.min(cx - tw / 2, W - padR - tw))
                  return (
                    <>
                      <Rect x={tx} y={padT + 2} width={tw} height={th} rx={7} fill={c.text} opacity={0.92} />
                      <SvgText x={tx + tw / 2} y={padT + 18} fill={c.bg} fontSize={11} fontWeight="bold" textAnchor="middle">{fmtDiaMes(hover.dia)}</SvgText>
                      <SvgText x={tx + tw / 2} y={padT + 33} fill={c.bg} fontSize={12} fontWeight="bold" textAnchor="middle">
                        {hover.val} {metrica === 'clientes' ? 'clientes' : metrica === 'seguimientos' ? 'seguim.' : 'public.'}
                      </SvgText>
                    </>
                  )
                })()}
              </Svg>
            </View>

            {/* Ranking: mejores y los que menos, según la métrica elegida */}
            <View style={s.rankRow}>
              <View style={[s.rankCard, { backgroundColor: c.card, borderColor: '#16a34a55' }]}>
                <Text style={[s.rankTitulo, { color: '#16a34a' }]}>🏆 Mejores · {LABEL_METRICA[metrica].replace(/^\S+\s/, '')}</Text>
                {ranking.top.length === 0 ? (
                  <Text style={[s.rankVacio, { color: c.textMute }]}>Sin actividad en este periodo.</Text>
                ) : ranking.top.map((m, i) => (
                  <View key={m.id} style={[s.rankFila, { borderBottomColor: c.border }]}>
                    <Text style={s.rankMed}>{MEDALLA[i] ?? `${i + 1}.`}</Text>
                    <Text style={[s.rankNombre, { color: c.text }]} numberOfLines={1}>{m.nombre}</Text>
                    <Text style={[s.rankVal, { color: '#16a34a' }]}>{ranking.val(m)}</Text>
                  </View>
                ))}
              </View>
              <View style={[s.rankCard, { backgroundColor: c.card, borderColor: '#dc262655' }]}>
                <Text style={[s.rankTitulo, { color: '#dc2626' }]}>⚠️ Los que menos</Text>
                {ranking.peores.length === 0 ? (
                  <Text style={[s.rankVacio, { color: c.textMute }]}>—</Text>
                ) : ranking.peores.map((m) => (
                  <View key={m.id} style={[s.rankFila, { borderBottomColor: c.border }]}>
                    <Text style={s.rankMed}>🔻</Text>
                    <Text style={[s.rankNombre, { color: c.text }]} numberOfLines={1}>{m.nombre}</Text>
                    <Text style={[s.rankVal, { color: '#dc2626' }]}>{ranking.val(m)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[s.pie, { color: c.textMute }]}>Suma de todos los miembros del bloque · ranking por {LABEL_METRICA[metrica].replace(/^\S+\s/, '').toLowerCase()}.</Text>
          </>
        )}
       </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { backgroundColor: TEAL, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  chartCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10, alignItems: 'center' },
  chartTitulo: { fontSize: 14, fontWeight: '800', alignSelf: 'flex-start' },
  chartHint: { fontSize: 11, alignSelf: 'flex-start', marginBottom: 6 },
  pie: { fontSize: 11.5, fontStyle: 'italic', textAlign: 'center', marginTop: 2 },

  rankRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  rankCard: { flex: 1, minWidth: 240, borderWidth: 1, borderRadius: 14, padding: 12 },
  rankTitulo: { fontSize: 13.5, fontWeight: '800', marginBottom: 6 },
  rankVacio: { fontSize: 12.5, fontStyle: 'italic', paddingVertical: 6 },
  rankFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  rankMed: { fontSize: 16, width: 24, textAlign: 'center' },
  rankNombre: { flex: 1, fontSize: 13.5, fontWeight: '700' },
  rankVal: { fontSize: 16, fontWeight: '900', minWidth: 30, textAlign: 'right' },
})
