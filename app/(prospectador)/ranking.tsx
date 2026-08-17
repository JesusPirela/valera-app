import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, RefreshControl, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { calcularNivel, tituloPorNivel } from '../../lib/gamification'
import { AccentBackground, AnimatedGradientView, patronDeAcento } from '../../lib/patrones'
import AvatarConMarco from '../../components/AvatarConMarco'
import { marcoPorNivel } from '../../lib/marcos'

// Avatar del ranking con el color/patrón del usuario detrás. Si tiene un patrón
// animado, se muestra ESTÁTICO y solo se anima al pasar el mouse (o en el modal
// al abrir el perfil); al quitar el mouse se detiene, para no animar decenas de
// filas a la vez.
function AvatarRanking({ entry, size, esYo }: {
  entry: { avatar_url: string | null; nombre: string; xp: number; color_acento: string | null }
  size: number; esYo: boolean
}) {
  const [hover, setHover] = useState(false)
  const isWeb = Platform.OS === 'web'
  const patron = entry.color_acento ? patronDeAcento(entry.color_acento) : null
  const nivel = calcularNivel(entry.xp)
  // Color plano (si el acento es un color, no un patrón): se usa de fondo.
  const fondoColor = !patron && entry.color_acento?.startsWith('#')
    ? entry.color_acento
    : (esYo ? '#1a1500' : '#111f2e')
  // En la lista solo el COLOR animado (sin figuras): a 44px las figuras se ven
  // amontonadas. Las figuras completas se ven en el modal (header grande).
  const fondoNode = patron
    ? <AnimatedGradientView patron={{ ...patron, figura: undefined }} animate={hover} style={StyleSheet.absoluteFillObject} />
    : undefined
  return (
    <View
      // @ts-ignore eventos de mouse solo en web
      onMouseEnter={isWeb ? () => setHover(true) : undefined}
      // @ts-ignore
      onMouseLeave={isWeb ? () => setHover(false) : undefined}
    >
      <AvatarConMarco
        avatarUrl={entry.avatar_url} nombre={entry.nombre} nivel={nivel}
        size={size} fondo={fondoColor} fondoNode={fondoNode}
      />
    </View>
  )
}

