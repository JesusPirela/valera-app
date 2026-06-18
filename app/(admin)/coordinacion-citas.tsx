import { useState, useRef, useCallback, useEffect, createElement } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, ScrollView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoCita =
  | 'por_contactar'
  | 'primer_contacto'
  | 'buscando_opciones'
  | 'en_coordinacion'
  | 'coordinada'
  | 'reagendada'
  | 'no_responde_asesor'
  | 'realizada'
  | 'cancelada'

type Cita = {
  id: string
  cliente_id: string
  prospectador_id: string | null
  coordinado_por: string | null
  asesor_id: string | null
  propiedad_id: string | null
  estado: EstadoCita
  fecha_cita: string | null
  notas: string | null
  created_at: string
  updated_at: string
  clientes: { nombre: string; telefono: string; tipo_operacion: string | null; estado: string }
  prospectador: { nombre: string } | null
  coordinador: { nombre: string } | null
  asesor: { nombre: string } | null
  propiedad: { titulo: string } | null
}

type Profile = { id: string; nombre: string }

// ─── Config estados (9 etapas del pipeline) ──────────────────────────────────

export const ESTADOS_CITA: Record<EstadoCita, {
  label: string; color: string; bg: string; icon: string; emoji: string; dark: string
}> = {
  por_contactar:      { label: 'Por contactar',         color: '#3b82f6', bg: '#eff6ff', dark: '#1d4ed8', icon: 'person-outline',              emoji: '🔵' },
  primer_contacto:    { label: 'Primer contacto',       color: '#8b5cf6', bg: '#f5f3ff', dark: '#6d28d9', icon: 'call-outline',                emoji: '🟣' },
  buscando_opciones:  { label: 'Buscando opciones',     color: '#ca8a04', bg: '#fefce8', dark: '#92400e', icon: 'search-outline',              emoji: '🟡' },
  en_coordinacion:    { label: 'En coordinación',       color: '#f97316', bg: '#fff7ed', dark: '#c2410c', icon: 'sync-outline',                emoji: '🟠' },
  coordinada:         { label: 'Coordinada',            color: '#16a34a', bg: '#f0fdf4', dark: '#15803d', icon: 'calendar-outline',            emoji: '🟢' },
  reagendada:         { label: 'Reagendada',            color: '#b45309', bg: '#fef3c7', dark: '#92400e', icon: 'refresh-outline',             emoji: '🟤' },
  no_responde_asesor: { label: 'No responde el asesor', color: '#dc2626', bg: '#fef2f2', dark: '#b91c1c', icon: 'notifications-off-outline',   emoji: '🔴' },
  realizada:          { label: 'Realizada',             color: '#0d9488', bg: '#f0fdfa', dark: '#0f766e', icon: 'checkmark-circle-outline',    emoji: '✅' },
  cancelada:          { label: 'Cancelada',             color: '#64748b', bg: '#f8fafc', dark: '#475569', icon: 'close-circle-outline',        emoji: '⚫' },
}

const ORDEN_ESTADOS: EstadoCita[] = [
  'por_contactar', 'primer_contacto', 'buscando_opciones',
  'en_coordinacion', 'coordinada', 'reagendada',
  'no_responde_asesor', 'realizada', 'cancelada',
]

