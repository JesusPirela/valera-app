import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  proximo_contacto: string | null
  created_at: string
  recordatorios: { id: string; titulo: string; fecha_hora: string; completado: boolean }[]
}

export const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  por_perfilar:       { label: 'Por perfilar',       color: '#1565c0', bg: '#e3f2fd' },
  no_contesta:        { label: 'No contesta',         color: '#757575', bg: '#f5f5f5' },
  cita_por_agendar:   { label: 'Cita por agendar',   color: '#e65100', bg: '#fff3e0' },
  cita_agendada:      { label: 'Cita agendada',       color: '#1a6470', bg: '#e0f4f5' },
  seguimiento_cierre: { label: 'Seg. de cierre',      color: '#6a1b9a', bg: '#f3e5f5' },
  compro:             { label: 'Apartó / Compró',     color: '#2e7d32', bg: '#e8f5e9' },
  descartado:         { label: 'Descartado',           color: '#c0392b', bg: '#fde8e8' },
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
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function proximoRecordatorio(recordatorios: Cliente['recordatorios']) {
  const pendientes = recordatorios
    .filter((r) => !r.completado)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
  return pendientes[0] ?? null
}

export default function CRM() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)

  async function cargarClientes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, empresa, fuente_lead, estado, proximo_contacto, created_at, recordatorios(id, titulo, fecha_hora, completado)')
      .order('updated_at', { ascending: false })

    if (!error) setClientes(data ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarClientes() }, []))

  // Conteos por estado
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

  return (
    <View style={styles.container}>
      {/* Pipeline counters */}
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
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, teléfono..."
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity
          style={styles.btnNuevo}
          onPress={() => router.push('/(prospectador)/cliente-form')}
        >
          <Text style={styles.btnNuevoText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : filtrados.length === 0 ? (
        <View style={styles.emptyContainer}>
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
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const info = estadoInfo(item.estado)
            const recProximo = proximoRecordatorio(item.recordatorios ?? [])
            const ahora = new Date()
            const recVencido = recProximo && new Date(recProximo.fecha_hora) < ahora

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardNombre}>{item.nombre}</Text>
                    {item.empresa ? (
                      <Text style={styles.cardEmpresa}>{item.empresa}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                    <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>

                <Text style={styles.cardTel}>{item.telefono}</Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardFecha}>{tiempoRelativo(item.created_at)}</Text>
                  {recProximo && (
                    <View style={[styles.recBadge, recVencido && styles.recBadgeVencido]}>
                      <Text style={[styles.recText, recVencido && styles.recTextVencido]}>
                        {recVencido ? 'Recordatorio vencido' : `Rec: ${new Date(recProximo.fecha_hora).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  pipeline: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  pipelineContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  pipelineChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    minWidth: 70,
  },
  pipelineChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  pipelineCount: { fontSize: 18, fontWeight: '700', color: '#555' },
  pipelineCountAll: { color: '#fff' },
  pipelineLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 1 },
  pipelineLabelAll: { color: '#c9a84c' },
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a2e',
  },
  btnNuevo: {
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnNuevoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#aaa', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 8 },
  cardNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  cardEmpresa: { fontSize: 12, color: '#888', marginTop: 1 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0 },
  estadoText: { fontSize: 11, fontWeight: '600' },
  cardTel: { fontSize: 13, color: '#555', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFecha: { fontSize: 11, color: '#bbb' },
  recBadge: {
    backgroundColor: '#e0f4f5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recBadgeVencido: { backgroundColor: '#fde8e8' },
  recText: { fontSize: 11, color: '#1a6470', fontWeight: '500' },
  recTextVencido: { color: '#c0392b' },
})
