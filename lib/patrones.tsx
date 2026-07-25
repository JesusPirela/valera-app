import { useRef, useEffect, useState } from 'react'
import { View, Animated, Easing, StyleSheet, LayoutChangeEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'

export type PatronAnimado = {
  id: string
  nombre: string
  colores: [string, string, string]
  base: string
  // 'casas' dibuja casitas cayendo (arriba→abajo) encima del gradiente.
  casas?: boolean
  // 'gratis' = disponible sin comprar (no gasta monedas).
  gratis?: boolean
}

// Colores originales de Valera: el teal por defecto + el dorado del logo.
const VALERA_TEAL = '#1a6470'
const VALERA_ORO  = '#c9a84c'

export const PATRONES_ANIMADOS: PatronAnimado[] = [
  // El patrón de la casa: colores originales y casitas cayendo. Gratis.
  { id: 'valera',  nombre: 'Valera',    colores: [VALERA_TEAL, '#134e57', VALERA_TEAL], base: VALERA_TEAL, casas: true, gratis: true },
  { id: 'aurora',  nombre: 'Aurora',    colores: ['#5c3d99', '#00838f', '#283593'], base: '#5c3d99' },
  { id: 'lava',    nombre: 'Lava',      colores: ['#e65100', '#b71c1c', '#c62828'], base: '#c62828' },
  { id: 'ocean',   nombre: 'Océano',    colores: ['#01579b', '#006064', '#0288d1'], base: '#01579b' },
  { id: 'forest',  nombre: 'Bosque',    colores: ['#1b5e20', '#004d40', '#33691e'], base: '#2e7d32' },
  { id: 'sunset',  nombre: 'Atardecer', colores: ['#ad1457', '#e65100', '#c9a84c'], base: '#e65100' },
  { id: 'galaxy',  nombre: 'Galaxia',   colores: ['#4a148c', '#1a237e', '#311b92'], base: '#4a148c' },
  { id: 'rose',    nombre: 'Rosa',      colores: ['#ad1457', '#880e4f', '#e91e63'], base: '#ad1457' },
  { id: 'arctic',  nombre: 'Ártico',    colores: ['#0097a7', '#0277bd', '#00bcd4'], base: '#0097a7' },
]

// ── Casita dorada (silueta estilo logo) ──────────────────────────────────────
function Casita({ size, color, opacity }: { size: number; color: string; opacity: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Silueta simple: techo a dos aguas + cuerpo. */}
      <Path
        d="M12 3.5 L21.5 11.5 L18.8 11.5 L18.8 20.5 L5.2 20.5 L5.2 11.5 L2.5 11.5 Z"
        fill={color}
        opacity={opacity}
      />
    </Svg>
  )
}

// ── Casitas cayendo ──────────────────────────────────────────────────────────
// Varias casitas doradas caen de arriba a abajo en bucle, con tamaños,
// velocidades y posiciones distintas (efecto parallax). Opacidad baja para que
// el texto del header siga legible. Usa el driver nativo (solo translateY).
function CasitasCayendo({ color = VALERA_ORO, animar = true, densidad = 1 }: {
  color?: string; animar?: boolean; densidad?: number
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0 && (width !== dim.w || height !== dim.h)) setDim({ w: width, h: height })
  }

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={onLayout} pointerEvents="none">
      {dim.w > 0 && Array.from({ length: Math.max(3, Math.round(dim.w / 46 * densidad)) }).map((_, i) => (
        <CasitaAnim key={i} idx={i} area={dim} color={color} animar={animar} />
      ))}
    </View>
  )
}

// Params deterministas por índice (estables entre renders, sin Math.random en
// cada pintado). Cada casita tiene su carril X, tamaño, duración y desfase.
function CasitaAnim({ idx, area, color, animar }: {
  idx: number; area: { w: number; h: number }; color: string; animar: boolean
}) {
  const prog = useRef(new Animated.Value(0)).current
  // "Ruido" reproducible a partir del índice.
  const r = (n: number) => { const x = Math.sin(idx * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
  const size = 12 + Math.round(r(1) * 12)             // 12–24 px
  const x = Math.round(r(2) * Math.max(1, area.w - size))
  const dur = 4200 + Math.round(r(3) * 3800)          // 4.2–8 s (parallax)
  const delay = Math.round(r(4) * dur)
  const opacity = 0.12 + r(5) * 0.16                  // sutil: 0.12–0.28

  useEffect(() => {
    prog.setValue(0)
    if (!animar) { prog.setValue(0.4); return }       // quieto: a media caída
    const loop = Animated.loop(
      Animated.timing(prog, { toValue: 1, duration: dur, delay, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [animar, area.w, area.h])

  const translateY = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [-size - 4, area.h + size + 4],       // entra por arriba, sale por abajo
  })

  return (
    <Animated.View style={{ position: 'absolute', left: x, transform: [{ translateY }] }}>
      <Casita size={size} color={color} opacity={opacity} />
    </Animated.View>
  )
}

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
        {patron.casas && <CasitasCayendo animar={false} />}
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
      {patron.casas && <CasitasCayendo animar />}
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
