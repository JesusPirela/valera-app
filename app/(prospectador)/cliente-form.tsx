import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Modal, Platform,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from './crm'

// ── Fuentes de lead ──────────────────────────────────────
const FUENTES = [
  { value: 'referido',       label: 'Referido' },
  { value: 'redes_sociales', label: 'Redes sociales' },
  { value: 'sitio_web',      label: 'Sitio web' },
  { value: 'llamada_fria',   label: 'Llamada fría' },
  { value: 'evento',         label: 'Evento' },
  { value: 'otro',           label: 'Otro' },
]

const ORDEN_ESTADOS = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

// ── Date picker custom ───────────────────────────────────
function DateTimePicker({
  value, onChange, label,
}: {
  value: Date | null
  onChange: (d: Date | null) => void
  label: string
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

  function confirmar() {
    onChange(temp)
    setOpen(false)
  }

  function quitar() {
    onChange(null)
    setOpen(false)
  }

  const displayStr = value
    ? value.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha'

  return (
    <>
      <Text style={dpStyles.label}>{label}</Text>
      <TouchableOpacity style={dpStyles.trigger} onPress={() => { setTemp(value ?? new Date()); setOpen(true) }}>
        <Text style={[dpStyles.triggerText, !value && dpStyles.triggerPlaceholder]}>
          {displayStr}
        </Text>
        <Text style={dpStyles.triggerIcon}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <View style={dpStyles.overlay}>
          <View style={dpStyles.modal}>
            <Text style={dpStyles.modalTitle}>Seleccionar fecha y hora</Text>

            {/* Fecha */}
            <Text style={dpStyles.sectionLabel}>Fecha</Text>
            <View style={dpStyles.row}>
              <SpinField label="Día" value={temp.getDate()} onUp={() => adj('date', 1)} onDown={() => adj('date', -1)} />
              <SpinField label="Mes" value={temp.toLocaleString('es-MX', { month: 'short' })} onUp={() => adj('month', 1)} onDown={() => adj('month', -1)} />
              <SpinField label="Año" value={temp.getFullYear()} onUp={() => adj('year', 1)} onDown={() => adj('year', -1)} />
            </View>

            {/* Hora */}
            <Text style={dpStyles.sectionLabel}>Hora</Text>
            <View style={dpStyles.row}>
              <SpinField
                label="Hora"
                value={String(temp.getHours()).padStart(2, '0')}
                onUp={() => adj('hour', 1)}
                onDown={() => adj('hour', -1)}
              />
              <SpinField
                label="Min"
                value={String(temp.getMinutes()).padStart(2, '0')}
                onUp={() => adj('minute', 5)}
                onDown={() => adj('minute', -5)}
              />
            </View>

            <View style={dpStyles.actions}>
              {value && (
                <TouchableOpacity style={dpStyles.btnQuitar} onPress={quitar}>
                  <Text style={dpStyles.btnQuitarText}>Quitar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={dpStyles.btnCancelar} onPress={() => setOpen(false)}>
                <Text style={dpStyles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dpStyles.btnConfirmar} onPress={confirmar}>
                <Text style={dpStyles.btnConfirmarText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function SpinField({ label, value, onUp, onDown }: {
  label: string; value: string | number; onUp: () => void; onDown: () => void
}) {
  return (
    <View style={dpStyles.spinField}>
      <Text style={dpStyles.spinLabel}>{label}</Text>
      <TouchableOpacity style={dpStyles.spinBtn} onPress={onUp}>
        <Text style={dpStyles.spinBtnText}>▲</Text>
      </TouchableOpacity>
      <Text style={dpStyles.spinValue}>{value}</Text>
      <TouchableOpacity style={dpStyles.spinBtn} onPress={onDown}>
        <Text style={dpStyles.spinBtnText}>▼</Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Chip selector ────────────────────────────────────────
function ChipSelector<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { value: T; label: string; color?: string; bg?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {options.map((opt) => {
            const activo = value === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  activo && (opt.bg
                    ? { backgroundColor: opt.bg, borderColor: opt.color ?? '#1a6470' }
                    : styles.chipActivo),
                ]}
                onPress={() => onChange(opt.value)}
              >
                <Text style={[
                  styles.chipText,
                  activo && (opt.color ? { color: opt.color, fontWeight: '700' } : styles.chipTextActivo),
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

// ── Pantalla principal ───────────────────────────────────
export default function ClienteForm() {
  const params = useLocalSearchParams<{ id?: string }>()
  const esEdicion = !!params.id

  const [loading, setLoading] = useState(esEdicion)
  const [guardando, setGuardando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [fuente, setFuente] = useState<string>('otro')
  const [estado, setEstado] = useState<string>('por_perfilar')
  const [notas, setNotas] = useState('')
  const [proximoContacto, setProximoContacto] = useState<Date | null>(null)

  useEffect(() => {
    if (!esEdicion) return
    supabase
      .from('clientes')
      .select('*')
      .eq('id', params.id!)
      .single()
      .then(({ data }) => {
        if (data) {
          setNombre(data.nombre ?? '')
          setTelefono(data.telefono ?? '')
          setEmail(data.email ?? '')
          setEmpresa(data.empresa ?? '')
          setFuente(data.fuente_lead ?? 'otro')
          setEstado(data.estado ?? 'por_perfilar')
          setNotas(data.notas ?? '')
          setProximoContacto(data.proximo_contacto ? new Date(data.proximo_contacto) : null)
        }
        setLoading(false)
      })
  }, [])

  async function guardar() {
    if (!nombre.trim()) { Alert.alert('Campo requerido', 'El nombre es obligatorio.'); return }
    if (!telefono.trim()) { Alert.alert('Campo requerido', 'El teléfono es obligatorio.'); return }

    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabase.from('profiles').select('nombre').eq('id', user!.id).single()
    const nombreProspectador = perfil?.nombre ?? 'Un prospectador'

    const payload = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email.trim() || null,
      empresa: empresa.trim() || null,
      fuente_lead: fuente,
      estado,
      notas: notas.trim() || null,
      proximo_contacto: proximoContacto?.toISOString() ?? null,
    }

    if (esEdicion) {
      const { error } = await supabase.from('clientes').update(payload).eq('id', params.id!)
      if (error) { Alert.alert('Error', error.message); setGuardando(false); return }

      // Registrar en historial
      await supabase.from('interacciones').insert({
        cliente_id: params.id!,
        user_id: user!.id,
        tipo: 'nota',
        descripcion: 'Información del cliente actualizada.',
      })
    } else {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ ...payload, responsable_id: user!.id })
        .select('id')
        .single()
      if (error) { Alert.alert('Error', error.message); setGuardando(false); return }

      // Registrar creación en historial + notificar a admins
      if (data) {
        await supabase.from('interacciones').insert({
          cliente_id: data.id,
          user_id: user!.id,
          tipo: 'nota',
          descripcion: 'Cliente registrado en el CRM.',
        })
        await supabase.rpc('notificar_admins_nuevo_cliente', {
          p_cliente_nombre: nombre.trim(),
          p_cliente_id: data.id,
          p_prospectador_nombre: nombreProspectador,
        })
      }
    }

    setGuardando(false)
    router.back()
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>{esEdicion ? 'Editar cliente' : 'Nuevo cliente'}</Text>

      {/* Datos básicos */}
      <Text style={styles.sectionTitle}>Datos de contacto</Text>

      <Text style={styles.fieldLabel}>Nombre *</Text>
      <TextInput
        style={styles.input}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Nombre completo"
        autoCapitalize="words"
      />

      <Text style={styles.fieldLabel}>Teléfono *</Text>
      <TextInput
        style={styles.input}
        value={telefono}
        onChangeText={setTelefono}
        placeholder="442 000 0000"
        keyboardType="phone-pad"
      />

      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="correo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.fieldLabel}>Empresa</Text>
      <TextInput
        style={styles.input}
        value={empresa}
        onChangeText={setEmpresa}
        placeholder="Nombre de la empresa (opcional)"
        autoCapitalize="words"
      />

      {/* Estado */}
      <Text style={styles.sectionTitle}>Etapa de venta</Text>
      <ChipSelector
        label="Estado"
        options={ORDEN_ESTADOS.map((e) => ({
          value: e,
          label: ESTADOS[e]?.label ?? e,
          color: ESTADOS[e]?.color,
          bg: ESTADOS[e]?.bg,
        }))}
        value={estado}
        onChange={setEstado}
      />

      {/* Fuente */}
      <Text style={styles.sectionTitle}>Origen del lead</Text>
      <ChipSelector
        label="Fuente"
        options={FUENTES.map((f) => ({ value: f.value, label: f.label }))}
        value={fuente}
        onChange={setFuente}
      />

      {/* Próxima acción */}
      <Text style={styles.sectionTitle}>Seguimiento</Text>
      <DateTimePicker
        label="Próxima acción"
        value={proximoContacto}
        onChange={setProximoContacto}
      />

      {/* Notas */}
      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Notas</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        value={notas}
        onChangeText={setNotas}
        placeholder="Observaciones sobre este cliente..."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Guardar */}
      <TouchableOpacity
        style={[styles.btnGuardar, guardando && styles.btnGuardarDisabled]}
        onPress={guardar}
        disabled={guardando}
      >
        {guardando
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnGuardarText}>{esEdicion ? 'Guardar cambios' : 'Registrar cliente'}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnCancelar} onPress={() => router.back()}>
        <Text style={styles.btnCancelarText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ── Estilos DateTimePicker ───────────────────────────────
const dpStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  triggerPlaceholder: { color: '#aaa' },
  triggerIcon: { color: '#aaa', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a6470', marginBottom: 16, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  spinField: { alignItems: 'center', minWidth: 60 },
  spinLabel: { fontSize: 10, color: '#aaa', marginBottom: 4, fontWeight: '600' },
  spinBtn: { padding: 8 },
  spinBtnText: { fontSize: 16, color: '#1a6470' },
  spinValue: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginVertical: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  btnQuitar: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#c0392b' },
  btnQuitarText: { color: '#c0392b', fontWeight: '600', fontSize: 13 },
  btnCancelar: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  btnCancelarText: { color: '#555', fontWeight: '600', fontSize: 13 },
  btnConfirmar: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a6470' },
  btnConfirmarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})

// ── Estilos pantalla ─────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, paddingBottom: 48 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#1a6470', marginBottom: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#1a6470', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 12, marginTop: 4,
    borderBottomWidth: 1, borderBottomColor: '#dde8e9', paddingBottom: 6,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 14,
  },
  inputMulti: { height: 100, textAlignVertical: 'top' },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#fff',
  },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActivo: { color: '#fff', fontWeight: '700' },
  btnGuardar: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  btnGuardarDisabled: { opacity: 0.6 },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnCancelar: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  btnCancelarText: { color: '#aaa', fontSize: 14 },
})
