import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Registro = {
  id: string
  propiedad_id: string
  user_id: string
  tipo: 'vista' | 'descarga'
  created_at: string
  propiedad_codigo: string
  propiedad_titulo: string
  prospectador_email: string
}

type FiltroTipo = 'todos' | 'descarga' | 'vista'

function tiempoRelativo(fechaISO: string): string {
  const ahora = new Date()
  const fecha = new Date(fechaISO)
  const diffMin = Math.floor((ahora.getTime() - fecha.getTime()) / 60000)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDias = Math.floor(diffHrs / 24)

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  if (diffDias === 1) return 'Ayer'
  if (diffDias < 7) return `Hace ${diffDias} días`
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function emailCorto(email: string): string {
  return email.length > 30 ? email.slice(0, 28) + '…' : email
}

export default function ActividadAdmin() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')

  async function cargarActividad() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_actividad_prospectadores')
    if (error) {
      Alert.alert('Error', 'No se pudo cargar la actividad.')
    } else {
      setRegistros(data ?? [])
    }
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarActividad() }, []))

  const registrosFiltrados = filtro === 'todos'
    ? registros
    : registros.filter((r) => r.tipo === filtro)

  // Estadísticas
  const totalDescargas = registros.filter((r) => r.tipo === 'descarga').length
  const totalVistas = registros.filter((r) => r.tipo === 'vista').length
  const prospectadoresActivos = new Set(registros.map((r) => r.user_id)).size
  const prospectadoresConDescargas = new Set(
    registros.filter((r) => r.tipo === 'descarga').map((r) => r.user_id)
  ).size

  function FiltroChip({ label, value }: { label: string; value: FiltroTipo }) {
    return (
      <TouchableOpacity
        style={[styles.chip, filtro === value && styles.chipActive]}
        onPress={() => setFiltro(value)}
      >
        <Text style={[styles.chipText, filtro === value && styles.chipTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(admin)/propiedades')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>
      {/* Resumen estadísticas */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{prospectadoresActivos}</Text>
          <Text style={styles.statLabel}>Prospectadores{'\n'}activos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, styles.statNumDescarga]}>{totalDescargas}</Text>
          <Text style={styles.statLabel}>Descargas{'\n'}totales</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, styles.statNumVista]}>{totalVistas}</Text>
          <Text style={styles.statLabel}>Vistas{'\n'}totales</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, styles.statNumDescarga]}>{prospectadoresConDescargas}</Text>
          <Text style={styles.statLabel}>Con al menos{'\n'}1 descarga</Text>
        </View>
      </View>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosRow}>
        <FiltroChip label="Todos" value="todos" />
        <FiltroChip label="Solo descargas" value="descarga" />
        <FiltroChip label="Solo vistas" value="vista" />
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : registrosFiltrados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin actividad registrada</Text>
          <Text style={styles.emptySubtitle}>
            Aquí aparecerán las vistas y descargas de los prospectadores.
          </Text>
        </View>
      ) : (
        <FlatList
          data={registrosFiltrados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.email} numberOfLines={1}>
                  {emailCorto(item.prospectador_email)}
                </Text>
                <Text style={styles.propiedad} numberOfLines={1}>
                  {item.propiedad_codigo} · {item.propiedad_titulo}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <View style={[
                  styles.tipoBadge,
                  item.tipo === 'descarga' ? styles.tipoBadgeDescarga : styles.tipoBadgeVista,
                ]}>
                  <Text style={[
                    styles.tipoText,
                    item.tipo === 'descarga' ? styles.tipoTextDescarga : styles.tipoTextVista,
                  ]}>
                    {item.tipo === 'descarga' ? '↓ Descarga' : '👁 Vista'}
                  </Text>
                </View>
                <Text style={styles.tiempo}>{tiempoRelativo(item.created_at)}</Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' as const },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a6470',
  },
  statNumDescarga: { color: '#c8960c' },
  statNumVista: { color: '#1a6470' },
  statLabel: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  filtrosRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  email: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 3 },
  propiedad: { fontSize: 12, color: '#888' },

  rowRight: { alignItems: 'flex-end', gap: 4 },
  tipoBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tipoBadgeDescarga: { backgroundColor: '#fff3c4' },
  tipoBadgeVista: { backgroundColor: '#dbeeff' },
  tipoText: { fontSize: 11, fontWeight: '700' },
  tipoTextDescarga: { color: '#7a5500' },
  tipoTextVista: { color: '#1a6470' },
  tiempo: { fontSize: 11, color: '#bbb' },

  separator: {
    height: 6,
  },
})
