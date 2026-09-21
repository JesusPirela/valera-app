// Panel ejecutivo (cockpit) — reúne en UNA vista los KPIs clave del negocio,
// el embudo de conversión y accesos a las estadísticas de detalle. NO duplica
// ni modifica las pantallas existentes: sólo consolida y enlaza. Todos los
// números salen de queries reales (clientes, citas_coordinacion, cierres,
// citas_venta, get_ranking); nada inventado.
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const TEAL = '#1a6470'

type Periodo = 'hoy' | 'semana' | 'mes' | 'total'
const PERIODOS: { v: Periodo; label: string }[] = [
  { v: 'hoy', label: 'Hoy' }, { v: 'semana', label: 'Semana' }, { v: 'mes', label: 'Mes' }, { v: 'total', label: 'Total' },
]
function desdeISO(p: Periodo): string | null {
  const now = new Date()
  if (p === 'hoy') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString() }
  if (p === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString() }
  if (p === 'mes') { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString() }
  return null
}

type RankRow = { id: string; nombre: string; citas_realizadas?: number; ventas_cerradas?: number; rentas_cerradas?: number; posicion?: number }
type Datos = {
  leads: number; clientesNuevos: number; citas: number; cierres: number
  estancadas: number; segVencidos: number; ranking: RankRow[]
}
const VACIO: Datos = { leads: 0, clientesNuevos: 0, citas: 0, cierres: 0, estancadas: 0, segVencidos: 0, ranking: [] }

const ESTADOS_TERMINALES = '("cancelada","realizada","escrituracion","aparto","firma_contrato")'

