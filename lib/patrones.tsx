import { useRef, useEffect } from 'react'
import { View, Animated, Easing, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

export type PatronAnimado = {
  id: string
  nombre: string
  colores: [string, string, string]
  base: string
}

export const PATRONES_ANIMADOS: PatronAnimado[] = [
  { id: 'aurora',  nombre: 'Aurora',    colores: ['#5c3d99', '#00838f', '#283593'], base: '#5c3d99' },
  { id: 'lava',    nombre: 'Lava',      colores: ['#e65100', '#b71c1c', '#c62828'], base: '#c62828' },
  { id: 'ocean',   nombre: 'Océano',    colores: ['#01579b', '#006064', '#0288d1'], base: '#01579b' },
  { id: 'forest',  nombre: 'Bosque',    colores: ['#1b5e20', '#004d40', '#33691e'], base: '#2e7d32' },
  { id: 'sunset',  nombre: 'Atardecer', colores: ['#ad1457', '#e65100', '#c9a84c'], base: '#e65100' },
  { id: 'galaxy',  nombre: 'Galaxia',   colores: ['#4a148c', '#1a237e', '#311b92'], base: '#4a148c' },
  { id: 'rose',    nombre: 'Rosa',      colores: ['#ad1457', '#880e4f', '#e91e63'], base: '#ad1457' },
  { id: 'arctic',  nombre: 'Ártico',    colores: ['#0097a7', '#0277bd', '#00bcd4'], base: '#0097a7' },
]

export function baseColorDeAcento(acento: string): string {
  if (acento.startsWith('animated:')) {
    const id = acento.replace('animated:', '')
    return PATRONES_ANIMADOS.find(p => p.id === id)?.base ?? '#1a6470'
  }
  return acento
}

export function patronDeAcento(acento: string): PatronAnimado | null {
  if (!acento.startsWith('animated:')) return null
  return PATRONES_ANIMADOS.find(p => p.id === acento.replace('animated:', '')) ?? null
}

export function AnimatedGradientView({ patron, style, children, animate = true }: {
  patron: PatronAnimado
  style?: any
  children?: React.ReactNode
  // Cuando es false NO corre el loop de animación: solo pinta el gradiente base
  // (mismos colores, quieto). Sirve para grillas con muchos patrones a la vez
  // —p. ej. el perfil con todo desbloqueado— donde animar todos a la vez
  // satura el hilo de UI. El llamador anima solo el seleccionado.
  animate?: boolean
}) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!animate) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [patron.id, animate])

  if (!animate) {
    return (
      <View style={[{ overflow: 'hidden' }, style]}>
        <LinearGradient colors={patron.colores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        {children}
      </View>
    )
  }

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <LinearGradient colors={patron.colores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: anim }]}>
        <LinearGradient colors={[patron.colores[2], patron.colores[0], patron.colores[1]]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      {children}
    </View>
  )
}

export function AccentBackground({ acentoId, style, children }: {
  acentoId: string
  style?: any
  children?: React.ReactNode
}) {
  const patron = patronDeAcento(acentoId)
  if (patron) return <AnimatedGradientView patron={patron} style={style}>{children}</AnimatedGradientView>
  return <View style={[style, { backgroundColor: acentoId }]}>{children}</View>
}
