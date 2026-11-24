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
import HojaOrden, { type OpcionOrden } from '../../components/HojaOrden'

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
  created_at: string
}

type Form = Omit<Colaborador, 'id' | 'actualizado_at' | 'created_at'>

const EMPTY: Form = {
  nombre: '', contacto: null, link: null, estado_subida: null,
  fecha_actualizacion: null, ultima_casa_subida: null, en_app: null,
  marca: null, notas: null, relevancia: 0,
}

/** El color de la marca de la pantalla. Igual que en Asesores externos. */
const TEAL = '#1a6470'

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

/**
 * Las formas de ordenar la lista.
 *
 * "Los más olvidados" es el que de verdad hacía falta: la lista existe para
 * pedirles catálogo, y medido en la base hay 34 colaboradores a los que nunca
 * se les marcó una actualización y 24 cuya última marca tiene más de tres
 * meses. Como FILTRO eso no sirve —58 de 59 saldrían en la lista, no separa
 * nada— pero como ORDEN pone arriba justo a quien le toca.
 */
const ORDENES = [
  { valor: 'relevancia', etiqueta: 'Relevancia',          desc: 'Los clave primero, luego los importantes', icono: 'star' as const },
  { valor: 'olvidados',  etiqueta: 'Los más olvidados',    desc: 'Arriba los que llevan más sin actualizar', icono: 'hourglass-outline' as const },
  { valor: 'frescos',    etiqueta: 'Actualizados al último', desc: 'Arriba los que acabas de marcar',        icono: 'checkmark-done-outline' as const },
  { valor: 'nuevos',     etiqueta: 'Recién agregados',     desc: 'Por fecha de alta, lo último arriba',      icono: 'time-outline' as const },
  { valor: 'nombre',     etiqueta: 'Nombre (A–Z)',         desc: 'Alfabético, para buscar uno que ya sabes', icono: 'text-outline' as const },
] as const
type Orden = typeof ORDENES[number]['valor']

/** Fecha de la última marca como número ordenable. Sin marca = lo más viejo. */
const marcaDe = (x: Colaborador) =>
  x.actualizado_at ? new Date(x.actualizado_at).getTime() : -Infinity

const porNombre = (a: Colaborador, b: Colaborador) => a.nombre.localeCompare(b.nombre, 'es')

const COMPARA: Record<Orden, (a: Colaborador, b: Colaborador) => number> = {
  relevancia: (a, b) => (b.relevancia ?? 0) - (a.relevancia ?? 0) || porNombre(a, b),
  // Sin marca va PRIMERO: es el caso más urgente, no el menos.
  olvidados: (a, b) => marcaDe(a) - marcaDe(b) || porNombre(a, b),
  frescos: (a, b) => marcaDe(b) - marcaDe(a) || porNombre(a, b),
  nuevos: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || porNombre(a, b),
  nombre: porNombre,
}

/**
 * Los filtros, y cómo se combinan.
 *
 * Se COMBINAN en lugar de ser uno a la vez, que es lo que había: así se puede
 * pedir "los clave que todavía no están conectados" sin tener que mirar las dos
 * listas por separado.
 *
 * Dentro de un grupo suman (clave O importantes) y entre grupos se cruzan
 * (clave Y sin conectar). Si no fuera así, tocar dos pastillas del mismo grupo
 * daría siempre cero resultados.
 */
const FILTROS: {
  id: string
  grupo: string
  label: string
  icono?: keyof typeof Ionicons.glyphMap
  pred: (x: Colaborador) => boolean
}[] = [
  { id: 'clave',       grupo: 'rel', label: 'Clave',        icono: 'star', pred: x => x.relevancia === 2 },
  { id: 'importantes', grupo: 'rel', label: 'Importantes',  icono: 'star-outline', pred: x => x.relevancia === 1 },
  { id: 'en_app',      grupo: 'app', label: 'En la app',    pred: x => x.en_app === 'SI' },
  { id: 'pendientes',  grupo: 'app', label: 'Pendientes',   pred: x => x.en_app === 'PENDIENTE' },
  { id: 'sin_app',     grupo: 'app', label: 'Sin conectar', pred: x => !x.en_app },
  // Cada uno en su propio grupo: son condiciones que se cruzan entre sí.
  { id: 'sin_marca',   grupo: 'marca', label: 'Nunca actualizado', pred: x => !x.actualizado_at },
  { id: 'sin_link',    grupo: 'link',  label: 'Sin catálogo',      icono: 'link-outline', pred: x => !esUrl(x.link) },
  { id: 'con_tel',     grupo: 'tel',   label: 'Con WhatsApp',      icono: 'logo-whatsapp', pred: x => !!telefonoDe(x.contacto) },
  { id: 'con_aviso',   grupo: 'aviso', label: 'Con aviso',         icono: 'alert-circle-outline', pred: x => !!x.estado_subida },
]

/**
 * Aplica los filtros activos.
 *
 * `exceptoGrupo` sirve para contar: el número de una pastilla se calcula con
 * los filtros de los OTROS grupos puestos y los de su propio grupo quitados.
 * Así, el número de una pastilla de otro grupo dice cuántos van a quedar si la
 * tocas, y el de una hermana del mismo grupo dice cuántos aporta ella (porque
 * dentro del grupo las opciones suman, no se cruzan).
 */
