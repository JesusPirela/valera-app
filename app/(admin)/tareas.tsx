import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, TextInput, Modal, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

type UserProfile = { id: string; nombre: string; email: string }

type Asignacion = {
  id: string
  user_id: string
  progreso: number
  completada: boolean
  completada_at: string | null
  user: UserProfile
}

type Tarea = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: string
  meta_cantidad: number
  fecha_limite: string | null
  para_todos: boolean
  activa: boolean
  created_at: string
  tarea_asignaciones: Asignacion[]
}

const TIPOS = [
  { key: 'manual', label: 'Manual', icon: 'checkmark-circle-outline', hint: 'El usuario la marca manualmente' },
  { key: 'publicar_propiedades', label: 'Publicar propiedades', icon: 'home-outline', hint: 'Progresa al marcar propiedades como publicadas' },
  { key: 'contactar_clientes', label: 'Contactar clientes', icon: 'people-outline', hint: 'Progresa al contactar clientes en el CRM' },
  { key: 'completar_curso', label: 'Completar curso', icon: 'school-outline', hint: 'Progresa al completar lecciones' },
]

const NAV_ITEMS = [
  { label: 'Nueva', icon: '＋', route: '/(admin)/nueva-propiedad', color: '#1a6470' },
  { label: 'CRM', icon: '👤', route: '/(admin)/crm', color: '#0f4c5c' },
  { label: 'Actividad', icon: '📋', route: '/(admin)/actividad', color: '#2a8a7a' },
  { label: 'Estadísticas', icon: '📊', route: '/(admin)/estadisticas', color: '#1a7060' },
  { label: 'Usuarios', icon: '👥', route: '/(admin)/prospectadores', color: '#145560' },
  { label: 'Universidad', icon: '🎓', route: '/(admin)/university', color: '#c9a84c' },
]

import { router } from 'expo-router'

