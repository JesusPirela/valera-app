import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { calcularCrmMetricas, type CrmMetricas } from '../../lib/crmMetricas'
import CrmMetricasPanel from '../../components/CrmMetricasPanel'

type Modo = 'propio' | 'equipo'

export default function AsesorEstadisticas() {
  const c = useColors()
  const { modo: modoParam } = useLocalSearchParams<{ modo?: string }>()
  const [modo, setModo] = useState<Modo>(modoParam === 'equipo' ? 'equipo' : 'propio')
  const [metricas, setMetricas] = useState<CrmMetricas | null>(null)
  const [loading, setLoading] = useState(true)

  async function cargar(m: Modo) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const resultado = await calcularCrmMetricas(
      m === 'propio' ? (user?.id ?? null) : null,
      m === 'propio' ? 'Mis estadísticas' : 'Equipo completo'
    )
    setMetricas(resultado)
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar(modo) }, [modo]))

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(prospectador)/asesor')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

      <Text style={[styles.titulo, { color: c.text }]}>Estadísticas</Text>

      <View style={[styles.toggleRow, { borderColor: c.border }]}>
        <TouchableOpacity
          style={[styles.toggleBtn, modo === 'propio' && { backgroundColor: '#1a6470' }]}
          onPress={() => setModo('propio')}
        >
          <Text style={[styles.toggleTxt, { color: modo === 'propio' ? '#fff' : c.textMute }]}>Mías</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, modo === 'equipo' && { backgroundColor: '#1a6470' }]}
          onPress={() => setModo('equipo')}
        >
          <Text style={[styles.toggleTxt, { color: modo === 'equipo' ? '#fff' : c.textMute }]}>Equipo</Text>
        </TouchableOpacity>
      </View>

      {loading || !metricas ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <CrmMetricasPanel metricas={metricas} c={c} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { alignSelf: 'flex-start', marginTop: 16, marginLeft: 16, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 22, fontWeight: '800', marginHorizontal: 16, marginTop: 8 },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  toggleTxt: { fontSize: 13, fontWeight: '700' },
})
