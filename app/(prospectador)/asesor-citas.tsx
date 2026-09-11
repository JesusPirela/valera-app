// Pantalla de citas para el ASESOR (mobile-first). Muestra SOLO las citas que
// le asignaron (RLS: asesor_id = él). Dos vistas: Lista (tarjetas, cómoda en
// teléfono) y Tablero (columnas por etapa, como el dashboard). Puede mover la
// etapa de sus citas y agregar una nueva, que entra PENDIENTE DE APROBACIÓN
// hasta que un admin la apruebe.
import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

type Estado =
  | 'por_contactar' | 'primer_contacto' | 'buscando_opciones' | 'en_coordinacion'
  | 'coordinada' | 'reagendada' | 'no_responde_asesor' | 'realizada'
  | 'aparto' | 'recaudando_documentacion' | 'aprobando_credito' | 'firma_contrato'
  | 'escrituracion' | 'cancelada'

const ESTADOS: Record<Estado, { label: string; color: string; emoji: string }> = {
  por_contactar:            { label: 'Perfilado sin fecha',    color: '#3b82f6', emoji: '🔵' },
  primer_contacto:          { label: 'Contactando',            color: '#8b5cf6', emoji: '🟣' },
  buscando_opciones:        { label: 'Buscando opciones',      color: '#ca8a04', emoji: '🟡' },
  en_coordinacion:          { label: 'En coordinación',        color: '#f97316', emoji: '🟠' },
  coordinada:               { label: 'Coordinada',             color: '#16a34a', emoji: '🟢' },
  reagendada:               { label: 'Reagendada',             color: '#b45309', emoji: '🟤' },
  no_responde_asesor:       { label: 'No responde',            color: '#dc2626', emoji: '🔴' },
  realizada:                { label: 'Realizada',              color: '#0d9488', emoji: '✅' },
  aparto:                   { label: 'Apartó / cerró',         color: '#c87f0a', emoji: '🏆' },
  recaudando_documentacion: { label: 'Documentación',          color: '#0369a1', emoji: '📄' },
  aprobando_credito:        { label: 'Aprobando crédito',      color: '#d97706', emoji: '💳' },
  firma_contrato:           { label: 'Firma de contrato',      color: '#059669', emoji: '✍️' },
  escrituracion:            { label: 'Escrituración',          color: '#c2410c', emoji: '🏠' },
  cancelada:                { label: 'Cancelada',              color: '#64748b', emoji: '⚫' },
}
// Orden de etapas para el tablero y el selector (todas, para no ocultar ninguna).
const ORDEN: Estado[] = [
  'por_contactar', 'primer_contacto', 'buscando_opciones', 'en_coordinacion',
  'coordinada', 'reagendada', 'no_responde_asesor', 'realizada',
  'aparto', 'recaudando_documentacion', 'aprobando_credito', 'firma_contrato', 'escrituracion', 'cancelada',
]

type Cita = {
  id: string; cliente_id: string; estado: Estado; fecha_cita: string | null
  notas: string | null; propiedad_externa: string | null; pendiente_aprobacion: boolean
  clientes: { nombre: string; telefono: string | null; tipo_operacion: string | null } | null
  prospectador: { nombre: string } | null
  propiedad: { titulo: string } | null
}
type ClienteMini = { id: string; nombre: string; telefono: string | null }

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtFecha(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso); if (isNaN(d.getTime())) return 'Sin fecha'
  const h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm'; const h12 = h % 12 || 12
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}, ${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}
function limpiarTel(t: string | null | undefined): string { return (t ?? '').replace(/[^\d+]/g, '') }

