import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity, Alert,
  Animated, PanResponder, Platform, Dimensions,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'

const SCREEN_WIDTH = Dimensions.get('window').width
const SWIPE_THRESHOLD = -80

type Notificacion = {
  id: string
  titulo: string
  mensaje: string
  leida: boolean
  created_at: string
  propiedad_id: string | null
  cliente_id: string | null
  tipo: 'nuevo_cliente' | 'login' | 'nueva_propiedad' | 'destacada' | string
}

function tiempoRelativo(fechaISO: string): string {
  const diffMs = Date.now() - new Date(fechaISO).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDias = Math.floor(diffHrs / 24)
  if (diffMin < 1) return 'Hace un momento'
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  if (diffDias === 1) return 'Ayer'
  if (diffDias < 7) return `Hace ${diffDias} días`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function iconoPorTipo(tipo: string) {
  if (tipo === 'nuevo_cliente') return '👤'
  if (tipo === 'login')         return '🔑'
  if (tipo === 'destacada')     return '⭐'
  return '🔔'
}

function esNavegable(n: Notificacion): boolean {
  if (n.tipo === 'nuevo_cliente' && n.cliente_id) return true
  if (n.propiedad_id) return true
  return false
}

function hintTexto(n: Notificacion): string {
  if (!n.leida && esNavegable(n)) return 'Toca para ver →'
  if (!n.leida) return 'Toca para marcar como leída'
  if (esNavegable(n)) return 'Toca para ver →'
  return ''
}

type NotifItemProps = {
  item: Notificacion
  onPress: (item: Notificacion) => void
  onDelete: (id: string) => void
}

function NotifItem({ item, onPress, onDelete }: NotifItemProps) {
  const swipeX = useRef(new Animated.Value(0)).current
  const deleteOpacity = swipeX.interpolate({
    inputRange: [-120, -20],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Platform.OS !== 'web' && Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 15,
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) swipeX.setValue(gs.dx)
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: -SCREEN_WIDTH,
            duration: 220,
            useNativeDriver: true,
          }).start(() => onDelete(item.id))
        } else {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
          }).start()
        }
      },
    })
  ).current

  const esCliente   = item.tipo === 'nuevo_cliente'
  const esLogin     = item.tipo === 'login'
  const esDestacada = item.tipo === 'destacada'
  const navegable   = esNavegable(item)
  const hint        = hintTexto(item)

  return (
    <View style={styles.swipeContainer}>
      {Platform.OS !== 'web' && (
        <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
          <Text style={styles.deleteBgIcon}>🗑</Text>
        </Animated.View>
      )}

      <Animated.View
        style={{ transform: [{ translateX: swipeX }] }}
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      >
        <TouchableOpacity
          style={[
            styles.card,
            !item.leida && styles.cardNoLeida,
            esCliente   && styles.cardCliente,
            esCliente   && !item.leida && styles.cardClienteNoLeida,
            esDestacada && styles.cardDestacada,
            esDestacada && !item.leida && styles.cardDestacadaNoLeida,
            navegable   && styles.cardNavegable,
          ]}
          onPress={() => onPress(item)}
          activeOpacity={0.75}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTituloCont}>
              <Text style={styles.icono}>{iconoPorTipo(item.tipo)}</Text>
              {!item.leida && (
                <View style={[
                  styles.puntito,
                  esCliente   && styles.puntitoCliente,
                  esDestacada && styles.puntitoDestacada,
                ]} />
              )}
              <Text style={[
                styles.cardTitulo,
                !item.leida && styles.cardTituloNoLeido,
                esCliente   && styles.cardTituloCliente,
                esDestacada && styles.cardTituloDestacada,
              ]}>
                {item.titulo}
              </Text>
            </View>
            <View style={styles.cardTopRight}>
              <Text style={styles.tiempo}>{tiempoRelativo(item.created_at)}</Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => onDelete(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={[styles.cardMensaje, !item.leida && styles.cardMensajeNoLeido]}>
            {item.mensaje}
          </Text>

          {hint !== '' && (
            <Text style={[
              styles.tapHint,
              esCliente   && styles.tapHintCliente,
              esDestacada && styles.tapHintDestacada,
            ]}>
              {hint}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function AdminNotificaciones() {
  const c = useColors()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const [marcandoTodas, setMarcandoTodas] = useState(false)

  async function cargarNotificaciones() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, leida, created_at, propiedad_id, cliente_id, tipo')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) Alert.alert('Error', 'No se pudieron cargar las notificaciones.')
    else setNotificaciones(data ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarNotificaciones() }, []))

  async function marcarLeida(id: string) {
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id)
    setNotificaciones((prev) => prev.map((n) => n.id === id ? { ...n, leida: true } : n))
  }

  async function marcarTodasLeidas() {
    setMarcandoTodas(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('notificaciones').update({ leida: true }).eq('user_id', user.id).eq('leida', false)
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    }
    setMarcandoTodas(false)
  }

  async function eliminarNotificacion(id: string) {
    setNotificaciones((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notificaciones').delete().eq('id', id)
  }

  function handlePress(item: Notificacion) {
    if (!item.leida) marcarLeida(item.id)

    if (item.tipo === 'nuevo_cliente' && item.cliente_id) {
      router.push(`/(admin)/detalle-cliente?id=${item.cliente_id}`)
    } else if (item.propiedad_id) {
      router.push(`/(admin)/editar-propiedad?id=${item.propiedad_id}`)
    }
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

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
          <Text style={[styles.emptySubtitle, { color: c.textMute }]}>
            Aquí aparecerán los avisos del sistema y actividad del equipo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notificaciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <NotifItem
              item={item}
              onPress={handlePress}
              onDelete={eliminarNotificacion}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' },
  marcarTodasBtn: {
    alignSelf: 'flex-end', marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: '#1a6470',
  },
  marcarTodasText: { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a6470', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  swipeContainer: {
    position: 'relative',
  },
  deleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#e53935',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBgIcon: { fontSize: 22 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#eee',
  },
  cardNoLeida: { backgroundColor: '#f0f4ff', borderColor: '#c5d5ff' },
  cardNavegable: { borderRightWidth: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
  cardTituloCont: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  icono: { fontSize: 16, flexShrink: 0 },
  puntito: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a6470', flexShrink: 0 },
  cardTitulo: { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  cardTituloNoLeido: { color: '#1a6470' },
  tiempo: { fontSize: 11, color: '#aaa' },
  deleteBtn: { padding: 2 },
  deleteBtnText: { fontSize: 13, color: '#bbb', fontWeight: '700' },
  cardMensaje: { fontSize: 14, color: '#888', lineHeight: 20 },
  cardMensajeNoLeido: { color: '#333' },
  tapHint: { fontSize: 11, color: '#7a9ee8', marginTop: 6 },

  // Nuevo cliente — verde
  cardCliente: { borderColor: '#2e7d32', borderWidth: 1.5, backgroundColor: '#f6fff6' },
  cardClienteNoLeida: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  puntitoCliente: { backgroundColor: '#2e7d32' },
  cardTituloCliente: { color: '#1b5e20' },
  tapHintCliente: { color: '#2e7d32' },

  // Destacada — amarillo
  cardDestacada: { borderColor: '#f5c518', borderWidth: 2, backgroundColor: '#fffdf0' },
  cardDestacadaNoLeida: { backgroundColor: '#fff8d6', borderColor: '#f5c518' },
  puntitoDestacada: { backgroundColor: '#c8960c' },
  cardTituloDestacada: { color: '#7a5500' },
  tapHintDestacada: { color: '#c8960c' },
})
