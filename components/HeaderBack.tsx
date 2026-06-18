import { TouchableOpacity, Text, Platform } from 'react-native'
import { useNavigation, router } from 'expo-router'

// Botón "atrás" para el header de los navegadores (Stack admin y Tabs prospectador).
// - Sin `to`: usa navigation.goBack() (correcto en el Stack del admin).
// - Con `to`: navega explícitamente a esa ruta. En el navegador de Tabs el
//   goBack() salta a la pestaña inicial (propiedades), así que las pantallas de
//   detalle que viven en Tabs (ej. detalle-cliente) deben pasar su destino real.
export default function HeaderBack({ color = '#c9a84c', to }: { color?: string; to?: string }) {
  const navigation = useNavigation()
  const puede = typeof (navigation as any).canGoBack === 'function' ? (navigation as any).canGoBack() : false
  if (!to && !puede) return null
  const onPress = () => {
    if (to) router.replace(to as any)
    else navigation.goBack()
  }
  return (
    <TouchableOpacity
      onPress={onPress}
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
