// "Mis citas" del ASESOR. Muestra TODAS las citas asignadas a él (por atender +
// resultados) y le deja moverlas entre estados. Los estados previos
// (coordinada, en_coordinacion, primer_contacto…) se agrupan en "Por atender".
// - Vista Tablero: columnas estilo dashboard de citas (PC).
// - Vista Lista: tarjetas estilo CRM.
import { useState, useCallback, useMemo, createElement } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput,
  ActivityIndicator, Platform, Linking, useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

type Estado = 'coordinada' | 'realizada' | 'aparto' | 'reagendada' | 'cancelada'
const ESTADOS: Record<Estado, { label: string; color: string; bg: string; emoji: string }> = {
  coordinada: { label: 'Por atender', color: '#16a34a', bg: '#f0fdf4', emoji: '🟢' },
  realizada:  { label: 'Realizada',   color: '#0d9488', bg: '#f0fdfa', emoji: '✅' },
  aparto:     { label: 'Apartó',      color: '#c87f0a', bg: '#fef9eb', emoji: '🏆' },
  reagendada: { label: 'Reagendada',  color: '#b45309', bg: '#fef3c7', emoji: '🟤' },
  cancelada:  { label: 'Cancelada',   color: '#64748b', bg: '#f1f5f9', emoji: '⚫' },
}
const ORDEN: Estado[] = ['coordinada', 'realizada', 'aparto', 'reagendada', 'cancelada']
// Cualquier estado previo (primer_contacto, en_coordinacion, buscando_opciones…)
// se muestra como "Por atender" para que la cita asignada SÍ aparezca.
function colDe(e: string): Estado { return (ESTADOS as any)[e] ? (e as Estado) : 'coordinada' }
const COL_W = 250

