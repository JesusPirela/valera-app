import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Platform, FlatList, Linking,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from './crm'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { registrarAccion } from '../../lib/gamification'
import { OfflineBanner } from '../../components/OfflineBanner'
import { Ionicons } from '@expo/vector-icons'

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
  responsable_id: string
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
  notificado: boolean
}

const TIPOS_INTERACCION = [
  { value: 'nota',    label: 'Nota' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'mensaje', label: 'Mensaje' },
  { value: 'visita',  label: 'Visita' },
]

const FUENTE_LABELS: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko',
  campana_fb: 'Campaña FB', grupo_fb: 'Grupo FB', otro: 'Otro',
  referido: 'Referido', redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría', evento: 'Evento',
}

const CREDITO_LABELS: Record<string, string> = {
  infonavit: 'Infonavit', fovisste: 'Fovisste',
  bancario: 'Bancario', contado: 'Contado', otro: 'Otro',
}

const TIPO_ICON: Record<string, { icon: string; color: string }> = {
  nota:            { icon: 'document-text-outline', color: '#1565c0' },
  llamada:         { icon: 'call-outline',          color: '#2e7d32' },
  mensaje:         { icon: 'chatbubble-outline',    color: '#6a1b9a' },
  visita:          { icon: 'home-outline',          color: '#e65100' },
  estado_cambiado: { icon: 'git-branch-outline',   color: '#1a6470' },
}

const ORDEN_ESTADOS = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

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

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

