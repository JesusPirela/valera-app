import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, TouchableOpacity, Modal, Alert, Platform, Linking,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'
import { ESTADOS } from '../(prospectador)/crm'

function abrirWhatsApp(telefono: string, nombre: string) {
  const phone = telefono.replace(/\D/g, '')
  const num = phone.length === 10 ? `52${phone}` : phone
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else Linking.openURL(url)
}

type UsuarioSimple = { id: string; nombre: string }

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  tipo_operacion: string | null
  tipo_credito: string | null
  presupuesto: string | null
  zona_busqueda: string | null
  notas: string | null
  proximo_contacto: string | null
  created_at: string
  responsable_id: string | null
  responsable_nombre: string | null
  cierre_completado: boolean
  cierre_notas: string | null
}

type Interaccion = {
  id: string
  tipo: string
  descripcion: string
  created_at: string
}

type Recordatorio = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_hora: string
  completado: boolean
}

const FUENTE_LABELS: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko',
  campana_fb: 'Campaña FB', grupo_fb: 'Grupo FB', otro: 'Otro',
  // legacy
  referido: 'Referido', redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría', evento: 'Evento',
}

const CREDITO_LABELS: Record<string, string> = {
  infonavit: 'Infonavit', fovisste: 'Fovisste',
  bancario: 'Bancario', contado: 'Contado', otro: 'Otro',
}

const TIPO_ICON: Record<string, string> = {
  nota: '📝', llamada: '📞', mensaje: '💬', visita: '🏠', estado_cambiado: '🔄',
}

