// Sus clientes. En web, una tabla como la del CRM de prospectador (mismas
// columnas, mismos colores de estado); en móvil, tarjetas — ahí una tabla de
// 9 columnas no cabe ni en el CRM real. Solo para el titular: puede cambiar
// a "viendo el CRM de X" (un agente de su propia agencia), de solo lectura,
// igual que el banner que ya existe para cuando un admin ve el de alguien
// más. La RLS nueva (20261130_aliado_correcciones) es la que de verdad
// decide qué clientes puede leer: si algún día esto se saltara, seguiría sin
// poder ver los de otra agencia.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Linking, Modal, TextInput, Platform, Alert, ScrollView,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { calcularCrmMetricas, type CrmMetricas } from '../../lib/crmMetricas'
import CrmMetricasPanel from '../../components/CrmMetricasPanel'
// Mismo mapa de etapas/colores que usa el CRM de prospectador — es una
// constante exportada, sin nada de UI ni de lógica detrás, así que se puede
// importar tal cual sin arrastrar el resto de esa pantalla (que sí rebotaría
// a un aliado si se navegara a ella).
import { ESTADOS, ORDEN_ESTADOS } from '../(prospectador)/crm'
import PillSelector from '../../components/ui/PillSelector'

type Cliente = {
  id: string; nombre: string | null; telefono: string | null
  estado: string; zona_busqueda: string | null; presupuesto: string | null
  tipo_operacion: string | null; tipo_credito: string | null
  proximo_contacto: string | null; notas: string | null
  created_at: string
}
type Miembro = { id: string; nombre: string | null; role: string }

const OP_LABEL: Record<string, string> = { venta: '🏠 Venta', renta: '🔑 Renta', captacion: '📥 Captación' }