// ── Date picker ─────────────────────────────────────────
function DateTimePicker({ value, onChange, label }: {
  value: Date | null; onChange: (d: Date | null) => void; label: string
}) {
  const [open, setOpen] = useState(false)
  const [temp, setTemp] = useState<Date>(value ?? new Date())

  function adj(field: 'date' | 'month' | 'year' | 'hour' | 'minute', delta: number) {
    setTemp((prev) => {
      const d = new Date(prev)
      if (field === 'date')   d.setDate(d.getDate() + delta)
      if (field === 'month')  d.setMonth(d.getMonth() + delta)
      if (field === 'year')   d.setFullYear(d.getFullYear() + delta)
      if (field === 'hour')   d.setHours(d.getHours() + delta)
      if (field === 'minute') d.setMinutes(d.getMinutes() + delta)
      return d
    })
  }

  const displayStr = value
    ? value.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha'

  return (
    <>
      <Text style={dpStyles.label}>{label}</Text>
      <TouchableOpacity style={dpStyles.trigger} onPress={() => { setTemp(value ?? new Date()); setOpen(true) }}>
        <Text style={[dpStyles.triggerText, !value && dpStyles.placeholder]}>{displayStr}</Text>
        <Text style={dpStyles.icon}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <View style={dpStyles.overlay}>
          <View style={dpStyles.modal}>
            <Text style={dpStyles.modalTitle}>Fecha y hora</Text>
            <Text style={dpStyles.secLabel}>Fecha</Text>
            <View style={dpStyles.row}>
              <Spin label="Día"  value={temp.getDate()}  onUp={() => adj('date', 1)}  onDown={() => adj('date', -1)} />
              <Spin label="Mes"  value={temp.toLocaleString('es-MX', { month: 'short' })}  onUp={() => adj('month', 1)}  onDown={() => adj('month', -1)} />
              <Spin label="Año"  value={temp.getFullYear()}  onUp={() => adj('year', 1)}  onDown={() => adj('year', -1)} />
            </View>
            <Text style={dpStyles.secLabel}>Hora</Text>
            <View style={dpStyles.row}>
              <Spin label="Hora" value={String(temp.getHours()).padStart(2, '0')}   onUp={() => adj('hour', 1)}   onDown={() => adj('hour', -1)} />
              <Spin label="Min"  value={String(temp.getMinutes()).padStart(2, '0')} onUp={() => adj('minute', 5)} onDown={() => adj('minute', -5)} />
            </View>
            <View style={dpStyles.actions}>
              <TouchableOpacity style={dpStyles.btnCancel} onPress={() => setOpen(false)}>
                <Text style={dpStyles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dpStyles.btnConfirm} onPress={() => { onChange(temp); setOpen(false) }}>
                <Text style={dpStyles.btnConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function Spin({ label, value, onUp, onDown }: { label: string; value: string | number; onUp: () => void; onDown: () => void }) {
  return (
    <View style={dpStyles.spin}>
      <Text style={dpStyles.spinLabel}>{label}</Text>
      <TouchableOpacity onPress={onUp} style={dpStyles.spinBtn}><Text style={dpStyles.spinArrow}>▲</Text></TouchableOpacity>
      <Text style={dpStyles.spinValue}>{value}</Text>
      <TouchableOpacity onPress={onDown} style={dpStyles.spinBtn}><Text style={dpStyles.spinArrow}>▼</Text></TouchableOpacity>
    </View>
  )
}

// ── Pantalla principal ───────────────────────────────────
export default function DetalleCliente() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['detalle-cliente', id],
    queryFn: async () => {
      const [{ data: c }, { data: i }, { data: r }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('interacciones').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
        supabase.from('recordatorios').select('*').eq('cliente_id', id).order('fecha_hora', { ascending: true }),
      ])
      if (!c) throw new Error('Cliente no encontrado')
      return { cliente: c as Cliente, interacciones: (i ?? []) as Interaccion[], recordatorios: (r ?? []) as Recordatorio[] }
    },
    enabled: !!id,
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  const cliente = data?.cliente ?? null
  const interacciones = data?.interacciones ?? []
  const recordatorios = data?.recordatorios ?? []

  const [modalInteraccion, setModalInteraccion] = useState(false)
  const [tipoInteraccion, setTipoInteraccion] = useState('nota')
  const [textoInteraccion, setTextoInteraccion] = useState('')
  const [guardandoInteraccion, setGuardandoInteraccion] = useState(false)

  const [modalRecordatorio, setModalRecordatorio] = useState(false)
  const [tituloRec, setTituloRec] = useState('')
  const [descRec, setDescRec] = useState('')
  const [fechaRec, setFechaRec] = useState<Date | null>(null)
  const [guardandoRec, setGuardandoRec] = useState(false)

  async function cambiarEstado(nuevoEstado: string) {
    if (!cliente || nuevoEstado === cliente.estado) return
    const estadoAnterior = ESTADOS[cliente.estado]?.label ?? cliente.estado
    const estadoNuevo = ESTADOS[nuevoEstado]?.label ?? nuevoEstado
    const { error } = await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', id)
    if (error) { Alert.alert('Error', error.message); return }
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('interacciones').insert({
      cliente_id: id, user_id: user!.id, tipo: 'estado_cambiado',
      descripcion: `Estado cambiado de "${estadoAnterior}" a "${estadoNuevo}".`,
    })
    if (nuevoEstado === 'cita_agendada') registrarAccion(user!.id, 'agendar_cita').catch(() => {})
    if (nuevoEstado === 'compro') registrarAccion(user!.id, 'cerrar_venta').catch(() => {})
    refetch()
  }

  async function agregarInteraccion() {
    if (!textoInteraccion.trim()) { Alert.alert('Requerido', 'Escribe una descripción.'); return }
    setGuardandoInteraccion(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('interacciones').insert({
      cliente_id: id, user_id: user!.id, tipo: tipoInteraccion, descripcion: textoInteraccion.trim(),
    })
    setGuardandoInteraccion(false)
    if (error) { Alert.alert('Error', error.message); return }
    registrarAccion(user!.id, 'agregar_interaccion').catch(() => {})
    setTextoInteraccion('')
    setTipoInteraccion('nota')
    setModalInteraccion(false)
    refetch()
  }

  async function agregarRecordatorio() {
    if (!tituloRec.trim()) { Alert.alert('Requerido', 'El título es obligatorio.'); return }
    if (!fechaRec) { Alert.alert('Requerido', 'Selecciona una fecha y hora.'); return }
    setGuardandoRec(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('recordatorios').insert({
      cliente_id: id, user_id: user!.id, titulo: tituloRec.trim(),
      descripcion: descRec.trim() || null, fecha_hora: fechaRec.toISOString(),
    })
    setGuardandoRec(false)
    if (error) { Alert.alert('Error', error.message); return }
    setTituloRec(''); setDescRec(''); setFechaRec(null)
    setModalRecordatorio(false)
    refetch()
  }

  async function completarRecordatorio(recId: string) {
    const { error } = await supabase.from('recordatorios').update({ completado: true }).eq('id', recId)
    queryClient.setQueryData(['detalle-cliente', id], (old: typeof data) => {
      if (!old) return old
      return { ...old, recordatorios: old.recordatorios.map(r => r.id === recId ? { ...r, completado: true } : r) }
    })
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) registrarAccion(user.id, 'completar_seguimiento').catch(() => {})
    }
  }

  async function eliminarCliente() {
    const confirmar = () => {
      const run = async () => {
        const { error } = await supabase.from('clientes').delete().eq('id', id)
        if (error) Alert.alert('Error', error.message)
        else router.replace('/(prospectador)/crm')
      }
      run()
    }
    if (Platform.OS === 'web') {
      if (window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) confirmar()
    } else {
      Alert.alert('Eliminar cliente', '¿Estás seguro? Esta acción no se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmar },
      ])
    }
  }

  function abrirWhatsApp(msg: string) {
    if (!cliente) return
    const raw = cliente.telefono.replace(/\D/g, '')
    const tel = raw.startsWith('52') && raw.length === 12 ? raw : `52${raw}`
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
    if (Platform.OS === 'web') window.open(url, '_blank')
    else Linking.openURL(url)
  }

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f5f8' }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )
  if (!cliente) return (
    <View style={styles.container}>
      <Text style={{ padding: 24, color: '#aaa' }}>Cliente no encontrado.</Text>
    </View>
  )

  const info = ESTADOS[cliente.estado] ?? { label: cliente.estado, color: '#555', bg: '#eee' }
  const recPendientes = recordatorios.filter((r) => !r.completado)
  const recCompletados = recordatorios.filter((r) => r.completado)
  const initials = iniciales(cliente.nombre)

  const waDefault = `Hola ${cliente.nombre}, soy tu asesor de Valera Real Estate. Te contacto para dar seguimiento a tu búsqueda de propiedad. ¿Tienes un momento para platicar?`

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <OfflineBanner />

      {/* ── Hero header ──────────────────────────────── */}
      <View style={[styles.hero, { backgroundColor: info.color }]}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity style={styles.heroBack} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroEdit}
            onPress={() => router.push(`/(prospectador)/cliente-form?id=${id}`)}
          >
            <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroEditText}>Editar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroBody}>
          <View style={[styles.heroAvatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.heroAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.heroNombre}>{cliente.nombre}</Text>
          {cliente.empresa ? <Text style={styles.heroEmpresa}>{cliente.empresa}</Text> : null}
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Text style={styles.heroBadgeText}>{info.label}</Text>
          </View>
        </View>

        {/* Botones de acción */}
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.heroActionBtn} onPress={() => Linking.openURL(`tel:${cliente.telefono}`)}>
            <Ionicons name="call" size={20} color={info.color} />
            <Text style={[styles.heroActionText, { color: info.color }]}>Llamar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroActionBtn} onPress={() => abrirWhatsApp(waDefault)}>
            <Ionicons name="logo-whatsapp" size={20} color="#25d366" />
            <Text style={[styles.heroActionText, { color: '#25d366' }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Info del cliente ─────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información</Text>
        <View style={styles.infoCard}>
          <InfoRow icon="call-outline"       label="Teléfono"  value={cliente.telefono} />
          {cliente.email ? <InfoRow icon="mail-outline" label="Email" value={cliente.email} /> : null}
          <InfoRow icon="megaphone-outline"   label="Fuente"    value={FUENTE_LABELS[cliente.fuente_lead] ?? cliente.fuente_lead} />
          {cliente.tipo_operacion ? <InfoRow icon="home-outline" label="Busca en" value={cliente.tipo_operacion === 'venta' ? 'Venta' : 'Renta'} /> : null}
          {cliente.zona_busqueda  ? <InfoRow icon="map-outline"  label="Zona"     value={cliente.zona_busqueda} /> : null}
          {cliente.tipo_credito   ? <InfoRow icon="card-outline" label="Crédito"  value={CREDITO_LABELS[cliente.tipo_credito] ?? cliente.tipo_credito} /> : null}
          {cliente.presupuesto    ? <InfoRow icon="cash-outline" label="Presupuesto" value={cliente.presupuesto} isLast /> : null}
        </View>

        {cliente.notas ? (
          <View style={styles.notasCard}>
            <View style={styles.notasHeader}>
              <Ionicons name="document-text-outline" size={14} color="#6b8082" />
              <Text style={styles.notasLabel}>Notas</Text>
            </View>
            <Text style={styles.notasText}>{cliente.notas}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Mensajes rápidos WhatsApp ─────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mensajes rápidos</Text>
        <View style={styles.waCard}>
          {[
            { label: 'Recordatorio de cita', icon: 'alarm-outline', msg: `Hola ${cliente.nombre}, te recuerdo que tenemos una cita agendada. ¿Sigue en pie? Con gusto te confirmo los detalles.` },
            { label: 'Compartir propiedad',   icon: 'home-outline',  msg: `Hola ${cliente.nombre}, encontré una propiedad que puede interesarte. ¿Tienes unos minutos para que te cuente los detalles?` },
            { label: 'Solicitar documentos',  icon: 'folder-outline',msg: `Hola ${cliente.nombre}, para avanzar con tu proceso necesitamos algunos documentos. ¿Puedes enviarlos cuando puedas?` },
            { label: 'Seguimiento post-visita',icon: 'checkmark-circle-outline', msg: `Hola ${cliente.nombre}, ¿qué te pareció la propiedad que visitamos? Quedo a tus órdenes para cualquier duda.` },
          ].map((t, i, arr) => (
            <TouchableOpacity
              key={t.label}
              style={[styles.waRow, i < arr.length - 1 && styles.waRowBorder]}
              onPress={() => abrirWhatsApp(t.msg)}
            >
              <View style={styles.waIconWrap}>
                <Ionicons name={t.icon as any} size={16} color="#1a6470" />
              </View>
              <Text style={styles.waLabel}>{t.label}</Text>
              <Ionicons name="logo-whatsapp" size={16} color="#25d366" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Etapa de venta ───────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Etapa de venta</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
            {ORDEN_ESTADOS.map((e) => {
              const ei = ESTADOS[e] ?? { label: e, color: '#555', bg: '#eee' }
              const activo = cliente.estado === e
              return (
                <TouchableOpacity
                  key={e}
                  style={[styles.estadoChip, { borderColor: ei.color }, activo && { backgroundColor: ei.bg }]}
                  onPress={() => cambiarEstado(e)}
                >
                  {activo && <View style={[styles.estadoDot, { backgroundColor: ei.color }]} />}
                  <Text style={[styles.estadoChipText, { color: activo ? ei.color : '#bbb' }, activo && { fontWeight: '700' }]}>
                    {ei.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>
      </View>

      {/* ── Recordatorios ────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recordatorios</Text>
          <TouchableOpacity style={styles.sectionBtn} onPress={() => setModalRecordatorio(true)}>
            <Ionicons name="add" size={14} color="#1a6470" />
            <Text style={styles.sectionBtnText}>Agregar</Text>
          </TouchableOpacity>
        </View>
        {recPendientes.length === 0 ? (
          <Text style={styles.emptyText}>Sin recordatorios pendientes.</Text>
        ) : null}
        {recPendientes.map((r) => {
          const vencido = new Date(r.fecha_hora) < new Date()
          return (
            <View key={r.id} style={[styles.recCard, vencido && styles.recCardVencido]}>
              <View style={[styles.recIcon, { backgroundColor: vencido ? '#fde8e8' : '#e8f4f5' }]}>
                <Ionicons name={vencido ? 'warning-outline' : 'alarm-outline'} size={18} color={vencido ? '#c0392b' : '#1a6470'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recTitulo, vencido && styles.recTituloVencido]}>{r.titulo}</Text>
                <Text style={styles.recFecha}>{formatFechaHora(r.fecha_hora)}</Text>
                {r.descripcion ? <Text style={styles.recDesc}>{r.descripcion}</Text> : null}
                {vencido && <Text style={styles.recVencidoTag}>Vencido</Text>}
              </View>
              <TouchableOpacity style={styles.recCompletarBtn} onPress={() => completarRecordatorio(r.id)}>
                <Ionicons name="checkmark-circle-outline" size={22} color="#1a6470" />
              </TouchableOpacity>
            </View>
          )
        })}
        {recCompletados.length > 0 && (
          <Text style={styles.recCompletadosLabel}>
            {recCompletados.length} recordatorio{recCompletados.length > 1 ? 's' : ''} completado{recCompletados.length > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* ── Historial de interacciones ────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Historial</Text>
          <TouchableOpacity style={styles.sectionBtn} onPress={() => setModalInteraccion(true)}>
            <Ionicons name="add" size={14} color="#1a6470" />
            <Text style={styles.sectionBtnText}>Registrar</Text>
          </TouchableOpacity>
        </View>
        {interacciones.length === 0 ? (
          <Text style={styles.emptyText}>Sin actividad registrada aún.</Text>
        ) : (
          interacciones.map((item, idx) => {
            const ti = TIPO_ICON[item.tipo] ?? { icon: 'ellipse-outline', color: '#aaa' }
            return (
              <View key={item.id} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: ti.color + '20', borderColor: ti.color }]}>
                    <Ionicons name={ti.icon as any} size={14} color={ti.color} />
                  </View>
                  {idx < interacciones.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineDesc}>{item.descripcion}</Text>
                  <Text style={styles.timelineFecha}>{tiempoRelativo(item.created_at)}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      {/* Eliminar */}
      <TouchableOpacity style={styles.btnEliminar} onPress={eliminarCliente}>
        <Ionicons name="trash-outline" size={16} color="#c0392b" />
        <Text style={styles.btnEliminarText}>Eliminar cliente</Text>
      </TouchableOpacity>

      {/* ── Modal: Registrar interacción ──────────────── */}
      <Modal visible={modalInteraccion} transparent animationType="slide">
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <Text style={modal.title}>Registrar actividad</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {TIPOS_INTERACCION.map((t) => {
                  const ti = TIPO_ICON[t.value]
                  const activo = tipoInteraccion === t.value
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[modal.chip, activo && { backgroundColor: ti?.color + '18', borderColor: ti?.color }]}
                      onPress={() => setTipoInteraccion(t.value)}
                    >
                      <Ionicons name={(ti?.icon ?? 'ellipse-outline') as any} size={14} color={activo ? ti?.color : '#aaa'} />
                      <Text style={[modal.chipText, activo && { color: ti?.color, fontWeight: '700' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
            <TextInput
              style={modal.textarea}
              value={textoInteraccion}
              onChangeText={setTextoInteraccion}
              placeholder="¿Qué pasó en esta interacción?"
              multiline numberOfLines={4} textAlignVertical="top" autoFocus
            />
            <View style={modal.actions}>
              <TouchableOpacity style={modal.btnCancel} onPress={() => { setModalInteraccion(false); setTextoInteraccion('') }}>
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnConfirm, guardandoInteraccion && { opacity: 0.6 }]}
                onPress={agregarInteraccion} disabled={guardandoInteraccion}
              >
                {guardandoInteraccion
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modal.btnConfirmText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Agregar recordatorio ────────────────── */}
      <Modal visible={modalRecordatorio} transparent animationType="slide">
        <View style={modal.overlay}>
          <ScrollView style={modal.sheetScroll} contentContainerStyle={modal.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={modal.title}>Nuevo recordatorio</Text>
            <Text style={modal.fieldLabel}>Título *</Text>
            <TextInput style={modal.input} value={tituloRec} onChangeText={setTituloRec} placeholder="Ej: Llamar para confirmar cita" autoFocus />
            <Text style={modal.fieldLabel}>Descripción</Text>
            <TextInput style={[modal.input, { height: 72, textAlignVertical: 'top' }]} value={descRec} onChangeText={setDescRec} placeholder="Detalles adicionales (opcional)" multiline />
            <DateTimePicker label="Fecha y hora *" value={fechaRec} onChange={setFechaRec} />
            <View style={modal.actions}>
              <TouchableOpacity style={modal.btnCancel} onPress={() => { setModalRecordatorio(false); setTituloRec(''); setDescRec(''); setFechaRec(null) }}>
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnConfirm, guardandoRec && { opacity: 0.6 }]}
                onPress={agregarRecordatorio} disabled={guardandoRec}
              >
                {guardandoRec ? <ActivityIndicator color="#fff" size="small" /> : <Text style={modal.btnConfirmText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  )
}

// ── Componente fila de info ──────────────────────────────
function InfoRow({ icon, label, value, isLast }: { icon: string; label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[infoRowStyles.row, !isLast && infoRowStyles.rowBorder]}>
      <View style={infoRowStyles.iconWrap}>
        <Ionicons name={icon as any} size={15} color="#6b8082" />
      </View>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={infoRowStyles.value} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const infoRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f5' },
  iconWrap: { width: 28, alignItems: 'center' },
  label: { fontSize: 13, color: '#9eafb2', width: 90 },
  value: { flex: 1, fontSize: 13, color: '#1a1a2e', fontWeight: '500' },
})

// ── DateTimePicker styles ────────────────────────────────
const dpStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7f8',
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  placeholder: { color: '#aaa' },
  icon: { color: '#aaa', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a6470', marginBottom: 16, textAlign: 'center' },
  secLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  spin: { alignItems: 'center', minWidth: 60 },
  spinLabel: { fontSize: 10, color: '#aaa', marginBottom: 4, fontWeight: '600' },
  spinBtn: { padding: 8 },
  spinArrow: { fontSize: 16, color: '#1a6470' },
  spinValue: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginVertical: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  btnCancel: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  btnCancelText: { color: '#555', fontWeight: '600', fontSize: 13 },
  btnConfirm: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a6470' },
  btnConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})

// ── Main styles ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  content: { paddingBottom: 56 },

  // Hero
  hero: {
    paddingTop: 52,
    paddingBottom: 0,
    paddingHorizontal: 20,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heroBack: { padding: 4 },
  heroEdit: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  heroEditText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  heroBody: { alignItems: 'center', paddingBottom: 20 },
  heroAvatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroAvatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  heroNombre: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  heroEmpresa: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 10 },
  heroBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  heroBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  heroActions: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: -20, paddingVertical: 4,
  },
  heroActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  heroActionText: { fontSize: 14, fontWeight: '700' },

  // Sections
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6b8082',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1a6470', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  sectionBtnText: { color: '#1a6470', fontSize: 12, fontWeight: '600' },

  // Info card
  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  notasCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 10,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  notasHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  notasLabel: { fontSize: 12, fontWeight: '600', color: '#6b8082' },
  notasText: { fontSize: 13, color: '#4a5568', lineHeight: 20, fontStyle: 'italic' },

  // WA card
  waCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  waRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  waRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f5' },
  waIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#e8f4f5', alignItems: 'center', justifyContent: 'center' },
  waLabel: { flex: 1, fontSize: 13, color: '#1a1a2e', fontWeight: '500' },

  // Pipeline chips
  estadoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#fff',
  },
  estadoDot: { width: 7, height: 7, borderRadius: 4 },
  estadoChipText: { fontSize: 12 },

  // Recordatorios
  recCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 8, gap: 12,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
  },
  recCardVencido: { backgroundColor: '#fff8f8' },
  recIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  recTituloVencido: { color: '#c0392b' },
  recFecha: { fontSize: 12, color: '#9eafb2' },
  recDesc: { fontSize: 12, color: '#666', marginTop: 3 },
  recVencidoTag: { fontSize: 11, color: '#c0392b', fontWeight: '700', marginTop: 4 },
  recCompletarBtn: { padding: 4 },
  recCompletadosLabel: { fontSize: 12, color: '#bbb', marginTop: 4, textAlign: 'center' },

  // Timeline
  timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLeft: { alignItems: 'center', width: 34 },
  timelineDot: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, flexShrink: 0,
  },
  timelineLine: { width: 1.5, flex: 1, backgroundColor: '#e0e8ea', marginTop: 4, marginBottom: 4 },
  timelineBody: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  timelineDesc: { fontSize: 13, color: '#2d3748', lineHeight: 19 },
  timelineFecha: { fontSize: 11, color: '#9eafb2', marginTop: 4 },

  emptyText: { fontSize: 13, color: '#c0cdd0', marginBottom: 8 },

  btnEliminar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 32,
    borderWidth: 1, borderColor: '#fbc9c9', borderRadius: 14, paddingVertical: 14,
    backgroundColor: '#fff8f8',
  },
  btnEliminarText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
})

// ── Modal styles ─────────────────────────────────────────
const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetScroll: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  sheetContent: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b8082', marginBottom: 6 },
  input: {
    backgroundColor: '#f5f7f8', borderRadius: 12, borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a2e', marginBottom: 14,
  },
  textarea: {
    backgroundColor: '#f5f7f8', borderRadius: 12, borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a2e', height: 100, marginBottom: 14,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#e0e8ea', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fafbfc',
  },
  chipText: { fontSize: 13, color: '#6b8082' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end' },
  btnCancel: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: '#f0f3f5' },
  btnCancelText: { color: '#555', fontWeight: '600', fontSize: 14 },
  btnConfirm: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 10, backgroundColor: '#1a6470' },
  btnConfirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
