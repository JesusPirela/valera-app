import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Platform, FlatList,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from './crm'

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
  { value: 'nota',             label: 'Nota' },
  { value: 'llamada',          label: 'Llamada' },
  { value: 'mensaje',          label: 'Mensaje' },
  { value: 'visita',           label: 'Visita' },
]

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

// ── Date picker (mismo que cliente-form) ─────────────────
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
              <Spin label="Día" value={temp.getDate()} onUp={() => adj('date', 1)} onDown={() => adj('date', -1)} />
              <Spin label="Mes" value={temp.toLocaleString('es-MX', { month: 'short' })} onUp={() => adj('month', 1)} onDown={() => adj('month', -1)} />
              <Spin label="Año" value={temp.getFullYear()} onUp={() => adj('year', 1)} onDown={() => adj('year', -1)} />
            </View>
            <Text style={dpStyles.secLabel}>Hora</Text>
            <View style={dpStyles.row}>
              <Spin label="Hora" value={String(temp.getHours()).padStart(2, '0')} onUp={() => adj('hour', 1)} onDown={() => adj('hour', -1)} />
              <Spin label="Min" value={String(temp.getMinutes()).padStart(2, '0')} onUp={() => adj('minute', 5)} onDown={() => adj('minute', -5)} />
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

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacciones, setInteracciones] = useState<Interaccion[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)

  // Modal agregar interacción
  const [modalInteraccion, setModalInteraccion] = useState(false)
  const [tipoInteraccion, setTipoInteraccion] = useState('nota')
  const [textoInteraccion, setTextoInteraccion] = useState('')
  const [guardandoInteraccion, setGuardandoInteraccion] = useState(false)

  // Modal agregar recordatorio
  const [modalRecordatorio, setModalRecordatorio] = useState(false)
  const [tituloRec, setTituloRec] = useState('')
  const [descRec, setDescRec] = useState('')
  const [fechaRec, setFechaRec] = useState<Date | null>(null)
  const [guardandoRec, setGuardandoRec] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data: c }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('interacciones').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
      supabase.from('recordatorios').select('*').eq('cliente_id', id).order('fecha_hora', { ascending: true }),
    ])
    if (c) setCliente(c)
    setInteracciones(i ?? [])
    setRecordatorios(r ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, [id]))

  async function cambiarEstado(nuevoEstado: string) {
    if (!cliente || nuevoEstado === cliente.estado) return
    const estadoAnterior = ESTADOS[cliente.estado]?.label ?? cliente.estado
    const estadoNuevo = ESTADOS[nuevoEstado]?.label ?? nuevoEstado

    const { error } = await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', id)
    if (error) { Alert.alert('Error', error.message); return }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('interacciones').insert({
      cliente_id: id,
      user_id: user!.id,
      tipo: 'estado_cambiado',
      descripcion: `Estado cambiado de "${estadoAnterior}" a "${estadoNuevo}".`,
    })

    setCliente((prev) => prev ? { ...prev, estado: nuevoEstado } : prev)
    cargar()
  }

  async function agregarInteraccion() {
    if (!textoInteraccion.trim()) { Alert.alert('Requerido', 'Escribe una descripción.'); return }
    setGuardandoInteraccion(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('interacciones').insert({
      cliente_id: id,
      user_id: user!.id,
      tipo: tipoInteraccion,
      descripcion: textoInteraccion.trim(),
    })
    setGuardandoInteraccion(false)
    if (error) { Alert.alert('Error', error.message); return }
    setTextoInteraccion('')
    setTipoInteraccion('nota')
    setModalInteraccion(false)
    cargar()
  }

  async function agregarRecordatorio() {
    if (!tituloRec.trim()) { Alert.alert('Requerido', 'El título es obligatorio.'); return }
    if (!fechaRec) { Alert.alert('Requerido', 'Selecciona una fecha y hora.'); return }
    setGuardandoRec(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('recordatorios').insert({
      cliente_id: id,
      user_id: user!.id,
      titulo: tituloRec.trim(),
      descripcion: descRec.trim() || null,
      fecha_hora: fechaRec.toISOString(),
    })
    setGuardandoRec(false)
    if (error) { Alert.alert('Error', error.message); return }
    setTituloRec('')
    setDescRec('')
    setFechaRec(null)
    setModalRecordatorio(false)
    cargar()
  }

  async function completarRecordatorio(recId: string) {
    await supabase.from('recordatorios').update({ completado: true }).eq('id', recId)
    setRecordatorios((prev) => prev.map((r) => r.id === recId ? { ...r, completado: true } : r))
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

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!cliente) return <View style={styles.container}><Text style={{ padding: 24, color: '#aaa' }}>Cliente no encontrado.</Text></View>

  const info = ESTADOS[cliente.estado] ?? { label: cliente.estado, color: '#555', bg: '#eee' }
  const recPendientes = recordatorios.filter((r) => !r.completado)
  const recCompletados = recordatorios.filter((r) => r.completado)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header cliente */}
      <View style={styles.clienteCard}>
        <View style={styles.clienteTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.clienteNombre}>{cliente.nombre}</Text>
            {cliente.empresa ? <Text style={styles.clienteEmpresa}>{cliente.empresa}</Text> : null}
          </View>
          <TouchableOpacity
            style={styles.btnEditar}
            onPress={() => router.push(`/(prospectador)/cliente-form?id=${id}`)}
          >
            <Text style={styles.btnEditarText}>Editar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tel:</Text>
          <Text style={styles.infoValue}>{cliente.telefono}</Text>
        </View>
        {cliente.email ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{cliente.email}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fuente:</Text>
          <Text style={styles.infoValue}>{FUENTE_LABELS[cliente.fuente_lead] ?? cliente.fuente_lead}</Text>
        </View>
        {cliente.tipo_operacion ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Busca en:</Text>
            <Text style={styles.infoValue}>{cliente.tipo_operacion === 'venta' ? 'Venta' : 'Renta'}</Text>
          </View>
        ) : null}
        {cliente.zona_busqueda ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Zona:</Text>
            <Text style={styles.infoValue}>{cliente.zona_busqueda}</Text>
          </View>
        ) : null}
        {cliente.tipo_credito ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Crédito:</Text>
            <Text style={styles.infoValue}>{CREDITO_LABELS[cliente.tipo_credito] ?? cliente.tipo_credito}</Text>
          </View>
        ) : null}
        {cliente.presupuesto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Presupuesto:</Text>
            <Text style={styles.infoValue}>{cliente.presupuesto}</Text>
          </View>
        ) : null}
        {cliente.proximo_contacto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Próx. contacto:</Text>
            <Text style={styles.infoValue}>{formatFechaHora(cliente.proximo_contacto)}</Text>
          </View>
        ) : null}
        {cliente.notas ? (
          <View style={[styles.infoRow, { marginTop: 4 }]}>
            <Text style={styles.notas}>{cliente.notas}</Text>
          </View>
        ) : null}
      </View>

      {/* Pipeline — cambio de estado */}
      <Text style={styles.secTitle}>Etapa de venta</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.estadosScroll}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
          {ORDEN_ESTADOS.map((e) => {
            const ei = ESTADOS[e] ?? { label: e, color: '#555', bg: '#eee' }
            const activo = cliente.estado === e
            return (
              <TouchableOpacity
                key={e}
                style={[
                  styles.estadoChip,
                  { borderColor: ei.color },
                  activo && { backgroundColor: ei.bg },
                ]}
                onPress={() => cambiarEstado(e)}
              >
                {activo && <View style={[styles.estadoDot, { backgroundColor: ei.color }]} />}
                <Text style={[styles.estadoChipText, { color: activo ? ei.color : '#aaa' }, activo && { fontWeight: '700' }]}>
                  {ei.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Recordatorios */}
      <View style={styles.secHeader}>
        <Text style={styles.secTitle}>Recordatorios</Text>
        <TouchableOpacity style={styles.secBtn} onPress={() => setModalRecordatorio(true)}>
          <Text style={styles.secBtnText}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      {recPendientes.length === 0 && (
        <Text style={styles.emptyText}>Sin recordatorios pendientes.</Text>
      )}
      {recPendientes.map((r) => {
        const vencido = new Date(r.fecha_hora) < new Date()
        return (
          <View key={r.id} style={[styles.recCard, vencido && styles.recCardVencido]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recTitulo, vencido && styles.recTituloVencido]}>{r.titulo}</Text>
              <Text style={styles.recFecha}>{formatFechaHora(r.fecha_hora)}</Text>
              {r.descripcion ? <Text style={styles.recDesc}>{r.descripcion}</Text> : null}
              {vencido && <Text style={styles.recVencidoLabel}>Vencido</Text>}
            </View>
            <TouchableOpacity style={styles.recCompletarBtn} onPress={() => completarRecordatorio(r.id)}>
              <Text style={styles.recCompletarText}>Completar</Text>
            </TouchableOpacity>
          </View>
        )
      })}
      {recCompletados.length > 0 && (
        <Text style={styles.recCompletadosLabel}>
          {recCompletados.length} recordatorio{recCompletados.length > 1 ? 's' : ''} completado{recCompletados.length > 1 ? 's' : ''}
        </Text>
      )}

      {/* Historial de interacciones */}
      <View style={styles.secHeader}>
        <Text style={styles.secTitle}>Historial</Text>
        <TouchableOpacity style={styles.secBtn} onPress={() => setModalInteraccion(true)}>
          <Text style={styles.secBtnText}>+ Registrar</Text>
        </TouchableOpacity>
      </View>

      {interacciones.length === 0 ? (
        <Text style={styles.emptyText}>Sin actividad registrada aún.</Text>
      ) : (
        interacciones.map((item) => (
          <View key={item.id} style={styles.interaccionRow}>
            <Text style={styles.interaccionIcon}>{TIPO_ICON[item.tipo] ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.interaccionDesc}>{item.descripcion}</Text>
              <Text style={styles.interaccionFecha}>{tiempoRelativo(item.created_at)}</Text>
            </View>
          </View>
        ))
      )}

      {/* Eliminar cliente */}
      <TouchableOpacity style={styles.btnEliminar} onPress={eliminarCliente}>
        <Text style={styles.btnEliminarText}>Eliminar cliente</Text>
      </TouchableOpacity>

      {/* ── Modal: Agregar interacción ─────────────────── */}
      <Modal visible={modalInteraccion} transparent animationType="slide">
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <Text style={modal.title}>Registrar actividad</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {TIPOS_INTERACCION.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[modal.chip, tipoInteraccion === t.value && modal.chipActivo]}
                    onPress={() => setTipoInteraccion(t.value)}
                  >
                    <Text style={[modal.chipText, tipoInteraccion === t.value && modal.chipTextActivo]}>
                      {TIPO_ICON[t.value]} {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TextInput
              style={modal.textarea}
              value={textoInteraccion}
              onChangeText={setTextoInteraccion}
              placeholder="¿Qué pasó en esta interacción?"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />

            <View style={modal.actions}>
              <TouchableOpacity style={modal.btnCancel} onPress={() => { setModalInteraccion(false); setTextoInteraccion('') }}>
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnConfirm, guardandoInteraccion && { opacity: 0.6 }]}
                onPress={agregarInteraccion}
                disabled={guardandoInteraccion}
              >
                {guardandoInteraccion
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modal.btnConfirmText}>Guardar</Text>
                }
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
            <TextInput
              style={modal.input}
              value={tituloRec}
              onChangeText={setTituloRec}
              placeholder="Ej: Llamar para confirmar cita"
              autoFocus
            />

            <Text style={modal.fieldLabel}>Descripción</Text>
            <TextInput
              style={[modal.input, { height: 72, textAlignVertical: 'top' }]}
              value={descRec}
              onChangeText={setDescRec}
              placeholder="Detalles adicionales (opcional)"
              multiline
            />

            <DateTimePicker
              label="Fecha y hora *"
              value={fechaRec}
              onChange={setFechaRec}
            />

            <View style={modal.actions}>
              <TouchableOpacity
                style={modal.btnCancel}
                onPress={() => { setModalRecordatorio(false); setTituloRec(''); setDescRec(''); setFechaRec(null) }}
              >
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.btnConfirm, guardandoRec && { opacity: 0.6 }]}
                onPress={agregarRecordatorio}
                disabled={guardandoRec}
              >
                {guardandoRec
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modal.btnConfirmText}>Guardar</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  )
}

