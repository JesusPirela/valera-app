import { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { calcularNivel, infoNivel, tituloPorNivel, sincronizarMisionesBase } from '../../lib/gamification'

type UserStats = {
  xp: number
  valera_coins: number
  streak_dias: number
  total_propiedades: number
  total_clientes: number
  total_cursos: number
  total_seguimientos: number
  total_ventas: number
}

type MisionConProgreso = {
  id: string
  tipo: 'diaria' | 'base'
  categoria: string
  titulo: string
  descripcion: string
  meta: number
  recompensa_xp: number
  recompensa_coins: number
  orden: number
  icono: string
  progreso: number
  completada: boolean
  fecha_reset: string | null
}

const CAT_LABEL: Record<string, string> = {
  propiedad:   '🏠 Propiedades',
  crm:         '👥 CRM',
  curso:       '📚 Cursos',
  streak:      '🔥 Constancia',
  seguimiento: '✅ Seguimientos',
  interaccion: '💬 Interacciones',
}

function BarraProgreso({ porcentaje, color = '#c9a84c', height = 8 }: { porcentaje: number; color?: string; height?: number }) {
  return (
    <View style={[bStyles.track, { height }]}>
      <View style={[bStyles.fill, { width: `${porcentaje}%` as any, backgroundColor: color, height }]} />
    </View>
  )
}

const bStyles = StyleSheet.create({
  track: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden', width: '100%' },
  fill:  { borderRadius: 999 },
})

const getHoyMX = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })

function getMXDayBounds(hoyMX: string): { start: string; end: string } {
  // Mexico City: CDT (UTC-5) abril-octubre, CST (UTC-6) noviembre-marzo
  const month = parseInt(hoyMX.split('-')[1], 10)
  const offsetHours = (month >= 4 && month <= 10) ? 5 : 6
  const startMs = new Date(hoyMX + 'T00:00:00Z').getTime() + offsetHours * 3600000
  return {
    start: new Date(startMs).toISOString(),
    end:   new Date(startMs + 86400000).toISOString(),
  }
}

async function getConteosDiarios(uid: string): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  try {
    const hoy = getHoyMX()
    const { start, end } = getMXDayBounds(hoy)

    const [propRes, crmRes, segRes, intRes, cursoRes] = await Promise.all([
      supabase.from('propiedad_publicacion').select('propiedad_id')
        .eq('user_id', uid).gte('fecha_publicacion', start).lt('fecha_publicacion', end),
      supabase.from('clientes').select('id')
        .eq('responsable_id', uid).gte('created_at', start).lt('created_at', end),
      supabase.from('recordatorios').select('id')
        .eq('user_id', uid).eq('completado', true).gte('completado_at', start).lt('completado_at', end),
      supabase.from('interacciones').select('id')
        .eq('user_id', uid).gte('created_at', start).lt('created_at', end),
      supabase.from('vu_progreso').select('id')
        .eq('user_id', uid).gte('completada_at', start).lt('completada_at', end),
    ])
    m.set('propiedad',   propRes.data?.length  ?? 0)
    m.set('crm',         crmRes.data?.length   ?? 0)
    m.set('seguimiento', segRes.data?.length   ?? 0)
    m.set('interaccion', intRes.data?.length   ?? 0)
    m.set('curso',       cursoRes.data?.length ?? 0)
  } catch (e) {
    console.warn('[Misiones] getConteosDiarios error:', e)
  }
  return m
}

function buildLista(
  misiones: any[],
  progresoData: any[],
  conteosMap: Map<string, number>,
  hoy: string,
): MisionConProgreso[] {
  const progresoMap = new Map<string, { progreso: number; completada: boolean; fecha_reset: string | null }>()
  for (const p of progresoData) {
    progresoMap.set(p.mision_id, { progreso: p.progreso, completada: p.completada, fecha_reset: p.fecha_reset })
  }
  return misiones.map((m: any) => {
    const um = progresoMap.get(m.id)
    if (m.tipo === 'diaria') {
      const conteo = Math.min(conteosMap.get(m.categoria) ?? 0, m.meta)
      const completada = conteo >= m.meta || (um?.fecha_reset === hoy && (um?.completada ?? false))
      return { ...m, progreso: conteo, completada, fecha_reset: um?.fecha_reset ?? null }
    }
    return { ...m, progreso: um?.progreso ?? 0, completada: um?.completada ?? false, fecha_reset: um?.fecha_reset ?? null }
  })
}

