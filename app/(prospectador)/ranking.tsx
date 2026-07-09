import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, RefreshControl,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { calcularNivel, tituloPorNivel } from '../../lib/gamification'
import { AccentBackground } from '../../lib/patrones'
import AvatarConMarco from '../../components/AvatarConMarco'
import { marcoPorNivel } from '../../lib/marcos'

// El ranking es de PRODUCTIVIDAD: no incluye valera_coins a propósito.
type RankEntry = {
  id: string
  nombre: string
  avatar_url: string | null
  color_acento: string | null
  xp: number
  streak_dias: number
  posicion: number
  ventas_cerradas: number
  rentas_cerradas: number
  citas_realizadas: number
  propiedades_publicadas: number
  clientes_registrados: number
  cursos_completados: number
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const queryClient = useQueryClient()
  const [sel, setSel] = useState<RankEntry | null>(null)

  // React Query: el ranking cacheado aparece al instante al volver a la pantalla;
  // solo se vuelve a pedir en segundo plano si pasaron >2 min (antes recargaba
  // desde cero en cada foco). getSession() es local (no red) para el userId.
  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['ranking'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: rows } = await supabase.rpc('get_ranking')
      return { userId: session?.user?.id ?? null, entries: (rows ?? []) as RankEntry[] }
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'offlineFirst',
  })
  const userId = data?.userId ?? null
  const entries = data?.entries ?? []

  // Jalar para actualizar
  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } catch {} finally { setRefreshing(false) }
  }, [refetch])

  useFocusEffect(useCallback(() => {
    const st = queryClient.getQueryState(['ranking'])
    if (!st?.dataUpdatedAt || Date.now() - st.dataUpdatedAt > 1000 * 60 * 2) {
      queryClient.invalidateQueries({ queryKey: ['ranking'] })
    }
  }, [queryClient]))

  const miEntry = entries.find(e => e.id === userId)

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  )

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} tintColor="#c9a84c" colors={['#c9a84c']} />}
    >

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🏆 Ranking</Text>
        <Text style={s.headerSub}>Top prospectadores por XP acumulado</Text>
      </View>

      {/* Mi posición (si no está visible en el top) */}
      {miEntry && miEntry.posicion > 10 && (
        <TouchableOpacity style={[s.entryCard, s.miCard]} activeOpacity={0.7} onPress={() => setSel(miEntry)}>
          <Text style={s.posMi}>#{miEntry.posicion}</Text>
          <AvatarConMarco avatarUrl={miEntry.avatar_url} nombre={miEntry.nombre} nivel={calcularNivel(miEntry.xp)} size={44} fondo="#1a1500" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.entryNombre}>{miEntry.nombre} <Text style={s.tuLabel}>(Tú)</Text></Text>
            <Text style={s.entryTitulo}>{tituloPorNivel(calcularNivel(miEntry.xp))}</Text>
          </View>
          <View style={s.entryRight}>
            <Text style={s.entryXP}>{miEntry.xp.toLocaleString()} XP</Text>
            <Text style={s.entryStreak}>🔥 {miEntry.streak_dias}d</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Lista */}
      {entries.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyTxt}>Aún no hay datos en el ranking.</Text>
          <Text style={s.emptyHint}>¡Sé el primero en acumular XP!</Text>
        </View>
      ) : (
        entries.map((e, idx) => {
          const esYo   = e.id === userId
          const nivel  = calcularNivel(e.xp)
          const medal  = idx < 3 ? MEDAL[idx] : null
          return (
            <TouchableOpacity key={e.id} style={[s.entryCard, esYo && s.miCard]} activeOpacity={0.7} onPress={() => setSel(e)}>
              {/* Posición */}
              <View style={s.posWrap}>
                {medal
                  ? <Text style={s.medalText}>{medal}</Text>
                  : <Text style={[s.posNum, esYo && { color: '#c9a84c' }]}>#{e.posicion}</Text>
                }
              </View>

              <AvatarConMarco avatarUrl={e.avatar_url} nombre={e.nombre} nivel={nivel} size={44} fondo={esYo ? '#1a1500' : '#111f2e'} />

              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.entryNombre, esYo && { color: '#c9a84c' }]} numberOfLines={1}>
                  {e.nombre}{esYo ? ' 👈' : ''}
                </Text>
                <Text style={s.entryTitulo}>{tituloPorNivel(nivel)} · Nv. {nivel}</Text>
                {/* Resultados reales, de un vistazo */}
                <Text style={s.entryStats} numberOfLines={1}>
                  💰 {e.ventas_cerradas}  🔑 {e.rentas_cerradas}  📅 {e.citas_realizadas}  🏠 {e.propiedades_publicadas}
                </Text>
              </View>

              <View style={s.entryRight}>
                <Text style={s.entryXP}>{e.xp.toLocaleString()} XP</Text>
                {e.streak_dias > 0 && (
                  <Text style={s.entryStreak}>🔥 {e.streak_dias}d</Text>
                )}
              </View>
            </TouchableOpacity>
          )
        })
      )}

      {/* Mini-visualización del perfil al tocar a un usuario */}
      <Modal visible={sel !== null} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <TouchableOpacity style={mp.overlay} activeOpacity={1} onPress={() => setSel(null)}>
          {sel && (() => {
            const nivelSel = calcularNivel(sel.xp)
            const marcoSel = marcoPorNivel(nivelSel)
            return (
            <View style={mp.card}>
              <AccentBackground acentoId={sel.color_acento || '#1a6470'} style={mp.headerBand} />
              <View style={mp.avWrap}>
                <AvatarConMarco avatarUrl={sel.avatar_url} nombre={sel.nombre} nivel={nivelSel} size={92} fondo="#122030" />
              </View>
              <Text style={mp.nombre} numberOfLines={2}>{sel.nombre}</Text>
              <Text style={mp.titulo}>{tituloPorNivel(nivelSel)}</Text>
              <Text style={[mp.marcoLbl, { color: marcoSel.color }]}>🎖 Marco {marcoSel.nombre}</Text>

              <View style={mp.stats}>
                <View style={mp.stat}><Text style={mp.statNum}>{nivelSel}</Text><Text style={mp.statLbl}>Nivel</Text></View>
                <View style={mp.statDiv} />
                <View style={mp.stat}><Text style={mp.statNum}>{sel.xp.toLocaleString()}</Text><Text style={mp.statLbl}>XP</Text></View>
                <View style={mp.statDiv} />
                <View style={mp.stat}><Text style={mp.statNum}>🔥 {sel.streak_dias}</Text><Text style={mp.statLbl}>Racha</Text></View>
              </View>

              {/* Resultados reales (productividad) */}
              <View style={mp.grid}>
                {([
                  ['💰', sel.ventas_cerradas,        'Ventas cerradas'],
                  ['🔑', sel.rentas_cerradas,        'Rentas cerradas'],
                  ['📅', sel.citas_realizadas,       'Citas realizadas'],
                  ['🏠', sel.propiedades_publicadas, 'Propiedades'],
                  ['👥', sel.clientes_registrados,   'Clientes'],
                  ['🎓', sel.cursos_completados,     'Cursos'],
                ] as const).map(([icono, valor, label]) => (
                  <View key={label} style={mp.gridItem}>
                    <Text style={mp.gridIcon}>{icono}</Text>
                    <Text style={mp.gridNum}>{valor}</Text>
                    <Text style={mp.gridLbl} numberOfLines={2}>{label}</Text>
                  </View>
                ))}
              </View>

              <Text style={mp.hint}>Toca fuera para cerrar</Text>
            </View>
            )
          })()}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}