function iniciales(nombre: string | null): string {
  return (nombre ?? '?').trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Ayer'
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const SELECT_CLIENTE = 'id, nombre, telefono, estado, zona_busqueda, presupuesto, tipo_operacion, tipo_credito, proximo_contacto, notas, created_at'

export default function AliadoClientes() {
  const c = useColors()
  const isWeb = Platform.OS === 'web'
  const [miId, setMiId] = useState<string | null>(null)
  const [lista, setLista] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [esTitular, setEsTitular] = useState(false)
  const [equipo, setEquipo] = useState<Miembro[]>([])
  const [viendo, setViendo] = useState<{ id: string; nombre: string } | null>(null)

  const [modalNuevo, setModalNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [zona, setZona] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [tipoOp, setTipoOp] = useState<'venta' | 'renta' | 'captacion'>('venta')
  const [guardando, setGuardando] = useState(false)

  const [editandoEstado, setEditandoEstado] = useState<Cliente | null>(null)
  const [modalEquipo, setModalEquipo] = useState(false)
  const [modalCrm, setModalCrm] = useState(false)
  const [crmSeleccion, setCrmSeleccion] = useState<CrmMetricas | null>(null)
  const [loadingCrm, setLoadingCrm] = useState(false)

  function alerta(msg: string) {
    if (Platform.OS === 'web') window.alert(msg)
    else Alert.alert('Aviso', msg)
  }

  const cargarClientes = useCallback(async (responsableId: string) => {
    const { data } = await supabase.from('clientes').select(SELECT_CLIENTE)
      .eq('responsable_id', responsableId).order('created_at', { ascending: false })
    setLista((data ?? []) as Cliente[])
  }, [])

  const cargar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setMiId(session.user.id)
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    const titular = perfil?.role === 'aliado_admin'
    setEsTitular(titular)
    if (titular) {
      const { data: eq } = await supabase.rpc('mi_equipo_aliado')
      setEquipo((eq?.equipo ?? []) as Miembro[])
    }
    await cargarClientes(viendo?.id ?? session.user.id)
    setCargando(false)
  }, [cargarClientes, viendo])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  function verAgente(m: Miembro) {
    setModalEquipo(false)
    setViendo({ id: m.id, nombre: m.nombre ?? 'este usuario' })
    setCargando(true)
    cargarClientes(m.id).finally(() => setCargando(false))
  }

  function volverAMiCrm() {
    if (!miId) return
    setViendo(null)
    setCargando(true)
    cargarClientes(miId).finally(() => setCargando(false))
  }

  async function agregarCliente() {
    if (!nombre.trim() || !telefono.trim()) { alerta('Falta el nombre o el teléfono.'); return }
    setGuardando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión no válida.')
      const { error } = await supabase.from('clientes').insert({
        nombre: nombre.trim(), telefono: telefono.trim(),
        zona_busqueda: zona.trim() || null,
        presupuesto: presupuesto.trim() || null,
        tipo_operacion: tipoOp,
        estado: 'por_perfilar', fuente_lead: 'otro',
        responsable_id: session.user.id,
      })
      if (error) throw error
      setModalNuevo(false)
      setNombre(''); setTelefono(''); setZona(''); setPresupuesto(''); setTipoOp('venta')
      cargar()
    } catch (e: any) {
      alerta('Error: ' + (e?.message ?? 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    setEditandoEstado(null)
    setLista(prev => prev.map(x => x.id === id ? { ...x, estado: nuevoEstado } : x))
    const { error } = await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', id)
    if (error) { alerta('Error: ' + error.message); cargar() }
  }

  async function verResumenAgencia() {
    setModalEquipo(false)
    setModalCrm(true)
    setLoadingCrm(true)
    setCrmSeleccion(null)
    try {
      setCrmSeleccion(await calcularCrmMetricas(null, 'Toda la agencia'))
    } finally {
      setLoadingCrm(false)
    }
  }

  const tel = (t: string | null) => (t ?? '').replace(/\D/g, '')
  const soloLectura = !!viendo

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  const encabezado = (
    <>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>{viendo ? `Clientes de ${viendo.nombre}` : 'Mis clientes'}</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            {lista.length === 0 ? 'Todavía no hay ninguno.' : `${lista.length} en total`}
          </Text>
        </View>
        {!soloLectura && (
          <TouchableOpacity style={s.btnAgregar} onPress={() => setModalNuevo(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.btnAgregarTxt}>Agregar</Text>
          </TouchableOpacity>
        )}
      </View>

      {soloLectura ? (
        <View style={s.roBanner}>
          <Text style={s.roBannerTxt} numberOfLines={1}>👁 Viendo el CRM de {viendo!.nombre} — solo lectura</Text>
          <TouchableOpacity onPress={volverAMiCrm}><Text style={s.roBannerLink}>Volver al mío</Text></TouchableOpacity>
        </View>
      ) : esTitular && (
        <TouchableOpacity style={[s.btnCrm, { borderColor: c.border }]} onPress={() => setModalEquipo(true)}>
          <Ionicons name="bar-chart-outline" size={16} color="#5e35b1" />
          <Text style={s.btnCrmTxt}>CRM de asesores</Text>
        </TouchableOpacity>
      )}
    </>
  )

  function Fila({ item }: { item: Cliente }) {
    const info = ESTADOS[item.estado] ?? { label: item.estado, color: '#64748b', bg: '#f1f5f9' }
    return (
      <View style={[s.trow, { borderColor: c.border }]}>
        <Text style={[s.td, s.colNombre, { color: c.text, fontWeight: '700' }]} numberOfLines={1}>{item.nombre ?? 'Sin nombre'}</Text>
        <Text style={[s.td, s.colTel, { color: c.textSub }]} numberOfLines={1}>{item.telefono ?? '—'}</Text>
        <View style={[s.colEstado]}>
          <TouchableOpacity
            style={[s.estadoBadge, { backgroundColor: info.color + '1c' }]}
            disabled={soloLectura}
            onPress={() => setEditandoEstado(item)}
          >
            <View style={[s.estadoDot, { backgroundColor: info.color }]} />
            <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
            {!soloLectura && <Ionicons name="chevron-down" size={10} color={info.color} />}
          </TouchableOpacity>
        </View>
        <Text style={[s.td, s.colOp, { color: c.textSub }]} numberOfLines={1}>{item.tipo_operacion ? OP_LABEL[item.tipo_operacion] ?? item.tipo_operacion : '—'}</Text>
        <Text style={[s.td, s.colPago, { color: c.textSub }]} numberOfLines={1}>{item.tipo_credito ?? '—'}</Text>
        <Text style={[s.td, s.colZona, { color: c.textSub }]} numberOfLines={1}>{item.zona_busqueda ?? '—'}</Text>
        <Text style={[s.td, s.colPresup, { color: '#2e7d32', fontWeight: '700' }]} numberOfLines={1}>
          {item.presupuesto
            ? (Number.isFinite(Number(item.presupuesto)) ? `$${Number(item.presupuesto).toLocaleString('es-MX')}` : item.presupuesto)
            : '—'}
        </Text>
        <Text style={[s.td, s.colSeguim, { color: c.textSub }]} numberOfLines={1}>
          {item.proximo_contacto ? new Date(item.proximo_contacto).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'}
        </Text>
        <Text style={[s.td, s.colNotas, { color: c.textSub }]} numberOfLines={1}>{item.notas ?? '—'}</Text>
        <View style={[s.colAccion]}>
          {!!tel(item.telefono) && (
            <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${tel(item.telefono).length === 10 ? '52' : ''}${tel(item.telefono)}`)}>
              <Ionicons name="logo-whatsapp" size={16} color="#128C7E" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  function TarjetaMovil({ item }: { item: Cliente }) {
    const info = ESTADOS[item.estado] ?? { label: item.estado, color: '#64748b', bg: '#f1f5f9' }
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[s.cardBar, { backgroundColor: info.color }]} />
        <View style={s.cardBody}>
          <View style={s.cardHead}>
            <View style={[s.avatar, { backgroundColor: info.color + '22' }]}>
              <Text style={[s.avatarTxt, { color: info.color }]}>{iniciales(item.nombre)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.cardNombre, { color: c.text }]} numberOfLines={1}>{item.nombre ?? 'Sin nombre'}</Text>
              {(item.zona_busqueda || item.presupuesto) && (
                <Text style={[s.cardSub, { color: c.textSub }]} numberOfLines={1}>
                  {[item.zona_busqueda, item.presupuesto].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[s.estadoBadge, { backgroundColor: info.color + '1c' }]}
              disabled={soloLectura}
              onPress={() => setEditandoEstado(item)}
            >
              <View style={[s.estadoDot, { backgroundColor: info.color }]} />
              <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
              {!soloLectura && <Ionicons name="chevron-down" size={10} color={info.color} />}
            </TouchableOpacity>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Ionicons name="call-outline" size={11} color={c.textMute} />
              <Text style={[s.metaTxt, { color: c.textSub }]}>{item.telefono}</Text>
            </View>
            <View style={s.metaItem}>
              <Ionicons name="time-outline" size={11} color={c.textMute} />
              <Text style={[s.metaTxt, { color: c.textMute }]}>{tiempoRelativo(item.created_at)}</Text>
            </View>
            {!!tel(item.telefono) && (
              <TouchableOpacity
                style={s.waMeta}
                onPress={() => Linking.openURL(`https://wa.me/${tel(item.telefono).length === 10 ? '52' : ''}${tel(item.telefono)}`)}
              >
                <Ionicons name="logo-whatsapp" size={13} color="#128C7E" />
                <Text style={[s.metaTxt, { color: '#128C7E', fontWeight: '700' }]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )
  }

  const vacio = (
    <View style={s.vacio}>
      <Ionicons name="people-outline" size={30} color={c.textMute} />
      <Text style={[s.vacioTxt, { color: c.textSub }]}>
        {soloLectura ? 'Esta persona todavía no tiene clientes.' : 'Aquí llevas a tus clientes: a quién le estás buscando qué, y cómo vas con cada uno.'}
      </Text>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {isWeb ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {encabezado}
          {lista.length === 0 ? vacio : (
            <View style={[s.table, { borderColor: c.border }]}>
              <View style={[s.trow, s.thead, { borderColor: c.border, backgroundColor: c.card }]}>
                <Text style={[s.th, s.colNombre, { color: c.textSub }]}>Nombre</Text>
                <Text style={[s.th, s.colTel, { color: c.textSub }]}>Teléfono</Text>
                <Text style={[s.th, s.colEstado, { color: c.textSub }]}>Estado</Text>
                <Text style={[s.th, s.colOp, { color: c.textSub }]}>Op.</Text>
                <Text style={[s.th, s.colPago, { color: c.textSub }]}>Método pago</Text>
                <Text style={[s.th, s.colZona, { color: c.textSub }]}>Zona</Text>
                <Text style={[s.th, s.colPresup, { color: c.textSub }]}>Presupuesto</Text>
                <Text style={[s.th, s.colSeguim, { color: c.textSub }]}>Prox. seguim.</Text>
                <Text style={[s.th, s.colNotas, { color: c.textSub }]}>Notas</Text>
                <View style={[s.colAccion]} />
              </View>
              {lista.map(item => <Fila key={item.id} item={item} />)}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={x => x.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 9 }}
          ListHeaderComponent={<View style={{ marginBottom: 4 }}>{encabezado}</View>}
          ListEmptyComponent={vacio}
          renderItem={({ item }) => <TarjetaMovil item={item} />}
        />
      )}

      {/* Alta rápida de cliente */}
      <Modal visible={modalNuevo} transparent animationType="fade" onRequestClose={() => setModalNuevo(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>Nuevo cliente</Text>
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={nombre} onChangeText={setNombre} placeholder="Nombre *" placeholderTextColor={c.placeholder} />
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={telefono} onChangeText={setTelefono} placeholder="Teléfono *" placeholderTextColor={c.placeholder} keyboardType="phone-pad" />
            <View style={{ marginTop: 2, marginBottom: 2 }}>
              <PillSelector
                options={[{ value: 'venta', label: '🏠 Venta' }, { value: 'renta', label: '🔑 Renta' }, { value: 'captacion', label: '📥 Captación' }]}
                value={tipoOp} onChange={setTipoOp}
              />
            </View>
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={zona} onChangeText={setZona} placeholder="Zona de búsqueda" placeholderTextColor={c.placeholder} />
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={presupuesto} onChangeText={setPresupuesto} placeholder="Presupuesto" placeholderTextColor={c.placeholder} />
            <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={agregarCliente} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnGuardarTxt}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalNuevo(false)}>
              <Text style={[s.cancelar, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cambiar la etapa de un cliente propio */}
      <Modal visible={!!editandoEstado} transparent animationType="fade" onRequestClose={() => setEditandoEstado(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>
              Etapa de {editandoEstado?.nombre ?? 'este cliente'}
            </Text>
            {ORDEN_ESTADOS.filter(e => e !== 'compro_externo').map(e => {
              const info = ESTADOS[e]
              const activo = editandoEstado?.estado === e
              return (
                <TouchableOpacity
                  key={e}
                  style={[s.opcionEstado, { backgroundColor: activo ? info.color + '22' : 'transparent' }]}
                  onPress={() => editandoEstado && cambiarEstado(editandoEstado.id, e)}
                >
                  <View style={[s.estadoDot, { backgroundColor: info.color }]} />
                  <Text style={[s.opcionEstadoTxt, { color: c.text, fontWeight: activo ? '800' : '600' }]}>{info.label}</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity onPress={() => setEditandoEstado(null)}>
              <Text style={[s.cancelar, { color: c.textSub }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Elegir qué CRM mirar — solo titular */}
      <Modal visible={modalEquipo} transparent animationType="fade" onRequestClose={() => setModalEquipo(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>CRM de asesores</Text>
            <TouchableOpacity style={[s.filaEquipo, { borderBottomColor: c.border }]} onPress={verResumenAgencia}>
              <Ionicons name="bar-chart-outline" size={16} color="#5e35b1" />
              <Text style={[s.filaEquipoTxt, { color: c.text }]}>Resumen de toda la agencia</Text>
            </TouchableOpacity>
            {equipo.filter(m => m.id !== miId).map(m => (
              <TouchableOpacity key={m.id} style={[s.filaEquipo, { borderBottomColor: c.border }]} onPress={() => verAgente(m)}>
                <Ionicons name="person-outline" size={16} color={c.textSub} />
                <Text style={[s.filaEquipoTxt, { color: c.text }]}>{m.nombre ?? 'Sin nombre'}</Text>
                <Text style={[s.filaEquipoRol, { color: c.textSub }]}>{m.role === 'aliado_admin' ? 'Titular' : 'Agente'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setModalEquipo(false)}>
              <Text style={[s.cancelar, { color: c.textSub }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Resumen de toda la agencia */}
      <Modal visible={modalCrm} transparent animationType="slide" onRequestClose={() => setModalCrm(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card, maxHeight: '85%' }]}>
            <ScrollView>
              <Text style={[s.modalTitulo, { color: c.text }]}>Resumen de la agencia</Text>
              {loadingCrm ? (
                <ActivityIndicator color={c.text} style={{ marginVertical: 20 }} />
              ) : crmSeleccion ? (
                <CrmMetricasPanel metricas={crmSeleccion} c={c} />
              ) : null}
            </ScrollView>
            <TouchableOpacity onPress={() => setModalCrm(false)}>
              <Text style={[s.cancelar, { color: c.textSub }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center' },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#5e35b1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9,
  },
  btnAgregarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnCrm: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  btnCrmTxt: { color: '#5e35b1', fontWeight: '700', fontSize: 12.5 },
  roBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10,
  },
  roBannerTxt: { color: '#fff', fontWeight: '700', fontSize: 12.5, flex: 1, marginRight: 8 },
  roBannerLink: { color: '#fff', fontWeight: '800', fontSize: 12.5, textDecorationLine: 'underline' },

  // Tabla (web)
  table: { marginTop: 14, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  thead: { borderBottomWidth: 1, paddingVertical: 10 },
  trow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 6 },
  th: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 12.5 },
  colNombre: { flexBasis: 150, flexGrow: 1 },
  colTel: { flexBasis: 100 },
  colEstado: { flexBasis: 130 },
  colOp: { flexBasis: 90 },
  colPago: { flexBasis: 90 },
  colZona: { flexBasis: 120 },
  colPresup: { flexBasis: 100 },
  colSeguim: { flexBasis: 90 },
  colNotas: { flexBasis: 140, flexGrow: 1 },
  colAccion: { flexBasis: 28, alignItems: 'center' },

  // Tarjeta (móvil)
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  cardBar: { width: 4 },
  cardBody: { flex: 1, minWidth: 0, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 13, fontWeight: '800' },
  cardNombre: { fontSize: 14.5, fontWeight: '800' },
  cardSub: { fontSize: 11.5, marginTop: 1 },
  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 140,
  },
  estadoDot: { width: 6, height: 6, borderRadius: 3 },
  estadoTxt: { fontSize: 10.5, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11.5 },
  waMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },

  vacio: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  vacioTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, gap: 8 },
  modalTitulo: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btnGuardar: { backgroundColor: '#5e35b1', borderRadius: 9, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  btnGuardarTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cancelar: { textAlign: 'center', fontSize: 13, paddingVertical: 8 },
  filaEquipo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  opcionEstado: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  opcionEstadoTxt: { fontSize: 14 },
  filaEquipoTxt: { fontSize: 13.5, fontWeight: '700', flex: 1 },
  filaEquipoRol: { fontSize: 11 },
})