function tiempoRelativo(fechaISO: string) {
  const diff = Date.now() - new Date(fechaISO).getTime()
  const min = Math.floor(diff / 60000)
  const hrs = Math.floor(min / 60)
  const dias = Math.floor(hrs / 24)
  if (min < 1) return 'Hace un momento'
  if (min < 60) return `Hace ${min} min`
  if (hrs < 24) return `Hace ${hrs}h`
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFechaHora(fechaISO: string) {
  return new Date(fechaISO).toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminDetalleCliente() {
  const c = useColors()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacciones, setInteracciones] = useState<Interaccion[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)

  const [modalReasignar, setModalReasignar] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioSimple[]>([])
  const [asesorSeleccionado, setAsesorSeleccionado] = useState('')
  const [guardandoReasignar, setGuardandoReasignar] = useState(false)

  const [modalEstado, setModalEstado] = useState(false)
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('')
  const [guardandoEstado, setGuardandoEstado] = useState(false)

  const [cierreNotas, setCierreNotas] = useState('')
  const [guardandoCierre, setGuardandoCierre] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data: cData }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('interacciones').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
      supabase.from('recordatorios').select('*').eq('cliente_id', id).order('fecha_hora', { ascending: true }),
    ])
    if (cData) {
      let responsableNombre: string | null = null
      if (cData.responsable_id) {
        const { data: perfil } = await supabase
          .from('profiles').select('nombre').eq('id', cData.responsable_id).maybeSingle()
        responsableNombre = perfil?.nombre ?? null
      }
      setCliente({ ...cData, responsable_nombre: responsableNombre })
      setCierreNotas(cData.cierre_notas ?? '')
    }
    setInteracciones(i ?? [])
    setRecordatorios(r ?? [])
    setLoading(false)
  }

  async function alternarCierreCompletado() {
    if (!cliente) return
    const nuevoValor = !cliente.cierre_completado
    setGuardandoCierre(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('clientes').update({ cierre_completado: nuevoValor }).eq('id', id)
    setGuardandoCierre(false)
    if (error) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`)
      else Alert.alert('Error', error.message)
      return
    }
    if (user) {
      await supabase.from('interacciones').insert({
        cliente_id: id, user_id: user.id,
        tipo: 'estado_cambiado',
        descripcion: nuevoValor ? 'Cierre marcado como completado.' : 'Cierre marcado como pendiente.',
      })
    }
    cargar()
  }

  async function guardarCierreNotas() {
    setGuardandoCierre(true)
    const { error } = await supabase.from('clientes').update({ cierre_notas: cierreNotas.trim() || null }).eq('id', id)
    setGuardandoCierre(false)
    if (error) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`)
      else Alert.alert('Error', error.message)
    }
  }

  async function abrirReasignar() {
    const { data } = await supabase
      .from('profiles')
      .select('id, nombre')
      .neq('role', 'admin')
      .order('nombre')
    setUsuarios((data ?? []) as UsuarioSimple[])
    setAsesorSeleccionado(cliente?.responsable_id ?? '')
    setModalReasignar(true)
  }

  async function guardarReasignacion() {
    if (!asesorSeleccionado) {
      if (Platform.OS === 'web') window.alert('Selecciona un asesor')
      else Alert.alert('Error', 'Selecciona un asesor')
      return
    }
    setGuardandoReasignar(true)
    const { error } = await supabase
      .from('clientes')
      .update({ responsable_id: asesorSeleccionado })
      .eq('id', id)
    setGuardandoReasignar(false)
    if (error) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`)
      else Alert.alert('Error', error.message)
      return
    }
    setModalReasignar(false)
    cargar()
  }

  async function guardarEstado() {
    if (!estadoSeleccionado || estadoSeleccionado === cliente?.estado) { setModalEstado(false); return }
    setGuardandoEstado(true)
    const { data: { user } } = await supabase.auth.getUser()
    const estadoAnterior = cliente?.estado ?? ''
    const { error } = await supabase.from('clientes').update({ estado: estadoSeleccionado }).eq('id', id)
    setGuardandoEstado(false)
    if (error) {
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`)
      else Alert.alert('Error', error.message)
      return
    }
    if (user) {
      await supabase.from('interacciones').insert({
        cliente_id: id, user_id: user.id,
        tipo: 'estado_cambiado',
        descripcion: `Estado cambiado de "${ESTADOS[estadoAnterior]?.label ?? estadoAnterior}" a "${ESTADOS[estadoSeleccionado]?.label ?? estadoSeleccionado}" por el administrador.`,
      })
    }
    setModalEstado(false)
    cargar()
  }

  useFocusEffect(useCallback(() => { cargar() }, [id]))

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!cliente) return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={{ padding: 24, color: c.textMute }}>Cliente no encontrado.</Text>
    </View>
  )

  const info = ESTADOS[cliente.estado] ?? { label: cliente.estado, color: '#555', bg: '#eee' }
  const recPendientes = recordatorios.filter((r) => !r.completado)
  const recCompletados = recordatorios.filter((r) => r.completado)

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>

      {/* Back + acciones rápidas */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/crm')}>
          <Ionicons name="arrow-back" size={18} color="#1a6470" />
          <Text style={styles.backText}>CRM</Text>
        </TouchableOpacity>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.qaWa} onPress={() => abrirWhatsApp(cliente.telefono, cliente.nombre)}>
            <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
            <Text style={styles.qaWaText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qaCall} onPress={() => Linking.openURL(`tel:${cliente.telefono}`)}>
            <Ionicons name="call-outline" size={14} color="#1a6470" />
            <Text style={styles.qaCallText}>Llamar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Info principal */}
      <View style={[styles.clienteCard, { backgroundColor: c.card }]}>
        <View style={styles.clienteTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clienteNombre, { color: c.text }]}>{cliente.nombre}</Text>
            {cliente.empresa ? <Text style={styles.clienteEmpresa}>{cliente.empresa}</Text> : null}
          </View>
          <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
            <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Teléfono</Text>
          <Text style={[styles.infoValue, { color: c.textSub }]}>{cliente.telefono}</Text>
        </View>
        {cliente.email ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{cliente.email}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fuente</Text>
          <Text style={[styles.infoValue, { color: c.textSub }]}>{FUENTE_LABELS[cliente.fuente_lead] ?? cliente.fuente_lead}</Text>
        </View>
        {cliente.tipo_operacion ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Busca en</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{cliente.tipo_operacion === 'venta' ? 'Venta' : 'Renta'}</Text>
          </View>
        ) : null}
        {cliente.zona_busqueda ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Zona</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{cliente.zona_busqueda}</Text>
          </View>
        ) : null}
        {cliente.tipo_credito ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Crédito</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{CREDITO_LABELS[cliente.tipo_credito] ?? cliente.tipo_credito}</Text>
          </View>
        ) : null}
        {cliente.presupuesto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Presupuesto</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{cliente.presupuesto}</Text>
          </View>
        ) : null}
        {cliente.proximo_contacto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Próx. contacto</Text>
            <Text style={[styles.infoValue, { color: c.textSub }]}>{formatFechaHora(cliente.proximo_contacto)}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Agregado</Text>
          <Text style={[styles.infoValue, { color: c.textSub }]}>{tiempoRelativo(cliente.created_at)}</Text>
        </View>
        {cliente.notas ? (
          <View style={styles.notasBox}>
            <Text style={styles.notasLabel}>Notas</Text>
            <Text style={[styles.notasText, { color: c.textSub }]}>{cliente.notas}</Text>
          </View>
        ) : null}
      </View>

      {/* Estado + Asesor */}
      <View style={[styles.asesorCard, { backgroundColor: c.card }]}>
        {/* Estado */}
        <View style={[styles.asesorRow, { borderBottomWidth: 1, borderBottomColor: '#f0f3f5', paddingBottom: 14, marginBottom: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.asesorLabel}>Estado del lead</Text>
            <View style={[styles.estadoBadgeInline, { backgroundColor: info.bg }]}>
              <View style={[styles.estadoDotInline, { backgroundColor: info.color }]} />
              <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.asesorBtn} onPress={() => { setEstadoSeleccionado(cliente.estado); setModalEstado(true) }}>
            <Text style={styles.asesorBtnText}>Cambiar</Text>
          </TouchableOpacity>
        </View>

        {/* Asesor asignado */}
        <View style={styles.asesorRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.asesorLabel}>Asesor asignado</Text>
            <Text style={[styles.asesorNombre, { color: c.text }]}>
              {cliente.responsable_nombre ?? 'Sin asignar'}
            </Text>
          </View>
          <TouchableOpacity style={styles.asesorBtn} onPress={abrirReasignar}>
            <Text style={styles.asesorBtnText}>Cambiar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Documentación y cierre */}
      <View style={[styles.asesorCard, { backgroundColor: c.card }]}>
        <View style={styles.asesorRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.asesorLabel}>Documentación y cierre</Text>
            <Text style={[styles.asesorNombre, { color: cliente.cierre_completado ? '#2e7d32' : c.text }]}>
              {cliente.cierre_completado ? 'Cierre completado' : 'Cierre pendiente'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.asesorBtn, cliente.cierre_completado && { backgroundColor: '#2e7d32' }, guardandoCierre && { opacity: 0.6 }]}
            onPress={alternarCierreCompletado}
            disabled={guardandoCierre}
          >
            <Text style={styles.asesorBtnText}>{cliente.cierre_completado ? 'Marcar pendiente' : 'Marcar completado'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.asesorLabel, { marginTop: 14, marginBottom: 6 }]}>Notas de cierre</Text>
        <TextInput
          style={[styles.cierreNotasInput, { color: c.text, borderColor: c.border }]}
          value={cierreNotas}
          onChangeText={setCierreNotas}
          onBlur={guardarCierreNotas}
          placeholder="Documentos pendientes, detalles del cierre, etc."
          placeholderTextColor={c.textMute}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Modal reasignar */}
      <Modal visible={modalReasignar} animationType="slide" transparent onRequestClose={() => setModalReasignar(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitulo, { color: c.text }]}>Reasignar asesor</Text>
              <TouchableOpacity onPress={() => setModalReasignar(false)}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {usuarios.length === 0 ? (
                <Text style={{ color: '#aaa', fontStyle: 'italic', padding: 12 }}>
                  No hay asesores registrados
                </Text>
              ) : (
                <View style={styles.usuariosList}>
                  {usuarios.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.usuarioRow, asesorSeleccionado === u.id && styles.usuarioRowActivo]}
                      onPress={() => setAsesorSeleccionado(u.id)}
                    >
                      <View style={[styles.usuarioAvatar, { backgroundColor: asesorSeleccionado === u.id ? '#d4f0e2' : '#e8f2f4' }]}>
                        <Text style={[styles.usuarioAvatarTxt, { color: asesorSeleccionado === u.id ? '#2a8a5a' : '#1a6470' }]}>
                          {(u.nombre ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.usuarioNombre, { color: c.text }, asesorSeleccionado === u.id && { color: '#2a8a5a', fontWeight: '700' }]}>
                        {u.nombre}
                      </Text>
                      {asesorSeleccionado === u.id && <Text style={{ color: '#2a8a5a', fontSize: 16 }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={[styles.guardarBtn, guardandoReasignar && { opacity: 0.6 }]}
                onPress={guardarReasignacion}
                disabled={guardandoReasignar}
              >
                {guardandoReasignar
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.guardarBtnTxt}>Guardar cambio</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal cambiar estado */}
      <Modal visible={modalEstado} animationType="slide" transparent onRequestClose={() => setModalEstado(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitulo, { color: c.text }]}>Cambiar estado</Text>
              <TouchableOpacity onPress={() => setModalEstado(false)}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: 6, marginBottom: 16 }}>
                {Object.entries(ESTADOS).map(([key, est]) => {
                  const activo = estadoSeleccionado === key
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.estadoOpcion, activo && { backgroundColor: est.bg, borderColor: est.color }]}
                      onPress={() => setEstadoSeleccionado(key)}
                    >
                      <View style={[styles.estadoOpcionDot, { backgroundColor: est.color }]} />
                      <Text style={[styles.estadoOpcionText, { color: c.textSub }, activo && { color: est.color, fontWeight: '700' }]}>
                        {est.label}
                      </Text>
                      {activo && <Ionicons name="checkmark-circle" size={18} color={est.color} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
              <TouchableOpacity
                style={[styles.guardarBtn, (guardandoEstado || estadoSeleccionado === cliente.estado) && { opacity: 0.6 }]}
                onPress={guardarEstado}
                disabled={guardandoEstado || estadoSeleccionado === cliente.estado}
              >
                {guardandoEstado
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.guardarBtnTxt}>Guardar estado</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Recordatorios — solo lectura */}
      <Text style={styles.secTitle}>Recordatorios</Text>

      {recPendientes.length === 0 ? (
        <Text style={styles.emptyText}>Sin recordatorios pendientes.</Text>
      ) : (
        recPendientes.map((r) => {
          const vencido = new Date(r.fecha_hora) < new Date()
          return (
            <View key={r.id} style={[styles.recCard, { backgroundColor: c.card }, vencido && styles.recCardVencido]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recTitulo, { color: c.text }, vencido && styles.recTituloVencido]}>{r.titulo}</Text>
                <Text style={styles.recFecha}>{formatFechaHora(r.fecha_hora)}</Text>
                {r.descripcion ? <Text style={styles.recDesc}>{r.descripcion}</Text> : null}
                {vencido && <Text style={styles.recVencidoLabel}>Vencido</Text>}
              </View>
            </View>
          )
        })
      )}

      {recCompletados.length > 0 && (
        <Text style={styles.recCompletadosLabel}>
          {recCompletados.length} recordatorio{recCompletados.length > 1 ? 's' : ''} completado{recCompletados.length > 1 ? 's' : ''}
        </Text>
      )}

      {/* Historial — solo lectura */}
      <Text style={[styles.secTitle, { marginTop: 16 }]}>Historial de actividad</Text>

      {interacciones.length === 0 ? (
        <Text style={styles.emptyText}>Sin actividad registrada.</Text>
      ) : (
        interacciones.map((item) => (
          <View key={item.id} style={[styles.interaccionRow, { backgroundColor: c.card }]}>
            <Text style={styles.interaccionIcon}>{TIPO_ICON[item.tipo] ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.interaccionDesc, { color: c.text }]}>{item.descripcion}</Text>
              <Text style={styles.interaccionFecha}>{tiempoRelativo(item.created_at)}</Text>
            </View>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 52 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingRight: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: '#1a6470' },
  quickActions: { flexDirection: 'row', gap: 8 },
  qaWa: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0fdf6', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#d1f7e2',
  },
  qaWaText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  qaCall: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0f8fa', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#cde8ed',
  },
  qaCallText: { fontSize: 12, fontWeight: '700', color: '#1a6470' },

  readonlyBanner: {
    backgroundColor: '#fff8e1', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14,
    borderWidth: 1, borderColor: '#ffe082', alignItems: 'center',
  },
  readonlyText: { fontSize: 12, color: '#b8860b', fontWeight: '600' },

  clienteCard: {
    borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  clienteTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  clienteNombre: { fontSize: 20, fontWeight: '800' },
  clienteEmpresa: { fontSize: 13, color: '#9eafb2', marginTop: 3 },
  estadoBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  estadoText: { fontSize: 12, fontWeight: '700' },
  estadoBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 4 },
  estadoDotInline: { width: 6, height: 6, borderRadius: 3 },
  estadoOpcion: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  estadoOpcionDot: { width: 8, height: 8, borderRadius: 4 },
  estadoOpcionText: { flex: 1, fontSize: 14 },

  infoRow: {
    flexDirection: 'row', paddingVertical: 10, flexWrap: 'wrap',
    borderBottomWidth: 1, borderBottomColor: '#f0f3f5',
  },
  infoLabel: { fontSize: 12, color: '#9eafb2', fontWeight: '600', width: 120 },
  infoValue: { fontSize: 13, fontWeight: '500', flex: 1 },

  notasBox: {
    marginTop: 10, backgroundColor: '#f8f9fb', borderRadius: 12,
    padding: 12, borderLeftWidth: 3, borderLeftColor: '#c9a84c',
  },
  notasLabel: { fontSize: 11, fontWeight: '700', color: '#9eafb2', marginBottom: 5, letterSpacing: 0.4 },
  notasText: { fontSize: 13, fontStyle: 'italic', lineHeight: 20 },

  secTitle: {
    fontSize: 11, fontWeight: '700', color: '#6b8082', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: '#c0cdd0', marginBottom: 12 },

  recCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 8,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
    borderLeftWidth: 3, borderLeftColor: '#e0f4f5',
  },
  recCardVencido: { borderLeftColor: '#fde8e8', backgroundColor: '#fff8f8' },
  recTitulo: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  recTituloVencido: { color: '#c0392b' },
  recFecha: { fontSize: 12, color: '#9eafb2' },
  recDesc: { fontSize: 12, color: '#6b7f82', marginTop: 3 },
  recVencidoLabel: { fontSize: 11, color: '#c0392b', fontWeight: '700', marginTop: 4 },
  recCompletadosLabel: { fontSize: 12, color: '#bbb', marginBottom: 10, textAlign: 'center' },

  interaccionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 8,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  interaccionIcon: { fontSize: 18 },
  interaccionDesc: { fontSize: 13, lineHeight: 19 },
  interaccionFecha: { fontSize: 11, color: '#9eafb2', marginTop: 4 },

  asesorCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  asesorRow: { flexDirection: 'row', alignItems: 'center' },
  asesorLabel: { fontSize: 11, fontWeight: '700', color: '#9eafb2', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  asesorNombre: { fontSize: 16, fontWeight: '700' },
  asesorBtn: {
    backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2,
  },
  asesorBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cierreNotasInput: {
    borderWidth: 1, borderRadius: 10, padding: 10,
    fontSize: 13, minHeight: 70, textAlignVertical: 'top',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitulo: { fontSize: 18, fontWeight: '800' },
  modalCerrar: { fontSize: 18, color: '#9eafb2', paddingHorizontal: 6 },
  usuariosList: { borderWidth: 1, borderColor: '#e0eaec', borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  usuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  usuarioRowActivo: { backgroundColor: '#f0fcf6' },
  usuarioAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  usuarioAvatarTxt: { fontSize: 14, fontWeight: '700' },
  usuarioNombre: { flex: 1, fontSize: 14 },
  guardarBtn: { backgroundColor: '#c9a84c', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  guardarBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
