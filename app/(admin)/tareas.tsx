import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, Platform, useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type UserProfile = { id: string; nombre: string }

type Asignacion = {
  id: string
  user_id: string
  progreso: number
  completada: boolean
  completada_at: string | null
  nombre?: string
}

type Tarea = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: string
  meta_cantidad: number
  fecha_limite: string | null
  para_todos: boolean
  activa: boolean
  created_at: string
  asignaciones: Asignacion[]
}

const TIPOS = [
  { key: 'manual',                label: 'Manual',               icon: 'checkmark-circle-outline' as const, hint: 'El usuario la marca manualmente' },
  { key: 'publicar_propiedades',  label: 'Publicar propiedades', icon: 'home-outline' as const,             hint: 'Progresa al marcar propiedades como publicadas' },
  { key: 'contactar_clientes',    label: 'Contactar clientes',   icon: 'people-outline' as const,           hint: 'Progresa al contactar clientes en el CRM' },
  { key: 'completar_curso',       label: 'Completar curso',      icon: 'school-outline' as const,           hint: 'Progresa al completar lecciones' },
]

// ─── Mini-calendario ────────────────────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Sep','Octubre','Noviembre','Dic']
const DIAS_S = ['L','M','M','J','V','S','D']

function CalendarioPicker({ fecha, onChange }: { fecha: Date; onChange: (d: Date) => void }) {
  const [mes, setMes] = useState(fecha.getMonth())
  const [anio, setAnio] = useState(fecha.getFullYear())

  function irMes(delta: number) {
    let m = mes + delta, a = anio
    if (m < 0)  { m = 11; a-- }
    if (m > 11) { m = 0;  a++ }
    setMes(m); setAnio(a)
  }

  function selDia(dia: number) {
    const d = new Date(fecha)
    d.setFullYear(anio, mes, dia)
    onChange(d)
  }

  function ajustarHora(delta: number) {
    const d = new Date(fecha); d.setHours(d.getHours() + delta); onChange(d)
  }
  function ajustarMin(delta: number) {
    const d = new Date(fecha)
    d.setMinutes(Math.round(d.getMinutes() / 15) * 15 + delta)
    onChange(d)
  }

  const totalDias  = new Date(anio, mes + 1, 0).getDate()
  const offset     = (new Date(anio, mes, 1).getDay() + 6) % 7
  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)]
  while (celdas.length % 7 !== 0) celdas.push(null)

  const diaActual = fecha.getMonth() === mes && fecha.getFullYear() === anio ? fecha.getDate() : null
  const hoy = new Date()
  const diaHoy = hoy.getMonth() === mes && hoy.getFullYear() === anio ? hoy.getDate() : null
  const horas = fecha.getHours()
  const mins  = Math.round(fecha.getMinutes() / 15) * 15 % 60

  return (
    <View style={cal.wrap}>
      {/* Header mes/año */}
      <View style={cal.header}>
        <TouchableOpacity onPress={() => irMes(-1)} style={cal.navBtn}>
          <Text style={cal.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={cal.mesAnio}>{MESES[mes]} {anio}</Text>
        <TouchableOpacity onPress={() => irMes(1)} style={cal.navBtn}>
          <Text style={cal.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Cabecera días */}
      <View style={cal.semanaRow}>
        {DIAS_S.map((d, i) => <Text key={i} style={cal.diaSemana}>{d}</Text>)}
      </View>

      {/* Grid días */}
      <View style={cal.grid}>
        {celdas.map((dia, i) => {
          const sel  = dia === diaActual
          const esHoy = dia === diaHoy && !sel
          return (
            <TouchableOpacity
              key={i}
              style={[cal.celda, sel && cal.celdaSel, esHoy && cal.celdaHoy]}
              onPress={() => dia && selDia(dia)}
              disabled={!dia}
              activeOpacity={0.7}
            >
              {dia ? (
                <Text style={[cal.celdaTxt, sel && cal.celdaTxtSel, esHoy && cal.celdaTxtHoy]}>
                  {dia}
                </Text>
              ) : null}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Hora */}
      <View style={cal.horaWrap}>
        <Text style={cal.horaLabel}>Hora límite</Text>
        <View style={cal.horaRow}>
          <TouchableOpacity onPress={() => ajustarHora(-1)} style={cal.horaBtn}><Text style={cal.horaBtnTxt}>‹</Text></TouchableOpacity>
          <Text style={cal.horaVal}>{String(horas).padStart(2, '0')}</Text>
          <TouchableOpacity onPress={() => ajustarHora(1)} style={cal.horaBtn}><Text style={cal.horaBtnTxt}>›</Text></TouchableOpacity>
          <Text style={cal.horaSep}>:</Text>
          <TouchableOpacity onPress={() => ajustarMin(-15)} style={cal.horaBtn}><Text style={cal.horaBtnTxt}>‹</Text></TouchableOpacity>
          <Text style={cal.horaVal}>{String(mins).padStart(2, '0')}</Text>
          <TouchableOpacity onPress={() => ajustarMin(15)} style={cal.horaBtn}><Text style={cal.horaBtnTxt}>›</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ─── Pantalla principal ──────────────────────────────────────────────────────
export default function AdminTareas() {
  const c = useColors()
  const [tareas,     setTareas]     = useState<Tarea[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [expandida,  setExpandida]  = useState<string | null>(null)

  // Form
  const [titulo,      setTitulo]      = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tipo,        setTipo]        = useState('manual')
  const [metaCant,    setMetaCant]    = useState('1')
  const [fechaDate,   setFechaDate]   = useState<Date>(() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d })
  const [conFecha,    setConFecha]    = useState(false)
  const [paraQuien,   setParaQuien]   = useState<'todos' | 'seleccion'>('todos')
  const [usuarios,    setUsuarios]    = useState<UserProfile[]>([])
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [guardando,   setGuardando]   = useState(false)

  const { width } = useWindowDimensions()
  const isWide = width >= 768

  useFocusEffect(useCallback(() => { cargar() }, []))

  const yaCargoRef = useRef(false)
  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)

    // 1. Tareas con asignaciones (sin join a profiles)
    const { data: tareasData } = await supabase
      .from('tareas')
      .select(`
        id, titulo, descripcion, tipo, meta_cantidad, fecha_limite,
        para_todos, activa, created_at,
        tarea_asignaciones(id, user_id, progreso, completada, completada_at)
      `)
      .eq('activa', true)
      .order('created_at', { ascending: false })

    if (!tareasData || tareasData.length === 0) { setTareas([]); yaCargoRef.current = true; setLoading(false); return }

    // 2. Perfiles de todos los user_ids mencionados
    const allIds = [...new Set(
      (tareasData as any[]).flatMap((t: any) => (t.tarea_asignaciones ?? []).map((a: any) => a.user_id))
    )].filter(Boolean)

    const perfilesMap = new Map<string, string>()
    if (allIds.length > 0) {
      const { data: perfiles } = await supabase
        .from('profiles')
        .select('id, nombre')
        .in('id', allIds)
      for (const p of perfiles ?? []) perfilesMap.set(p.id, p.nombre ?? 'Sin nombre')
    }

    // 3. Merge
    const merged: Tarea[] = (tareasData as any[]).map((t: any) => ({
      ...t,
      asignaciones: (t.tarea_asignaciones ?? []).map((a: any) => ({
        ...a,
        nombre: perfilesMap.get(a.user_id) ?? 'Usuario',
      })),
    }))

    setTareas(merged)
    yaCargoRef.current = true
    setLoading(false)
  }

  async function abrirModal() {
    setTitulo(''); setDescripcion(''); setTipo('manual')
    setMetaCant('1'); setConFecha(false); setParaQuien('todos'); setSeleccionados([])
    const d = new Date(); d.setHours(23, 59, 0, 0); setFechaDate(d)

    const { data } = await supabase
      .from('profiles')
      .select('id, nombre')
      .neq('role', 'admin')
      .order('nombre')
    setUsuarios((data ?? []) as UserProfile[])
    setModal(true)
  }

  function toggleSel(id: string) {
    setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function guardar() {
    if (!titulo.trim()) {
      if (Platform.OS === 'web') window.alert('El título es requerido')
      else Alert.alert('Error', 'El título es requerido')
      return
    }
    if (paraQuien === 'seleccion' && seleccionados.length === 0) {
      if (Platform.OS === 'web') window.alert('Selecciona al menos un usuario')
      else Alert.alert('Error', 'Selecciona al menos un usuario')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setGuardando(true)

    const meta = parseInt(metaCant) || 1
    const esTodos = paraQuien === 'todos'

    const { data: tarea, error } = await supabase
      .from('tareas')
      .insert({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        meta_cantidad: meta,
        fecha_limite: conFecha ? fechaDate.toISOString() : null,
        para_todos: esTodos,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !tarea) {
      setGuardando(false)
      if (Platform.OS === 'web') window.alert(`Error: ${error?.message}`)
      else Alert.alert('Error', error?.message ?? 'No se pudo crear la tarea')
      return
    }

    // Cargar todos los usuarios si es para_todos
    let destinos = esTodos ? usuarios.map(u => u.id) : seleccionados
    if (esTodos && destinos.length === 0) {
      const { data: todos } = await supabase.from('profiles').select('id').neq('role', 'admin')
      destinos = (todos ?? []).map((p: any) => p.id)
    }

    if (destinos.length > 0) {
      await supabase.from('tarea_asignaciones').insert(
        destinos.map(uid => ({ tarea_id: tarea.id, user_id: uid }))
      )
    }

    setGuardando(false)
    setModal(false)
    cargar()
  }

  async function desactivar(tareaId: string) {
    const ok = Platform.OS === 'web'
      ? window.confirm('¿Desactivar esta tarea?')
      : await new Promise<boolean>(res =>
          Alert.alert('Desactivar', '¿Desactivar esta tarea?', [
            { text: 'Cancelar', onPress: () => res(false) },
            { text: 'Desactivar', style: 'destructive', onPress: () => res(true) },
          ])
        )
    if (!ok) return
    await supabase.from('tareas').update({ activa: false }).eq('id', tareaId)
    cargar()
  }

  if (loading) return <View style={[s.centered, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color="#1a6470" /></View>

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={s.headerTitle}>Tareas Diarias</Text>
        <TouchableOpacity style={s.crearBtn} onPress={abrirModal}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.crearText}>Nueva tarea</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[{ paddingBottom: 40 }, isWide && { alignItems: 'center' }]}>
        <View style={isWide ? { width: '100%', maxWidth: 860, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
        {tareas.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>Sin tareas creadas</Text>
            <Text style={s.emptySub}>Crea una tarea y asígnala a tu equipo</Text>
          </View>
        )}

        {tareas.map(tarea => {
          const asigs = tarea.asignaciones
          const completadas = asigs.filter(a => a.completada).length
          const pct = asigs.length > 0 ? Math.round((completadas / asigs.length) * 100) : 0
          const abierta = expandida === tarea.id

          return (
            <View key={tarea.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setExpandida(abierta ? null : tarea.id)} activeOpacity={0.8}>
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitulo, { color: c.text }]}>{tarea.titulo}</Text>
                    {tarea.descripcion ? <Text style={[s.cardDesc, { color: c.textMute }]} numberOfLines={abierta ? undefined : 1}>{tarea.descripcion}</Text> : null}
                    <View style={s.chipRow}>
                      <Text style={s.tipoChip}>{TIPOS.find(t => t.key === tarea.tipo)?.label ?? tarea.tipo}</Text>
                      {tarea.meta_cantidad > 1 && <Text style={s.metaChip}>Meta: {tarea.meta_cantidad}</Text>}
                      {tarea.fecha_limite && (
                        <Text style={[s.fechaChip, { color: c.textSub, backgroundColor: c.divider }]}>
                          📅 {new Date(tarea.fecha_limite).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={s.pctBadge}>
                    <Text style={s.pctText}>{pct}%</Text>
                    <Text style={s.pctSub}>{completadas}/{asigs.length}</Text>
                  </View>
                </View>
                <View style={[s.globalBar, { backgroundColor: c.border }]}><View style={[s.globalBarFill, { width: `${pct}%` as any }]} /></View>
              </TouchableOpacity>

              {abierta && (
                <View style={[s.listaUsuarios, { borderTopColor: c.divider }]}>
                  <Text style={s.listaHeader}>Progreso por usuario</Text>
                  {asigs.length === 0 && <Text style={s.sinUsuarios}>Sin usuarios asignados</Text>}
                  {asigs.map(a => {
                    const medible = tarea.meta_cantidad > 1
                    const pctU = medible ? Math.min(100, Math.round((a.progreso / tarea.meta_cantidad) * 100)) : a.completada ? 100 : 0
                    return (
                      <View key={a.id} style={s.usuarioRow}>
                        <View style={[s.avatar, { backgroundColor: a.completada ? '#d4f0e2' : '#e8f2f4' }]}>
                          <Text style={[s.avatarTxt, { color: a.completada ? '#2a8a5a' : '#1a6470' }]}>
                            {(a.nombre ?? '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.usuarioNombre, { color: c.text }]}>{a.nombre}</Text>
                          {medible && (
                            <View style={[s.usuarioBar, { backgroundColor: c.border }]}>
                              <View style={[s.usuarioBarFill, { width: `${pctU}%` as any, backgroundColor: a.completada ? '#2a8a5a' : '#1a6470' }]} />
                            </View>
                          )}
                        </View>
                        <View style={s.statusWrap}>
                          {a.completada ? (
                            <View style={s.doneBadge}>
                              <Ionicons name="checkmark" size={12} color="#2a8a5a" />
                              <Text style={s.doneTxt}>Listo</Text>
                            </View>
                          ) : (
                            <Text style={s.progTxt}>{medible ? `${a.progreso}/${tarea.meta_cantidad}` : 'Pendiente'}</Text>
                          )}
                        </View>
                      </View>
                    )
                  })}
                  <TouchableOpacity style={s.desactivarBtn} onPress={() => desactivar(tarea.id)}>
                    <Text style={s.desactivarTxt}>Desactivar tarea</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        })}
        </View>
      </ScrollView>

      {/* Modal crear tarea */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: c.card }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitulo}>Nueva tarea</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Text style={[s.sheetCerrar, { color: c.textMute }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Título *</Text>
              <TextInput style={[s.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="Ej: Publicar 20 propiedades hoy" placeholderTextColor={c.placeholder} value={titulo} onChangeText={setTitulo} />

              <Text style={s.fieldLabel}>Descripción</Text>
              <TextInput style={[s.input, { minHeight: 60, borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="Instrucciones adicionales..." placeholderTextColor={c.placeholder} value={descripcion} onChangeText={setDescripcion} multiline textAlignVertical="top" />

              <Text style={s.fieldLabel}>Tipo de tarea</Text>
              {TIPOS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[s.tipoOpt, { borderColor: c.border }, tipo === t.key && s.tipoOptActivo]}
                  onPress={() => setTipo(t.key)}
                >
                  <Ionicons name={t.icon} size={18} color={tipo === t.key ? '#fff' : '#1a6470'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.tipoOptLabel, { color: c.text }, tipo === t.key && { color: '#fff' }]}>{t.label}</Text>
                    <Text style={[s.tipoOptHint, tipo === t.key && { color: 'rgba(255,255,255,0.7)' }]}>{t.hint}</Text>
                  </View>
                  {tipo === t.key && <Ionicons name="checkmark-circle" size={18} color="#c9a84c" />}
                </TouchableOpacity>
              ))}

              {tipo !== 'manual' && (
                <>
                  <Text style={s.fieldLabel}>Cantidad meta</Text>
                  <TextInput style={[s.input, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="Ej: 20" placeholderTextColor={c.placeholder} value={metaCant} onChangeText={setMetaCant} keyboardType="numeric" />
                </>
              )}

              {/* Fecha límite con calendario */}
              <View style={s.fechaToggleRow}>
                <Text style={s.fieldLabel}>Fecha y hora límite</Text>
                <TouchableOpacity
                  style={[s.fechaToggleBtn, conFecha && s.fechaToggleBtnActivo]}
                  onPress={() => setConFecha(v => !v)}
                >
                  <Text style={[s.fechaToggleTxt, conFecha && { color: '#fff' }]}>
                    {conFecha ? 'Quitar fecha' : 'Agregar fecha'}
                  </Text>
                </TouchableOpacity>
              </View>
              {conFecha && <CalendarioPicker fecha={fechaDate} onChange={setFechaDate} />}

              <Text style={s.fieldLabel}>Asignar a</Text>
              <View style={s.asignarRow}>
                {(['todos', 'seleccion'] as const).map(op => (
                  <TouchableOpacity
                    key={op}
                    style={[s.asignarOpt, { borderColor: c.border }, paraQuien === op && s.asignarOptActivo]}
                    onPress={() => setParaQuien(op)}
                  >
                    <Text style={[s.asignarOptTxt, paraQuien === op && { color: '#fff' }]}>
                      {op === 'todos' ? 'Todos los usuarios' : 'Seleccionar usuarios'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {paraQuien === 'seleccion' && (
                <View style={[s.usuariosSelect, { borderColor: c.border }]}>
                  {usuarios.length === 0 && <Text style={s.sinUsuarios}>No hay usuarios registrados</Text>}
                  {usuarios.map(u => {
                    const sel = seleccionados.includes(u.id)
                    return (
                      <TouchableOpacity key={u.id} style={[s.usuarioSelRow, { borderBottomColor: c.divider }, sel && s.usuarioSelActivo]} onPress={() => toggleSel(u.id)}>
                        <View style={[s.avatarSm, { backgroundColor: sel ? '#d4f0e2' : '#e8f2f4' }]}>
                          <Text style={[s.avatarSmTxt, { color: sel ? '#2a8a5a' : '#1a6470' }]}>{(u.nombre ?? '?')[0].toUpperCase()}</Text>
                        </View>
                        <Text style={[s.usuarioSelNombre, { color: c.text }, sel && { color: '#2a8a5a', fontWeight: '700' }]}>{u.nombre ?? 'Sin nombre'}</Text>
                        {sel && <Ionicons name="checkmark-circle" size={18} color="#2a8a5a" />}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              <TouchableOpacity style={[s.guardarBtn, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarTxt}>Crear tarea</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ─── Estilos calendario ──────────────────────────────────────────────────────
const cal = StyleSheet.create({
  wrap: { backgroundColor: '#f8fafb', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e0eaec', marginTop: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  navBtn: { padding: 6 },
  navArrow: { fontSize: 22, color: '#1a6470', fontWeight: '700' },
  mesAnio: { fontSize: 14, fontWeight: '700', color: '#555' },
  semanaRow: { flexDirection: 'row', marginBottom: 4 },
  diaSemana: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#8a9ea0' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  celda: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  celdaSel: { backgroundColor: '#1a6470' },
  celdaHoy: { borderWidth: 1.5, borderColor: '#1a6470' },
  celdaTxt: { fontSize: 13, color: '#555', fontWeight: '500' },
  celdaTxtSel: { color: '#fff', fontWeight: '700' },
  celdaTxtHoy: { color: '#1a6470', fontWeight: '700' },
  horaWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e0eaec' },
  horaLabel: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textAlign: 'center', marginBottom: 8 },
  horaRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  horaBtn: { backgroundColor: '#e0eaec', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  horaBtnTxt: { fontSize: 18, color: '#1a6470', fontWeight: '700' },
  horaVal: { fontSize: 20, fontWeight: '700', color: '#555', minWidth: 32, textAlign: 'center' as const },
  horaSep: { fontSize: 20, fontWeight: '700', color: '#555' },
})

// ─── Estilos pantalla ────────────────────────────────────────────────────────
const TEAL = '#1a6470'
const GOLD = '#c9a84c'

const s = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: TEAL },
  crearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  crearText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEAL, marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#8a9ea0', textAlign: 'center' },
  card: { borderRadius: 16, marginBottom: 12, marginTop: 4, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  cardTitulo: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tipoChip: { fontSize: 10, fontWeight: '600', color: TEAL, backgroundColor: '#e8f2f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metaChip: { fontSize: 10, fontWeight: '600', color: '#6a4c00', backgroundColor: '#fff3cd', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fechaChip: { fontSize: 10, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pctBadge: { alignItems: 'center', minWidth: 50 },
  pctText: { fontSize: 20, fontWeight: '800', color: TEAL },
  pctSub: { fontSize: 10, color: '#8a9ea0', marginTop: 1 },
  globalBar: { height: 6, marginHorizontal: 16, marginBottom: 12, borderRadius: 3 },
  globalBarFill: { height: 6, backgroundColor: GOLD, borderRadius: 3 },
  listaUsuarios: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  listaHeader: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sinUsuarios: { fontSize: 13, color: '#aaa', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  usuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '700' },
  usuarioNombre: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  usuarioBar: { height: 5, borderRadius: 3 },
  usuarioBarFill: { height: 5, borderRadius: 3 },
  statusWrap: { minWidth: 60, alignItems: 'flex-end' },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#d4f0e2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  doneTxt: { fontSize: 11, fontWeight: '700', color: '#2a8a5a' },
  progTxt: { fontSize: 12, color: '#8a9ea0', fontWeight: '600' },
  desactivarBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center' },
  desactivarTxt: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36, maxHeight: '94%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitulo: { fontSize: 18, fontWeight: '800', color: TEAL },
  sheetCerrar: { fontSize: 18, paddingHorizontal: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  tipoOpt: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  tipoOptActivo: { backgroundColor: TEAL, borderColor: TEAL },
  tipoOptLabel: { fontSize: 14, fontWeight: '700' },
  tipoOptHint: { fontSize: 11, color: '#8a9ea0', marginTop: 1 },
  fechaToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  fechaToggleBtn: { borderWidth: 1.5, borderColor: TEAL, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  fechaToggleBtnActivo: { backgroundColor: TEAL },
  fechaToggleTxt: { fontSize: 12, fontWeight: '700', color: TEAL },
  asignarRow: { flexDirection: 'row', gap: 8 },
  asignarOpt: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingVertical: 10 },
  asignarOptActivo: { backgroundColor: TEAL, borderColor: TEAL },
  asignarOptTxt: { fontSize: 13, fontWeight: '700', color: TEAL },
  usuariosSelect: { marginTop: 10, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  usuarioSelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  usuarioSelActivo: { backgroundColor: '#f3fbf6' },
  avatarSm: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarSmTxt: { fontSize: 12, fontWeight: '700' },
  usuarioSelNombre: { flex: 1, fontSize: 14 },
  guardarBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
