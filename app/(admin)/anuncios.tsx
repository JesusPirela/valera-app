import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const TEAL = '#1a6470'

type Prioridad = 'normal' | 'alta' | 'critica'
type Rol = 'nuevo' | 'prospectador' | 'prospectador_plus' | 'asesor' | 'supervisor'

const ROLES: { id: Rol; label: string }[] = [
  { id: 'nuevo',              label: 'Nuevos' },
  { id: 'prospectador',       label: 'Prospectadores' },
  { id: 'prospectador_plus',  label: 'Prospectadores Plus' },
  { id: 'asesor',             label: 'Asesores' },
  { id: 'supervisor',         label: 'Supervisores' },
]

const PRIORIDADES: { id: Prioridad; label: string; desc: string; color: string; emoji: string }[] = [
  { id: 'normal',  label: 'Normal',  desc: 'Solo aparece en Avisos',            color: '#607D8B', emoji: '📌' },
  { id: 'alta',    label: 'Alta',    desc: 'Popup al entrar (una vez)',         color: '#F57F17', emoji: '⚠️' },
  { id: 'critica', label: 'Crítica', desc: 'Popup insistente hasta que lo vea', color: '#C62828', emoji: '🚨' },
]

type Usuario = { id: string; nombre: string | null; role: string; avatar_url: string | null }

type AnuncioRow = {
  id: string; titulo: string; cuerpo: string; prioridad: Prioridad
  es_reunion: boolean; evento_cuando: string | null; pide_confirmacion: boolean
  activo: boolean; created_at: string; creador_nombre: string | null
  total: number; vistos: number; asisten: number; no_asisten: number; tal_vez: number
}

type Confirmacion = {
  user_id: string; nombre: string | null; role: string; avatar_url: string | null
  visto: boolean; confirmacion: 'asiste' | 'no_asiste' | 'tal_vez' | null; confirmacion_at: string | null
}

