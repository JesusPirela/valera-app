import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const TEAL = '#1a6470'

type Recordatorio = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_hora: string
  cliente_id: string | null
  clientes: { nombre: string } | null
}

type ClienteDormido = {
  id: string
  nombre: string
  estado: string
  updated_at: string
}

type Mision = {
  id: string
  nombre: string
  descripcion: string | null
  progreso: number
  meta: number
  tipo: string
}

const ESTADO_LABEL: Record<string, string> = {
  por_perfilar: 'Por perfilar', cita_por_agendar: 'Cita por agendar',
  cita_agendada: 'Cita agendada', seguimiento_cierre: 'En cierre',
  no_contesta: 'No contesta', descartado: 'Descartado', compro: 'Compró',
}

const ESTADO_COLOR: Record<string, string> = {
  por_perfilar: '#ca8a04', cita_por_agendar: '#7c3aed',
  cita_agendada: '#16a34a', seguimiento_cierre: '#0369a1',
  no_contesta: '#64748b', descartado: '#dc2626', compro: '#0d9488',
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function MiDia() {
  const c = useColors()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [dormidos, setDormidos] = useState<ClienteDormido[]>([])
  const [misiones, setMisiones] = useState<Mision[]>([])
  const [pubsHoy, setPubsHoy] = useState(0)
  const [nombreUsuario, setNombreUsuario] = useState('')

  async function cargar(silent = false) {
    if (!silent) setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
    const hace7dias = new Date(Date.now() - 7 * 86_400_000)

    const [perfilRes, recsRes, dormidosRes, misionesRes, pubsRes] = await Promise.all([
      supabase.from('profiles').select('nombre').eq('id', user.id).maybeSingle(),
      supabase.from('recordatorios')
        .select('id, titulo, descripcion, fecha_hora, cliente_id, clientes(nombre)')
        .eq('user_id', user.id)
        .eq('completado', false)
        .gte('fecha_hora', hoy.toISOString())
        .lt('fecha_hora', manana.toISOString())
        .order('fecha_hora', { ascending: true }),
      supabase.from('clientes')
        .select('id, nombre, estado, updated_at')
        .eq('responsable_id', user.id)
        .is('eliminado_at', null)
        .not('estado', 'in', '("compro","descartado")')
        .lte('updated_at', hace7dias.toISOString())
        .order('updated_at', { ascending: true })
        .limit(10),
      supabase.from('user_misiones')
        .select('id, nombre, descripcion, progreso, meta, tipo')
        .eq('user_id', user.id)
        .eq('fecha', hoy.toISOString().slice(0, 10))
        .eq('completada', false),
      supabase.from('publicacion_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', hoy.toISOString()),
    ])

    setNombreUsuario((perfilRes.data as any)?.nombre?.split(' ')[0] ?? '')
    setRecordatorios((recsRes.data ?? []) as unknown as Recordatorio[])
    setDormidos((dormidosRes.data ?? []) as ClienteDormido[])
    setMisiones((misionesRes.data ?? []) as unknown as Mision[])
    setPubsHoy(pubsRes.count ?? 0)
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  function onRefresh() { setRefreshing(true); cargar(true) }

  const horaActual = new Date().getHours()
  const saludo = horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches'

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
      {/* Header saludo */}
      <View style={[st.headerCard, { backgroundColor: TEAL }]}>
        <Text style={st.saludoSub}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={st.saludoTxt}>
          {saludo}{nombreUsuario ? `, ${nombreUsuario}` : ''} 👋
        </Text>
      </View>

      {/* Stats rápidos */}
      <View style={st.statsRow}>
        <View style={[st.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[st.statNum, { color: TEAL }]}>{recordatorios.length}</Text>
          <Text style={[st.statLbl, { color: c.textMute }]}>recordatorios{'\n'}hoy</Text>
        </View>
        <View style={[st.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[st.statNum, { color: '#7c3aed' }]}>{dormidos.length}</Text>
          <Text style={[st.statLbl, { color: c.textMute }]}>clientes{'\n'}sin contacto</Text>
        </View>
        <View style={[st.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[st.statNum, { color: '#16a34a' }]}>{pubsHoy}</Text>
          <Text style={[st.statLbl, { color: c.textMute }]}>publicaciones{'\n'}hoy</Text>
        </View>
        <View style={[st.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[st.statNum, { color: '#d97706' }]}>{misiones.length}</Text>
          <Text style={[st.statLbl, { color: c.textMute }]}>misiones{'\n'}pendientes</Text>
        </View>
      </View>

      {/* Recordatorios de hoy */}
      <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={st.sectionHead}>
          <Text style={[st.sectionTitle, { color: c.text }]}>⏰ Recordatorios de hoy</Text>
          <TouchableOpacity onPress={() => router.push('/(prospectador)/tareas')}>
            <Text style={st.verTodas}>Ver todos ›</Text>
          </TouchableOpacity>
        </View>
        {recordatorios.length === 0 ? (
          <Text style={[st.emptyTxt, { color: c.textMute }]}>Sin recordatorios para hoy. ¡Buen día!</Text>
        ) : (
          recordatorios.map(r => (
            <TouchableOpacity
              key={r.id}
              style={st.recRow}
              onPress={() => r.cliente_id && router.push(`/(prospectador)/detalle-cliente?id=${r.cliente_id}` as any)}
              activeOpacity={r.cliente_id ? 0.8 : 1}
            >
              <View style={st.recHoraBadge}>
                <Text style={st.recHora}>{formatHora(r.fecha_hora)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.recTitulo, { color: c.text }]} numberOfLines={1}>{r.titulo}</Text>
                {r.clientes?.nombre && (
                  <Text style={[st.recCliente, { color: c.textMute }]} numberOfLines={1}>
                    👤 {r.clientes.nombre}
                  </Text>
                )}
                {r.descripcion && (
                  <Text style={[st.recDesc, { color: c.textMute }]} numberOfLines={1}>{r.descripcion}</Text>
                )}
              </View>
              {r.cliente_id && <Text style={{ color: TEAL, fontSize: 18 }}>›</Text>}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Misiones pendientes */}
      {misiones.length > 0 && (
        <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={st.sectionHead}>
            <Text style={[st.sectionTitle, { color: c.text }]}>⚡ Misiones pendientes</Text>
            <TouchableOpacity onPress={() => router.push('/(prospectador)/misiones')}>
              <Text style={st.verTodas}>Ver todas ›</Text>
            </TouchableOpacity>
          </View>
          {misiones.map(m => {
            const pct = Math.min(100, Math.round((m.progreso / Math.max(m.meta, 1)) * 100))
            return (
              <TouchableOpacity
                key={m.id}
                style={st.misionRow}
                onPress={() => router.push('/(prospectador)/misiones')}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[st.misionNombre, { color: c.text }]} numberOfLines={1}>{m.nombre}</Text>
                  <View style={st.progressBg}>
                    <View style={[st.progressFill, { width: `${pct}%` as any }]} />
                  </View>
                </View>
                <Text style={[st.misionPct, { color: c.textMute }]}>{m.progreso}/{m.meta}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* Clientes sin contacto */}
      <View style={[st.section, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={st.sectionHead}>
          <Text style={[st.sectionTitle, { color: c.text }]}>
            😴 Clientes sin contacto ({dormidos.length})
          </Text>
          <TouchableOpacity onPress={() => router.push('/(prospectador)/crm')}>
            <Text style={st.verTodas}>Ver CRM ›</Text>
          </TouchableOpacity>
        </View>
        {dormidos.length === 0 ? (
          <Text style={[st.emptyTxt, { color: c.textMute }]}>
            ¡Todos tus clientes tienen actividad reciente!
          </Text>
        ) : (
          dormidos.map(cl => {
            const dias = diasDesde(cl.updated_at)
            const colorEstado = ESTADO_COLOR[cl.estado] ?? '#64748b'
            return (
              <TouchableOpacity
                key={cl.id}
                style={st.dormidoRow}
                onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${cl.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={[st.dormidoAvatar, { backgroundColor: colorEstado + '20' }]}>
                  <Text style={[st.dormidoIniciales, { color: colorEstado }]}>
                    {cl.nombre.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.dormidoNombre, { color: c.text }]} numberOfLines={1}>{cl.nombre}</Text>
                  <Text style={[st.dormidoEstado, { color: colorEstado }]}>
                    {ESTADO_LABEL[cl.estado] ?? cl.estado}
                  </Text>
                </View>
                <View style={[st.diasBadge, dias >= 14 && st.diasBadgeRojo]}>
                  <Text style={[st.diasTxt, dias >= 14 && st.diasTxtRojo]}>{dias}d</Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </View>

      {/* Accesos rápidos */}
      <View style={st.quickRow}>
        {[
          { icon: '📤', label: 'Publicar', route: '/(prospectador)/propiedades' },
          { icon: '👥', label: 'Clientes', route: '/(prospectador)/crm' },
          { icon: '⚡', label: 'Misiones', route: '/(prospectador)/misiones' },
        ].map(item => (
          <TouchableOpacity
            key={item.route}
            style={[st.quickBtn, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.8}
          >
            <Text style={st.quickIcon}>{item.icon}</Text>
            <Text style={[st.quickLabel, { color: c.textSub }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingBottom: 40 },

  headerCard: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22,
  },
  saludoSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500', textTransform: 'capitalize', marginBottom: 4 },
  saludoTxt: { fontSize: 22, fontWeight: '900', color: '#fff' },

  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statBox: {
    flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any }),
  },
  statNum: { fontSize: 24, fontWeight: '900', lineHeight: 30 },
  statLbl: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 3, lineHeight: 13 },

  section: {
    marginHorizontal: 12, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 16,
    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as any, default: { elevation: 1 } }),
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  verTodas: { fontSize: 12, color: TEAL, fontWeight: '700' },
  emptyTxt: { fontSize: 13, textAlign: 'center', paddingVertical: 10 },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' },
  recHoraBadge: { backgroundColor: TEAL + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 50, alignItems: 'center' },
  recHora: { fontSize: 12, fontWeight: '800', color: TEAL },
  recTitulo: { fontSize: 13, fontWeight: '700' },
  recCliente: { fontSize: 11, marginTop: 2 },
  recDesc: { fontSize: 11, marginTop: 1, fontStyle: 'italic' },

  misionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  misionNombre: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  progressBg: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#f59e0b', borderRadius: 3 },
  misionPct: { fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  dormidoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dormidoAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dormidoIniciales: { fontSize: 15, fontWeight: '800' },
  dormidoNombre: { fontSize: 13, fontWeight: '700' },
  dormidoEstado: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  diasBadge: { backgroundColor: '#fef9c3', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  diasBadgeRojo: { backgroundColor: '#fef2f2' },
  diasTxt: { fontSize: 12, fontWeight: '900', color: '#92400e' },
  diasTxtRojo: { color: '#b91c1c' },

  quickRow: { flexDirection: 'row', gap: 10, marginHorizontal: 12, marginBottom: 12 },
  quickBtn: {
    flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1,
    paddingVertical: 14, gap: 6,
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any }),
  },
  quickIcon: { fontSize: 24 },
  quickLabel: { fontSize: 12, fontWeight: '700' },
})
