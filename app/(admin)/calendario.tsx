// Calendario IN-APP (local, sin Google) — apartado de admin.
// Vista de mes con puntitos en los días con eventos + agenda del día
// seleccionado. Crear / editar / borrar eventos personales (privados por dueño).
import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

type Evento = {
  id: string; titulo: string; descripcion: string | null
  inicio: string; fin: string | null; todo_el_dia: boolean; color: string
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const COLORES = ['#1a6470', '#5e35b1', '#c62828', '#2e7d32', '#f57f17', '#0277bd', '#c9a84c', '#00838f']

// YYYY-MM-DD en hora LOCAL (para agrupar por día sin corrimientos de zona).
function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function horaTxt(iso: string): string {
  const d = new Date(iso); const h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}
// Valor para <input datetime-local> a partir de un Date (hora local, sin UTC).
function paraInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Calendario() {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
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

  // Eventos agrupados por día (clave local).
  const porDia = useMemo(() => {
    const m: Record<string, Evento[]> = {}
    for (const e of eventos) (m[claveDia(new Date(e.inicio))] ??= []).push(e)
    return m
  }, [eventos])

  const y = mes.getFullYear(), m = mes.getMonth()
  const off = (new Date(y, m, 1).getDay() + 6) % 7   // lunes primero
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

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color="#1a6470" /></View>

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 60, alignItems: 'center' }}>
    <View style={{ width: '100%', maxWidth: 760 }}>
      <Text style={[s.h1, { color: c.text }]}>📅 Calendario</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Tu agenda personal. Es privada tuya.</Text>

      {/* Navegación de mes */}
      <View style={s.mesRow}>
        <TouchableOpacity onPress={() => setMes(new Date(y, m - 1, 1))} style={s.navBtn}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
        <Text style={[s.mesTxt, { color: c.text }]}>{MESES[m]} {y}</Text>
        <TouchableOpacity onPress={() => setMes(new Date(y, m + 1, 1))} style={s.navBtn}><Text style={s.navTxt}>›</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { const t = new Date(); setMes(new Date(t.getFullYear(), t.getMonth(), 1)); setSelDia(claveDia(t)) }} style={s.hoyBtn}>
          <Text style={s.hoyTxt}>Hoy</Text>
        </TouchableOpacity>
      </View>

      {/* Rejilla del mes */}
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
                  {evs.slice(0, 3).map(e => <View key={e.id} style={[s.punto, { backgroundColor: e.color }]} />)}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Agenda del día */}
      <View style={s.agendaHead}>
        <Text style={[s.agendaTitulo, { color: c.text }]}>{(() => { const [yy, mm, dd] = selDia.split('-').map(Number); const d = new Date(yy, mm - 1, dd); return `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()]} ${dd} de ${MESES[mm - 1]}` })()}</Text>
        <TouchableOpacity style={s.nuevoBtn} onPress={nuevo}><Text style={s.nuevoTxt}>＋ Evento</Text></TouchableOpacity>
      </View>

      {delDia.length === 0 ? (
        <Text style={[s.vacio, { color: c.textMute }]}>Sin eventos este día. Toca "＋ Evento" para agregar uno.</Text>
      ) : delDia.map(e => (
        <TouchableOpacity key={e.id} style={[s.evento, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => setEditando(e)}>
          <View style={[s.evBar, { backgroundColor: e.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.evTitulo, { color: c.text }]} numberOfLines={1}>{e.titulo}</Text>
            <Text style={[s.evHora, { color: c.textMute }]}>{e.todo_el_dia ? 'Todo el día' : `${horaTxt(e.inicio)}${e.fin ? ` – ${horaTxt(e.fin)}` : ''}`}</Text>
            {e.descripcion ? <Text style={[s.evDesc, { color: c.textSub }]} numberOfLines={2}>{e.descripcion}</Text> : null}
          </View>
        </TouchableOpacity>
      ))}

      {/* Modal crear/editar */}
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
  // Web input date-only (todo el día) o datetime-local.
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
                onChange={(ev: any) => { const val = ev.target.value; const d = new Date(val); if (!isNaN(d.getTime())) onChange({ ...evento, inicio: d.toISOString() }) }}
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
                    onChange={(ev: any) => { const val = ev.target.value; onChange({ ...evento, fin: val ? new Date(val).toISOString() : null }) }}
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
  evTitulo: { fontSize: 15, fontWeight: '700', padding: 12, paddingBottom: 2, paddingLeft: 12 },
  evHora: { fontSize: 12.5, paddingHorizontal: 12 },
  evDesc: { fontSize: 12.5, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 3, lineHeight: 17 },
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
