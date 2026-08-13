import React, { useState, useMemo } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
  por_desarrollo: Dev[]
  todas: Row[]
}

const TEAL = '#0277BD'
type Filtro = 'todas' | 'publicadas' | 'nunca'

function norm(s: string | null): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}

export default function EstadisticasPropiedades() {
  const c = useColors()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [ordenDesc, setOrdenDesc] = useState(true)
  const [devAbierto, setDevAbierto] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isRefetching } = useQuery<Stats>({
    queryKey: ['estadisticas-publicaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('estadisticas_publicaciones')
      if (error) throw error
      return data as Stats
    },
    staleTime: 1000 * 60 * 5,
  })

  const lista = useMemo(() => {
    if (!data) return []
    let arr = data.todas
    if (filtro === 'publicadas') arr = arr.filter(r => r.veces > 0)
    else if (filtro === 'nunca') arr = arr.filter(r => r.veces === 0)
    const q = norm(busqueda.trim())
    if (q) arr = arr.filter(r => norm(r.codigo).includes(q) || norm(r.titulo).includes(q) || norm(r.dev).includes(q))
    arr = [...arr].sort((a, b) => ordenDesc ? b.veces - a.veces : a.veces - b.veces)
    return arr
  }, [data, filtro, busqueda, ordenDesc])

  if (isLoading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>
  if (error || !data) return (
    <View style={[s.center, { backgroundColor: c.bg }]}>
      <Text style={{ fontSize: 34 }}>📊</Text>
      <Text style={[s.muted, { color: c.textMute }]}>No se pudieron cargar las estadísticas.</Text>
    </View>
  )

  const maxDev = Math.max(1, ...data.por_desarrollo.map(d => d.veces))
  const maxVeces = Math.max(1, ...data.todas.map(r => r.veces))

  const header = (
    <View>
      <Text style={[s.title, { color: c.text }]}>📊 Estadísticas de publicaciones</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Cuántas veces se ha publicado cada propiedad. Filtra a "Nunca" para ver todo lo que no se ha movido.</Text>

      <View style={s.kpiRow}>
        <Kpi c={c} label="Publicaciones" value={data.total_publicaciones.toLocaleString('es-MX')} color={TEAL} />
        <Kpi c={c} label="Publicadas" value={`${data.propiedades_publicadas}`} sub={`de ${data.propiedades_totales}`} color="#16a34a" />
        <Kpi c={c} label="Nunca publicadas" value={`${data.nunca_publicadas}`} color="#ef4444" />
      </View>

      {/* Por desarrollo */}
      <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.secTitle, { color: c.text }]}>Por desarrollo / zona</Text>
        <Text style={[s.secHint, { color: c.textMute }]}>Desarrollos con nombre, por total de publicaciones</Text>
        <Text style={[s.secHint, { color: c.textMute, marginTop: 2 }]}>👆 Toca un desarrollo para ver sus propiedades</Text>
        <View style={{ marginTop: 10 }}>
          {data.por_desarrollo.map((d, i) => {
            const abierto = devAbierto === d.desarrollo
            return (
              <View key={i}>
                <TouchableOpacity style={s.barRow} activeOpacity={0.7} onPress={() => setDevAbierto(abierto ? null : d.desarrollo)}>
                  <Text style={[s.barLabel, { color: abierto ? TEAL : c.text, fontWeight: abierto ? '800' : '600' }]} numberOfLines={1}>{d.desarrollo}</Text>
                  <View style={[s.barTrack, { backgroundColor: c.border }]}>
                    <View style={[s.barFill, { width: `${(d.veces / maxDev) * 100}%`, backgroundColor: TEAL }]} />
                  </View>
                  <Text style={[s.barVal, { color: c.textSub }]}>{d.veces}</Text>
                </TouchableOpacity>
                {abierto && (
                  <DetalleDesarrollo c={c} props={data.todas.filter(t => t.dev === d.desarrollo)} />
                )}
              </View>
            )
          })}
        </View>
      </View>

      {/* Controles del listado completo */}
      <Text style={[s.secTitle, { color: c.text, marginBottom: 8 }]}>Todas las propiedades ({lista.length})</Text>
      <View style={s.chips}>
        {([['todas', 'Todas'], ['publicadas', 'Publicadas'], ['nunca', 'Nunca']] as [Filtro, string][]).map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[s.chip, { borderColor: c.border }, filtro === k && { backgroundColor: TEAL, borderColor: TEAL }]} onPress={() => setFiltro(k)}>
            <Text style={[s.chipTxt, { color: filtro === k ? '#fff' : c.textSub }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.chip, { borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={() => setOrdenDesc(o => !o)}>
          <Ionicons name={ordenDesc ? 'arrow-down' : 'arrow-up'} size={13} color={c.textSub} />
          <Text style={[s.chipTxt, { color: c.textSub }]}>{ordenDesc ? 'Más' : 'Menos'}</Text>
        </TouchableOpacity>
      </View>
      <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={16} color={c.textMute} style={{ marginRight: 8 }} />
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder="Buscar por código, título o desarrollo…"
          placeholderTextColor={c.textMute}
          value={busqueda} onChangeText={setBusqueda}
          autoCapitalize="none" autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={17} color={c.textMute} /></TouchableOpacity>
        )}
      </View>
    </View>
  )

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 1000, width: '100%', alignSelf: 'center' }}
      data={lista}
      keyExtractor={(r, i) => r.codigo + i}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      initialNumToRender={20}
      windowSize={11}
      ListEmptyComponent={<Text style={[s.muted, { color: c.textMute, marginTop: 20 }]}>Sin resultados.</Text>}
      renderItem={({ item: r }) => {
        const col = r.veces === 0 ? '#ef4444' : r.veces >= maxVeces * 0.5 ? '#16a34a' : '#f59e0b'
        return (
          <View style={[s.trow, { borderColor: c.border }]}>
            <Text style={[s.tCodigo, { color: col }]}>{r.codigo}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.tTitulo, { color: c.text }]} numberOfLines={1}>{r.titulo}</Text>
              {r.dev ? <Text style={[s.tDev, { color: c.textMute }]} numberOfLines={1}>{r.dev}</Text> : null}
              <View style={[s.miniTrack, { backgroundColor: c.border }]}>
                <View style={{ height: 4, borderRadius: 2, width: `${(r.veces / maxVeces) * 100}%`, backgroundColor: col }} />
              </View>
            </View>
            <Text style={[s.tVeces, { color: col }]}>{r.veces}</Text>
          </View>
        )
      }}
    />
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

