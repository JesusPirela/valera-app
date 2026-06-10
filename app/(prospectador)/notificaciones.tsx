import { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors, useTheme } from '../../lib/ThemeContext'

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
  tipo: 'nueva_propiedad' | 'destacada' | 'exclusiva' | 'recordatorio' | string
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

function iconoPorTipo(tipo: string) {
  if (tipo === 'recordatorio') return '⏰'
  if (tipo === 'destacada')    return '⭐'
  if (tipo === 'exclusiva')    return '🔴'
  if (tipo === 'cofre')        return '🎁'
  return '🔔'
}

// Normaliza a NFC para evitar que combinaciones de caracteres accentuados se
// rendericen como íconos de reemplazo en React Native Web
function nfc(s: string): string {
  try { return s.normalize('NFC') } catch { return s }
}

// Extrae el emoji inicial del título para mostrarlo en un Text sin fontWeight
// (evita que algunos emojis se rendericen como ?? en web con fontWeight)
function extraerEmoji(titulo: string): { emoji: string; texto: string } {
  const norm = nfc(titulo)
  // Extrae emoji inicial y elimina el ¡ de apertura (rinde como ?? en fontWeight 600)
  const match = norm.match(/^(\p{Extended_Pictographic})\s*¡?\s*(.*)/su)
  if (match) return { emoji: match[1], texto: nfc(match[2].trim()) }
  // Sin emoji: sólo eliminar ¡ inicial si lo hay
  return { emoji: '', texto: norm.replace(/^¡\s*/, '') }
}

