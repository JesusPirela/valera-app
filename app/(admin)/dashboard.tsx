import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const TEAL = '#1a6470'
const ORO  = '#c9a84c'

type CitaHoy = {
  id: string
  estado: string
  fecha_cita: string | null
  clientes: { nombre: string } | null
  asesor: { nombre: string } | null
}

type CitaInerte = {
  id: string
  estado: string
  updated_at: string
  clientes: { nombre: string } | null
}

type UsuarioActivo = {
  id: string
  nombre: string | null
  role: string
  last_seen: string
}

type Stats = {
  citasHoy: number
  activosAhora: number
  clientesNuevos: number
  publicacionesHoy: number
}

const ESTADO_LABEL: Record<string, string> = {
  por_contactar: 'Por contactar', primer_contacto: 'Primer contacto',
  buscando_opciones: 'Buscando opciones', en_coordinacion: 'En coordinación',
  coordinada: 'Coordinada', reagendada: 'Reagendada',
  no_responde_asesor: 'No responde asesor', realizada: 'Realizada',
  aparto: 'Apartó', recaudando_documentacion: 'Recaudando docs.',
  aprobando_credito: 'Aprobando crédito', firma_contrato: 'Firma contrato',
  escrituracion: 'Escrituración', cancelada: 'Cancelada',
}

const ESTADO_COLOR: Record<string, string> = {
  por_contactar: '#3b82f6', primer_contacto: '#8b5cf6',
  buscando_opciones: '#ca8a04', en_coordinacion: '#f97316',
  coordinada: '#16a34a', reagendada: '#b45309',
  no_responde_asesor: '#dc2626', realizada: '#0d9488',
  aparto: '#7c3aed', recaudando_documentacion: '#0369a1',
  aprobando_credito: '#d97706', firma_contrato: '#059669',
  escrituracion: '#c2410c', cancelada: '#64748b',
}

