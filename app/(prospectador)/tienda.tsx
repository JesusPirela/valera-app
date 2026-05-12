import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { comprarItem } from '../../lib/gamification'

type StoreItem = {
  id: string
  nombre: string
  descripcion: string
  costo_coins: number
  tipo: string
  disponible: boolean
  stock: number | null
  icono: string
  orden: number
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Tienda', msg)
}

export default function Tienda() {
  const [userId, setUserId]     = useState<string | null>(null)
  const [coins, setCoins]       = useState(0)
  const [items, setItems]       = useState<StoreItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [comprando, setComprando] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [statsRes, itemsRes] = await Promise.all([
      supabase.from('user_stats').select('valera_coins').eq('id', user.id).maybeSingle(),
      supabase.from('store_items').select('*').eq('disponible', true).order('orden'),
    ])

    setCoins(statsRes.data?.valera_coins ?? 0)
    setItems((itemsRes.data ?? []) as StoreItem[])
    setLoading(false)
  }

  async function handleCompra(item: StoreItem) {
    if (!userId) return
    if (coins < item.costo_coins) {
      alerta(`Necesitas ${item.costo_coins} Valera Coins. Tienes ${coins}.`)
      return
    }
    setComprando(item.id)
    const { ok, error } = await comprarItem(userId, item.id, item.nombre, item.costo_coins)
    setComprando(null)

    if (ok) {
      setCoins(prev => prev - item.costo_coins)
      alerta(`¡Compraste "${item.nombre}"! 🎉\nEl equipo de Valera te contactará para entregar tu recompensa.`)
    } else {
      alerta(error ?? 'Error al procesar la compra')
    }
  }

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Tienda Valera</Text>
          <Text style={s.headerSub}>Convierte tu productividad en recompensas</Text>
        </View>
        <View style={s.coinsBadge}>
          <Text style={s.coinsIcn}>💰</Text>
          <Text style={s.coinsVal}>{coins.toLocaleString()}</Text>
        </View>
      </View>

      <Text style={s.hint}>
        💡 Tras comprar, el equipo de Valera te contactará para entregar tu recompensa.
      </Text>

      {/* Items */}
      <View style={s.grid}>
        {items.map(item => {
          const puedePagar = coins >= item.costo_coins
          const cargando   = comprando === item.id
          return (
            <View key={item.id} style={s.card}>
              <View style={s.cardIconWrap}>
                <Text style={s.cardIcon}>{item.icono}</Text>
              </View>
              <Text style={s.cardNombre}>{item.nombre}</Text>
              <Text style={s.cardDesc} numberOfLines={2}>{item.descripcion}</Text>
              <View style={s.cardBottom}>
                <View style={s.costBadge}>
                  <Text style={s.costTxt}>{item.costo_coins.toLocaleString()} 💰</Text>
                </View>
                <TouchableOpacity
                  style={[s.buyBtn, !puedePagar && s.buyBtnDisabled]}
                  onPress={() => handleCompra(item)}
                  disabled={!puedePagar || !!comprando}
                >
                  {cargando
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.buyBtnTxt}>{puedePagar ? 'Canjear' : 'Sin saldo'}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </View>

      {/* Cómo ganar coins */}
      <View style={s.howCard}>
        <Text style={s.howTitle}>¿Cómo ganar Valera Coins?</Text>
        {[
          ['🏠', 'Publicar propiedad',      '+2 coins'],
          ['👤', 'Agregar cliente al CRM',  '+5 coins'],
          ['✅', 'Completar seguimiento',   '+3 coins'],
          ['💬', 'Registrar interacción',   '+2 coins'],
          ['📅', 'Agendar cita',            '+10 coins'],
          ['🎉', 'Cerrar venta',            '+50 coins'],
          ['📚', 'Completar lección',       '+5 coins'],
          ['🔥', 'Acceso diario',           '+5 coins'],
          ['🎯', 'Completar misión',        'bonus coins'],
        ].map(([icn, txt, val]) => (
          <View key={txt} style={s.howRow}>
            <Text style={s.howIcn}>{icn}</Text>
            <Text style={s.howTxt}>{txt}</Text>
            <Text style={s.howVal}>{val}</Text>
          </View>
        ))}
      </View>

    </ScrollView>
  )
}

const DARK = '#0d1b2a'
const CARD = '#111f2e'
const GOLD = '#c9a84c'

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, backgroundColor: '#122030',
    borderBottomWidth: 1, borderBottomColor: '#1e3448',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#7a9ab5', marginTop: 2 },
  coinsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1a1500', borderRadius: 20, borderWidth: 1, borderColor: GOLD,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  coinsIcn: { fontSize: 18 },
  coinsVal: { fontSize: 16, fontWeight: '800', color: GOLD },

  hint: { fontSize: 12, color: '#556a7a', paddingHorizontal: 16, paddingVertical: 10, lineHeight: 18 },

  grid: { padding: 12, gap: 12 },
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e3448',
  },
  cardIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1500',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  cardIcon:   { fontSize: 26 },
  cardNombre: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 4 },
  cardDesc:   { fontSize: 12, color: '#7a9ab5', lineHeight: 17, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  costBadge: { backgroundColor: '#1a1500', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  costTxt:   { color: GOLD, fontSize: 13, fontWeight: '700' },
  buyBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  buyBtnDisabled: { backgroundColor: '#2a3a4a', opacity: 0.7 },
  buyBtnTxt: { color: '#1a1000', fontWeight: '800', fontSize: 13 },

  howCard: {
    backgroundColor: CARD, borderRadius: 16, margin: 16,
    padding: 16, borderWidth: 1, borderColor: '#1e3448',
  },
  howTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 12 },
  howRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1a2d3e' },
  howIcn: { fontSize: 18, width: 28 },
  howTxt: { flex: 1, fontSize: 13, color: '#c0d0dc' },
  howVal: { fontSize: 13, fontWeight: '700', color: GOLD },
})