type Cita = {
  id: string; cliente_id: string; estado: string; fecha_cita: string | null
  notas: string | null; propiedad_externa: string | null
  clientes: { nombre: string; telefono: string | null; tipo_operacion: string | null } | null
  prospectador: { nombre: string } | null
  propiedad: { titulo: string } | null
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtFecha(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso); if (isNaN(d.getTime())) return 'Sin fecha'
  const h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm'; const h12 = h % 12 || 12
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}
function iniciales(n: string | null | undefined): string {
  const p = (n ?? '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
function limpiarTel(t: string | null | undefined): string { return (t ?? '').replace(/[^\d+]/g, '') }

export default function AsesorCitas() {
  const c = useColors()
  const { width } = useWindowDimensions()
  const [miId, setMiId] = useState<string | null>(null)
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista' | 'tablero'>('lista')
  const [busca, setBusca] = useState('')
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [dragCita, setDragCita] = useState<Cita | null>(null)   // arrastre (web)
  const [dragOver, setDragOver] = useState<Estado | null>(null)

  const cargar = useCallback(async () => {
    const { data: { user } } = await getUsuarioActual()
    if (!user) { setLoading(false); return }
    setMiId(user.id)
    const { data } = await supabase
      .from('citas_coordinacion')
      .select(`id, cliente_id, estado, fecha_cita, notas, propiedad_externa,
        clientes ( nombre, telefono, tipo_operacion ),
        prospectador:profiles!citas_coordinacion_prospectador_id_fkey ( nombre ),
        propiedad:propiedades ( titulo )`)
      .eq('asesor_id', user.id)
      .order('fecha_cita', { ascending: false, nullsFirst: false })
    setCitas((data ?? []) as unknown as Cita[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return citas
    return citas.filter(ci => `${ci.clientes?.nombre ?? ''} ${ci.propiedad?.titulo ?? ''} ${ci.propiedad_externa ?? ''}`.toLowerCase().includes(q))
  }, [citas, busca])

  const porEstado = useMemo(() => {
    const m: Record<Estado, Cita[]> = { coordinada: [], realizada: [], aparto: [], reagendada: [], cancelada: [] }
    for (const ci of visibles) m[colDe(ci.estado)].push(ci)
    return m
  }, [visibles])

  async function mover(ci: Cita, e: Estado) {
    setCitas(prev => prev.map(x => x.id === ci.id ? { ...x, estado: e } : x))
    setDetalle(d => d && d.id === ci.id ? { ...d, estado: e } : d)
    await supabase.from('citas_coordinacion').update({ estado: e }).eq('id', ci.id)
  }
  const propNombre = (ci: Cita) => ci.propiedad?.titulo || ci.propiedad_externa || null

  // ── Tarjeta estilo CRM (vista lista) ──
  function TarjetaLista({ ci }: { ci: Cita }) {
    const est = ESTADOS[colDe(ci.estado)]
    return (
      <TouchableOpacity style={cl.card} activeOpacity={0.85} onPress={() => setDetalle(ci)}>
        <View style={[cl.cardBar, { backgroundColor: est.color }]} />
        <View style={cl.cardBody}>
          <View style={cl.cardHead}>
            <View style={[cl.avatar, { backgroundColor: est.bg }]}><Text style={[cl.avatarTxt, { color: est.color }]}>{iniciales(ci.clientes?.nombre)}</Text></View>
            <View style={cl.cardHeadInfo}>
              <Text style={cl.cardNombre} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text>
              <View style={cl.cardSubRow}>
                <View style={[cl.estadoChip, { backgroundColor: est.bg, borderColor: est.color }]}><Text style={[cl.estadoChipTxt, { color: est.color }]}>{est.emoji} {est.label}</Text></View>
                {ci.clientes?.tipo_operacion ? <Text style={cl.op}>{ci.clientes.tipo_operacion}</Text> : null}
              </View>
            </View>
            <Text style={cl.chevron}>›</Text>
          </View>
          {propNombre(ci) ? <Text style={cl.linea} numberOfLines={1}>🏠 {propNombre(ci)}</Text> : null}
          <Text style={cl.linea} numberOfLines={1}>📅 {fmtFecha(ci.fecha_cita)}</Text>
          {ci.prospectador?.nombre ? <Text style={[cl.linea, { color: '#94a3b8' }]} numberOfLines={1}>🌱 {ci.prospectador.nombre}</Text> : null}
        </View>
      </TouchableOpacity>
    )
  }

  // ── Tarjeta estilo dashboard (vista tablero) ──
  function TarjetaTablero({ ci }: { ci: Cita }) {
    const est = ESTADOS[colDe(ci.estado)]
    const tel = limpiarTel(ci.clientes?.telefono)
    const card = (
      <TouchableOpacity style={kc.card} activeOpacity={0.85} onPress={() => setDetalle(ci)}>
        <View style={[kc.colorBar, { backgroundColor: est.color }]} />
        <View style={kc.body}>
          <View style={kc.headRow}>
            <View style={[kc.avatar, { backgroundColor: est.bg }]}><Text style={[kc.avatarTxt, { color: est.color }]}>{iniciales(ci.clientes?.nombre)}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={kc.nombre} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text>
              {tel ? <Text style={kc.tel}>{tel}</Text> : null}
            </View>
          </View>
          {ci.fecha_cita ? <View style={kc.fechaRow}><Ionicons name="calendar-outline" size={11} color="#1a6470" /><Text style={kc.fechaTxt}>{fmtFecha(ci.fecha_cita)}</Text></View> : null}
          {propNombre(ci) ? <View style={kc.proyectoRow}><Ionicons name="business-outline" size={10} color="#0d9488" /><Text style={kc.proyectoTxt} numberOfLines={1}>{propNombre(ci)}</Text></View> : null}
          {ci.notas ? <Text style={kc.notas} numberOfLines={2}>{ci.notas}</Text> : null}
          {ci.prospectador?.nombre ? <Text style={kc.metaTxt} numberOfLines={1}><Ionicons name="person-outline" size={9} color="#94a3b8" /> {ci.prospectador.nombre.split(' ')[0]}</Text> : null}
        </View>
      </TouchableOpacity>
    )
    // Web: arrastrable (idéntico al dashboard); móvil: se mueve tocando la cita.
    if (Platform.OS === 'web') {
      return createElement('div', {
        draggable: true,
        onDragStart: (ev: any) => { ev.dataTransfer.effectAllowed = 'move'; setDragCita(ci) },
        onDragEnd: () => { setDragCita(null); setDragOver(null) },
        style: { cursor: 'grab', opacity: dragCita?.id === ci.id ? 0.45 : 1 },
      }, card)
    }
    return card
  }

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.top}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>Mis citas</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{loading ? ' ' : `${citas.length} cita${citas.length !== 1 ? 's' : ''} asignada${citas.length !== 1 ? 's' : ''} a ti`}</Text>
        </View>
      </View>

      <View style={st.toggleRow}>
        {(['lista', 'tablero'] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setVista(v)} style={[st.toggleBtn, { borderColor: c.border }, vista === v && st.toggleOn]}>
            <Text style={[st.toggleTxt, { color: vista === v ? '#fff' : c.textSub }]}>{v === 'lista' ? '☰ Lista' : '▦ Tablero'}</Text>
          </TouchableOpacity>
        ))}
        <TextInput style={[st.busca, { color: c.text, borderColor: c.border, backgroundColor: c.card }]} value={busca} onChangeText={setBusca} placeholder="Buscar…" placeholderTextColor={c.placeholder} />
      </View>

      {loading ? <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} /> : citas.length === 0 ? (
        <View style={st.vacio}><Text style={{ fontSize: 46 }}>📭</Text><Text style={[st.vacioTxt, { color: c.textMute }]}>Aquí verás las citas que te asignen. Cuando te asignen una, aparecerá en "Por atender".</Text></View>
      ) : vista === 'lista' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {visibles.map(ci => <TarjetaLista key={ci.id} ci={ci} />)}
          {visibles.length === 0 && <Text style={{ color: c.textMute, textAlign: 'center', marginTop: 20 }}>Sin resultados.</Text>}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 10 }}>
          {ORDEN.map(e => {
            const colW = Math.min(COL_W, width - 40)
            const resaltar = dragOver === e && dragCita && colDe(dragCita.estado) !== e
            const inner = (
              <View style={[tb.col, { width: colW }, resaltar && { borderWidth: 2, borderColor: ESTADOS[e].color }]}>
                <View style={[tb.colHead, { backgroundColor: ESTADOS[e].bg, borderColor: ESTADOS[e].color }]}>
                  <Text style={[tb.colHeadTxt, { color: ESTADOS[e].color }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
                  <View style={[tb.colCount, { backgroundColor: ESTADOS[e].color }]}><Text style={tb.colCountTxt}>{porEstado[e].length}</Text></View>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  {porEstado[e].map(ci => <TarjetaTablero key={ci.id} ci={ci} />)}
                  {porEstado[e].length === 0 && <Text style={tb.colVacio}>{Platform.OS === 'web' ? 'Suelta aquí' : '—'}</Text>}
                </ScrollView>
              </View>
            )
            if (Platform.OS !== 'web') return <View key={e}>{inner}</View>
            return createElement('div', {
              key: e,
              onDragEnter: (ev: any) => { ev.preventDefault(); setDragOver(e) },
              onDragOver: (ev: any) => ev.preventDefault(),
              onDrop: (ev: any) => { ev.preventDefault(); if (dragCita && colDe(dragCita.estado) !== e) mover(dragCita, e); setDragCita(null); setDragOver(null) },
              style: { flexShrink: 0 },
            }, inner)
          })}
        </ScrollView>
      )}

      {detalle && <DetalleModal cita={detalle} onClose={() => setDetalle(null)} onMover={mover} c={c} />}
    </View>
  )
}

