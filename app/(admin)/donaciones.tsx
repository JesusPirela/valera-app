import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type Donacion = {
  id: string; donante_nombre: string | null; tipo: string
  cliente_nombre: string | null; destino_nombre: string | null; creado_at: string
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Donaciones() {
  const c = useColors()
  const [items, setItems] = useState<Donacion[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('get_donaciones_historial')
    setItems((data ?? []) as Donacion[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // Resumen: cuántas ha donado cada persona (Top donadores).
  const topDonadores = Object.entries(
    items.reduce<Record<string, number>>((acc, d) => {
      const n = d.donante_nombre ?? 'Desconocido'
      acc[n] = (acc[n] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Historial de donaciones 🤝</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={[s.vacio, { color: c.textMute }]}>Aún no hay donaciones registradas.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {/* Top donadores */}
          <Text style={[s.seccion, { color: c.textSub }]}>TOP DONADORES</Text>
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, marginBottom: 18 }]}>
            {topDonadores.map(([nombre, n], i) => (
              <View key={nombre} style={[s.topRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
                <Text style={[s.topNombre, { color: c.text }]} numberOfLines={1}>{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{nombre}</Text>
                <Text style={s.topNum}>{n} {n === 1 ? 'donación' : 'donaciones'}</Text>
              </View>
            ))}
          </View>

          {/* Lista */}
          <Text style={[s.seccion, { color: c.textSub }]}>TODAS ({items.length})</Text>
          {items.map(d => (
            <View key={d.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border, marginBottom: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[s.donante, { color: c.text }]}>{d.donante_nombre ?? 'Desconocido'}</Text>
                <View style={[s.tag, d.tipo === 'pool' ? s.tagPool : s.tagDirecto]}>
                  <Text style={[s.tagTxt, { color: d.tipo === 'pool' ? '#0f6b52' : '#334155' }]}>
                    {d.tipo === 'pool' ? '🎁 Al pool' : `👤 ${d.destino_nombre ?? 'directo'}`}
                  </Text>
                </View>
              </View>
              <Text style={[s.cliente, { color: c.textSub }]} numberOfLines={1}>Cliente: {d.cliente_nombre ?? '—'}</Text>
              <Text style={[s.fecha, { color: c.textMute }]}>{fecha(d.creado_at)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === 'web' ? 14 : 44 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  vacio: { textAlign: 'center', marginTop: 60, fontSize: 15 },
  seccion: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  topNombre: { fontSize: 14, fontWeight: '700', flex: 1 },
  topNum: { fontSize: 12.5, fontWeight: '800', color: '#1a6470' },
  donante: { fontSize: 15, fontWeight: '800' },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tagPool: { backgroundColor: '#eefaf5', borderWidth: 1, borderColor: '#b6e3d3' },
  tagDirecto: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  tagTxt: { fontSize: 11, fontWeight: '800' },
  cliente: { fontSize: 13, marginTop: 5 },
  fecha: { fontSize: 11, marginTop: 3 },
})
