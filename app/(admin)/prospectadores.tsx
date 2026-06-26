import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  ScrollView,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { normalizar } from '../../lib/texto'
import { adminAjustarMonedas } from '../../lib/gamification'
import { calcularCrmMetricas, type CrmMetricas } from '../../lib/crmMetricas'
import CrmMetricasPanel from '../../components/CrmMetricasPanel'
import { useColors, AppColors } from '../../lib/ThemeContext'

type RolUsuario = 'nuevo' | 'prospectador' | 'prospectador_plus' | 'supervisor' | 'asesor'

type Prospectador = {
  id: string
  email: string
  role: string
  nombre: string | null
  created_at: string
  last_seen: string | null
  valera_coins: number
  app_version: string | null
  app_platform: string | null
}

const PLATAFORMA_LABEL: Record<string, string> = {
  ios:     'iOS',
  android: 'Android',
  web:     'Web',
}

type Credenciales = {
  email: string
  password: string
}

type CoinTx = {
  id: string
  cantidad: number
  concepto: string
  created_at: string
}

type CoinsModal = {
  userId: string
  nombre: string
  coinsActuales: number
}


// Orden jerárquico para listar usuarios
const ListSeparator8 = () => <View style={{ height: 8 }} />
const RANGO_ROL: Record<string, number> = {
  admin: 0, supervisor: 1, asesor: 2, prospectador_plus: 3, prospectador: 4, nuevo: 5,
}

const ROL_LABEL: Record<string, string> = {
  nuevo:             'Nuevo',
  prospectador:      'Prospectador',
  prospectador_plus: 'Plus',
  supervisor:        'Supervisor',
  asesor:            'Asesor',
}

const ROL_BADGE: Record<string, object> = {
  nuevo:             { backgroundColor: '#fff3cd' },
  prospectador:      { backgroundColor: '#e8f5e9' },
  prospectador_plus: { backgroundColor: '#fdecea' },
  supervisor:        { backgroundColor: '#e3e0fb' },
  asesor:            { backgroundColor: '#dcedf7' },
}

const ROL_TEXT: Record<string, object> = {
  nuevo:             { color: '#856404' },
  prospectador:      { color: '#2e7d32' },
  prospectador_plus: { color: '#c0392b' },
  supervisor:        { color: '#5e35b1' },
  asesor:            { color: '#1565c0' },
}

const ROLES_SELECTOR: { value: RolUsuario; label: string }[] = [
  { value: 'nuevo',             label: 'Nuevo' },
  { value: 'prospectador',      label: 'Prospectador' },
  { value: 'prospectador_plus', label: 'Plus' },
]

const ROLES_SELECTOR_CAMBIO: { value: RolUsuario; label: string }[] = [
  ...ROLES_SELECTOR,
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'asesor', label: 'Asesor' },
]

