import { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, Platform, type ViewStyle, type StyleProp } from 'react-native'
import { useColors } from '../lib/ThemeContext'

// Bloque "esqueleto": el gris que se ve mientras carga el contenido real, con un
// latido suave. Da sensación de velocidad (percepción) frente a una ruedita
// girando. Puro JS: viaja por OTA.
export function SkeletonBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors()
  const op = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(op, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [op])

  return <Animated.View style={[{ backgroundColor: c.border, borderRadius: 8, opacity: op }, style]} />
}

// Tarjeta-esqueleto con la forma de una tarjeta de propiedad del inicio.
export function SkeletonCardPropiedad() {
  const c = useColors()
  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <SkeletonBox style={{ width: '100%', height: 170, borderRadius: 10 }} />
      <SkeletonBox style={{ width: '55%', height: 16, marginTop: 12 }} />
      <SkeletonBox style={{ width: '80%', height: 13, marginTop: 8 }} />
      <View style={s.fila}>
        <SkeletonBox style={{ width: 90, height: 26, borderRadius: 13 }} />
        <SkeletonBox style={{ width: 70, height: 26, borderRadius: 13 }} />
        <SkeletonBox style={{ width: 70, height: 26, borderRadius: 13 }} />
      </View>
      <View style={[s.fila, { marginTop: 12 }]}>
        <SkeletonBox style={{ width: 120, height: 20 }} />
        <SkeletonBox style={{ width: 90, height: 30, borderRadius: 15 }} />
      </View>
    </View>
  )
}

// Varias tarjetas-esqueleto (para la pantalla de inicio mientras carga).
export function SkeletonListaPropiedades({ n = 3 }: { n?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 8 }}>
      {Array.from({ length: n }).map((_, i) => <SkeletonCardPropiedad key={i} />)}
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  fila: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
})
