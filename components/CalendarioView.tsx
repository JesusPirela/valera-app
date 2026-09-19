// Calendario IN-APP (local, sin Google) — compartido por admin/gerencia y asesor.
// Muestra: tus eventos personales (editables) + las CITAS del dashboard
// (por fecha_cita) + los PRÓXIMOS SEGUIMIENTOS fijados al terminar una retro
// (citas_venta.fecha_prox_seguimiento_ts).
//
// Vistas: Mes · Semana · Día · Agenda. Filtros por tipo + leyenda, búsqueda,
// acciones de contacto (WhatsApp/llamar/ficha) desde cada cita, seguimientos
// vencidos resaltados y contador de citas de hoy.
//
// - Admin/gerencia (esAsesor=false): ve TODAS las citas del equipo (según RLS).
// - Asesor (esAsesor=true): ve SOLO sus propias citas (asesor_id = él).
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { getUsuarioActual } from '../lib/sesion'
import { useColors } from '../lib/ThemeContext'

type Evento = {
  id: string; titulo: string; descripcion: string | null
  inicio: string; fin: string | null; todo_el_dia: boolean; color: string
}
type Tipo = 'evento' | 'cita' | 'seguimiento'
type CalItem = {
  key: string; inicio: string; titulo: string; descripcion: string | null; color: string
  tipo: Tipo; evento?: Evento; todo_el_dia?: boolean; fin?: string | null; ruta?: string
  telefono?: string | null; clienteId?: string | null; vencido?: boolean
}
type Vista = 'mes' | 'semana' | 'dia' | 'agenda'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DOW_FULL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const COLORES = ['#1a6470', '#5e35b1', '#c62828', '#2e7d32', '#f57f17', '#0277bd', '#c9a84c', '#00838f']
const HORA_INI = 7, HORA_FIN = 22, ROW_H = 46   // rejilla de horas (7am–10pm)

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function horaTxt(iso: string): string {
  const d = new Date(iso); const h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}
function paraInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function inicioSemana(d: Date): Date {   // lunes de la semana de d
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x
}
function sumarDias(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function minutosDe(iso: string): number { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
function limpiarTel(t: string | null | undefined): string { return (t ?? '').replace(/[^\d+]/g, '') }

export default function CalendarioView({ esAsesor = false }: { esAsesor?: boolean }) {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [extras, setExtras] = useState<CalItem[]>([])   // citas + seguimientos del rango visible
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<Vista>('mes')
  const [cursor, setCursor] = useState(() => new Date())   // fecha ancla (según la vista)
  const [selDia, setSelDia] = useState(() => claveDia(new Date()))
  const [editando, setEditando] = useState<Partial<Evento> | null>(null)
  const [busca, setBusca] = useState('')
  const [filtros, setFiltros] = useState<Record<Tipo, boolean>>({ evento: true, cita: true, seguimiento: true })

  const rutaCita = esAsesor ? '/(prospectador)/asesor-citas' : '/(admin)/coordinacion-citas'
  const rutaSeguimiento = esAsesor ? '/(prospectador)/asesor-citas' : '/(admin)/citas-venta'
  const rutaFicha = esAsesor ? '/(prospectador)/detalle-cliente' : '/(admin)/detalle-cliente'

  // Rango [ini, fin) que se carga de citas/seguimientos según la vista.
  const rango = useMemo(() => {
    const c0 = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    if (vista === 'mes') return { ini: new Date(cursor.getFullYear(), cursor.getMonth(), 1), fin: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) }
    if (vista === 'semana') { const l = inicioSemana(cursor); return { ini: l, fin: sumarDias(l, 7) } }
    if (vista === 'dia') return { ini: c0, fin: sumarDias(c0, 1) }
    const hoy = new Date(); const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    return { ini: h0, fin: sumarDias(h0, 60) }   // agenda: próximos 60 días
  }, [cursor, vista])

  const cargar = useCallback(async () => {
    const { data: { user } } = await getUsuarioActual()
    if (!user) { setLoading(false); return }
    setMiId(user.id)
    const { data } = await supabase.from('eventos_calendario')
      .select('id, titulo, descripcion, inicio, fin, todo_el_dia, color')
      .eq('user_id', user.id).order('inicio')
    setEventos((data ?? []) as Evento[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // Citas + próximos seguimientos del rango visible.
  useEffect(() => {
    if (esAsesor && !miId) return
    let vivo = true
    const ini = rango.ini.toISOString(), fin = rango.fin.toISOString()
    let qCitas = supabase.from('citas_coordinacion')
      .select('id, cliente_id, fecha_cita, estado, clientes(nombre, telefono)')
      .not('fecha_cita', 'is', null).gte('fecha_cita', ini).lt('fecha_cita', fin)
    let qSegs = supabase.from('citas_venta')
      .select('id, cliente_nombre, telefono, fecha_prox_seguimiento_ts')
      .not('fecha_prox_seguimiento_ts', 'is', null).gte('fecha_prox_seguimiento_ts', ini).lt('fecha_prox_seguimiento_ts', fin)
    if (esAsesor && miId) { qCitas = qCitas.eq('asesor_id', miId); qSegs = qSegs.eq('asesor_id', miId) }
    const ahora = Date.now()
    Promise.all([qCitas, qSegs]).then(([citas, segs]) => {
      if (!vivo) return
      const a: CalItem[] = (citas.data ?? []).map((x: any) => ({
        key: 'c' + x.id, inicio: x.fecha_cita, titulo: `Cita: ${x.clientes?.nombre ?? 'Cliente'}`,
        descripcion: x.estado ? String(x.estado).replace(/_/g, ' ') : null, color: '#2e7d32', tipo: 'cita',
        ruta: rutaCita, telefono: x.clientes?.telefono ?? null, clienteId: x.cliente_id ?? null,
      }))
      const b: CalItem[] = (segs.data ?? []).map((x: any) => ({
        key: 's' + x.id, inicio: x.fecha_prox_seguimiento_ts, titulo: `Seguimiento: ${x.cliente_nombre ?? 'Cliente'}`,
        descripcion: null, color: '#f57f17', tipo: 'seguimiento', ruta: rutaSeguimiento,
        telefono: x.telefono ?? null, vencido: new Date(x.fecha_prox_seguimiento_ts).getTime() < ahora,
      }))
      setExtras([...a, ...b])
    })
    return () => { vivo = false }
  }, [rango, eventos, esAsesor, miId])

  // Items filtrados (tipo + búsqueda) por día.
  const q = busca.trim().toLowerCase()
  const items = useMemo(() => {
    const evs: CalItem[] = eventos.map(e => ({
      key: 'e' + e.id, inicio: e.inicio, titulo: e.titulo, descripcion: e.descripcion, color: e.color,
      tipo: 'evento', evento: e, todo_el_dia: e.todo_el_dia, fin: e.fin,
    }))
    return [...evs, ...extras]
      .filter(it => filtros[it.tipo])
      .filter(it => !q || `${it.titulo} ${it.descripcion ?? ''}`.toLowerCase().includes(q))
  }, [eventos, extras, filtros, q])

  const porDia = useMemo(() => {
    const m: Record<string, CalItem[]> = {}
    for (const it of items) (m[claveDia(new Date(it.inicio))] ??= []).push(it)
    return m
  }, [items])

  const hoyClave = claveDia(new Date())
  const citasHoy = (porDia[hoyClave] ?? []).filter(it => it.tipo === 'cita').length

  function nuevo(claveBase?: string) {
    const base = claveBase ?? selDia
    const [yy, mm, dd] = base.split('-').map(Number)
    const ini = new Date(yy, mm - 1, dd, 9, 0)
    setEditando({ titulo: '', descripcion: '', inicio: ini.toISOString(), fin: null, todo_el_dia: false, color: COLORES[0] })
  }
  async function guardar() {
    if (!editando || !miId || !editando.titulo?.trim() || !editando.inicio) return
    const payload = {
      user_id: miId, titulo: editando.titulo.trim(), descripcion: editando.descripcion?.trim() || null,
      inicio: editando.inicio, fin: editando.todo_el_dia ? null : (editando.fin || null),
      todo_el_dia: !!editando.todo_el_dia, color: editando.color || COLORES[0],
    }
    if (editando.id) await supabase.from('eventos_calendario').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editando.id)
    else await supabase.from('eventos_calendario').insert(payload)
    setEditando(null); cargar()
  }
  function borrar(id: string) {
    const go = async () => { setEventos(prev => prev.filter(e => e.id !== id)); setEditando(null); await supabase.from('eventos_calendario').delete().eq('id', id) }
    if (Platform.OS === 'web') { if (window.confirm('¿Borrar este evento?')) go() }
    else Alert.alert('Borrar evento', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }
  function tocarItem(it: CalItem) {
    if (it.tipo === 'evento' && it.evento) setEditando(it.evento)
    else if (it.ruta) router.push(it.ruta as any)
  }
  function whatsapp(tel: string) { Linking.openURL(`https://wa.me/${limpiarTel(tel).replace(/^\+/, '')}`) }
  function llamar(tel: string) { Linking.openURL(`tel:${limpiarTel(tel)}`) }

  // Navegación (prev/next) según la vista.
  function mover(dir: 1 | -1) {
    if (vista === 'mes') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else if (vista === 'semana') setCursor(sumarDias(cursor, 7 * dir))
    else setCursor(sumarDias(cursor, dir))
  }
  function irHoy() { const t = new Date(); setCursor(t); setSelDia(claveDia(t)) }

  const etiquetaRango = (() => {
    if (vista === 'mes') return `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (vista === 'dia') return `${DIAS_LARGOS[cursor.getDay()]} ${cursor.getDate()} ${MES_CORTO[cursor.getMonth()]}`
    if (vista === 'semana') { const l = inicioSemana(cursor), f = sumarDias(l, 6); return `${l.getDate()} ${MES_CORTO[l.getMonth()]} – ${f.getDate()} ${MES_CORTO[f.getMonth()]}` }
    return 'Próximos 60 días'
  })()

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color="#1a6470" /></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 60, alignItems: 'center' }}>
    <View style={{ width: '100%', maxWidth: 860 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.h1, { color: c.text }]}>📅 Calendario</Text>
          <Text style={[s.sub, { color: c.textMute }]}>Tus eventos + {esAsesor ? 'tus citas' : 'las citas'} 🟢 y {esAsesor ? 'tus seguimientos' : 'seguimientos'} 🟠.</Text>
        </View>
        <View style={[s.hoyPill, citasHoy > 0 ? { backgroundColor: '#1a6470' } : { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
          <Text style={[s.hoyPillN, { color: citasHoy > 0 ? '#fff' : c.text }]}>{citasHoy}</Text>
          <Text style={[s.hoyPillL, { color: citasHoy > 0 ? '#dbeafe' : c.textMute }]}>hoy</Text>
        </View>
      </View>

      {/* Selector de vista */}
      <View style={s.vistaRow}>
        {(['mes', 'semana', 'dia', 'agenda'] as Vista[]).map(v => (
          <TouchableOpacity key={v} onPress={() => setVista(v)} style={[s.vistaBtn, { borderColor: c.border }, vista === v && s.vistaOn]}>
            <Text style={[s.vistaTxt, { color: vista === v ? '#fff' : c.textSub }]}>{v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : v === 'dia' ? 'Día' : 'Agenda'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Navegación */}
      {vista !== 'agenda' && (
        <View style={s.mesRow}>
          <TouchableOpacity onPress={() => mover(-1)} style={s.navBtn}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
          <Text style={[s.mesTxt, { color: c.text }]}>{etiquetaRango}</Text>
          <TouchableOpacity onPress={() => mover(1)} style={s.navBtn}><Text style={s.navTxt}>›</Text></TouchableOpacity>
          <TouchableOpacity onPress={irHoy} style={s.hoyBtn}><Text style={s.hoyTxt}>Hoy</Text></TouchableOpacity>
        </View>
      )}

      {/* Filtros por tipo + leyenda */}
      <View style={s.filtros}>
        {([['cita', 'Citas', '#2e7d32'], ['seguimiento', 'Seguimientos', '#f57f17'], ['evento', 'Mis eventos', '#5e35b1']] as [Tipo, string, string][]).map(([t, lbl, col]) => (
          <TouchableOpacity key={t} onPress={() => setFiltros(f => ({ ...f, [t]: !f[t] }))}
            style={[s.filtroChip, { borderColor: c.border, backgroundColor: c.card }, !filtros[t] && { opacity: 0.4 }]}>
            <View style={[s.filtroDot, { backgroundColor: col }]} />
            <Text style={[s.filtroTxt, { color: c.text }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={[s.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <Ionicons name="search-outline" size={15} color={c.textMute} />
        <TextInput style={[s.buscaInp, { color: c.text }]} value={busca} onChangeText={setBusca} placeholder="Buscar evento, cita o cliente…" placeholderTextColor={c.placeholder} />
        {busca ? <TouchableOpacity onPress={() => setBusca('')}><Ionicons name="close-circle" size={16} color={c.textMute} /></TouchableOpacity> : null}
      </View>

      {vista === 'mes' && <VistaMes {...{ cursor, porDia, selDia, setSelDia, hoyClave, c }} />}
      {vista === 'semana' && <RejillaHoras dias={Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana(cursor), i))} porDia={porDia} hoyClave={hoyClave} c={c} onItem={tocarItem} onNuevo={nuevo} />}
      {vista === 'dia' && <RejillaHoras dias={[new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]} porDia={porDia} hoyClave={hoyClave} c={c} onItem={tocarItem} onNuevo={nuevo} />}

      {(vista === 'mes' || vista === 'dia') && (
        <ListaDia
          titulo={vista === 'dia' ? DIAS_LARGOS[cursor.getDay()] + ' ' + cursor.getDate() : null}
          clave={vista === 'dia' ? claveDia(cursor) : selDia}
          porDia={porDia} c={c} onItem={tocarItem} onNuevo={nuevo} onWhats={whatsapp} onLlamar={llamar} rutaFicha={rutaFicha}
        />
      )}

      {vista === 'agenda' && (
        <VistaAgenda items={items} rango={rango} c={c} onItem={tocarItem} onWhats={whatsapp} onLlamar={llamar} rutaFicha={rutaFicha} />
      )}

      {editando && (
        <ModalEvento evento={editando} c={c} onChange={setEditando} onGuardar={guardar} onBorrar={borrar} onClose={() => setEditando(null)} />
      )}
    </View>
    </ScrollView>
  )
}

// ── Vista Mes (rejilla de días) ──
function VistaMes({ cursor, porDia, selDia, setSelDia, hoyClave, c }: {
  cursor: Date; porDia: Record<string, CalItem[]>; selDia: string; setSelDia: (k: string) => void; hoyClave: string; c: ReturnType<typeof useColors>
}) {
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const diasMes = new Date(y, m + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(off).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)]
  return (
    <View style={[s.grid, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row' }}>
        {DOW.map((d, i) => <Text key={i} style={[s.dow, { color: c.textMute }]}>{d}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {celdas.map((dd, i) => {
          if (dd === null) return <View key={i} style={s.cell} />
          const clave = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
          const evs = porDia[clave] ?? []
          const sel = clave === selDia, esHoy = clave === hoyClave
          return (
            <TouchableOpacity key={i} style={s.cell} onPress={() => setSelDia(clave)}>
              <View style={[s.diaWrap, sel && { backgroundColor: '#1a6470' }, !sel && esHoy && { borderWidth: 1.5, borderColor: '#1a6470' }]}>
                <Text style={{ color: sel ? '#fff' : esHoy ? '#1a6470' : c.text, fontWeight: sel || esHoy ? '800' : '500', fontSize: 13 }}>{dd}</Text>
              </View>
              <View style={s.puntos}>
                {evs.slice(0, 4).map(e => <View key={e.key} style={[s.punto, { backgroundColor: e.vencido ? '#dc2626' : e.color }]} />)}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ── Rejilla de horas (Semana / Día) ──
function RejillaHoras({ dias, porDia, hoyClave, c, onItem, onNuevo }: {
  dias: Date[]; porDia: Record<string, CalItem[]>; hoyClave: string; c: ReturnType<typeof useColors>
  onItem: (it: CalItem) => void; onNuevo: (clave: string) => void
}) {
  const horas = Array.from({ length: HORA_FIN - HORA_INI }, (_, i) => HORA_INI + i)
  const totalH = horas.length * ROW_H
  return (
    <View style={[s.grid, { backgroundColor: c.card, borderColor: c.border, padding: 0, overflow: 'hidden' }]}>
      {/* Encabezado de días */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border }}>
        <View style={{ width: 44 }} />
        {dias.map((d, i) => {
          const esHoy = claveDia(d) === hoyClave
          return (
            <TouchableOpacity key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }} onPress={() => onNuevo(claveDia(d))}>
              <Text style={[s.rejDow, { color: c.textMute }]}>{DOW_FULL[(d.getDay() + 6) % 7]}</Text>
              <View style={[s.rejNum, esHoy && { backgroundColor: '#1a6470' }]}>
                <Text style={{ color: esHoy ? '#fff' : c.text, fontWeight: '800', fontSize: 13 }}>{d.getDate()}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
      {/* Todo el día */}
      {dias.some(d => (porDia[claveDia(d)] ?? []).some(e => e.todo_el_dia)) && (
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border, minHeight: 24 }}>
          <View style={{ width: 44, justifyContent: 'center' }}><Text style={[s.rejHora, { color: c.textMute }]}>Todo</Text></View>
          {dias.map((d, i) => (
            <View key={i} style={{ flex: 1, padding: 2, gap: 2 }}>
              {(porDia[claveDia(d)] ?? []).filter(e => e.todo_el_dia).map(e => (
                <TouchableOpacity key={e.key} onPress={() => onItem(e)} style={{ backgroundColor: e.color, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                  <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{e.titulo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}
      {/* Rejilla */}
      <View style={{ flexDirection: 'row', height: totalH }}>
        <View style={{ width: 44 }}>
          {horas.map(h => (
            <View key={h} style={{ height: ROW_H }}>
              <Text style={[s.rejHora, { color: c.textMute }]}>{h % 12 || 12}{h < 12 ? 'a' : 'p'}</Text>
            </View>
          ))}
        </View>
        {dias.map((d, di) => {
          const evs = (porDia[claveDia(d)] ?? []).filter(e => !e.todo_el_dia)
          return (
            <View key={di} style={{ flex: 1, borderLeftWidth: 1, borderColor: c.border }}>
              {horas.map(h => <View key={h} style={{ position: 'absolute', top: (h - HORA_INI) * ROW_H, left: 0, right: 0, height: 1, backgroundColor: c.border, opacity: 0.5 }} />)}
              {evs.map(e => {
                const top = Math.max(0, Math.min(totalH - 20, (minutosDe(e.inicio) - HORA_INI * 60) / 60 * ROW_H))
                const dur = e.fin ? Math.max(20, (minutosDe(e.fin) - minutosDe(e.inicio))) : 45
                const alto = Math.max(20, Math.min(totalH - top, dur / 60 * ROW_H))
                return (
                  <TouchableOpacity key={e.key} onPress={() => onItem(e)}
                    style={{ position: 'absolute', top, left: 2, right: 2, height: alto, backgroundColor: (e.vencido ? '#dc2626' : e.color) + '22', borderLeftWidth: 3, borderLeftColor: e.vencido ? '#dc2626' : e.color, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2, overflow: 'hidden' }}>
                    <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '800', color: e.vencido ? '#dc2626' : e.color }}>{e.titulo}</Text>
                    <Text style={{ fontSize: 9, color: c.textMute }}>{horaTxt(e.inicio)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ── Lista del día (bajo el mes o el día) con acciones de contacto ──
function ListaDia({ titulo, clave, porDia, c, onItem, onNuevo, onWhats, onLlamar, rutaFicha }: {
  titulo: string | null; clave: string; porDia: Record<string, CalItem[]>; c: ReturnType<typeof useColors>
  onItem: (it: CalItem) => void; onNuevo: (clave: string) => void; onWhats: (t: string) => void; onLlamar: (t: string) => void; rutaFicha: string
}) {
  const [yy, mm, dd] = clave.split('-').map(Number)
  const d = new Date(yy, mm - 1, dd)
  const del = (porDia[clave] ?? []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio))
  return (
    <>
      <View style={s.agendaHead}>
        <Text style={[s.agendaTitulo, { color: c.text }]}>{titulo ?? `${DIAS_LARGOS[d.getDay()]} ${dd} de ${MESES[mm - 1]}`}</Text>
        <TouchableOpacity style={s.nuevoBtn} onPress={() => onNuevo(clave)}><Text style={s.nuevoTxt}>＋ Evento</Text></TouchableOpacity>
      </View>
      {del.length === 0
        ? <Text style={[s.vacio, { color: c.textMute }]}>Sin nada este día. Toca "＋ Evento" para agregar uno tuyo.</Text>
        : del.map(it => <ItemAgenda key={it.key} it={it} c={c} onItem={onItem} onWhats={onWhats} onLlamar={onLlamar} rutaFicha={rutaFicha} />)}
    </>
  )
}

// ── Vista Agenda (próximos, agrupada por día) ──
function VistaAgenda({ items, rango, c, onItem, onWhats, onLlamar, rutaFicha }: {
  items: CalItem[]; rango: { ini: Date; fin: Date }; c: ReturnType<typeof useColors>
  onItem: (it: CalItem) => void; onWhats: (t: string) => void; onLlamar: (t: string) => void; rutaFicha: string
}) {
  const enRango = items
    .filter(it => { const t = new Date(it.inicio); return t >= rango.ini && t < rango.fin })
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  if (enRango.length === 0) return <Text style={[s.vacio, { color: c.textMute }]}>Nada agendado en los próximos días.</Text>
  const grupos: { clave: string; items: CalItem[] }[] = []
  for (const it of enRango) {
    const k = claveDia(new Date(it.inicio))
    const g = grupos[grupos.length - 1]
    if (g && g.clave === k) g.items.push(it); else grupos.push({ clave: k, items: [it] })
  }
  return (
    <View style={{ marginTop: 14 }}>
      {grupos.map(g => {
        const [yy, mm, dd] = g.clave.split('-').map(Number); const d = new Date(yy, mm - 1, dd)
        return (
          <View key={g.clave} style={{ marginBottom: 10 }}>
            <Text style={[s.agendaFecha, { color: c.textSub }]}>{DIAS_LARGOS[d.getDay()]} {dd} {MES_CORTO[mm - 1]}</Text>
            {g.items.map(it => <ItemAgenda key={it.key} it={it} c={c} onItem={onItem} onWhats={onWhats} onLlamar={onLlamar} rutaFicha={rutaFicha} />)}
          </View>
        )
      })}
    </View>
  )
}

// ── Fila de item con acciones (WhatsApp / llamar / ficha) ──
function ItemAgenda({ it, c, onItem, onWhats, onLlamar, rutaFicha }: {
  it: CalItem; c: ReturnType<typeof useColors>; onItem: (it: CalItem) => void
  onWhats: (t: string) => void; onLlamar: (t: string) => void; rutaFicha: string
}) {
  const col = it.vencido ? '#dc2626' : it.color
  return (
    <View style={[s.evento, { backgroundColor: c.card, borderColor: it.vencido ? '#dc2626' : c.border }]}>
      <View style={[s.evBar, { backgroundColor: col }]} />
      <TouchableOpacity style={{ flex: 1, padding: 12 }} onPress={() => onItem(it)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {it.tipo !== 'evento' ? <Text style={[s.tag, { backgroundColor: col + '22', color: col }]}>{it.tipo === 'cita' ? '📅 Cita' : it.vencido ? '⚠️ Vencido' : '🔔 Seguim.'}</Text> : null}
          <Text style={[s.evTitulo, { color: c.text }]} numberOfLines={1}>{it.titulo}</Text>
        </View>
        <Text style={[s.evHora, { color: c.textMute }]}>{it.todo_el_dia ? 'Todo el día' : `${horaTxt(it.inicio)}${it.fin ? ` – ${horaTxt(it.fin)}` : ''}`}{it.tipo !== 'evento' ? '  ·  toca para ver ›' : ''}</Text>
        {it.descripcion ? <Text style={[s.evDesc, { color: c.textSub }]} numberOfLines={2}>{it.descripcion}</Text> : null}
      </TouchableOpacity>
      {it.tipo !== 'evento' && (it.telefono || it.clienteId) ? (
        <View style={s.acciones}>
          {it.telefono ? <TouchableOpacity style={[s.accBtn, { backgroundColor: '#25D36622' }]} onPress={() => onWhats(it.telefono!)}><Ionicons name="logo-whatsapp" size={16} color="#128C7E" /></TouchableOpacity> : null}
          {it.telefono ? <TouchableOpacity style={[s.accBtn, { backgroundColor: '#1a647022' }]} onPress={() => onLlamar(it.telefono!)}><Ionicons name="call" size={15} color="#1a6470" /></TouchableOpacity> : null}
          {it.clienteId ? <TouchableOpacity style={[s.accBtn, { backgroundColor: '#5e35b122' }]} onPress={() => router.push(`${rutaFicha}?id=${it.clienteId}` as any)}><Ionicons name="person" size={15} color="#5e35b1" /></TouchableOpacity> : null}
        </View>
      ) : null}
    </View>
  )
}

function ModalEvento({ evento, c, onChange, onGuardar, onBorrar, onClose }: {
  evento: Partial<Evento>; c: ReturnType<typeof useColors>
  onChange: (e: Partial<Evento>) => void; onGuardar: () => void; onBorrar: (id: string) => void; onClose: () => void
}) {
  const inp = [s.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]
  const iniDate = evento.inicio ? new Date(evento.inicio) : new Date()
  const finDate = evento.fin ? new Date(evento.fin) : null
  useEffect(() => { if (evento.todo_el_dia && evento.fin) onChange({ ...evento, fin: null }) }, [evento.todo_el_dia])

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: c.card }]}>
          <View style={s.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[s.mTit, { color: c.text }]}>{evento.id ? 'Editar evento' : 'Nuevo evento'}</Text>

            <Text style={[s.lbl, { color: c.textSub }]}>Título</Text>
            <TextInput style={inp} value={evento.titulo ?? ''} onChangeText={v => onChange({ ...evento, titulo: v })} placeholder="¿Qué es?" placeholderTextColor={c.placeholder} />

            <TouchableOpacity style={s.switchRow} onPress={() => onChange({ ...evento, todo_el_dia: !evento.todo_el_dia })}>
              <View style={[s.check, evento.todo_el_dia && s.checkOn]}>{evento.todo_el_dia && <Text style={s.checkTxt}>✓</Text>}</View>
              <Text style={[s.switchLbl, { color: c.text }]}>Todo el día</Text>
            </TouchableOpacity>

            <Text style={[s.lbl, { color: c.textSub }]}>Inicio</Text>
            {Platform.OS === 'web' ? (
              /* @ts-ignore */
              <input type={evento.todo_el_dia ? 'date' : 'datetime-local'}
                value={evento.todo_el_dia ? paraInput(iniDate).slice(0, 10) : paraInput(iniDate)}
                onChange={(ev: any) => { const d = new Date(ev.target.value); if (!isNaN(d.getTime())) onChange({ ...evento, inicio: d.toISOString() }) }}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.inputBorder}`, fontSize: 14.5, color: c.inputText, backgroundColor: c.input, outline: 'none', boxSizing: 'border-box' }} />
            ) : (
              <TextInput style={inp} value={paraInput(iniDate)} onChangeText={v => { const d = new Date(v); if (!isNaN(d.getTime())) onChange({ ...evento, inicio: d.toISOString() }) }} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={c.placeholder} />
            )}

            {!evento.todo_el_dia && (
              <>
                <Text style={[s.lbl, { color: c.textSub }]}>Fin (opcional)</Text>
                {Platform.OS === 'web' ? (
                  /* @ts-ignore */
                  <input type="datetime-local" value={finDate ? paraInput(finDate) : ''}
                    onChange={(ev: any) => onChange({ ...evento, fin: ev.target.value ? new Date(ev.target.value).toISOString() : null })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.inputBorder}`, fontSize: 14.5, color: c.inputText, backgroundColor: c.input, outline: 'none', boxSizing: 'border-box' }} />
                ) : (
                  <TextInput style={inp} value={finDate ? paraInput(finDate) : ''} onChangeText={v => onChange({ ...evento, fin: v ? new Date(v).toISOString() : null })} placeholder="YYYY-MM-DD HH:MM (opcional)" placeholderTextColor={c.placeholder} />
                )}
              </>
            )}

            <Text style={[s.lbl, { color: c.textSub }]}>Notas</Text>
            <TextInput style={[...inp, { minHeight: 60, textAlignVertical: 'top' }]} value={evento.descripcion ?? ''} onChangeText={v => onChange({ ...evento, descripcion: v })} placeholder="Detalles…" placeholderTextColor={c.placeholder} multiline />

            <Text style={[s.lbl, { color: c.textSub }]}>Color</Text>
            <View style={s.colores}>
              {COLORES.map(col => (
                <TouchableOpacity key={col} onPress={() => onChange({ ...evento, color: col })} style={[s.colorChip, { backgroundColor: col }, evento.color === col && s.colorSel]} />
              ))}
            </View>

            <TouchableOpacity style={s.guardarBtn} onPress={onGuardar}><Text style={s.guardarTxt}>Guardar evento</Text></TouchableOpacity>
            {evento.id ? <TouchableOpacity style={s.borrarBtn} onPress={() => onBorrar(evento.id!)}><Text style={s.borrarTxt}>🗑 Borrar</Text></TouchableOpacity> : null}
            <TouchableOpacity style={s.cerrar} onPress={onClose}><Text style={[s.cerrarTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  hoyPill: { minWidth: 46, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  hoyPillN: { fontSize: 18, fontWeight: '900' },
  hoyPillL: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  vistaRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  vistaBtn: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 7, alignItems: 'center' },
  vistaOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  vistaTxt: { fontSize: 12.5, fontWeight: '800' },
  mesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  navBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  navTxt: { fontSize: 26, color: '#1a6470', fontWeight: '800' },
  mesTxt: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  hoyBtn: { borderWidth: 1, borderColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  hoyTxt: { color: '#1a6470', fontWeight: '800', fontSize: 12.5 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  filtroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  filtroDot: { width: 9, height: 9, borderRadius: 5 },
  filtroTxt: { fontSize: 12, fontWeight: '700' },
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  buscaInp: { flex: 1, fontSize: 13.5, padding: 0 },
  grid: { borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 12, width: '100%' },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, height: 58, alignItems: 'center', paddingTop: 5 },
  diaWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', gap: 2, marginTop: 2, height: 6 },
  punto: { width: 5, height: 5, borderRadius: 3 },
  rejDow: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  rejNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rejHora: { fontSize: 9.5, fontWeight: '600', textAlign: 'center', marginTop: -6 },
  agendaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  agendaTitulo: { fontSize: 15.5, fontWeight: '800', flex: 1 },
  agendaFecha: { fontSize: 12.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  nuevoBtn: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  nuevoTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  vacio: { fontSize: 13.5, marginTop: 14, lineHeight: 19 },
  evento: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 10, alignItems: 'stretch' },
  evBar: { width: 5 },
  tag: { fontSize: 10, fontWeight: '800', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  evTitulo: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  evHora: { fontSize: 12.5, marginTop: 3 },
  evDesc: { fontSize: 12.5, marginTop: 3, lineHeight: 17, textTransform: 'capitalize' },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  accBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  mTit: { fontSize: 19, fontWeight: '900', marginBottom: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  inp: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  checkTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  switchLbl: { fontSize: 14, fontWeight: '600' },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorChip: { width: 30, height: 30, borderRadius: 15 },
  colorSel: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },
  guardarBtn: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  borrarBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  borrarTxt: { color: '#c0392b', fontWeight: '800', fontSize: 14 },
  cerrar: { alignItems: 'center', paddingVertical: 12 },
  cerrarTxt: { fontSize: 14, fontWeight: '700' },
})