export default function AdminTareas() {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  // Form state
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState('manual')
  const [metaCantidad, setMetaCantidad] = useState('1')
  const [fechaLimite, setFechaLimite] = useState('')
  const [paraAlguien, setParaAlguien] = useState<'todos' | 'seleccion'>('todos')
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => {
    cargar()
  }, []))

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('tareas')
      .select(`
        id, titulo, descripcion, tipo, meta_cantidad, fecha_limite,
        para_todos, activa, created_at,
        tarea_asignaciones(
          id, user_id, progreso, completada, completada_at,
          user:profiles!tarea_asignaciones_user_id_fkey(id, nombre, email)
        )
      `)
      .eq('activa', true)
      .order('created_at', { ascending: false })

    setTareas((data ?? []) as any)
    setLoading(false)
  }

  async function abrirModal() {
    setTitulo('')
    setDescripcion('')
    setTipo('manual')
    setMetaCantidad('1')
    setFechaLimite('')
    setParaAlguien('todos')
    setSeleccionados([])

    const { data } = await supabase
      .from('profiles')
      .select('id, nombre, email')
      .neq('role', 'admin')
      .order('nombre')
    setUsuarios((data ?? []) as UserProfile[])
    setModalVisible(true)
  }

  function toggleSeleccion(id: string) {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function guardarTarea() {
    if (!titulo.trim()) {
      if (Platform.OS === 'web') window.alert('El título es requerido')
      else Alert.alert('Error', 'El título es requerido')
      return
    }
    if (paraAlguien === 'seleccion' && seleccionados.length === 0) {
      if (Platform.OS === 'web') window.alert('Selecciona al menos un usuario')
      else Alert.alert('Error', 'Selecciona al menos un usuario')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setGuardando(true)

    const meta = parseInt(metaCantidad) || 1
    const esParaTodos = paraAlguien === 'todos'

    const { data: tarea, error } = await supabase
      .from('tareas')
      .insert({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        meta_cantidad: meta,
        fecha_limite: fechaLimite || null,
        para_todos: esParaTodos,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !tarea) {
      setGuardando(false)
      if (Platform.OS === 'web') window.alert('Error al crear la tarea')
      else Alert.alert('Error', 'No se pudo crear la tarea')
      return
    }

    // Crear asignaciones
    const destinos = esParaTodos ? usuarios.map(u => u.id) : seleccionados
    if (destinos.length > 0) {
      await supabase.from('tarea_asignaciones').insert(
        destinos.map(uid => ({ tarea_id: tarea.id, user_id: uid }))
      )
    }

    setGuardando(false)
    setModalVisible(false)
    cargar()
  }

  async function desactivarTarea(tareaId: string) {
    const confirmar = Platform.OS === 'web'
      ? window.confirm('¿Desactivar esta tarea?')
      : await new Promise<boolean>(resolve =>
          Alert.alert('Desactivar', '¿Desactivar esta tarea?', [
            { text: 'Cancelar', onPress: () => resolve(false) },
            { text: 'Desactivar', style: 'destructive', onPress: () => resolve(true) },
          ])
        )
    if (!confirmar) return
    await supabase.from('tareas').update({ activa: false }).eq('id', tareaId)
    cargar()
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f5' }}>
      {/* Navegación superior */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navBar} contentContainerStyle={styles.navContent}>
        {NAV_ITEMS.map(item => (
          <TouchableOpacity key={item.route} style={[styles.navItem, { backgroundColor: item.color }]} onPress={() => router.push(item.route as any)}>
            <Text style={styles.navIcon}>{item.icon}</Text>
            <Text style={styles.navLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tareas Diarias</Text>
        <TouchableOpacity style={styles.crearBtn} onPress={abrirModal}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.crearText}>Nueva tarea</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {tareas.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Sin tareas creadas</Text>
            <Text style={styles.emptySub}>Crea una tarea y asígnala a tu equipo</Text>
          </View>
        )}

        {tareas.map(tarea => {
          const asigs = tarea.tarea_asignaciones ?? []
          const completadas = asigs.filter(a => a.completada).length
          const pctGlobal = asigs.length > 0 ? Math.round((completadas / asigs.length) * 100) : 0
          const abierta = expandida === tarea.id

          return (
            <View key={tarea.id} style={styles.card}>
              <TouchableOpacity onPress={() => setExpandida(abierta ? null : tarea.id)} activeOpacity={0.8}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitulo}>{tarea.titulo}</Text>
                    {tarea.descripcion ? (
                      <Text style={styles.cardDesc} numberOfLines={abierta ? undefined : 1}>
                        {tarea.descripcion}
                      </Text>
                    ) : null}
                    <View style={styles.chipRow}>
                      <Text style={styles.tipoChip}>{TIPOS.find(t => t.key === tarea.tipo)?.label ?? tarea.tipo}</Text>
                      {tarea.meta_cantidad > 1 && (
                        <Text style={styles.metaChip}>Meta: {tarea.meta_cantidad}</Text>
                      )}
                      {tarea.fecha_limite && (
                        <Text style={styles.fechaChip}>
                          📅 {new Date(tarea.fecha_limite).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctText}>{pctGlobal}%</Text>
                    <Text style={styles.pctSub}>{completadas}/{asigs.length}</Text>
                  </View>
                </View>

                {/* Barra de progreso global */}
                <View style={styles.globalBar}>
                  <View style={[styles.globalBarFill, { width: `${pctGlobal}%` as any }]} />
                </View>
              </TouchableOpacity>

              {/* Lista de usuarios (expandible) */}
              {abierta && (
                <View style={styles.usuariosList}>
                  <Text style={styles.usuariosHeader}>Progreso por usuario</Text>
                  {asigs.length === 0 && (
                    <Text style={styles.sinUsuarios}>Sin usuarios asignados</Text>
                  )}
                  {asigs.map(a => {
                    const medible = tarea.meta_cantidad > 1
                    const pctUser = medible
                      ? Math.min(100, Math.round((a.progreso / tarea.meta_cantidad) * 100))
                      : a.completada ? 100 : 0
                    return (
                      <View key={a.id} style={styles.usuarioRow}>
                        <View style={[styles.avatar, { backgroundColor: a.completada ? '#d4f0e2' : '#e8f2f4' }]}>
                          <Text style={[styles.avatarText, { color: a.completada ? '#2a8a5a' : '#1a6470' }]}>
                            {(a.user?.nombre ?? '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.usuarioNombre}>{a.user?.nombre ?? 'Usuario'}</Text>
                          {medible && (
                            <View style={styles.usuarioBar}>
                              <View style={[styles.usuarioBarFill, { width: `${pctUser}%` as any, backgroundColor: a.completada ? '#2a8a5a' : '#1a6470' }]} />
                            </View>
                          )}
                        </View>
                        <View style={styles.statusWrap}>
                          {a.completada ? (
                            <View style={styles.doneBadge}>
                              <Ionicons name="checkmark" size={12} color="#2a8a5a" />
                              <Text style={styles.doneText}>Listo</Text>
                            </View>
                          ) : (
                            <Text style={styles.progText}>
                              {medible ? `${a.progreso}/${tarea.meta_cantidad}` : 'Pendiente'}
                            </Text>
                          )}
                        </View>
                      </View>
                    )
                  })}
                  <TouchableOpacity style={styles.desactivarBtn} onPress={() => desactivarTarea(tarea.id)}>
                    <Text style={styles.desactivarText}>Desactivar tarea</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>

      {/* Modal crear tarea */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitulo}>Nueva tarea</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.sheetCerrar}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Título *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Publicar 20 propiedades hoy"
                value={titulo}
                onChangeText={setTitulo}
              />

              <Text style={styles.fieldLabel}>Descripción</Text>
              <TextInput
                style={[styles.input, { minHeight: 70 }]}
                placeholder="Instrucciones adicionales..."
                value={descripcion}
                onChangeText={setDescripcion}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Tipo de tarea</Text>
              {TIPOS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tipoOption, tipo === t.key && styles.tipoOptionActivo]}
                  onPress={() => {
                    setTipo(t.key)
                    if (t.key !== 'manual' && t.key !== 'publicar_propiedades') setMetaCantidad('1')
                  }}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={18}
                    color={tipo === t.key ? '#fff' : '#1a6470'}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.tipoOptionLabel, tipo === t.key && { color: '#fff' }]}>{t.label}</Text>
                    <Text style={[styles.tipoOptionHint, tipo === t.key && { color: 'rgba(255,255,255,0.7)' }]}>{t.hint}</Text>
                  </View>
                  {tipo === t.key && <Ionicons name="checkmark-circle" size={18} color="#c9a84c" />}
                </TouchableOpacity>
              ))}

              {(tipo === 'publicar_propiedades' || tipo === 'contactar_clientes' || tipo === 'completar_curso') && (
                <>
                  <Text style={styles.fieldLabel}>Cantidad meta</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 20"
                    value={metaCantidad}
                    onChangeText={setMetaCantidad}
                    keyboardType="numeric"
                  />
                </>
              )}

              <Text style={styles.fieldLabel}>Fecha límite (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD   ej: 2025-05-10"
                value={fechaLimite}
                onChangeText={setFechaLimite}
              />

              <Text style={styles.fieldLabel}>Asignar a</Text>
              <View style={styles.asignarRow}>
                <TouchableOpacity
                  style={[styles.asignarOpt, paraAlguien === 'todos' && styles.asignarOptActivo]}
                  onPress={() => setParaAlguien('todos')}
                >
                  <Text style={[styles.asignarOptText, paraAlguien === 'todos' && { color: '#fff' }]}>Todos los usuarios</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.asignarOpt, paraAlguien === 'seleccion' && styles.asignarOptActivo]}
                  onPress={() => setParaAlguien('seleccion')}
                >
                  <Text style={[styles.asignarOptText, paraAlguien === 'seleccion' && { color: '#fff' }]}>Seleccionar usuarios</Text>
                </TouchableOpacity>
              </View>

              {paraAlguien === 'seleccion' && (
                <View style={styles.usuariosSelect}>
                  {usuarios.map(u => {
                    const sel = seleccionados.includes(u.id)
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.usuarioSelectRow, sel && styles.usuarioSelectActivo]}
                        onPress={() => toggleSeleccion(u.id)}
                      >
                        <View style={[styles.avatarSm, { backgroundColor: sel ? '#d4f0e2' : '#e8f2f4' }]}>
                          <Text style={[styles.avatarSmText, { color: sel ? '#2a8a5a' : '#1a6470' }]}>
                            {u.nombre[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.usuarioSelectNombre, sel && { color: '#2a8a5a', fontWeight: '700' }]}>
                          {u.nombre}
                        </Text>
                        {sel && <Ionicons name="checkmark-circle" size={18} color="#2a8a5a" />}
                      </TouchableOpacity>
                    )
                  })}
                  {usuarios.length === 0 && (
                    <Text style={styles.sinUsuarios}>No hay usuarios registrados</Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.guardarBtn, guardando && { opacity: 0.6 }]}
                onPress={guardarTarea}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.guardarText}>Crear tarea</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const TEAL = '#1a6470'
const GOLD = '#c9a84c'

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  navBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0eaec' },
  navContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  navIcon: { fontSize: 14 },
  navLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0eaec',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: TEAL },
  crearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  crearText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEAL, marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#8a9ea0', textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e0eaec',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#1a2e30', marginBottom: 3 },
  cardDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tipoChip: {
    fontSize: 10, fontWeight: '600', color: TEAL,
    backgroundColor: '#e8f2f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  metaChip: {
    fontSize: 10, fontWeight: '600', color: '#6a4c00',
    backgroundColor: '#fff3cd', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  fechaChip: {
    fontSize: 10, fontWeight: '600', color: '#555',
    backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  pctBadge: { alignItems: 'center', minWidth: 50 },
  pctText: { fontSize: 20, fontWeight: '800', color: TEAL },
  pctSub: { fontSize: 10, color: '#8a9ea0', marginTop: 1 },

  globalBar: { height: 6, backgroundColor: '#e0eaec', marginHorizontal: 16, marginBottom: 12, borderRadius: 3 },
  globalBarFill: { height: 6, backgroundColor: GOLD, borderRadius: 3 },

  usuariosList: { borderTopWidth: 1, borderTopColor: '#f0f4f5', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  usuariosHeader: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sinUsuarios: { fontSize: 13, color: '#aaa', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  usuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  usuarioNombre: { fontSize: 13, fontWeight: '600', color: '#1a2e30', marginBottom: 3 },
  usuarioBar: { height: 5, backgroundColor: '#e0eaec', borderRadius: 3 },
  usuarioBarFill: { height: 5, borderRadius: 3 },
  statusWrap: { minWidth: 60, alignItems: 'flex-end' },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#d4f0e2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  doneText: { fontSize: 11, fontWeight: '700', color: '#2a8a5a' },
  progText: { fontSize: 12, color: '#8a9ea0', fontWeight: '600' },
  desactivarBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  desactivarText: { fontSize: 12, color: '#c0392b', fontWeight: '600' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '92%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitulo: { fontSize: 18, fontWeight: '800', color: TEAL },
  sheetCerrar: { fontSize: 18, color: '#888', paddingHorizontal: 6 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a2e30',
    backgroundColor: '#fafcfc',
  },

  tipoOption: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  tipoOptionActivo: { backgroundColor: TEAL, borderColor: TEAL },
  tipoOptionLabel: { fontSize: 14, fontWeight: '700', color: '#1a2e30' },
  tipoOptionHint: { fontSize: 11, color: '#8a9ea0', marginTop: 1 },

  asignarRow: { flexDirection: 'row', gap: 8 },
  asignarOpt: {
    flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: '#e0eaec',
    borderRadius: 10, paddingVertical: 10,
  },
  asignarOptActivo: { backgroundColor: TEAL, borderColor: TEAL },
  asignarOptText: { fontSize: 13, fontWeight: '700', color: TEAL },

  usuariosSelect: { marginTop: 10, borderWidth: 1, borderColor: '#e0eaec', borderRadius: 12, overflow: 'hidden' },
  usuarioSelectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#f0f4f5',
  },
  usuarioSelectActivo: { backgroundColor: '#f3fbf6' },
  avatarSm: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontSize: 12, fontWeight: '700' },
  usuarioSelectNombre: { flex: 1, fontSize: 14, color: '#1a2e30' },

  guardarBtn: {
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
  },
  guardarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
