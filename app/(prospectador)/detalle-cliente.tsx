import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Platform, Linking,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ESTADOS, ETAPAS_CLIENTE } from './crm'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { registrarAccion } from '../../lib/gamification'
import { programarRecordatorios } from '../../lib/notificaciones-locales'
import { OfflineBanner } from '../../components/OfflineBanner'
import { Ionicons } from '@expo/vector-icons'

type Cliente = {
  id: string; nombre: string; telefono: string; email: string | null
  empresa: string | null; fuente_lead: string; estado: string
  tipo_operacion: string | null; tipo_credito: string | null; presupuesto: string | null
  zona_busqueda: string | null; notas: string | null; proximo_contacto: string | null
  created_at: string; responsable_id: string
}

type Interaccion = { id: string; tipo: string; descripcion: string; created_at: string }

type Recordatorio = {
  id: string; titulo: string; descripcion: string | null
  fecha_hora: string; completado: boolean; notificado: boolean
}

const TIPOS_INTERACCION = [
  { value: 'nota', label: 'Nota' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'mensaje', label: 'Mensaje' },
  { value: 'visita', label: 'Visita' },
]

const FUENTE_LABELS: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko', campana_fb: 'Campaña FB',
  grupo_fb: 'Grupo FB', otro: 'Otro', referido: 'Referido',
  redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
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

// ── DateTimePicker ───────────────────────────────────────
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
      // Hora y minutos dan la vuelta DENTRO del mismo día: pasar de 23 a 0 (o de
      // 0 a 23) ya no cambia la fecha, que era lo confuso. Módulo sin acarreo.
      if (field === 'hour')   d.setHours((d.getHours() + delta + 24) % 24)
      if (field === 'minute') d.setMinutes((d.getMinutes() + delta + 60) % 60)
      // No permitir fechas/horas anteriores al presente
      const ahora = new Date()
      if (d.getTime() < ahora.getTime()) return ahora
      return d
    })
  }

  const displayStr = value
    ? value.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha'

  return (
    <>
      <Text style={dpStyles.label}>{label}</Text>
      <TouchableOpacity style={dpStyles.trigger} onPress={() => {
        let b: Date
        if (value) {
          b = new Date(value)
          b.setMinutes(Math.round(b.getMinutes() / 5) * 5, 0, 0)
        } else {
          // Sin fecha previa: arrancar a las 7:00 am (mañana si las 7 de hoy ya pasaron).
          b = new Date(); b.setHours(7, 0, 0, 0)
          if (b.getTime() < Date.now()) b.setDate(b.getDate() + 1)
        }
        setTemp(b); setOpen(true)
      }}>
        <Text style={[dpStyles.triggerText, !value && dpStyles.placeholder]}>{displayStr}</Text>
        <Text style={dpStyles.icon}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <View style={dpStyles.overlay}>
          <View style={dpStyles.modal}>
            <Text style={dpStyles.modalTitle}>Fecha y hora</Text>
            <Text style={dpStyles.secLabel}>Fecha</Text>
            <View style={dpStyles.row}>
              <Spin label="Día"  value={temp.getDate()} onUp={() => adj('date', 1)}  onDown={() => adj('date', -1)} />
              <Spin label="Mes"  value={temp.toLocaleString('es-MX', { month: 'short' })} onUp={() => adj('month', 1)} onDown={() => adj('month', -1)} />
              <Spin label="Año"  value={temp.getFullYear()} onUp={() => adj('year', 1)}  onDown={() => adj('year', -1)} />
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

// ── SectionTitle ─────────────────────────────────────────
function SectionTitle({ icon, label, accentColor }: { icon: string; label: string; accentColor: string }) {
  return (
    <View style={stStyles.row}>
      <View style={[stStyles.bar, { backgroundColor: accentColor }]} />
      <Ionicons name={icon as any} size={15} color={accentColor} />
      <Text style={stStyles.text}>{label}</Text>
    </View>
  )
}
const stStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bar: { width: 3, height: 16, borderRadius: 2 },
  text: { fontSize: 13, fontWeight: '800', color: '#1a1a2e', letterSpacing: 0.2 },
})

