// Colaboradores: inmobiliarias y asesores cuyas opciones SÍ podemos subir a la
// app. (A quién le mandamos una cita es la otra pantalla, "Asesores externos".)
//
// Las dos listas usan la misma fila (components/FilaDirectorio) para que se
// lean como dos vistas de lo mismo y no como dos apps.
import { useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Alert, Modal, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { legibleSobre } from '../../lib/color'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import FilaDirectorio, { MetaFila } from '../../components/FilaDirectorio'

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
  relevancia: number | null
  actualizado_at: string | null
}

type Form = Omit<Colaborador, 'id' | 'actualizado_at'>

const EMPTY: Form = {
  nombre: '', contacto: null, link: null, estado_subida: null,
  fecha_actualizacion: null, ultima_casa_subida: null, en_app: null,
  marca: null, notas: null, relevancia: 0,
}

const EN_APP_OPCIONES: { value: string | null; label: string }[] = [
  { value: null, label: 'Sin conectar' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'SI', label: 'Sí' },
]

/**
 * Qué tan relevante es un colaborador: a quién le pido opciones primero.
 *
 * Viene del sheet, donde se marcaba "AA" a los más relevantes y "A" a los que
 * también importan pero menos. En la app no se enseñan esas letras —no
 * significan nada para quien no hizo el sheet— sino la relevancia: una sola
 * estrella, el mismo color, y la diferencia en el peso de la pastilla. Así se
 * lee como una escala y no como dos categorías distintas.
 */
const RELEVANCIA = {
  2: { etiqueta: 'Clave',      color: '#a16207', solida: true },
  1: { etiqueta: 'Importante', color: '#a16207', solida: false },
} as const
const relevanciaDe = (n: number | null | undefined) =>
  n === 2 ? RELEVANCIA[2] : n === 1 ? RELEVANCIA[1] : null

const RELEVANCIA_OPCIONES = [
  { valor: 2, etiqueta: 'Clave',      desc: 'De los primeros a los que les pido opciones' },
  { valor: 1, etiqueta: 'Importante', desc: 'Cuenta, pero no es de los primeros' },
  { valor: 0, etiqueta: 'Normal',     desc: 'Sin prioridad especial' },
]

type Filtro = 'todos' | 'clave' | 'importantes' | 'sin_conectar' | 'sin_actualizar'

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

/** El color del estado de conexión con la app. Es el acento de la fila. */
function colorEnApp(en_app: string | null) {
  if (en_app === 'SI') return '#1e7e34'
  if (en_app === 'PENDIENTE') return '#b8860b'
  return '#64748b'
}