export default function AsesorCitas() {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista' | 'tablero'>('lista')
  const [filtro, setFiltro] = useState<Estado | null>(null)
  const [busca, setBusca] = useState('')
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [nueva, setNueva] = useState(false)

  const cargar = useCallback(async () => {
    const { data: { user } } = await getUsuarioActual()
    if (!user) { setLoading(false); return }
    setMiId(user.id)
    const { data } = await supabase
      .from('citas_coordinacion')
      .select(`id, cliente_id, estado, fecha_cita, notas, propiedad_externa, pendiente_aprobacion,
        clientes ( nombre, telefono, tipo_operacion ),
        prospectador:profiles!citas_coordinacion_prospectador_id_fkey ( nombre ),
        propiedad:propiedades ( titulo )`)
      .eq('asesor_id', user.id)
      .order('fecha_cita', { ascending: true, nullsFirst: false })
    setCitas((data ?? []) as unknown as Cita[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return citas.filter(ci => {
      if (filtro && ci.estado !== filtro) return false
      if (q) {
        const hay = `${ci.clientes?.nombre ?? ''} ${ci.propiedad?.titulo ?? ''} ${ci.propiedad_externa ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [citas, filtro, busca])

  const pendientesN = citas.filter(ci => ci.pendiente_aprobacion).length

  async function cambiarEstado(ci: Cita, e: Estado) {
    setCitas(prev => prev.map(x => x.id === ci.id ? { ...x, estado: e } : x))
    setDetalle(d => d && d.id === ci.id ? { ...d, estado: e } : d)
    await supabase.from('citas_coordinacion').update({ estado: e }).eq('id', ci.id)
  }

  const propNombre = (ci: Cita) => ci.propiedad?.titulo || ci.propiedad_externa || null

  // Conteo por etapa para el tablero
  const porEstado = useMemo(() => {
    const m: Record<string, Cita[]> = {}
    for (const e of ORDEN) m[e] = []
    for (const ci of visibles) (m[ci.estado] ??= []).push(ci)
    return m
  }, [visibles])

  function Tarjeta({ ci, compacta }: { ci: Cita; compacta?: boolean }) {
    const est = ESTADOS[ci.estado]
    return (
      <TouchableOpacity
        style={[st.card, { backgroundColor: c.card, borderColor: ci.pendiente_aprobacion ? '#c9a84c' : c.border }, compacta && st.cardCompacta]}
        activeOpacity={0.85} onPress={() => setDetalle(ci)}>
        {ci.pendiente_aprobacion && (
          <View style={st.ribbon}><Text style={st.ribbonTxt}>⏳ Pendiente de aprobación</Text></View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[st.cliente, { color: c.text }]} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text>
          {ci.clientes?.tipo_operacion ? <Text style={[st.opBadge, { color: c.textMute, borderColor: c.border }]}>{ci.clientes.tipo_operacion}</Text> : null}
        </View>
        {!compacta && propNombre(ci) ? <Text style={[st.linea, { color: c.textSub }]} numberOfLines={1}>🏠 {propNombre(ci)}</Text> : null}
        <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>📅 {fmtFecha(ci.fecha_cita)}</Text>
        {!compacta && ci.prospectador?.nombre ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>🌱 {ci.prospectador.nombre}</Text> : null}
        <View style={[st.estadoChip, { backgroundColor: est.color + '22', borderColor: est.color }]}>
          <Text style={[st.estadoChipTxt, { color: est.color }]}>{est.emoji} {est.label}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      {/* Encabezado */}
      <View style={st.top}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>Mis citas</Text>
          <Text style={[st.sub, { color: c.textMute }]}>
            {loading ? ' ' : `${citas.length} asignada${citas.length !== 1 ? 's' : ''}${pendientesN ? ` · ${pendientesN} por aprobar` : ''}`}
          </Text>
        </View>
        <TouchableOpacity style={st.nuevaBtn} onPress={() => setNueva(true)}>
          <Text style={st.nuevaBtnTxt}>＋ Nueva</Text>
        </TouchableOpacity>
      </View>

      {/* Toggle de vista */}
      <View style={st.toggleRow}>
        {(['lista', 'tablero'] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setVista(v)}
            style={[st.toggleBtn, { borderColor: c.border }, vista === v && st.toggleOn]}>
            <Text style={[st.toggleTxt, { color: vista === v ? '#fff' : c.textSub }]}>{v === 'lista' ? '☰ Lista' : '▦ Tablero'}</Text>
          </TouchableOpacity>
        ))}
        <TextInput style={[st.busca, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          value={busca} onChangeText={setBusca} placeholder="Buscar…" placeholderTextColor={c.placeholder} />
      </View>

      {/* Filtro por etapa */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtroRow} contentContainerStyle={{ gap: 7, paddingRight: 12 }}>
        <TouchableOpacity onPress={() => setFiltro(null)} style={[st.fChip, { borderColor: c.border }, filtro === null && st.fChipOn]}>
          <Text style={[st.fChipTxt, { color: filtro === null ? '#fff' : c.textSub }]}>Todas</Text>
        </TouchableOpacity>
        {ORDEN.filter(e => citas.some(ci => ci.estado === e)).map(e => (
          <TouchableOpacity key={e} onPress={() => setFiltro(f => f === e ? null : e)}
            style={[st.fChip, { borderColor: filtro === e ? ESTADOS[e].color : c.border }, filtro === e && { backgroundColor: ESTADOS[e].color }]}>
            <Text style={[st.fChipTxt, { color: filtro === e ? '#fff' : c.textSub }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} /> : citas.length === 0 ? (
        <View style={st.vacio}>
          <Text style={{ fontSize: 46 }}>📭</Text>
          <Text style={[st.vacioTxt, { color: c.textMute }]}>Aún no tienes citas asignadas. Cuando te asignen una aparecerá aquí; también puedes agregar una con “＋ Nueva”.</Text>
        </View>
      ) : vista === 'lista' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {visibles.map(ci => <Tarjeta key={ci.id} ci={ci} />)}
          {visibles.length === 0 && <Text style={{ color: c.textMute, textAlign: 'center', marginTop: 20 }}>Sin citas con ese filtro.</Text>}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 10 }}>
          {ORDEN.filter(e => porEstado[e].length > 0).map(e => (
            <View key={e} style={[st.col, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[st.colHead, { borderColor: ESTADOS[e].color }]}>
                <Text style={[st.colHeadTxt, { color: ESTADOS[e].color }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
                <Text style={[st.colCount, { color: c.textMute }]}>{porEstado[e].length}</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {porEstado[e].map(ci => <Tarjeta key={ci.id} ci={ci} compacta />)}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      {detalle && (
        <DetalleModal cita={detalle} onClose={() => setDetalle(null)} onCambiarEstado={cambiarEstado} />
      )}
      {nueva && miId && (
        <NuevaCitaModal miId={miId} onClose={() => setNueva(false)} onSaved={() => { setNueva(false); cargar() }} />
      )}
    </View>
  )
}

// ── Detalle + acciones ───────────────────────────────────────────────────────
function DetalleModal({ cita, onClose, onCambiarEstado }: {
  cita: Cita; onClose: () => void; onCambiarEstado: (ci: Cita, e: Estado) => void
}) {
  const c = useColors()
  const tel = limpiarTel(cita.clientes?.telefono)
  const prop = cita.propiedad?.titulo || cita.propiedad_externa || null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.sheetOverlay}>
        <View style={[st.sheet, { backgroundColor: c.card }]}>
          <View style={st.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {cita.pendiente_aprobacion && (
              <View style={st.ribbonBig}><Text style={st.ribbonTxt}>⏳ Pendiente de aprobación del admin</Text></View>
            )}
            <Text style={[st.sheetTitulo, { color: c.text }]}>{cita.clientes?.nombre || 'Cliente'}</Text>
            {prop ? <Text style={[st.sheetLinea, { color: c.textSub }]}>🏠 {prop}</Text> : null}
            <Text style={[st.sheetLinea, { color: c.textSub }]}>📅 {fmtFecha(cita.fecha_cita)}</Text>
            {cita.prospectador?.nombre ? <Text style={[st.sheetLinea, { color: c.textMute }]}>🌱 Prospectó: {cita.prospectador.nombre}</Text> : null}
            {cita.notas ? <Text style={[st.sheetLinea, { color: c.textMute }]}>📝 {cita.notas}</Text> : null}

            {tel ? (
              <View style={st.accionRow}>
                <TouchableOpacity style={[st.accion, { backgroundColor: '#16a34a' }]} onPress={() => Linking.openURL(`https://wa.me/52${tel.replace(/^\+?52/, '')}`)}>
                  <Text style={st.accionTxt}>💬 WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.accion, { backgroundColor: '#1a6470' }]} onPress={() => Linking.openURL(`tel:${tel}`)}>
                  <Text style={st.accionTxt}>📞 Llamar</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[st.sheetSub, { color: c.textSub }]}>Cambiar etapa</Text>
            <View style={st.estadosGrid}>
              {ORDEN.map(e => {
                const on = cita.estado === e
                return (
                  <TouchableOpacity key={e} onPress={() => onCambiarEstado(cita, e)}
                    style={[st.estadoOpt, { borderColor: on ? ESTADOS[e].color : c.border, backgroundColor: on ? ESTADOS[e].color + '22' : 'transparent' }]}>
                    <Text style={[st.estadoOptTxt, { color: on ? ESTADOS[e].color : c.textSub, fontWeight: on ? '800' : '600' }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity style={st.cerrar} onPress={onClose}><Text style={[st.cerrarTxt, { color: c.textSub }]}>Cerrar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ── Nueva cita (entra pendiente de aprobación) ───────────────────────────────
function NuevaCitaModal({ miId, onClose, onSaved }: { miId: string; onClose: () => void; onSaved: () => void }) {
  const c = useColors()
  const [misClientes, setMisClientes] = useState<ClienteMini[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [buscaCli, setBuscaCli] = useState('')
  const [nuevoTel, setNuevoTel] = useState('')
  const [propiedad, setPropiedad] = useState('')
  const [fecha, setFecha] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => {
    supabase.from('clientes').select('id, nombre, telefono').is('eliminado_at', null).order('nombre')
      .then(({ data }) => setMisClientes((data ?? []) as ClienteMini[]))
  }, []))

  const filtrados = useMemo(() => {
    const q = buscaCli.trim().toLowerCase()
    if (!q) return misClientes.slice(0, 30)
    return misClientes.filter(x => (x.nombre ?? '').toLowerCase().includes(q) || (x.telefono ?? '').includes(q)).slice(0, 30)
  }, [buscaCli, misClientes])

  const hayExacto = misClientes.some(x => (x.nombre ?? '').toLowerCase() === buscaCli.trim().toLowerCase())

  async function guardar() {
    if (!clienteId && !clienteNombre.trim() && !buscaCli.trim()) { Alert.alert('Falta el cliente', 'Elige o escribe el nombre del cliente.'); return }
    setGuardando(true)
    try {
      let cid = clienteId
      // Cliente nuevo → se crea a nombre del asesor (responsable_id).
      if (!cid) {
        const nombre = (clienteNombre || buscaCli).trim()
        const { data, error } = await supabase.from('clientes')
          .insert({ nombre, telefono: nuevoTel.trim(), responsable_id: miId }).select('id').single()
        if (error || !data) { throw error || new Error('No se pudo crear el cliente') }
        cid = data.id
      }
      const { error } = await supabase.from('citas_coordinacion').insert({
        cliente_id: cid, asesor_id: miId, creada_por: miId, pendiente_aprobacion: true,
        estado: 'coordinada',
        fecha_cita: fecha ? new Date(fecha).toISOString() : null,
        propiedad_externa: propiedad.trim() || null,
        notas: notas.trim() || null,
      })
      if (error) throw error
      Alert.alert('Enviada ✓', 'La cita se envió para aprobación del admin. Aparecerá como pendiente hasta que la aprueben.')
      onSaved()
    } catch (e: any) {
      setGuardando(false)
      Alert.alert('Error', e?.message ?? 'No se pudo guardar la cita.')
    }
  }

  const inp = [st.inp, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.sheetOverlay}>
        <View style={[st.sheet, { backgroundColor: c.card }]}>
          <View style={st.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[st.sheetTitulo, { color: c.text }]}>Nueva cita</Text>
            <Text style={[st.sheetLinea, { color: c.textMute }]}>Se enviará al admin para aprobación.</Text>

            <Text style={[st.lbl, { color: c.textSub }]}>Cliente</Text>
            {clienteId || clienteNombre ? (
              <View style={[st.clienteSel, { borderColor: '#16a34a' }]}>
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{clienteNombre || misClientes.find(x => x.id === clienteId)?.nombre}</Text>
                <TouchableOpacity onPress={() => { setClienteId(null); setClienteNombre(''); setBuscaCli('') }}><Text style={{ color: '#c0392b', fontWeight: '800' }}>Cambiar</Text></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={inp} value={buscaCli} onChangeText={setBuscaCli} placeholder="Buscar o escribir un nombre nuevo…" placeholderTextColor={c.placeholder} />
                {buscaCli.trim().length > 1 && !hayExacto && (
                  <TouchableOpacity style={st.crearCli} onPress={() => setClienteNombre(buscaCli.trim())}>
                    <Text style={st.crearCliTxt}>➕ Crear cliente nuevo «{buscaCli.trim()}»</Text>
                  </TouchableOpacity>
                )}
                <ScrollView style={{ maxHeight: 160, marginTop: 6 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filtrados.map(x => (
                    <TouchableOpacity key={x.id} style={st.cliItem} onPress={() => setClienteId(x.id)}>
                      <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{x.nombre}{x.telefono ? ` · ${x.telefono}` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            {clienteNombre ? (
              <TextInput style={inp} value={nuevoTel} onChangeText={setNuevoTel} placeholder="Teléfono del cliente nuevo (opcional)" placeholderTextColor={c.placeholder} keyboardType="phone-pad" />
            ) : null}

            <Text style={[st.lbl, { color: c.textSub }]}>Propiedad</Text>
            <TextInput style={inp} value={propiedad} onChangeText={setPropiedad} placeholder="¿Qué propiedad va a ver?" placeholderTextColor={c.placeholder} />

            <Text style={[st.lbl, { color: c.textSub }]}>Fecha y hora</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input type="datetime-local" value={fecha} onChange={(e: any) => setFecha(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.border}`, fontSize: 14.5, color: c.inputText, backgroundColor: c.bg, outline: 'none', boxSizing: 'border-box' }} />
            ) : (
              <TextInput style={inp} value={fecha} onChangeText={setFecha} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={c.placeholder} keyboardType="numbers-and-punctuation" />
            )}

            <Text style={[st.lbl, { color: c.textSub }]}>Notas (opcional)</Text>
            <TextInput style={[...inp, { minHeight: 60, textAlignVertical: 'top' }]} value={notas} onChangeText={setNotas} placeholder="Detalles…" placeholderTextColor={c.placeholder} multiline />

            <TouchableOpacity style={[st.guardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={st.guardarTxt}>Enviar para aprobación</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={st.cerrar} onPress={onClose}><Text style={[st.cerrarTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, gap: 10 },
  h1: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 1 },
  nuevaBtn: { backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  nuevaBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginTop: 10 },
  toggleBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  toggleOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  toggleTxt: { fontSize: 12.5, fontWeight: '800' },
  busca: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7, fontSize: 13.5 },
  filtroRow: { flexGrow: 0, paddingLeft: 14, marginTop: 10, maxHeight: 40 },
  fChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  fChipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  fChipTxt: { fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10, gap: 3 },
  cardCompacta: { marginBottom: 0, padding: 10, width: 230 },
  ribbon: { backgroundColor: '#c9a84c', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8, alignSelf: 'flex-start', marginBottom: 4 },
  ribbonBig: { backgroundColor: '#c9a84c', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', marginBottom: 10 },
  ribbonTxt: { color: '#fff', fontWeight: '900', fontSize: 11.5 },
  cliente: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  opBadge: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, textTransform: 'capitalize' },
  linea: { fontSize: 12.5, marginTop: 2 },
  estadoChip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  estadoChipTxt: { fontSize: 11.5, fontWeight: '800' },
  col: { width: 250, borderWidth: 1, borderRadius: 14, padding: 8 },
  colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, paddingBottom: 6, marginBottom: 8 },
  colHeadTxt: { fontSize: 13, fontWeight: '900' },
  colCount: { fontSize: 12, fontWeight: '700' },
  vacio: { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 36 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  // sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, maxHeight: '90%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  sheetTitulo: { fontSize: 20, fontWeight: '900' },
  sheetLinea: { fontSize: 14, marginTop: 5, lineHeight: 19 },
  sheetSub: { fontSize: 13, fontWeight: '800', marginTop: 16, marginBottom: 6 },
  accionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  accion: { flex: 1, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  accionTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  estadosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  estadoOpt: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  estadoOptTxt: { fontSize: 12 },
  cerrar: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  cerrarTxt: { fontSize: 14, fontWeight: '700' },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  inp: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, marginBottom: 2 },
  clienteSel: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, padding: 11 },
  crearCli: { marginTop: 8, borderWidth: 1.5, borderColor: '#059669', borderStyle: 'dashed', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  crearCliTxt: { color: '#059669', fontWeight: '800', fontSize: 12.5 },
  cliItem: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#88888822' },
  guardar: { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
