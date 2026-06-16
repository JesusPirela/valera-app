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
    if (error) {
      // revertir cargando de nuevo
      await cargar(periodo, true)
    }
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

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
        <Text style={s.backTxt}>← Volver</Text>
      </TouchableOpacity>

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
            return (
              <View key={g.key} style={[s.bloqueCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.bloqueHeader}>
                  <Text style={[s.bloqueNombre, { color: c.text }]}>{g.nombre}</Text>
                  <Text style={[s.bloqueCount, { color: c.textMute }]}>{g.users.length} {g.users.length === 1 ? 'usuario' : 'usuarios'}</Text>
                </View>

                {/* Resumen del bloque */}
                {!esSinAsignar && (
                  <View style={s.resumenRow}>
                    <ResumenBox label="Publicaciones" val={t.publicaciones} color={TEAL} />
                    <ResumenBox label="Clientes nuevos" val={t.clientes_nuevos} color="#2e7d32" />
                    <ResumenBox label="Seguimientos" val={t.seguimientos} color="#c8960c" />
                  </View>
                )}

                {/* Usuarios */}
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
                      {/* Chips de asignación */}
                      <View style={s.chipsRow}>
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
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

function ResumenBox({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <View style={[s.resumenBox, { borderLeftColor: color }]}>
      <Text style={[s.resumenVal, { color }]}>{val}</Text>
      <Text style={s.resumenLbl}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 12 },
  backTxt: { color: TEAL, fontSize: 15, fontWeight: '600' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12, marginTop: 2 },
  periodoRow: { flexDirection: 'row', gap: 6 },
  periodoPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  periodoPillActive: { backgroundColor: TEAL },
  periodoPillTxt: { fontSize: 12, fontWeight: '600' },
  periodoPillActiveTxt: { color: '#fff' },

  bloqueCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  bloqueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  bloqueNombre: { fontSize: 17, fontWeight: '800' },
  bloqueCount: { fontSize: 12, fontWeight: '600' },

  resumenRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  resumenBox: { flex: 1, borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4 },
  resumenVal: { fontSize: 22, fontWeight: '800' },
  resumenLbl: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },

  vacio: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 10 },

  userRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  userTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  userNombre: { fontSize: 14, fontWeight: '700', flex: 1 },
  userStats: { flexDirection: 'row', gap: 10 },
  userStat: { fontSize: 13, fontWeight: '800' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipTxt: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  chipQuitar: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipQuitarTxt: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
})