function _parsePresu(txt: string | null | undefined): number | null {
  if (!txt) return null
  const s = String(txt).toLowerCase().replace(/[, $]/g, '')
  const m = s.match(/(\d+(\.\d+)?)\s*(m|k)?/)
  if (!m) return null
  let n = parseFloat(m[1])
  if (isNaN(n)) return null
  const suf = m[3]
  if (suf === 'm') n *= 1_000_000
  else if (suf === 'k') n *= 1_000
  else if (n < 100) n *= 1_000_000
  return n
}
function _formatPresu(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

// El ranking es de PRODUCTIVIDAD: no incluye valera_coins a propósito.
type RankEntry = {
  id: string
  nombre: string
  avatar_url: string | null
  color_acento: string | null
  figura_acento: string | null
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

// ── Ligas (divisiones del ranking mensual, estilo Duolingo) ──────────────────
// Se derivan de la POSICIÓN del mes en curso (sin persistencia): al terminar el
// mes el ranking se reinicia y cada quien cae en su liga según su lugar.
type Liga = { nombre: string; emoji: string; color: string; maxPos: number }
const LIGAS: Liga[] = [
  { nombre: 'Diamante', emoji: '💎', color: '#5aa9f5', maxPos: 3 },
  { nombre: 'Oro',      emoji: '🥇', color: '#c9a84c', maxPos: 10 },
  { nombre: 'Plata',    emoji: '🥈', color: '#9fb3c0', maxPos: 25 },
  { nombre: 'Bronce',   emoji: '🥉', color: '#b0703c', maxPos: Infinity },
]
function ligaDeIndice(idx0: number): Liga {
  const pos = idx0 + 1
  return LIGAS.find(l => pos <= l.maxPos) ?? LIGAS[LIGAS.length - 1]
}

export default function Ranking() {
  const queryClient = useQueryClient()
  const [sel, setSel] = useState<RankEntry | null>(null)
  // Histórico = XP de siempre; Mensual = XP ganado en el mes en curso.
  const [modo, setModo] = useState<'historico' | 'mensual'>('historico')

  // React Query: el ranking cacheado aparece al instante al volver a la pantalla;
  // solo se vuelve a pedir en segundo plano si pasaron >2 min (antes recargaba
  // desde cero en cada foco). getSession() es local (no red) para el userId.
  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['ranking', modo],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: rows } = await supabase.rpc(modo === 'mensual' ? 'get_ranking_mensual' : 'get_ranking')
      return { userId: session?.user?.id ?? null, entries: (rows ?? []) as RankEntry[] }
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'offlineFirst',
  })
  const userId = data?.userId ?? null
  const entries = data?.entries ?? []

  // Presupuesto activo del usuario actual (sus clientes activos)
  const { data: presuData } = useQuery({
    queryKey: ['mi-presupuesto-activo'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return 0
      const { data: rows } = await supabase
        .from('clientes')
        .select('presupuesto, estado')
        .eq('agente_id', session.user.id)
      if (!rows) return 0
      let total = 0
      for (const c of rows) {
        if (c.estado === 'descartado' || c.estado === 'compro' || c.estado === 'compro_externo') continue
        const v = _parsePresu(c.presupuesto)
        if (v != null && v > 0) total += v
      }
      return total
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'offlineFirst',
  })
  const miPresupuesto = presuData ?? 0

  // Jalar para actualizar
  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } catch {} finally { setRefreshing(false) }
  }, [refetch])

  useFocusEffect(useCallback(() => {
    const st = queryClient.getQueryState(['ranking', modo])
    if (!st?.dataUpdatedAt || Date.now() - st.dataUpdatedAt > 1000 * 60 * 2) {
      queryClient.invalidateQueries({ queryKey: ['ranking', modo] })
    }
  }, [queryClient, modo]))

  const miEntry = entries.find(e => e.id === userId)

  // Liga del usuario (solo en modo mensual) + cuánto le falta para subir.
  const miIdx = entries.findIndex(e => e.id === userId)
  const miLiga = modo === 'mensual' && miIdx >= 0 ? ligaDeIndice(miIdx) : null
  let ligaSubirTxt: string | null = null
  if (miLiga && miIdx >= 0) {
    const idxLiga = LIGAS.indexOf(miLiga)
    if (idxLiga <= 0) {
      ligaSubirTxt = '¡Estás en la liga más alta! 🔥'
    } else {
      const ligaArriba = LIGAS[idxLiga - 1]
      const rival = entries[ligaArriba.maxPos - 1]  // último lugar de la liga superior
      if (rival && rival.id !== userId && rival.xp >= miEntry!.xp) {
        const falta = rival.xp - miEntry!.xp + 1
        ligaSubirTxt = `Te faltan ${falta.toLocaleString()} XP para subir a ${ligaArriba.emoji} ${ligaArriba.nombre}`
      } else {
        ligaSubirTxt = `¡Estás a un paso de ${ligaArriba.emoji} ${ligaArriba.nombre}!`
      }
    }
  }

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
        <Text style={s.headerSub}>
          {modo === 'mensual' ? 'Top del mes en curso (se reinicia cada mes)' : 'Top por XP acumulado de siempre'}
        </Text>
      </View>

      {/* Toggle Mensual / Histórico */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, modo === 'mensual' && s.toggleBtnActivo]}
          onPress={() => setModo('mensual')}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleTxt, modo === 'mensual' && s.toggleTxtActivo]}>📅 Mensual</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, modo === 'historico' && s.toggleBtnActivo]}
          onPress={() => setModo('historico')}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleTxt, modo === 'historico' && s.toggleTxtActivo]}>♾️ Histórico</Text>
        </TouchableOpacity>
      </View>

      {modo === 'mensual' && entries.length === 0 && !loading && (
        <Text style={s.emptyHint}>Aún nadie ha ganado XP este mes.</Text>
      )}

      {/* Tu liga del mes (Duolingo) */}
      {miLiga && (
        <View style={[s.ligaBanner, { borderColor: miLiga.color }]}>
          <Text style={[s.ligaEmoji, { color: miLiga.color }]}>{miLiga.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.ligaTitulo}>Liga {miLiga.nombre} · <Text style={{ color: miLiga.color }}>#{miIdx + 1} del mes</Text></Text>
            {ligaSubirTxt && <Text style={s.ligaSub}>{ligaSubirTxt}</Text>}
          </View>
        </View>
      )}
      {modo === 'mensual' && entries.length > 0 && (
        <Text style={s.ligaLeyenda}>💎 Top 3 · 🥇 Top 10 · 🥈 Top 25 · 🥉 resto · se reinicia cada mes</Text>
      )}

      {/* Mi presupuesto activo */}
      {miPresupuesto > 0 && (
        <View style={s.presuBanner}>
          <Text style={s.presuIco}>💵</Text>
          <View>
            <Text style={s.presuNum}>{_formatPresu(miPresupuesto)}</Text>
            <Text style={s.presuLbl}>Mi presupuesto activo en pipeline</Text>
          </View>
        </View>
      )}

      {/* Mi posición (si no está visible en el top) */}
      {miEntry && miEntry.posicion > 10 && (
        <TouchableOpacity style={[s.entryCard, s.miCard]} activeOpacity={0.7} onPress={() => setSel(miEntry)}>
          <Text style={s.posMi}>#{miEntry.posicion}</Text>
          <AvatarRanking entry={miEntry} size={44} esYo />
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

              <AvatarRanking entry={e} size={44} esYo={esYo} />

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
              <AccentBackground acentoId={sel.color_acento || '#1a6470'} figura={sel.figura_acento} style={mp.headerBand} />
              <View style={mp.avWrap}>
                {/* animado: al abrir un perfil su ícono (emoji premium) corre el
                    GIF. En la lista se deja estático por rendimiento. */}
                <AvatarConMarco avatarUrl={sel.avatar_url} nombre={sel.nombre} nivel={nivelSel} size={92} fondo="#122030" animado />
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
  toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center',
    backgroundColor: '#122030', borderWidth: 1.5, borderColor: '#1e3448',
  },
  toggleBtnActivo: { backgroundColor: '#c9a84c22', borderColor: '#c9a84c' },
  toggleTxt: { fontSize: 13, fontWeight: '800', color: '#7a9ab5' },
  toggleTxtActivo: { color: '#c9a84c' },
  ligaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 14, marginTop: 12, padding: 12,
    backgroundColor: '#122030', borderRadius: 13, borderWidth: 1.5,
  },
  ligaEmoji: { fontSize: 30 },
  ligaTitulo: { fontSize: 15, fontWeight: '900', color: '#fff' },
  ligaSub: { fontSize: 12.5, color: '#9fb3c0', marginTop: 2, fontWeight: '600' },
  ligaLeyenda: { fontSize: 11, color: '#5a7085', textAlign: 'center', marginTop: 8, marginHorizontal: 14 },

  presuBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginTop: 10,
    backgroundColor: '#0a2218', borderRadius: 12,
    borderWidth: 1, borderColor: '#10b98144',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  presuIco:  { fontSize: 22 },
  presuNum:  { fontSize: 16, fontWeight: '900', color: '#10b981' },
  presuLbl:  { fontSize: 11, color: '#4a8a6a', marginTop: 1 },

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
