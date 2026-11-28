// Sus clientes. Lista personal al estilo del CRM de prospectador (sin la
// parte de misiones/gamificación, que no aplica aquí), más —solo para el
// titular— el mismo "CRM de equipo" que ya tiene un gerente sobre SU gente:
// se arma con las mismas piezas (calcularCrmMetricas + CrmMetricasPanel),
// solo que la RLS nueva (20261130_aliado_correcciones) acota lo que ve a los
// clientes de responsables de SU inmobiliaria, nunca a los nuestros.
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
import { ESTADOS } from '../(prospectador)/crm'

type Cliente = {
  id: string; nombre: string | null; telefono: string | null
  estado: string; zona_busqueda: string | null; presupuesto: string | null
  created_at: string
}
type Miembro = { id: string; nombre: string | null; role: string }

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

export default function AliadoClientes() {
  const c = useColors()
  const [lista, setLista] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [esTitular, setEsTitular] = useState(false)
  const [equipo, setEquipo] = useState<Miembro[]>([])

  const [modalNuevo, setModalNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [zona, setZona] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [modalCrm, setModalCrm] = useState(false)
  const [crmSeleccion, setCrmSeleccion] = useState<CrmMetricas | null>(null)
  const [loadingCrm, setLoadingCrm] = useState(false)

  function alerta(msg: string) {
    if (Platform.OS === 'web') window.alert(msg)
    else Alert.alert('Aviso', msg)
  }

  const cargar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [{ data }, { data: perfil }] = await Promise.all([
      supabase.from('clientes')
        .select('id, nombre, telefono, estado, zona_busqueda, presupuesto, created_at')
        .eq('responsable_id', session.user.id)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('role').eq('id', session.user.id).single(),
    ])
    setLista((data ?? []) as Cliente[])
    const titular = perfil?.role === 'aliado_admin'
    setEsTitular(titular)
    if (titular) {
      const { data: eq } = await supabase.rpc('mi_equipo_aliado')
      setEquipo((eq?.equipo ?? []) as Miembro[])
    }
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

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
        estado: 'por_perfilar', fuente_lead: 'otro',
        responsable_id: session.user.id,
      })
      if (error) throw error
      setModalNuevo(false)
      setNombre(''); setTelefono(''); setZona(''); setPresupuesto('')
      cargar()
    } catch (e: any) {
      alerta('Error: ' + (e?.message ?? 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  async function verCrm(userId: string | null, nombreCrm: string) {
    setModalCrm(true)
    setLoadingCrm(true)
    setCrmSeleccion(null)
    try {
      const metricas = await calcularCrmMetricas(userId, nombreCrm)
      setCrmSeleccion(metricas)
    } finally {
      setLoadingCrm(false)
    }
  }

  const tel = (t: string | null) => (t ?? '').replace(/\D/g, '')

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Mis clientes</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            {lista.length === 0 ? 'Todavía no hay ninguno.' : `${lista.length} en total`}
          </Text>
        </View>
        <TouchableOpacity style={s.btnAgregar} onPress={() => setModalNuevo(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.btnAgregarTxt}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {esTitular && (
        <TouchableOpacity style={[s.btnCrm, { borderColor: c.border }]} onPress={() => verCrm(null, 'Toda la agencia')}>
          <Ionicons name="bar-chart-outline" size={16} color="#5e35b1" />
          <Text style={s.btnCrmTxt}>CRM de asesores — toda la agencia</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={lista}
        keyExtractor={x => x.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 9 }}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="people-outline" size={30} color={c.textMute} />
            <Text style={[s.vacioTxt, { color: c.textSub }]}>
              Aquí llevas a tus clientes: a quién le estás buscando qué, y cómo
              vas con cada uno.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
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
                  <View style={[s.estadoBadge, { backgroundColor: info.color + '1c' }]}>
                    <View style={[s.estadoDot, { backgroundColor: info.color }]} />
                    <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
                  </View>
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
        }}
      />

      {/* Alta rápida de cliente */}
      <Modal visible={modalNuevo} transparent animationType="fade" onRequestClose={() => setModalNuevo(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>Nuevo cliente</Text>
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={nombre} onChangeText={setNombre} placeholder="Nombre *" placeholderTextColor={c.placeholder} />
            <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={telefono} onChangeText={setTelefono} placeholder="Teléfono *" placeholderTextColor={c.placeholder} keyboardType="phone-pad" />
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

      {/* CRM de asesores — solo titular */}
      <Modal visible={modalCrm} transparent animationType="slide" onRequestClose={() => setModalCrm(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card, maxHeight: '85%' }]}>
            <ScrollView>
              <Text style={[s.modalTitulo, { color: c.text }]}>CRM de asesores</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity style={s.pill} onPress={() => verCrm(null, 'Toda la agencia')}>
                  <Text style={s.pillTxt}>Toda la agencia</Text>
                </TouchableOpacity>
                {equipo.map(m => (
                  <TouchableOpacity key={m.id} style={s.pill} onPress={() => verCrm(m.id, m.nombre ?? 'Sin nombre')}>
                    <Text style={s.pillTxt}>{m.nombre ?? 'Sin nombre'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#5e35b1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9,
  },
  btnAgregarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnCrm: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 10,
    borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  btnCrmTxt: { color: '#5e35b1', fontWeight: '700', fontSize: 12.5 },
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
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 130,
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
  pill: { borderWidth: 1, borderColor: '#5e35b1', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pillTxt: { color: '#5e35b1', fontSize: 12.5, fontWeight: '700' },
})