function iniciales(nombre: string) {
  const limpio = nombre.trim().replace(/[()]/g, ' ')
  const palabras = limpio.split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
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

/** 33 de 58 tienen contacto, pero algunos son un nombre ("MIREYA"), no un
 *  teléfono. El botón de WhatsApp solo sale cuando de verdad hay a dónde
 *  escribir. */
function telefonoDe(contacto: string | null): string | null {
  const dig = (contacto ?? '').replace(/\D/g, '')
  return dig.length >= 10 ? dig : null
}

const esUrl = (l: string | null) => !!l && /^https?:\/\//.test(l)

export default function AdminColaboradores() {
  const c = useColors()
  const [lista, setLista] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<'relevancia' | 'nombre'>('relevancia')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [guardando, setGuardando] = useState(false)
  const [marcando, setMarcando] = useState<string | null>(null)
  /** Texto de color que va directo sobre la tarjeta: se ajusta para que se lea
   *  igual en claro y en oscuro sin cambiarle el tono. */
  const enCard = (col: string) => legibleSobre(col, c.card, 4.5)

  useFocusEffect(useCallback(() => { cargar() }, []))
  const { refreshControl } = usePullRefresh(cargar)

  const yaCargoRef = useRef(false)
  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    yaCargoRef.current = true
    const { data } = await supabase.from('colaboradores').select('*').order('nombre')
    setLista(data ?? [])
    setLoading(false)
  }

  const conteos = useMemo(() => ({
    todos: lista.length,
    clave: lista.filter(x => x.relevancia === 2).length,
    importantes: lista.filter(x => x.relevancia === 1).length,
    sin_conectar: lista.filter(x => !x.en_app).length,
    sin_actualizar: lista.filter(x => !x.actualizado_at).length,
  }), [lista])

  const listaFiltrada = useMemo(() => {
    let l = lista
    if (filtro === 'clave') l = l.filter(x => x.relevancia === 2)
    else if (filtro === 'importantes') l = l.filter(x => x.relevancia === 1)
    else if (filtro === 'sin_conectar') l = l.filter(x => !x.en_app)
    else if (filtro === 'sin_actualizar') l = l.filter(x => !x.actualizado_at)
    const q = busqueda.trim().toLowerCase()
    if (q) {
      l = l.filter(x =>
        x.nombre.toLowerCase().includes(q) ||
        (x.contacto ?? '').toLowerCase().includes(q) ||
        (x.notas ?? '').toLowerCase().includes(q)
      )
    }
    // Por relevancia de entrada: la lista existe para saber a quién pedirle
    // opciones primero, y con 58 registros el alfabético esconde a los 5 clave
    // entre los demás.
    return [...l].sort((a, b) => orden === 'nombre'
      ? a.nombre.localeCompare(b.nombre, 'es')
      : (b.relevancia ?? 0) - (a.relevancia ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [lista, filtro, busqueda, orden])

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
      marca: col.marca, notas: col.notas, relevancia: col.relevancia ?? 0,
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
        en_app: form.en_app,
        relevancia: form.relevancia ?? 0,
        notas: form.notas?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = editando
        ? await supabase.from('colaboradores').update(payload).eq('id', editando.id)
        : await supabase.from('colaboradores').insert(payload)
      if (error) throw error
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
      else { setModal(false); cargar() }
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
  // HOY. Un segundo tap sobre uno ya marcado refresca la fecha: refleja que se
  // le volvió a subir catálogo. Quitar la marca vive en la hoja de edición,
  // porque es lo que casi nunca se quiere.
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
    setEditando(prev => prev && prev.id === col.id ? { ...prev, actualizado_at: null } : prev)
    const { error } = await supabase.from('colaboradores').update({ actualizado_at: null }).eq('id', col.id)
    if (error) { alerta('Error: ' + error.message); cargar() }
    setMarcando(null)
  }

  function abrirLink(link: string) {
    if (esUrl(link)) Linking.openURL(link)
    else alerta(link)
  }

  const CHIPS: { value: Filtro; label: string; n: number }[] = [
    { value: 'todos', label: 'Todos', n: conteos.todos },
    { value: 'clave', label: '★ Clave', n: conteos.clave },
    { value: 'importantes', label: '★ Importantes', n: conteos.importantes },
    { value: 'sin_conectar', label: 'Sin conectar', n: conteos.sin_conectar },
    { value: 'sin_actualizar', label: 'Sin actualizar', n: conteos.sin_actualizar },
  ]

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Colaboradores</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            Sus opciones las podemos subir. {lista.length} registrado{lista.length !== 1 ? 's' : ''}
            {conteos.clave > 0 ? `, ${conteos.clave} clave` : ''}.
          </Text>
        </View>
        <TouchableOpacity style={s.btnNuevo} onPress={abrirNueva}>
          <Ionicons name="add" size={16} color="#000" />
          <Text style={s.btnNuevoText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <Ionicons name="search-outline" size={16} color={c.textSub} />
        <TextInput
          style={[s.buscaInp, { color: c.text }]}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre, contacto o notas…"
          placeholderTextColor={c.placeholder}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chipsRow}>
        {CHIPS.map(op => {
          const on = filtro === op.value
          return (
            <TouchableOpacity
              key={op.value}
              style={[s.chip, { borderColor: c.border, backgroundColor: c.card }, on && s.chipOn]}
              onPress={() => setFiltro(on ? 'todos' : op.value)}
            >
              <Text style={[s.chipTxt, { color: c.textSub }, on && s.chipTxtOn]}>{op.label} · {op.n}</Text>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity
          style={[s.chip, s.chipOrden, { borderColor: c.border, backgroundColor: c.card }]}
          onPress={() => setOrden(o => o === 'relevancia' ? 'nombre' : 'relevancia')}
        >
          <Ionicons name={orden === 'relevancia' ? 'star' : 'text-outline'} size={12} color={c.textSub} />
          <Text style={[s.chipTxt, { color: c.textSub }]}>
            {orden === 'relevancia' ? 'Por relevancia' : 'Por nombre'}
          </Text>
        </TouchableOpacity>
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
            const rel = relevanciaDe(col.relevancia)
            const tel = telefonoDe(col.contacto)
            const marcado = !!col.actualizado_at
            return (
              <FilaDirectorio
                key={col.id}
                acento={colorEnApp(col.en_app)}
                inicial={iniciales(col.nombre)}
                titulo={col.nombre}
                onPress={() => abrirEditar(col)}
                // Junto al nombre va UNA sola cosa: la relevancia, que es lo
                // que se vino a ver. El estado de conexión ya se lee en el
                // color del borde, así que baja al segundo renglón: con dos
                // pastillas arriba el nombre se cortaba en "MARIFER ...".
                pastillas={[
                  rel && { texto: rel.etiqueta, color: rel.color, solida: rel.solida, icono: 'star' as const },
                ]}
                meta={
                  <MetaFila partes={[
                    col.en_app !== 'SI'
                      ? <Text key="app" style={[s.aviso, { color: enCard(colorEnApp(col.en_app)) }]}>
                          {col.en_app === 'PENDIENTE' ? 'Pendiente' : 'Sin conectar'}
                        </Text>
                      : null,
                    col.contacto,
                    marcado ? `✓ ${haceTiempo(col.actualizado_at!)}` : null,
                    col.estado_subida
                      ? <Text key="est" style={[s.aviso, { color: enCard('#c0392b'), flexShrink: 1 }]} numberOfLines={1}>{col.estado_subida}</Text>
                      : null,
                    col.notas,
                  ]} />
                }
                acciones={[
                  {
                    icono: marcado ? 'checkmark-circle' : 'ellipse-outline',
                    color: marcado ? '#1e7e34' : '#64748b',
                    onPress: () => marcarActualizado(col),
                    etiqueta: marcado ? 'Volver a marcar actualizado hoy' : 'Marcar actualizado hoy',
                  },
                  !!tel && {
                    icono: 'logo-whatsapp' as const, color: '#128C7E',
                    onPress: () => Linking.openURL(`https://wa.me/${tel}`),
                    etiqueta: 'WhatsApp',
                  },
                  !!col.link && {
                    icono: 'link-outline' as const, color: '#1976D2',
                    onPress: () => abrirLink(col.link!),
                    etiqueta: 'Ver catálogo',
                  },
                ]}
              />
            )
          })}
          {marcando && <ActivityIndicator size="small" color="#1a6470" style={{ marginTop: 6 }} />}
        </ScrollView>
      )}

      {/* Modal agregar/editar */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={[s.modalBox, { backgroundColor: c.card }]} contentContainerStyle={{ gap: 4 }}>
            <View style={s.handle} />
            <Text style={[s.modalTitulo, { color: c.text }]}>{editando ? 'Editar colaborador' : 'Nuevo colaborador'}</Text>

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Nombre *</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.nombre}
              onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej. Spazio Vitale"
              placeholderTextColor={c.placeholder}
            />

            <Text style={[s.fieldLabel, { color: c.textSub }]}>¿Qué tan relevante es?</Text>
            <View style={s.relOpciones}>
              {RELEVANCIA_OPCIONES.map(op => {
                const on = (form.relevancia ?? 0) === op.valor
                const col = op.valor === 0 ? c.textSub : RELEVANCIA[op.valor as 1 | 2].color
                return (
                  <TouchableOpacity
                    key={op.valor}
                    style={[s.relOpcion, { borderColor: on ? col : c.inputBorder, backgroundColor: on ? col + '14' : c.input }]}
                    onPress={() => setForm(f => ({ ...f, relevancia: op.valor }))}
                  >
                    <View style={[s.relRadio, { borderColor: on ? col : c.border }]}>
                      {on && <View style={[s.relRadioDot, { backgroundColor: col }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.relTit, { color: on ? col : c.text }]}>{op.etiqueta}</Text>
                      <Text style={[s.relSub, { color: c.textSub }]}>{op.desc}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

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

            <Text style={[s.fieldLabel, { color: c.textSub }]}>Notas</Text>
            <TextInput
              style={[s.input, s.textarea, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.notas ?? ''}
              onChangeText={v => setForm(f => ({ ...f, notas: v }))}
              placeholder="Notas libres"
              placeholderTextColor={c.placeholder}
              multiline
            />

            {editando?.actualizado_at && (
              <TouchableOpacity style={s.quitarMarca} onPress={() => quitarActualizado(editando)}>
                <Ionicons name="close-circle-outline" size={15} color={c.textSub} />
                <Text style={[s.quitarMarcaTxt, { color: c.textSub }]}>
                  Quitar la marca de actualizado ({haceTiempo(editando.actualizado_at)})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.5 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnGuardarText}>Guardar</Text>
              }
            </TouchableOpacity>

            {editando && (
              <TouchableOpacity style={s.btnEliminar} onPress={() => eliminar(editando)}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
                <Text style={s.btnEliminarTxt}>Eliminar colaborador</Text>
              </TouchableOpacity>
            )}
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
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12,
  },
  titulo: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  btnNuevo: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#c9a84c', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8,
  },
  btnNuevoText: { color: '#000', fontWeight: '800', fontSize: 13 },
  buscaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  // flexGrow/flexShrink en 0: sin eso la lista de abajo (que sí crece) le
  // robaba el alto a esta fila y las pastillas salían cortadas a la mitad.
  chipsScroll: { marginTop: 10, height: 46, flexGrow: 0, flexShrink: 0 },
  chipsRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingRight: 24, alignItems: 'center' },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  chipOrden: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
  lista: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  aviso: { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 19, fontWeight: '900', marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', marginBottom: 5, marginTop: 8 },
  input: { borderRadius: 9, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 6 },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  relOpciones: { gap: 7, marginBottom: 6 },
  relOpcion: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10,
  },
  relRadio: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  relRadioDot: { width: 9, height: 9, borderRadius: 5 },
  relTit: { fontSize: 14, fontWeight: '800' },
  relSub: { fontSize: 11.5, marginTop: 1 },
  enAppRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  enAppChip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  enAppChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  enAppChipText: { fontSize: 12, fontWeight: '700' },
  enAppChipTextActivo: { color: '#fff' },
  quitarMarca: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginTop: 4 },
  quitarMarcaTxt: { fontSize: 12.5, fontWeight: '700' },
  btnGuardar: { backgroundColor: '#c9a84c', borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 15 },
  btnEliminar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  btnEliminarTxt: { color: '#dc2626', fontWeight: '800', fontSize: 13.5 },
  btnCancelar: { paddingVertical: 10, alignItems: 'center' },
  btnCancelarText: { fontSize: 14, fontWeight: '700' },
})