function DetalleModal({ cita, onClose, onMover, c }: {
  cita: Cita; onClose: () => void; onMover: (ci: Cita, e: Estado) => void; c: ReturnType<typeof useColors>
}) {
  const tel = limpiarTel(cita.clientes?.telefono)
  const prop = cita.propiedad?.titulo || cita.propiedad_externa || null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={dm.overlay}>
        <View style={[dm.sheet, { backgroundColor: c.card }]}>
          <View style={dm.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[dm.titulo, { color: c.text }]}>{cita.clientes?.nombre || 'Cliente'}</Text>
            {prop ? <Text style={[dm.linea, { color: c.textSub }]}>🏠 {prop}</Text> : null}
            <Text style={[dm.linea, { color: c.textSub }]}>📅 {fmtFecha(cita.fecha_cita)}</Text>
            {cita.prospectador?.nombre ? <Text style={[dm.linea, { color: c.textMute }]}>🌱 Prospectó: {cita.prospectador.nombre}</Text> : null}
            {cita.notas ? <Text style={[dm.linea, { color: c.textMute }]}>📝 {cita.notas}</Text> : null}

            {tel ? (
              <View style={dm.accionRow}>
                <TouchableOpacity style={[dm.accion, { backgroundColor: '#16a34a' }]} onPress={() => Linking.openURL(`https://wa.me/52${tel.replace(/^\+?52/, '')}`)}><Text style={dm.accionTxt}>💬 WhatsApp</Text></TouchableOpacity>
                <TouchableOpacity style={[dm.accion, { backgroundColor: '#1a6470' }]} onPress={() => Linking.openURL(`tel:${tel}`)}><Text style={dm.accionTxt}>📞 Llamar</Text></TouchableOpacity>
              </View>
            ) : null}

            <Text style={[dm.sub, { color: c.textSub }]}>Mover a</Text>
            <View style={{ gap: 8 }}>
              {ORDEN.map(e => {
                const on = colDe(cita.estado) === e
                return (
                  <TouchableOpacity key={e} onPress={() => onMover(cita, e)} style={[dm.estadoOpt, { borderColor: on ? ESTADOS[e].color : c.border, backgroundColor: on ? ESTADOS[e].bg : 'transparent' }]}>
                    <Text style={[dm.estadoOptTxt, { color: on ? ESTADOS[e].color : c.text }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
                    {on && <Text style={{ color: ESTADOS[e].color, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>
                )
              })}
            </View>
            <TouchableOpacity style={dm.cerrar} onPress={onClose}><Text style={[dm.cerrarTxt, { color: c.textSub }]}>Cerrar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 },
  h1: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginTop: 10 },
  toggleBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  toggleOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  toggleTxt: { fontSize: 12.5, fontWeight: '800' },
  busca: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7, fontSize: 13.5 },
  vacio: { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 36 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})

// Vista LISTA — estilo CRM
const cl = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  cardBar: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 15, fontWeight: '800' },
  cardHeadInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  estadoChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  estadoChipTxt: { fontSize: 11, fontWeight: '800' },
  op: { fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' },
  chevron: { fontSize: 22, color: '#c0cdd0', fontWeight: '300' },
  linea: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
})

