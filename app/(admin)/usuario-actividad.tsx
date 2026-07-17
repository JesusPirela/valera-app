import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, useWindowDimensions, Modal, Platform,
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
// Métrica → tipo de fila en el detalle del día.
const TIPO_METRICA: Record<Metrica, string> = {
  publicaciones: 'publicacion',
  seguimientos:  'seguimiento',
  clientes:      'cliente',
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
  const [picker, setPicker] = useState(false)
  const [hover, setHover] = useState<{ dia: string; val: number; i: number } | null>(null)

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

  // El contenido se limita a un ancho máximo y se centra; la gráfica llena ese
  // ancho. Se hizo grande (antes quedaba chiquita y perdida en un card enorme).
  const CONTENIDO = Math.min(width - 28, 1040)
  const W = CONTENIDO - 24            // menos el padding del card
  const H = 320
  // padL: espacio para el título vertical "Cantidad" + números del eje Y.
  // padB: espacio para las fechas del eje X + el título "Fecha".
  const padL = 56, padB = 56, padT = 24, padR = 18
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const maxVal = Math.max(1, ...dias.map(d => d[metrica]))
  const gap    = dias.length ? chartW / dias.length : chartW
  const barW   = Math.max(6, Math.min(52, gap * 0.72))
  const ticks  = [0, Math.ceil(maxVal / 2), maxVal]
  // Con muchos días, no caben todas las etiquetas: se muestra 1 de cada N.
  const cadaN  = dias.length <= 12 ? 1 : dias.length <= 31 ? 4 : 9
  const colorMet = COLOR_METRICA[metrica]
  const isWeb = Platform.OS === 'web'
  const fmtDiaMes = (fecha: string) =>
    new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

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

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, alignItems: 'center' }} refreshControl={refreshControl}>
       <View style={{ width: CONTENIDO }}>
        {/* Rango + elegir fecha */}
        <View style={s.chipsRow}>
          {([[7, '7 días'], [30, '30 días'], [90, '90 días']] as const).map(([v, lbl]) => (
            <TouchableOpacity
              key={v}
              style={[s.chip, { borderColor: c.border }, rango === v && s.chipOn]}
              onPress={() => setRango(v)}
            >
              <Text style={[s.chipTxt, { color: c.textSub }, rango === v && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.chip, { borderColor: '#1a6470', backgroundColor: '#1a647014' }]} onPress={() => setPicker(true)}>
            <Text style={[s.chipTxt, { color: '#1a6470' }]}>📅 Elegir fecha</Text>
          </TouchableOpacity>
        </View>

        {/* Métrica */}
        <View style={s.chipsRow}>
          {(['publicaciones', 'seguimientos', 'clientes'] as Metrica[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[s.chip, { borderColor: c.border }, metrica === m && { backgroundColor: COLOR_METRICA[m], borderColor: COLOR_METRICA[m] }]}
              onPress={() => setMetrica(m)}
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
              <View style={s.chartTop}>
                <Text style={[s.chartTitulo, { color: c.text }]}>{LABEL_METRICA[metrica]} por día</Text>
              </View>
              <Text style={[s.chartHint, { color: c.textMute }]}>
                {isWeb ? 'Pasa el mouse sobre una barra para ver el dato · haz clic para ver ese día' : 'Toca una barra para ver ese día'}
              </Text>
              <Svg width={W} height={H}>
                {/* Rejilla + números del eje Y (cantidad) */}
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <Line key={`g${t}`} x1={padL} y1={y} x2={W - padR} y2={y} stroke={c.border} strokeWidth={1} />
                })}
                {ticks.map(t => {
                  const y = padT + chartH - (t / maxVal) * chartH
                  return <SvgText key={`yt${t}`} x={padL - 8} y={y + 4} fill={c.textMute} fontSize={12} textAnchor="end">{t}</SvgText>
                })}
                {/* Título del eje Y (vertical) */}
                <SvgText x={16} y={padT + chartH / 2} fill={c.textSub} fontSize={12} fontWeight="bold"
                  textAnchor="middle" transform={`rotate(-90, 16, ${padT + chartH / 2})`}>
                  Cantidad
                </SvgText>

                {/* Barras */}
                {dias.map((d, i) => {
                  const val  = d[metrica]
                  const x    = padL + i * gap + (gap - barW) / 2
                  const barH = Math.max(val > 0 ? 4 : 0, (val / maxVal) * chartH)
                  const y    = padT + chartH - barH
                  const act  = hover?.dia === d.dia || diaSel === d.dia
                  return (
                    <Rect
                      key={d.dia}
                      x={x} y={y} width={barW} height={barH} rx={3}
                      fill={colorMet}
                      opacity={(hover || diaSel) && !act ? 0.4 : 1}
                      stroke={act ? c.text : undefined}
                      strokeWidth={act ? 2 : 0}
                      onPress={() => abrirDia(d.dia)}
                    />
                  )
                })}
                {/* Valor encima de la barra (si no son demasiados días) */}
                {dias.length <= 31 && dias.map((d, i) => {
                  const val = d[metrica]
                  if (val === 0) return null
                  const barH = Math.max(4, (val / maxVal) * chartH)
                  const y    = padT + chartH - barH
                  return (
                    <SvgText key={`v${d.dia}`} x={padL + i * gap + gap / 2} y={y - 5}
                      fill={c.text} fontSize={barW < 16 ? 9 : 11} fontWeight="bold" textAnchor="middle">
                      {val}
                    </SvgText>
                  )
                })}
                {/* Área de toda la columna: clic = ver día; en web, hover = tooltip */}
                {dias.map((d, i) => {
                  const webHover = isWeb ? {
                    onMouseEnter: () => setHover({ dia: d.dia, val: d[metrica], i }),
                    onMouseLeave: () => setHover(h => (h?.dia === d.dia ? null : h)),
                  } : {}
                  return (
                    <Rect
                      key={`t${d.dia}`}
                      x={padL + i * gap} y={padT} width={gap} height={chartH}
                      fill="transparent"
                      onPress={() => abrirDia(d.dia)}
                      {...(webHover as any)}
                    />
                  )
                })}
                {/* Fechas del eje X */}
                {dias.map((d, i) => (i % cadaN === 0 ? (
                  <SvgText key={`x${d.dia}`} x={padL + i * gap + gap / 2} y={padT + chartH + 18}
                    fill={c.textMute} fontSize={11} textAnchor="middle">
                    {fmtDiaMes(d.dia)}
                  </SvgText>
                ) : null))}
                {/* Título del eje X */}
                <SvgText x={padL + chartW / 2} y={H - 6} fill={c.textSub} fontSize={12} fontWeight="bold" textAnchor="middle">
                  Fecha
                </SvgText>

                {/* Tooltip (hover): recuadro con la fecha y el dato exacto */}
                {hover && (() => {
                  const cx = padL + hover.i * gap + gap / 2
                  const tw = 118, th = 40
                  const tx = Math.max(padL, Math.min(cx - tw / 2, W - padR - tw))
                  return (
                    <>
                      <Rect x={tx} y={padT + 2} width={tw} height={th} rx={7} fill={c.text} opacity={0.92} />
                      <SvgText x={tx + tw / 2} y={padT + 18} fill={c.bg} fontSize={11} fontWeight="bold" textAnchor="middle">
                        {fmtDiaMes(hover.dia)}
                      </SvgText>
                      <SvgText x={tx + tw / 2} y={padT + 33} fill={c.bg} fontSize={12} fontWeight="bold" textAnchor="middle">
                        {hover.val} {metrica === 'clientes' ? 'clientes' : metrica === 'seguimientos' ? 'seguim.' : 'public.'}
                      </SvgText>
                    </>
                  )
                })()}
              </Svg>
            </View>

            {/* Detalle del día: SOLO lo de la métrica elegida (si ves "Clientes
                nuevos", muestra clientes, no publicaciones). */}
            {diaSel && (() => {
              const detFiltrado = (detalle ?? []).filter(d => d.tipo === TIPO_METRICA[metrica])
              return (
                <View style={[s.detCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={s.detHead}>
                    <Text style={[s.detTitulo, { color: c.text }]}>📅 {fmtCorto(diaSel)} · {LABEL_METRICA[metrica]}</Text>
                    <TouchableOpacity onPress={() => setDiaSel(null)}>
                      <Text style={{ color: c.textMute, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {loadingDet ? (
                    <ActivityIndicator color={TEAL} style={{ marginVertical: 16 }} />
                  ) : detFiltrado.length === 0 ? (
                    <Text style={[s.detVacio, { color: c.textMute }]}>
                      Sin {LABEL_METRICA[metrica].toLowerCase().replace(/[^a-zñáéíóú ]/gi, '').trim()} este día.
                    </Text>
                  ) : (
                    detFiltrado.map((d, i) => (
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
              )
            })()}
          </>
        )}
       </View>
      </ScrollView>

      {/* Selector de fecha libre: cualquier día, aunque esté fuera del rango */}
      <SelectorFecha
        visible={picker}
        onClose={() => setPicker(false)}
        onElegir={(f) => { setPicker(false); abrirDia(f) }}
      />
    </View>
  )
}

// ── Selector de fecha (día / mes / año con flechas, sin dependencias) ────────
function SelectorFecha({ visible, onClose, onElegir }: {
  visible: boolean; onClose: () => void; onElegir: (fecha: string) => void
}) {
  const c = useColors()
  const [f, setF] = useState<string>(hoyMX())

  const d = new Date(f + 'T12:00:00Z')
  const ajustar = (campo: 'd' | 'm' | 'a', delta: number) => {
    const n = new Date(f + 'T12:00:00Z')
    if (campo === 'd') n.setUTCDate(n.getUTCDate() + delta)
    if (campo === 'm') n.setUTCMonth(n.getUTCMonth() + delta)
    if (campo === 'a') n.setUTCFullYear(n.getUTCFullYear() + delta)
    // No permitir fechas futuras.
    if (n.toISOString().slice(0, 10) > hoyMX()) return
    setF(n.toISOString().slice(0, 10))
  }

  const Spin = ({ label, valor, campo }: { label: string; valor: string | number; campo: 'd' | 'm' | 'a' }) => (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={[sf.spinLbl, { color: c.textMute }]}>{label}</Text>
      <TouchableOpacity style={[sf.spinBtn, { borderColor: c.border }]} onPress={() => ajustar(campo, 1)}>
        <Text style={[sf.spinArrow, { color: c.text }]}>▲</Text>
      </TouchableOpacity>
      <Text style={[sf.spinVal, { color: c.text }]}>{valor}</Text>
      <TouchableOpacity style={[sf.spinBtn, { borderColor: c.border }]} onPress={() => ajustar(campo, -1)}>
        <Text style={[sf.spinArrow, { color: c.text }]}>▼</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={sf.overlay}>
        <View style={[sf.box, { backgroundColor: c.card }]}>
          <Text style={[sf.titulo, { color: c.text }]}>Elegir fecha</Text>
          <View style={sf.row}>
            <Spin label="Día" valor={d.getUTCDate()} campo="d" />
            <Spin label="Mes" valor={d.toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' })} campo="m" />
            <Spin label="Año" valor={d.getUTCFullYear()} campo="a" />
          </View>
          <View style={sf.acciones}>
            <TouchableOpacity style={sf.btnCancel} onPress={onClose}>
              <Text style={[sf.btnCancelTxt, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sf.btnOk} onPress={() => onElegir(f)}>
              <Text style={sf.btnOkTxt}>Ver ese día</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  chartTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 2 },
  chartTitulo: { fontSize: 14, fontWeight: '800' },
  chartHint: { fontSize: 11, alignSelf: 'flex-start', marginBottom: 6 },
  fechaBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  fechaBtnTxt: { fontSize: 12, fontWeight: '800' },

  detCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  detHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detTitulo: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  detVacio: { fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  detFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  detIcono: { fontSize: 15 },
  detTxt: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  detHora: { fontSize: 12, fontWeight: '600' },
})

const sf = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { borderRadius: 16, padding: 20, width: '100%', maxWidth: 340 },
  titulo: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 14 },
  row: { flexDirection: 'row', gap: 10 },
  spinLbl: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  spinBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 18, marginVertical: 4 },
  spinArrow: { fontSize: 13 },
  spinVal: { fontSize: 17, fontWeight: '800', minWidth: 44, textAlign: 'center' },
  acciones: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancel: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  btnCancelTxt: { fontSize: 14, fontWeight: '700' },
  btnOk: { flex: 1, backgroundColor: TEAL, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnOkTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
})
