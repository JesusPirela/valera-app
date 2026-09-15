// Calendario IN-APP (local, sin Google) — apartado de admin.
// Muestra: tus eventos personales (editables) + las CITAS del dashboard
// (por fecha_cita) + los PRÓXIMOS SEGUIMIENTOS fijados al terminar una retro
// (citas_venta.fecha_prox_seguimiento_ts). Citas y seguimientos son de solo
// lectura y al tocarlos te llevan a su pantalla.
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

type Evento = {
  id: string; titulo: string; descripcion: string | null
  inicio: string; fin: string | null; todo_el_dia: boolean; color: string
}
type CalItem = {
  key: string; inicio: string; titulo: string; descripcion: string | null; color: string
  tipo: 'evento' | 'cita' | 'seguimiento'; evento?: Evento; todo_el_dia?: boolean; fin?: string | null; ruta?: string
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const COLORES = ['#1a6470', '#5e35b1', '#c62828', '#2e7d32', '#f57f17', '#0277bd', '#c9a84c', '#00838f']

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

export default function Calendario() {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [extras, setExtras] = useState<CalItem[]>([])   // citas + seguimientos del mes visible
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selDia, setSelDia] = useState(() => claveDia(new Date()))
  const [editando, setEditando] = useState<Partial<Evento> | null>(null)

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

  // Citas del dashboard + próximos seguimientos del mes visible.
  useEffect(() => {
    let vivo = true
    const ini = new Date(mes.getFullYear(), mes.getMonth(), 1).toISOString()
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 1).toISOString()
    Promise.all([
      supabase.from('citas_coordinacion').select('id, fecha_cita, estado, clientes(nombre)')
        .not('fecha_cita', 'is', null).gte('fecha_cita', ini).lt('fecha_cita', fin),
      supabase.from('citas_venta').select('id, cliente_nombre, fecha_prox_seguimiento_ts')
        .not('fecha_prox_seguimiento_ts', 'is', null).gte('fecha_prox_seguimiento_ts', ini).lt('fecha_prox_seguimiento_ts', fin),
    ]).then(([citas, segs]) => {
      if (!vivo) return
      const a: CalItem[] = (citas.data ?? []).map((x: any) => ({
        key: 'c' + x.id, inicio: x.fecha_cita, titulo: `Cita: ${x.clientes?.nombre ?? 'Cliente'}`,
        descripcion: x.estado ? String(x.estado).replace(/_/g, ' ') : null, color: '#2e7d32', tipo: 'cita', ruta: '/(admin)/coordinacion-citas',
      }))
      const b: CalItem[] = (segs.data ?? []).map((x: any) => ({
        key: 's' + x.id, inicio: x.fecha_prox_seguimiento_ts, titulo: `Seguimiento: ${x.cliente_nombre ?? 'Cliente'}`,
        descripcion: null, color: '#f57f17', tipo: 'seguimiento', ruta: '/(admin)/citas-venta',
      }))
      setExtras([...a, ...b])
    })
    return () => { vivo = false }
  }, [mes, eventos])

  // Todos los items (eventos personales + citas + seguimientos) por día.
  const porDia = useMemo(() => {
    const evs: CalItem[] = eventos.map(e => ({
      key: 'e' + e.id, inicio: e.inicio, titulo: e.titulo, descripcion: e.descripcion, color: e.color,
      tipo: 'evento', evento: e, todo_el_dia: e.todo_el_dia, fin: e.fin,
    }))
    const m: Record<string, CalItem[]> = {}
    for (const it of [...evs, ...extras]) (m[claveDia(new Date(it.inicio))] ??= []).push(it)
    return m
  }, [eventos, extras])

  const y = mes.getFullYear(), m = mes.getMonth()
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const diasMes = new Date(y, m + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(off).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)]
  const hoyClave = claveDia(new Date())
  const delDia = (porDia[selDia] ?? []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio))

  function nuevo() {
    const [yy, mm, dd] = selDia.split('-').map(Number)
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

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color="#1a6470" /></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 60, alignItems: 'center' }}>
    <View style={{ width: '100%', maxWidth: 760 }}>
      <Text style={[s.h1, { color: c.text }]}>📅 Calendario</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Tus eventos + las citas del dashboard 🟢 y los próximos seguimientos 🟠.</Text>

      <View style={s.mesRow}>
        <TouchableOpacity onPress={() => setMes(new Date(y, m - 1, 1))} style={s.navBtn}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={[s.mesTxt, { color: c.text }]}>{MESES[m]} {y}</Text>
        <TouchableOpacity onPress={() => setMes(new Date(y, m + 1, 1))} style={s.navBtn}><Text style={s.navTxt}>›</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { const t = new Date(); setMes(new Date(t.getFullYear(), t.getMonth(), 1)); setSelDia(claveDia(t)) }} style={s.hoyBtn}>
          <Text style={s.hoyTxt}>Hoy</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.grid, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row' }}>
          {DOW.map((d, i) => <Text key={i} style={[s.dow, { color: c.textMute }]}>{d}</Text>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {celdas.map((dd, i) => {
            if (dd === null) return <View key={i} style={s.cell} />
            const clave = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
            const evs = porDia[clave] ?? []
            const sel = clave === selDia
            const esHoy = clave === hoyClave
            return (
              <TouchableOpacity key={i} style={s.cell} onPress={() => setSelDia(clave)}>
                <View style={[s.diaWrap, sel && { backgroundColor: '#1a6470' }, !sel && esHoy && { borderWidth: 1.5, borderColor: '#1a6470' }]}>
                  <Text style={{ color: sel ? '#fff' : esHoy ? '#1a6470' : c.text, fontWeight: sel || esHoy ? '800' : '500', fontSize: 13 }}>{dd}</Text>
                </View>
                <View style={s.puntos}>
                  {evs.slice(0, 4).map(e => <View key={e.key} style={[s.punto, { backgroundColor: e.color }]} />)}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={s.agendaHead}>
        <Text style={[s.agendaTitulo, { color: c.text }]}>{(() => { const [yy, mm, dd] = selDia.split('-').map(Number); const d = new Date(yy, mm - 1, dd); return `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()]} ${dd} de ${MESES[mm - 1]}` })()}</Text>
        <TouchableOpacity style={s.nuevoBtn} onPress={nuevo}><Text style={s.nuevoTxt}>＋ Evento</Text></TouchableOpacity>
      </View>

      {delDia.length === 0 ? (
        <Text style={[s.vacio, { color: c.textMute }]}>Sin nada este día. Toca "＋ Evento" para agregar uno tuyo.</Text>
      ) : delDia.map(it => (
        <TouchableOpacity key={it.key} style={[s.evento, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => tocarItem(it)}>
          <View style={[s.evBar, { backgroundColor: it.color }]} />
          <View style={{ flex: 1, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {it.tipo !== 'evento' ? <Text style={[s.tag, { backgroundColor: it.color + '22', color: it.color }]}>{it.tipo === 'cita' ? '📅 Cita' : '🔔 Seguim.'}</Text> : null}
              <Text style={[s.evTitulo, { color: c.text }]} numberOfLines={1}>{it.titulo}</Text>
            </View>
            <Text style={[s.evHora, { color: c.textMute }]}>{it.todo_el_dia ? 'Todo el día' : `${horaTxt(it.inicio)}${it.fin ? ` – ${horaTxt(it.fin)}` : ''}`}{it.tipo !== 'evento' ? '  ·  toca para ver ›' : ''}</Text>
            {it.descripcion ? <Text style={[s.evDesc, { color: c.textSub }]} numberOfLines={2}>{it.descripcion}</Text> : null}
          </View>
        </TouchableOpacity>
      ))}

      {editando && (
        <ModalEvento evento={editando} c={c} onChange={setEditando} onGuardar={guardar} onBorrar={borrar} onClose={() => setEditando(null)} />
      )}
    </View>
    </ScrollView>
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
  mesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  navBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  navTxt: { fontSize: 26, color: '#1a6470', fontWeight: '800' },
  mesTxt: { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  hoyBtn: { borderWidth: 1, borderColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  hoyTxt: { color: '#1a6470', fontWeight: '800', fontSize: 12.5 },
  grid: { borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 12 },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, height: 58, alignItems: 'center', paddingTop: 5 },
  diaWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', gap: 2, marginTop: 2, height: 6 },
  punto: { width: 5, height: 5, borderRadius: 3 },
  agendaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  agendaTitulo: { fontSize: 15.5, fontWeight: '800', flex: 1 },
  nuevoBtn: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  nuevoTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  vacio: { fontSize: 13.5, marginTop: 14, lineHeight: 19 },
  evento: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  evBar: { width: 5 },
  tag: { fontSize: 10, fontWeight: '800', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  evTitulo: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  evHora: { fontSize: 12.5, marginTop: 3 },
  evDesc: { fontSize: 12.5, marginTop: 3, lineHeight: 17, textTransform: 'capitalize' },
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
