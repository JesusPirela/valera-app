// Apartado PRIVADO del admin para sus 1-a-1 con el equipo.
// - Pestaña "Preparar": eliges a la persona, editas ANTES los puntos a tratar
//   (con nota por punto), copias esa agenda a otras personas, y un cronómetro
//   simple aparte. Al terminar puedes guardar la charla en el historial.
// - Pestaña "Historial": bitácora general de TODAS tus charlas (con quién y
//   cuándo); tocas una y ves las notas que quedaron.
// Todo es privado tuyo (RLS por owner_id); NUNCA se le envía nada al prospectador.
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

const TEAL = '#1a6470'

type Persona = { id: string; nombre: string; role: string }
type Punto = { id: string; texto: string; nota: string | null; hecho: boolean; orden: number }
type Sesion = { id: string; prospectador_id: string; duracion_seg: number; notas: string | null; created_at: string }

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function UnoAUno() {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [vista, setVista] = useState<'preparar' | 'historial'>('preparar')

  const [sel, setSel] = useState<Persona | null>(null)
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [modoCopiar, setModoCopiar] = useState(false)
  const [busca, setBusca] = useState('')

  const [puntos, setPuntos] = useState<Punto[]>([])
  const [cargando, setCargando] = useState(false)
  const [nuevoPunto, setNuevoPunto] = useState('')

  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [abierta, setAbierta] = useState<string | null>(null)

  // Cronómetro simple (opcional, aparte)
  const [seg, setSeg] = useState(0)
  const [corriendo, setCorriendo] = useState(false)
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (corriendo) {
      intRef.current = setInterval(() => setSeg(s => s + 1), 1000)
      return () => { if (intRef.current) clearInterval(intRef.current) }
    }
  }, [corriendo])

  const nombreDe = useCallback((id: string) => personas.find(p => p.id === id)?.nombre ?? 'Alguien', [personas])

  useFocusEffect(useCallback(() => {
    getUsuarioActual().then(({ data: { user } }) => { if (user) setMiId(user.id) })
    supabase.from('profiles').select('id, nombre, role').eq('activo', true).order('nombre')
      .then(({ data }) => setPersonas((data ?? []).filter((p: any) => p.role !== 'admin' && p.nombre) as Persona[]))
  }, []))

  const cargarHistorial = useCallback(async () => {
    if (!miId) return
    const { data } = await supabase.from('uno_a_uno_sesiones')
      .select('id, prospectador_id, duracion_seg, notas, created_at')
      .eq('owner_id', miId).order('created_at', { ascending: false }).limit(200)
    setSesiones((data ?? []) as Sesion[])
  }, [miId])
  useEffect(() => { if (vista === 'historial') cargarHistorial() }, [vista, cargarHistorial])

  const cargarDe = useCallback(async (persona: Persona) => {
    if (!miId) return
    setCargando(true)
    const { data } = await supabase.from('uno_a_uno_puntos').select('id, texto, nota, hecho, orden')
      .eq('owner_id', miId).eq('prospectador_id', persona.id).order('orden')
    setPuntos((data ?? []) as Punto[])
    setCargando(false)
  }, [miId])

  function abrirSelector() { setModoCopiar(false); setBusca(''); setPickerAbierto(true) }
  function abrirCopiar() { setModoCopiar(true); setBusca(''); setPickerAbierto(true) }

  async function onElegirPersona(p: Persona) {
    if (modoCopiar) {
      if (!miId || puntos.length === 0) { setPickerAbierto(false); return }
      const filas = puntos.map((pt, i) => ({ owner_id: miId, prospectador_id: p.id, texto: pt.texto, orden: i }))
      await supabase.from('uno_a_uno_puntos').insert(filas)
      setPickerAbierto(false); setModoCopiar(false)
      const msg = `Se copiaron ${puntos.length} punto${puntos.length !== 1 ? 's' : ''} a ${p.nombre}.`
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Copiado', msg)
      return
    }
    setSel(p); setPickerAbierto(false); setSeg(0); setCorriendo(false)
    cargarDe(p)
  }

  async function agregarPunto() {
    if (!nuevoPunto.trim() || !sel || !miId) return
    const { data } = await supabase.from('uno_a_uno_puntos')
      .insert({ owner_id: miId, prospectador_id: sel.id, texto: nuevoPunto.trim(), orden: puntos.length })
      .select('id, texto, nota, hecho, orden').single()
    if (data) setPuntos(prev => [...prev, data as Punto])
    setNuevoPunto('')
  }
  async function actualizarPunto(id: string, patch: Partial<Punto>) {
    setPuntos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    await supabase.from('uno_a_uno_puntos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }
  function borrarPunto(id: string) {
    const go = async () => { setPuntos(prev => prev.filter(p => p.id !== id)); await supabase.from('uno_a_uno_puntos').delete().eq('id', id) }
    if (Platform.OS === 'web') { if (window.confirm('¿Borrar este punto?')) go() }
    else Alert.alert('Borrar punto', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  // Guarda una foto de la charla (puntos + notas) en el historial.
  async function guardarEnHistorial() {
    if (!sel || !miId) return
    const snapshot = puntos.map(p => `• ${p.texto}${p.hecho ? ' ✓' : ''}${p.nota ? `\n   ${p.nota}` : ''}`).join('\n')
    await supabase.from('uno_a_uno_sesiones').insert({
      owner_id: miId, prospectador_id: sel.id, duracion_seg: seg, notas: snapshot || null,
    })
    setSeg(0); setCorriendo(false)
    const msg = `Charla con ${sel.nombre} guardada en el historial.`
    Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Guardado', msg)
  }

  function borrarSesion(id: string) {
    const go = async () => { setSesiones(prev => prev.filter(x => x.id !== id)); await supabase.from('uno_a_uno_sesiones').delete().eq('id', id) }
    if (Platform.OS === 'web') { if (window.confirm('¿Borrar esta charla del historial?')) go() }
    else Alert.alert('Borrar charla', '¿Seguro? Se quita del historial.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  const personasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? personas.filter(p => p.nombre.toLowerCase().includes(q)) : personas
  }, [busca, personas])

  const inp = [s.input, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={[s.h1, { color: c.text }]}>🗒️ 1 a 1</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Prepara y registra tus entrevistas. Es privado tuyo; nadie más lo ve.</Text>

      {/* Pestañas */}
      <View style={s.tabs}>
        {(['preparar', 'historial'] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setVista(v)} style={[s.tab, { borderColor: c.border }, vista === v && s.tabOn]}>
            <Text style={[s.tabTxt, { color: vista === v ? '#fff' : c.textSub }]}>{v === 'preparar' ? '📝 Preparar' : '📖 Historial'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {vista === 'preparar' ? (
        <>
          {/* Cronómetro simple, aparte */}
          <View style={[s.timerRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.timerTxt, { color: c.text }]}>⏱ {fmtDur(seg)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!corriendo ? (
                <TouchableOpacity style={[s.tBtn, { backgroundColor: TEAL }]} onPress={() => setCorriendo(true)}>
                  <Text style={s.tBtnTxt}>{seg > 0 ? 'Reanudar' : 'Iniciar'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.tBtn, { backgroundColor: '#64748b' }]} onPress={() => setCorriendo(false)}>
                  <Text style={s.tBtnTxt}>Pausar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.tBtnGhost, { borderColor: c.border }]} onPress={() => { setCorriendo(false); setSeg(0) }}>
                <Text style={[s.tBtnGhostTxt, { color: c.textSub }]}>Reiniciar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Selector de persona */}
          <TouchableOpacity style={[s.selBtn, { borderColor: sel ? TEAL : c.border, backgroundColor: c.card }]} onPress={abrirSelector}>
            <Text style={{ fontSize: 20 }}>{sel ? '🧑' : '👥'}</Text>
            <Text style={[s.selTxt, { color: sel ? c.text : c.textMute }]}>{sel ? sel.nombre : 'Elige la persona…'}</Text>
            <Text style={{ color: TEAL, fontWeight: '800' }}>{sel ? 'Cambiar' : 'Elegir ›'}</Text>
          </TouchableOpacity>

          {!sel ? (
            <View style={s.vacio}><Text style={{ fontSize: 44 }}>🗒️</Text><Text style={[s.vacioTxt, { color: c.textMute }]}>Elige a una persona para preparar los puntos que vas a tratar con ella.</Text></View>
          ) : cargando ? (
            <ActivityIndicator color={TEAL} style={{ marginTop: 30 }} />
          ) : (
            <>
              <View style={s.puntosHead}>
                <Text style={[s.h2, { color: c.text }]}>Puntos con {sel.nombre.split(' ')[0]}</Text>
                {puntos.length > 0 && <TouchableOpacity onPress={abrirCopiar}><Text style={s.copiar}>📋 Copiar a otra persona</Text></TouchableOpacity>}
              </View>
              <Text style={[s.sub, { color: c.textMute, marginTop: 0 }]}>Edítalos con calma antes de la llamada. La nota de cada punto es única de esta persona.</Text>

              {puntos.map(p => (
                <View key={p.id} style={[s.punto, { backgroundColor: c.card, borderColor: p.hecho ? '#16a34a' : c.border }]}>
                  <View style={s.puntoTop}>
                    <TouchableOpacity onPress={() => actualizarPunto(p.id, { hecho: !p.hecho })} style={[s.check, p.hecho && s.checkOn]}>
                      {p.hecho && <Text style={s.checkTxt}>✓</Text>}
                    </TouchableOpacity>
                    <TextInput
                      style={[s.puntoTitulo, { color: p.hecho ? c.textMute : c.text, textDecorationLine: p.hecho ? 'line-through' : 'none' }]}
                      defaultValue={p.texto} placeholder="Título del punto" placeholderTextColor={c.placeholder}
                      onEndEditing={e => { const v = e.nativeEvent.text.trim(); if (v && v !== p.texto) actualizarPunto(p.id, { texto: v }) }} />
                    <TouchableOpacity onPress={() => borrarPunto(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: '#c0392b', fontSize: 15 }}>🗑</Text></TouchableOpacity>
                  </View>
                  <TextInput
                    style={[s.puntoNota, { color: c.textSub, borderColor: c.border, backgroundColor: c.bg }]}
                    defaultValue={p.nota ?? ''} placeholder="Nota de este punto…" placeholderTextColor={c.placeholder}
                    multiline textAlignVertical="top"
                    onEndEditing={e => actualizarPunto(p.id, { nota: e.nativeEvent.text.trim() || null })} />
                </View>
              ))}

              <View style={s.addRow}>
                <TextInput style={[...inp, { flex: 1 }]} value={nuevoPunto} onChangeText={setNuevoPunto}
                  placeholder="Nuevo punto a tratar…" placeholderTextColor={c.placeholder} onSubmitEditing={agregarPunto} />
                <TouchableOpacity style={[s.addBtn, { opacity: nuevoPunto.trim() ? 1 : 0.5 }]} disabled={!nuevoPunto.trim()} onPress={agregarPunto}>
                  <Text style={s.addBtnTxt}>+ Agregar</Text>
                </TouchableOpacity>
              </View>

              {puntos.length > 0 && (
                <TouchableOpacity style={s.guardar} onPress={guardarEnHistorial}>
                  <Text style={s.guardarTxt}>✓ Guardar esta charla en el historial</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      ) : (
        /* ── Historial general ── */
        <View style={{ marginTop: 14 }}>
          {sesiones.length === 0 ? (
            <View style={s.vacio}><Text style={{ fontSize: 44 }}>📭</Text><Text style={[s.vacioTxt, { color: c.textMute }]}>Aún no guardas charlas. En "Preparar", al terminar un 1 a 1, toca "Guardar esta charla en el historial".</Text></View>
          ) : sesiones.map(x => {
            const open = abierta === x.id
            return (
              <TouchableOpacity key={x.id} activeOpacity={0.85} onPress={() => setAbierta(open ? null : x.id)}
                style={[s.sesCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>🧑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{nombreDe(x.prospectador_id)}</Text>
                    <Text style={{ color: c.textMute, fontSize: 12 }}>{fmtFecha(x.created_at)}{x.duracion_seg > 0 ? ` · ⏱ ${fmtDur(x.duracion_seg)}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => borrarSesion(x.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: '#c0392b', fontSize: 15 }}>🗑</Text></TouchableOpacity>
                  <Text style={{ color: TEAL, fontWeight: '800' }}>{open ? '▲' : '▼'}</Text>
                </View>
                {open && (
                  <Text style={{ color: c.textSub, fontSize: 13.5, lineHeight: 19, marginTop: 10 }}>
                    {x.notas || 'Sin notas en esta charla.'}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* Modal selector de persona (elegir o copiar) */}
      <Modal visible={pickerAbierto} transparent animationType="fade" onRequestClose={() => setPickerAbierto(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerAbierto(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation?.()}>
            <Text style={[s.h2, { color: c.text, marginTop: 0 }]}>{modoCopiar ? 'Copiar los puntos a…' : '¿Con quién es el 1 a 1?'}</Text>
            <TextInput style={inp} value={busca} onChangeText={setBusca} placeholder="Buscar por nombre…" placeholderTextColor={c.placeholder} autoFocus />
            <ScrollView style={{ maxHeight: 340, marginTop: 8 }} keyboardShouldPersistTaps="handled">
              {personasFiltradas.map(p => (
                <TouchableOpacity key={p.id} style={s.personaItem} onPress={() => onElegirPersona(p)}>
                  <Text style={{ color: c.text, fontSize: 14.5 }} numberOfLines={1}>{p.nombre}</Text>
                  <Text style={{ color: c.textMute, fontSize: 11 }}>{p.role.replace('prospectador_plus', 'plus')}</Text>
                </TouchableOpacity>
              ))}
              {personasFiltradas.length === 0 && <Text style={{ color: c.textMute, padding: 12 }}>Sin resultados.</Text>}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  h1: { fontSize: 21, fontWeight: '900' },
  h2: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: TEAL, borderColor: TEAL },
  tabTxt: { fontWeight: '800', fontSize: 13.5 },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14 },
  timerTxt: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tBtn: { borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14 },
  tBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  tBtnGhost: { borderWidth: 1, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12 },
  tBtnGhostTxt: { fontWeight: '700', fontSize: 13 },
  selBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 13, marginTop: 12 },
  selTxt: { flex: 1, fontSize: 15, fontWeight: '700' },
  vacio: { alignItems: 'center', marginTop: 44, gap: 12, paddingHorizontal: 30 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  puntosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 10 },
  copiar: { color: TEAL, fontWeight: '800', fontSize: 12.5 },
  punto: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 10, marginTop: 10 },
  puntoTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  puntoTitulo: { flex: 1, fontSize: 15, fontWeight: '700', paddingVertical: 2 },
  puntoNota: { borderWidth: 1, borderRadius: 8, padding: 9, fontSize: 13.5, minHeight: 52, marginTop: 8, lineHeight: 18 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, width: '100%' },
  addBtn: { backgroundColor: TEAL, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  guardar: { borderWidth: 1.5, borderColor: '#16a34a', borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  guardarTxt: { color: '#16a34a', fontWeight: '800', fontSize: 14 },
  sesCard: { borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, borderRadius: 16, padding: 16 },
  personaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#88888822' },
})
