import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking,
  ActivityIndicator, TouchableOpacity, ScrollView, Modal, Alert, FlatList,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from '../(prospectador)/crm'

type ClienteAdmin = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  estado: string
  tipo_operacion: string | null
  created_at: string
  responsable_id: string
  prospectador_nombre: string
  prospectador_email: string
}

type Seccion = {
  title: string
  email: string
  data: ClienteAdmin[]
  total: number
}

const ORDEN_ESTADOS = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

const ESTADOS_LISTA = ORDEN_ESTADOS

function estadoInfo(estado: string) {
  return ESTADOS[estado] ?? { label: estado, color: '#555', bg: '#eee' }
}

function tiempoRelativo(fechaISO: string) {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias}d`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function abrirWhatsApp(telefono: string, nombre: string) {
  const phone = telefono.replace(/\D/g, '')
  const num = phone.length === 10 ? `52${phone}` : phone
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else Linking.openURL(url)
}

type UsuarioSimple = { id: string; nombre: string }

export default function AdminCRM() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [operacionFiltro, setOperacionFiltro] = useState<'venta' | 'renta' | null>(null)

  const [modalNuevo, setModalNuevo] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoEmpresa, setNuevoEmpresa] = useState('')
  const [nuevoTipoOp, setNuevoTipoOp] = useState<'venta' | 'renta'>('venta')
  const [nuevoEstado, setNuevoEstado] = useState('por_perfilar')
  const [nuevoUserId, setNuevoUserId] = useState('')
  const [usuariosLista, setUsuariosLista] = useState<UsuarioSimple[]>([])
  const [guardandoCliente, setGuardandoCliente] = useState(false)

  async function cargarClientes() {
    setLoading(true)
    setErrorMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    const { data: clientesData, error: errorClientes } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, empresa, estado, tipo_operacion, created_at, responsable_id')
      .order('updated_at', { ascending: false })

    if (errorClientes) { setErrorMsg(errorClientes.message); setLoading(false); return }
    if (!clientesData?.length) { setSecciones([]); setLoading(false); return }

    const idsUnicos = [...new Set(clientesData.map((c: any) => c.responsable_id).filter(Boolean))]
    const { data: perfilesData } = await supabase
      .from('profiles').select('id, nombre').in('id', idsUnicos)

    const mapaPerfiles = new Map<string, string>()
    for (const p of perfilesData ?? []) mapaPerfiles.set(p.id, p.nombre ?? 'Sin nombre')

    const clientesNorm: ClienteAdmin[] = clientesData.map((c: any) => ({
      id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email,
      empresa: c.empresa, estado: c.estado, tipo_operacion: c.tipo_operacion ?? null,
      created_at: c.created_at, responsable_id: c.responsable_id,
      prospectador_nombre: mapaPerfiles.get(c.responsable_id) ?? 'Sin asignar',
      prospectador_email: '',
    }))

    const mapaProsp = new Map<string, ClienteAdmin[]>()
    for (const cl of clientesNorm) {
      if (!mapaProsp.has(cl.prospectador_nombre)) mapaProsp.set(cl.prospectador_nombre, [])
      mapaProsp.get(cl.prospectador_nombre)!.push(cl)
    }

    setSecciones(
      Array.from(mapaProsp.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nombre, clientes]) => ({ title: nombre, email: '', data: clientes, total: clientes.length }))
    )
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarClientes() }, []))

  async function abrirModalNuevo() {
    setNuevoNombre(''); setNuevoTelefono(''); setNuevoEmail('')
    setNuevoEmpresa(''); setNuevoTipoOp('venta'); setNuevoEstado('por_perfilar'); setNuevoUserId('')
    const { data } = await supabase.from('profiles').select('id, nombre').neq('role', 'admin').order('nombre')
    setUsuariosLista((data ?? []) as UsuarioSimple[])
    setModalNuevo(true)
  }

  async function guardarNuevoCliente() {
    if (!nuevoNombre.trim()) { Platform.OS === 'web' ? window.alert('El nombre es requerido') : Alert.alert('Error', 'El nombre es requerido'); return }
    if (!nuevoTelefono.trim()) { Platform.OS === 'web' ? window.alert('El teléfono es requerido') : Alert.alert('Error', 'El teléfono es requerido'); return }
    if (!nuevoUserId) { Platform.OS === 'web' ? window.alert('Selecciona un asesor') : Alert.alert('Error', 'Selecciona un asesor'); return }
    setGuardandoCliente(true)
    const { error } = await supabase.from('clientes').insert({
      nombre: nuevoNombre.trim(), telefono: nuevoTelefono.trim(),
      email: nuevoEmail.trim() || null, empresa: nuevoEmpresa.trim() || null,
      tipo_operacion: nuevoTipoOp, estado: nuevoEstado,
      fuente_lead: 'admin', responsable_id: nuevoUserId,
    })
    setGuardandoCliente(false)
    if (error) { Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); return }
    setModalNuevo(false)
    cargarClientes()
  }

  const todosClientes = secciones.flatMap((s) => s.data)
  const totalGlobal = todosClientes.length
  const calientes = todosClientes.filter(c => c.estado === 'seguimiento_cierre' || c.estado === 'cita_agendada').length
  const comprados = todosClientes.filter(c => c.estado === 'compro').length
  const conteosPorEstado = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = todosClientes.filter((c) => c.estado === e).length
    return acc
  }, {})

  const seccionesFiltradas: Seccion[] = secciones
    .map((sec) => {
      let clientes = sec.data
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        clientes = clientes.filter((c) =>
          c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) ||
          (c.empresa ?? '').toLowerCase().includes(q) ||
          sec.title.toLowerCase().includes(q)
        )
      }
      if (estadoFiltro) clientes = clientes.filter((c) => c.estado === estadoFiltro)
      if (operacionFiltro) clientes = clientes.filter((c) => c.tipo_operacion === operacionFiltro)
      return { ...sec, data: clientes }
    })
    .filter((sec) => sec.data.length > 0)

  return (
    <View style={styles.container}>

      {/* Stats banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#1a6470' }]}>{totalGlobal}</Text>
          <Text style={styles.statLabel}>Leads</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#6a1b9a' }]}>{calientes}</Text>
          <Text style={styles.statLabel}>Calientes</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#2e7d32' }]}>{comprados}</Text>
          <Text style={styles.statLabel}>Cerrados</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#1a6470' }]}>{secciones.length}</Text>
          <Text style={styles.statLabel}>Asesores</Text>
        </View>
      </View>

      {/* Filtro Venta / Renta */}
      <View style={styles.operacionRow}>
        {([null, 'venta', 'renta'] as const).map((op) => {
          const activo = operacionFiltro === op
          const label = op === null ? 'Todos' : op === 'venta' ? 'Venta' : 'Renta'
          return (
            <TouchableOpacity key={label} style={[styles.operacionTab, activo && styles.operacionTabActivo]} onPress={() => setOperacionFiltro(op)}>
              <Text style={[styles.operacionTabText, activo && styles.operacionTabTextActivo]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Pipeline chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pipelineScroll} contentContainerStyle={styles.pipelineContent}>
        <TouchableOpacity
          style={[styles.pipelineChip, estadoFiltro === null && styles.pipelineChipAll]}
          onPress={() => setEstadoFiltro(null)}
        >
          <View style={[styles.pipelineDot, { backgroundColor: estadoFiltro === null ? '#c9a84c' : '#aaa' }]} />
          <View>
            <Text style={[styles.pipelineCount, estadoFiltro === null && styles.pipelineCountAll]}>{totalGlobal}</Text>
            <Text style={[styles.pipelineLabel, estadoFiltro === null && styles.pipelineLabelAll]}>Todos</Text>
          </View>
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
              <View style={[styles.pipelineDot, { backgroundColor: info.color }]} />
              <View>
                <Text style={[styles.pipelineCount, activo && { color: info.color }]}>{conteosPorEstado[e]}</Text>
                <Text style={[styles.pipelineLabel, activo && { color: info.color, fontWeight: '600' }]}>{info.label}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Búsqueda + botón nuevo */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#9eafb2" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar cliente o asesor..."
            value={busqueda}
            onChangeText={setBusqueda}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity style={styles.btnNuevo} onPress={abrirModalNuevo}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <Text style={{ color: '#c0392b', fontSize: 13 }}>{errorMsg}</Text>
        </View>
      ) : seccionesFiltradas.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={48} color="#d0dfe1" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}>
          {seccionesFiltradas.map((sec) => {
            const colapsada = seccionesColapsadas.has(sec.title)
            const totalSec = secciones.find((s) => s.title === sec.title)?.total ?? 0
            const initProsp = iniciales(sec.title)

            return (
              <View key={sec.title} style={styles.seccion}>
                {/* Cabecera del prospectador */}
                <TouchableOpacity
                  style={styles.secHeader}
                  onPress={() => setSeccionesColapsadas((prev) => {
                    const s = new Set(prev)
                    s.has(sec.title) ? s.delete(sec.title) : s.add(sec.title)
                    return s
                  })}
                  activeOpacity={0.75}
                >
                  <View style={styles.secHeaderLeft}>
                    <View style={styles.secAvatar}>
                      <Text style={styles.secAvatarText}>{initProsp}</Text>
                    </View>
                    <View>
                      <Text style={styles.secNombre}>{sec.title}</Text>
                      <Text style={styles.secSub}>{sec.data.length} mostrando · {totalSec} total</Text>
                    </View>
                  </View>
                  <Ionicons name={colapsada ? 'chevron-forward' : 'chevron-down'} size={16} color="#c0cdd0" />
                </TouchableOpacity>

                {/* Cards de clientes */}
                {!colapsada && sec.data.map((item) => {
                  const info = estadoInfo(item.estado)
                  const initials = iniciales(item.nombre)
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.card}
                      onPress={() =>
                        item.responsable_id === currentUserId
                          ? router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)
                          : router.push(`/(admin)/detalle-cliente?id=${item.id}`)
                      }
                      activeOpacity={0.82}
                    >
                      <View style={[styles.cardAccent, { backgroundColor: info.color }]} />
                      <View style={styles.cardInner}>
                        <View style={styles.cardTop}>
                          <View style={[styles.avatar, { backgroundColor: info.color + '18' }]}>
                            <Text style={[styles.avatarText, { color: info.color }]}>{initials}</Text>
                          </View>
                          <View style={styles.cardInfo}>
                            <Text style={styles.cardNombre} numberOfLines={1}>{item.nombre}</Text>
                            <Text style={styles.cardSub} numberOfLines={1}>
                              {item.empresa ? item.empresa : item.telefono}
                            </Text>
                          </View>
                          <View style={[styles.estadoBadge, { backgroundColor: info.bg, borderColor: info.color + '50' }]}>
                            <View style={[styles.estadoDot, { backgroundColor: info.color }]} />
                            <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                          </View>
                        </View>

                        <View style={styles.cardMeta}>
                          {item.empresa ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="call-outline" size={11} color="#b0bfc2" />
                              <Text style={styles.metaText}>{item.telefono}</Text>
                            </View>
                          ) : null}
                          {item.tipo_operacion ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="home-outline" size={11} color="#b0bfc2" />
                              <Text style={styles.metaText}>{item.tipo_operacion}</Text>
                            </View>
                          ) : null}
                          <View style={styles.metaItem}>
                            <Ionicons name="time-outline" size={11} color="#b0bfc2" />
                            <Text style={styles.metaText}>{tiempoRelativo(item.created_at)}</Text>
                          </View>
                        </View>

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.actionWa}
                            onPress={() => abrirWhatsApp(item.telefono, item.nombre)}
                          >
                            <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                            <Text style={styles.actionWaText}>WhatsApp</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionCall}
                            onPress={() => Linking.openURL(`tel:${item.telefono}`)}
                          >
                            <Ionicons name="call-outline" size={12} color="#1a6470" />
                            <Text style={styles.actionCallText}>Llamar</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Ionicons name="chevron-forward" size={14} color="#d0d8da" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* Modal nuevo cliente */}
      <Modal visible={modalNuevo} animationType="slide" transparent onRequestClose={() => setModalNuevo(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Nuevo cliente</Text>
              <TouchableOpacity onPress={() => setModalNuevo(false)}>
                <Ionicons name="close" size={22} color="#9eafb2" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.mLabel}>Nombre *</Text>
              <TextInput style={styles.mInput} placeholder="Nombre completo" value={nuevoNombre} onChangeText={setNuevoNombre} autoCapitalize="words" />

              <Text style={styles.mLabel}>Teléfono *</Text>
              <TextInput style={styles.mInput} placeholder="10 dígitos" value={nuevoTelefono} onChangeText={setNuevoTelefono} keyboardType="phone-pad" />

              <Text style={styles.mLabel}>Email</Text>
              <TextInput style={styles.mInput} placeholder="correo@ejemplo.com" value={nuevoEmail} onChangeText={setNuevoEmail} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.mLabel}>Empresa</Text>
              <TextInput style={styles.mInput} placeholder="Empresa (opcional)" value={nuevoEmpresa} onChangeText={setNuevoEmpresa} />

              <Text style={styles.mLabel}>Tipo de operación</Text>
              <View style={styles.mRow}>
                {(['venta', 'renta'] as const).map(op => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.mChip, nuevoTipoOp === op && styles.mChipActivo]}
                    onPress={() => setNuevoTipoOp(op)}
                  >
                    <Text style={[styles.mChipTxt, nuevoTipoOp === op && { color: '#fff' }]}>
                      {op === 'venta' ? 'Venta' : 'Renta'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.mLabel}>Estado inicial</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={styles.mRow}>
                  {ESTADOS_LISTA.map(e => {
                    const info = ESTADOS[e] ?? { label: e, color: '#555', bg: '#eee' }
                    return (
                      <TouchableOpacity
                        key={e}
                        style={[styles.mChip, { borderColor: info.color }, nuevoEstado === e && { backgroundColor: info.bg }]}
                        onPress={() => setNuevoEstado(e)}
                      >
                        <Text style={[styles.mChipTxt, { color: info.color }]}>{info.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>

              <Text style={styles.mLabel}>Asignar a asesor *</Text>
              {usuariosLista.length === 0 ? (
                <Text style={styles.mHint}>No hay asesores registrados</Text>
              ) : (
                <View style={styles.mUsuariosList}>
                  {usuariosLista.map(u => (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.mUsuarioRow, nuevoUserId === u.id && styles.mUsuarioRowActivo]}
                      onPress={() => setNuevoUserId(u.id)}
                    >
                      <View style={[styles.mAvatar, { backgroundColor: nuevoUserId === u.id ? '#d4f0e2' : '#e8f2f4' }]}>
                        <Text style={[styles.mAvatarTxt, { color: nuevoUserId === u.id ? '#2a8a5a' : '#1a6470' }]}>
                          {(u.nombre ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.mUsuarioNombre, nuevoUserId === u.id && { color: '#2a8a5a', fontWeight: '700' }]}>
                        {u.nombre}
                      </Text>
                      {nuevoUserId === u.id && <Ionicons name="checkmark-circle" size={18} color="#2a8a5a" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.mGuardarBtn, guardandoCliente && { opacity: 0.6 }]}
                onPress={guardarNuevoCliente}
                disabled={guardandoCliente}
              >
                {guardandoCliente
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.mGuardarTxt}>Crear cliente</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },

  // Stats
  statsBanner: {
    flexDirection: 'row', backgroundColor: '#1a6470',
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  statSep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Operacion tabs
  operacionRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  operacionTab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  operacionTabActivo: { borderBottomColor: '#c9a84c' },
  operacionTabText: { fontSize: 13, fontWeight: '600', color: '#b0bec5' },
  operacionTabTextActivo: { color: '#1a6470' },

  // Pipeline
  pipelineScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  pipelineContent: { paddingHorizontal: 10, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  pipelineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e8e8e8',
    backgroundColor: '#fafafa', minWidth: 75,
  },
  pipelineChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  pipelineDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  pipelineCount: { fontSize: 15, fontWeight: '800', color: '#444', lineHeight: 17 },
  pipelineCountAll: { color: '#fff' },
  pipelineLabel: { fontSize: 9, color: '#999', fontWeight: '500', lineHeight: 11 },
  pipelineLabelAll: { color: '#c9a84c' },

  // Search
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e2e8ea', paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#1a1a2e' },
  btnNuevo: {
    backgroundColor: '#1a6470', borderRadius: 14,
    width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 16, color: '#9eafb2', fontWeight: '600' },

  // Sección prospectador
  seccion: { marginHorizontal: 12, marginTop: 14 },
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 6,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  secAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center',
  },
  secAvatarText: { color: '#c9a84c', fontSize: 16, fontWeight: '800' },
  secNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  secSub: { fontSize: 11, color: '#aaa', marginTop: 1 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 8,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: '#e8eef0',
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
  },
  cardAccent: { width: 4, flexShrink: 0 },
  cardInner: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  cardSub: { fontSize: 11, color: '#9eafb2', marginTop: 1 },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, flexShrink: 0, alignSelf: 'flex-start',
  },
  estadoDot: { width: 4, height: 4, borderRadius: 2 },
  estadoText: { fontSize: 10, fontWeight: '700' },

  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 7 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#8a9fa2' },

  cardActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionWa: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f0fdf6', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#d1f7e2',
  },
  actionWaText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  actionCall: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f0f8fa', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#cde8ed',
  },
  actionCallText: { fontSize: 11, fontWeight: '600', color: '#1a6470' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  mLabel: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 14 },
  mInput: { borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a2e30', backgroundColor: '#f5f7f8' },
  mRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mChip: { borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  mChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  mChipTxt: { fontSize: 13, fontWeight: '600', color: '#1a6470' },
  mHint: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
  mUsuariosList: { borderWidth: 1, borderColor: '#e0eaec', borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  mUsuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  mUsuarioRowActivo: { backgroundColor: '#f0fcf6' },
  mAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  mAvatarTxt: { fontSize: 14, fontWeight: '700' },
  mUsuarioNombre: { flex: 1, fontSize: 14, color: '#1a2e30' },
  mGuardarBtn: { backgroundColor: '#c9a84c', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  mGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