export default function AnunciosAdmin() {
  const c = useColors()

  // formulario
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('alta')
  const [esReunion, setEsReunion] = useState(false)
  const [eventoCuando, setEventoCuando] = useState('')
  const [pideConfirmacion, setPideConfirmacion] = useState(false)
  const [todos, setTodos] = useState(true)
  const [rolesSel, setRolesSel] = useState<Set<Rol>>(new Set())
  const [userIds, setUserIds] = useState<Set<string>>(new Set())
  const [buscarUsuario, setBuscarUsuario] = useState('')
  const [mostrarUsuarios, setMostrarUsuarios] = useState(false)
  const [publicando, setPublicando] = useState(false)

  // datos
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [anuncios, setAnuncios] = useState<AnuncioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [confs, setConfs] = useState<Record<string, Confirmacion[]>>({})

  const cargar = useCallback(async () => {
    const [{ data: us }, { data: an }] = await Promise.all([
      supabase.from('profiles').select('id, nombre, role, avatar_url').eq('activo', true).order('nombre'),
      supabase.rpc('get_anuncios_admin'),
    ])
    setUsuarios((us ?? []).filter(u => u.role !== 'admin') as Usuario[])
    setAnuncios((an ?? []) as AnuncioRow[])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  function toggleRol(r: Rol) {
    setTodos(false)
    setRolesSel(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })
  }
  function toggleUser(id: string) {
    setTodos(false)
    setUserIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // A cuántas personas les llegará (previa, calculada localmente)
  const destinatariosPreview = useMemo(() => {
    if (todos) return usuarios.length
    return usuarios.filter(u => rolesSel.has(u.role as Rol) || userIds.has(u.id)).length
  }, [todos, rolesSel, userIds, usuarios])

  const usuariosFiltrados = useMemo(() => {
    const q = buscarUsuario.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(u => (u.nombre ?? '').toLowerCase().includes(q))
  }, [buscarUsuario, usuarios])

  async function publicar() {
    if (!titulo.trim() || !cuerpo.trim()) {
      Alert.alert('Faltan datos', 'Escribe un título y el contenido del anuncio.'); return
    }
    if (!todos && rolesSel.size === 0 && userIds.size === 0) {
      Alert.alert('¿A quién?', 'Elige "Todos", uno o más grupos, o personas específicas.'); return
    }
    if (destinatariosPreview === 0) {
      Alert.alert('Sin destinatarios', 'Nadie coincide con lo que elegiste.'); return
    }
    setPublicando(true)
    const { data, error } = await supabase.rpc('crear_anuncio', {
      p_titulo: titulo.trim(),
      p_cuerpo: cuerpo.trim(),
      p_prioridad: prioridad,
      p_es_reunion: esReunion,
      p_evento_cuando: esReunion ? eventoCuando.trim() || null : null,
      p_pide_confirmacion: esReunion && pideConfirmacion,
      p_roles: todos ? [] : Array.from(rolesSel),
      p_user_ids: todos ? [] : Array.from(userIds),
      p_todos: todos,
    })
    setPublicando(false)
    if (error) { Alert.alert('Error', error.message); return }
    const n = (data as any)?.destinatarios ?? 0
    Alert.alert('¡Publicado!', `El anuncio le llegó a ${n} persona${n !== 1 ? 's' : ''}.`)
    setTitulo(''); setCuerpo(''); setEventoCuando(''); setEsReunion(false)
    setPideConfirmacion(false); setPrioridad('alta'); setTodos(true)
    setRolesSel(new Set()); setUserIds(new Set()); setMostrarUsuarios(false)
    cargar()
  }

  async function verConfirmaciones(id: string) {
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    if (!confs[id]) {
      const { data } = await supabase.rpc('get_anuncio_confirmaciones', { p_anuncio_id: id })
      setConfs(prev => ({ ...prev, [id]: (data ?? []) as Confirmacion[] }))
    }
  }

  function eliminar(id: string) {
    const go = async () => {
      await supabase.rpc('eliminar_anuncio', { p_anuncio_id: id })
      setAnuncios(prev => prev.filter(a => a.id !== id))
    }
    if (Platform.OS === 'web') { if (confirm('¿Eliminar este anuncio?')) go() }
    else Alert.alert('Eliminar anuncio', '¿Seguro? Se borra para todos.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: go },
    ])
  }

  const inp = [styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* ─────────── Crear ─────────── */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.h1, { color: c.text }]}>📣 Nuevo anuncio</Text>

        <Text style={[styles.lbl, { color: c.textSub }]}>Título</Text>
        <TextInput style={inp} value={titulo} onChangeText={setTitulo}
          placeholder="Ej: Reunión general de equipo" placeholderTextColor={c.placeholder} />

        <Text style={[styles.lbl, { color: c.textSub }]}>Mensaje</Text>
        <TextInput style={[...inp, { height: 96, textAlignVertical: 'top' }]} value={cuerpo}
          onChangeText={setCuerpo} multiline placeholder="Escribe los detalles del anuncio…"
          placeholderTextColor={c.placeholder} />

        {/* Prioridad */}
        <Text style={[styles.lbl, { color: c.textSub }]}>Prioridad</Text>
        <View style={{ gap: 8 }}>
          {PRIORIDADES.map(p => {
            const on = prioridad === p.id
            return (
              <TouchableOpacity key={p.id} onPress={() => setPrioridad(p.id)}
                style={[styles.prioRow, { borderColor: on ? p.color : c.border, backgroundColor: on ? p.color + '18' : 'transparent' }]}>
                <Text style={{ fontSize: 18 }}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: on ? p.color : c.text }}>{p.label}</Text>
                  <Text style={{ fontSize: 12, color: c.textMute }}>{p.desc}</Text>
                </View>
                <View style={[styles.radio, { borderColor: on ? p.color : c.border }]}>
                  {on && <View style={[styles.radioDot, { backgroundColor: p.color }]} />}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Reunión */}
        <TouchableOpacity style={styles.switchRow} onPress={() => setEsReunion(v => !v)}>
          <View style={[styles.check, esReunion && styles.checkOn]}>{esReunion && <Text style={styles.checkTxt}>✓</Text>}</View>
          <Text style={[styles.switchLbl, { color: c.text }]}>📅 Es una reunión / evento</Text>
        </TouchableOpacity>

        {esReunion && (
          <View style={{ marginLeft: 6, marginTop: 4 }}>
            <Text style={[styles.lbl, { color: c.textSub }]}>¿Cuándo?</Text>
            <TextInput style={inp} value={eventoCuando} onChangeText={setEventoCuando}
              placeholder="Ej: Viernes 12 de sept, 5:00 PM" placeholderTextColor={c.placeholder} />
            <TouchableOpacity style={styles.switchRow} onPress={() => setPideConfirmacion(v => !v)}>
              <View style={[styles.check, pideConfirmacion && styles.checkOn]}>{pideConfirmacion && <Text style={styles.checkTxt}>✓</Text>}</View>
              <Text style={[styles.switchLbl, { color: c.text }]}>✋ Pedir confirmación de asistencia</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Audiencia */}
        <Text style={[styles.lbl, { color: c.textSub, marginTop: 14 }]}>¿A quién le llega?</Text>
        <View style={styles.chips}>
          <TouchableOpacity onPress={() => { setTodos(true); setRolesSel(new Set()); setUserIds(new Set()) }}
            style={[styles.chip, { borderColor: todos ? TEAL : c.border, backgroundColor: todos ? TEAL : 'transparent' }]}>
            <Text style={{ color: todos ? '#fff' : c.text, fontWeight: '700', fontSize: 13 }}>👥 Todos</Text>
          </TouchableOpacity>
          {ROLES.map(r => {
            const on = !todos && rolesSel.has(r.id)
            return (
              <TouchableOpacity key={r.id} onPress={() => toggleRol(r.id)}
                style={[styles.chip, { borderColor: on ? TEAL : c.border, backgroundColor: on ? TEAL : 'transparent' }]}>
                <Text style={{ color: on ? '#fff' : c.text, fontWeight: '700', fontSize: 13 }}>{r.label}</Text>
              </TouchableOpacity>
            )
          })}
          <TouchableOpacity onPress={() => setMostrarUsuarios(v => !v)}
            style={[styles.chip, { borderColor: userIds.size > 0 ? TEAL : c.border, backgroundColor: userIds.size > 0 ? TEAL : 'transparent' }]}>
            <Text style={{ color: userIds.size > 0 ? '#fff' : c.text, fontWeight: '700', fontSize: 13 }}>
              🙋 Personas{userIds.size > 0 ? ` (${userIds.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {mostrarUsuarios && (
          <View style={[styles.userBox, { borderColor: c.border }]}>
            <TextInput style={inp} value={buscarUsuario} onChangeText={setBuscarUsuario}
              placeholder="Buscar por nombre…" placeholderTextColor={c.placeholder} />
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {usuariosFiltrados.map(u => {
                const on = userIds.has(u.id)
                return (
                  <TouchableOpacity key={u.id} onPress={() => toggleUser(u.id)} style={styles.userRow}>
                    <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkTxt}>✓</Text>}</View>
                    <Text style={{ flex: 1, color: c.text, fontSize: 14 }} numberOfLines={1}>{u.nombre ?? 'Sin nombre'}</Text>
                    <Text style={{ fontSize: 11, color: c.textMute }}>{u.role.replace('prospectador_plus', 'plus')}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        )}

        <Text style={[styles.preview, { color: c.textMute }]}>
          Le llegará a ~{destinatariosPreview} persona{destinatariosPreview !== 1 ? 's' : ''}
        </Text>

        <TouchableOpacity style={[styles.pub, publicando && { opacity: 0.6 }]} onPress={publicar} disabled={publicando}>
          {publicando ? <ActivityIndicator color="#fff" /> : <Text style={styles.pubTxt}>📣 Publicar anuncio</Text>}
        </TouchableOpacity>
      </View>

      {/* ─────────── Historial ─────────── */}
      <Text style={[styles.h2, { color: c.text }]}>Anuncios publicados</Text>
      {loading ? (
        <ActivityIndicator color={TEAL} style={{ marginTop: 20 }} />
      ) : anuncios.length === 0 ? (
        <Text style={{ color: c.textMute, textAlign: 'center', marginTop: 12 }}>Aún no has publicado anuncios.</Text>
      ) : anuncios.map(a => {
        const pr = PRIORIDADES.find(p => p.id === a.prioridad)!
        const abierto = expandido === a.id
        return (
          <View key={a.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border, opacity: a.activo ? 1 : 0.6 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>{pr.emoji}</Text>
              <Text style={[styles.anTit, { color: c.text }]} numberOfLines={2}>{a.titulo}</Text>
              <TouchableOpacity onPress={() => eliminar(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: '#c0392b', fontSize: 16 }}>🗑</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: c.textSub, fontSize: 13, marginTop: 4 }}>{a.cuerpo}</Text>
            {a.es_reunion && a.evento_cuando ? (
              <Text style={{ color: pr.color, fontSize: 12.5, fontWeight: '700', marginTop: 4 }}>📅 {a.evento_cuando}</Text>
            ) : null}

            <View style={styles.stats}>
              <Text style={[styles.stat, { color: c.textMute }]}>👁 {a.vistos}/{a.total} vieron</Text>
              {a.pide_confirmacion && (
                <>
                  <Text style={[styles.stat, { color: '#2e7d32' }]}>✅ {a.asisten}</Text>
                  <Text style={[styles.stat, { color: '#F57F17' }]}>🤔 {a.tal_vez}</Text>
                  <Text style={[styles.stat, { color: '#c0392b' }]}>❌ {a.no_asisten}</Text>
                </>
              )}
            </View>

            <TouchableOpacity onPress={() => verConfirmaciones(a.id)}>
              <Text style={{ color: TEAL, fontSize: 12.5, fontWeight: '700', marginTop: 8 }}>
                {abierto ? 'Ocultar detalle ▲' : 'Ver quién respondió ▼'}
              </Text>
            </TouchableOpacity>

            {abierto && (
              <View style={{ marginTop: 8, gap: 6 }}>
                {(confs[a.id] ?? []).map(x => (
                  <View key={x.user_id} style={styles.confRow}>
                    <Text style={{ flex: 1, color: c.textSub, fontSize: 13 }} numberOfLines={1}>{x.nombre ?? 'Sin nombre'}</Text>
                    <Text style={{ fontSize: 12, color: c.textMute }}>
                      {x.confirmacion === 'asiste' ? '✅ Asiste'
                        : x.confirmacion === 'tal_vez' ? '🤔 Tal vez'
                        : x.confirmacion === 'no_asiste' ? '❌ No va'
                        : x.visto ? '👁 Visto' : '⏳ Sin ver'}
                    </Text>
                  </View>
                ))}
                {(confs[a.id]?.length ?? 0) === 0 && <Text style={{ color: c.textMute, fontSize: 12 }}>Cargando…</Text>}
              </View>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  h1: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 12, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5 },
  prioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 11 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  switchLbl: { fontSize: 14, fontWeight: '600' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: TEAL, borderColor: TEAL },
  checkTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  userBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  preview: { fontSize: 12.5, marginTop: 12, fontStyle: 'italic' },
  pub: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  pubTxt: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  anTit: { flex: 1, fontSize: 15, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  stat: { fontSize: 12.5, fontWeight: '700' },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#88888833', paddingTop: 6 },
})