// Detalle de un desarrollo al tocar su barra: separa sus propiedades en
// Más publicadas / Publicación media / Nunca publicadas.
function DetalleDesarrollo({ c, props }: { c: any; props: Row[] }) {
  const publicadas = props.filter(p => p.veces > 0)
  const nunca = props.filter(p => p.veces === 0).sort((a, b) => a.titulo.localeCompare(b.titulo))
  const max = Math.max(1, ...publicadas.map(p => p.veces))
  const mas = publicadas.filter(p => p.veces >= max * 0.66).sort((a, b) => b.veces - a.veces)
  const medias = publicadas.filter(p => p.veces < max * 0.66).sort((a, b) => b.veces - a.veces)

  const Grupo = ({ titulo, color, items }: { titulo: string; color: string; items: Row[] }) =>
    items.length ? (
      <View style={{ marginTop: 8 }}>
        <Text style={[s.grpTit, { color }]}>{titulo} ({items.length})</Text>
        {items.map((p, i) => (
          <View key={p.codigo + i} style={s.detRow}>
            <Text style={[s.detCod, { color }]}>{p.codigo}</Text>
            <Text style={[s.detTit, { color: c.textSub }]} numberOfLines={1}>{p.titulo}</Text>
            <Text style={[s.detVal, { color }]}>{p.veces}</Text>
          </View>
        ))}
      </View>
    ) : null

  return (
    <View style={[s.detalle, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Grupo titulo="🔝 Más publicadas" color="#16a34a" items={mas} />
      <Grupo titulo="🟡 Publicación media" color="#f59e0b" items={medias} />
      <Grupo titulo="🚫 Nunca publicadas" color="#ef4444" items={nunca} />
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  muted: { fontSize: 14, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 19 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  kpi: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 14, padding: 14 },
  kpiVal: { fontSize: 24, fontWeight: '900' },
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
  detalle: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 8 },
  grpTit: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  detRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  detCod: { width: 70, fontSize: 12, fontWeight: '800' },
  detTit: { flex: 1, fontSize: 13 },
  detVal: { width: 32, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt: { fontSize: 13, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  tCodigo: { width: 74, fontSize: 12.5, fontWeight: '800' },
  tTitulo: { fontSize: 14, fontWeight: '600' },
  tDev: { fontSize: 11.5, marginTop: 1 },
  miniTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  tVeces: { width: 40, textAlign: 'right', fontSize: 15, fontWeight: '900' },
})
