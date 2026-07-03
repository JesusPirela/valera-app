import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput, Switch, Platform,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

const TEAL = '#1a6470'
const PURPLE = '#5e35b1'
const SIN_ASIGNAR = '__sin__'

const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })

type Bloque = { id: string; nombre: string; orden: number }
type ResumenRow = {
  user_id: string
  nombre: string | null
  bloque_id: string | null
  publicaciones: number
  clientes_nuevos: number
  seguimientos: number
  notas_bloque: string | null
  contesto_fecha: string | null
  contesto_ok: boolean
}
type Periodo = 1 | 7 | 30
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 1, label: 'Hoy' },
  { value: 7, label: 'Semana' },
  { value: 30, label: 'Mes' },
]

export default function Bloques() {
  useSupervisorBlock()
  const c = useColors()
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [usuarios, setUsuarios] = useState<ResumenRow[]>([])
  const [periodo, setPeriodo] = useState<Periodo>(1)
  const [loading, setLoading] = useState(true)
  const [asignando, setAsignando] = useState<string | null>(null)
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})
  const [notasEdit, setNotasEdit] = useState<Record<string, string>>({})
  const [notasGuardando, setNotasGuardando] = useState<Set<string>>(new Set())
  const [contestoGuardando, setContesoGuardando] = useState<Set<string>>(new Set())
  const yaCargoRef = useRef(false)
  // Periodo actual en un ref: el useFocusEffect tiene deps [] y su closure
  // capturaría el periodo INICIAL (Hoy) para siempre, recargando "Hoy" al
  // re-enfocar aunque la pastilla seleccionada fuera Semana/Mes (desincronizaba
  // números vs. selección). El ref siempre tiene el valor vigente.
  const periodoRef = useRef<Periodo>(1)

  useFocusEffect(useCallback(() => { cargar(periodoRef.current, yaCargoRef.current) }, []))

  async function cargar(p: Periodo, silencioso = false) {
    if (!silencioso) setLoading(true)
    const [blqRes, resRes, perfilRes] = await Promise.all([
      supabase.from('bloques').select('id, nombre, orden').order('orden'),
      supabase.rpc('get_bloques_resumen', { p_dias: p }),
      supabase.from('profiles').select('id, notas_bloque, contesto_fecha, contesto_ok').neq('role', 'admin'),
    ])
    // Si el usuario cambió de periodo mientras esta carga estaba en vuelo,
    // descartar la respuesta vieja (evita que una respuesta lenta pise a la nueva).
    if (periodoRef.current !== p) return
    setBloques((blqRes.data ?? []) as Bloque[])
    const perfilMap: Record<string, { notas_bloque: string | null; contesto_fecha: string | null; contesto_ok: boolean }> = {}
    for (const p of (perfilRes.data ?? []) as any[]) {
      perfilMap[p.id] = { notas_bloque: p.notas_bloque ?? null, contesto_fecha: p.contesto_fecha ?? null, contesto_ok: p.contesto_ok ?? false }
    }
    const rows: ResumenRow[] = ((resRes.data ?? []) as any[]).map(r => ({
      ...r,
      notas_bloque: perfilMap[r.user_id]?.notas_bloque ?? null,
      contesto_fecha: perfilMap[r.user_id]?.contesto_fecha ?? null,
      contesto_ok: perfilMap[r.user_id]?.contesto_ok ?? false,
    }))
    setUsuarios(rows)
    // Inicializar estado de notas con valores del servidor (sin sobreescribir edits en curso)
    setNotasEdit(prev => {
      const nuevo: Record<string, string> = {}
      for (const u of rows) nuevo[u.user_id] = prev[u.user_id] ?? (u.notas_bloque ?? '')
      return nuevo
    })
    yaCargoRef.current = true
    setLoading(false)
  }

  async function cambiarPeriodo(p: Periodo) {
    if (p === periodoRef.current) return
    periodoRef.current = p
    setPeriodo(p)
    await cargar(p, true)
  }

  async function asignar(userId: string, bloqueId: string | null) {
    setAsignando(userId)
    setUsuarios((prev) => prev.map((u) => u.user_id === userId ? { ...u, bloque_id: bloqueId } : u))
    const { error } = await supabase.rpc('asignar_bloque', { p_user_id: userId, p_bloque_id: bloqueId })
    if (error) await cargar(periodoRef.current, true)
    setAsignando(null)
  }

  async function guardarNota(userId: string) {
    const nota = (notasEdit[userId] ?? '').trim()
    setNotasGuardando(prev => new Set([...prev, userId]))
    const { error } = await supabase.rpc('guardar_nota_bloque', { p_user_id: userId, p_nota: nota })
    if (!error) {
      setUsuarios(prev => prev.map(u => u.user_id === userId ? { ...u, notas_bloque: nota || null } : u))
    }
    setNotasGuardando(prev => { const n = new Set(prev); n.delete(userId); return n })
  }

  async function toggleContesto(userId: string, valorActual: boolean) {
    const nuevoValor = !valorActual
    setContesoGuardando(prev => new Set([...prev, userId]))
    setUsuarios(prev => prev.map(u =>
      u.user_id === userId ? { ...u, contesto_ok: nuevoValor, contesto_fecha: nuevoValor ? hoyISO() : null } : u
    ))
    const { error } = await supabase.rpc('marcar_contesto_hoy', { p_user_id: userId, p_ok: nuevoValor })
    if (error) {
      setUsuarios(prev => prev.map(u =>
        u.user_id === userId ? { ...u, contesto_ok: valorActual, contesto_fecha: valorActual ? hoyISO() : null } : u
      ))
    }
    setContesoGuardando(prev => { const n = new Set(prev); n.delete(userId); return n })
  }

  const grupos: { key: string; nombre: string; users: ResumenRow[] }[] = [
    ...bloques.map((b) => ({ key: b.id, nombre: b.nombre, users: usuarios.filter((u) => u.bloque_id === b.id) })),
    { key: SIN_ASIGNAR, nombre: 'Sin asignar', users: usuarios.filter((u) => !u.bloque_id) },
  ]

  function totales(users: ResumenRow[]) {
    return users.reduce(
      (acc, u) => ({
        publicaciones: acc.publicaciones + u.publicaciones,
        clientes_nuevos: acc.clientes_nuevos + u.clientes_nuevos,
        seguimientos: acc.seguimientos + u.seguimientos,
      }),
      { publicaciones: 0, clientes_nuevos: 0, seguimientos: 0 }
    )
  }

  function toggleExpand(key: string) {
    setExpandidas((s) => ({ ...s, [key]: !s[key] }))
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.headerRow}>
        <View>
          <Text style={[s.title, { color: c.text }]}>🧩 Bloques</Text>
          <Text style={[s.sub, { color: c.textMute }]}>Estadísticas por usuario y por equipo</Text>
        </View>
        <View style={s.periodoRow}>
          {PERIODOS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[s.periodoPill, { backgroundColor: c.card }, periodo === p.value && s.periodoPillActive]}
              onPress={() => cambiarPeriodo(p.value)}
            >
              <Text style={[s.periodoPillTxt, { color: c.textMute }, periodo === p.value && s.periodoPillActiveTxt]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {grupos.map((g) => {
            const t = totales(g.users)
            const esSinAsignar = g.key === SIN_ASIGNAR
            const abierta = expandidas[g.key]
            return (
              <View key={g.key} style={[s.bloqueCard, { backgroundColor: c.card, borderColor: abierta ? PURPLE : c.border }]}>
                {/* Header */}
                <View style={s.bloqueHeader}>
                  <TouchableOpacity
                    style={s.bloqueHeaderMain}
                    activeOpacity={0.7}
                    onPress={() => esSinAsignar
                      ? toggleExpand(g.key)
                      : router.push({ pathname: '/(admin)/bloque-detalle', params: { id: g.key, nombre: g.nombre } })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.bloqueNombre, { color: c.text }]}>{g.nombre}</Text>
                      {esSinAsignar ? (
                        <Text style={[s.bloqueCount, { color: c.textMute }]}>{g.users.length} {g.users.length === 1 ? 'usuario' : 'usuarios'}</Text>
                      ) : (
                        <Text style={s.headerResumen}>
                          📤 {t.publicaciones}   👤 {t.clientes_nuevos}   ✅ {t.seguimientos}   ·   {g.users.length} {g.users.length === 1 ? 'usuario' : 'usuarios'}
                        </Text>
                      )}
                    </View>
                    {!esSinAsignar && <Text style={s.verEstadisticas}>Ver estadísticas →</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.asignarBtn, abierta && s.asignarBtnOn]}
                    onPress={() => toggleExpand(g.key)}
                  >
                    <Text style={[s.asignarBtnTxt, abierta && { color: '#fff' }]}>{abierta ? '✓ Listo' : '✎ Asignar'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Panel expandido */}
                {abierta && (
                  <View style={s.bloqueBody}>
                    {g.users.length === 0 ? (
                      <Text style={s.vacio}>{esSinAsignar ? 'Todos los usuarios están asignados.' : 'Sin usuarios en este bloque.'}</Text>
                    ) : (
                      g.users.map((u) => {
                        const hoy = hoyISO()
                        const contestoHoy = u.contesto_fecha === hoy && u.contesto_ok
                        const cargandoContesto = contestoGuardando.has(u.user_id)
                        const cargandoNota = notasGuardando.has(u.user_id)
                        const notaActual = notasEdit[u.user_id] ?? (u.notas_bloque ?? '')
                        const notaCambio = notaActual !== (u.notas_bloque ?? '')

                        return (
                          <View key={u.user_id} style={[s.userRow, { borderTopColor: c.border }]}>
                            {/* Nombre + métricas */}
                            <View style={s.userTop}>
                              <Text style={[s.userNombre, { color: c.text }]} numberOfLines={1}>{u.nombre ?? 'Sin nombre'}</Text>
                              <View style={s.userStats}>
                                <Text style={[s.userStat, { color: TEAL }]}>📤 {u.publicaciones}</Text>
                                <Text style={[s.userStat, { color: '#2e7d32' }]}>👤 {u.clientes_nuevos}</Text>
                                <Text style={[s.userStat, { color: '#c8960c' }]}>✅ {u.seguimientos}</Text>
                              </View>
                            </View>

                            {/* ¿Contestó hoy? — solo en periodo Hoy */}
                            {periodo === 1 && (
                              <View style={s.contestoRow}>
                                <Text style={[s.contestoLabel, { color: c.textMute }]}>¿Contestó hoy?</Text>
                                {cargandoContesto
                                  ? <ActivityIndicator size="small" color={TEAL} />
                                  : <Switch
                                      value={contestoHoy}
                                      onValueChange={() => toggleContesto(u.user_id, contestoHoy)}
                                      trackColor={{ false: '#ddd', true: '#2e7d3288' }}
                                      thumbColor={contestoHoy ? '#2e7d32' : '#aaa'}
                                    />}
                                {contestoHoy && <Text style={s.contestoBadge}>✅ Sí</Text>}
                                {!contestoHoy && u.contesto_fecha && (
                                  <Text style={[s.contestoFecha, { color: c.textMute }]}>Último: {u.contesto_fecha}</Text>
                                )}
                              </View>
                            )}

                            {/* Notas */}
                            <View style={s.notaWrap}>
                              <TextInput
                                style={[s.notaInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                                placeholder="Agregar nota sobre este usuario..."
                                placeholderTextColor={c.textMute}
                                value={notaActual}
                                onChangeText={v => setNotasEdit(prev => ({ ...prev, [u.user_id]: v }))}
                                multiline
                                numberOfLines={2}
                                onBlur={() => { if (notaCambio) guardarNota(u.user_id) }}
                              />
                              {notaCambio && (
                                <TouchableOpacity
                                  style={[s.notaGuardar, { opacity: cargandoNota ? 0.5 : 1 }]}
                                  onPress={() => guardarNota(u.user_id)}
                                  disabled={cargandoNota}
                                >
                                  {cargandoNota
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={s.notaGuardarTxt}>Guardar nota</Text>}
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* Chips de asignación */}
                            <View style={s.chipsRow}>
                              <Text style={s.chipsLabel}>Mover a:</Text>
                              {bloques.map((b) => (
                                <TouchableOpacity
                                  key={b.id}
                                  disabled={asignando === u.user_id}
                                  style={[s.chip, u.bloque_id === b.id && s.chipActive]}
                                  onPress={() => asignar(u.user_id, u.bloque_id === b.id ? null : b.id)}
                                >
                                  <Text style={[s.chipTxt, u.bloque_id === b.id && s.chipTxtActive]}>{b.nombre}</Text>
                                </TouchableOpacity>
                              ))}
                              {u.bloque_id && (
                                <TouchableOpacity
                                  disabled={asignando === u.user_id}
                                  style={s.chipQuitar}
                                  onPress={() => asignar(u.user_id, null)}
                                >
                                  <Text style={s.chipQuitarTxt}>Quitar</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )
                      })
                    )}
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12, marginTop: 2 },
  periodoRow: { flexDirection: 'row', gap: 6 },
  periodoPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  periodoPillActive: { backgroundColor: TEAL },
  periodoPillTxt: { fontSize: 12, fontWeight: '600' },
  periodoPillActiveTxt: { color: '#fff' },

  bloqueCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  bloqueHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  bloqueHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bloqueNombre: { fontSize: 17, fontWeight: '800' },
  headerResumen: { fontSize: 12, color: '#94a3b8', fontWeight: '700', marginTop: 3 },
  bloqueCount: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  verEstadisticas: { fontSize: 12, fontWeight: '700', color: PURPLE },

  asignarBtn: { borderWidth: 1.5, borderColor: PURPLE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  asignarBtnOn: { backgroundColor: PURPLE, borderColor: PURPLE },
  asignarBtnTxt: { fontSize: 12, fontWeight: '700', color: PURPLE },

  bloqueBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.2)' },

  vacio: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 10 },

  userRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  userTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  userNombre: { fontSize: 14, fontWeight: '700', flex: 1 },
  userStats: { flexDirection: 'row', gap: 10 },
  userStat: { fontSize: 13, fontWeight: '800' },

  contestoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  contestoLabel: { fontSize: 13, fontWeight: '600' },
  contestoBadge: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  contestoFecha: { fontSize: 11, fontStyle: 'italic' },

  notaWrap: { marginTop: 8 },
  notaInput: {
    borderWidth: 1, borderRadius: 8, padding: 8,
    fontSize: 13, minHeight: 52,
    textAlignVertical: 'top',
  },
  notaGuardar: {
    marginTop: 6, backgroundColor: TEAL, borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 14,
    alignSelf: 'flex-end',
    alignItems: 'center', justifyContent: 'center', minWidth: 100,
  },
  notaGuardarTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  chipsLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipTxt: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  chipQuitar: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipQuitarTxt: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
})