function esNavegable(n: Notificacion): boolean {
  if (n.tipo === 'recordatorio' && n.cliente_id) return true
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
  const c = useColors()
  const { darkMode } = useTheme()
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

  const esRecordatorio = item.tipo === 'recordatorio'
  const esDestacada    = item.tipo === 'destacada'
  const esExclusiva    = item.tipo === 'exclusiva'
  const esCofre        = item.tipo === 'cofre'
  const navegable      = esNavegable(item)
  const hint           = hintTexto(item)

  const { emoji: tituloEmoji, texto: tituloTexto } = extraerEmoji(item.titulo)
  const icono = tituloEmoji || iconoPorTipo(item.tipo)
  const mensajeNorm = nfc(item.mensaje)

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
            { backgroundColor: c.card, borderColor: c.border },
            !item.leida && styles.cardNoLeida,
            esRecordatorio && styles.cardRecordatorio,
            esRecordatorio && !item.leida && styles.cardRecordatorioNoLeida,
            esDestacada && styles.cardDestacada,
            esDestacada && !item.leida && styles.cardDestacadaNoLeida,
            esExclusiva && styles.cardExclusiva,
            esExclusiva && !item.leida && styles.cardExclusivaNoLeida,
            esCofre && styles.cardCofre,
            esCofre && !item.leida && styles.cardCofreNoLeida,
            navegable && styles.cardNavegable,
            darkMode && !item.leida && !esRecordatorio && !esDestacada && !esExclusiva && !esCofre && { backgroundColor: '#172030' },
            darkMode && esRecordatorio && { backgroundColor: '#1e1609', borderColor: '#c0660a' },
            darkMode && esRecordatorio && !item.leida && { backgroundColor: '#261e0a' },
            darkMode && esDestacada && { backgroundColor: '#1e1b07', borderColor: '#b09010' },
            darkMode && esDestacada && !item.leida && { backgroundColor: '#262107' },
            darkMode && esExclusiva && { backgroundColor: '#1e0d0d', borderColor: '#c0392b' },
            darkMode && esExclusiva && !item.leida && { backgroundColor: '#250d0d' },
            darkMode && esCofre && { backgroundColor: '#1c1600', borderColor: '#c9a84c66' },
            darkMode && esCofre && !item.leida && { backgroundColor: '#261e00' },
          ]}
          onPress={() => onPress(item)}
          activeOpacity={0.75}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTituloCont}>
              <Text style={styles.icono}>{icono}</Text>
              {!item.leida && (
                <View style={[
                  styles.puntito,
                  esRecordatorio && styles.puntitoRecordatorio,
                  esDestacada && styles.puntitoDestacada,
                  esExclusiva && styles.puntitoExclusiva,
                  esCofre && styles.puntitoCofre,
                ]} />
              )}
              <Text style={[
                styles.cardTitulo,
                !item.leida && styles.cardTituloNoLeido,
                esRecordatorio && styles.cardTituloRecordatorio,
                esDestacada && styles.cardTituloDestacada,
                esExclusiva && styles.cardTituloExclusiva,
                esCofre && styles.cardTituloCofre,
              ]}>
                {tituloTexto}
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

          <Text style={[styles.cardMensaje, !item.leida && styles.cardMensajeNoLeido, darkMode && { color: c.textSub }]}>
            {mensajeNorm}
          </Text>

          {hint !== '' && (
            <Text style={[
              styles.tapHint,
              esRecordatorio && styles.tapHintRecordatorio,
              esDestacada && styles.tapHintDestacada,
              esExclusiva && styles.tapHintExclusiva,
              esCofre && styles.tapHintCofre,
            ]}>
              {hint}
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function Notificaciones() {
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

  async function eliminarNotificacion(id: string) {
    setNotificaciones((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notificaciones').delete().eq('id', id)
  }

  function handlePress(item: Notificacion) {
    if (!item.leida) marcarLeida(item.id)

    if (item.tipo === 'recordatorio' && item.cliente_id) {
      router.push(`/(prospectador)/detalle-cliente?id=${item.cliente_id}`)
    } else if (item.propiedad_id) {
      router.push(`/(prospectador)/detalle-propiedad?id=${item.propiedad_id}`)
    }
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
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
            Aquí aparecerán avisos de nuevas propiedades y tus recordatorios de seguimiento.
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardNoLeida: {
    backgroundColor: '#f0f4ff',
    borderColor: '#c5d5ff',
  },
  cardNavegable: {
    borderRightWidth: 3,
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
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  icono: { fontSize: 16, flexShrink: 0 },
  puntito: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1a6470',
    flexShrink: 0,
  },
  cardTitulo: { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  cardTituloNoLeido: { color: '#1a6470' },
  tiempo: { fontSize: 11, color: '#aaa' },
  deleteBtn: {
    padding: 2,
  },
  deleteBtnText: { fontSize: 13, color: '#bbb', fontWeight: '700' },
  cardMensaje: { fontSize: 14, color: '#888', lineHeight: 20 },
  cardMensajeNoLeido: { color: '#333' },
  tapHint: { fontSize: 11, color: '#7a9ee8', marginTop: 6 },

  // Recordatorio — naranja/ámbar
  cardRecordatorio: {
    borderColor: '#e67e22',
    borderWidth: 1.5,
    backgroundColor: '#fffaf5',
  },
  cardRecordatorioNoLeida: {
    backgroundColor: '#fff3e0',
    borderColor: '#e67e22',
  },
  puntitoRecordatorio: { backgroundColor: '#e67e22' },
  cardTituloRecordatorio: { color: '#b94d00' },
  tapHintRecordatorio: { color: '#e67e22' },

  // Destacada — amarillo
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

  // Exclusiva — rojo
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

  // Cofre — dorado
  cardCofre: {
    borderColor: '#c9a84c',
    borderWidth: 1.5,
    backgroundColor: '#fffbf0',
  },
  cardCofreNoLeida: {
    backgroundColor: '#fff8dc',
    borderColor: '#c9a84c',
  },
  puntitoCofre:    { backgroundColor: '#c9a84c' },
  cardTituloCofre: { color: '#7a5200' },
  tapHintCofre:    { color: '#c9a84c' },
})
