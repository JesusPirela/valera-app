import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TextInput,
  ActivityIndicator, TouchableOpacity, ScrollView, Modal, Alert, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
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

// Anchos de columnas
const COL = { nombre: 150, estado: 130, telefono: 120, empresa: 110, fecha: 80 }
const COLS = [
  { key: 'nombre',   label: 'Nombre',    width: COL.nombre,   sortable: true  },
  { key: 'estado',   label: 'Estado',    width: COL.estado,   sortable: true  },
  { key: 'telefono', label: 'Teléfono',  width: COL.telefono, sortable: false },
  { key: 'empresa',  label: 'Empresa',   width: COL.empresa,  sortable: true  },
  { key: 'fecha',    label: 'Agregado',  width: COL.fecha,    sortable: true  },
]
const TABLE_WIDTH = COLS.reduce((s, c) => s + c.width, 0) + COLS.length + 1

type UsuarioSimple = { id: string; nombre: string }

const ESTADOS_LISTA = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

export default function AdminCRM() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [operacionFiltro, setOperacionFiltro] = useState<'venta' | 'renta' | null>(null)

  // Modal nuevo cliente
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

    // 1. Traer todos los clientes
    const { data: clientesData, error: errorClientes } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, empresa, estado, tipo_operacion, created_at, responsable_id')
      .order('created_at', { ascending: false })

    if (errorClientes) {
      setErrorMsg(`Error al cargar clientes: ${errorClientes.message}`)
      setLoading(false)
      return
    }
    if (!clientesData || clientesData.length === 0) {
      setSecciones([])
      setLoading(false)
      return
    }

    // 2. Traer los perfiles de los responsables únicos
    const idsUnicos = [...new Set(clientesData.map((c: any) => c.responsable_id).filter(Boolean))]
    const { data: perfilesData } = await supabase
      .from('profiles')
      .select('id, nombre')
      .in('id', idsUnicos)

    const mapaPerfiles = new Map<string, { nombre: string; email: string }>()
    for (const p of perfilesData ?? []) {
      mapaPerfiles.set(p.id, { nombre: p.nombre ?? 'Sin nombre', email: '' })
    }

    const clientesNorm: ClienteAdmin[] = clientesData.map((c: any) => {
      const perfil = mapaPerfiles.get(c.responsable_id)
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        empresa: c.empresa,
        estado: c.estado,
        tipo_operacion: c.tipo_operacion ?? null,
        created_at: c.created_at,
        responsable_id: c.responsable_id,
        prospectador_nombre: perfil?.nombre ?? 'Sin asignar',
        prospectador_email: perfil?.email ?? '',
      }
    })

    const mapaProsp = new Map<string, ClienteAdmin[]>()
    for (const cl of clientesNorm) {
      const key = cl.prospectador_nombre
      if (!mapaProsp.has(key)) mapaProsp.set(key, [])
      mapaProsp.get(key)!.push(cl)
    }

    const secs: Seccion[] = Array.from(mapaProsp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nombre, clientes]) => ({
        title: nombre,
        email: clientes[0]?.prospectador_email ?? '',
        data: clientes,
        total: clientes.length,
      }))

    setSecciones(secs)
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
    if (!nuevoNombre.trim()) {
      if (Platform.OS === 'web') window.alert('El nombre es requerido')
      else Alert.alert('Error', 'El nombre es requerido')
      return
    }
    if (!nuevoTelefono.trim()) {
      if (Platform.OS === 'web') window.alert('El teléfono es requerido')
      else Alert.alert('Error', 'El teléfono es requerido')
      return
    }
    if (!nuevoUserId) {
      if (Platform.OS === 'web') window.alert('Selecciona un asesor')
      else Alert.alert('Error', 'Selecciona un asesor al que asignar el cliente')
      return
    }
    setGuardandoCliente(true)
    const { error } = await supabase.from('clientes').insert({
      nombre: nuevoNombre.trim(),
      telefono: nuevoTelefono.trim(),
      email: nuevoEmail.trim() || null,
      empresa: nuevoEmpresa.trim() || null,
      tipo_operacion: nuevoTipoOp,
      estado: nuevoEstado,
      fuente_lead: 'admin',
      responsable_id: nuevoUserId,
    })
    setGuardandoCliente(false)
    if (error) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`)
      else Alert.alert('Error', error.message)
      return
    }
    setModalNuevo(false)
    cargarClientes()
  }

  function toggleSeccion(title: string) {
    setSeccionesColapsadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(title)) nuevo.delete(title)
      else nuevo.add(title)
      return nuevo
    })
  }

  function toggleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  function sortIcon(col: string) {
    if (sortCol !== col) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  function sortClientes(clientes: ClienteAdmin[]) {
    return [...clientes].sort((a, b) => {
      let va: string, vb: string
      if (sortCol === 'nombre')   { va = a.nombre; vb = b.nombre }
      else if (sortCol === 'estado')  { va = a.estado; vb = b.estado }
      else if (sortCol === 'empresa') { va = a.empresa ?? ''; vb = b.empresa ?? '' }
      else { va = a.created_at; vb = b.created_at }
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }

  const todosClientes = secciones.flatMap((s) => s.data)
  const totalGlobal = todosClientes.length
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
          c.nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
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
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.resumenScroll} contentContainerStyle={styles.resumenContent}
      >
        <TouchableOpacity
          style={[styles.resumenChip, estadoFiltro === null && styles.resumenChipAll]}
          onPress={() => setEstadoFiltro(null)}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#1a6470' }} />
          <Text style={[styles.resumenLabel, estadoFiltro === null && styles.resumenLabelAll]}>Todos</Text>
          <View style={{
            backgroundColor: estadoFiltro === null ? '#1a6470' : '#e8eef0',
            borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: estadoFiltro === null ? '#fff' : '#6b8082' }}>
              {totalGlobal}
            </Text>
          </View>
        </TouchableOpacity>
        {ORDEN_ESTADOS.map((e) => {
          const info = estadoInfo(e)
          const activo = estadoFiltro === e
          return (
            <TouchableOpacity
              key={e}
              style={[styles.resumenChip, activo && { backgroundColor: info.bg, borderColor: info.color }]}
              onPress={() => setEstadoFiltro(activo ? null : e)}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: info.color }} />
              <Text style={[styles.resumenLabel, activo && { color: info.color, fontWeight: '700' }]}>
                {info.label}
              </Text>
              <View style={{
                backgroundColor: activo ? info.color : '#e8eef0',
                borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: activo ? '#fff' : '#6b8082' }}>
                  {conteosPorEstado[e]}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Búsqueda + botón nuevo */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o prospectador..."
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity style={styles.btnNuevo} onPress={abrirModalNuevo}>
          <Text style={styles.btnNuevoText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : errorMsg ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: '#c0392b', fontSize: 13 }]}>{errorMsg}</Text>
        </View>
      ) : seccionesFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {seccionesFiltradas.map((sec) => {
            const colapsada = seccionesColapsadas.has(sec.title)
            const totalSec = secciones.find((s) => s.title === sec.title)?.total ?? 0
            const clientesOrdenados = sortClientes(sec.data)

            return (
              <View key={sec.title} style={styles.seccion}>
                {/* Cabecera del prospectador */}
                <TouchableOpacity
                  style={styles.secHeader}
                  onPress={() => toggleSeccion(sec.title)}
                  activeOpacity={0.75}
                >
                  <View style={styles.secHeaderLeft}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {sec.title.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.secNombre}>{sec.title}</Text>
                    </View>
                  </View>
                  <View style={styles.secHeaderRight}>
                    <View style={styles.totalBadge}>
                      <Text style={styles.totalBadgeText}>{totalSec} clientes</Text>
                    </View>
                    <Text style={styles.chevron}>{colapsada ? '▶' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Tabla de clientes (colapsable) */}
                {!colapsada && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    style={styles.tableWrapper}
                  >
                    <View style={{ width: TABLE_WIDTH }}>
                      {/* Encabezado de tabla */}
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
                              {col.sortable
                                ? <Text style={styles.sortIcon}>{sortIcon(col.key)}</Text>
                                : null}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Filas */}
                      {clientesOrdenados.map((item, idx) => {
                        const info = estadoInfo(item.estado)
                        const isEven = idx % 2 === 0
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}
                            onPress={() =>
                            item.responsable_id === currentUserId
                              ? router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)
                              : router.push(`/(admin)/detalle-cliente?id=${item.id}`)
                          }
                            activeOpacity={0.75}
                          >
                            {/* Nombre */}
                            <View style={[styles.cell, { width: COL.nombre }, styles.cellBorderRight]}>
                              <Text style={styles.cellNombre} numberOfLines={1}>{item.nombre}</Text>
                              {item.empresa
                                ? <Text style={styles.cellSub} numberOfLines={1}>{item.empresa}</Text>
                                : null}
                            </View>

                            {/* Estado */}
                            <View style={[styles.cell, { width: COL.estado }, styles.cellBorderRight, styles.cellCenter]}>
                              <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                                <Text style={[styles.estadoText, { color: info.color }]} numberOfLines={1}>
                                  {info.label}
                                </Text>
                              </View>
                            </View>

                            {/* Teléfono */}
                            <View style={[styles.cell, { width: COL.telefono }, styles.cellBorderRight]}>
                              <Text style={styles.cellText} numberOfLines={1}>{item.telefono}</Text>
                            </View>

                            {/* Empresa */}
                            <View style={[styles.cell, { width: COL.empresa }, styles.cellBorderRight]}>
                              <Text style={styles.cellText} numberOfLines={1}>{item.empresa ?? '—'}</Text>
                            </View>

                            {/* Agregado */}
                            <View style={[styles.cell, { width: COL.fecha }]}>
                              <Text style={styles.cellFecha}>{tiempoRelativo(item.created_at)}</Text>
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </ScrollView>
                )}
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
                <Text style={styles.modalCerrar}>✕</Text>
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
                      {nuevoUserId === u.id && <Text style={{ color: '#2a8a5a', fontSize: 16 }}>✓</Text>}
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

  // Operacion tabs
  operacionRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#edf0f3',
  },
  operacionTab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  operacionTabActivo: { borderBottomColor: '#1a6470' },
  operacionTabText: { fontSize: 13, fontWeight: '600', color: '#b0bec5' },
  operacionTabTextActivo: { color: '#1a6470' },

  // Resumen (pipeline chips)
  resumenScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  resumenContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  resumenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e5eaed',
    backgroundColor: '#fafbfc',
  },
  resumenChipAll: { backgroundColor: '#e8f4f5', borderColor: '#1a6470' },
  resumenCount: { fontSize: 11, fontWeight: '700', color: '#6b8082' },
  resumenCountAll: { color: '#fff' },
  resumenLabel: { fontSize: 12, color: '#6b8082', fontWeight: '500' },
  resumenLabelAll: { color: '#1a6470', fontWeight: '700' },

  // Search
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8ea',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#1a1a2e',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  btnNuevo: {
    backgroundColor: '#1a6470', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3,
  },
  btnNuevoText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Empty
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, color: '#9eafb2' },

  // Sección prospectador
  seccion: { marginHorizontal: 12, marginBottom: 14 },
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#c9a84c', fontSize: 17, fontWeight: '800' },
  secNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  secEmail: { fontSize: 11, color: '#aaa', marginTop: 1 },
  secHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalBadge: { backgroundColor: '#e8f4f5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  totalBadgeText: { fontSize: 12, color: '#1a6470', fontWeight: '700' },
  chevron: { fontSize: 12, color: '#c0cdd0' },

  // Table
  tableWrapper: {
    borderWidth: 1, borderColor: '#e0e8ea',
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    borderTopWidth: 0, overflow: 'hidden',
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#1a6470',
    borderBottomWidth: 2, borderBottomColor: '#c9a84c',
  },
  headerCell: { paddingVertical: 10, paddingHorizontal: 10, justifyContent: 'center' },
  headerCellText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },
  sortIcon: { color: '#c9a84c', fontWeight: '400' },
  cellBorderRight: { borderRightWidth: 1, borderRightColor: '#e0e8ea' },

  tableRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#edf0f3', minHeight: 46,
  },
  rowEven: { backgroundColor: '#ffffff' },
  rowOdd:  { backgroundColor: '#f7f9fb' },

  cell: { paddingVertical: 10, paddingHorizontal: 10, justifyContent: 'center' },
  cellCenter: { alignItems: 'center' },
  cellNombre: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  cellSub:    { fontSize: 11, color: '#9eafb2', marginTop: 2 },
  cellText:   { fontSize: 13, color: '#4a5568' },
  cellFecha:  { fontSize: 12, color: '#9eafb2', textAlign: 'center' },

  estadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  estadoText:  { fontSize: 11, fontWeight: '700' },

  // Modal nuevo cliente
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  modalCerrar: { fontSize: 18, color: '#9eafb2', paddingHorizontal: 6 },
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