function tiempoRelativo(fechaISO: string): string {
  const ahora = new Date()
  const fecha = new Date(fechaISO)
  const diffDias = Math.floor((ahora.getTime() - fecha.getTime()) / 86400000)
  if (diffDias === 0) return 'Hoy'
  if (diffDias === 1) return 'Ayer'
  if (diffDias < 30) return `Hace ${diffDias} días`
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function generarPassword(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#%'
  const todos = mayus + minus + nums + esp
  let pwd =
    mayus[Math.floor(Math.random() * mayus.length)] +
    minus[Math.floor(Math.random() * minus.length)] +
    nums[Math.floor(Math.random() * nums.length)] +
    esp[Math.floor(Math.random() * esp.length)]
  for (let i = 4; i < 12; i++) {
    pwd += todos[Math.floor(Math.random() * todos.length)]
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function copiarAlPortapapeles(texto: string) {
  if (Platform.OS === 'web') {
    navigator.clipboard?.writeText(texto)
  }
}

export default function Prospectadores() {
  const c = useColors()
  const [lista, setLista] = useState<Prospectador[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  // Selector de rol inline
  const [editandoRolId, setEditandoRolId] = useState<string | null>(null)
  const [cambiandoRol, setCambiandoRol] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  // Modal crear
  const [modalVisible, setModalVisible] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [rolCreacion, setRolCreacion] = useState<RolUsuario>('prospectador')
  const [creando, setCreando] = useState(false)

  // Panel de credenciales tras crear
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null)

  // Modal de gestión de coins
  const [coinsModal, setCoinsModal]         = useState<CoinsModal | null>(null)
  const [coinsTab, setCoinsTab]             = useState<'ajustar' | 'historial'>('ajustar')
  const [cantidadStr, setCantidadStr]       = useState('')
  const [conceptoCoins, setConceptoCoins]   = useState('')
  const [ajustandoCoins, setAjustandoCoins] = useState(false)
  const [coinsTxs, setCoinsTxs]             = useState<CoinTx[]>([])
  const [loadingTxs, setLoadingTxs]         = useState(false)

  // Modal de métricas CRM
  const [crmModal, setCrmModal]   = useState<CrmMetricas | null>(null)
  const [loadingCrm, setLoadingCrm] = useState(false)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_prospectadores')
    if (!error) setLista(data ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return
      supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
        if (data?.role === 'supervisor' || data?.role === 'asesor') router.replace('/(prospectador)/propiedades')
      })
    })
    cargar()
  }, []))

  function abrirModal() {
    setNombre('')
    setEmail('')
    setPassword(generarPassword())
    setVerPassword(false)
    setRolCreacion('prospectador')
    setCredenciales(null)
    setModalVisible(true)
  }

  function mostrarError(msg: string) {
    if (Platform.OS === 'web') window.alert(msg)
    else Alert.alert('Error', msg)
  }

  async function cambiarRol(userId: string, nuevoRol: RolUsuario) {
    setCambiandoRol(true)
    const { data, error } = await supabase.functions.invoke('cambiar-rol', {
      body: { userId, role: nuevoRol },
    })
    setCambiandoRol(false)

    if (error || data?.error) {
      mostrarError(data?.error ?? 'No se pudo cambiar el rol.')
      return
    }

    setLista(prev =>
      prev.map(p => p.id === userId ? { ...p, role: nuevoRol } : p)
    )
    setEditandoRolId(null)
  }

  async function eliminarUsuarioConfirmado(item: Prospectador) {
    setEliminandoId(item.id)
    const { data, error } = await supabase.functions.invoke('eliminar-usuario', {
      body: { userId: item.id },
    })
    setEliminandoId(null)

    if (error || data?.error) {
      mostrarError(data?.error ?? 'No se pudo eliminar el usuario.')
      return
    }

    setLista(prev => prev.filter(p => p.id !== item.id))
  }

  function eliminarUsuario(item: Prospectador) {
    const nombre = item.nombre || item.email
    const titulo = 'Eliminar usuario'
    const mensaje = `Esto borrará a ${nombre} de forma PERMANENTE, incluyendo todos sus clientes, citas y notas del CRM. Esta acción no se puede deshacer.\n\n¿Continuar?`

    if (Platform.OS === 'web') {
      if (window.confirm(`${titulo}\n\n${mensaje}`)) eliminarUsuarioConfirmado(item)
    } else {
      Alert.alert(titulo, mensaje, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarUsuarioConfirmado(item) },
      ])
    }
  }

  async function crearProspectador() {
    if (!nombre.trim()) { mostrarError('Ingresa el nombre del prospectador.'); return }
    if (!email.trim()) { mostrarError('Ingresa un email.'); return }
    if (!password.trim()) { mostrarError('Ingresa una contraseña.'); return }

    setCreando(true)
    const { data, error } = await supabase.functions.invoke('crear-prospectador', {
      body: { email: email.trim().toLowerCase(), password, nombre, role: rolCreacion },
    })
    setCreando(false)

    if (error || data?.error) {
      let msg = data?.error ?? ''
      if (!msg && error) {
        try {
          const body = await (error as any).context.json()
          msg = body?.error ?? ''
        } catch { }
        if (!msg) msg = (error as any).message ?? 'Error desconocido'
      }
      if (!msg) msg = 'No se pudo crear el usuario.'
      mostrarError(msg)
      return
    }

    setCredenciales({ email: email.trim().toLowerCase(), password })
    await cargar()
  }

  function cerrarModal() {
    setModalVisible(false)
    setCredenciales(null)
  }

  async function abrirCoinsModal(p: Prospectador) {
    const { data: stats } = await supabase
      .from('user_stats').select('valera_coins').eq('id', p.id).maybeSingle()
    setCoinsModal({ userId: p.id, nombre: p.nombre ?? p.email, coinsActuales: stats?.valera_coins ?? 0 })
    setCoinsTab('ajustar')
    setCantidadStr('')
    setConceptoCoins('')
    setCoinsTxs([])
  }

  async function cargarHistorialCoins(userId: string) {
    setLoadingTxs(true)
    const { data } = await supabase
      .from('coin_transactions')
      .select('id, cantidad, concepto, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    setCoinsTxs((data ?? []) as CoinTx[])
    setLoadingTxs(false)
  }

  async function abrirCrmModal(userId: string | null, nombre: string) {
    setLoadingCrm(true)
    try {
      const metricas = await calcularCrmMetricas(userId, nombre)
      setCrmModal(metricas)
    } finally {
      setLoadingCrm(false)
    }
  }

  async function aplicarAjuste(signo: 1 | -1) {
    if (!coinsModal) return
    const cantidad = parseInt(cantidadStr, 10)
    if (!cantidad || cantidad <= 0) { mostrarError('Ingresa una cantidad válida'); return }
    if (!conceptoCoins.trim()) { mostrarError('Agrega un concepto/razón'); return }

    setAjustandoCoins(true)
    const result = await adminAjustarMonedas(
      coinsModal.userId,
      cantidad * signo,
      conceptoCoins.trim()
    )
    setAjustandoCoins(false)

    if (!result.ok) { mostrarError(result.error ?? 'Error al ajustar coins'); return }

    const saldoNuevo = result.nuevoSaldo ?? Math.max(0, coinsModal.coinsActuales + cantidad * signo)
    setCoinsModal(prev => prev ? { ...prev, coinsActuales: saldoNuevo } : null)
    // Actualizar el saldo en la tarjeta sin recargar
    setLista(prev => prev.map(u =>
      u.id === coinsModal.userId ? { ...u, valera_coins: saldoNuevo } : u
    ))
    setCantidadStr('')
    setConceptoCoins('')
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={styles.btnNuevo} onPress={abrirModal}>
        <Text style={styles.btnNuevoText}>+ Nuevo prospectador</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnDashboardGeneral, loadingCrm && { opacity: 0.6 }]}
        onPress={() => !loadingCrm && abrirCrmModal(null, 'Todos los usuarios')}
        disabled={loadingCrm}
      >
        <Text style={styles.btnDashboardGeneralText}>
          {loadingCrm ? 'Cargando...' : '📊 Dashboard CRM General'}
        </Text>
      </TouchableOpacity>

      {/* Barra de búsqueda */}
      <View style={[styles.searchBar, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Buscar por nombre o email..."
          placeholderTextColor={c.textMute}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {busqueda ? (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Text style={{ color: c.textMute, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : lista.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin prospectadores</Text>
          <Text style={styles.emptySubtitle}>Crea el primero con el botón de arriba.</Text>
        </View>
      ) : (
        <FlatList
          data={lista.filter(p =>
            !busqueda.trim() ||
            normalizar(p.nombre).includes(normalizar(busqueda)) ||
            normalizar(p.email).includes(normalizar(busqueda))
          ).sort((a, b) => {
            // Orden jerárquico por rol; dentro del mismo rol, por nombre
            const r = (rol: string) => RANGO_ROL[rol] ?? 99
            const dr = r(a.role) - r(b.role)
            return dr !== 0 ? dr : (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email)
          })}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.cardMainRow}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>{(item.nombre || item.email)[0].toUpperCase()}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardNombre, { color: c.text }]}>{item.nombre || item.email}</Text>
                  {item.nombre ? <Text style={[styles.cardEmail, { color: c.textMute }]}>{item.email}</Text> : null}
                  <Text style={[styles.cardFecha, { color: c.textMute }]}>Alta: {tiempoRelativo(item.created_at)}</Text>
                  <Text style={[styles.cardFecha, { color: item.last_seen ? '#1a6470' : '#bbb' }]}>
                    {item.last_seen ? `Última conexión: ${tiempoRelativo(item.last_seen)}` : 'Sin conexión registrada'}
                  </Text>
                  {item.app_version ? (
                    <Text style={[styles.cardFecha, { color: c.textMute }]}>
                      📱 {PLATAFORMA_LABEL[item.app_platform ?? ''] ?? item.app_platform ?? '?'} · v{item.app_version}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.rolBadge, ROL_BADGE[item.role] ?? ROL_BADGE.prospectador]}
                  onPress={() => setEditandoRolId(editandoRolId === item.id ? null : item.id)}
                >
                  <Text style={[styles.rolText, ROL_TEXT[item.role] ?? ROL_TEXT.prospectador]}>
                    {ROL_LABEL[item.role] ?? item.role} ✎
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.coinsBtnSmall}
                  onPress={() => abrirCoinsModal(item)}
                >
                  <Text style={styles.coinsBtnSmallText}>💰 {(item.valera_coins ?? 0).toLocaleString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.crmBtnSmall}
                  onPress={() => !loadingCrm && abrirCrmModal(item.id, item.nombre ?? item.email)}
                  disabled={loadingCrm}
                >
                  <Text style={styles.crmBtnSmallText}>📊 CRM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.historialBtnSmall}
                  onPress={() => router.push({ pathname: '/(admin)/usuario-historial', params: { id: item.id, nombre: item.nombre ?? item.email } })}
                >
                  <Text style={styles.historialBtnSmallText}>📋 Historial</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.publicacionesBtnSmall}
                  onPress={() => router.push({ pathname: '/(admin)/usuario-publicaciones', params: { id: item.id, nombre: item.nombre ?? item.email } })}
                >
                  <Text style={styles.publicacionesBtnSmallText}>📤 Publicaciones</Text>
                </TouchableOpacity>
                {item.role !== 'admin' && (
                  <TouchableOpacity
                    style={[styles.eliminarBtnSmall, eliminandoId === item.id && styles.btnDisabled]}
                    onPress={() => eliminarUsuario(item)}
                    disabled={eliminandoId === item.id}
                  >
                    {eliminandoId === item.id
                      ? <ActivityIndicator size="small" color="#c0392b" />
                      : <Text style={styles.eliminarBtnSmallText}>🗑 Eliminar</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>

              {editandoRolId === item.id && (
                <View style={[styles.rolPickerContainer, { borderTopColor: c.divider }]}>
                  <Text style={[styles.rolPickerLabel, { color: c.textMute }]}>Cambiar rol:</Text>
                  <View style={styles.rolPickerPills}>
                    {ROLES_SELECTOR_CAMBIO.map(r => {
                      const activo = item.role === r.value
                      return (
                        <TouchableOpacity
                          key={r.value}
                          style={[
                            styles.rolPill,
                            ROL_BADGE[r.value],
                            activo && styles.rolPillActivo,
                            cambiandoRol && styles.rolPillDisabled,
                          ]}
                          onPress={() => !activo && cambiarRol(item.id, r.value)}
                          disabled={cambiandoRol || activo}
                        >
                          {cambiandoRol && activo
                            ? <ActivityIndicator size="small" color="#888" />
                            : <Text style={[styles.rolPillText, ROL_TEXT[r.value], activo && { fontWeight: '700' }]}>
                                {r.label}
                              </Text>
                          }
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
          ItemSeparatorComponent={ListSeparator8}
        />
      )}

      {/* Modal métricas CRM */}
      <Modal
        visible={!!crmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCrmModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, styles.crmModalBox, { backgroundColor: c.card, maxHeight: '88%' }]}>
            {/* Header */}
            <View style={[styles.crmHeader, { borderBottomColor: c.border }]}>
              <View style={styles.crmHeaderIcon}>
                <Text style={{ fontSize: 20 }}>📊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.crmHeaderTitle, { color: c.text }]}>Métricas CRM</Text>
                <Text style={[styles.crmHeaderSub, { color: c.textMute }]} numberOfLines={1}>{crmModal?.nombre}</Text>
              </View>
              <TouchableOpacity style={styles.crmCloseX} onPress={() => setCrmModal(null)}>
                <Text style={[styles.crmCloseXTxt, { color: c.textMute }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18 }}>
              {crmModal && <CrmMetricasPanel metricas={crmModal} c={c} />}
            </ScrollView>

            <TouchableOpacity style={styles.crmCerrar} onPress={() => setCrmModal(null)}>
              <Text style={styles.btnCerrarText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal gestión de coins */}
      <Modal
        visible={!!coinsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCoinsModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: c.card }]}>
            <Text style={styles.modalTitulo}>💰 Valera Coins</Text>
            <Text style={styles.modalSubtitulo}>{coinsModal?.nombre}</Text>
            <View style={styles.coinsSaldoRow}>
              <Text style={styles.coinsSaldoLabel}>Saldo actual</Text>
              <Text style={styles.coinsSaldoVal}>{coinsModal?.coinsActuales?.toLocaleString() ?? 0} 💰</Text>
            </View>

            {/* Tabs */}
            <View style={styles.coinsTabRow}>
              <TouchableOpacity
                style={[styles.coinsTab, coinsTab === 'ajustar' && styles.coinsTabActive]}
                onPress={() => setCoinsTab('ajustar')}
              >
                <Text style={[styles.coinsTabTxt, coinsTab === 'ajustar' && styles.coinsTabActiveTxt]}>Ajustar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.coinsTab, coinsTab === 'historial' && styles.coinsTabActive]}
                onPress={() => {
                  setCoinsTab('historial')
                  if (coinsModal) cargarHistorialCoins(coinsModal.userId)
                }}
              >
                <Text style={[styles.coinsTabTxt, coinsTab === 'historial' && styles.coinsTabActiveTxt]}>Historial</Text>
              </TouchableOpacity>
            </View>

            {coinsTab === 'ajustar' ? (
              <>
                <Text style={[styles.inputLabel, { color: c.textSub }]}>Cantidad de coins</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]}
                  placeholder="Ej: 100"
                  value={cantidadStr}
                  onChangeText={setCantidadStr}
                  keyboardType="number-pad"
                />
                <Text style={[styles.inputLabel, { color: c.textSub }]}>Concepto / Razón</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]}
                  placeholder="Ej: Bono por cierre del mes"
                  value={conceptoCoins}
                  onChangeText={setConceptoCoins}
                  maxLength={80}
                />
                <View style={styles.coinsAcciones}>
                  <TouchableOpacity
                    style={[styles.coinsBtn, { backgroundColor: '#2e7d32' }, ajustandoCoins && { opacity: 0.6 }]}
                    onPress={() => aplicarAjuste(1)}
                    disabled={ajustandoCoins}
                  >
                    {ajustandoCoins
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.coinsBtnTxt}>+ Agregar</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.coinsBtn, { backgroundColor: '#c0392b' }, ajustandoCoins && { opacity: 0.6 }]}
                    onPress={() => aplicarAjuste(-1)}
                    disabled={ajustandoCoins}
                  >
                    {ajustandoCoins
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.coinsBtnTxt}>− Quitar</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {loadingTxs ? (
                  <ActivityIndicator color="#1a6470" style={{ marginTop: 20 }} />
                ) : coinsTxs.length === 0 ? (
                  <Text style={styles.emptySubtitle}>Sin movimientos registrados</Text>
                ) : (
                  [...coinsTxs].reverse().map(tx => (
                    <View key={tx.id} style={styles.txRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txConcepto, { color: c.text }]}>{tx.concepto}</Text>
                        <Text style={styles.txFecha}>
                          {new Date(tx.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={[styles.txCantidad, { color: tx.cantidad >= 0 ? '#2e7d32' : '#c0392b' }]}>
                        {tx.cantidad >= 0 ? '+' : ''}{tx.cantidad} 💰
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={[styles.btnCerrar, { marginTop: 16 }]} onPress={() => setCoinsModal(null)}>
              <Text style={styles.btnCerrarText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal crear prospectador */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: c.card }]}>

            {credenciales ? (
              <>
                <Text style={styles.modalTitulo}>Usuario creado</Text>
                <Text style={styles.modalSubtitulo}>
                  Comparte estas credenciales con el prospectador.
                </Text>

                <View style={styles.credCard}>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Email</Text>
                    <Text style={styles.credValor} selectable>{credenciales.email}</Text>
                    <TouchableOpacity onPress={() => copiarAlPortapapeles(credenciales.email)}>
                      <Text style={styles.copiarBtn}>Copiar</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.credSeparator} />
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Contraseña</Text>
                    <Text style={styles.credValor} selectable>{credenciales.password}</Text>
                    <TouchableOpacity onPress={() => copiarAlPortapapeles(credenciales.password)}>
                      <Text style={styles.copiarBtn}>Copiar</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.credHint}>
                  El prospectador ya puede iniciar sesión con estas credenciales.
                </Text>

                <TouchableOpacity style={styles.btnCerrar} onPress={cerrarModal}>
                  <Text style={styles.btnCerrarText}>Listo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitulo}>Nuevo prospectador</Text>
                <Text style={styles.modalSubtitulo}>
                  Se creará la cuenta y podrás darle las credenciales.
                </Text>

                <Text style={[styles.inputLabel, { color: c.textSub }]}>Nombre</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]}
                  placeholder="Nombre completo"
                  value={nombre}
                  onChangeText={setNombre}
                  autoCorrect={false}
                  maxLength={80}
                />

                <Text style={[styles.inputLabel, { color: c.textSub }]}>Email</Text>
                <TextInput
                  style={[styles.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]}
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />

                <Text style={[styles.inputLabel, { color: c.textSub }]}>Contraseña</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Contraseña"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!verPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.verBtn, { borderColor: c.border }]}
                    onPress={() => setVerPassword(v => !v)}
                  >
                    <Text style={[styles.verBtnText, { color: c.textSub }]}>{verPassword ? 'Ocultar' : 'Ver'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.generarBtn}
                  onPress={() => setPassword(generarPassword())}
                >
                  <Text style={styles.generarText}>Generar contraseña segura</Text>
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { color: c.textSub }]}>Rol</Text>
                <View style={styles.rolCreacionRow}>
                  {ROLES_SELECTOR.map(r => {
                    const activo = rolCreacion === r.value
                    return (
                      <TouchableOpacity
                        key={r.value}
                        style={[styles.rolCreacionPill, ROL_BADGE[r.value], activo && styles.rolPillActivo]}
                        onPress={() => setRolCreacion(r.value)}
                      >
                        <Text style={[styles.rolPillText, ROL_TEXT[r.value], activo && { fontWeight: '700' }]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <Text style={styles.rolCreacionDesc}>
                  {rolCreacion === 'nuevo'
                    ? 'Acceso limitado. Puedes cambiar el rol después.'
                    : rolCreacion === 'prospectador_plus'
                    ? 'Acceso a propiedades exclusivas.'
                    : 'Acceso estándar al sistema.'}
                </Text>

                <View style={styles.modalAcciones}>
                  <TouchableOpacity style={styles.btnCancelar} onPress={cerrarModal}>
                    <Text style={styles.btnCancelarText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnCrear, creando && { opacity: 0.6 }]}
                    onPress={crearProspectador}
                    disabled={creando}
                  >
                    {creando
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.btnCrearText}>Crear cuenta</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 12,
  },
  searchIcon:  { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14 },

  btnNuevo: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnNuevoText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#aaa' },

  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a6470',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: '700' },
  cardEmail:  { fontSize: 11, marginTop: 1 },
  cardFecha:  { fontSize: 11, marginTop: 2 },

  rolBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rolText: { fontSize: 11, fontWeight: '600' },

  // Selector de rol inline
  rolPickerContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  rolPickerLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  rolPickerPills: {
    flexDirection: 'row',
    gap: 8,
  },
  rolPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rolPillActivo: {
    borderColor: '#1a6470',
  },
  rolPillDisabled: { opacity: 0.5 },
  rolPillText: { fontSize: 12, fontWeight: '600' },

  // Rol en creación
  rolCreacionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  rolCreacionPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rolCreacionDesc: {
    fontSize: 12,
    color: '#888',
    marginBottom: 20,
    fontStyle: 'italic',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 4 },
  modalSubtitulo: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },

  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 14,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  verBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  verBtnText: { fontSize: 13 },
  generarBtn: { alignSelf: 'flex-start', marginBottom: 20 },
  generarText: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },

  modalAcciones: { flexDirection: 'row', gap: 10 },
  btnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCancelarText: { color: '#888', fontSize: 14, fontWeight: '600' },
  btnCrear: {
    flex: 2,
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCrearText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Panel credenciales
  credCard: {
    backgroundColor: '#f5f8ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0deff',
    padding: 16,
    marginBottom: 12,
  },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credLabel: { fontSize: 11, fontWeight: '700', color: '#888', width: 80 },
  credValor: { flex: 1, fontSize: 13, color: '#1a6470', fontWeight: '600' },
  copiarBtn: { fontSize: 12, color: '#c9a84c', fontWeight: '700' },
  credSeparator: { height: 1, backgroundColor: '#e0e8ff', marginVertical: 10 },
  credHint: { fontSize: 12, color: '#aaa', marginBottom: 20, lineHeight: 17 },
  btnCerrar: {
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCerrarText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Coins modal
  btnDashboardGeneral: {
    borderWidth: 1.5,
    borderColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnDashboardGeneralText: { color: '#1a6470', fontSize: 15, fontWeight: '700' },

  // CRM modal
  crmBtnSmall: {
    backgroundColor: '#e8f4f6',
    borderWidth: 1,
    borderColor: '#1a6470',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  crmBtnSmallText: { color: '#1a6470', fontSize: 12, fontWeight: '700' },
  historialBtnSmall: {
    backgroundColor: '#f0ecfa',
    borderWidth: 1,
    borderColor: '#5e35b1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  historialBtnSmallText: { color: '#5e35b1', fontSize: 12, fontWeight: '700' },
  publicacionesBtnSmall: {
    backgroundColor: '#fdecec',
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  publicacionesBtnSmallText: { color: '#c0392b', fontSize: 12, fontWeight: '700' },
  eliminarBtnSmall: {
    backgroundColor: '#c0392b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 76,
    alignItems: 'center',
  },
  eliminarBtnSmallText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  crmModalBox: { padding: 0, overflow: 'hidden' },
  crmHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  crmHeaderIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#1a647018', alignItems: 'center', justifyContent: 'center',
  },
  crmHeaderTitle: { fontSize: 18, fontWeight: '800' },
  crmHeaderSub: { fontSize: 13, marginTop: 1 },
  crmCloseX: { padding: 6 },
  crmCloseXTxt: { fontSize: 18, fontWeight: '700' },

  crmCerrar: {
    backgroundColor: '#1a6470',
    paddingVertical: 15,
    alignItems: 'center',
  },

  coinsBtnSmall: {
    backgroundColor: '#fffbea',
    borderWidth: 1,
    borderColor: '#c9a84c',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  coinsBtnSmallText: { color: '#a07820', fontSize: 12, fontWeight: '700' },

  coinsSaldoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fffbea', borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#e8d090',
  },
  coinsSaldoLabel: { fontSize: 13, color: '#888' },
  coinsSaldoVal:   { fontSize: 18, fontWeight: '800', color: '#a07820' },

  coinsTabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  coinsTab: {
    flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  coinsTabActive: { backgroundColor: '#1a6470' },
  coinsTabTxt:    { fontSize: 13, fontWeight: '600', color: '#888' },
  coinsTabActiveTxt: { color: '#fff' },

  coinsAcciones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  coinsBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  coinsBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  txRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  txConcepto: { fontSize: 13, fontWeight: '600' },
  txFecha:    { fontSize: 11, color: '#aaa', marginTop: 2 },
  txCantidad: { fontSize: 14, fontWeight: '800' },
})
