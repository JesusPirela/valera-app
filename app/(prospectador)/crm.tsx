import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput,
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
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
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
        (old: unknown) => old ?? {
          cliente: c,
          interacciones: [],
          recordatorios: c.recordatorios ?? [],
        }
      )
    }
  }, [clientes])

  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = clientes.filter((c) => c.estado === e).length
    return acc
  }, {})

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
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pipeline}
          contentContainerStyle={styles.pipelineContent}
        >
          <TouchableOpacity
            style={[styles.pipelineChip, estadoFiltro === null && styles.pipelineChipAll]}
            onPress={() => setEstadoFiltro(null)}
          >
            <Text style={[styles.pipelineCount, estadoFiltro === null && styles.pipelineCountAll]}>
              {clientes.length}
            </Text>
            <Text style={[styles.pipelineLabel, estadoFiltro === null && styles.pipelineLabelAll]}>
              Todos
            </Text>
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
                <Text style={[styles.pipelineCount, activo && { color: info.color }]}>
                  {conteos[e]}
                </Text>
                <Text style={[styles.pipelineLabel, activo && { color: info.color, fontWeight: '600' }]}>
                  {info.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Búsqueda + botón nuevo */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={16} color="#9eafb2" style={styles.searchIcon} />
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
          <TouchableOpacity
            style={styles.btnNuevo}
            onPress={() => router.push('/(prospectador)/cliente-form')}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.btnNuevoText}>Nuevo</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
        ) : filtrados.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={52} color="#d0dfe1" />
            <Text style={styles.emptyTitle}>
              {busqueda || estadoFiltro ? 'Sin resultados' : 'Sin clientes aún'}
            </Text>
            {!busqueda && !estadoFiltro && (
              <Text style={styles.emptySubtitle}>
                Agrega tu primer cliente con el botón "+ Nuevo"
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filtrados}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4 }}
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
                  activeOpacity={0.78}
                >
                  {/* Avatar + nombre + estado + chevron */}
                  <View style={styles.cardTop}>
                    <View style={[styles.avatar, { backgroundColor: info.color + '22' }]}>
                      <Text style={[styles.avatarText, { color: info.color }]}>{initials}</Text>
                    </View>
                    <View style={styles.cardTopInfo}>
                      <Text style={styles.cardNombre} numberOfLines={1}>{item.nombre}</Text>
                      {item.empresa ? (
                        <Text style={styles.cardEmpresa} numberOfLines={1}>{item.empresa}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                        <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#cdd8da" />
                    </View>
                  </View>

                  {/* Detalles secundarios */}
                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="call-outline" size={13} color="#9eafb2" />
                      <Text style={styles.metaText}>{item.telefono}</Text>
                    </View>
                    {item.tipo_operacion && (
                      <View style={styles.metaItem}>
                        <Ionicons name="home-outline" size={13} color="#9eafb2" />
                        <Text style={styles.metaText}>{item.tipo_operacion}</Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color="#9eafb2" />
                      <Text style={styles.metaText}>{tiempoRelativo(item.created_at)}</Text>
                    </View>
                  </View>

                  {/* Recordatorio próximo */}
                  {recProximo && (
                    <View style={[styles.recRow, recVencido && styles.recRowVencido]}>
                      <Ionicons
                        name={recVencido ? 'warning-outline' : 'alarm-outline'}
                        size={13}
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
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  operacionRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  operacionTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  operacionTabActivo: { borderBottomColor: '#1a6470' },
  operacionTabText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  operacionTabTextActivo: { color: '#1a6470' },

  pipeline: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  pipelineContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  pipelineChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    backgroundColor: '#fafafa', minWidth: 70,
  },
  pipelineChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  pipelineCount: { fontSize: 18, fontWeight: '700', color: '#555' },
  pipelineCountAll: { color: '#fff' },
  pipelineLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 1 },
  pipelineLabelAll: { color: '#c9a84c' },

  searchRow: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#e0e8ea', paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1, paddingVertical: 11, fontSize: 14, color: '#1a1a2e',
  },
  btnNuevo: {
    backgroundColor: '#1a6470', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  btnNuevoText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470' },
  emptySubtitle: { fontSize: 14, color: '#aaa', textAlign: 'center' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8eef0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: '700' },
  cardTopInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  cardEmpresa: { fontSize: 12, color: '#999', marginTop: 1 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  estadoText: { fontSize: 11, fontWeight: '700' },

  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 6,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#7a8e91' },

  recRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#e8f4f5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5, marginTop: 2,
  },
  recRowVencido: { backgroundColor: '#fde8e8' },
  recText: { fontSize: 12, color: '#1a6470', flex: 1 },
  recTextVencido: { color: '#c0392b', fontWeight: '600' },

})