const mp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: {
    width: '100%', maxWidth: 330, backgroundColor: '#122030',
    borderRadius: 20, overflow: 'hidden', alignItems: 'center', paddingBottom: 20,
    borderWidth: 1, borderColor: '#1e3448',
  },
  headerBand: { width: '100%', height: 70 },
  // Avatar (con su marco) cruzando el borde del header. Va FUERA del
  // AccentBackground para que el overflow:hidden del gradiente no lo recorte.
  avWrap: { marginTop: -48 },
  nombre: { fontSize: 18, fontWeight: '900', color: '#fff', marginTop: 12, textAlign: 'center', paddingHorizontal: 16 },
  titulo: { fontSize: 13, fontWeight: '700', color: '#c9a84c', marginTop: 3 },
  marcoLbl: { fontSize: 11.5, fontWeight: '800', marginTop: 5 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    marginTop: 14, paddingHorizontal: 8, gap: 6,
  },
  gridItem: {
    width: '30%', alignItems: 'center', backgroundColor: '#0d1b2a',
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 4,
    borderWidth: 1, borderColor: '#1e3448',
  },
  gridIcon: { fontSize: 15 },
  gridNum: { fontSize: 16, fontWeight: '900', color: '#fff', marginTop: 2 },
  gridLbl: { fontSize: 9.5, color: '#7a9ab5', textAlign: 'center', marginTop: 2, lineHeight: 12 },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 10 },
  stat: { alignItems: 'center', paddingHorizontal: 14, minWidth: 64 },
  statNum: { fontSize: 16, fontWeight: '900', color: '#fff' },
  statLbl: { fontSize: 11, color: '#7a9ab5', marginTop: 2 },
  statDiv: { width: 1, height: 30, backgroundColor: '#1e3448' },
  hint: { fontSize: 11, color: '#556a7a', marginTop: 16 },
})

const DARK = '#0d1b2a'
const GOLD = '#c9a84c'

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  header: {
    padding: 20, backgroundColor: '#122030',
    borderBottomWidth: 1, borderBottomColor: '#1e3448',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#7a9ab5', marginTop: 3 },

  entryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111f2e', marginHorizontal: 12, marginTop: 8,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#1e3448',
  },
  miCard: { borderColor: GOLD, backgroundColor: '#1a1500' },

  posWrap: { width: 38, alignItems: 'center' },
  medalText: { fontSize: 24 },
  posNum: { fontSize: 14, fontWeight: '800', color: '#556a7a' },
  posMi: { fontSize: 14, fontWeight: '800', color: GOLD, marginRight: 8 },

  entryNombre:  { fontSize: 14, fontWeight: '700', color: '#e8f0f4' },
  entryTitulo:  { fontSize: 11, color: '#556a7a', marginTop: 1 },
  entryStats:   { fontSize: 10.5, color: '#7a9ab5', marginTop: 3, letterSpacing: 0.2 },
  tuLabel:      { color: GOLD, fontSize: 11 },

  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryXP:    { fontSize: 13, fontWeight: '800', color: '#fff' },
  entryStreak:{ fontSize: 12, color: '#7a9ab5' },

  emptyBox: { alignItems: 'center', padding: 60 },
  emptyTxt: { fontSize: 16, color: '#556a7a', fontWeight: '600', marginBottom: 6 },
  emptyHint:{ fontSize: 13, color: '#3a5060' },
})
