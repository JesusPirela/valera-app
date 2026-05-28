import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking,
  ActivityIndicator, TouchableOpacity, ScrollView, FlatList,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { OfflineBanner } from '../../components/OfflineBanner'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  tipo_operacion: string | null
  proximo_contacto: string | null
  created_at: string
  recordatorios: { id: string; titulo: string; fecha_hora: string; completado: boolean }[]
}

export const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  por_perfilar:       { label: 'Por perfilar',      color: '#1565c0', bg: '#e3f2fd' },
  no_contesta:        { label: 'No contesta',        color: '#757575', bg: '#f5f5f5' },
  cita_por_agendar:   { label: 'Cita por agendar',  color: '#e65100', bg: '#fff3e0' },
  cita_agendada:      { label: 'Cita agendada',      color: '#1a6470', bg: '#e0f4f5' },
  seguimiento_cierre: { label: 'Seg. de cierre',     color: '#6a1b9a', bg: '#f3e5f5' },
  compro:             { label: 'Apartó / Compró',    color: '#2e7d32', bg: '#e8f5e9' },
  descartado:         { label: 'Descartado',          color: '#c0392b', bg: '#fde8e8' },
}

const ORDEN_ESTADOS = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

function estadoInfo(estado: string) {
  return ESTADOS[estado] ?? { label: estado, color: '#555', bg: '#eee' }
}

