import { TouchableOpacity, Text, Platform } from 'react-native'
import { router } from 'expo-router'

// Botón "atrás". Prefiere router.back() para respetar el historial real de
// navegación (evita duplicados en el historial del navegador). Solo usa
// router.replace(to) cuando no hay historial al que volver (deep links).
export default function HeaderBack({ color = '#c9a84c', to, alwaysReplace }: { color?: string; to?: string; alwaysReplace?: boolean }) {
  const puede = router.canGoBack()
  if (!to && !puede) return null
  const onPress = () => {
    if (to && alwaysReplace) router.replace(to as any)
    else if (puede) router.back()
    else if (to) router.replace(to as any)
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