export default function Misiones() {
  const queryClient = useQueryClient()
  const [tabBase, setTabBase]   = useState<string>('propiedad')
  const [sincronizando, setSincronizando] = useState(false)
  const sincronizandoRef = useRef(false)

  // React Query: misiones y stats cacheados (aparecen al instante al enfocar,
  // antes recargaba con spinner en cada visita). El realtime de user_misiones /
  // user_stats invalida el cache para refrescar el progreso en vivo.
  const { data, isLoading: loading } = useQuery({
    queryKey: ['misiones'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return null
      const hoy = getHoyMX()
      const [statsRes, misionesRes, progresoRes, conteosMap] = await Promise.all([
        supabase.from('user_stats').select('xp, valera_coins, streak_dias, total_propiedades, total_clientes, total_cursos, total_seguimientos, total_ventas').eq('id', user.id).maybeSingle(),
        supabase.from('misiones').select('id, tipo, categoria, titulo, descripcion, meta, recompensa_xp, recompensa_coins, orden, icono').eq('activa', true).order('orden'),
        supabase.from('user_misiones').select('mision_id, progreso, completada, fecha_reset').eq('user_id', user.id),
        getConteosDiarios(user.id),
      ])
      return {
        userId: user.id,
        stats: (statsRes.data as UserStats | null) ?? null,
        misiones: buildLista(misionesRes.data ?? [], progresoRes.data ?? [], conteosMap, hoy),
      }
    },
    staleTime: 1000 * 30,
    networkMode: 'offlineFirst',
  })
  const userId = data?.userId ?? null
  const stats = data?.stats ?? null
  const misiones = data?.misiones ?? []

  // Refresco en segundo plano al enfocar (el cache se muestra al instante).
  useFocusEffect(useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['misiones'] })
  }, [queryClient]))

  // Realtime: cambios en las misiones/stats del usuario refrescan el cache en vivo.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      const refrescar = () => { if (!sincronizandoRef.current) queryClient.invalidateQueries({ queryKey: ['misiones'] }) }
      channel = supabase
        .channel('misiones-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_misiones', filter: `user_id=eq.${user.id}` }, refrescar)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_stats', filter: `id=eq.${user.id}` }, refrescar)
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [queryClient])

  const diarias = misiones.filter(m => m.tipo === 'diaria')
  const base    = misiones.filter(m => m.tipo === 'base')
  const catsBas = [...new Set(base.map(m => m.categoria))]
  const baseEnCat = base.filter(m => m.categoria === tabBase)

  const diarCompletas = diarias.filter(m => m.completada).length
  const info = stats ? infoNivel(stats.xp) : { nivel: 1, xpActual: 0, xpNecesario: 100, porcentaje: 0 }

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1b2a' }}>
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* ── HERO CARD ─────────────────────────────────────────── */}
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={s.levelBadge}>
            <Text style={s.levelNum}>{info.nivel}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>{tituloPorNivel(info.nivel)}</Text>
            <Text style={s.nivelLabel}>Nivel {info.nivel}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[s.syncBtn, sincronizando && { opacity: 0.5 }]}
              disabled={sincronizando}
              onPress={async () => {
                if (!userId) return
                setSincronizando(true)
                sincronizandoRef.current = true
                await sincronizarMisionesBase(userId).catch(() => {})
                sincronizandoRef.current = false
                await queryClient.invalidateQueries({ queryKey: ['misiones'] })
                setSincronizando(false)
              }}
            >
              {sincronizando
                ? <ActivityIndicator size="small" color="#c9a84c" />
                : <><Ionicons name="sync-outline" size={13} color="#c9a84c" /><Text style={s.syncBtnTxt}> Sincronizar</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.rankBtn} onPress={() => router.push('/(prospectador)/ranking')}>
              <Ionicons name="trophy-outline" size={16} color="#c9a84c" />
              <Text style={s.rankBtnTxt}>Ranking</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Barra XP */}
        <View style={s.xpRow}>
          <Text style={s.xpText}>XP {info.xpActual} / {info.xpNecesario}</Text>
          <Text style={s.xpPct}>{info.porcentaje}%</Text>
        </View>
        <BarraProgreso porcentaje={info.porcentaje} color="#c9a84c" height={10} />

        {/* Coins + Streak */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statIcon}>💰</Text>
            <Text style={s.statVal}>{(stats?.valera_coins ?? 0).toLocaleString()}</Text>
            <Text style={s.statLbl}>Valera Coins</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statIcon}>🔥</Text>
            <Text style={s.statVal}>{stats?.streak_dias ?? 0}</Text>
            <Text style={s.statLbl}>Días de racha</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statIcon}>🏠</Text>
            <Text style={s.statVal}>{stats?.total_propiedades ?? 0}</Text>
            <Text style={s.statLbl}>Publicadas</Text>
          </View>
        </View>

        {/* Accesos rápidos */}
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(prospectador)/tienda')}>
            <Ionicons name="storefront-outline" size={18} color="#c9a84c" />
            <Text style={s.quickBtnTxt}>Tienda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(prospectador)/ranking')}>
            <Ionicons name="podium-outline" size={18} color="#c9a84c" />
            <Text style={s.quickBtnTxt}>Ranking</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(prospectador)/mi-actividad' as any)}>
            <Ionicons name="bar-chart-outline" size={18} color="#c9a84c" />
            <Text style={s.quickBtnTxt}>Actividad</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── MISIONES DIARIAS ──────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>⚡ Misiones Diarias</Text>
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{diarCompletas}/{diarias.length}</Text>
          </View>
        </View>
        <Text style={s.sectionSub}>Se reinician cada día a medianoche</Text>

        {diarias.map(m => {
          const pct = m.meta > 0 ? Math.min(100, Math.round((m.progreso / m.meta) * 100)) : 0
          return (
            <View key={m.id} style={[s.misionCard, m.completada && s.misionCardDone]}>
              <View style={s.misionTop}>
                <Text style={s.misionIcn}>{m.icono}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.misionTit, m.completada && { color: '#2ecc71' }]}>{m.titulo}</Text>
                  <Text style={s.misionDesc}>{m.descripcion}</Text>
                </View>
                {m.completada
                  ? <View style={s.doneBadge}><Text style={s.doneTxt}>✓</Text></View>
                  : <View style={s.rewardBadge}>
                      <Text style={s.rewardTxt}>+{m.recompensa_coins}💰</Text>
                    </View>
                }
              </View>
              <View style={s.misionBot}>
                <View style={s.progHeader}>
                  <Text style={s.progLabel}>Progreso</Text>
                  <Text style={[s.misionProg, m.completada && { color: '#2ecc71' }]}>{m.progreso}/{m.meta}</Text>
                </View>
                <BarraProgreso porcentaje={pct} color={m.completada ? '#2ecc71' : '#c9a84c'} height={8} />
              </View>
            </View>
          )
        })}
      </View>

      {/* ── MISIONES BASE ─────────────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>🏆 Misiones Base</Text>
        <Text style={s.sectionSub}>Progreso permanente — nunca se reinician</Text>

        {/* Tabs de categoría */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {catsBas.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.catTab, tabBase === cat && s.catTabActivo]}
                onPress={() => setTabBase(cat)}
              >
                <Text style={[s.catTabTxt, tabBase === cat && s.catTabTxtActivo]}>
                  {CAT_LABEL[cat] ?? cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Misiones de la categoría seleccionada */}
        {(() => {
          const completadas = baseEnCat.filter(m => m.completada)
          const proxima     = baseEnCat.find(m => !m.completada)
          const bloqueadas  = baseEnCat.filter(m => !m.completada && m !== proxima)

          return (
            <>
              {/* Completadas colapsadas */}
              {completadas.length > 0 && (
                <View style={s.completadasRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#2ecc71" />
                  <Text style={s.completadasTxt}>
                    {completadas.length} misión{completadas.length > 1 ? 'es' : ''} completada{completadas.length > 1 ? 's' : ''} ✅
                  </Text>
                </View>
              )}

              {/* Próxima misión activa */}
              {proxima && (
                <View style={[s.misionCard, s.misionCardActiva]}>
                  <View style={s.activaLabel}>
                    <Text style={s.activaLabelTxt}>PRÓXIMA</Text>
                  </View>
                  <View style={s.misionTop}>
                    <Text style={s.misionIcn}>{proxima.icono}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.misionTit}>{proxima.titulo}</Text>
                      <Text style={s.misionDesc}>{proxima.descripcion}</Text>
                    </View>
                    <View style={s.rewardStack}>
                      <Text style={s.rewardTxt}>+{proxima.recompensa_coins}💰</Text>
                      <Text style={s.rewardXp}>+{proxima.recompensa_xp} XP</Text>
                    </View>
                  </View>
                  <View style={s.misionBot}>
                    <View style={s.progHeader}>
                      <Text style={s.progLabel}>Progreso</Text>
                      <Text style={s.misionProg}>{proxima.progreso}/{proxima.meta}</Text>
                    </View>
                    <BarraProgreso
                      porcentaje={proxima.meta > 0 ? Math.min(100, Math.round((proxima.progreso / proxima.meta) * 100)) : 0}
                      color="#c9a84c"
                      height={8}
                    />
                  </View>
                </View>
              )}

              {/* Bloqueadas (próximas objetivos) */}
              {bloqueadas.map((m, idx) => (
                <View key={m.id} style={[s.misionCard, s.misionCardBloq]}>
                  <View style={s.misionTop}>
                    <Text style={[s.misionIcn, { opacity: 0.4 }]}>{m.icono}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.misionTit, { color: '#555' }]}>{m.titulo}</Text>
                      <Text style={[s.misionDesc, { color: '#444' }]}>{m.descripcion}</Text>
                    </View>
                    <View style={s.lockBadge}>
                      <Ionicons name="lock-closed" size={14} color="#555" />
                    </View>
                  </View>
                </View>
              ))}

              {!proxima && completadas.length === baseEnCat.length && baseEnCat.length > 0 && (
                <View style={s.allDoneCard}>
                  <Text style={s.allDoneIcn}>🏆</Text>
                  <Text style={s.allDoneTxt}>¡Categoría completada!</Text>
                </View>
              )}
            </>
          )
        })()}
      </View>

    </ScrollView>
  )
}

