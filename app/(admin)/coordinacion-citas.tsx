import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, ScrollView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoCita =
  | 'por_contactar'
  | 'primer_contacto'
  | 'en_coordinacion'
  | 'coordinada'
  | 'reagendada'
  | 'realizada'
  | 'cancelada'

type Cita = {
  id: string
  cliente_id: string
  prospectador_id: string | null
  coordinado_por: string | null
  propiedad_id: string | null
  estado: EstadoCita
  fecha_cita: string | null
  notas: string | null
  created_at: string
  updated_at: string
  clientes: {
    nombre: string
    telefono: string
    tipo_operacion: string | null
    estado: string
  }
  prospectador: { nombre: string } | null
  coordinador: { nombre: string } | null
}

type Profile = { id: string; nombre: string }

// ─── Config estados ───────────────────────────────────────────────────────────

export const ESTADOS_CITA: Record<EstadoCita, { label: string; color: string; bg: string; icon: string }> = {
  por_contactar:  { label: 'Por contactar',   color: '#64748b', bg: '#f1f5f9', icon: 'person-outline' },
  primer_contacto:{ label: 'Primer contacto', color: '#0369a1', bg: '#e0f2fe', icon: 'call-outline' },
  en_coordinacion:{ label: 'En coordinación', color: '#d97706', bg: '#fef3c7', icon: 'sync-outline' },
  coordinada:     { label: 'Coordinada',       color: '#059669', bg: '#d1fae5', icon: 'calendar-outline' },
  reagendada:     { label: 'Reagendada',       color: '#7c3aed', bg: '#ede9fe', icon: 'refresh-outline' },
  realizada:      { label: 'Realizada',        color: '#1a6470', bg: '#e0f4f5', icon: 'checkmark-circle-outline' },
  cancelada:      { label: 'Cancelada',        color: '#dc2626', bg: '#fee2e2', icon: 'close-circle-outline' },
}

