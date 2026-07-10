import { useState, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, Keyboard,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ESTADOS, ETAPAS_CLIENTE } from './crm'
import { registrarAccion } from '../../lib/gamification'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { enqueueClienteUpdate, enqueueClienteCreate, genUUID } from '../../lib/offline-queue'
import { useQueryClient } from '@tanstack/react-query'
import { ZonasInteresField } from '../../components/ZonasInteresField'

function mostrarError(titulo: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}: ${msg}`)
  else Alert.alert(titulo, msg)
}

// ── Fuentes de lead ──────────────────────────────────────
const FUENTES = [
  { value: 'marketplace',  label: 'Marketplace' },
  { value: 'tokko',        label: 'Tokko' },
  { value: 'campana_fb',   label: 'Campaña FB' },
  { value: 'grupo_fb',     label: 'Grupo FB' },
  { value: 'otro',         label: 'Otro' },
]

const TIPOS_CREDITO = [
  { value: 'infonavit', label: 'Infonavit' },
  { value: 'fovisste',  label: 'Fovisste' },
  { value: 'bancario',  label: 'Bancario' },
  { value: 'contado',   label: 'Contado' },
  { value: 'otro',      label: 'Otro' },
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
      // No permitir fechas/horas anteriores al presente
      const ahora = new Date()
      if (d.getTime() < ahora.getTime()) return ahora
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
      <TouchableOpacity style={dpStyles.trigger} onPress={() => { const b = new Date(value ?? new Date()); b.setMinutes(Math.round(b.getMinutes() / 5) * 5, 0, 0); setTemp(b); setOpen(true) }}>
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
  const c = useColors()
  const queryClient = useQueryClient()
  const { isOnline, refreshPending } = useOfflineSync()
  const params = useLocalSearchParams<{ id?: string; fromAdmin?: string }>()
  const esEdicion = !!params.id
  const fromAdmin = params.fromAdmin === '1'

  function irAtras() {
    if (esEdicion) {
      router.replace(((fromAdmin ? '/(admin)/detalle-cliente?id=' : '/(prospectador)/detalle-cliente?id=') + params.id) as any)
    } else {
      router.replace((fromAdmin ? '/(admin)/crm' : '/(prospectador)/crm') as any)
    }
  }

  const [loading, setLoading] = useState(esEdicion)
  const [guardando, setGuardando] = useState(false)

  // Común
  const [tipoOperacion, setTipoOperacion] = useState<'venta' | 'renta' | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fuente, setFuente] = useState<string>('otro')
  const [estado, setEstado] = useState<string>('por_perfilar')
  const estadoOriginalRef = useRef<string | null>(null)  // para otorgar coins solo al CAMBIAR de etapa
  const [notas, setNotas] = useState('')
  const [proximoContacto, setProximoContacto] = useState<Date | null>(null)

  const [nivelInteres, setNivelInteres] = useState<'alto' | 'medio' | 'bajo' | null>(null)

  // Solo Venta
  const [email, setEmail] = useState('')
  const [tipoCredito, setTipoCredito] = useState<string | null>(null)
  const [presupuesto, setPresupuesto] = useState('')
  const [zonaBusqueda, setZonaBusqueda] = useState('')

  // Solo Renta
  const [numPersonas, setNumPersonas] = useState('')
  const [tieneMascotas, setTieneMascotas] = useState<boolean | null>(null)
  const [detalleMascotas, setDetalleMascotas] = useState('')
  const [fechaMudanza, setFechaMudanza] = useState('')
  const [presupuestoRenta, setPresupuestoRenta] = useState('')
  const [zonasInteres, setZonasInteres] = useState('')
  const [problemasPoliza, setProblemasPoliza] = useState<boolean | null>(null)

  // Deja todos los campos en blanco (para "Nuevo cliente")
  function limpiarFormulario() {
    setTipoOperacion(null)
    setNombre('')
    setTelefono('')
    setFuente('otro')
    setEstado('por_perfilar')
    estadoOriginalRef.current = null
    setNotas('')
    setProximoContacto(null)
    setNivelInteres(null)
    setEmail('')
    setTipoCredito(null)
    setPresupuesto('')
    setZonaBusqueda('')
    setNumPersonas('')
    setTieneMascotas(null)
    setDetalleMascotas('')
    setFechaMudanza('')
    setPresupuestoRenta('')
    setZonasInteres('')
    setProblemasPoliza(null)
  }

  // La pantalla vive en el navegador de Tabs y NO se desmonta, así que su estado
  // persiste entre visitas. Reinicializamos en CADA foco: si hay id cargamos el
  // cliente; si no, dejamos todo en blanco (antes salían los datos del anterior).
  useFocusEffect(useCallback(() => {
    let cancelled = false
    if (!params.id) {
      limpiarFormulario()
      setLoading(false)
      return () => { cancelled = true }
    }
    setLoading(true)
    supabase
      .from('clientes')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setTipoOperacion(data.tipo_operacion ?? null)
          setNombre(data.nombre ?? '')
          setTelefono(data.telefono ?? '')
          setEmail(data.email ?? '')
          setNivelInteres(data.nivel_interes ?? null)
          setFuente(data.fuente_lead ?? 'otro')
          setEstado(data.estado ?? 'por_perfilar')
          estadoOriginalRef.current = data.estado ?? 'por_perfilar'
          setTipoCredito(data.tipo_credito ?? null)
          setPresupuesto(data.presupuesto ?? '')
          setZonaBusqueda(data.zona_busqueda ?? '')
          setNumPersonas(data.num_personas ?? '')
          setTieneMascotas(data.tiene_mascotas ?? null)
          setDetalleMascotas(data.detalle_mascotas ?? '')
          setFechaMudanza(data.fecha_mudanza ?? '')
          setPresupuestoRenta(data.presupuesto ?? '')
          setZonasInteres(data.zona_busqueda ?? '')
          setProblemasPoliza(data.problemas_poliza ?? null)
          setNotas(data.notas ?? '')
          setProximoContacto(data.proximo_contacto ? new Date(data.proximo_contacto) : null)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [params.id]))

  async function guardar() {
    if (!nombre.trim()) { mostrarError('Campo requerido', 'El nombre es obligatorio.'); return }
    if (!telefono.trim()) { mostrarError('Campo requerido', 'El teléfono es obligatorio.'); return }
    const esRentaCheck = tipoOperacion === 'renta'
    const zonaVal = esRentaCheck ? zonasInteres.trim() : zonaBusqueda.trim()
    const presupVal = esRentaCheck ? presupuestoRenta.trim() : presupuesto.trim()
    if (!zonaVal) { mostrarError('Campo requerido', 'La zona de interés es obligatoria.'); return }
    if (!presupVal) { mostrarError('Campo requerido', 'El presupuesto es obligatorio.'); return }

    setGuardando(true)
    try {
      // getSession() lee del storage local — funciona offline (getUser() hace red y falla)
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user ?? null
      if (!user) { mostrarError('Error', 'Sesión expirada, vuelve a iniciar sesión.'); return }

      const esRenta = tipoOperacion === 'renta'

      const payload = {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        fuente_lead: fuente,
        estado,
        tipo_operacion: tipoOperacion,
        notas: notas.trim() || null,
        // Solo incluir proximo_contacto si el usuario seleccionó una fecha.
        // Si está vacío NO escribir null — el trigger de recordatorios gestiona este campo.
        ...(proximoContacto ? { proximo_contacto: proximoContacto.toISOString() } : {}),
        nivel_interes: nivelInteres,
        // Venta
        email: !esRenta ? email.trim() || null : null,
        tipo_credito: !esRenta ? tipoCredito : null,
        presupuesto: !esRenta
          ? presupuesto.trim() || null
          : presupuestoRenta.trim() || null,
        zona_busqueda: !esRenta
          ? zonaBusqueda.trim() || null
          : zonasInteres.trim() || null,
        // Renta
        num_personas: esRenta ? numPersonas.trim() || null : null,
        tiene_mascotas: esRenta ? tieneMascotas : null,
        detalle_mascotas: esRenta && tieneMascotas ? detalleMascotas.trim() || null : null,
        fecha_mudanza: esRenta ? fechaMudanza.trim() || null : null,
        problemas_poliza: esRenta ? problemasPoliza : null,
      }

      // ── OFFLINE: encolar y salir ────────────────────────────────
      if (!isOnline) {
        if (esEdicion) {
          await enqueueClienteUpdate(params.id!, payload)
          // Actualización optimista en cache
          queryClient.setQueryData<any[]>(['clientes', 'mios', 'v2'], (old) =>
            (old ?? []).map(cl => cl.id === params.id ? { ...cl, ...payload } : cl))
          queryClient.setQueryData<any[]>(['clientes', 'all', 'v2'], (old) =>
            (old ?? []).map(cl => cl.id === params.id ? { ...cl, ...payload } : cl))
        } else {
          const tempId = genUUID()
          const fullPayload = { ...payload, responsable_id: user.id, id: tempId, created_at: new Date().toISOString() }
          await enqueueClienteCreate(tempId, { ...payload, responsable_id: user.id })
          // Insertar optimistamente en cache con el UUID local
          queryClient.setQueryData<any[]>(['clientes', 'mios', 'v2'], (old) => [fullPayload, ...(old ?? [])])
          queryClient.setQueryData<any[]>(['clientes', 'all', 'v2'], (old) => [fullPayload, ...(old ?? [])])
        }
        await refreshPending()
        irAtras()
        return
      }

      // ── ONLINE: guardar directamente ────────────────────────────
      const { data: perfil } = await supabase.from('profiles').select('nombre').eq('id', user.id).single()
      const nombreProspectador = perfil?.nombre ?? 'Un prospectador'

      if (esEdicion) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', params.id!)
        if (error) { mostrarError('Error al guardar', error.message); return }
        await supabase.from('interacciones').insert({
          cliente_id: params.id!, user_id: user.id,
          tipo: 'nota', descripcion: 'Información del cliente actualizada.',
        })
        if (estado !== estadoOriginalRef.current) {
          if (estado === 'cita_agendada') registrarAccion(user.id, 'agendar_cita').catch(() => {})
          else if (estado === 'compro')   registrarAccion(user.id, 'cerrar_venta').catch(() => {})
        }
      } else {
        const { data, error } = await supabase
          .from('clientes')
          .insert({ ...payload, responsable_id: user.id })
          .select('id')
          .single()
        if (error) { mostrarError('Error al registrar', error.message); return }
        if (data) {
          await supabase.from('interacciones').insert({
            cliente_id: data.id, user_id: user.id,
            tipo: 'nota', descripcion: 'Cliente registrado en el CRM.',
          })
          await supabase.rpc('notificar_admins_nuevo_cliente', {
            p_cliente_nombre: nombre.trim(),
            p_cliente_id: data.id,
            p_prospectador_nombre: nombreProspectador,
          })
          registrarAccion(user.id, 'agregar_cliente').catch(() => {})
          if (estado === 'cita_agendada') registrarAccion(user.id, 'agendar_cita').catch(() => {})
          else if (estado === 'compro')   registrarAccion(user.id, 'cerrar_venta').catch(() => {})
        }
      }

      irAtras()
    } catch (e: any) {
      mostrarError('Error inesperado', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <Text style={styles.screenTitle}>{esEdicion ? 'Editar cliente' : 'Nuevo cliente'}</Text>

      {/* ── 1. Tipo de operación (siempre primero) ── */}
      <Text style={styles.sectionTitle}>Tipo de operación</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
        {([{ value: 'venta', label: 'Venta' }, { value: 'renta', label: 'Renta' }] as const).map((op) => {
          const activo = tipoOperacion === op.value
          return (
            <TouchableOpacity
              key={op.value}
              style={[styles.chip, activo && styles.chipActivo, { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}
              onPress={() => setTipoOperacion(op.value)}
            >
              <Text style={[styles.chipText, activo && styles.chipTextActivo, { fontSize: 15 }]}>
                {op.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Nivel de interés ── */}
      {tipoOperacion && (
        <>
          <Text style={styles.sectionTitle}>Nivel de interés</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {([
              { value: 'alto',  label: '🔥 Alto' },
              { value: 'medio', label: '🌡️ Medio' },
              { value: 'bajo',  label: '❄️ Bajo' },
            ] as const).map((op) => {
              const activo = nivelInteres === op.value
              return (
                <TouchableOpacity
                  key={op.value}
                  style={[styles.chip, activo && styles.chipActivo, { flex: 1, justifyContent: 'center', paddingVertical: 10 }]}
                  onPress={() => setNivelInteres(activo ? null : op.value)}
                >
                  <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{op.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {/* ── Si no hay selección, mostrar aviso ── */}
      {!tipoOperacion && (
        <View style={styles.sinTipoBox}>
          <Text style={styles.sinTipoText}>Selecciona el tipo de operación para continuar</Text>
        </View>
      )}

      {/* ══════════ CAMPOS VENTA ══════════ */}
      {tipoOperacion === 'venta' && (
        <>
          <Text style={styles.sectionTitle}>Datos de contacto</Text>

          <Text style={styles.fieldLabel}>Nombre completo *</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre}
            placeholder="Nombre completo" autoCapitalize="words" />

          <Text style={styles.fieldLabel}>Teléfono *</Text>
          <TextInput style={styles.input} value={telefono} onChangeText={setTelefono}
            placeholder="442 000 0000" keyboardType="phone-pad" />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.sectionTitle}>Búsqueda</Text>
          <Text style={styles.fieldLabel}>Zona de interés *</Text>
          <ZonasInteresField value={zonaBusqueda} onChange={setZonaBusqueda} />

          <Text style={styles.sectionTitle}>Presupuesto</Text>
          <Text style={styles.fieldLabel}>Tipo de crédito</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: tipoCredito ? 12 : 18 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TIPOS_CREDITO.map((tc) => {
                const activo = tipoCredito === tc.value
                return (
                  <TouchableOpacity key={tc.value}
                    style={[styles.chip, activo && styles.chipActivo]}
                    onPress={() => setTipoCredito(activo ? null : tc.value)}
                  >
                    <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{tc.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
          <Text style={styles.fieldLabel}>Presupuesto *</Text>
          <TextInput style={styles.input} value={presupuesto} onChangeText={setPresupuesto}
            placeholder="Ej: $1,500,000 o hasta $800k" keyboardType="default" />
        </>
      )}

      {/* ══════════ CAMPOS RENTA ══════════ */}
      {tipoOperacion === 'renta' && (
        <>
          <Text style={styles.sectionTitle}>Datos de contacto</Text>

          <Text style={styles.fieldLabel}>Nombre completo *</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre}
            placeholder="Nombre completo" autoCapitalize="words" />

          <Text style={styles.fieldLabel}>Teléfono *</Text>
          <TextInput style={styles.input} value={telefono} onChangeText={setTelefono}
            placeholder="442 000 0000" keyboardType="phone-pad" />

          <Text style={styles.sectionTitle}>Perfil de renta</Text>

          <Text style={styles.fieldLabel}>¿Cuántas personas serían?</Text>
          <TextInput style={styles.input} value={numPersonas} onChangeText={setNumPersonas}
            placeholder="Ej: 2 adultos, 1 niño" autoCapitalize="sentences" />

          <Text style={styles.fieldLabel}>¿Tiene mascotas?</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: tieneMascotas ? 12 : 18 }}>
            {[{ value: true, label: 'Sí' }, { value: false, label: 'No' }].map((op) => {
              const activo = tieneMascotas === op.value
              return (
                <TouchableOpacity key={String(op.value)}
                  style={[styles.chip, activo && styles.chipActivo, { flex: 1, justifyContent: 'center' }]}
                  onPress={() => setTieneMascotas(op.value)}
                >
                  <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{op.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {tieneMascotas && (
            <>
              <Text style={styles.fieldLabel}>Detalle de mascotas</Text>
              <TextInput style={[styles.input, styles.inputMulti]}
                value={detalleMascotas} onChangeText={setDetalleMascotas}
                placeholder="Ej: 1 perro mediano, 2 gatos..."
                multiline numberOfLines={3} textAlignVertical="top" />
            </>
          )}

          <Text style={styles.fieldLabel}>¿Cuándo tiene pensado mudarse?</Text>
          <TextInput style={styles.input} value={fechaMudanza} onChangeText={setFechaMudanza}
            placeholder="Ej: Inmediatamente, en 2 meses..." autoCapitalize="sentences" />

          <Text style={styles.fieldLabel}>Presupuesto máximo *</Text>
          <TextInput style={styles.input} value={presupuestoRenta} onChangeText={setPresupuestoRenta}
            placeholder="Ej: $8,000 / mes" />

          <Text style={styles.fieldLabel}>Zonas de interés *</Text>
          <ZonasInteresField value={zonasInteres} onChange={setZonasInteres} />

          <Text style={styles.fieldLabel}>¿Tiene problemas con los requisitos de la póliza?</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            {[{ value: true, label: 'Sí' }, { value: false, label: 'No' }].map((op) => {
              const activo = problemasPoliza === op.value
              return (
                <TouchableOpacity key={String(op.value)}
                  style={[styles.chip, activo && (op.value ? styles.chipPeligro : styles.chipActivo), { flex: 1, justifyContent: 'center' }]}
                  onPress={() => setProblemasPoliza(op.value)}
                >
                  <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{op.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      )}

      {/* ── Campos comunes (solo si hay tipo seleccionado) ── */}
      {tipoOperacion && (
        <>
          <Text style={styles.sectionTitle}>Etapa de venta</Text>
          <ChipSelector
            label="Estado"
            options={ETAPAS_CLIENTE.map((e) => ({
              value: e, label: ESTADOS[e]?.label ?? e,
              color: ESTADOS[e]?.color, bg: ESTADOS[e]?.bg,
            }))}
            value={estado}
            onChange={setEstado}
          />

          <Text style={styles.sectionTitle}>Origen del lead</Text>
          <ChipSelector
            label="Fuente"
            options={FUENTES.map((f) => ({ value: f.value, label: f.label }))}
            value={fuente}
            onChange={setFuente}
          />

          <Text style={styles.sectionTitle}>Seguimiento</Text>
          <DateTimePicker label="Próxima acción" value={proximoContacto} onChange={setProximoContacto} />

          <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Notas</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={notas} onChangeText={setNotas}
            placeholder="Observaciones sobre este cliente..."
            multiline numberOfLines={4} textAlignVertical="top"
          />

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
        </>
      )}

      <TouchableOpacity style={styles.btnCancelar} onPress={irAtras}>
        <Text style={styles.btnCancelarText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ── Estilos DateTimePicker ───────────────────────────────
const dpStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#6b8082', marginBottom: 6 },
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f7f8', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  triggerPlaceholder: { color: '#aaa' },
  triggerIcon: { color: '#aaa', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '88%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
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
  btnQuitar: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#c0392b' },
  btnQuitarText: { color: '#c0392b', fontWeight: '600', fontSize: 13 },
  btnCancelar: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f0f3f5' },
  btnCancelarText: { color: '#555', fontWeight: '600', fontSize: 13 },
  btnConfirmar: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: '#1a6470' },
  btnConfirmarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})

// ── Estilos pantalla ─────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  content: { padding: 20, paddingBottom: 52 },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a2e', marginBottom: 22 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6b8082', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 12, marginTop: 8,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b8082', marginBottom: 7 },
  input: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e8ea',
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#1a1a2e', marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  inputMulti: { height: 100, textAlignVertical: 'top' },
  chip: {
    borderWidth: 1.5, borderColor: '#e0e8ea', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff',
  },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipPeligro: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  chipText: { fontSize: 13, color: '#6b8082', fontWeight: '500' },
  chipTextActivo: { color: '#fff', fontWeight: '700' },
  sinTipoBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 24,
    borderWidth: 1.5, borderColor: '#e0e8ea', borderStyle: 'dashed',
  },
  sinTipoText: { fontSize: 14, color: '#9eafb2', textAlign: 'center', lineHeight: 20 },
  btnGuardar: {
    backgroundColor: '#1a6470', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24,
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  btnGuardarDisabled: { opacity: 0.6 },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnCancelar: { alignItems: 'center', paddingVertical: 16, marginTop: 6 },
  btnCancelarText: { color: '#9eafb2', fontSize: 14, fontWeight: '500' },
})
