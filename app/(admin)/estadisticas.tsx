import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

// ─── Types ───────────────────────────────────────────────
type Resumen = {
  total_propiedades: number
  total_prospectadores: number
  total_vistas: number
  total_descargas: number
}
type TopPropiedad = { codigo: string; titulo: string; total: number; vistas: number; descargas: number }
type TopProspectador = { nombre?: string; email: string; total: number; vistas: number; descargas: number }
type ActividadDia = { dia: string; total: number }
type Estadisticas = {
  resumen: Resumen
  top_propiedades: TopPropiedad[]
  top_prospectadores: TopProspectador[]
  actividad_7dias: ActividadDia[]
}
type Slice = { label: string; value: number; color: string }

// ─── Colores ─────────────────────────────────────────────
const C = {
  teal:    '#1a6470',
  green:   '#2e7d32',
  amber:   '#c8960c',
  purple:  '#6a1b9a',
  red:     '#c0392b',
  blue:    '#0277bd',
  orange:  '#e65100',
  gray:    '#757575',
}
const PIE_PALETTE = [C.teal, C.green, C.amber, C.purple, C.red, C.blue, C.orange]

// ─── Donut chart ─────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function slicePath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number) {
  const span = endDeg - startDeg
  if (span <= 0.1) return ''
  const gap = span > 5 ? 1.5 : 0
  const s = startDeg + gap / 2
  const e = endDeg - gap / 2
  const large = e - s > 180 ? 1 : 0
  const o1 = polarToCartesian(cx, cy, outerR, s)
  const o2 = polarToCartesian(cx, cy, outerR, e)
  const i1 = polarToCartesian(cx, cy, innerR, e)
  const i2 = polarToCartesian(cx, cy, innerR, s)
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function DonutChart({ slices, size = 160, centerText, centerSub }: {
  slices: Slice[]
  size?: number
  centerText?: string
  centerSub?: string
}) {
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 6
  const innerR = outerR * 0.58
  const total = slices.reduce((s, x) => s + x.value, 0)

  if (total === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ccc', fontSize: 12 }}>Sin datos</Text>
      </View>
    )
  }

  let current = 0
  const paths = slices.map((slice) => {
    const startDeg = (current / total) * 360
    current += slice.value
    const endDeg = (current / total) * 360
    return { ...slice, path: slicePath(cx, cy, outerR, innerR, startDeg, endDeg) }
  })

  return (
    <Svg width={size} height={size}>
      {paths.map((p, i) =>
        p.path ? <Path key={i} d={p.path} fill={p.color} /> : null
      )}
      {centerText && (
        <SvgText
          x={cx}
          y={centerSub ? cy - 4 : cy + 6}
          textAnchor="middle"
          fill="#1a6470"
          fontSize={centerSub ? 22 : 18}
          fontWeight="bold"
        >
          {centerText}
        </SvgText>
      )}
      {centerSub && (
        <SvgText x={cx} y={cy + 16} textAnchor="middle" fill="#aaa" fontSize={11}>
          {centerSub}
        </SvgText>
      )}
    </Svg>
  )
}

