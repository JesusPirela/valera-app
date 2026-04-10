import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Notificacion = {
  id: string
  titulo: string
  mensaje: string
  leida: boolean
  created_at: string
  propiedad_id: string | null
  tipo: 'nueva_propiedad' | 'destacada' | 'exclusiva'
}

function tiempoRelativo(fechaISO: string): string {
  const ahora = new Date()
  const fecha = new Date(fechaISO)
  const diffMs = ahora.getTime() - fecha.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDias = Math.floor(diffHrs / 24)

  if (diffMin < 1) return 'Hace un momento'
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  if (diffDias === 1) return 'Ayer'
  if (diffDias < 7) return `Hace ${diffDias} días`
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function Notificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const [marcandoTodas, setMarcandoTodas] = useState(false)

  async function cargarNotificaciones() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, leida, created_at, propiedad_id, tipo')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar las notificaciones.')
    } else {
      setNotificaciones(data ?? [])
    }
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarNotificaciones() }, []))

  async function marcarLeida(id: string) {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id)

    if (!error) {
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
      )
    }
  }

  async function marcarTodasLeidas() {
    const noLeidas = notificaciones.filter((n) => !n.leida)
    if (noLeidas.length === 0) return

    setMarcandoTodas(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMarcandoTodas(false); return }

    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('user_id', user.id)
      .eq('leida', false)

    if (!error) {
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    }
    setMarcandoTodas(false)
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  return (
    <View style={styles.container}>
      {hayNoLeidas && (
        <TouchableOpacity
          style={styles.marcarTodasBtn}
          onPress={marcarTodasLeidas}
          disabled={marcandoTodas}
        >
          <Text style={styles.marcarTodasText}>
            {marcandoTodas ? 'Marcando...' : 'Marcar todas como leídas'}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : notificaciones.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin notificaciones</Text>
          <Text style={styles.emptySubtitle}>
            Aquí aparecerán los avisos cuando se publique una nueva propiedad.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notificaciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const esDestacada = item.tipo === 'destacada'
            const esExclusiva = item.tipo === 'exclusiva'
            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  !item.leida && styles.cardNoLeida,
                  esDestacada && styles.cardDestacada,
                  esDestacada && !item.leida && styles.cardDestacadaNoLeida,
                  esExclusiva && styles.cardExclusiva,
                  esExclusiva && !item.leida && styles.cardExclusivaNoLeida,
                ]}
                onPress={() => { if (!item.leida) marcarLeida(item.id) }}
                activeOpacity={item.leida ? 1 : 0.7}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardTituloCont}>
                    {!item.leida && (
                      <View style={[
                        styles.puntito,
                        esDestacada && styles.puntitoDestacada,
                        esExclusiva && styles.puntitoExclusiva,
                      ]} />
                    )}
                    <Text style={[
                      styles.cardTitulo,
                      !item.leida && styles.cardTituloNoLeido,
                      esDestacada && styles.cardTituloDestacada,
                      esExclusiva && styles.cardTituloExclusiva,
                    ]}>
                      {item.titulo}
                    </Text>
                  </View>
                  <Text style={styles.tiempo}>{tiempoRelativo(item.created_at)}</Text>
                </View>
                <Text style={[styles.cardMensaje, !item.leida && styles.cardMensajeNoLeido]}>
                  {item.mensaje}
                </Text>
                {!item.leida && (
                  <Text style={[
                    styles.tapHint,
                    esDestacada && styles.tapHintDestacada,
                    esExclusiva && styles.tapHintExclusiva,
                  ]}>
                    Toca para marcar como leída
                  </Text>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  marcarTodasBtn: {
    alignSelf: 'flex-end',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a6470',
  },
  marcarTodasText: { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a6470', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardNoLeida: {
    backgroundColor: '#f0f4ff',
    borderColor: '#c5d5ff',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  cardTituloCont: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  puntito: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1a6470',
    flexShrink: 0,
  },
  cardTitulo: { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  cardTituloNoLeido: { color: '#1a6470' },
  tiempo: { fontSize: 11, color: '#aaa', marginLeft: 8, flexShrink: 0 },
  cardMensaje: { fontSize: 14, color: '#888', lineHeight: 20 },
  cardMensajeNoLeido: { color: '#333' },
  tapHint: { fontSize: 11, color: '#7a9ee8', marginTop: 6 },
  cardDestacada: {
    borderColor: '#f5c518',
    borderWidth: 2,
    backgroundColor: '#fffdf0',
  },
  cardDestacadaNoLeida: {
    backgroundColor: '#fff8d6',
    borderColor: '#f5c518',
  },
  puntitoDestacada: { backgroundColor: '#c8960c' },
  cardTituloDestacada: { color: '#7a5500' },
  tapHintDestacada: { color: '#c8960c' },
  cardExclusiva: {
    borderColor: '#c0392b',
    borderWidth: 2,
    backgroundColor: '#fff5f5',
  },
  cardExclusivaNoLeida: {
    backgroundColor: '#fde8e8',
    borderColor: '#c0392b',
  },
  puntitoExclusiva: { backgroundColor: '#c0392b' },
  cardTituloExclusiva: { color: '#c0392b' },
  tapHintExclusiva: { color: '#c0392b' },
})
