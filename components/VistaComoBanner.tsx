import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { useVistaComo } from '../lib/VistaComo'

const LABEL: Record<string, string> = {
  prospectador: 'Usuario',
  prospectador_plus: 'Usuario Plus',
  supervisor: 'Supervisor',
}

// Barra flotante que indica al admin que está viendo la app como otro rol,
// con botón para salir de la simulación y volver a su app de admin.
export default function VistaComoBanner() {
  const { vistaComo, setVistaComo } = useVistaComo()
  if (!vistaComo) return null
  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.pill}>
        <Text style={s.txt}>👁 Viendo como <Text style={s.bold}>{LABEL[vistaComo] ?? vistaComo}</Text></Text>
        <TouchableOpacity
          style={s.btn}
          onPress={() => { setVistaComo(null); router.replace('/(admin)/propiedades') }}
        >
          <Text style={s.btnTxt}>Salir</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 92 : Platform.OS === 'web' ? 82 : 74,
    left: 0, right: 0, alignItems: 'center', zIndex: 200,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#5e35b1', borderRadius: 24,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  txt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bold: { fontWeight: '900' },
  btn: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
})