function PieLegend({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <View style={{ gap: 7, flex: 1, justifyContent: 'center' }}>
      {slices.map((s, i) => (
        <View key={i} style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: s.color }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>{s.label}</Text>
          <Text style={styles.legendVal}>{s.value}</Text>
          <Text style={styles.legendPct}>
            {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%'}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── Barra actividad ─────────────────────────────────────
function BarActividad({ dia, valor, max }: { dia: string; valor: number; max: number }) {
  const pct = max > 0 ? valor / max : 0
  const barH = Math.max(pct * 80, valor > 0 ? 4 : 0)
  return (
    <View style={styles.barCol}>
      <Text style={styles.barNum}>{valor > 0 ? valor : ''}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { height: barH }]} />
      </View>
      <Text style={styles.barDia}>{dia}</Text>
    </View>
  )
}

// ─── Ranking row ─────────────────────────────────────────
function RankRow({ pos, label, sublabel, valor, max, color }: {
  pos: number; label: string; sublabel?: string; valor: number; max: number; color: string
}) {
  const pct = max > 0 ? valor / max : 0
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankPos}>{pos}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.rankTopRow}>
          <Text style={styles.rankLabel} numberOfLines={1}>{label}</Text>
          <Text style={[styles.rankVal, { color }]}>{valor}</Text>
        </View>
        {sublabel && <Text style={styles.rankSub}>{sublabel}</Text>}
        <View style={styles.rankTrack}>
          <View style={[styles.rankFill, { width: `${Math.max(pct * 100, 3)}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  )
}

// ─── Card wrapper ─────────────────────────────────────────
function Card({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {titulo && <Text style={styles.cardTitulo}>{titulo}</Text>}
      {children}
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────
export default function Estadisticas() {
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const [propDist, setPropDist] = useState<{ tipo: string | null; operacion: string | null; estado: string | null }[]>([])
  const [clienteDist, setClienteDist] = useState<{ estado: string }[]>([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    const [rpcRes, propRes, crmRes] = await Promise.all([
      supabase.rpc('get_estadisticas_admin'),
      supabase.from('propiedades').select('tipo, operacion, estado'),
      supabase.from('clientes').select('estado'),
    ])
    if (!rpcRes.error && rpcRes.data) setStats(rpcRes.data as Estadisticas)
    setPropDist(propRes.data ?? [])
    setClienteDist(crmRes.data ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={styles.loadingText}>Cargando estadísticas…</Text>
      </View>
    )
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudieron cargar las estadísticas.</Text>
        <TouchableOpacity onPress={cargar} style={styles.reintentarBtn}>
          <Text style={styles.reintentarText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const { resumen, top_propiedades, top_prospectadores, actividad_7dias } = stats

  // ── Distribución propiedades ──
  const tipoCount = { casa: 0, departamento: 0, local: 0, otro: 0 }
  const opCount   = { venta: 0, renta: 0 }
  const estCount  = { disponible: 0, vendida: 0 }
  for (const p of propDist) {
    if (p.tipo === 'casa') tipoCount.casa++
    else if (p.tipo === 'departamento') tipoCount.departamento++
    else if (p.tipo === 'local') tipoCount.local++
    else tipoCount.otro++

    if (p.operacion === 'venta') opCount.venta++
    else if (p.operacion === 'renta') opCount.renta++

    if (p.estado === 'disponible') estCount.disponible++
    else if (p.estado === 'vendida') estCount.vendida++
  }

  const slicesTipo: Slice[] = [
    { label: 'Casa', value: tipoCount.casa, color: C.teal },
    { label: 'Departamento', value: tipoCount.departamento, color: C.green },
    { label: 'Local', value: tipoCount.local, color: C.amber },
    ...(tipoCount.otro > 0 ? [{ label: 'Otro', value: tipoCount.otro, color: C.gray }] : []),
  ].filter(s => s.value > 0)

  const slicesOp: Slice[] = [
    { label: 'Venta', value: opCount.venta, color: C.teal },
    { label: 'Renta', value: opCount.renta, color: C.amber },
  ].filter(s => s.value > 0)

  const slicesEst: Slice[] = [
    { label: 'Disponible', value: estCount.disponible, color: C.green },
    { label: 'Vendida', value: estCount.vendida, color: C.red },
  ].filter(s => s.value > 0)

  // ── Distribución CRM ──
  const crmCount: Record<string, number> = {}
  for (const c of clienteDist) {
    crmCount[c.estado] = (crmCount[c.estado] ?? 0) + 1
  }
  const CRM_LABELS: Record<string, string> = {
    por_perfilar: 'Por perfilar',
    no_contesta: 'No contesta',
    cita_por_agendar: 'Cita x agendar',
    cita_agendada: 'Cita agendada',
    seguimiento_cierre: 'Seg. cierre',
    compro: 'Compró',
    descartado: 'Descartado',
  }
  const slicesCRM: Slice[] = Object.entries(crmCount)
    .sort((a, b) => b[1] - a[1])
    .map(([estado, val], i) => ({
      label: CRM_LABELS[estado] ?? estado,
      value: val,
      color: PIE_PALETTE[i % PIE_PALETTE.length],
    }))

  // ── Vistas vs Descargas ──
  const slicesEngagement: Slice[] = [
    { label: 'Vistas', value: resumen.total_vistas, color: C.teal },
    { label: 'Descargas', value: resumen.total_descargas, color: C.amber },
  ].filter(s => s.value > 0)

  // ── Actividad 7 días ──
  const maxAct = actividad_7dias.length > 0 ? Math.max(...actividad_7dias.map(d => d.total), 1) : 1
  const maxProp = top_propiedades.length > 0 ? top_propiedades[0].total : 1
  const maxProsp = top_prospectadores.length > 0 ? top_prospectadores[0].total : 1

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(admin)/propiedades')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Estadísticas</Text>

      {/* KPI Cards */}
      <View style={styles.kpiGrid}>
        <KpiCard label="Propiedades" value={resumen.total_propiedades} color={C.teal} icon="🏠" />
        <KpiCard label="Prospectadores" value={resumen.total_prospectadores} color={C.green} icon="👥" />
        <KpiCard label="Vistas" value={resumen.total_vistas} color={C.blue} icon="👁" />
        <KpiCard label="Descargas" value={resumen.total_descargas} color={C.amber} icon="📥" />
      </View>

      {/* Propiedades: tipo y operación */}
      {propDist.length > 0 && (
        <>
          <View style={styles.rowCards}>
            <Card titulo="Por tipo">
              <View style={styles.pieRow}>
                <DonutChart
                  slices={slicesTipo}
                  size={130}
                  centerText={String(propDist.length)}
                  centerSub="total"
                />
                <PieLegend slices={slicesTipo} total={propDist.length} />
              </View>
            </Card>

            <Card titulo="Por operación">
              <View style={styles.pieRow}>
                <DonutChart
                  slices={slicesOp}
                  size={130}
                  centerText={String(propDist.length)}
                  centerSub="total"
                />
                <PieLegend slices={slicesOp} total={propDist.length} />
              </View>
            </Card>
          </View>

          <Card titulo="Por estado">
            <View style={styles.pieRowCenter}>
              <DonutChart
                slices={slicesEst}
                size={150}
                centerText={String(propDist.length)}
                centerSub="propiedades"
              />
              <PieLegend slices={slicesEst} total={propDist.length} />
            </View>
          </Card>
        </>
      )}

      {/* CRM */}
      {slicesCRM.length > 0 && (
        <Card titulo="Clientes CRM — por etapa">
          <View style={styles.pieRowCenter}>
            <DonutChart
              slices={slicesCRM}
              size={160}
              centerText={String(clienteDist.length)}
              centerSub="clientes"
            />
            <PieLegend slices={slicesCRM} total={clienteDist.length} />
          </View>
        </Card>
      )}

      {/* Engagement */}
      {(resumen.total_vistas > 0 || resumen.total_descargas > 0) && (
        <Card titulo="Vistas vs Descargas">
          <View style={styles.pieRowCenter}>
            <DonutChart
              slices={slicesEngagement}
              size={150}
              centerText={String(resumen.total_vistas + resumen.total_descargas)}
              centerSub="acciones"
            />
            <PieLegend slices={slicesEngagement} total={resumen.total_vistas + resumen.total_descargas} />
          </View>
        </Card>
      )}

      {/* Actividad 7 días */}
      <Card titulo="Actividad — últimos 7 días">
        {actividad_7dias.length === 0 ? (
          <Text style={styles.sinDatos}>Sin actividad reciente</Text>
        ) : (
          <View style={styles.barChartRow}>
            {actividad_7dias.map((d) => (
              <BarActividad key={d.dia} dia={d.dia} valor={d.total} max={maxAct} />
            ))}
          </View>
        )}
      </Card>

      {/* Top propiedades */}
      <Card titulo="Propiedades más activas">
        {top_propiedades.length === 0 ? (
          <Text style={styles.sinDatos}>Sin datos aún</Text>
        ) : (
          top_propiedades.map((p, i) => (
            <RankRow
              key={p.codigo}
              pos={i + 1}
              label={p.codigo}
              sublabel={`${p.vistas} vistas · ${p.descargas} descargas`}
              valor={p.total}
              max={maxProp}
              color={C.teal}
            />
          ))
        )}
      </Card>

      {/* Top prospectadores */}
      <Card titulo="Prospectadores más activos">
        {top_prospectadores.length === 0 ? (
          <Text style={styles.sinDatos}>Sin datos aún</Text>
        ) : (
          top_prospectadores.map((p, i) => (
            <RankRow
              key={p.email}
              pos={i + 1}
              label={p.nombre ?? p.email.split('@')[0]}
              sublabel={`${p.vistas} vistas · ${p.descargas} descargas`}
              valor={p.total}
              max={maxProsp}
              color={C.amber}
            />
          ))
        )}
      </Card>
    </ScrollView>
  )
}

function KpiCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Text style={styles.kpiIcon}>{icon}</Text>
      <Text style={[styles.kpiNum, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#aaa', marginTop: 12, fontSize: 13 },
  errorText: { color: '#aaa', fontSize: 15, marginBottom: 16 },
  reintentarBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  reintentarText: { color: C.teal, fontWeight: '600' },

  backBtn: { alignSelf: 'flex-start', paddingVertical: 14, paddingRight: 12 },
  backBtnText: { color: C.teal, fontSize: 15, fontWeight: '600' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#1a2e35', marginBottom: 16 },

  // KPI
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiIcon: { fontSize: 22, marginBottom: 6 },
  kpiNum: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  kpiLabel: { fontSize: 12, color: '#999', marginTop: 3, fontWeight: '600' },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 16,
  },

  // Row de cards side by side
  rowCards: { flexDirection: 'row', gap: 10, marginBottom: 14 },

  // Pie
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pieRowCenter: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  // Legend
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 12, color: '#555' },
  legendVal: { fontSize: 13, fontWeight: '700', color: '#1a2e35', width: 28, textAlign: 'right' },
  legendPct: { fontSize: 11, color: '#bbb', width: 34, textAlign: 'right' },

  // Bar chart vertical
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120 },
  barCol: { alignItems: 'center', flex: 1 },
  barNum: { fontSize: 10, color: C.teal, fontWeight: '700', marginBottom: 3, height: 14 },
  barTrack: { width: 28, height: 80, justifyContent: 'flex-end', backgroundColor: '#f0f0f0', borderRadius: 6, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: C.teal, borderRadius: 6 },
  barDia: { fontSize: 10, color: '#aaa', marginTop: 5, textAlign: 'center' },

  // Ranking
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  rankPos: { fontSize: 16, fontWeight: '800', color: '#ddd', width: 22, textAlign: 'center' },
  rankTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  rankLabel: { fontSize: 14, fontWeight: '700', color: '#1a2e35', flex: 1 },
  rankVal: { fontSize: 15, fontWeight: '800' },
  rankSub: { fontSize: 11, color: '#bbb', marginBottom: 5 },
  rankTrack: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  rankFill: { height: '100%', borderRadius: 3 },

  sinDatos: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingVertical: 12 },
})
