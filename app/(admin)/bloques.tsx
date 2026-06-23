import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

const TEAL = '#1a6470'
const PURPLE = '#5e35b1'
const SIN_ASIGNAR = '__sin__'

type Bloque = { id: string; nombre: string; orden: number }
type ResumenRow = {
  user_id: string
  nombre: string | null
  bloque_id: string | null
  publicaciones: number
  clientes_nuevos: number
  seguimientos: number
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
  const yaCargoRef = useRef(false)

  useFocusEffect(useCallback(() => { cargar(periodo, yaCargoRef.current) }, []))

  async function cargar(p: Periodo, silencioso = false) {
    if (!silencioso) setLoading(true)
    const [blqRes, resRes] = await Promise.all([
      supabase.from('bloques').select('id, nombre, orden').order('orden'),
      supabase.rpc('get_bloques_resumen', { p_dias: p }),
    ])
    setBloques((blqRes.data ?? []) as Bloque[])
    setUsuarios((resRes.data ?? []) as ResumenRow[])
    yaCargoRef.current = true
    setLoading(false)
  }

  async function cambiarPeriodo(p: Periodo) {
    setPeriodo(p)
    await cargar(p, true)
  }

  async function asignar(userId: string, bloqueId: string | null) {
    setAsignando(userId)
    // Optimista
    setUsuarios((prev) => prev.map((u) => u.user_id === userId ? { ...u, bloque_id: bloqueId } : u))
    const { error } = await supabase.rpc('asignar_bloque', { p_user_id: userId, p_bloque_id: bloqueId })
    if (error) await cargar(periodo, true) // revertir
    setAsignando(null)
  }

  // Grupos: cada bloque + "Sin asignar"
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
                {/* Header — click en bloque abre sus estadísticas (excepto "Sin asignar") */}
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

                {/* Panel de asignación: mover usuarios entre bloques */}
                {abierta && (
                  <View style={s.bloqueBody}>
                    {g.users.length === 0 ? (
                      <Text style={s.vacio}>{esSinAsignar ? 'Todos los usuarios están asignados.' : 'Sin usuarios en este bloque.'}</Text>
                    ) : (
                      g.users.map((u) => (
                        <View key={u.user_id} style={[s.userRow, { borderTopColor: c.border }]}>
                          <View style={s.userTop}>
                            <Text style={[s.userNombre, { color: c.text }]} numberOfLines={1}>{u.nombre ?? 'Sin nombre'}</Text>
                            <View style={s.userStats}>
                              <Text style={[s.userStat, { color: TEAL }]}>📤 {u.publicaciones}</Text>
                              <Text style={[s.userStat, { color: '#2e7d32' }]}>👤 {u.clientes_nuevos}</Text>
                              <Text style={[s.userStat, { color: '#c8960c' }]}>✅ {u.seguimientos}</Text>
                            </View>
                          </View>
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
                      ))
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

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  chipsLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', marginRight: 2 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipTxt: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  chipQuitar: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipQuitarTxt: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
})
