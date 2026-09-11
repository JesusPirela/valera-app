import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const ITEMS = [
  { label: 'CRM y Pipeline comercial', desc: 'Clientes y prospectos de todo el equipo, por etapa', icon: '📒', route: '/(admin)/crm', color: '#D84315' },
  { label: 'Mis citas', desc: 'Las citas que te asignaron · agrégalas y da seguimiento', icon: '📅', route: '/(prospectador)/asesor-citas', color: '#2E7D32' },
  { label: 'Mis estadísticas', desc: 'Tu desempeño: leads, cierres y actividad', icon: '📊', route: '/(prospectador)/asesor-estadisticas?modo=propio', color: '#1565c0' },
  { label: 'Estadísticas de equipo', desc: 'Desempeño de todo el equipo de prospectadores', icon: '📈', route: '/(prospectador)/asesor-estadisticas?modo=equipo', color: '#00838F' },
]

export default function Asesor() {
  const c = useColors()
  const [pendientes, setPendientes] = useState<number | null>(null)

  useFocusEffect(useCallback(() => {
    supabase.rpc('get_mis_citas_pendientes_retro').then(({ data }) => setPendientes((data ?? []).length))
  }, []))

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={[styles.titulo, { color: c.text }]}>Asesor</Text>
      <Text style={[styles.subtitulo, { color: c.textSub }]}>
        Herramientas adicionales de atención a clientes y seguimiento comercial.
      </Text>

      {/* Retroalimentaciones pendientes: siempre visible para que lo encuentren.
          Se resalta cuando hay citas por responder. */}
      <TouchableOpacity
        style={[
          styles.card, styles.retroCard,
          { backgroundColor: c.card, borderColor: (pendientes ?? 0) > 0 ? '#c9a84c' : c.border },
        ]}
        onPress={() => router.push('/(prospectador)/mis-retros')}
        activeOpacity={0.85}
      >
        <View style={[styles.iconWrap, { backgroundColor: (pendientes ?? 0) > 0 ? '#c9a84c' : '#8a7a3a' }]}>
          <Text style={styles.icon}>📝</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitulo, { color: c.text }]}>Cuéntanos cómo te fue</Text>
          <Text style={[styles.cardDesc, { color: c.textSub }]}>
            {pendientes == null ? 'Retroalimentación de tus citas atendidas'
              : pendientes === 0 ? '¡Estás al día! No tienes citas por responder 🎉'
              : `Tienes ${pendientes} cita${pendientes !== 1 ? 's' : ''} por responder · 3 preguntas rápidas`}
          </Text>
        </View>
        {(pendientes ?? 0) > 0
          ? <View style={styles.badge}><Text style={styles.badgeTxt}>{pendientes}</Text></View>
          : <Text style={[styles.chevron, { color: c.textMute }]}>›</Text>}
      </TouchableOpacity>

      {ITEMS.map(item => (
        <TouchableOpacity
          key={item.route}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => router.push(item.route as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.iconWrap, { backgroundColor: item.color }]}>
            <Text style={styles.icon}>{item.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitulo, { color: c.text }]}>{item.label}</Text>
            <Text style={[styles.cardDesc, { color: c.textSub }]}>{item.desc}</Text>
          </View>
          <Text style={[styles.chevron, { color: c.textMute }]}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titulo: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitulo: { fontSize: 13, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 22 },
  cardTitulo: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardDesc: { fontSize: 12 },
  chevron: { fontSize: 24, fontWeight: '300' },
  retroCard: { borderWidth: 1.5 },
  badge: { backgroundColor: '#e53935', borderRadius: 13, minWidth: 26, height: 26, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
})
