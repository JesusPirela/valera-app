// Apartado PRIVADO del admin para sus 1-a-1 con el equipo.
// - Eliges al prospectador → ves/preparas tus puntos a tratar (con nota por punto).
// - Cronómetro sin límite para la llamada; al terminar guarda la duración.
// - Todo es privado tuyo (RLS por owner_id); NUNCA se le manda al prospectador.
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
type Sesion = { id: string; duracion_seg: number; notas: string | null; created_at: string }

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function UnoAUno() {
  const c = useColors()
  const [miId, setMiId] = useState<string | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [sel, setSel] = useState<Persona | null>(null)
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [busca, setBusca] = useState('')

  const [puntos, setPuntos] = useState<Punto[]>([])
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [cargando, setCargando] = useState(false)
  const [nuevoPunto, setNuevoPunto] = useState('')
  const [notaSesion, setNotaSesion] = useState('')

  // Cronómetro
  const [seg, setSeg] = useState(0)
  const [corriendo, setCorriendo] = useState(false)
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (corriendo) {
      intRef.current = setInterval(() => setSeg(s => s + 1), 1000)
      return () => { if (intRef.current) clearInterval(intRef.current) }
    }
  }, [corriendo])

  useFocusEffect(useCallback(() => {
    getUsuarioActual().then(({ data: { user } }) => { if (user) setMiId(user.id) })
    supabase.from('profiles').select('id, nombre, role').eq('activo', true).order('nombre')
      .then(({ data }) => setPersonas((data ?? []).filter((p: any) => p.role !== 'admin' && p.nombre) as Persona[]))
  }, []))

  const cargarDe = useCallback(async (persona: Persona) => {
    if (!miId) return
    setCargando(true)
    const [{ data: pts }, { data: ses }] = await Promise.all([
      supabase.from('uno_a_uno_puntos').select('id, texto, nota, hecho, orden')
        .eq('owner_id', miId).eq('prospectador_id', persona.id).order('orden'),
      supabase.from('uno_a_uno_sesiones').select('id, duracion_seg, notas, created_at')
        .eq('owner_id', miId).eq('prospectador_id', persona.id).order('created_at', { ascending: false }).limit(20),
    ])
    setPuntos((pts ?? []) as Punto[])
    setSesiones((ses ?? []) as Sesion[])
    setCargando(false)
  }, [miId])

  function elegir(p: Persona) {
    if (corriendo || seg > 0) {
      const ok = Platform.OS === 'web' ? window.confirm('Tienes una llamada en curso o sin guardar. ¿Cambiar de persona y descartar el cronómetro?') : true
      if (!ok) return
    }
    setSel(p); setPickerAbierto(false); setBusca('')
    setSeg(0); setCorriendo(false); setNotaSesion('')
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

  async function terminarLlamada() {
    if (!sel || !miId) return
    if (seg > 0) {
      const { data } = await supabase.from('uno_a_uno_sesiones')
        .insert({ owner_id: miId, prospectador_id: sel.id, duracion_seg: seg, notas: notaSesion.trim() || null })
        .select('id, duracion_seg, notas, created_at').single()
      if (data) setSesiones(prev => [data as Sesion, ...prev])
    }
    setCorriendo(false); setSeg(0); setNotaSesion('')
  }

  const personasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? personas.filter(p => p.nombre.toLowerCase().includes(q)) : personas
  }, [busca, personas])

  const inp = [s.input, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={[s.h1, { color: c.text }]}>🎧 1 a 1</Text>
      <Text style={[s.sub, { color: c.textMute }]}>Tu espacio privado para las entrevistas con el equipo. Nadie más ve esto.</Text>

      {/* Selector de persona */}
      <TouchableOpacity style={[s.selBtn, { borderColor: sel ? TEAL : c.border, backgroundColor: c.card }]} onPress={() => setPickerAbierto(true)}>
        <Text style={{ fontSize: 20 }}>{sel ? '🧑' : '👥'}</Text>
        <Text style={[s.selTxt, { color: sel ? c.text : c.textMute }]}>{sel ? sel.nombre : 'Elige con quién es el 1 a 1…'}</Text>
        <Text style={{ color: TEAL, fontWeight: '800' }}>{sel ? 'Cambiar' : 'Elegir ›'}</Text>
      </TouchableOpacity>

      {!sel ? (
        <View style={s.vacio}><Text style={{ fontSize: 44 }}>🗒️</Text><Text style={[s.vacioTxt, { color: c.textMute }]}>Elige a un prospectador para preparar sus puntos y cronometrar la llamada.</Text></View>
      ) : cargando ? (
        <ActivityIndicator color={TEAL} style={{ marginTop: 30 }} />
      ) : (
        <>
          {/* Cronómetro */}
          <View style={[s.timerCard, { backgroundColor: c.card, borderColor: corriendo ? '#16a34a' : c.border }]}>
            <Text style={[s.timerTxt, { color: corriendo ? '#16a34a' : c.text }]}>{fmtDur(seg)}</Text>
            <View style={s.timerBtns}>
              {!corriendo ? (
                <TouchableOpacity style={[s.tBtn, { backgroundColor: '#16a34a' }]} onPress={() => setCorriendo(true)}>
                  <Text style={s.tBtnTxt}>{seg > 0 ? '▶ Reanudar' : '▶ Iniciar llamada'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.tBtn, { backgroundColor: '#F57F17' }]} onPress={() => setCorriendo(false)}>
                  <Text style={s.tBtnTxt}>⏸ Pausar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.tBtn, { backgroundColor: seg > 0 ? '#c0392b' : c.border }]} disabled={seg === 0} onPress={terminarLlamada}>
                <Text style={[s.tBtnTxt, { color: seg > 0 ? '#fff' : c.textMute }]}>⏹ Terminar y guardar</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[...inp, { marginTop: 10, minHeight: 40, textAlignVertical: 'top' }]} value={notaSesion} onChangeText={setNotaSesion}
              placeholder="Nota general de esta llamada (se guarda al terminar)…" placeholderTextColor={c.placeholder} multiline />
          </View>

          {/* Puntos a tratar */}
          <Text style={[s.h2, { color: c.text }]}>Puntos a tratar</Text>
          <Text style={[s.sub, { color: c.textMute, marginTop: 0 }]}>Prepáralos antes y escribe tus notas durante la llamada. Son únicos de {sel.nombre.split(' ')[0]}.</Text>

          {puntos.map((p, i) => (
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
                defaultValue={p.nota ?? ''} placeholder="Notas de este punto…" placeholderTextColor={c.placeholder}
                multiline textAlignVertical="top"
                onEndEditing={e => actualizarPunto(p.id, { nota: e.nativeEvent.text.trim() || null })} />
            </View>
          ))}

          {/* Agregar punto */}
          <View style={s.addRow}>
            <TextInput style={[...inp, { flex: 1 }]} value={nuevoPunto} onChangeText={setNuevoPunto}
              placeholder="Nuevo punto a tratar…" placeholderTextColor={c.placeholder} onSubmitEditing={agregarPunto} />
            <TouchableOpacity style={[s.addBtn, { opacity: nuevoPunto.trim() ? 1 : 0.5 }]} disabled={!nuevoPunto.trim()} onPress={agregarPunto}>
              <Text style={s.addBtnTxt}>+ Agregar</Text>
            </TouchableOpacity>
          </View>

          {/* Historial de sesiones */}
          {sesiones.length > 0 && (
            <>
              <Text style={[s.h2, { color: c.text }]}>Llamadas anteriores</Text>
              {sesiones.map(x => (
                <View key={x.id} style={[s.ses, { borderColor: c.border }]}>
                  <Text style={{ color: c.text, fontWeight: '800' }}>⏱ {fmtDur(x.duracion_seg)}</Text>
                  <Text style={{ color: c.textMute, fontSize: 12 }}>{fmtFecha(x.created_at)}</Text>
                  {x.notas ? <Text style={{ color: c.textSub, fontSize: 12.5, flexBasis: '100%', marginTop: 3 }}>{x.notas}</Text> : null}
                </View>
              ))}
            </>
          )}
        </>
      )}

      {/* Modal selector de persona */}
      <Modal visible={pickerAbierto} transparent animationType="fade" onRequestClose={() => setPickerAbierto(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerAbierto(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation?.()}>
            <Text style={[s.h2, { color: c.text, marginTop: 0 }]}>¿Con quién es el 1 a 1?</Text>
            <TextInput style={inp} value={busca} onChangeText={setBusca} placeholder="Buscar por nombre…" placeholderTextColor={c.placeholder} autoFocus />
            <ScrollView style={{ maxHeight: 340, marginTop: 8 }} keyboardShouldPersistTaps="handled">
              {personasFiltradas.map(p => (
                <TouchableOpacity key={p.id} style={s.personaItem} onPress={() => elegir(p)}>
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
  h2: { fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 6 },
  sub: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  selBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 13, marginTop: 14 },
  selTxt: { flex: 1, fontSize: 15, fontWeight: '700' },
  vacio: { alignItems: 'center', marginTop: 50, gap: 12, paddingHorizontal: 30 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  timerCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, marginTop: 16, alignItems: 'center' },
  timerTxt: { fontSize: 46, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  timerBtns: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  tBtn: { borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  tBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, width: '100%' },
  punto: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 10 },
  puntoTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  puntoTitulo: { flex: 1, fontSize: 15, fontWeight: '700', paddingVertical: 2 },
  puntoNota: { borderWidth: 1, borderRadius: 8, padding: 9, fontSize: 13.5, minHeight: 52, marginTop: 8, lineHeight: 18 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  addBtn: { backgroundColor: TEAL, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  ses: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, borderRadius: 16, padding: 16 },
  personaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#88888822' },
})
