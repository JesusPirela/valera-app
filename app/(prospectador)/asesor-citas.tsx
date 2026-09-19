// "Mis citas" del ASESOR. Muestra TODAS las citas asignadas a él (por atender +
// resultados) y le deja moverlas entre estados. Los estados previos
// (coordinada, en_coordinacion, primer_contacto…) se agrupan en "Por atender".
// - Vista Tablero: columnas estilo dashboard de citas (PC).
// - Vista Lista: tarjetas estilo CRM.
import { useState, useCallback, useMemo, useRef, createElement } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput,
  ActivityIndicator, Platform, Linking, useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors, useTheme } from '../../lib/ThemeContext'

type Estado =
  | 'coordinada' | 'realizada' | 'buscando_opciones'
  | 'seguimiento_cierre_alto' | 'seguimiento_cierre_bajo'
  | 'falta_perfilamiento' | 'compra_futuro' | 'aparto' | 'reagendada' | 'cancelada'
const ESTADOS: Record<Estado, { label: string; color: string; bg: string; emoji: string }> = {
  coordinada:              { label: 'Por atender',                color: '#16a34a', bg: '#f0fdf4', emoji: '🟢' },
  realizada:               { label: 'Esperando retroalimentación', color: '#0d9488', bg: '#f0fdfa', emoji: '⏳' },
  buscando_opciones:       { label: 'Buscar más opciones',        color: '#ca8a04', bg: '#fefce8', emoji: '🔎' },
  seguimiento_cierre_alto: { label: 'Seguim. cierre · alto interés', color: '#dc2626', bg: '#fef2f2', emoji: '🔥' },
  seguimiento_cierre_bajo: { label: 'Seguim. cierre · bajo interés', color: '#f97316', bg: '#fff7ed', emoji: '🌡️' },
  falta_perfilamiento:     { label: 'Falta perfilar / crédito',   color: '#8b5cf6', bg: '#f5f3ff', emoji: '📋' },
  compra_futuro:           { label: 'Compra a futuro',            color: '#0369a1', bg: '#e0f2fe', emoji: '⏭️' },
  aparto:                  { label: 'Apartó',                     color: '#c87f0a', bg: '#fef9eb', emoji: '🏆' },
  reagendada:              { label: 'Reagendada',                 color: '#b45309', bg: '#fef3c7', emoji: '🟤' },
  cancelada:               { label: 'Cancelada',                  color: '#64748b', bg: '#f1f5f9', emoji: '⚫' },
}
const ORDEN: Estado[] = [
  'coordinada', 'realizada', 'buscando_opciones',
  'seguimiento_cierre_alto', 'seguimiento_cierre_bajo',
  'falta_perfilamiento', 'compra_futuro', 'aparto', 'reagendada', 'cancelada',
]
// Cualquier estado previo (primer_contacto, en_coordinacion, buscando_opciones…)
// se muestra como "Por atender" para que la cita asignada SÍ aparezca.
function colDe(e: string): Estado { return (ESTADOS as any)[e] ? (e as Estado) : 'coordinada' }
const COL_W = 250

// Columnas de la vista Tabla (estilo tabla del CRM).
const TABLE_COLS = [
  { id: 'cliente',   label: 'Cliente',   w: 180 },
  { id: 'tel',       label: 'Teléfono',  w: 130 },
  { id: 'prop',      label: 'Propiedad', w: 240 },
  { id: 'fecha',     label: 'Fecha',     w: 175 },
  { id: 'estado',    label: 'Estado',    w: 230 },
  { id: 'prospecto', label: 'Prospectó', w: 160 },
]

type Cita = {
  id: string; cliente_id: string; estado: string; fecha_cita: string | null
  notas: string | null; propiedad_externa: string | null; asesor_id: string | null
  updated_at: string
  clientes: { nombre: string; telefono: string | null; tipo_operacion: string | null } | null
  prospectador: { nombre: string } | null
  propiedad: { titulo: string } | null
  asesor: { nombre: string } | null
}