// ── Estilos DateTimePicker ───────────────────────────────
const dpStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5',
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  placeholder: { color: '#aaa' },
  icon: { color: '#aaa', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '88%',
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

// ── Estilos pantalla ─────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 48 },
  clienteCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#eee',
  },
  clienteTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  clienteNombre: { fontSize: 20, fontWeight: '800', color: '#1a1a2e' },
  clienteEmpresa: { fontSize: 13, color: '#888', marginTop: 2 },
  btnEditar: {
    borderWidth: 1, borderColor: '#1a6470', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8,
  },
  btnEditarText: { color: '#1a6470', fontWeight: '600', fontSize: 13 },
  infoRow: { flexDirection: 'row', marginBottom: 4, flexWrap: 'wrap' },
  infoLabel: { fontSize: 13, color: '#aaa', fontWeight: '600', width: 110 },
  infoValue: { fontSize: 13, color: '#333', flex: 1 },
  notas: { fontSize: 13, color: '#666', fontStyle: 'italic', lineHeight: 19 },
  secTitle: {
    fontSize: 12, fontWeight: '700', color: '#1a6470', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 10, marginTop: 4,
  },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 16 },
  secBtn: { borderWidth: 1, borderColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  secBtnText: { color: '#1a6470', fontWeight: '600', fontSize: 12 },
  estadosScroll: { marginBottom: 16 },
  estadoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#fff',
  },
  estadoDot: { width: 7, height: 7, borderRadius: 4 },
  estadoChipText: { fontSize: 12 },
  recCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#e0f4f5', gap: 10,
  },
  recCardVencido: { borderColor: '#fde8e8', backgroundColor: '#fff8f8' },
  recTitulo: { fontSize: 14, fontWeight: '700', color: '#1a6470', marginBottom: 2 },
  recTituloVencido: { color: '#c0392b' },
  recFecha: { fontSize: 12, color: '#888' },
  recDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  recVencidoLabel: { fontSize: 11, color: '#c0392b', fontWeight: '600', marginTop: 3 },
  recCompletarBtn: {
    borderWidth: 1, borderColor: '#1a6470', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  recCompletarText: { color: '#1a6470', fontSize: 12, fontWeight: '600' },
  recCompletadosLabel: { fontSize: 12, color: '#bbb', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#bbb', marginBottom: 12 },
  interaccionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#eee',
  },
  interaccionIcon: { fontSize: 18 },
  interaccionDesc: { fontSize: 13, color: '#333', lineHeight: 19 },
  interaccionFecha: { fontSize: 11, color: '#bbb', marginTop: 3 },
  btnEliminar: {
    marginTop: 32, borderWidth: 1, borderColor: '#c0392b',
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  btnEliminarText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
})

// ── Estilos modal ────────────────────────────────────────
const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  sheetScroll: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  sheetContent: { padding: 24, paddingBottom: 36 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a6470', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#f5f5f5', borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e', marginBottom: 14,
  },
  textarea: {
    backgroundColor: '#f5f5f5', borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e',
    height: 100, marginBottom: 14,
  },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff',
  },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActivo: { color: '#fff', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, justifyContent: 'flex-end' },
  btnCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0' },
  btnCancelText: { color: '#555', fontWeight: '600' },
  btnConfirm: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1a6470' },
  btnConfirmText: { color: '#fff', fontWeight: '700' },
})