// ── InfoRow ──────────────────────────────────────────────
function InfoRow({ icon, label, value, isLast, accentColor }: {
  icon: string; label: string; value: string; isLast?: boolean; accentColor: string
}) {
  return (
    <View style={[irStyles.row, !isLast && irStyles.rowBorder]}>
      <View style={[irStyles.iconWrap, { backgroundColor: accentColor + '18' }]}>
        <Ionicons name={icon as any} size={14} color={accentColor} />
      </View>
      <Text style={irStyles.label}>{label}</Text>
      <Text style={irStyles.value} numberOfLines={2}>{value}</Text>
    </View>
  )
}
const irStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f5' },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, color: '#9eafb2', width: 88 },
  value: { flex: 1, fontSize: 13, color: '#1a1a2e', fontWeight: '600' },
})

// ── Pantalla principal ───────────────────────────────────
export default function DetalleCliente() {
  const c = useColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    // Sufijo 'v2': ver nota en (prospectador)/crm.tsx — invalida caché en
    // disco de antes de restringir la RLS de clientes a supervisor/asesor.
    queryKey: ['detalle-cliente', id, 'v2'],
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
  const { refreshControl } = usePullRefresh(refetch)

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

  const [modalSeguimientoRapido, setModalSeguimientoRapido] = useState(false)
  const [tituloSeguimiento, setTituloSeguimiento] = useState('')
  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState(false)

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
    setTextoInteraccion(''); setTipoInteraccion('nota'); setModalInteraccion(false)
    refetch()
  }

  async function agregarRecordatorio() {
    if (!tituloRec.trim()) { Alert.alert('Requerido', 'El título es obligatorio.'); return }
    if (!fechaRec) { Alert.alert('Requerido', 'Selecciona una fecha y hora.'); return }
    setGuardandoRec(true)
    try {
      // getSession() lee del storage local — funciona aunque haya red inestable.
      // getUser() hace una petición de red; si falla, user es null y user!.id lanza
      // TypeError sin try/catch, silenciando el error para el usuario.
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { Alert.alert('Error', 'Sesión expirada. Vuelve a iniciar sesión.'); return }
      const { error } = await supabase.from('recordatorios').insert({
        cliente_id: id, user_id: uid, titulo: tituloRec.trim(),
        descripcion: descRec.trim() || null, fecha_hora: fechaRec.toISOString(),
      })
      if (error) { Alert.alert('Error al guardar', error.message); return }
      setTituloRec(''); setDescRec(''); setFechaRec(null); setModalRecordatorio(false)
      refetch()
    } catch (e: any) {
      Alert.alert('Error inesperado', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setGuardandoRec(false)
    }
  }

  async function aplazar15min(recId: string, fechaActual: string) {
    const nueva = new Date(new Date(fechaActual).getTime() + 15 * 60 * 1000)
    const { error } = await supabase.from('recordatorios')
      .update({ fecha_hora: nueva.toISOString() }).eq('id', recId)
    if (!error) { refetch(); programarRecordatorios() }
  }

  async function hacerManana(recId: string, fechaActual: string) {
    const base = new Date(fechaActual)
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    manana.setHours(base.getHours(), base.getMinutes(), 0, 0)
    const { error } = await supabase.from('recordatorios')
      .update({ fecha_hora: manana.toISOString() }).eq('id', recId)
    if (!error) { refetch(); programarRecordatorios() }
  }

  async function completarRecordatorio(recId: string) {
    const { error } = await supabase.from('recordatorios').update({ completado: true }).eq('id', recId)
    queryClient.setQueryData(['detalle-cliente', id, 'v2'], (old: typeof data) => {
      if (!old) return old
      return { ...old, recordatorios: old.recordatorios.map(r => r.id === recId ? { ...r, completado: true } : r) }
    })
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) registrarAccion(user.id, 'completar_seguimiento').catch(() => {})
    }
  }

  async function registrarSeguimientoRapido() {
    const titulo = tituloSeguimiento.trim() || 'Seguimiento'
    setGuardandoSeguimiento(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { Alert.alert('Error', 'Sesión expirada.'); return }
      const ahora = new Date().toISOString()
      const { error } = await supabase.from('recordatorios').insert({
        cliente_id: id, user_id: uid, titulo,
        fecha_hora: ahora, completado: true,
      })
      if (error) { Alert.alert('Error al guardar', error.message); return }
      registrarAccion(uid, 'completar_seguimiento').catch(() => {})
      setTituloSeguimiento('')
      setModalSeguimientoRapido(false)
      refetch()
    } catch (e: any) {
      Alert.alert('Error inesperado', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setGuardandoSeguimiento(false)
    }
  }

  async function eliminarCliente() {
    const volver = () => router.canGoBack() ? router.back() : router.replace('/(prospectador)/crm')
    const run = async () => {
      // RPC SECURITY DEFINER: borra de verdad y devuelve cuántas filas eliminó.
      // (Antes el DELETE directo lo bloqueaba RLS en silencio → "no se borraba".)
      const { data, error } = await supabase.rpc('eliminar_cliente', { p_id: id })
      if (error || !data || data < 1) {
        const msg = (error?.message ?? '').includes('Access denied')
          ? 'No tienes permiso para eliminar este cliente.'
          : (error?.message || 'No se pudo eliminar el cliente. Intenta de nuevo.')
        if (Platform.OS === 'web') window.alert('⚠ ' + msg)
        else Alert.alert('Error', msg)
        return
      }
      // Éxito: refrescar el CRM, confirmar y volver
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      queryClient.removeQueries({ queryKey: ['detalle-cliente', id] })
      if (Platform.OS === 'web') {
        window.alert('✓ Cliente eliminado correctamente')
        volver()
      } else {
        Alert.alert('✓ Cliente eliminado', 'El cliente se eliminó correctamente.', [
          { text: 'OK', onPress: volver },
        ])
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) run()
    } else {
      Alert.alert('Eliminar cliente', '¿Estás seguro? Esta acción no se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: run },
      ])
    }
  }

  function abrirWhatsApp(msg: string) {
    if (!cliente) return
    let phone = cliente.telefono.replace(/\D/g, '')
    if (phone.startsWith('5252')) phone = phone.slice(2)
    if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
    const tel = phone.length === 10 ? `52${phone}` : phone
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
    if (Platform.OS === 'web') window.open(url, '_blank')
    else Linking.openURL(url)
  }

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' }}>
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
  const estadoIdx = ETAPAS_CLIENTE.indexOf(cliente.estado)
  const waDefault = `Hola ${cliente.nombre}, soy tu asesor de Valera Real Estate. Te contacto para dar seguimiento a tu búsqueda de propiedad. ¿Tienes un momento para platicar?`

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
      <OfflineBanner />

      {/* ── Hero ──────────────────────────────────────── */}
      <View style={[styles.hero, { backgroundColor: info.color }]}>
        <View style={styles.heroTopRow}>
          <View />
          <TouchableOpacity
            style={styles.heroEditBtn}
            onPress={() => router.push(`/(prospectador)/cliente-form?id=${id}`)}
          >
            <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.95)" />
            <Text style={styles.heroEditText}>Editar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroBody}>
          <View style={styles.heroAvatarRing}>
            <View style={[styles.heroAvatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.heroAvatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.heroNombre}>{cliente.nombre}</Text>
          {cliente.empresa ? <Text style={styles.heroEmpresa}>{cliente.empresa}</Text> : null}
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{info.label}</Text>
          </View>
        </View>

        <View style={styles.heroStatsBar}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{interacciones.length}</Text>
            <Text style={styles.heroStatLbl}>Actividades</Text>
          </View>
          <View style={styles.heroStatSep} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{recPendientes.length}</Text>
            <Text style={styles.heroStatLbl}>Pendientes</Text>
          </View>
          <View style={styles.heroStatSep} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{estadoIdx >= 0 ? `${estadoIdx + 1}/${ETAPAS_CLIENTE.length}` : '—'}</Text>
            <Text style={styles.heroStatLbl}>Etapa</Text>
          </View>
        </View>
      </View>

      {/* ── Action bar ────────────────────────────────── */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: info.color }]}
          onPress={() => Linking.openURL(`tel:${cliente.telefono}`)}
        >
          <Ionicons name="call" size={20} color="#fff" />
          <Text style={styles.actionBtnTxt}>Llamar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#25d366' }]}
          onPress={() => abrirWhatsApp(waDefault)}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.actionBtnTxt}>WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* ── Información ─────────────────────────────────── */}
      <View style={styles.section}>
        <View style={{ marginBottom: 12 }}>
          <SectionTitle icon="person-circle-outline" label="Información" accentColor={info.color} />
        </View>
        <View style={styles.infoCard}>
          <InfoRow icon="call-outline"       label="Teléfono"    value={cliente.telefono}                                                         accentColor={info.color} />
          {cliente.email          ? <InfoRow icon="mail-outline"   label="Email"       value={cliente.email}                                      accentColor={info.color} /> : null}
          <InfoRow icon="megaphone-outline"   label="Fuente"      value={FUENTE_LABELS[cliente.fuente_lead] ?? cliente.fuente_lead}               accentColor={info.color} />
          {cliente.tipo_operacion ? <InfoRow icon="home-outline"   label="Busca en"    value={cliente.tipo_operacion === 'venta' ? 'Venta' : 'Renta'} accentColor={info.color} /> : null}
          <InfoRow icon="map-outline"    label="Zona"        value={cliente.zona_busqueda ?? '—'}                                accentColor={info.color} />
          {cliente.tipo_credito   ? <InfoRow icon="card-outline"   label="Crédito"     value={CREDITO_LABELS[cliente.tipo_credito] ?? cliente.tipo_credito} accentColor={info.color} /> : null}
          <InfoRow icon="cash-outline"   label="Presupuesto" value={cliente.presupuesto ?? '—'} isLast                          accentColor={info.color} />
        </View>
        {cliente.notas ? (
          <View style={[styles.notasCard, { borderLeftColor: info.color }]}>
            <View style={styles.notasHeader}>
              <Ionicons name="document-text-outline" size={14} color={info.color} />
              <Text style={[styles.notasLabel, { color: info.color }]}>Notas</Text>
            </View>
            <Text style={styles.notasText}>{cliente.notas}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Etapa de venta ───────────────────────────── */}
      <View style={styles.section}>
        <View style={{ marginBottom: 12 }}>
          <SectionTitle icon="git-network-outline" label="Etapa de venta" accentColor={info.color} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pipelineRow}>
            {ETAPAS_CLIENTE.map((e, i) => {
              const ei = ESTADOS[e] ?? { label: e, color: '#555', bg: '#eee' }
              const activo = cliente.estado === e
              const pasado = estadoIdx > i
              return (
                <View key={e} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Solo lectura: la etapa se cambia desde el botón Editar */}
                  <View
                    style={[
                      styles.pipelineChip,
                      activo && { backgroundColor: ei.color, borderColor: ei.color },
                      !activo && pasado && { borderColor: ei.color },
                    ]}
                  >
                    <View style={[
                      styles.pipelineNumCircle,
                      activo && { backgroundColor: 'rgba(255,255,255,0.3)' },
                      !activo && pasado && { backgroundColor: ei.color + '25' },
                    ]}>
                      {pasado && !activo
                        ? <Ionicons name="checkmark" size={10} color={ei.color} />
                        : <Text style={[styles.pipelineNum, activo && { color: '#fff' }, !pasado && !activo && { color: '#ccc' }]}>{i + 1}</Text>
                      }
                    </View>
                    <Text style={[
                      styles.pipelineLabel,
                      activo && { color: '#fff', fontWeight: '700' },
                      !activo && pasado && { color: ei.color },
                      !activo && !pasado && { color: '#aaa' },
                    ]}>
                      {ei.label}
                    </Text>
                  </View>
                  {i < ETAPAS_CLIENTE.length - 1 && (
                    <View style={[styles.pipelineConnector, pasado && { backgroundColor: ei.color }]} />
                  )}
                </View>
              )
            })}
          </View>
        </ScrollView>
      </View>

      {/* ── Mensajes rápidos ─────────────────────────── */}
      <View style={styles.section}>
        <View style={{ marginBottom: 12 }}>
          <SectionTitle icon="chatbubbles-outline" label="Mensajes rápidos" accentColor={info.color} />
        </View>
        <View style={styles.waCard}>
          {(() => {
            const proxCita = recPendientes[0]
            const horaStr = proxCita ? formatFechaHora(proxCita.fecha_hora) : '[hora pendiente]'
            const msgs = [
              { label: 'Recordatorio de cita',  icon: 'alarm-outline' as const,            iconBg: '#fff3cd', iconColor: '#e6a817',
                msg: `Hola ${cliente.nombre}, lo contacto para confirmar su cita programada para el día *${horaStr}*. ¿Podría indicarme si contaremos con su presencia? Quedo a sus órdenes para cualquier ajuste que requiera.` },
              { label: 'Compartir propiedad',    icon: 'home-outline' as const,             iconBg: '#e8f4f5', iconColor: '#1a6470',
                msg: `Hola ${cliente.nombre}, encontré una propiedad que puede interesarte. ¿Tienes unos minutos para que te cuente los detalles?` },
              { label: 'Reagendar cita',         icon: 'calendar-outline' as const,         iconBg: '#f0ebff', iconColor: '#7c3aed',
                msg: `Hola ${cliente.nombre}, para recordarte que tenemos pendiente ver la propiedad, ¿te queda bien entre semana o fin de semana?` },
              { label: 'Seguimiento post-visita',icon: 'checkmark-circle-outline' as const, iconBg: '#e8fdf0', iconColor: '#16a34a',
                msg: `Hola ${cliente.nombre}, ¿qué te pareció la propiedad que visitamos? Quedo a tus órdenes para cualquier duda.` },
            ]
            return msgs.map((t, i) => (
              <TouchableOpacity
                key={t.label}
                style={[styles.waRow, i < msgs.length - 1 && styles.waRowBorder]}
                onPress={() => abrirWhatsApp(t.msg)}
              >
                <View style={[styles.waIconWrap, { backgroundColor: t.iconBg }]}>
                  <Ionicons name={t.icon} size={16} color={t.iconColor} />
                </View>
                <Text style={styles.waLabel}>{t.label}</Text>
                <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
              </TouchableOpacity>
            ))
          })()}
        </View>
      </View>

      {/* ── Recordatorios ────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <SectionTitle icon="alarm-outline" label="Recordatorios" accentColor={info.color} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[styles.addBtn, { borderColor: '#16a34a', backgroundColor: '#f0fdf4' }]}
              onPress={() => { setTituloSeguimiento(''); setModalSeguimientoRapido(true) }}
            >
              <Ionicons name="checkmark-done-outline" size={14} color="#16a34a" />
              <Text style={[styles.addBtnText, { color: '#16a34a' }]}>Seguimiento rápido</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addBtn, { borderColor: info.color }]} onPress={() => setModalRecordatorio(true)}>
              <Ionicons name="add" size={14} color={info.color} />
              <Text style={[styles.addBtnText, { color: info.color }]}>Agendar</Text>
            </TouchableOpacity>
          </View>
        </View>
        {recPendientes.length === 0 ? (
          <Text style={styles.emptyText}>Sin recordatorios pendientes.</Text>
        ) : null}
        {recPendientes.map((r) => {
          const vencido = new Date(r.fecha_hora) < new Date()
          return (
            <View key={r.id} style={[styles.recCard, { borderLeftColor: vencido ? '#e53935' : info.color }]}>
              <View style={[styles.recIconWrap, { backgroundColor: vencido ? '#fde8e8' : info.color + '18' }]}>
                <Ionicons name={vencido ? 'warning-outline' : 'alarm-outline'} size={18} color={vencido ? '#e53935' : info.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.recTituloRow}>
                  <Text style={[styles.recTitulo, vencido && styles.recTituloVencido]}>{r.titulo}</Text>
                  {vencido && <View style={styles.recVencidoPill}><Text style={styles.recVencidoTxt}>Vencido</Text></View>}
                </View>
                <Text style={styles.recFecha}>{formatFechaHora(r.fecha_hora)}</Text>
                {r.descripcion ? <Text style={styles.recDesc}>{r.descripcion}</Text> : null}
              </View>
              <View style={styles.recActions}>
                <TouchableOpacity style={styles.recAplazarBtn} onPress={() => aplazar15min(r.id, r.fecha_hora)}>
                  <Text style={styles.recAplazarTxt}>+15 min</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.recMananaBtn} onPress={() => hacerManana(r.id, r.fecha_hora)}>
                  <Text style={styles.recMananaTxt}>Mañana</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.recDoneBtn} onPress={() => completarRecordatorio(r.id)}>
                  <Ionicons name="checkmark-circle-outline" size={24} color={info.color} />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
        {recCompletados.length > 0 && (
          <Text style={styles.recCompletadosLabel}>
            {recCompletados.length} recordatorio{recCompletados.length > 1 ? 's' : ''} completado{recCompletados.length > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* ── Historial ────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <SectionTitle icon="time-outline" label="Historial" accentColor={info.color} />
          <TouchableOpacity style={[styles.addBtn, { borderColor: info.color }]} onPress={() => setModalInteraccion(true)}>
            <Ionicons name="add" size={14} color={info.color} />
            <Text style={[styles.addBtnText, { color: info.color }]}>Registrar</Text>
          </TouchableOpacity>
        </View>
        {interacciones.length === 0 ? (
          <Text style={styles.emptyText}>Sin actividad registrada aún.</Text>
        ) : (
          interacciones.map((item, idx) => {
            const ti = TIPO_ICON[item.tipo] ?? { icon: 'ellipse-outline', color: '#aaa' }
            const tipoLabel = TIPOS_INTERACCION.find(t => t.value === item.tipo)?.label
            return (
              <View key={item.id} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: ti.color + '20', borderColor: ti.color }]}>
                    <Ionicons name={ti.icon as any} size={14} color={ti.color} />
                  </View>
                  {idx < interacciones.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineMeta}>
                    {tipoLabel && (
                      <View style={[styles.tipoPill, { backgroundColor: ti.color + '18' }]}>
                        <Text style={[styles.tipoPillTxt, { color: ti.color }]}>{tipoLabel}</Text>
                      </View>
                    )}
                    <Text style={styles.timelineFecha}>{tiempoRelativo(item.created_at)}</Text>
                  </View>
                  <Text style={styles.timelineDesc}>{item.descripcion}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      {/* ── Eliminar ─────────────────────────────────── */}
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

      {/* ── Modal: Seguimiento rápido ─────────────────── */}
      <Modal visible={modalSeguimientoRapido} transparent animationType="slide">
        <View style={modal.overlay}>
          <View style={modal.sheetContent}>
            <Text style={modal.title}>Registrar seguimiento</Text>
            <Text style={[modal.fieldLabel, { marginBottom: 4 }]}>
              Se guarda como seguimiento completado ahora mismo.
            </Text>
            <Text style={modal.fieldLabel}>Descripción (opcional)</Text>
            <TextInput
              style={modal.input}
              value={tituloSeguimiento}
              onChangeText={setTituloSeguimiento}
              placeholder="Ej: Llamé, envié propiedades, visita realizada…"
              autoFocus
            />
            <View style={modal.actions}>
              <TouchableOpacity
                style={modal.btnCancel}
                onPress={() => { setModalSeguimientoRapido(false); setTituloSeguimiento('') }}
              >
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnConfirm, { backgroundColor: '#16a34a' }, guardandoSeguimiento && { opacity: 0.6 }]}
                onPress={registrarSeguimientoRapido} disabled={guardandoSeguimiento}
              >
                {guardandoSeguimiento
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modal.btnConfirmText}>✓ Guardar seguimiento</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

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
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  content: { paddingBottom: 60 },

  // Hero
  hero: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  heroEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  heroEditText: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '600' },
  heroBody: { alignItems: 'center', paddingBottom: 20 },
  heroAvatarRing: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroAvatar: {
    width: 82, height: 82, borderRadius: 41,
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { fontSize: 30, fontWeight: '800', color: '#fff' },
  heroNombre: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  heroEmpresa: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 10 },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  heroBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Stats strip (bottom of hero)
  heroStatsBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginHorizontal: -20, paddingVertical: 14,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  heroStatItem: { alignItems: 'center', flex: 1 },
  heroStatNum: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' },
  heroStatSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 6 },

  // Action buttons
  actionBar: {
    flexDirection: 'row', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
  },
  actionBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Sections
  section: { marginHorizontal: 16, marginTop: 24 },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  addBtnText: { fontSize: 12, fontWeight: '700' },

  // Info card
  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  notasCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 10,
    borderLeftWidth: 3,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  notasHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  notasLabel: { fontSize: 12, fontWeight: '700' },
  notasText: { fontSize: 13, color: '#4a5568', lineHeight: 20, fontStyle: 'italic' },

  // Pipeline
  pipelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 2 },
  pipelineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff',
  },
  pipelineNumCircle: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#f0f3f5', alignItems: 'center', justifyContent: 'center',
  },
  pipelineNum: { fontSize: 10, fontWeight: '800', color: '#bbb' },
  pipelineLabel: { fontSize: 11, fontWeight: '600', color: '#bbb' },
  pipelineConnector: { width: 14, height: 2, backgroundColor: '#ddd', marginHorizontal: 2 },

  // WA messages
  waCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  waRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  waRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f5' },
  waIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  waLabel: { flex: 1, fontSize: 13, color: '#1a1a2e', fontWeight: '500' },

  // Recordatorios
  recCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 8, gap: 12, borderLeftWidth: 4,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
  },
  recIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  recTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  recTituloVencido: { color: '#c0392b' },
  recFecha: { fontSize: 12, color: '#9eafb2' },
  recDesc: { fontSize: 12, color: '#666', marginTop: 3 },
  recVencidoPill: { backgroundColor: '#fde8e8', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  recVencidoTxt: { fontSize: 10, color: '#e53935', fontWeight: '700' },
  recActions:    { flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  recAplazarBtn: { backgroundColor: '#fff3cd', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#ffc107' },
  recAplazarTxt: { fontSize: 10, fontWeight: '700', color: '#856404' },
  recMananaBtn:  { backgroundColor: '#e8f4f5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#1a6470' },
  recMananaTxt:  { fontSize: 10, fontWeight: '700', color: '#1a6470' },
  recDoneBtn:    { padding: 4, flexShrink: 0 },
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
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  timelineMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tipoPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tipoPillTxt: { fontSize: 10, fontWeight: '700' },
  timelineDesc: { fontSize: 13, color: '#2d3748', lineHeight: 19 },
  timelineFecha: { fontSize: 11, color: '#9eafb2' },

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
