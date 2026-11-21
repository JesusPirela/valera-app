import { useState, useCallback, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  RefreshControl,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useColors, useTheme } from '../../lib/ThemeContext'
import ConfirmarCitaModal, { type CitaPorConfirmar } from '../../components/ConfirmarCitaModal'
import SelectorFechaHora from '../../components/SelectorFechaHora'

const SCREEN_WIDTH = Dimensions.get('window').width
const SWIPE_THRESHOLD = -80
const ListSeparator10 = () => <View style={{ height: 10 }} />

type Notificacion = {
  id: string
  titulo: string
  mensaje: string
  leida: boolean
  created_at: string
  propiedad_id: string | null
  cliente_id: string | null
  chatbot_lead_id: string | null
  cita_id: string | null
  accion_url: string | null
  tipo: 'nueva_propiedad' | 'destacada' | 'exclusiva' | 'recordatorio' | 'lead_caliente' | 'cita' | string
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
  if (tipo === 'cita')         return '📅'
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

// Los leads calientes del chatbot se muestran siempre arriba (alta prioridad),
// manteniendo el orden por fecha dentro de cada grupo (sort estable)
function ordenarPorPrioridad(items: Notificacion[]): Notificacion[] {
  return [...items].sort((a, b) => {
    const pa = a.tipo === 'lead_caliente' ? 0 : 1
    const pb = b.tipo === 'lead_caliente' ? 0 : 1
    return pa - pb
  })
}

function esNavegable(n: Notificacion): boolean {
  if (n.accion_url) return true
  if (n.cita_id) return true
  if (n.tipo === 'recordatorio' && n.cliente_id) return true
  if (n.tipo === 'lead_caliente' && n.chatbot_lead_id) return true
  if (n.cliente_id) return true
  if (n.propiedad_id) return true
  return false
}

/**
 * ¿Este aviso habla de una cita que se puede mover?
 *
 * Se reporto asi: "la del Sr Hector me sale que es para hoy pero la tuve
 * ayer... como estoy desde mi celular no se como moverle la fecha". El aviso
 * no ofrecia nada: llevaba al perfil del cliente y ahi habia que ir a buscar
 * el boton. Ahora lo trae encima.
 *
 * Hace falta el cliente para poder abrir su ficha. Los avisos de tipo 'cita'
 * y los recordatorios que dicen "Confirmar cita con..." son los que aplican.
 */
function esDeCita(n: Notificacion): boolean {
  if (!n.cliente_id) return false
  if (n.tipo === 'cita') return true
  return n.tipo === 'recordatorio' && /cita/i.test(`${n.titulo} ${n.mensaje}`)
}

/**
 * ¿Este aviso es un seguimiento cuya fecha se puede mover?
 *
 * Los recordatorios que hablan de una cita ya tienen su propio botón, que
 * abre la ficha y mueve la CITA. Este es el otro caso: "contactar a Juan el
 * martes". Cuando ese día no se pudo, el aviso seguía apareciendo con la
 * fecha vieja y no había forma de correrlo desde el teléfono.
 */
function esDeSeguimiento(n: Notificacion): boolean {
  return n.tipo === 'recordatorio' && !!n.cliente_id && !esDeCita(n)
}

/** La marca que queda en el aviso cuando se movió. */
const MARCA_MOVIDO = '✓ Movido a '
function fechaLegible(d: Date): string {
  return d.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
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
  onMoverFecha: (item: Notificacion) => void
  onMoverSeguimiento: (item: Notificacion) => void
}

function NotifItem({ item, onPress, onDelete, onMoverFecha, onMoverSeguimiento }: NotifItemProps) {
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
  const esExclusiva    = item.tipo === 'exclusiva' || item.tipo === 'lead_caliente'
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

          {/* Si el aviso habla de una cita, se puede mover la fecha desde aqui
              mismo. Es la razon de ser de este boton: una cita que ya se movio
              de palabra y el sistema sigue avisando de la fecha vieja. */}
          {esDeCita(item) && (
            <TouchableOpacity
              style={styles.btnMover}
              onPress={() => onMoverFecha(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="calendar-outline" size={14} color="#1a6470" />
              <Text style={styles.btnMoverTxt}>Mover fecha de la cita</Text>
            </TouchableOpacity>
          )}

          {/* Lo mismo para un seguimiento que no es una cita: se corre la
              fecha sin salir de aquí. */}
          {esDeSeguimiento(item) && (
            <TouchableOpacity
              style={styles.btnMover}
              onPress={() => onMoverSeguimiento(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="calendar-outline" size={14} color="#1a6470" />
              <Text style={styles.btnMoverTxt}>Cambiar fecha del seguimiento</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function Notificaciones() {
  const c = useColors()
  const queryClient = useQueryClient()
  const [marcandoTodas, setMarcandoTodas] = useState(false)
  // El seguimiento cuya fecha se está cambiando, y la fecha elegida.
  const [moviendo, setMoviendo] = useState<Notificacion | null>(null)
  const [fechaNueva, setFechaNueva] = useState<Date | null>(null)
  const [guardandoFecha, setGuardandoFecha] = useState(false)
  const [eliminandoTodas, setEliminandoTodas] = useState(false)

  // React Query: la lista cacheada aparece al instante al volver; solo se
  // refresca en segundo plano si pasó >1 min. Antes recargaba desde cero en
  // cada foco. Las mutaciones actualizan el cache de forma optimista.
  const { data: notificaciones = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return [] as Notificacion[]
      const { data, error } = await supabase
        .from('notificaciones')
        .select('id, titulo, mensaje, leida, created_at, propiedad_id, cliente_id, chatbot_lead_id, cita_id, accion_url, tipo')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ordenarPorPrioridad(data ?? [])
    },
    staleTime: 1000 * 60,
    networkMode: 'offlineFirst',
  })

  // Citas que ya pasaron y siguen sin confirmar. Alimentan el banner y el tap
  // sobre la notificación "¿La cita se realizó?".
  const { data: citasPorConfirmar = [], refetch: refetchCitas } = useQuery({
    queryKey: ['citas-por-confirmar'],
    queryFn: async () => {
      // Banner opcional: si la RPC falla, no molestamos al usuario ni
      // reintentamos; simplemente no se muestra.
      const { data, error } = await supabase.rpc('get_citas_por_confirmar')
      if (error) return [] as CitaPorConfirmar[]
      return (data ?? []) as CitaPorConfirmar[]
    },
    staleTime: 1000 * 60,
    networkMode: 'offlineFirst',
  })

  const [citaAbierta, setCitaAbierta] = useState<CitaPorConfirmar | null>(null)

  // Jalar para actualizar
  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await Promise.all([refetch(), refetchCitas()]) } catch {} finally { setRefreshing(false) }
  }, [refetch, refetchCitas])

  useFocusEffect(useCallback(() => {
    const st = queryClient.getQueryState(['notificaciones'])
    if (!st?.dataUpdatedAt || Date.now() - st.dataUpdatedAt > 1000 * 60) {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
    }
  }, [queryClient]))

  const setNotis = (updater: (prev: Notificacion[]) => Notificacion[]) =>
    queryClient.setQueryData<Notificacion[]>(['notificaciones'], (old) => updater(old ?? []))

  async function marcarLeida(id: string) {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id)

    if (!error) setNotis((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
  }

  async function marcarTodasLeidas() {
    const noLeidas = notificaciones.filter((n) => !n.leida)
    if (noLeidas.length === 0) return

    setMarcandoTodas(true)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setMarcandoTodas(false); return }

    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('user_id', uid)
      .eq('leida', false)

    if (!error) setNotis((prev) => prev.map((n) => ({ ...n, leida: true })))
    setMarcandoTodas(false)
  }

  async function eliminarNotificacion(id: string) {
    setNotis((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notificaciones').delete().eq('id', id)
  }

  async function eliminarTodasLeidas() {
    const leidas = notificaciones.filter((n) => n.leida)
    if (leidas.length === 0) return
    setEliminandoTodas(true)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setEliminandoTodas(false); return }
    const { error } = await supabase
      .from('notificaciones')
      .delete()
      .eq('user_id', uid)
      .eq('leida', true)
    if (!error) setNotis((prev) => prev.filter((n) => !n.leida))
    setEliminandoTodas(false)
  }

  /**
   * Abre la ficha del cliente con el cambio de fecha ya desplegado.
   *
   * No se resuelve aqui cual cita mover: la ficha ya sabe cual es la que sigue
   * viva de ese cliente, y duplicar esa logica haria que un dia las dos
   * pantallas no coincidieran.
   */
  /**
   * Mueve la fecha de un seguimiento desde su aviso.
   *
   * Se mueve el RECORDATORIO, no el aviso: el aviso es solo el papelito que
   * salió de él. Al cambiarlo, el disparador de la base corrige también el
   * próximo contacto del cliente, que es lo que ordena el CRM.
   *
   * Qué recordatorio: el pendiente de ese cliente más cercano al momento en
   * que se emitió el aviso. De 88 clientes con pendientes, 76 tienen uno
   * solo, así que casi siempre no hay nada que elegir.
   */
  async function guardarNuevaFecha(nueva: Date) {
    const item = moviendo
    if (!item?.cliente_id) return
    setGuardandoFecha(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: pendientes } = await supabase
        .from('recordatorios')
        .select('id, fecha_hora')
        .eq('cliente_id', item.cliente_id)
        .eq('completado', false)
      const emitido = new Date(item.created_at).getTime()
      const elegido = (pendientes ?? []).slice().sort((a: any, b: any) =>
        Math.abs(new Date(a.fecha_hora).getTime() - emitido) -
        Math.abs(new Date(b.fecha_hora).getTime() - emitido))[0]

      if (elegido) {
        // Los avisos se vuelven a emitir para la fecha nueva: si no se
        // reinician, el recordatorio se mueve y nunca vuelve a sonar.
        const { error } = await supabase.from('recordatorios').update({
          fecha_hora: nueva.toISOString(),
          notificado: false, notificado_24h: false, notificado_2h: false,
        }).eq('id', elegido.id)
        if (error) throw error
      } else {
        // Ya no quedaba ninguno vivo (se completó o se borró). Se crea uno
        // nuevo en vez de no hacer nada: lo que el usuario pidió es que ese
        // cliente se vuelva a ver en la fecha que eligió.
        const { error } = await supabase.from('recordatorios').insert({
          cliente_id: item.cliente_id,
          user_id: user?.id ?? null,
          titulo: item.titulo?.replace(/^.*?:\s*/, '') || 'Seguimiento',
          fecha_hora: nueva.toISOString(),
        })
        if (error) throw error
      }

      // Y el aviso queda marcado, para que se vea que ya se atendió y a qué
      // fecha se fue. Sin esto el aviso se queda idéntico y al rato alguien
      // lo vuelve a mover.
      // Si ya se había movido antes, se reemplaza la marca anterior en vez de
      // ir apilando una debajo de otra.
      const sinMarca = String(item.mensaje ?? '').split(MARCA_MOVIDO)[0].trimEnd()
      const mensajeNuevo = `${sinMarca}\n\n${MARCA_MOVIDO}${fechaLegible(nueva)}`
      await supabase.from('notificaciones')
        .update({ mensaje: mensajeNuevo, leida: true })
        .eq('id', item.id)

      queryClient.setQueryData(['notificaciones'], (prev: any) =>
        (prev ?? []).map((n: Notificacion) =>
          n.id === item.id ? { ...n, mensaje: mensajeNuevo, leida: true } : n))
      setMoviendo(null)
      setFechaNueva(null)
    } catch (e: any) {
      const m = 'No se pudo cambiar la fecha: ' + (e?.message ?? '')
      Platform.OS === 'web' ? window.alert(m) : alert(m)
    } finally {
      setGuardandoFecha(false)
    }
  }

  function moverFecha(item: Notificacion) {
    if (!item.cliente_id) return
    if (!item.leida) marcarLeida(item.id)
    router.push(`/(prospectador)/detalle-cliente?id=${item.cliente_id}&reagendar=1` as any)
  }

  async function handlePress(item: Notificacion) {
    if (!item.leida) marcarLeida(item.id)

    // Si la notificación apunta a una cita que sigue sin confirmar, abrimos el
    // modal de confirmación en vez de navegar. Si ya se confirmó (o es el aviso
    // de "cita en 2 horas"), cae al comportamiento normal de abajo.
    if (item.cita_id) {
      const pendiente = citasPorConfirmar.find(c => c.id === item.cita_id)
      if (pendiente) { setCitaAbierta(pendiente); return }
    }

    // Ruta directa (ej. colección) tiene prioridad sobre cliente/propiedad.
    if (item.accion_url) { router.push(item.accion_url as any); return }

    if (item.tipo === 'recordatorio' && item.cliente_id) {
      router.push(`/(prospectador)/detalle-cliente?id=${item.cliente_id}`)
    } else if (item.tipo === 'lead_caliente' && item.chatbot_lead_id) {
      const { data: lead } = await supabase
        .from('chatbot_leads')
        .select('telefono, nombre')
        .eq('id', item.chatbot_lead_id)
        .maybeSingle()

      if (lead?.telefono) {
        router.push(`/(prospectador)/chat-cliente?telefono=${lead.telefono}&nombre=${encodeURIComponent(lead.nombre ?? '')}`)
      } else if (item.cliente_id) {
        router.push(`/(prospectador)/detalle-cliente?id=${item.cliente_id}`)
      }
    } else if (item.cliente_id) {
      router.push(`/(prospectador)/detalle-cliente?id=${item.cliente_id}`)
    } else if (item.propiedad_id) {
      router.push(`/(prospectador)/detalle-propiedad?id=${item.propiedad_id}`)
    }
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {citasPorConfirmar.length > 0 && (
        <TouchableOpacity
          style={styles.citasBanner}
          onPress={() => setCitaAbierta(citasPorConfirmar[0])}
          activeOpacity={0.85}
        >
          <Text style={styles.citasBannerIcono}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.citasBannerTitulo}>
              {citasPorConfirmar.length === 1
                ? 'Tienes 1 cita por confirmar'
                : `Tienes ${citasPorConfirmar.length} citas por confirmar`}
            </Text>
            <Text style={styles.citasBannerSub}>Toca para decirnos qué pasó →</Text>
          </View>
        </TouchableOpacity>
      )}

      <ConfirmarCitaModal
        cita={citaAbierta}
        onClose={() => setCitaAbierta(null)}
        onConfirmado={() => {
          setCitaAbierta(null)
          refetchCitas()
          queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
          queryClient.invalidateQueries({ queryKey: ['ranking'] })
        }}
      />

      {(hayNoLeidas || notificaciones.some((n) => n.leida)) && (
        <View style={styles.accionesRow}>
          {hayNoLeidas && (
            <TouchableOpacity
              style={styles.marcarTodasBtn}
              onPress={marcarTodasLeidas}
              disabled={marcandoTodas}
            >
              <Text style={styles.marcarTodasText}>
                {marcandoTodas ? 'Marcando...' : 'Marcar leídas'}
              </Text>
            </TouchableOpacity>
          )}
          {notificaciones.some((n) => n.leida) && (
            <TouchableOpacity
              style={styles.eliminarLeidasBtn}
              onPress={eliminarTodasLeidas}
              disabled={eliminandoTodas}
            >
              <Text style={styles.eliminarLeidasText}>
                {eliminandoTodas ? 'Borrando...' : '🗑 Borrar leídas'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={15}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} tintColor="#1a6470" colors={['#1a6470']} />}
          renderItem={({ item }) => (
            <NotifItem
              item={item}
              onPress={handlePress}
              onDelete={eliminarNotificacion}
              onMoverFecha={moverFecha}
              onMoverSeguimiento={(n) => { setMoviendo(n); setFechaNueva(null) }}
            />
          )}
          ItemSeparatorComponent={ListSeparator10}
        />
      )}

      {/* Cambiar la fecha de un seguimiento, con el mismo calendario que la
          ficha del cliente. */}
      <Modal visible={!!moviendo} transparent animationType="fade" onRequestClose={() => setMoviendo(null)}>
        <View style={styles.movOverlay}>
          <View style={styles.movModal}>
            <Text style={styles.movTitulo}>Cambiar fecha del seguimiento</Text>
            <Text style={styles.movSub} numberOfLines={2}>{moviendo?.titulo}</Text>
            <SelectorFechaHora
              label="Nueva fecha y hora"
              value={fechaNueva}
              onChange={setFechaNueva}
            />
            <View style={styles.movAcciones}>
              <TouchableOpacity style={styles.movCancelar} onPress={() => setMoviendo(null)}>
                <Text style={styles.movCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.movGuardar, (!fechaNueva || guardandoFecha) && { opacity: 0.5 }]
                }
                disabled={!fechaNueva || guardandoFecha}
                onPress={() => fechaNueva && guardarNuevaFecha(fechaNueva)}
              >
                {guardandoFecha
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.movGuardarTxt}>Cambiar fecha</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  movOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  movModal: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 420 },
  movTitulo: { fontSize: 15.5, fontWeight: '800', color: '#1a6470', marginBottom: 4 },
  movSub: { fontSize: 12.5, color: '#667', marginBottom: 14 },
  movAcciones: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end' },
  movCancelar: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: '#f0f0f0' },
  movCancelarTxt: { color: '#555', fontWeight: '700', fontSize: 13 },
  movGuardar: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, backgroundColor: '#1a6470', minWidth: 128, alignItems: 'center' },
  movGuardarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  citasBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a6470', borderRadius: 12,
    padding: 14, marginHorizontal: 12, marginTop: 10, marginBottom: 4,
  },
  citasBannerIcono:  { fontSize: 24 },
  citasBannerTitulo: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  citasBannerSub:    { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  accionesRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  marcarTodasBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a6470',
  },
  marcarTodasText: { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  eliminarLeidasBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e53935',
  },
  eliminarLeidasText: { fontSize: 13, color: '#e53935', fontWeight: '600' },
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
  btnMover: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 9, borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 9,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  btnMoverTxt: { fontSize: 12.5, fontWeight: '800', color: '#1a6470' },
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