const COL_W = 240  // ancho de cada columna kanban

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFecha(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatHora(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function formatDia(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  const man = new Date(hoy); man.setDate(hoy.getDate() + 1)
  if (d.toDateString() === man.toDateString()) return 'Mañana'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
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
  let p = tel.replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  return p || tel
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Error', msg)
}

// ─── DropdownSelector ─────────────────────────────────────────────────────────

function DropdownSelector({
  label, value, options, onSelect, placeholder = 'Sin asignar', searchable = false,
}: {
  label: string; value: string
  options: { id: string; nombre: string }[]
  onSelect: (id: string) => void; placeholder?: string; searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busquedaDD, setBusquedaDD] = useState('')
  const selected = options.find(o => o.id === value)
  const cerrar = () => { setOpen(false); setBusquedaDD('') }
  const opcionesFiltradas = searchable && busquedaDD.trim()
    ? options.filter(o => o.nombre?.toLowerCase().includes(busquedaDD.trim().toLowerCase()))
    : options
  return (
    <>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.dropdownBtn} onPress={() => setOpen(true)}>
        <Text style={[s.dropdownBtnTxt, !selected && { color: '#94a3b8' }]}>
          {selected ? selected.nombre : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={cerrar}>
        <TouchableOpacity style={s.ddOverlay} activeOpacity={1} onPress={cerrar}>
          <View style={s.ddSheet}>
            <Text style={s.ddTitle}>{label}</Text>
            {searchable && (
              <TextInput
                style={[s.input, { marginBottom: 10 }]}
                placeholder="Buscar..."
                value={busquedaDD}
                onChangeText={setBusquedaDD}
                autoFocus
              />
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={s.ddOption} onPress={() => { onSelect(''); cerrar() }}>
                <Text style={[s.ddOptionTxt, !value && { color: '#1a6470', fontWeight: '700' }]}>{placeholder}</Text>
                {!value && <Ionicons name="checkmark" size={16} color="#1a6470" />}
              </TouchableOpacity>
              {opcionesFiltradas.filter(o => o.nombre?.trim()).map(o => (
                <TouchableOpacity key={o.id} style={s.ddOption} onPress={() => { onSelect(o.id); cerrar() }}>
                  <Text style={[s.ddOptionTxt, value === o.id && { color: '#1a6470', fontWeight: '700' }]}>{o.nombre}</Text>
                  {value === o.id && <Ionicons name="checkmark" size={16} color="#1a6470" />}
                </TouchableOpacity>
              ))}
              {searchable && opcionesFiltradas.length === 0 && (
                <Text style={{ fontSize: 13, color: '#94a3b8', paddingVertical: 12, textAlign: 'center' }}>
                  Sin resultados
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

// ─── ModalEdicion ─────────────────────────────────────────────────────────────

function ModalEdicion({
  cita, admins, asesores, onClose, onGuardar, onEliminar,
}: {
  cita: Cita | null; admins: Profile[]; asesores: Profile[]; onClose: () => void; onGuardar: () => void; onEliminar: (cita: Cita) => void
}) {
  const [estado, setEstado]               = useState<EstadoCita>(cita?.estado ?? 'por_contactar')
  const [notas, setNotas]                 = useState(cita?.notas ?? '')
  const [fechaTexto, setFechaTexto]       = useState(
    cita?.fecha_cita ? new Date(cita.fecha_cita).toISOString().slice(0, 16) : ''
  )
  const [coordinadorId, setCoordinadorId] = useState(cita?.coordinado_por ?? '')
  const [asesorId, setAsesorId]           = useState(cita?.asesor_id ?? '')
  const [telefono, setTelefono]           = useState(cita?.clientes?.telefono ?? '')
  const [guardando, setGuardando]         = useState(false)

  async function guardar() {
    if (!cita) return
    setGuardando(true)
    if (telefono.trim() && telefono.trim() !== cita.clientes.telefono) {
      const { error } = await supabase.from('clientes').update({ telefono: telefono.trim() }).eq('id', cita.cliente_id)
      if (error) { alerta(error.message); setGuardando(false); return }
    }
    const { data: upd, error } = await supabase.from('citas_coordinacion').update({
      estado,
      notas: notas.trim() || null,
      coordinado_por: coordinadorId || null,
      asesor_id: asesorId || null,
      fecha_cita: fechaTexto ? new Date(fechaTexto).toISOString() : null,
    }).eq('id', cita.id).select('id')
    setGuardando(false)
    if (error) { alerta(error.message); return }
    if (!upd || upd.length === 0) { alerta('No se pudo guardar. Verifica tu sesión e intenta de nuevo.'); return }
    onGuardar(); onClose()
  }

  if (!cita) return null
  const inf = ESTADOS_CITA[estado]

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={e => e.stopPropagation()}>
          <View style={s.sheetHandle} />
          <View style={s.clienteHead}>
            <View style={[s.avatar, { backgroundColor: inf.bg }]}>
              <Text style={[s.avatarTxt, { color: inf.color }]}>{iniciales(cita.clientes.nombre)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clienteNombre}>{cita.clientes.nombre}</Text>
              <TextInput style={s.telInput} value={telefono} onChangeText={setTelefono}
                keyboardType="phone-pad" placeholder="Teléfono" placeholderTextColor="#94a3b8" />
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.fieldLabel}>Estado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {ORDEN_ESTADOS.map(e => {
                  const i = ESTADOS_CITA[e]; const activo = estado === e
                  return (
                    <TouchableOpacity key={e}
                      style={[s.estadoChip, activo && { backgroundColor: i.color, borderColor: i.color }]}
                      onPress={() => setEstado(e)}>
                      <Text style={{ fontSize: 12 }}>{i.emoji}</Text>
                      <Text style={[s.estadoChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>{i.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Fecha de cita</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input type="datetime-local" value={fechaTexto} onChange={(e: any) => setFechaTexto(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                  fontSize: 14, color: '#1e293b', backgroundColor: '#fff', marginBottom: 14,
                  outline: 'none', boxSizing: 'border-box' }} />
            ) : (
              <TextInput style={[s.input, { marginBottom: 14 }]} placeholder="YYYY-MM-DD HH:MM"
                value={fechaTexto} onChangeText={setFechaTexto} keyboardType="numbers-and-punctuation" />
            )}

            <DropdownSelector label="Coordinado por" value={coordinadorId}
              options={admins.filter(a => a.nombre?.trim())} onSelect={setCoordinadorId} />

            <DropdownSelector label="Atiende / Atendido por" value={asesorId}
              options={asesores} onSelect={setAsesorId} searchable />

            <Text style={s.fieldLabel}>Notas de coordinación</Text>
            <TextInput style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 10, marginBottom: 16 }]}
              placeholder="Detalles, condiciones, observaciones..."
              value={notas} onChangeText={setNotas} multiline />

            <View style={s.infoBox}>
              {cita.prospectador && (
                <Text style={s.infoRow}><Text style={s.infoLabel}>Prospectador: </Text>{cita.prospectador.nombre}</Text>
              )}
              {cita.propiedad && (
                <Text style={s.infoRow}><Text style={s.infoLabel}>Proyecto: </Text>{cita.propiedad.titulo}</Text>
              )}
              <Text style={s.infoRow}><Text style={s.infoLabel}>Agregada: </Text>{formatFecha(cita.created_at)}</Text>
              <Text style={s.infoRow}><Text style={s.infoLabel}>Actualizada: </Text>{tiempoRelativo(cita.updated_at)}</Text>
            </View>

            <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnGuardarTxt}>Guardar cambios</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.btnEliminar} onPress={() => onEliminar(cita)} disabled={guardando}>
              <Ionicons name="trash-outline" size={16} color="#c0392b" />
              <Text style={s.btnEliminarTxt}>Eliminar cita</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── ModalNuevaCita ───────────────────────────────────────────────────────────

function ModalNuevaCita({ admins, asesores, onClose, onGuardar }: {
  admins: Profile[]; asesores: Profile[]; onClose: () => void; onGuardar: () => void
}) {
  const [busqueda, setBusqueda]               = useState('')
  const [clientes, setClientes]               = useState<{ id: string; nombre: string; telefono: string }[]>([])
  const [clienteId, setClienteId]             = useState('')
  const [clienteNombre, setClienteNombre]     = useState('')
  const [modoNuevo, setModoNuevo]             = useState(false)
  const [nuevoNombre, setNuevoNombre]         = useState('')
  const [nuevoTelefono, setNuevoTelefono]     = useState('')
  const [estado, setEstado]                   = useState<EstadoCita>('por_contactar')
  const [notas, setNotas]                     = useState('')
  const [fechaTexto, setFechaTexto]           = useState('')
  const [coordinadorId, setCoordinadorId]     = useState('')
  const [asesorId, setAsesorId]               = useState('')
  const [prospectadorId, setProspectadorId]   = useState('')
  const [prospectadores, setProspectadores]   = useState<Profile[]>([])
  const [guardando, setGuardando]             = useState(false)
  const [buscando, setBuscando]               = useState(false)

  useState(() => {
    supabase.from('profiles').select('id, nombre').neq('role', 'admin')
      .then(({ data }) => setProspectadores((data ?? []).filter(p => p.nombre?.trim())))
  })

  const buscarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onBusqueda(txt: string) {
    setBusqueda(txt)
    if (buscarDebounce.current) clearTimeout(buscarDebounce.current)
    if (txt.trim().length < 2) { setClientes([]); return }
    buscarDebounce.current = setTimeout(async () => {
      setBuscando(true)
      const { data } = await supabase.from('clientes').select('id, nombre, telefono')
        .ilike('nombre', `%${txt}%`).limit(8)
      setClientes(data ?? [])
      setBuscando(false)
    }, 300)
  }

  async function guardar() {
    setGuardando(true)
    try {
      let idFinal = clienteId
      if (modoNuevo) {
        if (!nuevoNombre.trim() || !nuevoTelefono.trim()) {
          alerta('Nombre y teléfono son obligatorios.'); setGuardando(false); return
        }
        const { data: { user } } = await supabase.auth.getUser()
        const { data: nuevo, error: errC } = await supabase.from('clientes').insert({
          nombre: nuevoNombre.trim(), telefono: nuevoTelefono.trim(),
          fuente_lead: 'otro', estado: 'por_perfilar',
          responsable_id: prospectadorId || user!.id,
        }).select('id').single()
        if (errC) { alerta(errC.message); setGuardando(false); return }
        idFinal = nuevo.id
      } else if (!clienteId) {
        alerta('Selecciona o crea un cliente.'); setGuardando(false); return
      }
      const { error } = await supabase.from('citas_coordinacion').insert({
        cliente_id: idFinal,
        prospectador_id: prospectadorId || null,
        coordinado_por: coordinadorId || null,
        asesor_id: asesorId || null,
        estado, notas: notas.trim() || null,
        fecha_cita: fechaTexto ? new Date(fechaTexto).toISOString() : null,
      })
      if (error) { alerta(error.message); setGuardando(false); return }
      onGuardar(); onClose()
    } catch (e: any) { alerta(e.message) } finally { setGuardando(false) }
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
            <View style={s.modoToggle}>
              <TouchableOpacity style={[s.modoBtn, !modoNuevo && s.modoBtnActivo]}
                onPress={() => { setModoNuevo(false); setNuevoNombre(''); setNuevoTelefono('') }}>
                <Ionicons name="search-outline" size={13} color={!modoNuevo ? '#fff' : '#64748b'} />
                <Text style={[s.modoBtnTxt, !modoNuevo && { color: '#fff', fontWeight: '700' }]}>Buscar existente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modoBtn, modoNuevo && s.modoBtnActivo]}
                onPress={() => { setModoNuevo(true); setClienteId(''); setClienteNombre(''); setBusqueda('') }}>
                <Ionicons name="person-add-outline" size={13} color={modoNuevo ? '#fff' : '#64748b'} />
                <Text style={[s.modoBtnTxt, modoNuevo && { color: '#fff', fontWeight: '700' }]}>Crear nuevo</Text>
              </TouchableOpacity>
            </View>

            {modoNuevo ? (
              <>
                <Text style={s.fieldLabel}>Nombre *</Text>
                <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Nombre completo"
                  value={nuevoNombre} onChangeText={setNuevoNombre} autoCapitalize="words" />
                <Text style={s.fieldLabel}>Teléfono *</Text>
                <TextInput style={[s.input, { marginBottom: 14 }]} placeholder="Ej. 7821954946"
                  value={nuevoTelefono} onChangeText={setNuevoTelefono} keyboardType="phone-pad" />
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
                    <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Buscar por nombre..."
                      value={busqueda} onChangeText={onBusqueda} autoCapitalize="words" />
                    {buscando && <ActivityIndicator size="small" color="#1a6470" style={{ marginBottom: 8 }} />}
                    {clientes.map(c => (
                      <TouchableOpacity key={c.id} style={s.clienteRow}
                        onPress={() => { setClienteId(c.id); setClienteNombre(c.nombre); setClientes([]) }}>
                        <Text style={s.clienteRowNombre}>{c.nombre}</Text>
                        <Text style={s.clienteRowTel}>{c.telefono}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            <Text style={[s.fieldLabel, { marginTop: 14 }]}>Estado inicial</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {ORDEN_ESTADOS.map(e => {
                  const i = ESTADOS_CITA[e]; const activo = estado === e
                  return (
                    <TouchableOpacity key={e}
                      style={[s.estadoChip, activo && { backgroundColor: i.color, borderColor: i.color }]}
                      onPress={() => setEstado(e)}>
                      <Text style={{ fontSize: 12 }}>{i.emoji}</Text>
                      <Text style={[s.estadoChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>{i.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Fecha de cita</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input type="datetime-local" value={fechaTexto} onChange={(e: any) => setFechaTexto(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                  fontSize: 14, color: '#1e293b', backgroundColor: '#fff', marginBottom: 14,
                  outline: 'none', boxSizing: 'border-box' }} />
            ) : (
              <TextInput style={[s.input, { marginBottom: 14 }]} placeholder="YYYY-MM-DD HH:MM"
                value={fechaTexto} onChangeText={setFechaTexto} keyboardType="numbers-and-punctuation" />
            )}

            <DropdownSelector label="Coordinado por" value={coordinadorId}
              options={admins.filter(a => a.nombre?.trim())} onSelect={setCoordinadorId} />
            <DropdownSelector label="Atiende / Atendido por" value={asesorId}
              options={asesores} onSelect={setAsesorId} searchable />
            <DropdownSelector label="Prospectador" value={prospectadorId}
              options={prospectadores} onSelect={setProspectadorId} searchable />

            <Text style={s.fieldLabel}>Notas</Text>
            <TextInput style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 10, marginBottom: 24 }]}
              placeholder="Detalles, condiciones..." value={notas} onChangeText={setNotas} multiline />

            <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnGuardarTxt}>Agregar cita</Text>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── ModalMover (cambio rápido de columna) ────────────────────────────────────

function ModalMover({ cita, onClose, onMover }: {
  cita: Cita | null; onClose: () => void; onMover: (cita: Cita, estado: EstadoCita) => void
}) {
  if (!cita) return null
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.sheet, { paddingBottom: 32 }]} onPress={e => e.stopPropagation()}>
          <View style={s.sheetHandle} />
          <Text style={[s.sheetTitulo, { marginBottom: 4 }]}>Mover cita</Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }} numberOfLines={1}>
            {cita.clientes.nombre}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {ORDEN_ESTADOS.map(e => {
              const inf = ESTADOS_CITA[e]
              const esActual = cita.estado === e
              return (
                <TouchableOpacity
                  key={e}
                  style={[s.moverRow, esActual && { backgroundColor: inf.bg }]}
                  onPress={() => { if (!esActual) { onMover(cita, e); onClose() } }}
                  disabled={esActual}
                >
                  <View style={[s.moverDot, { backgroundColor: inf.color }]} />
                  <Text style={{ fontSize: 14, color: esActual ? inf.color : '#1e293b', fontWeight: esActual ? '800' : '500', flex: 1 }}>
                    {inf.emoji} {inf.label}
                  </Text>
                  {esActual && (
                    <View style={[s.actualBadge, { backgroundColor: inf.color }]}>
                      <Text style={s.actualBadgeTxt}>Actual</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────

function KanbanCard({ cita, onPress, onLongPress, onDragStart, isDragging }: {
  cita: Cita
  onPress: () => void
  onLongPress: () => void
  onDragStart?: (c: Cita) => void
  isDragging?: boolean
}) {
  const inf     = ESTADOS_CITA[cita.estado]
  const ahora   = Date.now()
  const esPasada  = cita.fecha_cita && new Date(cita.fecha_cita) < new Date()
  const esUrgente = cita.estado === 'coordinada' && cita.fecha_cita &&
    new Date(cita.fecha_cita).getTime() - ahora < 48 * 3600 * 1000 &&
    new Date(cita.fecha_cita).getTime() > ahora
  const dia    = formatDia(cita.fecha_cita)
  const hora   = formatHora(cita.fecha_cita)

  const isWebDrag = Platform.OS === 'web' && !!onDragStart

  const card = (
    <TouchableOpacity
      style={[kc.card, esUrgente && kc.cardUrgente, !isWebDrag && isDragging && kc.cardDragging, isWebDrag && { marginBottom: 0 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.85}
    >
      {/* Barra de color lateral */}
      <View style={[kc.colorBar, { backgroundColor: inf.color }]} />

      <View style={kc.body}>
        {/* Nombre + avatar */}
        <View style={kc.headRow}>
          <View style={[kc.avatar, { backgroundColor: inf.bg }]}>
            <Text style={[kc.avatarTxt, { color: inf.color }]}>{iniciales(cita.clientes.nombre)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={kc.nombre} numberOfLines={1}>{cita.clientes.nombre}</Text>
            <Text style={kc.tel}>{normalizarTel(cita.clientes.telefono)}</Text>
          </View>
        </View>

        {/* Fecha de cita */}
        {cita.fecha_cita && (
          <View style={[
            kc.fechaRow,
            esPasada && cita.estado !== 'realizada' && kc.fechaPasada,
            esUrgente && kc.fechaUrgente,
          ]}>
            <Ionicons
              name={esPasada && cita.estado !== 'realizada' ? 'warning-outline' : 'calendar-outline'}
              size={11}
              color={esPasada && cita.estado !== 'realizada' ? '#dc2626' : esUrgente ? '#d97706' : '#1a6470'}
            />
            <Text style={[
              kc.fechaTxt,
              esPasada && cita.estado !== 'realizada' && { color: '#dc2626' },
              esUrgente && { color: '#92400e' },
            ]}>
              {dia}{hora ? ` · ${hora}` : ''}
            </Text>
          </View>
        )}

        {/* Notas preview */}
        {cita.notas && (
          <Text style={kc.notas} numberOfLines={2}>{cita.notas}</Text>
        )}

        {/* Proyecto */}
        {cita.propiedad && (
          <View style={kc.proyectoRow}>
            <Ionicons name="business-outline" size={10} color="#0d9488" />
            <Text style={kc.proyectoTxt} numberOfLines={1}>{cita.propiedad.titulo}</Text>
          </View>
        )}

        {/* Meta: asesor / coordinador / tiempo */}
        <View style={kc.metaRow}>
          {cita.prospectador && (
            <Text style={kc.metaTxt} numberOfLines={1}>
              <Ionicons name="person-outline" size={9} color="#94a3b8" /> {cita.prospectador.nombre.split(' ')[0]}
            </Text>
          )}
          {cita.coordinador && (
            <Text style={[kc.metaTxt, { color: '#1a6470' }]} numberOfLines={1}>
              <Ionicons name="shield-checkmark-outline" size={9} color="#1a6470" /> {cita.coordinador.nombre.split(' ')[0]}
            </Text>
          )}
          {cita.asesor && (
            <Text style={[kc.metaTxt, { color: '#7c3aed' }]} numberOfLines={1}>
              <Ionicons name="briefcase-outline" size={9} color="#7c3aed" /> {cita.asesor.nombre.split(' ')[0]}
            </Text>
          )}
          <Text style={[kc.metaTxt, { marginLeft: 'auto' as any, color: '#94a3b8' }]}>
            {tiempoRelativo(cita.updated_at)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  if (isWebDrag) {
    return createElement('div', {
      draggable: true,
      onDragStart: (e: any) => { e.dataTransfer.effectAllowed = 'move'; onDragStart!(cita) },
      style: { marginBottom: 8, cursor: 'grab', opacity: isDragging ? 0.45 : 1 },
    }, card)
  }

  return card
}

const kc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardUrgente:  { borderWidth: 1.5, borderColor: '#fbbf24' },
  cardDragging: { opacity: 0.45 },
  colorBar:    { width: 4 },
  body:        { flex: 1, padding: 10, gap: 5 },
  headRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt:   { fontSize: 11, fontWeight: '800' },
  nombre:      { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  tel:         { fontSize: 11, color: '#64748b' },
  fechaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdfa', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  fechaPasada: { backgroundColor: '#fef2f2' },
  fechaUrgente:{ backgroundColor: '#fffbeb' },
  fechaTxt:    { fontSize: 11, color: '#1a6470', fontWeight: '600' },
  notas:       { fontSize: 11, color: '#64748b', lineHeight: 15 },
  proyectoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proyectoTxt: { fontSize: 10, color: '#0d9488', fontWeight: '600' },
  metaRow:     { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  metaTxt:     { fontSize: 10, color: '#94a3b8' },
})

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({ estado, citas, onCardPress, onCardLongPress, draggingCita, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop }: {
  estado: EstadoCita
  citas: Cita[]
  onCardPress: (c: Cita) => void
  onCardLongPress: (c: Cita) => void
  draggingCita?: Cita | null
  isDragOver?: boolean
  onDragStart?: (c: Cita) => void
  onDragOver?: () => void
  onDragLeave?: () => void
  onDrop?: () => void
}) {
  const inf = ESTADOS_CITA[estado]
  const dragCounter = useRef(0)

  const inner = (
    <View style={[col.wrap, { width: COL_W }, Platform.OS === 'web' && { marginRight: 0 }]}>
      {/* Cabecera de columna */}
      <View style={[col.header, { borderTopColor: inf.color }, isDragOver && { borderTopWidth: 4, borderTopColor: inf.color }]}>
        <View style={[col.headerDot, { backgroundColor: inf.color }]} />
        <Text style={col.headerTxt} numberOfLines={1}>{inf.label}</Text>
        <View style={[col.headerCnt, { backgroundColor: inf.color + '22' }]}>
          <Text style={[col.headerCntTxt, { color: inf.color }]}>{citas.length}</Text>
        </View>
      </View>

      {/* Tarjetas */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[col.list, isDragOver && { backgroundColor: inf.color + '11', borderRadius: 8 }]}
        nestedScrollEnabled
      >
        {citas.length === 0 ? (
          <View style={[col.empty, isDragOver && { borderWidth: 2, borderColor: inf.color + '44', borderStyle: 'dashed', borderRadius: 8 }]}>
            <Text style={[col.emptyTxt, isDragOver && { color: inf.color }]}>
              {isDragOver ? `Mover aquí` : 'Sin citas'}
            </Text>
          </View>
        ) : (
          citas.map(c => (
            <KanbanCard
              key={c.id}
              cita={c}
              onPress={() => onCardPress(c)}
              onLongPress={() => onCardLongPress(c)}
              onDragStart={onDragStart}
              isDragging={draggingCita?.id === c.id}
            />
          ))
        )}
      </ScrollView>
    </View>
  )

  if (Platform.OS !== 'web') return inner

  return createElement('div', {
    style: { width: COL_W, marginRight: 10, display: 'flex', flexDirection: 'column', flexShrink: 0 },
    onDragEnter: (e: any) => { e.preventDefault(); dragCounter.current++; if (dragCounter.current === 1) onDragOver?.() },
    onDragOver: (e: any) => { e.preventDefault() },
    onDragLeave: () => { dragCounter.current--; if (dragCounter.current === 0) onDragLeave?.() },
    onDrop: (e: any) => { e.preventDefault(); dragCounter.current = 0; onDrop?.() },
  }, inner)
}

const col = StyleSheet.create({
  wrap:       { marginRight: 10, flex: 1 },
  header:     {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 8,
    borderTopWidth: 3,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  headerDot:    { width: 8, height: 8, borderRadius: 4 },
  headerTxt:    { flex: 1, fontSize: 12, fontWeight: '800', color: '#1e293b' },
  headerCnt:    { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2 },
  headerCntTxt: { fontSize: 12, fontWeight: '900' },
  list:         { paddingBottom: 120 },
  empty:        { alignItems: 'center', paddingVertical: 20 },
  emptyTxt:     { fontSize: 12, color: '#cbd5e1' },
})

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function CoordinacionCitas() {
  const [citas, setCitas]               = useState<Cita[]>([])
  const [admins, setAdmins]             = useState<Profile[]>([])
  const [asesores, setAsesores]         = useState<Profile[]>([])
  const [miId, setMiId]                 = useState<string | null>(null)
  const [miRole, setMiRole]             = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [citaEditando, setCitaEditando] = useState<Cita | null>(null)
  const [citaMoviendo, setCitaMoviendo] = useState<Cita | null>(null)
  const [modalNueva, setModalNueva]     = useState(false)
  const [busqueda, setBusqueda]         = useState('')
  const [filtroAdmin, setFiltroAdmin]   = useState<string | null>(null)
  const [showSearch, setShowSearch]     = useState(false)
  const [draggingCita, setDraggingCita] = useState<Cita | null>(null)
  const [dragOverEstado, setDragOverEstado] = useState<EstadoCita | null>(null)
  const mountedRef = useRef(true)
  const defaultFiltroAplicado = useRef(false)

  async function cargar() {
    const { data } = await supabase
      .from('citas_coordinacion')
      .select(`
        *,
        clientes ( nombre, telefono, tipo_operacion, estado ),
        prospectador:profiles!citas_coordinacion_prospectador_id_fkey ( nombre ),
        coordinador:profiles!citas_coordinacion_coordinado_por_fkey ( nombre ),
        asesor:profiles!citas_coordinacion_asesor_id_fkey ( nombre ),
        propiedad:propiedades ( titulo )
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

  async function cargarAsesores() {
    const { data } = await supabase.from('profiles').select('id, nombre').eq('role', 'asesor')
    if (mountedRef.current) setAsesores((data ?? []).filter(a => a.nombre?.trim()))
  }

  async function cargarMiPerfil() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (mountedRef.current) { setMiId(user.id); setMiRole(perfil?.role ?? null) }
  }

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    setLoading(true)
    cargar()
    cargarAdmins()
    cargarAsesores()
    cargarMiPerfil()

    const ch = supabase.channel('citas-kanban-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas_coordinacion' }, () => cargar())
      .subscribe()

    return () => { mountedRef.current = false; supabase.removeChannel(ch) }
  }, []))

  // Admin: por defecto solo ve sus propias citas (las que él coordina),
  // pero puede cambiar el filtro libremente con los chips de abajo.
  useEffect(() => {
    if (miRole === 'admin' && miId && !defaultFiltroAplicado.current) {
      setFiltroAdmin(miId)
      defaultFiltroAplicado.current = true
    }
  }, [miRole, miId])

  async function moverCita(cita: Cita, nuevoEstado: EstadoCita) {
    setCitas(prev => prev.map(c => c.id === cita.id ? { ...c, estado: nuevoEstado, updated_at: new Date().toISOString() } : c))
    const { data, error } = await supabase
      .from('citas_coordinacion')
      .update({ estado: nuevoEstado })
      .eq('id', cita.id)
      .select('id, estado')
    if (error) { alerta(error.message); cargar(); return }
    if (!data || data.length === 0) { alerta('No se pudo cambiar el estado. Intenta de nuevo.'); cargar() }
  }

  function confirmarEliminarCita(cita: Cita) {
    const mensaje = `¿Eliminar la cita de "${cita.clientes.nombre}"? Esta acción no se puede deshacer.`
    if (Platform.OS === 'web') {
      if (window.confirm(mensaje)) eliminarCita(cita)
    } else {
      Alert.alert('Eliminar cita', mensaje, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarCita(cita) },
      ])
    }
  }

  async function eliminarCita(cita: Cita) {
    const { error } = await supabase.from('citas_coordinacion').delete().eq('id', cita.id)
    if (error) { alerta(error.message); return }
    setCitas(prev => prev.filter(c => c.id !== cita.id))
    setCitaEditando(null)
  }

  // ── Filtros ──────────────────────────────────────────────────────────────
  const citasFiltradas = citas.filter(c => {
    if (filtroAdmin) {
      if (filtroAdmin === 'sin_asignar' && c.coordinado_por) return false
      if (filtroAdmin !== 'sin_asignar' && c.coordinado_por !== filtroAdmin) return false
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      return (
        c.clientes.nombre.toLowerCase().includes(q) ||
        c.clientes.telefono.includes(q) ||
        c.prospectador?.nombre.toLowerCase().includes(q) ||
        c.coordinador?.nombre.toLowerCase().includes(q) ||
        false
      )
    }
    return true
  })

  // ── Conteos por estado ────────────────────────────────────────────────────
  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = citasFiltradas.filter(c => c.estado === e).length
    return acc
  }, {})

  const ahora   = Date.now()
  const urgentes = citas.filter(c =>
    c.estado === 'coordinada' && c.fecha_cita &&
    new Date(c.fecha_cita).getTime() - ahora < 48 * 3600 * 1000 &&
    new Date(c.fecha_cita).getTime() > ahora
  ).length

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Ionicons name="arrow-back" size={22} color="#1a6470" />
        </TouchableOpacity>

        <Text style={s.headerTitle}>Citas</Text>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            style={[s.headerBtn, showSearch && { backgroundColor: '#1a6470' }]}
            onPress={() => setShowSearch(v => !v)}
          >
            <Ionicons name="search-outline" size={18} color={showSearch ? '#fff' : '#1a6470'} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#059669', borderColor: '#059669' }]}
            onPress={() => setModalNueva(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar ── */}
      {showSearch && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar por nombre, teléfono, asesor..."
            value={busqueda}
            onChangeText={setBusqueda}
            autoFocus
            clearButtonMode="while-editing"
          />
          {busqueda ? (
            <TouchableOpacity onPress={() => setBusqueda('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ── KPI strip ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.kpiScroll} contentContainerStyle={s.kpiContent}>
        {/* Total */}
        <View style={[s.kpiPill, { borderColor: '#1a6470' }]}>
          <Text style={[s.kpiPillN, { color: '#1a6470' }]}>{citasFiltradas.length}</Text>
          <Text style={s.kpiPillL}>TOTAL</Text>
        </View>
        {urgentes > 0 && (
          <View style={[s.kpiPill, { borderColor: '#f59e0b' }]}>
            <Text style={[s.kpiPillN, { color: '#f59e0b' }]}>⚡ {urgentes}</Text>
            <Text style={s.kpiPillL}>PRÓX. 48H</Text>
          </View>
        )}
        {ORDEN_ESTADOS.map(e => {
          const inf = ESTADOS_CITA[e]
          const n = conteos[e] ?? 0
          if (n === 0) return null
          return (
            <View key={e} style={[s.kpiPill, { borderColor: inf.color + '66' }]}>
              <Text style={[s.kpiPillN, { color: inf.color }]}>{n}</Text>
              <Text style={[s.kpiPillL, { color: inf.color }]} numberOfLines={1}>{inf.label.split(' ').slice(0,2).join(' ')}</Text>
            </View>
          )
        })}
      </ScrollView>

      {/* ── Filtro por admin ── */}
      {miRole !== 'asesor' && admins.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.adminScroll} contentContainerStyle={s.adminContent}>
          {[
            { id: null,           label: 'Todos', cnt: citasFiltradas.length },
            ...admins.map(a => ({ id: a.id, label: a.nombre, cnt: citas.filter(c => c.coordinado_por === a.id).length })),
            ...(citas.some(c => !c.coordinado_por) ? [{ id: 'sin_asignar', label: 'Sin asignar', cnt: citas.filter(c => !c.coordinado_por).length }] : []),
          ].map(item => {
            const activo = filtroAdmin === item.id
            return (
              <TouchableOpacity key={String(item.id)} style={[s.adminChip, activo && s.adminChipActivo]}
                onPress={() => setFiltroAdmin(activo ? null : item.id as string)}>
                <Text style={[s.adminChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>
                  {item.label} · {item.cnt}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* ── Board kanban ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#1a6470" />
          <Text style={{ color: '#94a3b8', fontSize: 13 }}>Cargando pipeline…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={s.boardContent}
          style={s.board}
          decelerationRate="fast"
        >
          {ORDEN_ESTADOS.map(estado => (
            <KanbanColumn
              key={estado}
              estado={estado}
              citas={citasFiltradas.filter(c => c.estado === estado)}
              onCardPress={setCitaEditando}
              onCardLongPress={setCitaMoviendo}
              draggingCita={draggingCita}
              isDragOver={dragOverEstado === estado}
              onDragStart={setDraggingCita}
              onDragOver={() => setDragOverEstado(estado)}
              onDragLeave={() => setDragOverEstado(null)}
              onDrop={() => {
                if (draggingCita && draggingCita.estado !== estado) {
                  moverCita(draggingCita, estado)
                }
                setDraggingCita(null)
                setDragOverEstado(null)
              }}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Modales — renderizado condicional para que el estado local
           se inicialice fresco con los datos reales de cada cita ── */}
      {citaEditando && (
        <ModalEdicion
          cita={citaEditando}
          admins={admins}
          asesores={asesores}
          onClose={() => setCitaEditando(null)}
          onGuardar={cargar}
          onEliminar={confirmarEliminarCita}
        />
      )}
      {citaMoviendo && (
        <ModalMover
          cita={citaMoviendo}
          onClose={() => setCitaMoviendo(null)}
          onMover={moverCita}
        />
      )}
      {modalNueva && (
        <ModalNuevaCita
          admins={admins}
          asesores={asesores}
          onClose={() => setModalNueva(false)}
          onGuardar={cargar}
        />
      )}
    </View>
  )
}

// ─── Estilos globales ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b' },

  // KPI strip
  kpiScroll:   { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  kpiContent:  { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  kpiPill:     { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56 },
  kpiPillN:    { fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
  kpiPillL:    { fontSize: 8, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.3, marginTop: 1 },

  // Admin filter
  adminScroll:  { flexGrow: 0, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  adminContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  adminChip:    {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff',
  },
  adminChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  adminChipTxt:    { fontSize: 12, color: '#64748b', fontWeight: '500' },

  // Board
  board:        { flex: 1, backgroundColor: '#f1f5f9' },
  boardContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 40, flexDirection: 'row' },

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

  clienteHead:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  clienteNombre:{ fontSize: 16, fontWeight: '700', color: '#0f172a' },
  telInput: {
    fontSize: 13, color: '#64748b', marginTop: 2,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 2,
  },
  avatar:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '800' },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1,
    borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#1e293b',
  },
  estadoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  estadoChipTxt: { fontSize: 11, color: '#64748b', fontWeight: '500' },

  infoBox:  { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 16, gap: 4 },
  infoRow:  { fontSize: 12, color: '#64748b', lineHeight: 18 },
  infoLabel:{ fontWeight: '700', color: '#475569' },

  btnGuardar:    { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnEliminar:   { flexDirection: 'row', gap: 6, backgroundColor: '#fef2f0', borderRadius: 12, borderWidth: 1, borderColor: '#fbd9d2', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 24 },
  btnEliminarTxt: { color: '#c0392b', fontSize: 14, fontWeight: '700' },

  // Modal nueva cita
  modoToggle:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modoBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  modoBtnActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  modoBtnTxt:  { fontSize: 13, color: '#64748b' },
  clienteSeleccionado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e0f4f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 4 },
  clienteSelNombre:    { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  clienteRow:          { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  clienteRowNombre:    { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  clienteRowTel:       { fontSize: 12, color: '#64748b', marginTop: 2 },

  // Dropdown
  dropdownBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14 },
  dropdownBtnTxt: { fontSize: 14, color: '#1e293b' },
  ddOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  ddSheet:        { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '60%' },
  ddTitle:        { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  ddOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ddOptionTxt:    { fontSize: 14, color: '#334155' },

  // ModalMover
  moverRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 10, marginBottom: 2 },
  moverDot:   { width: 12, height: 12, borderRadius: 6 },
  actualBadge:{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actualBadgeTxt: { fontSize: 10, color: '#fff', fontWeight: '800' },
})
