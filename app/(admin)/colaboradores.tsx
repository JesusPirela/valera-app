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
  actualizado_at: string | null
}

const EMPTY: Omit<Colaborador, 'id' | 'actualizado_at'> = {
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
  if (en_app === 'SI') return { texto: 'En app', bg: '#e6f4ea', color: '#1e7e34', dot: '#2e9e4c' }
  if (en_app === 'PENDIENTE') return { texto: 'Pendiente', bg: '#fff4e0', color: '#b8860b', dot: '#e0a716' }
  return { texto: 'Sin conectar', bg: '#f1f1f1', color: '#888', dot: '#aaa' }
}

function iniciales(nombre: string) {
  const limpio = nombre.trim().replace(/[()]/g, ' ')
  const palabras = limpio.split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
}

function formatFecha(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function haceTiempo(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `hace ${meses} mes${meses > 1 ? 'es' : ''}`
  const anos = Math.floor(meses / 12)
  return `hace ${anos} año${anos > 1 ? 's' : ''}`
}

export default function AdminColaboradores() {
  const c = useColors()
  const [lista, setLista] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [form, setForm] = useState<Omit<Colaborador, 'id' | 'actualizado_at'>>(EMPTY)
  const [guardando, setGuardando] = useState(false)
  const [marcando, setMarcando] = useState<string | null>(null)

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

  // Marca (o vuelve a marcar) el catálogo de este colaborador como actualizado
  // HOY. Un segundo tap sobre un colaborador ya marcado refresca la fecha a
  // ahora — refleja que se le volvió a subir catálogo.
  async function marcarActualizado(col: Colaborador) {
    setMarcando(col.id)
    const ahora = new Date().toISOString()
    setLista(prev => prev.map(x => x.id === col.id ? { ...x, actualizado_at: ahora } : x))
    const { error } = await supabase.from('colaboradores').update({ actualizado_at: ahora }).eq('id', col.id)
    if (error) { alerta('Error: ' + error.message); cargar() }
    setMarcando(null)
  }

  async function quitarActualizado(col: Colaborador) {
    setMarcando(col.id)
    setLista(prev => prev.map(x => x.id === col.id ? { ...x, actualizado_at: null } : x))
    const { error } = await supabase.from('colaboradores').update({ actualizado_at: null }).eq('id', col.id)
    if (error) { alerta('Error: ' + error.message); cargar() }
    setMarcando(null)
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

      <View style={s.chipsRow}>
        {([
          { value: 'todos', label: `Todos (${lista.length})` },
          { value: 'SI', label: 'En app' },
          { value: 'PENDIENTE', label: 'Pendiente' },
          { value: 'sin', label: 'Sin conectar' },
        ] as { value: Filtro; label: string }[]).map(op => (
          <TouchableOpacity
            key={op.value}
            style={[s.chip, { borderColor: c.border, backgroundColor: c.card }, filtro === op.value && s.chipActivo]}
            onPress={() => setFiltro(op.value)}
          >
            <Text style={[s.chipText, { color: c.textSub }, filtro === op.value && s.chipTextActivo]}>{op.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
            const esLink = !!col.link && (col.link.startsWith('http://') || col.link.startsWith('https://'))
            return (
              <View key={col.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[s.cardAccent, { backgroundColor: badge.dot }]} />
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <View style={[s.avatar, { backgroundColor: badge.dot + '22' }]}>
                      <Text style={[s.avatarText, { color: badge.color }]}>{iniciales(col.nombre)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardNombre, { color: c.text }]} numberOfLines={1}>{col.nombre}</Text>
                      {col.contacto && <Text style={[s.cardContacto, { color: c.textMute }]} numberOfLines={1}>📞 {col.contacto}</Text>}
                    </View>
                    <View style={[s.badge, { backgroundColor: badge.bg }]}>
                      <View style={[s.badgeDot, { backgroundColor: badge.dot }]} />
                      <Text style={[s.badgeText, { color: badge.color }]}>{badge.texto}</Text>
                    </View>
                  </View>

                  <View style={s.cardMetaRow}>
                    {esLink && (
                      <TouchableOpacity style={[s.linkChip, { borderColor: c.border }]} onPress={() => abrirLink(col.link!)}>
                        <Text style={s.linkChipText}>🔗 Ver catálogo</Text>
                      </TouchableOpacity>
                    )}
                    {!esLink && col.link && <Text style={[s.cardMeta, { color: c.textMute }]} numberOfLines={1}>{col.link}</Text>}
                    {col.fecha_actualizacion && <Text style={[s.cardMeta, { color: c.textMute }]}>🗓 Sheet: {col.fecha_actualizacion}</Text>}
                  </View>

                  {col.estado_subida && <Text style={s.estadoAviso}>⚠️ {col.estado_subida}</Text>}
                  {col.notas && <Text style={[s.cardNotas, { color: c.textMute }]} numberOfLines={2}>📝 {col.notas}</Text>}

                  <View style={[s.cardFooter, { borderTopColor: c.border }]}>
                    {col.actualizado_at ? (
                      <View style={s.actualizadoWrap}>
                        <TouchableOpacity
                          style={[s.actualizadoBtn, s.actualizadoBtnOn]}
                          onPress={() => marcarActualizado(col)}
                          disabled={marcando === col.id}
                        >
                          <Text style={s.actualizadoBtnOnText}>✓ Actualizado {haceTiempo(col.actualizado_at)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.btnQuitarCheck} onPress={() => quitarActualizado(col)} disabled={marcando === col.id}>
                          <Text style={[s.btnQuitarCheckText, { color: c.textMute }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.actualizadoBtn, { borderColor: c.border }]}
                        onPress={() => marcarActualizado(col)}
                        disabled={marcando === col.id}
                      >
                        {marcando === col.id
                          ? <ActivityIndicator size="small" color="#1a6470" />
                          : <Text style={[s.actualizadoBtnText, { color: c.textSub }]}>○ Marcar actualizado hoy</Text>
                        }
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={s.btnEdit} onPress={() => abrirEditar(col)}>
                      <Text style={s.btnEditText}>✏</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnDel} onPress={() => eliminar(col)}>
                      <Text style={s.btnDelText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
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

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Fecha de actualización (del sheet, texto libre)</Text>
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
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActivo: { color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 15 },
  lista: { padding: 16, gap: 12 },
  card: {
    borderRadius: 14, borderWidth: 1, flexDirection: 'row', overflow: 'hidden',
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800' },
  cardNombre: { fontSize: 15, fontWeight: '700' },
  cardContacto: { fontSize: 11, marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  cardMeta: { fontSize: 12 },
  linkChip: {
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(25,118,210,0.08)', borderColor: 'rgba(25,118,210,0.3)',
  },
  linkChipText: { fontSize: 11, fontWeight: '700', color: '#1976D2' },
  estadoAviso: { fontSize: 12, color: '#c0392b' },
  cardNotas: { fontSize: 12, fontStyle: 'italic' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, paddingTop: 10, marginTop: 2,
  },
  actualizadoWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actualizadoBtn: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  actualizadoBtnText: { fontSize: 11, fontWeight: '600' },
  actualizadoBtnOn: { backgroundColor: '#e6f4ea', borderColor: '#bfe3c9' },
  actualizadoBtnOnText: { fontSize: 11, fontWeight: '700', color: '#1e7e34' },
  btnQuitarCheck: { padding: 4 },
  btnQuitarCheckText: { fontSize: 12, fontWeight: '700' },
  btnEdit: { padding: 6 },
  btnEditText: { fontSize: 16 },
  btnDel: { padding: 6 },
  btnDelText: { fontSize: 16 },
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
