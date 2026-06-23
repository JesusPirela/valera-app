import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, FlatList,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const PURPLE = '#5e35b1'
const PAGE = 150

type Resumen = {
  minutos_total: number
  publicaciones: number
  clientes: number
  seguimientos_completados: number
  seguimientos_pendientes: number
  vistas: number
  descargas: number
  certificados: number
  ultima_conexion: string | null
  alta: string | null
}

type Evento = {
  tipo: string
  icono: string
  titulo: string
  detalle: string | null
  fecha: string
}

// Agrupaciones de filtro → qué tipos incluye cada una
const FILTROS: { key: string; label: string; tipos: string[] | null }[] = [
  { key: 'todo', label: 'Todo', tipos: null },
  { key: 'publicacion', label: '📤 Publicaciones', tipos: ['publicacion'] },
  { key: 'cliente', label: '👤 Clientes', tipos: ['cliente'] },
  { key: 'seguimiento', label: '✅ Seguimientos', tipos: ['seguimiento', 'recordatorio'] },
  { key: 'conexion', label: '🟢 Conexiones', tipos: ['conexion'] },
  { key: 'ficha', label: '👁️ Vistas/Descargas', tipos: ['vista', 'descarga'] },
  { key: 'certificado', label: '🎓 Certificados', tipos: ['certificado'] },
]

function formatMinutos(total: number): string {
  const m = Math.round(total || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest > 0 ? `${h} h ${rest} min` : `${h} h`
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.floor(h / 24)
  if (dias < 30) return `hace ${dias} d`
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fechaCompleta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' · ' +
         d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function UsuarioHistorial() {
  const c = useColors()
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [filtro, setFiltro] = useState('todo')
  const [loading, setLoading] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [hayMas, setHayMas] = useState(true)

  useEffect(() => { cargarInicial() }, [id])

  const cargarInicial = useCallback(async () => {
    setLoading(true)
    const [resRes, histRes] = await Promise.all([
      supabase.rpc('get_resumen_usuario', { p_user_id: id }),
      supabase.rpc('get_historial_usuario', { p_user_id: id, p_limit: PAGE, p_offset: 0 }),
    ])
    if (resRes.data && resRes.data[0]) setResumen(resRes.data[0] as Resumen)
    const lista = (histRes.data ?? []) as Evento[]
    setEventos(lista)
    setHayMas(lista.length === PAGE)
    setLoading(false)
  }, [id])

  async function cargarMas() {
    if (cargandoMas || !hayMas) return
    setCargandoMas(true)
    const { data } = await supabase.rpc('get_historial_usuario', { p_user_id: id, p_limit: PAGE, p_offset: eventos.length })
    const lista = (data ?? []) as Evento[]
    setEventos(prev => [...prev, ...lista])
    setHayMas(lista.length === PAGE)
    setCargandoMas(false)
  }

  const filtroActivo = FILTROS.find(f => f.key === filtro) ?? FILTROS[0]
  const eventosFiltrados = filtroActivo.tipos
    ? eventos.filter(e => filtroActivo.tipos!.includes(e.tipo))
    : eventos

  function StatCard({ label, valor, color }: { label: string; valor: string; color: string }) {
    return (
      <View style={[s.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.statValor, { color }]}>{valor}</Text>
        <Text style={[s.statLabel, { color: c.textMute }]}>{label}</Text>
      </View>
    )
  }

  const header = (
    <View>
      <Text style={[s.title, { color: c.text }]}>📋 Historial</Text>
      <Text style={[s.sub, { color: c.textMute }]}>{nombre}</Text>

      {resumen && (
        <>
          <View style={s.statsGrid}>
            <StatCard label="Tiempo conectado" valor={formatMinutos(resumen.minutos_total)} color="#2e7d32" />
            <StatCard label="Publicaciones" valor={String(resumen.publicaciones)} color={PURPLE} />
            <StatCard label="Clientes" valor={String(resumen.clientes)} color="#1976D2" />
            <StatCard label="Seguim. hechos" valor={String(resumen.seguimientos_completados)} color="#c8960c" />
            <StatCard label="Vistas de ficha" valor={String(resumen.vistas)} color="#00838F" />
            <StatCard label="Descargas" valor={String(resumen.descargas)} color="#D84315" />
            <StatCard label="Certificados" valor={String(resumen.certificados)} color="#7B1FA2" />
            <StatCard label="Seguim. pend." valor={String(resumen.seguimientos_pendientes)} color="#888" />
          </View>
          <View style={[s.metaBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.metaTxt, { color: c.textMute }]}>
              Alta: {resumen.alta ? new Date(resumen.alta).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              {'   ·   '}
              Última conexión: {tiempoRelativo(resumen.ultima_conexion)}
            </Text>
          </View>
        </>
      )}

      <Text style={[s.seccionTitulo, { color: c.text }]}>Actividad</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {FILTROS.map(f => {
          const activo = filtro === f.key
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, { borderColor: c.border, backgroundColor: c.card }, activo && { backgroundColor: PURPLE, borderColor: PURPLE }]}
              onPress={() => setFiltro(f.key)}
            >
              <Text style={[s.chipTxt, { color: c.textMute }, activo && { color: '#fff', fontWeight: '700' }]}>{f.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <FlatList
        data={eventosFiltrados}
        keyExtractor={(_, i) => String(i)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        renderItem={({ item }) => (
          <View style={[s.evento, { borderBottomColor: c.border }]}>
            <Text style={s.eventoIcono}>{item.icono}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.eventoTitulo, { color: c.text }]}>{item.titulo}</Text>
              {item.detalle ? <Text style={[s.eventoDetalle, { color: c.textMute }]} numberOfLines={2}>{item.detalle}</Text> : null}
            </View>
            <Text style={[s.eventoFecha, { color: c.textMute }]}>{fechaCompleta(item.fecha)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[s.vacio, { color: c.textMute }]}>Sin actividad registrada para este filtro.</Text>
        }
        ListFooterComponent={
          hayMas ? (
            <TouchableOpacity style={s.masBtn} onPress={cargarMas} disabled={cargandoMas}>
              {cargandoMas
                ? <ActivityIndicator size="small" color={PURPLE} />
                : <Text style={s.masBtnTxt}>Cargar más actividad</Text>}
            </TouchableOpacity>
          ) : null
        }
        onEndReached={() => cargarMas()}
        onEndReachedThreshold={0.4}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 14, marginTop: 2, marginBottom: 14, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '23%', minWidth: 80, flexGrow: 1,
    borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center',
  },
  statValor: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, marginTop: 3, textAlign: 'center', fontWeight: '600' },

  metaBox: { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 10 },
  metaTxt: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  seccionTitulo: { fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  chipsRow: { marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 12, fontWeight: '600' },

  evento: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1 },
  eventoIcono: { fontSize: 20, width: 26, textAlign: 'center' },
  eventoTitulo: { fontSize: 14, fontWeight: '700' },
  eventoDetalle: { fontSize: 12, marginTop: 1 },
  eventoFecha: { fontSize: 11, fontWeight: '600', textAlign: 'right', maxWidth: 90 },

  vacio: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 30 },
  masBtn: { marginTop: 16, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: PURPLE },
  masBtnTxt: { color: PURPLE, fontSize: 13, fontWeight: '700' },
})