function formatHora(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function rolLabel(role: string) {
  const map: Record<string, string> = {
    prospectador: 'Prospectador', prospectador_plus: 'Plus',
    asesor: 'Asesor', supervisor: 'Supervisor', nuevo: 'Nuevo',
  }
  return map[role] ?? role
}

export default function Dashboard() {
  const c = useColors()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState<Stats>({ citasHoy: 0, activosAhora: 0, clientesNuevos: 0, publicacionesHoy: 0 })
  const [citasHoy, setCitasHoy] = useState<CitaHoy[]>([])
  const [citasInertes, setCitasInertes] = useState<CitaInerte[]>([])
  const [activosAhora, setActivosAhora] = useState<UsuarioActivo[]>([])

  async function cargar(silent = false) {
    if (!silent) setLoading(true)

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
    const hace10min = new Date(Date.now() - 10 * 60_000)
    const hace3dias = new Date(Date.now() - 3 * 86_400_000)

    const [
      citasHoyRes, activosRes, clientesRes, pubsRes, inertesRes,
    ] = await Promise.all([
      supabase.from('citas_coordinacion')
        .select('id, estado, fecha_cita, clientes(nombre), asesor:asesor_id(nombre)')
        .gte('fecha_cita', hoy.toISOString())
        .lt('fecha_cita', manana.toISOString())
        .neq('estado', 'cancelada')
        .order('fecha_cita', { ascending: true }),
      supabase.from('profiles')
        .select('id, nombre, role, last_seen')
        .gte('last_seen', hace10min.toISOString())
        .not('role', 'in', '("admin","supervisor")')
        .order('last_seen', { ascending: false }),
      supabase.from('clientes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', hoy.toISOString()),
      supabase.from('publicacion_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', hoy.toISOString()),
      supabase.from('citas_coordinacion')
        .select('id, estado, updated_at, clientes(nombre)')
        .lte('updated_at', hace3dias.toISOString())
        .not('estado', 'in', '("cancelada","realizada","escrituracion","aparto","firma_contrato")')
        .order('updated_at', { ascending: true })
        .limit(20),
    ])

    const cH = (citasHoyRes.data ?? []) as unknown as CitaHoy[]
    const ac = (activosRes.data ?? []) as UsuarioActivo[]
    const iR = (inertesRes.data ?? []) as unknown as CitaInerte[]

    setCitasHoy(cH)
    setActivosAhora(ac)
    setCitasInertes(iR)
    setStats({
      citasHoy: cH.length,
      activosAhora: ac.length,
      clientesNuevos: clientesRes.count ?? 0,
      publicacionesHoy: pubsRes.count ?? 0,
    })

    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  function onRefresh() { setRefreshing(true); cargar(true) }

  if (loading) return (
    <View style={[st.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator size="large" color={TEAL} />
    </View>
  )

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={st.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
    >
      {/* Stats row */}
      <View style={st.statsRow}>
        <StatCard label="Citas hoy" value={stats.citasHoy} icon="📅" color="#1a6470"
          onPress={() => router.push('/(admin)/coordinacion-citas')} />
        <StatCard label="Activos ahora" value={stats.activosAhora} icon="🟢" color="#16a34a"
          onPress={() => router.push('/(admin)/conexion-usuarios')} />
        <StatCard label="Nuevos hoy" value={stats.clientesNuevos} icon="👤" color="#7c3aed"
          onPress={() => router.push('/(admin)/crm')} />
        <StatCard label="Publicaciones" value={stats.publicacionesHoy} icon="📤" color="#c2410c"
          onPress={() => router.push('/(admin)/actividad')} />
      </View>

      {/* Citas estancadas */}
      {citasInertes.length > 0 && (
        <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={st.sectionHead}>
            <Text style={[st.sectionTitle, { color: c.text }]}>
              ⚠️ Citas estancadas ({citasInertes.length})
            </Text>
            <TouchableOpacity onPress={() => router.push('/(admin)/coordinacion-citas')}>
              <Text style={st.verTodas}>Ver todas ›</Text>
            </TouchableOpacity>
          </View>
          {citasInertes.slice(0, 5).map(c2 => {
            const dias = diasDesde(c2.updated_at)
            const critica = dias >= 7
            return (
              <TouchableOpacity
                key={c2.id}
                style={[st.inertRow, { borderLeftColor: critica ? '#ef4444' : '#f59e0b' }]}
                onPress={() => router.push('/(admin)/coordinacion-citas')}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[st.inertNombre, { color: c.text }]} numberOfLines={1}>
                    {c2.clientes?.nombre ?? 'Sin nombre'}
                  </Text>
                  <Text style={[st.inertEstado, { color: ESTADO_COLOR[c2.estado] ?? '#64748b' }]}>
                    {ESTADO_LABEL[c2.estado] ?? c2.estado}
                  </Text>
                </View>
                <View style={[st.inertDias, { backgroundColor: critica ? '#fef2f2' : '#fef9c3' }]}>
                  <Text style={[st.inertDiasTxt, { color: critica ? '#b91c1c' : '#92400e' }]}>
                    {dias}d
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
          {citasInertes.length > 5 && (
            <TouchableOpacity onPress={() => router.push('/(admin)/coordinacion-citas')} style={st.verMasBtn}>
              <Text style={st.verMasTxt}>+{citasInertes.length - 5} más estancadas</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Equipo activo ahora */}
      {activosAhora.length > 0 && (
        <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={st.sectionHead}>
            <Text style={[st.sectionTitle, { color: c.text }]}>
              🟢 En línea ahora ({activosAhora.length})
            </Text>
            <TouchableOpacity onPress={() => router.push('/(admin)/conexion-usuarios')}>
              <Text style={st.verTodas}>Ver historial ›</Text>
            </TouchableOpacity>
          </View>
          <View style={st.activosWrap}>
            {activosAhora.map(u => (
              <View key={u.id} style={st.activoPill}>
                <View style={st.activoDot} />
                <Text style={[st.activoNombre, { color: c.text }]} numberOfLines={1}>
                  {u.nombre ?? u.id.slice(0, 8)}
                </Text>
                <Text style={[st.activoRol, { color: c.textMute }]}>{rolLabel(u.role)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Citas de hoy */}
      <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={st.sectionHead}>
          <Text style={[st.sectionTitle, { color: c.text }]}>📅 Citas de hoy</Text>
          <TouchableOpacity onPress={() => router.push('/(admin)/coordinacion-citas')}>
            <Text style={st.verTodas}>Abrir kanban ›</Text>
          </TouchableOpacity>
        </View>
        {citasHoy.length === 0 ? (
          <Text style={[st.emptyTxt, { color: c.textMute }]}>No hay citas agendadas para hoy.</Text>
        ) : (
          citasHoy.map(cita => {
            const hora = formatHora(cita.fecha_cita)
            const color = ESTADO_COLOR[cita.estado] ?? '#64748b'
            return (
              <TouchableOpacity
                key={cita.id}
                style={st.citaRow}
                onPress={() => router.push('/(admin)/coordinacion-citas')}
                activeOpacity={0.8}
              >
                <View style={[st.citaHoraBadge, { backgroundColor: color + '20' }]}>
                  <Text style={[st.citaHora, { color }]}>{hora ?? '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.citaNombre, { color: c.text }]} numberOfLines={1}>
                    {cita.clientes?.nombre ?? 'Sin nombre'}
                  </Text>
                  <Text style={[st.citaEstado, { color }]}>
                    {ESTADO_LABEL[cita.estado] ?? cita.estado}
                    {cita.asesor ? ` · ${cita.asesor.nombre.split(' ')[0]}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </View>

      {/* Accesos rápidos */}
      <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[st.sectionTitle, { color: c.text, marginBottom: 12 }]}>⚡ Accesos rápidos</Text>
        <View style={st.quickGrid}>
          {[
            { icon: '📒', label: 'CRM', route: '/(admin)/crm' },
            { icon: '📅', label: 'Citas', route: '/(admin)/coordinacion-citas' },
            { icon: '👥', label: 'Usuarios', route: '/(admin)/prospectadores' },
            { icon: '📊', label: 'Estadísticas', route: '/(admin)/estadisticas' },
            { icon: '📋', label: 'Actividad', route: '/(admin)/actividad' },
            { icon: '📦', label: 'Inventario', route: '/(admin)/inventario' },
          ].map(item => (
            <TouchableOpacity
              key={item.route}
              style={[st.quickBtn, { borderColor: c.border }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
            >
              <Text style={st.quickIcon}>{item.icon}</Text>
              <Text style={[st.quickLabel, { color: c.textSub }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

function StatCard({ label, value, icon, color, onPress }: {
  label: string; value: number; icon: string; color: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={[st.statCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.8}>
      <Text style={st.statIcon}>{icon}</Text>
      <Text style={[st.statValue, { color }]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 40, gap: 14 },

  statsRow: {
    flexDirection: 'row', gap: 10, flexWrap: 'wrap',
  },
  statCard: {
    flex: 1, minWidth: 140, backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderLeftWidth: 4,
    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } as any, default: { elevation: 2 } }),
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  statLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 2 },

  section: {
    borderRadius: 14, borderWidth: 1, padding: 16,
    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as any, default: { elevation: 1 } }),
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  verTodas: { fontSize: 12, color: TEAL, fontWeight: '700' },

  inertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingLeft: 10, marginBottom: 4,
    borderLeftWidth: 3, borderRadius: 4,
  },
  inertNombre: { fontSize: 13, fontWeight: '700' },
  inertEstado: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  inertDias: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  inertDiasTxt: { fontSize: 12, fontWeight: '900' },
  verMasBtn: { paddingTop: 8, alignItems: 'center' },
  verMasTxt: { fontSize: 12, color: TEAL, fontWeight: '700' },
  emptyTxt: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  activosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0fdf4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  activoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  activoNombre: { fontSize: 12, fontWeight: '700', maxWidth: 100 },
  activoRol: { fontSize: 10, fontWeight: '500' },

  citaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  citaHoraBadge: { minWidth: 46, alignItems: 'center', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6 },
  citaHora: { fontSize: 12, fontWeight: '800' },
  citaNombre: { fontSize: 13, fontWeight: '700' },
  citaEstado: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  quickIcon: { fontSize: 18 },
  quickLabel: { fontSize: 13, fontWeight: '700' },
})