function aplicarFiltros(l: Colaborador[], activos: string[], exceptoGrupo?: string) {
  const grupos = new Map<string, ((x: Colaborador) => boolean)[]>()
  for (const id of activos) {
    const def = FILTROS.find(f => f.id === id)
    if (!def || def.grupo === exceptoGrupo) continue
    const arr = grupos.get(def.grupo) ?? []
    arr.push(def.pred)
    grupos.set(def.grupo, arr)
  }
  if (grupos.size === 0) return l
  return l.filter(x => [...grupos.values()].every(preds => preds.some(p => p(x))))
}

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
  const [filtros, setFiltros] = useState<string[]>([])
  const [orden, setOrden] = useState<Orden>('relevancia')
  const [hojaOrden, setHojaOrden] = useState(false)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [guardando, setGuardando] = useState(false)
  const [marcando, setMarcando] = useState<string | null>(null)
  /** Texto de color que va directo sobre la tarjeta: se ajusta para que se lea
   *  igual en claro y en oscuro sin cambiarle el tono. */
  const enCard = (col: string) => legibleSobre(col, c.card, 4.5)
  /** Los iconos piden 3:1, no 4.5:1 (son formas, no texto). */
  const iconoEnCard = (col: string) => legibleSobre(col, c.card, 3)

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

  /** La búsqueda se aplica antes que los filtros para que los números de las
   *  pastillas cuenten solo lo que de verdad podría salir en pantalla. */
  const listaBuscada = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return lista
    return lista.filter(x =>
      x.nombre.toLowerCase().includes(q) ||
      (x.contacto ?? '').toLowerCase().includes(q) ||
      (x.notas ?? '').toLowerCase().includes(q) ||
      (x.estado_subida ?? '').toLowerCase().includes(q)
    )
  }, [lista, busqueda])

  const listaFiltrada = useMemo(() => {
    // Por relevancia de entrada: la lista existe para saber a quién pedirle
    // opciones primero, y con 59 registros el alfabético esconde a los 5 clave
    // entre los demás.
    return [...aplicarFiltros(listaBuscada, filtros)].sort(COMPARA[orden])
  }, [listaBuscada, filtros, orden])

  /** Cuántos quedarían al tocar cada pastilla, con los demás filtros puestos. */
  const conteos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of FILTROS) {
      m[f.id] = aplicarFiltros(listaBuscada, filtros, f.grupo).filter(f.pred).length
    }
    return m
  }, [listaBuscada, filtros])

  const toggleFiltro = (id: string) =>
    setFiltros(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

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

  const ordenActual = ORDENES.find(o => o.valor === orden)!

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Colaboradores</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            {/* Cuando hay filtros puestos, el subtítulo dice cuántos quedaron:
                si no, una lista corta parece una lista vacía de registros. */}
            {filtros.length > 0 || busqueda.trim()
              ? `${listaFiltrada.length} de ${lista.length} · ${ordenActual.etiqueta.toLowerCase()}`
              : `Sus opciones las podemos subir. ${lista.length} registrados.`}
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

      {/* Una sola fila de controles: el orden abre su hoja y los filtros se
          combinan. Antes el orden era un chip que alternaba entre dos textos y
          los filtros eran uno a la vez. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll} contentContainerStyle={s.chipsRow}>
        <TouchableOpacity
          style={[s.chip, s.chipOrden, { borderColor: enCard(TEAL), backgroundColor: c.card }]}
          onPress={() => setHojaOrden(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ordenar por. Ahora: ${ordenActual.etiqueta}`}
        >
          <Ionicons name="swap-vertical" size={13} color={iconoEnCard(TEAL)} />
          <Text style={[s.chipTxt, { color: enCard(TEAL) }]}>{ordenActual.etiqueta}</Text>
          <Ionicons name="chevron-down" size={12} color={iconoEnCard(TEAL)} />
        </TouchableOpacity>

        <View style={[s.separador, { backgroundColor: c.border }]} />

        {FILTROS.map(f => {
          const on = filtros.includes(f.id)
          // Una pastilla que dejaría la lista vacía no se enseña: con los
          // filtros combinados aparecerían varias en cero al mismo tiempo.
          if (conteos[f.id] === 0 && !on) return null
          return (
            <TouchableOpacity
              key={f.id}
              style={[s.chip, f.icono ? s.chipOrden : null, { borderColor: c.border, backgroundColor: c.card }, on && s.chipOn]}
              onPress={() => toggleFiltro(f.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              {f.icono && <Ionicons name={f.icono} size={12} color={on ? '#fff' : c.textSub} />}
              <Text style={[s.chipTxt, { color: c.textSub }, on && s.chipTxtOn]}>{f.label} · {conteos[f.id]}</Text>
            </TouchableOpacity>
          )
        })}

        {filtros.length > 0 && (
          <TouchableOpacity
            style={[s.chip, s.chipOrden, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => setFiltros([])}
          >
            <Ionicons name="close" size={12} color={c.textSub} />
            <Text style={[s.chipTxt, { color: c.textSub }]}>Quitar filtros</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <HojaOrden
        visible={hojaOrden}
        opciones={ORDENES as unknown as OpcionOrden<Orden>[]}
        valor={orden}
        onElegir={setOrden}
        onCerrar={() => setHojaOrden(false)}
      />

      {loading ? (
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
      ) : listaFiltrada.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.emptyText, { color: c.textSub }]}>No hay colaboradores que coincidan.</Text>
          {/* Con filtros que se cruzan es fácil llegar a cero sin darse
              cuenta de cuál fue; la salida queda a un toque. */}
          {filtros.length > 0 && (
            <TouchableOpacity style={[s.chip, s.chipOrden, { borderColor: c.border, marginTop: 12 }]} onPress={() => setFiltros([])}>
              <Ionicons name="close" size={13} color={c.textSub} />
              <Text style={[s.chipTxt, { color: c.textSub }]}>Quitar los {filtros.length} filtros</Text>
            </TouchableOpacity>
          )}
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
  // Separa el control de orden de los filtros: son dos cosas distintas y
  // pegados se leen como una sola tira de pastillas iguales.
  separador: { width: 1, height: 22, opacity: 0.8, marginHorizontal: 2 },
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
