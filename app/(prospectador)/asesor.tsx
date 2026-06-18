import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useColors } from '../../lib/ThemeContext'

const ITEMS = [
  { label: 'CRM y Pipeline comercial', desc: 'Clientes y prospectos de todo el equipo, por etapa', icon: '📒', route: '/(admin)/crm', color: '#D84315' },
  { label: 'Citas y seguimiento', desc: 'Coordinación de citas, incluidas las ya atendidas', icon: '📅', route: '/(admin)/coordinacion-citas', color: '#2E7D32' },
  { label: 'Mis estadísticas', desc: 'Tu desempeño: leads, cierres y actividad', icon: '📊', route: '/(prospectador)/asesor-estadisticas?modo=propio', color: '#1565c0' },
  { label: 'Estadísticas de equipo', desc: 'Desempeño de todo el equipo de prospectadores', icon: '📈', route: '/(prospectador)/asesor-estadisticas?modo=equipo', color: '#00838F' },
]

export default function Asesor() {
  const c = useColors()

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={[styles.titulo, { color: c.text }]}>Asesor</Text>
      <Text style={[styles.subtitulo, { color: c.textSub }]}>
        Herramientas adicionales de atención a clientes y seguimiento comercial.
      </Text>

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
})
