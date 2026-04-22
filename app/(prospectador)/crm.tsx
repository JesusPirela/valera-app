import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput,
  ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
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
  if (dias < 7) return `Hace ${dias}d`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function proximoRecordatorio(recordatorios: Cliente['recordatorios']) {
  const pendientes = recordatorios
    .filter((r) => !r.completado)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
  return pendientes[0] ?? null
}

const COL = {
  nombre:   150,
  estado:   130,
  telefono: 120,
  empresa:  110,
  rec:      170,
  fecha:    80,
}

export default function CRM() {
  const queryClient = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [operacionFiltro, setOperacionFiltro] = useState<'venta' | 'renta' | null>(null)
  const [sortCol, setSortCol] = useState<string>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

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

  // Sembrar el caché de cada detalle con los datos de la lista (sin requests extra)
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

  filtrados = [...filtrados].sort((a, b) => {
    let va: string, vb: string
    if (sortCol === 'nombre') { va = a.nombre; vb = b.nombre }
    else if (sortCol === 'estado') { va = a.estado; vb = b.estado }
    else if (sortCol === 'telefono') { va = a.telefono; vb = b.telefono }
    else if (sortCol === 'empresa') { va = a.empresa ?? ''; vb = b.empresa ?? '' }
    else { va = a.created_at; vb = b.created_at }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function toggleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  function sortIcon(col: string) {
    if (sortCol !== col) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  const COLS = [
    { key: 'nombre',   label: 'Nombre',       width: COL.nombre,   sortable: true },
    { key: 'estado',   label: 'Estado',        width: COL.estado,   sortable: true },
    { key: 'telefono', label: 'Teléfono',      width: COL.telefono, sortable: false },
    { key: 'empresa',  label: 'Empresa',       width: COL.empresa,  sortable: true },
    { key: 'rec',      label: 'Recordatorio',  width: COL.rec,      sortable: false },
    { key: 'fecha',    label: 'Agregado',      width: COL.fecha,    sortable: true },
  ]

  const totalWidth = COLS.reduce((s, c) => s + c.width, 0) + COLS.length + 1

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

        {isLoading ? (
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            <View style={{ width: totalWidth }}>
              <View style={styles.tableHeader}>
                {COLS.map((col, i) => (
                  <TouchableOpacity
                    key={col.key}
                    style={[
                      styles.headerCell,
                      { width: col.width },
                      i < COLS.length - 1 && styles.cellBorderRight,
                    ]}
                    onPress={() => col.sortable && toggleSort(col.key)}
                    disabled={!col.sortable}
                  >
                    <Text style={styles.headerCellText}>
                      {col.label}
                      {col.sortable ? (
                        <Text style={styles.sortIcon}>{sortIcon(col.key)}</Text>
                      ) : null}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {filtrados.map((item, idx) => {
                  const info = estadoInfo(item.estado)
                  const recProximo = proximoRecordatorio(item.recordatorios ?? [])
                  const ahora = new Date()
                  const recVencido = recProximo && new Date(recProximo.fecha_hora) < ahora
                  const isEven = idx % 2 === 0

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}
                      onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.cell, { width: COL.nombre }, styles.cellBorderRight]}>
                        <Text style={styles.cellNombre} numberOfLines={1}>{item.nombre}</Text>
                        {item.empresa ? (
                          <Text style={styles.cellSub} numberOfLines={1}>{item.empresa}</Text>
                        ) : null}
                      </View>

                      <View style={[styles.cell, { width: COL.estado }, styles.cellBorderRight, styles.cellCenter]}>
                        <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                          <Text style={[styles.estadoText, { color: info.color }]} numberOfLines={1}>
                            {info.label}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.cell, { width: COL.telefono }, styles.cellBorderRight]}>
                        <Text style={styles.cellText} numberOfLines={1}>{item.telefono}</Text>
                      </View>

                      <View style={[styles.cell, { width: COL.empresa }, styles.cellBorderRight]}>
                        <Text style={styles.cellText} numberOfLines={1}>{item.empresa ?? '—'}</Text>
                      </View>

                      <View style={[styles.cell, { width: COL.rec }, styles.cellBorderRight]}>
                        {recProximo ? (
                          <View style={[styles.recChip, recVencido && styles.recChipVencido]}>
                            <Text style={[styles.recChipText, recVencido && styles.recChipTextVencido]} numberOfLines={1}>
                              {recVencido
                                ? '⚠ Vencido'
                                : new Date(recProximo.fecha_hora).toLocaleDateString('es-MX', {
                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                  })}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.cellNone}>—</Text>
                        )}
                      </View>

                      <View style={[styles.cell, { width: COL.fecha }]}>
                        <Text style={styles.cellFecha}>{tiempoRelativo(item.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          </ScrollView>
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
    flex: 1, paddingVertical: 10, alignItems: 'center',
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

  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a1a2e',
  },
  btnNuevo: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnNuevoText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#aaa', textAlign: 'center' },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a6470',
    borderBottomWidth: 2,
    borderBottomColor: '#c9a84c',
  },
  headerCell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  headerCellText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  sortIcon: { color: '#c9a84c', fontWeight: '400' },
  cellBorderRight: { borderRightWidth: 1, borderRightColor: '#dde3e7' },

  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecef',
    minHeight: 48,
  },
  rowEven: { backgroundColor: '#ffffff' },
  rowOdd:  { backgroundColor: '#f7f9fb' },

  cell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  cellCenter: { alignItems: 'center' },
  cellNombre: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  cellSub:    { fontSize: 11, color: '#999', marginTop: 1 },
  cellText:   { fontSize: 13, color: '#444' },
  cellFecha:  { fontSize: 12, color: '#888', textAlign: 'center' },
  cellNone:   { fontSize: 13, color: '#ccc', textAlign: 'center' },

  estadoBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  estadoText:  { fontSize: 11, fontWeight: '600' },

  recChip: { backgroundColor: '#e0f4f5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  recChipVencido: { backgroundColor: '#fde8e8' },
  recChipText: { fontSize: 11, color: '#1a6470', fontWeight: '500' },
  recChipTextVencido: { color: '#c0392b', fontWeight: '700' },
})