export default function Cockpit() {
  const c = useColors()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [d, setD] = useState<Datos>(VACIO)

  const cargar = useCallback(async (p: Periodo, silent = false) => {
    if (!silent) setLoading(true)
    const desde = desdeISO(p)
    const hace3dias = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const ahora = new Date().toISOString()
    const rango = <T extends { gte: (col: string, v: string) => T }>(q: T) => (desde ? q.gte('created_at', desde) : q)
    try {
      const [leadsR, cliR, citasR, cierresR, estR, segR, rankR] = await Promise.all([
        rango(supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('es_lead_campania', true) as any),
        rango(supabase.from('clientes').select('id', { count: 'exact', head: true }) as any),
        rango(supabase.from('citas_coordinacion').select('id', { count: 'exact', head: true }) as any),
        rango(supabase.from('cierres').select('id', { count: 'exact', head: true }) as any),
        supabase.from('citas_coordinacion').select('id', { count: 'exact', head: true })
          .lte('updated_at', hace3dias).not('estado', 'in', ESTADOS_TERMINALES),
        supabase.from('citas_venta').select('id', { count: 'exact', head: true })
          .not('fecha_prox_seguimiento_ts', 'is', null).lt('fecha_prox_seguimiento_ts', ahora),
        supabase.rpc('get_ranking'),
      ])
      setD({
        leads: leadsR.count ?? 0,
        clientesNuevos: cliR.count ?? 0,
        citas: citasR.count ?? 0,
        cierres: cierresR.count ?? 0,
        estancadas: estR.count ?? 0,
        segVencidos: segR.count ?? 0,
        ranking: ((rankR.data ?? []) as RankRow[]).slice(0, 5),
      })
    } catch {
      // Sin red: se conserva lo anterior y no se cuelga.
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { cargar(periodo, true) }, [cargar, periodo]))

  function cambiarPeriodo(p: Periodo) { setPeriodo(p); cargar(p) }
  function onRefresh() { setRefreshing(true); cargar(periodo, true) }

  const convCita = d.clientesNuevos > 0 ? Math.round((d.citas / d.clientesNuevos) * 100) : 0
  const convCierre = d.citas > 0 ? Math.round((d.cierres / d.citas) * 100) : 0
  const maxFunnel = Math.max(d.clientesNuevos, d.citas, d.cierres, 1)
  const maxRank = Math.max(...d.ranking.map(r => r.citas_realizadas ?? 0), 1)

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={st.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
    >
      <Text style={[st.h1, { color: c.text }]}>Panel ejecutivo</Text>

      {/* Período */}
      <View style={st.periodoRow}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.v} onPress={() => cambiarPeriodo(p.v)}
            style={[st.periodoBtn, { backgroundColor: c.card, borderColor: c.border }, periodo === p.v && st.periodoOn]}>
            <Text style={[st.periodoTxt, { color: periodo === p.v ? '#fff' : c.textMute }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* KPIs */}
      <View style={st.kpiRow}>
        <Kpi label="Leads campaña" value={d.leads} icon="📣" color="#1565c0" onPress={() => router.push('/(admin)/leads-campanias')} c={c} />
        <Kpi label="Clientes nuevos" value={d.clientesNuevos} icon="👤" color="#7c3aed" onPress={() => router.push('/(admin)/crm')} c={c} />
        <Kpi label="Citas" value={d.citas} icon="📅" color={TEAL} onPress={() => router.push('/(admin)/coordinacion-citas')} c={c} />
        <Kpi label="Cierres" value={d.cierres} icon="🏆" color="#c2410c" onPress={() => router.push('/(admin)/cierres')} c={c} />
      </View>

      {/* Embudo de conversión */}
      <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[st.cardTit, { color: c.text }]}>Embudo del período</Text>
        <FunnelBar label="Clientes nuevos" value={d.clientesNuevos} max={maxFunnel} color="#7c3aed" c={c} />
        <ConvTag pct={convCita} texto={`${convCita}% agenda cita`} c={c} />
        <FunnelBar label="Citas" value={d.citas} max={maxFunnel} color={TEAL} c={c} />
        <ConvTag pct={convCierre} texto={`${convCierre}% cierra`} c={c} />
        <FunnelBar label="Cierres" value={d.cierres} max={maxFunnel} color="#c2410c" c={c} />
      </View>

      {/* Alertas accionables */}
      <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[st.cardTit, { color: c.text }]}>Requiere atención</Text>
        <Alerta icon="⚠️" texto="Citas estancadas (+3 días sin mover)" value={d.estancadas}
          color="#b45309" onPress={() => router.push('/(admin)/coordinacion-citas')} c={c} />
        <Alerta icon="🔔" texto="Seguimientos vencidos" value={d.segVencidos}
          color="#dc2626" onPress={() => router.push('/(admin)/citas-venta')} c={c} />
      </View>

      {/* Ranking */}
      <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={st.cardHead}>
          <Text style={[st.cardTit, { color: c.text, marginBottom: 0 }]}>Top asesores</Text>
          <TouchableOpacity onPress={() => router.push('/(prospectador)/ranking')}><Text style={st.verMas}>Ver ranking ›</Text></TouchableOpacity>
        </View>
        {d.ranking.length === 0 ? (
          <Text style={[st.sinDatos, { color: c.textMute }]}>Sin datos de ranking.</Text>
        ) : d.ranking.map((r, i) => {
          const citas = r.citas_realizadas ?? 0
          const cierres = (r.ventas_cerradas ?? 0) + (r.rentas_cerradas ?? 0)
          return (
            <View key={r.id} style={st.rankRow}>
              <Text style={[st.rankPos, { color: i === 0 ? '#c9a84c' : c.textMute }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <View style={st.rankTop}>
                  <Text style={[st.rankName, { color: c.text }]} numberOfLines={1}>{r.nombre}</Text>
                  <Text style={[st.rankVal, { color: TEAL }]}>{citas} citas · {cierres} 🏆</Text>
                </View>
                <View style={[st.rankTrack, { backgroundColor: c.border }]}>
                  <View style={[st.rankFill, { width: `${Math.max((citas / maxRank) * 100, 3)}%` as any }]} />
                </View>
              </View>
            </View>
          )
        })}
      </View>

      {/* Accesos a estadísticas de detalle (no duplica: enlaza) */}
      <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[st.cardTit, { color: c.text }]}>Ver a detalle</Text>
        <View style={st.linkGrid}>
          {[
            { icon: '📊', label: 'Estadísticas', route: '/(admin)/estadisticas' },
            { icon: '📈', label: 'Productividad', route: '/(admin)/reportes' },
            { icon: '⏱️', label: 'Conexión', route: '/(admin)/conexion-usuarios' },
            { icon: '📤', label: 'Publicaciones', route: '/(admin)/estadisticas-propiedades' },
            { icon: '🧩', label: 'Bloques', route: '/(admin)/bloques' },
            { icon: '🏆', label: 'Cierres', route: '/(admin)/cierres' },
          ].map(l => (
            <TouchableOpacity key={l.route} style={[st.linkBtn, { borderColor: c.border }]} onPress={() => router.push(l.route as any)} activeOpacity={0.75}>
              <Text style={st.linkIcon}>{l.icon}</Text>
              <Text style={[st.linkLabel, { color: c.textSub }]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

function Kpi({ label, value, icon, color, onPress, c }: { label: string; value: number; icon: string; color: string; onPress: () => void; c: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity style={[st.kpi, { backgroundColor: c.card, borderLeftColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={st.kpiIcon}>{icon}</Text>
      <Text style={[st.kpiVal, { color }]}>{value}</Text>
      <Text style={[st.kpiLabel, { color: c.textMute }]}>{label}</Text>
    </TouchableOpacity>
  )
}
function FunnelBar({ label, value, max, color, c }: { label: string; value: number; max: number; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={st.funnelRow}>
      <Text style={[st.funnelLabel, { color: c.textSub }]}>{label}</Text>
      <View style={[st.funnelTrack, { backgroundColor: c.border }]}>
        <View style={[st.funnelFill, { width: `${Math.max((value / max) * 100, 4)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[st.funnelVal, { color: c.text }]}>{value}</Text>
    </View>
  )
}
function ConvTag({ pct, texto, c }: { pct: number; texto: string; c: ReturnType<typeof useColors> }) {
  return <Text style={[st.convTag, { color: c.textMute }]}>↓ {texto}</Text>
}
function Alerta({ icon, texto, value, color, onPress, c }: { icon: string; texto: string; value: number; color: string; onPress: () => void; c: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity style={st.alertaRow} onPress={onPress} activeOpacity={0.75}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={[st.alertaTxt, { color: c.textSub }]} numberOfLines={1}>{texto}</Text>
      <View style={[st.alertaBadge, { backgroundColor: value > 0 ? color + '22' : c.border }]}>
        <Text style={[st.alertaBadgeTxt, { color: value > 0 ? color : c.textMute }]}>{value}</Text>
      </View>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 40, gap: 14 },
  h1: { fontSize: 22, fontWeight: '900' },
  periodoRow: { flexDirection: 'row', gap: 8 },
  periodoBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, borderWidth: 1, alignItems: 'center' },
  periodoOn: { backgroundColor: TEAL, borderColor: TEAL },
  periodoTxt: { fontSize: 13, fontWeight: '800' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flex: 1, minWidth: 150, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  kpiIcon: { fontSize: 20, marginBottom: 6 },
  kpiVal: { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  kpiLabel: { fontSize: 11.5, fontWeight: '700', marginTop: 2 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTit: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  verMas: { fontSize: 12, color: TEAL, fontWeight: '700' },
  sinDatos: { fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  funnelLabel: { fontSize: 12.5, fontWeight: '700', width: 108 },
  funnelTrack: { flex: 1, height: 22, borderRadius: 6, overflow: 'hidden' },
  funnelFill: { height: '100%', borderRadius: 6 },
  funnelVal: { fontSize: 14, fontWeight: '900', width: 44, textAlign: 'right' },
  convTag: { fontSize: 11, fontWeight: '700', marginLeft: 118, marginVertical: 3 },
  alertaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  alertaTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  alertaBadge: { minWidth: 30, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center' },
  alertaBadgeTxt: { fontSize: 13, fontWeight: '900' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  rankPos: { fontSize: 16, fontWeight: '900', width: 20, textAlign: 'center' },
  rankTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rankName: { fontSize: 13.5, fontWeight: '700', flex: 1, marginRight: 8 },
  rankVal: { fontSize: 12, fontWeight: '800' },
  rankTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  rankFill: { height: '100%', borderRadius: 3, backgroundColor: TEAL },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  linkIcon: { fontSize: 17 },
  linkLabel: { fontSize: 13, fontWeight: '700' },
})
