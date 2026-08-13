import { useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Alert, Modal, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Colaborador = {
  id: string
  nombre: string
  contacto: string | null
  link: string | null
  estado_subida: string | null
  fecha_actualizacion: string | null
  ultima_casa_subida: string | null
  en_app: string | null
  marca: string | null
  notas: string | null
}

const EMPTY: Omit<Colaborador, 'id'> = {
  nombre: '', contacto: null, link: null, estado_subida: null,
  fecha_actualizacion: null, ultima_casa_subida: null, en_app: null,
  marca: null, notas: null,
}

const EN_APP_OPCIONES: { value: string | null; label: string }[] = [
  { value: null, label: 'Sin conectar' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'SI', label: 'Sí' },
]

type Filtro = 'todos' | 'SI' | 'PENDIENTE' | 'sin'

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

function badgeEnApp(en_app: string | null) {
  if (en_app === 'SI') return { texto: 'En app', bg: '#e6f4ea', color: '#1e7e34' }
  if (en_app === 'PENDIENTE') return { texto: 'Pendiente', bg: '#fff4e0', color: '#b8860b' }
  return { texto: 'Sin conectar', bg: '#f1f1f1', color: '#888' }
}

export default function AdminColaboradores() {
  const c = useColors()
  const [lista, setLista] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [form, setForm] = useState<Omit<Colaborador, 'id'>>(EMPTY)
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))
  const { refreshControl } = usePullRefresh(cargar)

  const yaCargoRef = useRef(false)
  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    yaCargoRef.current = true
    const { data } = await supabase
      .from('colaboradores')
      .select('*')
      .order('nombre')
    setLista(data ?? [])
    setLoading(false)
  }

  const listaFiltrada = useMemo(() => {
    let l = lista
    if (filtro === 'sin') l = l.filter(x => !x.en_app)
    else if (filtro !== 'todos') l = l.filter(x => x.en_app === filtro)
    const q = busqueda.trim().toLowerCase()
    if (q) {
      l = l.filter(x =>
        x.nombre.toLowerCase().includes(q) ||
        (x.contacto ?? '').toLowerCase().includes(q) ||
        (x.notas ?? '').toLowerCase().includes(q)
      )
    }
    return l
  }, [lista, filtro, busqueda])

  function abrirNueva() {
    setEditando(null)
    setForm(EMPTY)
    setModal(true)
  }

  function abrirEditar(col: Colaborador) {
    setEditando(col)
    setForm({
      nombre: col.nombre, contacto: col.contacto, link: col.link,
      estado_subida: col.estado_subida, fecha_actualizacion: col.fecha_actualizacion,
      ultima_casa_subida: col.ultima_casa_subida, en_app: col.en_app,
      marca: col.marca, notas: col.notas,
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { alerta('El nombre es obligatorio'); return }
    setGuardando(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        contacto: form.contacto?.trim() || null,
        link: form.link?.trim() || null,
        estado_subida: form.estado_subida?.trim() || null,
        fecha_actualizacion: form.fecha_actualizacion?.trim() || null,
        ultima_casa_subida: form.ultima_casa_subida?.trim() || null,
        en_app: form.en_app,
        marca: form.marca?.trim() || null,
        notas: form.notas?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editando) {
        const { error } = await supabase.from('colaboradores').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('colaboradores').insert(payload)
        if (error) throw error
      }
      setModal(false)
      cargar()
    } catch (e: any) {
      alerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(col: Colaborador) {
    const confirmar = async () => {
      const { error } = await supabase.from('colaboradores').delete().eq('id', col.id)
      if (error) alerta('Error: ' + error.message)
      else cargar()
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar "${col.nombre}"?`)) confirmar()
    } else {
      Alert.alert('Eliminar', `¿Eliminar "${col.nombre}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmar },
      ])
    }
  }

  function abrirLink(link: string) {
    if (link.startsWith('http://') || link.startsWith('https://')) Linking.openURL(link)
    else alerta(link)
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg2 }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.titulo, { color: c.text }]}>Colaboradores</Text>
        <TouchableOpacity style={s.btnNuevo} onPress={abrirNueva}>
          <Text style={s.btnNuevoText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={s.buscadorRow}>
        <TextInput
          style={[s.buscador, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre, contacto o notas..."
          placeholderTextColor={c.placeholder}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {([
          { value: 'todos', label: `Todos (${lista.length})` },
          { value: 'SI', label: 'En app' },
          { value: 'PENDIENTE', label: 'Pendiente' },
          { value: 'sin', label: 'Sin conectar' },
        ] as { value: Filtro; label: string }[]).map(op => (
          <TouchableOpacity
            key={op.value}
            style={[s.chip, { borderColor: c.border }, filtro === op.value && s.chipActivo]}
            onPress={() => setFiltro(op.value)}
          >
            <Text style={[s.chipText, { color: c.textSub }, filtro === op.value && s.chipTextActivo]}>{op.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
      ) : listaFiltrada.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.emptyText, { color: c.textSub }]}>No hay colaboradores que coincidan.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.lista} refreshControl={refreshControl}>
          {listaFiltrada.map(col => {
            const badge = badgeEnApp(col.en_app)
            return (
              <View key={col.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.cardTop}>
                  <Text style={[s.cardNombre, { color: c.text }]}>{col.nombre}</Text>
                  <View style={[s.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[s.badgeText, { color: badge.color }]}>{badge.texto}</Text>
                  </View>
                </View>
                <View style={s.cardMetaRow}>
                  {col.contacto && <Text style={[s.cardMeta, { color: c.textMute }]}>📞 {col.contacto}</Text>}
                  {col.link && (
                    <TouchableOpacity onPress={() => abrirLink(col.link!)}>
                      <Text style={[s.cardMeta, s.link]} numberOfLines={1}>🔗 {col.link}</Text>
                    </TouchableOpacity>
                  )}
                  {col.fecha_actualizacion && <Text style={[s.cardMeta, { color: c.textMute }]}>🗓 {col.fecha_actualizacion}</Text>}
                </View>
                {col.estado_subida && <Text style={s.estadoAviso}>⚠️ {col.estado_subida}</Text>}
                {col.notas && <Text style={[s.cardNotas, { color: c.textMute }]}>📝 {col.notas}</Text>}
                <View style={s.cardAcciones}>
                  <TouchableOpacity style={s.btnEdit} onPress={() => abrirEditar(col)}>
                    <Text style={s.btnEditText}>✏</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnDel} onPress={() => eliminar(col)}>
                    <Text style={s.btnDelText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* Modal agregar/editar */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={[s.modalBox, { backgroundColor: c.card }]} contentContainerStyle={{ gap: 4 }}>
            <Text style={[s.modalTitulo, { color: c.text }]}>{editando ? 'Editar colaborador' : 'Nuevo colaborador'}</Text>

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Nombre *</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.nombre}
              onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej. Spazio Vitale"
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Contacto</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.contacto ?? ''}
              onChangeText={v => setForm(f => ({ ...f, contacto: v }))}
              placeholder="Teléfono o nombre de contacto"
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Link (EasyBroker u otro portal)</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.link ?? ''}
              onChangeText={v => setForm(f => ({ ...f, link: v }))}
              placeholder="https://www.easybroker.com/agent/agencies/..."
              placeholderTextColor={c.placeholder}
              autoCapitalize="none"
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>¿Conectado a la app?</Text>
            <View style={s.enAppRow}>
              {EN_APP_OPCIONES.map(op => (
                <TouchableOpacity
                  key={op.label}
                  style={[s.enAppChip, { borderColor: c.border }, form.en_app === op.value && s.enAppChipActivo]}
                  onPress={() => setForm(f => ({ ...f, en_app: op.value }))}
                >
                  <Text style={[s.enAppChipText, { color: c.textSub }, form.en_app === op.value && s.enAppChipTextActivo]}>{op.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Estado / motivo si no se sube</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.estado_subida ?? ''}
              onChangeText={v => setForm(f => ({ ...f, estado_subida: v }))}
              placeholder="Ej. NO SE SUBE PORQUE AUN NO NOS AUTORIZAN"
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Fecha de actualización</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.fecha_actualizacion ?? ''}
              onChangeText={v => setForm(f => ({ ...f, fecha_actualizacion: v }))}
              placeholder="dd/mm/aaaa"
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Última casa subida</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.ultima_casa_subida ?? ''}
              onChangeText={v => setForm(f => ({ ...f, ultima_casa_subida: v }))}
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Notas</Text>
            <TextInput
              style={[s.input, s.textarea, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.notas ?? ''}
              onChangeText={v => setForm(f => ({ ...f, notas: v }))}
              placeholder="Notas libres"
              placeholderTextColor={c.placeholder}
              multiline
            />

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.5 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnGuardarText}>💾 Guardar</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}>
              <Text style={[s.btnCancelarText, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1,
  },
  titulo: { fontSize: 20, fontWeight: '700', flex: 1 },
  btnNuevo: { backgroundColor: '#c9a84c', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnNuevoText: { color: '#000', fontWeight: '700', fontSize: 13 },
  buscadorRow: { paddingHorizontal: 16, paddingTop: 12 },
  buscador: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  chipsRow: { marginTop: 10, flexGrow: 0 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActivo: { color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 15 },
  lista: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardNombre: { fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  cardMeta: { fontSize: 12 },
  link: { color: '#1976D2', textDecorationLine: 'underline', maxWidth: 260 },
  estadoAviso: { fontSize: 12, color: '#c0392b', marginTop: 4 },
  cardNotas: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  cardAcciones: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 6 },
  btnEdit: { padding: 8 },
  btnEditText: { fontSize: 18 },
  btnDel: { padding: 8 },
  btnDelText: { fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '88%' },
  modalTitulo: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderRadius: 8, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 10 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  enAppRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  enAppChip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  enAppChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  enAppChipText: { fontSize: 12, fontWeight: '600' },
  enAppChipTextActivo: { color: '#fff' },
  btnGuardar: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 15 },
  btnCancelar: { paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { fontSize: 14 },
})
