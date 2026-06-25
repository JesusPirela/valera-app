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
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'

type Registro = {
  id: string
  propiedad_id: string
  user_id: string
  tipo: 'vista' | 'descarga'
  created_at: string
  propiedad_codigo: string
  propiedad_titulo: string
  prospectador_email: string
  prospectador_nombre: string | null
}

type FiltroTipo = 'todos' | 'descarga' | 'vista'
const ListSeparator6 = () => <View style={{ height: 6 }} />

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

function nombreCorto(nombre: string | null, email: string): string {
  const texto = nombre ?? email.split('@')[0]
  return texto.length > 30 ? texto.slice(0, 28) + '…' : texto
}

export default function ActividadAdmin() {
  const c = useColors()
  const s = makeStyles(c)
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
        style={[s.chip, filtro === value && s.chipActive]}
        onPress={() => setFiltro(value)}
      >
        <Text style={[s.chipText, filtro === value && s.chipTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.container}>
      {/* Resumen estadísticas */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{prospectadoresActivos}</Text>
          <Text style={s.statLabel}>Prospectadores{'\n'}activos</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, s.statNumDescarga]}>{totalDescargas}</Text>
          <Text style={s.statLabel}>Descargas{'\n'}totales</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, s.statNumVista]}>{totalVistas}</Text>
          <Text style={s.statLabel}>Vistas{'\n'}totales</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, s.statNumDescarga]}>{prospectadoresConDescargas}</Text>
          <Text style={s.statLabel}>Con al menos{'\n'}1 descarga</Text>
        </View>
      </View>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtrosRow}>
        <FiltroChip label="Todos" value="todos" />
        <FiltroChip label="Solo descargas" value="descarga" />
        <FiltroChip label="Solo vistas" value="vista" />
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : registrosFiltrados.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyTitle}>Sin actividad registrada</Text>
          <Text style={s.emptySubtitle}>
            Aquí aparecerán las vistas y descargas de los prospectadores.
          </Text>
        </View>
      ) : (
        <FlatList
          data={registrosFiltrados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <Text style={s.email} numberOfLines={1}>
                  {nombreCorto(item.prospectador_nombre, item.prospectador_email)}
                </Text>
                <Text style={s.propiedad} numberOfLines={1}>
                  {item.propiedad_codigo} · {item.propiedad_titulo}
                </Text>
              </View>
              <View style={s.rowRight}>
                <View style={[
                  s.tipoBadge,
                  item.tipo === 'descarga' ? s.tipoBadgeDescarga : s.tipoBadgeVista,
                ]}>
                  <Text style={[
                    s.tipoText,
                    item.tipo === 'descarga' ? s.tipoTextDescarga : s.tipoTextVista,
                  ]}>
                    {item.tipo === 'descarga' ? '↓ Descarga' : '👁 Vista'}
                  </Text>
                </View>
                <Text style={s.tiempo}>{tiempoRelativo(item.created_at)}</Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={ListSeparator6}
        />
      )}
    </View>
  )
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, padding: 16 },

    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
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
      color: c.textMute,
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
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
      marginRight: 8,
      backgroundColor: c.card,
    },
    chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
    chipText: { fontSize: 13, color: c.textSub },
    chipTextActive: { color: '#fff', fontWeight: '600' },

    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: c.textMute, textAlign: 'center', lineHeight: 20 },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
    },
    rowLeft: { flex: 1, marginRight: 12 },
    email: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 3 },
    propiedad: { fontSize: 12, color: c.textMute },

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
    tiempo: { fontSize: 11, color: c.textMute },

    separator: {
      height: 6,
    },
  })
}