function tiempoRelativo(fechaISO: string) {
  const diff = Date.now() - new Date(fechaISO).getTime()
  const dias = Math.floor(diff / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias}d`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function proximoRecordatorio(recordatorios: Cliente['recordatorios']) {
  const pendientes = recordatorios
    .filter((r) => !r.completado)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
  return pendientes[0] ?? null
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function abrirWhatsApp(telefono: string, nombre: string) {
  const phone = telefono.replace(/\D/g, '')
  const num = phone.length === 10 ? `52${phone}` : phone
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') {
    window.open(url, '_blank')
  } else {
    Linking.openURL(url)
  }
}

function llamar(telefono: string) {
  Linking.openURL(`tel:${telefono}`)
}

export default function CRM() {
  const queryClient = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [operacionFiltro, setOperacionFiltro] = useState<'venta' | 'renta' | null>(null)

  const { data: clientes = [], isLoading, refetch } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, empresa, fuente_lead, estado, tipo_operacion, proximo_contacto, created_at, recordatorios(id, titulo, fecha_hora, completado)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  useEffect(() => {
    if (!clientes.length) return
    for (const c of clientes) {
      queryClient.setQueryData(
        ['detalle-cliente', c.id],
        (old: unknown) => old ?? { cliente: c, interacciones: [], recordatorios: c.recordatorios ?? [] }
      )
    }
  }, [clientes])

  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = clientes.filter((c) => c.estado === e).length
    return acc
  }, {})

  const conRecordatorio = clientes.filter(c =>
    (c.recordatorios ?? []).some(r => !r.completado)
  ).length
  const vencidos = clientes.filter(c =>
    (c.recordatorios ?? []).some(r => !r.completado && new Date(r.fecha_hora) < new Date())
  ).length

  let filtrados = clientes
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase()
    filtrados = filtrados.filter((c) =>
      c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  }
  if (estadoFiltro) filtrados = filtrados.filter((c) => c.estado === estadoFiltro)
  if (operacionFiltro) filtrados = filtrados.filter((c) => c.tipo_operacion === operacionFiltro)

  return (
    <>
      <OfflineBanner />
      <View style={styles.container}>

        {/* Métricas rápidas */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{clientes.length}</Text>
            <Text style={styles.statLbl}>Total</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{conRecordatorio}</Text>
            <Text style={styles.statLbl}>Con recordatorio</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, vencidos > 0 && styles.statNumAlert]}>{vencidos}</Text>
            <Text style={styles.statLbl}>Vencidos</Text>
          </View>
        </View>

        {/* Filtro Venta / Renta */}
        <View style={styles.operacionRow}>
          {([null, 'venta', 'renta'] as const).map((op) => {
            const activo = operacionFiltro === op
            const label = op === null ? 'Todos' : op === 'venta' ? 'Venta' : 'Renta'
            return (
              <TouchableOpacity
                key={label}
                style={[styles.operacionTab, activo && styles.operacionTabActivo]}
                onPress={() => setOperacionFiltro(op)}
              >
                <Text style={[styles.operacionTabText, activo && styles.operacionTabTextActivo]}>
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Pipeline chips */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.pipeline} contentContainerStyle={styles.pipelineContent}
        >
          <TouchableOpacity
            style={[styles.pipelineChip, estadoFiltro === null && styles.pipelineChipActive]}
            onPress={() => setEstadoFiltro(null)}
          >
            <View style={[styles.chipDot, { backgroundColor: '#1a6470' }]} />
            <Text style={[styles.chipLabel, estadoFiltro === null && styles.chipLabelActive]}>Todos</Text>
            <View style={[styles.chipBadge, estadoFiltro === null && styles.chipBadgeActive]}>
              <Text style={[styles.chipBadgeText, estadoFiltro === null && styles.chipBadgeTextActive]}>
                {clientes.length}
              </Text>
            </View>
          </TouchableOpacity>
          {ORDEN_ESTADOS.map((e) => {
            const info = estadoInfo(e)
            const activo = estadoFiltro === e
            return (
              <TouchableOpacity
                key={e}
                style={[styles.pipelineChip, activo && { backgroundColor: info.bg, borderColor: info.color }]}
                onPress={() => setEstadoFiltro(activo ? null : e)}
              >
                <View style={[styles.chipDot, { backgroundColor: info.color }]} />
                <Text style={[styles.chipLabel, activo && { color: info.color, fontWeight: '700' }]}>
                  {info.label}
                </Text>
                <View style={[styles.chipBadge, activo && { backgroundColor: info.color }]}>
                  <Text style={[styles.chipBadgeText, activo && { color: '#fff' }]}>{conteos[e]}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Búsqueda + botón nuevo */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#9eafb2" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, teléfono..."
              placeholderTextColor="#bbb"
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={styles.btnNuevo} onPress={() => router.push('/(prospectador)/cliente-form')}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
        ) : filtrados.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={36} color="#1a6470" />
            </View>
            <Text style={styles.emptyTitle}>
              {busqueda || estadoFiltro ? 'Sin resultados' : 'Sin clientes aún'}
            </Text>
            {!busqueda && !estadoFiltro && (
              <Text style={styles.emptySubtitle}>Agrega tu primer cliente con el botón "+"</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filtrados}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const info = estadoInfo(item.estado)
              const recProximo = proximoRecordatorio(item.recordatorios ?? [])
              const recVencido = recProximo && new Date(recProximo.fecha_hora) < new Date()
              const initials = iniciales(item.nombre)

              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                  activeOpacity={0.75}
                >
                  {/* Borde izquierdo de color por estado */}
                  <View style={[styles.cardAccent, { backgroundColor: info.color }]} />

                  <View style={styles.cardInner}>
                    {/* Fila superior */}
                    <View style={styles.cardTop}>
                      <View style={[styles.avatar, { backgroundColor: info.color + '1a' }]}>
                        <Text style={[styles.avatarText, { color: info.color }]}>{initials}</Text>
                      </View>
                      <View style={styles.cardTopInfo}>
                        <Text style={styles.cardNombre} numberOfLines={1}>{item.nombre}</Text>
                        {item.empresa ? (
                          <Text style={styles.cardEmpresa} numberOfLines={1}>{item.empresa}</Text>
                        ) : null}
                      </View>
                      <View style={styles.cardRight}>
                        <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                          <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={13} color="#d5dfe0" style={{ alignSelf: 'flex-end', marginTop: 4 }} />
                      </View>
                    </View>

                    {/* Meta row */}
                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="call-outline" size={12} color="#adbfc2" />
                        <Text style={styles.metaText}>{item.telefono}</Text>
                      </View>
                      {item.tipo_operacion && (
                        <View style={styles.metaItem}>
                          <Ionicons name="home-outline" size={12} color="#adbfc2" />
                          <Text style={styles.metaText}>{item.tipo_operacion}</Text>
                        </View>
                      )}
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={12} color="#adbfc2" />
                        <Text style={styles.metaText}>{tiempoRelativo(item.created_at)}</Text>
                      </View>
                    </View>

                    {/* Recordatorio próximo */}
                    {recProximo && (
                      <View style={[styles.recRow, recVencido && styles.recRowVencido]}>
                        <Ionicons
                          name={recVencido ? 'warning-outline' : 'alarm-outline'}
                          size={12}
                          color={recVencido ? '#c0392b' : '#1a6470'}
                        />
                        <Text style={[styles.recText, recVencido && styles.recTextVencido]} numberOfLines={1}>
                          {recVencido
                            ? `Vencido: ${recProximo.titulo}`
                            : new Date(recProximo.fecha_hora).toLocaleDateString('es-MX', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              }) + ` · ${recProximo.titulo}`}
                        </Text>
                      </View>
                    )}

                    {/* Acciones rápidas */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionWa}
                        onPress={() => abrirWhatsApp(item.telefono, item.nombre)}
                      >
                        <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
                        <Text style={styles.actionWaText}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionCall}
                        onPress={() => llamar(item.telefono)}
                      >
                        <Ionicons name="call-outline" size={13} color="#1a6470" />
                        <Text style={styles.actionCallText}>Llamar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }}
          />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#1a6470',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  statNumAlert: { color: '#ffb74d' },
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, letterSpacing: 0.2 },
  statSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 6 },

  // Operation tabs
  operacionRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#edf0f3',
  },
  operacionTab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  operacionTabActivo: { borderBottomColor: '#1a6470' },
  operacionTabText: { fontSize: 13, fontWeight: '600', color: '#b0bec5' },
  operacionTabTextActivo: { color: '#1a6470' },

  // Pipeline
  pipeline: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  pipelineContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  pipelineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e5eaed',
    backgroundColor: '#fafbfc',
  },
  pipelineChipActive: { backgroundColor: '#e8f4f5', borderColor: '#1a6470' },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipLabel: { fontSize: 12, color: '#6b8082', fontWeight: '500' },
  chipLabelActive: { color: '#1a6470', fontWeight: '700' },
  chipBadge: {
    backgroundColor: '#e8eef0', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  chipBadgeActive: { backgroundColor: '#1a6470' },
  chipBadgeText: { fontSize: 11, fontWeight: '700', color: '#6b8082' },
  chipBadgeTextActive: { color: '#fff' },

  // Search row
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e2e8ea',
    paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#1a1a2e' },
  btnNuevo: {
    backgroundColor: '#1a6470', borderRadius: 14,
    width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
  },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#e0f0f2', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#2c4a4e' },
  emptySubtitle: { fontSize: 14, color: '#9eafb2', textAlign: 'center', lineHeight: 20 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#1a2e30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAccent: { width: 4 },
  cardInner: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  cardTopInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  cardEmpresa: { fontSize: 12, color: '#9eafb2', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  estadoText: { fontSize: 11, fontWeight: '700' },

  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#8a9fa2' },

  recRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
    backgroundColor: '#e8f4f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
  },
  recRowVencido: { backgroundColor: '#fde8e8' },
  recText: { fontSize: 12, color: '#1a6470', flex: 1 },
  recTextVencido: { color: '#c0392b', fontWeight: '600' },

  cardActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  actionWa: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f0fdf6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#d1f7e2',
  },
  actionWaText: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
  actionCall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f0f8fa', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#cde8ed',
  },
  actionCallText: { fontSize: 12, fontWeight: '600', color: '#1a6470' },
})
