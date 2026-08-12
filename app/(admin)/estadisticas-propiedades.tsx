import React from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type Row = { codigo: string; titulo: string; dev: string | null; veces: number }
type Dev = { desarrollo: string; propiedades: number; veces: number }
type Stats = {
  total_publicaciones: number
  propiedades_totales: number
  propiedades_publicadas: number
  nunca_publicadas: number
  top: Row[]
  menos: Row[]
  nunca: { codigo: string; titulo: string; dev: string | null }[]
  por_desarrollo: Dev[]
}

const TEAL = '#0277BD'

export default function EstadisticasPropiedades() {
  const c = useColors()

  const { data, isLoading, error, refetch, isRefetching } = useQuery<Stats>({
    queryKey: ['estadisticas-publicaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('estadisticas_publicaciones')
      if (error) throw error
      return data as Stats
    },
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>
  if (error || !data) return (
    <View style={[s.center, { backgroundColor: c.bg }]}>
      <Text style={{ fontSize: 34 }}>📊</Text>
      <Text style={[s.muted, { color: c.textMute }]}>No se pudieron cargar las estadísticas.</Text>
    </View>
  )

  const maxDev = Math.max(1, ...data.por_desarrollo.map(d => d.veces))
  const maxTop = Math.max(1, ...data.top.map(r => r.veces))

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1000, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text style={[s.title, { color: c.text }]}>📊 Estadísticas de publicaciones</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Cuántas veces se ha publicado cada propiedad. Útil para ver dónde sobra o falta empuje.</Text>

      {/* KPIs */}
      <View style={s.kpiRow}>
        <Kpi c={c} label="Publicaciones totales" value={data.total_publicaciones.toLocaleString('es-MX')} color={TEAL} />
        <Kpi c={c} label="Propiedades publicadas" value={`${data.propiedades_publicadas}`} sub={`de ${data.propiedades_totales}`} color="#16a34a" />
        <Kpi c={c} label="Nunca publicadas" value={`${data.nunca_publicadas}`} color="#ef4444" />
      </View>

      {/* Por desarrollo — barras */}
      <Section c={c} title="Por desarrollo / zona" hint="Desarrollos con nombre, por total de publicaciones">
        {data.por_desarrollo.length === 0 ? (
          <Text style={[s.muted, { color: c.textMute }]}>Sin datos de desarrollos.</Text>
        ) : data.por_desarrollo.map((d, i) => (
          <View key={i} style={s.barRow}>
            <Text style={[s.barLabel, { color: c.text }]} numberOfLines={1}>{d.desarrollo}</Text>
            <View style={[s.barTrack, { backgroundColor: c.border }]}>
              <View style={[s.barFill, { width: `${(d.veces / maxDev) * 100}%`, backgroundColor: TEAL }]} />
            </View>
            <Text style={[s.barVal, { color: c.textSub }]}>{d.veces}</Text>
          </View>
        ))}
      </Section>

      {/* Más publicadas */}
      <Section c={c} title="🔝 Más publicadas" hint="Ranking de propiedades individuales">
        <Tabla c={c} rows={data.top} max={maxTop} barColor="#16a34a" />
      </Section>

      {/* Menos publicadas */}
      <Section c={c} title="🔻 Menos publicadas" hint="Las que casi no se empujan (con al menos 1 publicación)">
        <Tabla c={c} rows={data.menos} max={maxTop} barColor="#f59e0b" />
      </Section>

      {/* Nunca publicadas — lista */}
      {data.nunca_publicadas > 0 && (
        <Section c={c} title="🚫 Nunca publicadas" hint={`${data.nunca_publicadas} propiedades sin una sola publicación — aquí empieza a mover inventario`}>
          {(data.nunca ?? []).map((r, i) => (
            <View key={r.codigo + i} style={[s.trow, { borderColor: c.border }]}>
              <Text style={[s.tCodigo, { color: '#ef4444' }]}>{r.codigo}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.tTitulo, { color: c.text }]} numberOfLines={1}>{r.titulo}</Text>
                {r.dev ? <Text style={[s.tDev, { color: c.textMute }]} numberOfLines={1}>{r.dev}</Text> : null}
              </View>
              <Text style={[s.tVeces, { color: '#ef4444' }]}>0</Text>
            </View>
          ))}
          {data.nunca_publicadas > (data.nunca?.length ?? 0) && (
            <Text style={[s.muted, { color: c.textMute, marginTop: 8 }]}>…y {data.nunca_publicadas - (data.nunca?.length ?? 0)} más.</Text>
          )}
        </Section>
      )}
    </ScrollView>
  )
}

function Kpi({ c, label, value, sub, color }: any) {
  return (
    <View style={[s.kpi, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      {sub ? <Text style={[s.kpiSub, { color: c.textMute }]}>{sub}</Text> : null}
      <Text style={[s.kpiLabel, { color: c.textSub }]}>{label}</Text>
    </View>
  )
}

function Section({ c, title, hint, children }: any) {
  return (
    <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.secTitle, { color: c.text }]}>{title}</Text>
      {hint ? <Text style={[s.secHint, { color: c.textMute }]}>{hint}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  )
}

function Tabla({ c, rows, max, barColor }: { c: any; rows: Row[]; max: number; barColor: string }) {
  if (!rows || rows.length === 0) return <Text style={[s.muted, { color: c.textMute }]}>Sin datos.</Text>
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.codigo + i} style={[s.trow, { borderColor: c.border }]}>
          <Text style={[s.tCodigo, { color: barColor }]}>{r.codigo}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.tTitulo, { color: c.text }]} numberOfLines={1}>{r.titulo}</Text>
            {r.dev ? <Text style={[s.tDev, { color: c.textMute }]} numberOfLines={1}>{r.dev}</Text> : null}
            <View style={[s.miniTrack, { backgroundColor: c.border }]}>
              <View style={{ height: 4, borderRadius: 2, width: `${(r.veces / max) * 100}%`, backgroundColor: barColor }} />
            </View>
          </View>
          <Text style={[s.tVeces, { color: c.text }]}>{r.veces}</Text>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  muted: { fontSize: 14, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 19 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  kpi: { flex: 1, minWidth: 150, borderWidth: 1, borderRadius: 14, padding: 14 },
  kpiVal: { fontSize: 26, fontWeight: '900' },
  kpiSub: { fontSize: 12, marginTop: -2 },
  kpiLabel: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  secTitle: { fontSize: 17, fontWeight: '800' },
  secHint: { fontSize: 12.5, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  barLabel: { width: 150, fontSize: 13, fontWeight: '600' },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: 14, borderRadius: 7 },
  barVal: { width: 42, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  tCodigo: { width: 74, fontSize: 12.5, fontWeight: '800' },
  tTitulo: { fontSize: 14, fontWeight: '600' },
  tDev: { fontSize: 11.5, marginTop: 1 },
  miniTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  tVeces: { width: 40, textAlign: 'right', fontSize: 15, fontWeight: '900' },
  aviso: { borderWidth: 1.5, borderRadius: 12, padding: 14, marginTop: 4 },
  avisoTxt: { fontSize: 13.5, lineHeight: 19 },
})
