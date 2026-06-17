import { TouchableOpacity, Text, Platform } from 'react-native'
import { useNavigation } from 'expo-router'

// Botón "atrás" para el header de los navegadores (Stack admin y Tabs prospectador).
// Usa navigation.goBack(), que regresa a la pantalla anterior SIN remontarla —
// así se conserva su estado y la posición de scroll. Se oculta solo cuando no
// hay a dónde volver (pantalla raíz).
export default function HeaderBack({ color = '#c9a84c' }: { color?: string }) {
  const navigation = useNavigation()
  const puede = typeof (navigation as any).canGoBack === 'function' ? (navigation as any).canGoBack() : false
  if (!puede) return null
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 6,
        marginLeft: Platform.OS === 'web' ? 8 : 4,
        flexDirection: 'row',
        alignItems: 'center',
      }}
      accessibilityLabel="Volver"
    >
      <Text style={{ color, fontSize: 26, fontWeight: '800', lineHeight: 28, marginRight: 2 }}>‹</Text>
      <Text style={{ color, fontSize: 15, fontWeight: '700' }}>Atrás</Text>
    </TouchableOpacity>
  )
}