const DARK = '#0d1b2a'
const CARD = '#111f2e'
const GOLD = '#c9a84c'

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  // Hero
  hero: {
    backgroundColor: '#122030',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3448',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  levelBadge: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10,
    elevation: 8,
  },
  levelNum:  { fontSize: 22, fontWeight: '900', color: '#1a1000' },
  titulo:    { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 2 },
  nivelLabel:{ fontSize: 12, color: '#7a9ab5' },
  rankBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: GOLD, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  rankBtnTxt: { color: GOLD, fontSize: 12, fontWeight: '700' },

  xpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpText: { fontSize: 12, color: '#7a9ab5' },
  xpPct:  { fontSize: 12, color: GOLD, fontWeight: '700' },

  statsRow: { flexDirection: 'row', marginTop: 16, marginBottom: 16 },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#1e3448' },
  statIcon: { fontSize: 20, marginBottom: 2 },
  statVal:  { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 1 },
  statLbl:  { fontSize: 10, color: '#7a9ab5', textAlign: 'center' },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#1e3448', borderRadius: 10,
    paddingVertical: 10, backgroundColor: '#0d1b2a',
  },
  quickBtnTxt: { color: GOLD, fontSize: 13, fontWeight: '700' },

  // Sections
  section: { padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1 },
  sectionSub:    { fontSize: 12, color: '#556a7a', marginBottom: 14 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#c9a84c44' },
  syncBtnTxt: { color: GOLD, fontSize: 11, fontWeight: '600' },
  badge: { backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { color: '#1a1000', fontSize: 11, fontWeight: '800' },

  // Mission cards
  misionCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#1e3448',
  },
  misionCardDone: { borderColor: '#1a4a2e', backgroundColor: '#0d2018' },
  misionCardActiva: { borderColor: GOLD, borderWidth: 1.5 },
  misionCardBloq:   { opacity: 0.55 },

  misionTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  misionIcn:  { fontSize: 24, marginTop: 1 },
  misionTit:  { fontSize: 14, fontWeight: '700', color: '#e8f0f4', marginBottom: 3 },
  misionDesc: { fontSize: 12, color: '#556a7a', lineHeight: 17 },

  misionBot:  { flexDirection: 'column', gap: 6 },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progLabel:  { fontSize: 11, color: '#556a7a' },
  misionProg: { fontSize: 16, fontWeight: '800', color: '#c9a84c' },

  doneBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#2ecc71',
    alignItems: 'center', justifyContent: 'center',
  },
  doneTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },

  rewardBadge: { backgroundColor: '#1a1500', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  rewardStack: { alignItems: 'flex-end', gap: 2 },
  rewardTxt:   { color: GOLD, fontSize: 12, fontWeight: '700' },
  rewardXp:    { color: '#7a9ab5', fontSize: 10 },

  lockBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e3448',
    alignItems: 'center', justifyContent: 'center',
  },

  activaLabel: { marginBottom: 8 },
  activaLabelTxt: { fontSize: 10, fontWeight: '800', color: GOLD, letterSpacing: 1 },

  // Category tabs
  catTab: {
    borderWidth: 1, borderColor: '#1e3448', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: CARD,
  },
  catTabActivo:    { backgroundColor: GOLD, borderColor: GOLD },
  catTabTxt:       { fontSize: 12, color: '#7a9ab5', fontWeight: '600' },
  catTabTxtActivo: { color: '#1a1000', fontWeight: '800' },

  completadasRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0d2018', borderRadius: 10, padding: 10, marginBottom: 8,
  },
  completadasTxt: { fontSize: 13, color: '#2ecc71', fontWeight: '600' },

  allDoneCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: GOLD,
  },
  allDoneIcn: { fontSize: 36, marginBottom: 8 },
  allDoneTxt: { fontSize: 15, fontWeight: '700', color: GOLD },
})