// Badge de inercia (idéntico al dashboard de admin): días desde el último
// movimiento de la cita (updated_at, que el trigger actualiza al mover/editar).
// Solo en estados donde el asesor debe estar accionando; ≥3d 🟡, ≥7d 🔴.
const ESTADOS_INERTES = new Set<string>([
  'por_contactar', 'primer_contacto', 'buscando_opciones', 'en_coordinacion',
  'coordinada', 'reagendada', 'no_responde_asesor',
  'seguimiento_cierre_alto', 'seguimiento_cierre_bajo', 'falta_perfilamiento',
])
function inerciaDe(ci: Cita): { dias: number; critica: boolean } | null {
  if (!ESTADOS_INERTES.has(ci.estado) || !ci.updated_at) return null
  const dias = Math.floor((Date.now() - new Date(ci.updated_at).getTime()) / 86400000)
  if (isNaN(dias) || dias < 3) return null
  return { dias, critica: dias >= 7 }
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
  const { darkMode } = useTheme()
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams<{ admin?: string }>()
  const esAdmin = params.admin === '1'   // admin viendo el tablero de los asesores
  const [miId, setMiId] = useState<string | null>(null)
  const [citas, setCitas] = useState<Cita[]>([])
  const [filtroAsesor, setFiltroAsesor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista' | 'tablero' | 'tabla'>('lista')
  const [busca, setBusca] = useState('')
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [dragCita, setDragCita] = useState<Cita | null>(null)   // arrastre (web)
  const [dragOver, setDragOver] = useState<Estado | null>(null)
  const tableroRef = useRef<ScrollView>(null)   // scroll horizontal del tablero
  const scrollXRef = useRef(0)
  const scrollTablero = (dir: 1 | -1) => tableroRef.current?.scrollTo({ x: Math.max(0, scrollXRef.current + dir * (COL_W + 10) * 2), animated: true })

  const cargar = useCallback(async () => {
    const { data: { user } } = await getUsuarioActual()
    if (!user) { setLoading(false); return }
    setMiId(user.id)
    let q = supabase
      .from('citas_coordinacion')
      .select(`id, cliente_id, estado, fecha_cita, notas, propiedad_externa, asesor_id, updated_at,
        clientes ( nombre, telefono, tipo_operacion ),
        prospectador:profiles!citas_coordinacion_prospectador_id_fkey ( nombre ),
        asesor:profiles!citas_coordinacion_asesor_id_fkey ( nombre ),
        propiedad:propiedades ( titulo )`)
    // Admin: todas las citas que ya tienen asesor asignado. Asesor: solo las suyas.
    q = esAdmin ? q.not('asesor_id', 'is', null) : q.eq('asesor_id', user.id)
    const { data } = await q.order('fecha_cita', { ascending: false, nullsFirst: false })
    setCitas((data ?? []) as unknown as Cita[])
    setLoading(false)
  }, [esAdmin])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // Lista de asesores presentes (solo modo admin), para el filtro.
  const asesores = useMemo(() => {
    if (!esAdmin) return []
    const m = new Map<string, string>()
    for (const ci of citas) if (ci.asesor_id) m.set(ci.asesor_id, ci.asesor?.nombre ?? 'Asesor')
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [citas, esAdmin])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let base = citas
    if (esAdmin && filtroAsesor) base = base.filter(ci => ci.asesor_id === filtroAsesor)
    if (!q) return base
    return base.filter(ci => `${ci.clientes?.nombre ?? ''} ${ci.propiedad?.titulo ?? ''} ${ci.propiedad_externa ?? ''}`.toLowerCase().includes(q))
  }, [citas, busca, esAdmin, filtroAsesor])

  const porEstado = useMemo(() => {
    const m = Object.fromEntries(ORDEN.map(e => [e, [] as Cita[]])) as Record<Estado, Cita[]>
    for (const ci of visibles) m[colDe(ci.estado)].push(ci)
    return m
  }, [visibles])

  async function mover(ci: Cita, e: Estado) {
    setCitas(prev => prev.map(x => x.id === ci.id ? { ...x, estado: e } : x))
    setDetalle(d => d && d.id === ci.id ? { ...d, estado: e } : d)
    await supabase.from('citas_coordinacion').update({ estado: e }).eq('id', ci.id)
  }
  const propNombre = (ci: Cita) => ci.propiedad?.titulo || ci.propiedad_externa || null

  // ── Tarjeta estilo CRM (vista lista) — misma estructura que el ClienteCard ──
  function TarjetaLista({ ci }: { ci: Cita }) {
    const est = ESTADOS[colDe(ci.estado)]
    return (
      <TouchableOpacity style={[cl.card, { backgroundColor: c.card, borderColor: c.border }]} activeOpacity={0.8} onPress={() => setDetalle(ci)}>
        <View style={[cl.cardBar, { backgroundColor: est.color }]} />
        <View style={cl.cardBody}>
          <View style={cl.cardHead}>
            <View style={[cl.avatar, { backgroundColor: est.color + '22' }]}><Text style={[cl.avatarTxt, { color: est.color }]}>{iniciales(ci.clientes?.nombre)}</Text></View>
            <View style={cl.cardHeadInfo}>
              <Text style={[cl.cardNombre, { color: c.text }]} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text>
              <View style={cl.cardSubRow}>
                {ci.clientes?.tipo_operacion ? <View style={[cl.fuenteTag, { backgroundColor: c.bg }]}><Text style={[cl.fuenteTagTxt, { color: c.textSub }]}>{ci.clientes.tipo_operacion}</Text></View> : null}
                {propNombre(ci) ? <View style={[cl.fuenteTag, { backgroundColor: c.bg }]}><Text style={[cl.fuenteTagTxt, { color: c.textSub }]} numberOfLines={1}>🏠 {propNombre(ci)}</Text></View> : null}
              </View>
            </View>
            <View style={[cl.estadoBadge, { backgroundColor: est.color + '22' }]}>
              <View style={[cl.estadoDot, { backgroundColor: est.color }]} />
              <Text style={[cl.estadoTxt, { color: est.color }]} numberOfLines={1}>{est.label}</Text>
            </View>
          </View>
          <Text style={[cl.linea, { color: c.textSub }]} numberOfLines={1}>📅 {fmtFecha(ci.fecha_cita)}</Text>
          {esAdmin && ci.asesor?.nombre ? <Text style={[cl.linea, { color: c.textSub }]} numberOfLines={1}>👤 {ci.asesor.nombre}</Text> : null}
          {ci.prospectador?.nombre ? <Text style={[cl.linea, { color: c.textMute }]} numberOfLines={1}>🌱 {ci.prospectador.nombre}</Text> : null}
          {(() => { const q = inerciaDe(ci); return q ? (
            <View style={[st.inercia, q.critica ? st.inerciaCrit : st.inerciaWarn]}>
              <Text style={[st.inerciaTxt, { color: q.critica ? '#b91c1c' : '#92400e' }]}>{q.critica ? '🔴' : '🟡'} {q.dias}d sin movimiento</Text>
            </View>
          ) : null })()}
        </View>
      </TouchableOpacity>
    )
  }

  // ── Tarjeta estilo dashboard (vista tablero) ──
  function TarjetaTablero({ ci }: { ci: Cita }) {
    const est = ESTADOS[colDe(ci.estado)]
    const tel = limpiarTel(ci.clientes?.telefono)
    const card = (
      <TouchableOpacity style={[kc.card, { backgroundColor: c.card, borderColor: c.border }]} activeOpacity={0.85} onPress={() => setDetalle(ci)}>
        <View style={[kc.colorBar, { backgroundColor: est.color }]} />
        <View style={kc.body}>
          <View style={kc.headRow}>
            <View style={[kc.avatar, { backgroundColor: est.color + '22' }]}><Text style={[kc.avatarTxt, { color: est.color }]}>{iniciales(ci.clientes?.nombre)}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[kc.nombre, { color: c.text }]} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text>
              {tel ? <Text style={[kc.tel, { color: c.textMute }]}>{tel}</Text> : null}
            </View>
          </View>
          {ci.fecha_cita ? <View style={[kc.fechaRow, { backgroundColor: est.color + '1a' }]}><Ionicons name="calendar-outline" size={11} color={est.color} /><Text style={[kc.fechaTxt, { color: est.color }]}>{fmtFecha(ci.fecha_cita)}</Text></View> : null}
          {propNombre(ci) ? <View style={kc.proyectoRow}><Ionicons name="business-outline" size={10} color="#0d9488" /><Text style={kc.proyectoTxt} numberOfLines={1}>{propNombre(ci)}</Text></View> : null}
          {ci.notas ? <Text style={[kc.notas, { color: c.textMute }]} numberOfLines={2}>{ci.notas}</Text> : null}
          {esAdmin && ci.asesor?.nombre ? <Text style={[kc.metaTxt, { color: c.textSub }]} numberOfLines={1}><Ionicons name="person-circle-outline" size={10} color={c.textSub} /> {ci.asesor.nombre}</Text> : null}
          {ci.prospectador?.nombre ? <Text style={[kc.metaTxt, { color: c.textMute }]} numberOfLines={1}><Ionicons name="person-outline" size={9} color={c.textMute} /> {ci.prospectador.nombre.split(' ')[0]}</Text> : null}
          {(() => { const q = inerciaDe(ci); return q ? (
            <View style={[st.inercia, q.critica ? st.inerciaCrit : st.inerciaWarn, { marginTop: 5 }]}>
              <Text style={[st.inerciaTxt, { color: q.critica ? '#b91c1c' : '#92400e' }]}>{q.critica ? '🔴' : '🟡'} {q.dias}d sin movimiento</Text>
            </View>
          ) : null })()}
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
        {esAdmin && (
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/coordinacion-citas')} style={{ paddingRight: 10, paddingVertical: 4 }}>
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>{esAdmin ? 'Citas de asesores' : 'Mis citas'}</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{loading ? ' ' : esAdmin
            ? `${visibles.length} cita${visibles.length !== 1 ? 's' : ''}${filtroAsesor ? ' · ' + (asesores.find(a => a.id === filtroAsesor)?.nombre ?? '') : ` · ${asesores.length} asesor${asesores.length !== 1 ? 'es' : ''}`}`
            : `${citas.length} cita${citas.length !== 1 ? 's' : ''} asignada${citas.length !== 1 ? 's' : ''} a ti`}</Text>
        </View>
        {!esAdmin && (
          <TouchableOpacity onPress={() => router.push('/(prospectador)/calendario')} style={[st.calBtn, { borderColor: c.border, backgroundColor: c.card }]}>
            <Ionicons name="calendar-number-outline" size={16} color="#3949AB" />
            <Text style={[st.calBtnTxt, { color: c.text }]}>Calendario</Text>
          </TouchableOpacity>
        )}
      </View>

      {esAdmin && asesores.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.asesorScroll} contentContainerStyle={st.asesorRow}>
          {[{ id: null as string | null, nombre: 'Todos' }, ...asesores].map(a => {
            const activo = filtroAsesor === a.id
            const n = a.id === null ? citas.length : citas.filter(ci => ci.asesor_id === a.id).length
            return (
              <TouchableOpacity key={String(a.id)} onPress={() => setFiltroAsesor(a.id)}
                style={[st.asesorChip, { borderColor: c.border, backgroundColor: c.card }, activo && st.asesorChipOn]}>
                <Text style={[st.asesorChipTxt, { color: activo ? '#fff' : c.textSub }]} numberOfLines={1}>{a.nombre} · {n}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      <View style={st.toggleRow}>
        {(['lista', 'tablero', 'tabla'] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setVista(v)} style={[st.toggleBtn, { borderColor: c.border }, vista === v && st.toggleOn]}>
            <Text style={[st.toggleTxt, { color: vista === v ? '#fff' : c.textSub }]}>{v === 'lista' ? '☰ Lista' : v === 'tablero' ? '▦ Tablero' : '▤ Tabla'}</Text>
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
      ) : vista === 'tablero' ? (
        // Igual que el dashboard: scroll vertical de la página, dentro un scroll
        // horizontal de columnas, y CADA columna es una View plana (sin ScrollView
        // interna) — en RN-Web una ScrollView interna bloquea el arrastre HTML5.
        <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal ref={tableroRef} scrollEventThrottle={16} onScroll={e => { scrollXRef.current = e.nativeEvent.contentOffset.x }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {ORDEN.map(e => {
              const colW = Math.min(COL_W, width - 40)
              const resaltar = dragOver === e && dragCita && colDe(dragCita.estado) !== e
              const inner = (
                <View style={[tb.col, { width: colW, backgroundColor: darkMode ? '#0f1d2e' : '#eef2f6' }, resaltar && { borderWidth: 2, borderColor: ESTADOS[e].color }]}>
                  <View style={[tb.colHead, { backgroundColor: ESTADOS[e].color + (darkMode ? '2e' : '22'), borderColor: ESTADOS[e].color }]}>
                    <Text style={[tb.colHeadTxt, { color: ESTADOS[e].color }]}>{ESTADOS[e].emoji} {ESTADOS[e].label}</Text>
                    <View style={[tb.colCount, { backgroundColor: ESTADOS[e].color }]}><Text style={tb.colCountTxt}>{porEstado[e].length}</Text></View>
                  </View>
                  <View style={{ paddingBottom: 12 }}>
                    {porEstado[e].map(ci => <TarjetaTablero key={ci.id} ci={ci} />)}
                    {porEstado[e].length === 0 && <Text style={[tb.colVacio, { color: c.textMute }]}>{Platform.OS === 'web' ? 'Suelta aquí' : '—'}</Text>}
                  </View>
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
        </ScrollView>
        <TouchableOpacity style={[st.flecha, { left: 6 }]} onPress={() => scrollTablero(-1)} activeOpacity={0.85}><Text style={st.flechaTxt}>‹</Text></TouchableOpacity>
        <TouchableOpacity style={[st.flecha, { right: 6 }]} onPress={() => scrollTablero(1)} activeOpacity={0.85}><Text style={st.flechaTxt}>›</Text></TouchableOpacity>
        </View>
      ) : (
        /* ── Vista Tabla (estilo tabla del CRM) ── */
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={{ width: TABLE_COLS.reduce((s, cc) => s + cc.w, 0) }}>
              {/* Encabezado */}
              <View style={tbl.trHead}>
                {TABLE_COLS.map(cc => (
                  <View key={cc.id} style={[tbl.th, { width: cc.w }]}><Text style={tbl.thTxt} numberOfLines={1}>{cc.label}</Text></View>
                ))}
              </View>
              {/* Filas */}
              {visibles.map((ci, idx) => {
                const est = ESTADOS[colDe(ci.estado)]
                return (
                  <TouchableOpacity key={ci.id} activeOpacity={0.7} onPress={() => setDetalle(ci)}
                    style={[tbl.tr, { borderBottomColor: c.border, backgroundColor: idx % 2 ? (darkMode ? '#0a1827' : '#f8fafc') : c.card }]}>
                    <View style={[tbl.td, { width: TABLE_COLS[0].w }]}><Text style={[tbl.tdBold, { color: c.text }]} numberOfLines={1}>{ci.clientes?.nombre || 'Cliente'}</Text></View>
                    <View style={[tbl.td, { width: TABLE_COLS[1].w }]}><Text style={[tbl.tdTxt, { color: c.textSub }]} numberOfLines={1}>{limpiarTel(ci.clientes?.telefono) || '—'}</Text></View>
                    <View style={[tbl.td, { width: TABLE_COLS[2].w }]}><Text style={[tbl.tdTxt, { color: c.textSub }]} numberOfLines={1}>{propNombre(ci) || '—'}</Text></View>
                    <View style={[tbl.td, { width: TABLE_COLS[3].w }]}><Text style={[tbl.tdTxt, { color: c.textSub }]} numberOfLines={1}>{fmtFecha(ci.fecha_cita)}</Text></View>
                    <View style={[tbl.td, { width: TABLE_COLS[4].w }]}>
                      <View style={[tbl.chip, { backgroundColor: est.color + '22', maxWidth: TABLE_COLS[4].w - 24 }]}><Text style={[tbl.chipTxt, { color: est.color }]} numberOfLines={1}>{est.emoji} {est.label}</Text></View>
                    </View>
                    <View style={[tbl.td, { width: TABLE_COLS[5].w }]}><Text style={[tbl.tdTxt, { color: c.textMute }]} numberOfLines={1}>{ci.prospectador?.nombre || '—'}</Text></View>
                  </TouchableOpacity>
                )
              })}
              {visibles.length === 0 && <Text style={{ color: c.textMute, textAlign: 'center', margin: 20 }}>Sin resultados.</Text>}
            </View>
          </ScrollView>
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
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  calBtnTxt: { fontSize: 12.5, fontWeight: '700' },
  inercia: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 6 },
  inerciaWarn: { backgroundColor: '#fef9c3' },
  inerciaCrit: { backgroundColor: '#fee2e2' },
  inerciaTxt: { fontSize: 10.5, fontWeight: '800' },
  asesorScroll: { maxHeight: 44, marginTop: 8 },
  asesorRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, alignItems: 'center' },
  asesorChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  asesorChipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  asesorChipTxt: { fontSize: 12, fontWeight: '700', maxWidth: 160 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginTop: 10 },
  toggleBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  toggleOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  toggleTxt: { fontSize: 12.5, fontWeight: '800' },
  busca: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7, fontSize: 13.5 },
  vacio: { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 36 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  flecha: { position: 'absolute', top: '45%', width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  flechaTxt: { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 28, marginTop: -2 },
})

// Vista LISTA — estilo CRM
const cl = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  cardBar: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 15, fontWeight: '800' },
  cardHeadInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  fuenteTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, maxWidth: 180 },
  fuenteTagTxt: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, flexShrink: 0, maxWidth: 130 },
  estadoDot: { width: 5, height: 5, borderRadius: 3 },
  estadoTxt: { fontSize: 11, fontWeight: '700' },
  linea: { fontSize: 12.5, marginTop: 2 },
})

// Vista TABLERO — estilo dashboard
const tb = StyleSheet.create({
  col: { borderRadius: 12, padding: 8 },
  colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  colHeadTxt: { fontSize: 13, fontWeight: '900' },
  colCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  colCountTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  colVacio: { textAlign: 'center', color: '#cbd5e1', fontSize: 20, marginTop: 8 },
})
const kc = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
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
// Vista TABLA — estilo de la tabla del CRM
const tbl = StyleSheet.create({
  trHead: { flexDirection: 'row', backgroundColor: '#1a3547', minHeight: 44, alignItems: 'stretch' },
  th: { justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  thTxt: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  tr: { flexDirection: 'row', minHeight: 50, alignItems: 'stretch', borderBottomWidth: 1 },
  td: { justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden' },
  tdTxt: { fontSize: 13 },
  tdBold: { fontSize: 13, fontWeight: '700' },
  chip: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  chipTxt: { fontSize: 11.5, fontWeight: '800' },
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
