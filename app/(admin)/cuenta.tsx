import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useColors } from '../../lib/ThemeContext'
import { useVistaComo, type RolSimulado } from '../../lib/VistaComo'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'
import CambiarCuenta from '../../components/CambiarCuenta'

const VISTAS: { rol: Exclude<RolSimulado, null>; label: string; desc: string; icon: string; color: string }[] = [
  { rol: 'prospectador',      label: 'Ver como Usuario',      desc: 'Vista de un prospectador normal',         icon: '🙍', color: '#1976D2' },
  { rol: 'prospectador_plus', label: 'Ver como Usuario Plus', desc: 'Incluye propiedades exclusivas',          icon: '⭐', color: '#7B1FA2' },
  { rol: 'supervisor',        label: 'Ver como Supervisor',   desc: 'Con el apartado de Supervisión',          icon: '🛡️', color: '#00838F' },
]

export default function Cuenta() {
  useSupervisorBlock()
  const c = useColors()
  const { vistaComo, setVistaComo } = useVistaComo()

  function verComo(rol: Exclude<RolSimulado, null>) {
    setVistaComo(rol)
    router.replace('/(prospectador)/propiedades')
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: c.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
        <Text style={s.backTxt}>← Volver</Text>
      </TouchableOpacity>

      <Text style={[s.titulo, { color: c.text }]}>Cuenta</Text>

      {/* Cambiar de cuenta (si hay 2+ en el dispositivo) */}
      <CambiarCuenta />

      {/* Ver como rol */}
      <Text style={[s.seccion, { color: c.textMute }]}>VER LA APP COMO OTRO ROL</Text>
      <Text style={[s.sub, { color: c.textMute }]}>
        Mira exactamente lo que ve cada rol (contenido filtrado). Sales con el botón flotante "Salir".
      </Text>
      {VISTAS.map(v => {
        const activo = vistaComo === v.rol
        return (
          <TouchableOpacity
            key={v.rol}
            style={[s.card, { backgroundColor: c.card, borderColor: activo ? v.color : c.border }, activo && { borderWidth: 2 }]}
            onPress={() => verComo(v.rol)}
            activeOpacity={0.85}
          >
            <View style={[s.iconWrap, { backgroundColor: v.color }]}><Text style={s.icon}>{v.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitulo, { color: c.text }]}>{v.label}</Text>
              <Text style={[s.cardDesc, { color: c.textSub }]}>{v.desc}</Text>
            </View>
            {activo ? <Text style={[s.activoTxt, { color: v.color }]}>● Activo</Text> : <Text style={[s.chevron, { color: c.textMute }]}>›</Text>}
          </TouchableOpacity>
        )
      })}

      {vistaComo && (
        <TouchableOpacity style={s.salirBtn} onPress={() => setVistaComo(null)}>
          <Text style={s.salirTxt}>Salir de la vista simulada</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  backTxt: { color: '#1a6470', fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  seccion: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 18, marginBottom: 4, marginLeft: 2 },
  sub: { fontSize: 12, marginBottom: 12, marginLeft: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 12, gap: 14,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  cardTitulo: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardDesc: { fontSize: 12 },
  chevron: { fontSize: 24, fontWeight: '300' },
  activoTxt: { fontSize: 12, fontWeight: '800' },
  salirBtn: {
    marginTop: 8, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#c0392b',
  },
  salirTxt: { color: '#c0392b', fontSize: 15, fontWeight: '700' },
})