const ORDEN_ESTADOS: EstadoCita[] = [
  'por_contactar', 'primer_contacto', 'en_coordinacion',
  'coordinada', 'reagendada', 'realizada', 'cancelada',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Ayer'
  return `${d}d`
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function normalizarTel(tel: string): string {
  let phone = tel.replace(/\D/g, '')
  if (phone.startsWith('5252')) phone = phone.slice(2)
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  return phone || tel
}

// ─── Dropdown selector ───────────────────────────────────────────────────────

function DropdownSelector({
  label, value, options, onSelect, placeholder = 'Sin asignar',
}: {
  label: string
  value: string
  options: { id: string; nombre: string }[]
  onSelect: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.id === value)

  return (
    <>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.dropdownBtn} onPress={() => setOpen(true)}>
        <Text style={[s.dropdownBtnTxt, !selected && { color: '#94a3b8' }]}>
          {selected ? selected.nombre : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.ddOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.ddSheet}>
            <Text style={s.ddTitle}>{label}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={s.ddOption} onPress={() => { onSelect(''); setOpen(false) }}>
                <Text style={[s.ddOptionTxt, !value && { color: '#1a6470', fontWeight: '700' }]}>{placeholder}</Text>
                {!value && <Ionicons name="checkmark" size={16} color="#1a6470" />}
              </TouchableOpacity>
              {options.filter(o => o.nombre?.trim()).map(o => (
                <TouchableOpacity key={o.id} style={s.ddOption} onPress={() => { onSelect(o.id); setOpen(false) }}>
                  <Text style={[s.ddOptionTxt, value === o.id && { color: '#1a6470', fontWeight: '700' }]}>{o.nombre}</Text>
                  {value === o.id && <Ionicons name="checkmark" size={16} color="#1a6470" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

// ─── Modal edición ────────────────────────────────────────────────────────────

function ModalEdicion({
  cita, admins, onClose, onGuardar,
}: {
  cita: Cita | null
  admins: Profile[]
  onClose: () => void
  onGuardar: () => void
}) {
  const [estado, setEstado]           = useState<EstadoCita>(cita?.estado ?? 'por_contactar')
  const [notas, setNotas]             = useState(cita?.notas ?? '')
  const [fechaTexto, setFechaTexto]   = useState(
    cita?.fecha_cita ? new Date(cita.fecha_cita).toISOString().slice(0, 16) : ''
  )
  const [coordinadorId, setCoordinadorId] = useState(cita?.coordinado_por ?? '')
  const [telefono, setTelefono]       = useState(cita?.clientes?.telefono ?? '')
  const [guardando, setGuardando]     = useState(false)

  async function guardar() {
    if (!cita) return
    setGuardando(true)
    const mostrarError = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Error', msg)
    }
    // Actualizar teléfono del cliente si cambió
    if (telefono.trim() && telefono.trim() !== cita.clientes.telefono) {
      const { error: errTel } = await supabase
        .from('clientes').update({ telefono: telefono.trim() }).eq('id', cita.cliente_id)
      if (errTel) { mostrarError(errTel.message); setGuardando(false); return }
    }
    const { error } = await supabase.from('citas_coordinacion').update({
      estado,
      notas: notas.trim() || null,
      coordinado_por: coordinadorId || null,
      fecha_cita: fechaTexto ? new Date(fechaTexto).toISOString() : null,
    }).eq('id', cita.id)
    setGuardando(false)
    if (error) { mostrarError(error.message); return }
    onGuardar()
    onClose()
  }

  if (!cita) return null

  const cliente = cita.clientes
  const infoEstado = ESTADOS_CITA[estado]

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={e => e.stopPropagation()}>
          <View style={s.sheetHandle} />

          {/* Cabecera cliente */}
          <View style={s.clienteHead}>
            <View style={[s.avatar, { backgroundColor: infoEstado.bg }]}>
              <Text style={[s.avatarTxt, { color: infoEstado.color }]}>{iniciales(cliente.nombre)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clienteNombre}>{cliente.nombre}</Text>
              <TextInput
                style={s.telInput}
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                placeholder="Teléfono"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Estado */}
            <Text style={s.fieldLabel}>Estado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {ORDEN_ESTADOS.map(e => {
                  const inf = ESTADOS_CITA[e]
                  const activo = estado === e
                  return (
                    <TouchableOpacity
                      key={e}
                      style={[s.estadoChip, activo && { backgroundColor: inf.color, borderColor: inf.color }]}
                      onPress={() => setEstado(e)}
                    >
                      <Ionicons name={inf.icon as any} size={12} color={activo ? '#fff' : inf.color} />
                      <Text style={[s.estadoChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>
                        {inf.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>

            {/* Fecha cita */}
            <Text style={s.fieldLabel}>Fecha de cita</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input
                type="datetime-local"
                value={fechaTexto}
                onChange={(e: any) => setFechaTexto(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e2e8f0', fontSize: 14, color: '#1e293b',
                  backgroundColor: '#fff', marginBottom: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <TextInput
                style={[s.input, { marginBottom: 14 }]}
                placeholder="YYYY-MM-DD HH:MM"
                value={fechaTexto}
                onChangeText={setFechaTexto}
                keyboardType="numbers-and-punctuation"
              />
            )}

            <DropdownSelector
              label="Coordinado por"
              value={coordinadorId}
              options={admins.filter(a => a.nombre?.trim())}
              onSelect={setCoordinadorId}
            />

            {/* Notas */}
            <Text style={s.fieldLabel}>Notas de coordinación</Text>
            <TextInput
              style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 10, marginBottom: 24 }]}
              placeholder="Detalles, condiciones, observaciones..."
              value={notas}
              onChangeText={setNotas}
              multiline
            />

            {/* Info extra */}
            <View style={s.infoBox}>
              {cita.prospectador && (
                <Text style={s.infoRow}>
                  <Text style={s.infoLabel}>Prospectador: </Text>{cita.prospectador.nombre}
                </Text>
              )}
              <Text style={s.infoRow}>
                <Text style={s.infoLabel}>Agregada: </Text>{formatFecha(cita.created_at)}
              </Text>
              <Text style={s.infoRow}>
                <Text style={s.infoLabel}>Actualizada: </Text>{tiempoRelativo(cita.updated_at)}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnGuardarTxt}>Guardar cambios</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Modal nueva cita (manual por admin) ──────────────────────────────────────

function ModalNuevaCita({
  admins, onClose, onGuardar,
}: {
  admins: Profile[]
  onClose: () => void
  onGuardar: () => void
}) {
  const [busqueda, setBusqueda]           = useState('')
  const [clientes, setClientes]           = useState<{ id: string; nombre: string; telefono: string }[]>([])
  const [clienteId, setClienteId]         = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [modoNuevo, setModoNuevo]         = useState(false)
  const [nuevoNombre, setNuevoNombre]     = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [estado, setEstado]               = useState<EstadoCita>('por_contactar')
  const [notas, setNotas]                 = useState('')
  const [fechaTexto, setFechaTexto]       = useState('')
  const [coordinadorId, setCoordinadorId] = useState('')
  const [prospectadorId, setProspectadorId] = useState('')
  const [prospectadores, setProspectadores] = useState<Profile[]>([])
  const [guardando, setGuardando]         = useState(false)
  const [buscando, setBuscando]           = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, nombre').neq('role', 'admin')
      .then(({ data }) => setProspectadores((data ?? []).filter(p => p.nombre?.trim())))
  }, [])

  useEffect(() => {
    if (busqueda.trim().length < 2) { setClientes([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const { data } = await supabase.from('clientes')
        .select('id, nombre, telefono')
        .ilike('nombre', `%${busqueda}%`)
        .limit(8)
      setClientes(data ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  async function guardar() {
    setGuardando(true)
    const mostrarError = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Error', msg)
    }

    try {
      let idFinal = clienteId

      if (modoNuevo) {
        if (!nuevoNombre.trim() || !nuevoTelefono.trim()) {
          mostrarError('Nombre y teléfono son obligatorios.')
          setGuardando(false)
          return
        }
        const { data: { user } } = await supabase.auth.getUser()
        const responsableId = prospectadorId || user!.id
        const { data: nuevo, error: errCliente } = await supabase
          .from('clientes')
          .insert({
            nombre: nuevoNombre.trim(),
            telefono: nuevoTelefono.trim(),
            fuente_lead: 'otro',
            estado: 'por_perfilar',
            responsable_id: responsableId,
          })
          .select('id')
          .single()
        if (errCliente) {
          mostrarError(`Error al crear cliente: ${errCliente.message}`)
          setGuardando(false)
          return
        }
        idFinal = nuevo.id
      } else if (!clienteId) {
        mostrarError('Selecciona o crea un cliente.')
        setGuardando(false)
        return
      }

      const { error } = await supabase.from('citas_coordinacion').insert({
        cliente_id: idFinal,
        prospectador_id: prospectadorId || null,
        coordinado_por: coordinadorId || null,
        estado,
        notas: notas.trim() || null,
        fecha_cita: fechaTexto ? new Date(fechaTexto).toISOString() : null,
      })
      if (error) {
        mostrarError(`Error al crear cita: ${error.message}`)
        setGuardando(false)
        return
      }
      onGuardar()
      onClose()
    } catch (e: any) {
      mostrarError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={e => e.stopPropagation()}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={s.sheetTitulo}>Nueva cita</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#94a3b8" /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Toggle buscar / crear */}
            <View style={s.modoToggle}>
              <TouchableOpacity
                style={[s.modoBtn, !modoNuevo && s.modoBtnActivo]}
                onPress={() => { setModoNuevo(false); setNuevoNombre(''); setNuevoTelefono('') }}
              >
                <Ionicons name="search-outline" size={13} color={!modoNuevo ? '#fff' : '#64748b'} />
                <Text style={[s.modoBtnTxt, !modoNuevo && { color: '#fff', fontWeight: '700' }]}>Buscar existente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modoBtn, modoNuevo && s.modoBtnActivo]}
                onPress={() => { setModoNuevo(true); setClienteId(''); setClienteNombre(''); setBusqueda('') }}
              >
                <Ionicons name="person-add-outline" size={13} color={modoNuevo ? '#fff' : '#64748b'} />
                <Text style={[s.modoBtnTxt, modoNuevo && { color: '#fff', fontWeight: '700' }]}>Crear nuevo</Text>
              </TouchableOpacity>
            </View>

            {modoNuevo ? (
              <>
                <Text style={s.fieldLabel}>Nombre *</Text>
                <TextInput
                  style={[s.input, { marginBottom: 10 }]}
                  placeholder="Nombre completo"
                  value={nuevoNombre}
                  onChangeText={setNuevoNombre}
                  autoCapitalize="words"
                />
                <Text style={s.fieldLabel}>Teléfono *</Text>
                <TextInput
                  style={[s.input, { marginBottom: 14 }]}
                  placeholder="Ej. 7821954946"
                  value={nuevoTelefono}
                  onChangeText={setNuevoTelefono}
                  keyboardType="phone-pad"
                />
              </>
            ) : (
              <>
                <Text style={s.fieldLabel}>Cliente *</Text>
                {clienteId ? (
                  <View style={s.clienteSeleccionado}>
                    <Text style={s.clienteSelNombre}>{clienteNombre}</Text>
                    <TouchableOpacity onPress={() => { setClienteId(''); setClienteNombre(''); setBusqueda('') }}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={[s.input, { marginBottom: 6 }]}
                      placeholder="Buscar por nombre..."
                      value={busqueda}
                      onChangeText={setBusqueda}
                      autoCapitalize="words"
                    />
                    {buscando && <ActivityIndicator size="small" color="#1a6470" style={{ marginBottom: 8 }} />}
                    {clientes.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={s.clienteRow}
                        onPress={() => { setClienteId(c.id); setClienteNombre(c.nombre); setClientes([]) }}
                      >
                        <Text style={s.clienteRowNombre}>{c.nombre}</Text>
                        <Text style={s.clienteRowTel}>{c.telefono}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            {/* Estado */}
            <Text style={[s.fieldLabel, { marginTop: 14 }]}>Estado inicial</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {ORDEN_ESTADOS.map(e => {
                  const inf = ESTADOS_CITA[e]
                  const activo = estado === e
                  return (
                    <TouchableOpacity
                      key={e}
                      style={[s.estadoChip, activo && { backgroundColor: inf.color, borderColor: inf.color }]}
                      onPress={() => setEstado(e)}
                    >
                      <Text style={[s.estadoChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>{inf.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>

            {/* Fecha */}
            <Text style={s.fieldLabel}>Fecha de cita</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input
                type="datetime-local"
                value={fechaTexto}
                onChange={(e: any) => setFechaTexto(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid #e2e8f0', fontSize: 14, color: '#1e293b',
                  backgroundColor: '#fff', marginBottom: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <TextInput
                style={[s.input, { marginBottom: 14 }]}
                placeholder="YYYY-MM-DD HH:MM"
                value={fechaTexto}
                onChangeText={setFechaTexto}
                keyboardType="numbers-and-punctuation"
              />
            )}

            <DropdownSelector
              label="Coordinado por"
              value={coordinadorId}
              options={admins.filter(a => a.nombre?.trim())}
              onSelect={setCoordinadorId}
            />

            <DropdownSelector
              label="Prospectador"
              value={prospectadorId}
              options={prospectadores}
              onSelect={setProspectadorId}
            />

            {/* Notas */}
            <Text style={s.fieldLabel}>Notas</Text>
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 10, marginBottom: 24 }]}
              placeholder="Detalles, condiciones..."
              value={notas}
              onChangeText={setNotas}
              multiline
            />

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnGuardarTxt}>Agregar cita</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function CoordinacionCitas() {
  const [citas, setCitas]             = useState<Cita[]>([])
  const [admins, setAdmins]           = useState<Profile[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EstadoCita | 'en_proceso' | null>(null)
  const [filtroAdmin, setFiltroAdmin]   = useState<string | null>(null)
  const [citaEditando, setCitaEditando] = useState<Cita | null>(null)
  const [modalNueva, setModalNueva]   = useState(false)
  const mountedRef                    = useRef(true)

  async function cargar() {
    const { data } = await supabase
      .from('citas_coordinacion')
      .select(`
        *,
        clientes ( nombre, telefono, tipo_operacion, estado ),
        prospectador:profiles!citas_coordinacion_prospectador_id_fkey ( nombre ),
        coordinador:profiles!citas_coordinacion_coordinado_por_fkey ( nombre )
      `)
      .order('updated_at', { ascending: false })
    if (mountedRef.current) {
      setCitas((data ?? []) as unknown as Cita[])
      setLoading(false)
    }
  }

  async function cargarAdmins() {
    const { data } = await supabase.from('profiles').select('id, nombre').eq('role', 'admin')
    if (mountedRef.current) setAdmins(data ?? [])
  }

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    setLoading(true)
    cargar()
    cargarAdmins()

    const channel = supabase
      .channel('citas-coordinacion-rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'citas_coordinacion',
      }, () => { cargar() })
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, []))

  // ── KPIs ──────────────────────────────────────────────────
  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = citas.filter(c => c.estado === e).length
    return acc
  }, {})

  const enProceso = (conteos.por_contactar ?? 0)
    + (conteos.primer_contacto ?? 0)
    + (conteos.en_coordinacion ?? 0)
    + (conteos.reagendada ?? 0)

  const ESTADOS_EN_PROCESO: EstadoCita[] = ['por_contactar', 'primer_contacto', 'en_coordinacion', 'reagendada']

  const citasFiltradas = citas
    .filter(c => {
      if (!filtroEstado) return true
      if (filtroEstado === 'en_proceso') return ESTADOS_EN_PROCESO.includes(c.estado)
      return c.estado === filtroEstado
    })
    .filter(c => {
      if (!filtroAdmin) return true
      if (filtroAdmin === 'sin_asignar') return !c.coordinado_por
      return c.coordinado_por === filtroAdmin
    })

  // ── Urgentes: coordinadas con fecha próxima (< 48h) ───────
  const ahora = Date.now()
  const urgentes = citas.filter(c =>
    c.estado === 'coordinada' && c.fecha_cita &&
    new Date(c.fecha_cita).getTime() - ahora < 48 * 3600 * 1000 &&
    new Date(c.fecha_cita).getTime() > ahora
  ).length

  return (
    <ScrollView style={s.container} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

      {/* ── Botón volver ── */}
      <TouchableOpacity
        style={{ paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start' }}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}
      >
        <Text style={{ color: '#1a6470', fontSize: 15, fontWeight: '600' }}>← Volver</Text>
      </TouchableOpacity>

      {/* ── KPI strip ── */}
      <View style={s.kpiStrip}>
        <TouchableOpacity style={s.kpiItem} onPress={() => setFiltroEstado(null)}>
          <Text style={[s.kpiNum, { color: '#1a6470' }]}>{citas.length}</Text>
          <Text style={s.kpiLbl}>TOTAL</Text>
        </TouchableOpacity>
        <View style={s.kpiDiv} />
        <TouchableOpacity style={s.kpiItem} onPress={() => setFiltroEstado('en_coordinacion')}>
          <Text style={[s.kpiNum, { color: '#d97706' }]}>{conteos.en_coordinacion ?? 0}</Text>
          <Text style={s.kpiLbl}>EN COORD.</Text>
        </TouchableOpacity>
        <View style={s.kpiDiv} />
        <TouchableOpacity style={s.kpiItem} onPress={() => setFiltroEstado('coordinada')}>
          <Text style={[s.kpiNum, { color: '#059669' }]}>{conteos.coordinada ?? 0}</Text>
          <Text style={s.kpiLbl}>COORDINADAS</Text>
        </TouchableOpacity>
        <View style={s.kpiDiv} />
        <TouchableOpacity style={s.kpiItem} onPress={() => setFiltroEstado('en_proceso')}>
          <Text style={[s.kpiNum, enProceso > 0 ? { color: '#7c3aed' } : { color: '#cbd5e1' }]}>{enProceso}</Text>
          <Text style={s.kpiLbl}>EN PROCESO</Text>
        </TouchableOpacity>
        <View style={s.kpiDiv} />
        <View style={s.kpiItem}>
          <Text style={[s.kpiNum, urgentes > 0 ? { color: '#dc2626' } : { color: '#cbd5e1' }]}>{urgentes}</Text>
          <Text style={s.kpiLbl}>PRÓXIMAS 48H</Text>
        </View>
      </View>

      {/* ── Filtro por admin ── */}
      {admins.length > 1 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={s.adminBarWrap} contentContainerStyle={s.adminBarContent}
        >
          <TouchableOpacity
            style={[s.adminFilterChip, filtroAdmin === null && s.adminFilterChipActivo]}
            onPress={() => setFiltroAdmin(null)}
          >
            <Ionicons name="people-outline" size={12} color={filtroAdmin === null ? '#fff' : '#1a6470'} />
            <Text style={[s.adminFilterTxt, filtroAdmin === null && { color: '#fff', fontWeight: '700' }]}>
              Todos · {citas.length}
            </Text>
          </TouchableOpacity>
          {admins.map(a => {
            const activo = filtroAdmin === a.id
            const cnt = citas.filter(c => c.coordinado_por === a.id).length
            const sinAsignar = citas.filter(c => !c.coordinado_por).length
            return (
              <TouchableOpacity
                key={a.id}
                style={[s.adminFilterChip, activo && s.adminFilterChipActivo]}
                onPress={() => setFiltroAdmin(activo ? null : a.id)}
              >
                <Ionicons name="person-outline" size={12} color={activo ? '#fff' : '#1a6470'} />
                <Text style={[s.adminFilterTxt, activo && { color: '#fff', fontWeight: '700' }]}>
                  {a.nombre} · {cnt}
                </Text>
              </TouchableOpacity>
            )
          })}
          {citas.some(c => !c.coordinado_por) && (
            <TouchableOpacity
              style={[s.adminFilterChip, filtroAdmin === 'sin_asignar' && s.adminFilterChipActivo]}
              onPress={() => setFiltroAdmin(filtroAdmin === 'sin_asignar' ? null : 'sin_asignar')}
            >
              <Ionicons name="help-circle-outline" size={12} color={filtroAdmin === 'sin_asignar' ? '#fff' : '#94a3b8'} />
              <Text style={[s.adminFilterTxt, { color: filtroAdmin === 'sin_asignar' ? '#fff' : '#94a3b8' }, filtroAdmin === 'sin_asignar' && { fontWeight: '700' }]}>
                Sin asignar · {citas.filter(c => !c.coordinado_por).length}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ── Tabs de estado ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.tabsWrap} contentContainerStyle={s.tabsContent}
      >
        <TouchableOpacity
          style={[s.tab, filtroEstado === null && s.tabActivo]}
          onPress={() => setFiltroEstado(null)}
        >
          <Text style={[s.tabTxt, filtroEstado === null && { color: '#fff', fontWeight: '700' }]}>
            Todos · {citas.length}
          </Text>
        </TouchableOpacity>
        {ORDEN_ESTADOS.map(e => {
          const inf = ESTADOS_CITA[e]
          const activo = filtroEstado === e
          return (
            <TouchableOpacity
              key={e}
              style={[s.tab, activo && { backgroundColor: inf.color, borderColor: inf.color }]}
              onPress={() => setFiltroEstado(activo ? null : e)}
            >
              <Ionicons name={inf.icon as any} size={12} color={activo ? '#fff' : inf.color} />
              <Text style={[s.tabTxt, activo && { color: '#fff', fontWeight: '700' }]}>
                {inf.label}
              </Text>
              <Text style={[s.tabCnt, activo && { color: 'rgba(255,255,255,0.75)' }]}>
                {conteos[e] ?? 0}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Lista ── */}
      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 60 }} />
      ) : citasFiltradas.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
          <Text style={s.emptyTxt}>
            {filtroEstado === 'en_proceso' ? 'Sin citas en proceso' : filtroEstado ? `Sin citas en "${ESTADOS_CITA[filtroEstado].label}"` : 'Sin citas registradas'}
          </Text>
        </View>
      ) : (
        <View style={{ padding: 14, paddingBottom: 100 }}>
          {citasFiltradas.map((item) => {
            const inf       = ESTADOS_CITA[item.estado]
            const esCitaHoy = item.fecha_cita &&
              new Date(item.fecha_cita).toDateString() === new Date().toDateString()
            const esPasada  = item.fecha_cita && new Date(item.fecha_cita) < new Date()
            const esUrgente = item.estado === 'coordinada' && item.fecha_cita &&
              new Date(item.fecha_cita).getTime() - ahora < 48 * 3600 * 1000 &&
              new Date(item.fecha_cita).getTime() > ahora

            return (
              <TouchableOpacity
                style={[s.card, esUrgente && s.cardUrgente]}
                onPress={() => setCitaEditando(item)}
                activeOpacity={0.8}
              >
                <View style={[s.cardBar, { backgroundColor: inf.color }]} />
                <View style={s.cardBody}>

                  {/* Cabecera */}
                  <View style={s.cardHead}>
                    <View style={[s.avatar, { backgroundColor: inf.bg }]}>
                      <Text style={[s.avatarTxt, { color: inf.color }]}>
                        {iniciales(item.clientes.nombre)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.cardNombre} numberOfLines={1}>{item.clientes.nombre}</Text>
                      <Text style={s.cardTel}>{normalizarTel(item.clientes.telefono)}</Text>
                    </View>
                    <View style={[s.estadoBadge, { backgroundColor: inf.bg }]}>
                      <Ionicons name={inf.icon as any} size={10} color={inf.color} />
                      <Text style={[s.estadoBadgeTxt, { color: inf.color }]} numberOfLines={1}>
                        {inf.label}
                      </Text>
                    </View>
                  </View>

                  {/* Fecha cita */}
                  {item.fecha_cita && (
                    <View style={[
                      s.fechaRow,
                      esCitaHoy && s.fechaHoy,
                      (esPasada && item.estado !== 'realizada') && s.fechaPasada,
                    ]}>
                      <Ionicons
                        name={esPasada ? 'warning-outline' : 'calendar-outline'}
                        size={12}
                        color={esPasada && item.estado !== 'realizada' ? '#dc2626' : esCitaHoy ? '#d97706' : '#1a6470'}
                      />
                      <Text style={[
                        s.fechaTxt,
                        esPasada && item.estado !== 'realizada' ? { color: '#dc2626' } :
                        esCitaHoy ? { color: '#92400e' } : {},
                      ]}>
                        {esPasada && item.estado !== 'realizada' ? '⚠ ' : esCitaHoy ? 'Hoy · ' : ''}
                        {formatFecha(item.fecha_cita)}
                      </Text>
                    </View>
                  )}

                  {/* Notas */}
                  {item.notas && (
                    <Text style={s.cardNotas} numberOfLines={2}>{item.notas}</Text>
                  )}

                  {/* Meta */}
                  <View style={s.metaRow}>
                    {item.prospectador && (
                      <View style={s.metaItem}>
                        <Ionicons name="person-outline" size={11} color="#94a3b8" />
                        <Text style={s.metaTxt}>{item.prospectador.nombre}</Text>
                      </View>
                    )}
                    {item.coordinador && (
                      <View style={s.metaItem}>
                        <Ionicons name="shield-checkmark-outline" size={11} color="#1a6470" />
                        <Text style={[s.metaTxt, { color: '#1a6470' }]}>{item.coordinador.nombre}</Text>
                      </View>
                    )}
                    <View style={[s.metaItem, { marginLeft: 'auto' as any }]}>
                      <Ionicons name="time-outline" size={11} color="#94a3b8" />
                      <Text style={s.metaTxt}>{tiempoRelativo(item.updated_at)}</Text>
                    </View>
                  </View>

                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* ── FAB nueva cita ── */}
      <TouchableOpacity style={s.fab} onPress={() => setModalNueva(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Modales ── */}
      <ModalEdicion
        cita={citaEditando}
        admins={admins}
        onClose={() => setCitaEditando(null)}
        onGuardar={cargar}
      />
      {modalNueva && (
        <ModalNuevaCita
          admins={admins}
          onClose={() => setModalNueva(false)}
          onGuardar={cargar}
        />
      )}
    </ScrollView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // KPI
  kpiStrip: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  kpiItem: { flex: 1, alignItems: 'center', gap: 2 },
  kpiNum:  { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  kpiLbl:  { fontSize: 8, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.5 },
  kpiDiv:  { width: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },

  // Tabs
  tabsWrap:    { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  tabActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  tabTxt:    { fontSize: 12, color: '#64748b', fontWeight: '500' },
  tabCnt:    { fontSize: 11, color: '#94a3b8', fontWeight: '700' },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt: { fontSize: 15, color: '#94a3b8', fontWeight: '500' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardUrgente: {
    borderWidth: 1.5, borderColor: '#fbbf24',
  },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 13 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  avatar:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt:{ fontSize: 14, fontWeight: '800' },
  cardNombre:{ fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  cardTel:  { fontSize: 12, color: '#64748b' },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, flexShrink: 0, maxWidth: 130,
  },
  estadoBadgeTxt: { fontSize: 10, fontWeight: '700' },

  fechaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0fdfa', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6,
  },
  fechaHoy:   { backgroundColor: '#fffbeb' },
  fechaPasada:{ backgroundColor: '#fef2f2' },
  fechaTxt:   { fontSize: 12, color: '#1a6470', fontWeight: '500', flex: 1 },

  cardNotas: { fontSize: 12, color: '#64748b', marginBottom: 8, lineHeight: 17 },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:  { fontSize: 11, color: '#94a3b8' },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },

  // Modal / Sheet
  modalBg:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '92%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitulo: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  clienteHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  clienteNombre:{ fontSize: 16, fontWeight: '700', color: '#0f172a' },
  clienteTel:   { fontSize: 13, color: '#64748b', marginTop: 2 },
  telInput: {
    fontSize: 13, color: '#64748b', marginTop: 2,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 2,
  },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1,
    borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#1e293b',
  },

  estadoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  estadoChipTxt: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  adminChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  adminChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  adminChipTxt: { fontSize: 13, color: '#64748b', fontWeight: '500' },

  infoBox: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 16, gap: 4,
  },
  infoRow:   { fontSize: 12, color: '#64748b', lineHeight: 18 },
  infoLabel: { fontWeight: '700', color: '#475569' },

  btnGuardar: {
    backgroundColor: '#1a6470', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  btnGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Nueva cita — buscar cliente
  clienteSeleccionado: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#e0f4f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 4,
  },
  clienteSelNombre: { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  clienteRow: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  clienteRowNombre: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  clienteRowTel:    { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  // Toggle buscar/crear
  modoToggle: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  modoBtnActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  modoBtnTxt: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  // Dropdown
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1,
    borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14,
  },
  dropdownBtnTxt: { fontSize: 14, color: '#1e293b', flex: 1 },
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 24 },
  ddSheet: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    maxHeight: 380,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  ddTitle:     { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  ddOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  ddOptionTxt: { fontSize: 14, color: '#334155' },

  // Barra de filtro por admin
  adminBarWrap:    { flexGrow: 0, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  adminBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  adminFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#d4e8ea', backgroundColor: '#fff',
  },
  adminFilterChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  adminFilterTxt: { fontSize: 12, color: '#1a6470', fontWeight: '500' },
})