// Vista TABLERO — estilo dashboard
const tb = StyleSheet.create({
  col: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 8 },
  colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  colHeadTxt: { fontSize: 13, fontWeight: '900' },
  colCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  colCountTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  colVacio: { textAlign: 'center', color: '#cbd5e1', fontSize: 20, marginTop: 8 },
})
const kc = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  colorBar: { width: 4 },
  body: { flex: 1, padding: 10, gap: 5 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 11, fontWeight: '800' },
  nombre: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  tel: { fontSize: 11, color: '#64748b' },
  fechaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdfa', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  fechaTxt: { fontSize: 11, color: '#1a6470', fontWeight: '600' },
  notas: { fontSize: 11, color: '#64748b', lineHeight: 15 },
  proyectoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proyectoTxt: { fontSize: 10, color: '#0d9488', fontWeight: '600', flexShrink: 1 },
  metaTxt: { fontSize: 10, color: '#94a3b8' },
})
const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  titulo: { fontSize: 20, fontWeight: '900' },
  linea: { fontSize: 14, marginTop: 5, lineHeight: 19 },
  accionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  accion: { flex: 1, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  accionTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sub: { fontSize: 13, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  estadoOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13 },
  estadoOptTxt: { fontSize: 14.5, fontWeight: '700' },
  cerrar: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  cerrarTxt: { fontSize: 14, fontWeight: '700' },
})
