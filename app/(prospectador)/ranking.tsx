import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { calcularNivel, tituloPorNivel } from '../../lib/gamification'

type RankEntry = {
  id: string
  nombre: string
  avatar_url: string | null
  xp: number
  valera_coins: number
  streak_dias: number
  posicion: number
}

function AvatarCircle({ avatarUrl, nombre, size = 42 }: { avatarUrl: string | null; nombre: string; size?: number }) {
  const letra = (nombre ?? '?')[0]?.toUpperCase() ?? '?'
  const isEmoji = avatarUrl?.startsWith('emoji:')
  const emoji   = isEmoji ? avatarUrl!.replace('emoji:', '') : null
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[av.text, { fontSize: emoji ? size * 0.55 : size * 0.45 }]}>
        {emoji ?? letra}
      </Text>
    </View>
  )
}
const av = StyleSheet.create({
  circle: { backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  text:   { fontWeight: '800', color: '#c9a84c' },
})

const MEDAL = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const [userId, setUserId]   = useState<string | null>(null)
  const [entries, setEntries] = useState<RankEntry[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const { data } = await supabase.rpc('get_ranking')
    setEntries((data ?? []) as RankEntry[])
    setLoading(false)
  }

  const miEntry = entries.find(e => e.id === userId)

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🏆 Ranking</Text>
        <Text style={s.headerSub}>Top prospectadores por XP acumulado</Text>
      </View>

      {/* Mi posición (si no está visible en el top) */}
      {miEntry && miEntry.posicion > 10 && (
        <View style={[s.entryCard, s.miCard]}>
          <Text style={s.posMi}>#{miEntry.posicion}</Text>
          <AvatarCircle avatarUrl={miEntry.avatar_url} nombre={miEntry.nombre} />
          <View style={{ flex: 1 }}>
            <Text style={s.entryNombre}>{miEntry.nombre} <Text style={s.tuLabel}>(Tú)</Text></Text>
            <Text style={s.entryTitulo}>{tituloPorNivel(calcularNivel(miEntry.xp))}</Text>
          </View>
          <View style={s.entryRight}>
            <Text style={s.entryXP}>{miEntry.xp.toLocaleString()} XP</Text>
            <Text style={s.entryStreak}>🔥 {miEntry.streak_dias}d</Text>
          </View>
        </View>
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
            <View key={e.id} style={[s.entryCard, esYo && s.miCard]}>
              {/* Posición */}
              <View style={s.posWrap}>
                {medal
                  ? <Text style={s.medalText}>{medal}</Text>
                  : <Text style={[s.posNum, esYo && { color: '#c9a84c' }]}>#{e.posicion}</Text>
                }
              </View>

              <AvatarCircle avatarUrl={e.avatar_url} nombre={e.nombre} />

              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.entryNombre, esYo && { color: '#c9a84c' }]} numberOfLines={1}>
                  {e.nombre}{esYo ? ' 👈' : ''}
                </Text>
                <Text style={s.entryTitulo}>{tituloPorNivel(nivel)} · Nv. {nivel}</Text>
              </View>

              <View style={s.entryRight}>
                <Text style={s.entryXP}>{e.xp.toLocaleString()} XP</Text>
                {e.streak_dias > 0 && (
                  <Text style={s.entryStreak}>🔥 {e.streak_dias}d</Text>
                )}
              </View>
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

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
  tuLabel:      { color: GOLD, fontSize: 11 },

  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryXP:    { fontSize: 13, fontWeight: '800', color: '#fff' },
  entryStreak:{ fontSize: 12, color: '#7a9ab5' },

  emptyBox: { alignItems: 'center', padding: 60 },
  emptyTxt: { fontSize: 16, color: '#556a7a', fontWeight: '600', marginBottom: 6 },
  emptyHint:{ fontSize: 13, color: '#3a5060' },
})
