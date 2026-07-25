import { useRef, useEffect, useState } from 'react'
import { View, Animated, Easing, StyleSheet, LayoutChangeEvent, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'

export type PatronAnimado = {
  id: string
  nombre: string
  colores: [string, string, string]
  base: string
  // 'casas' dibuja casitas cayendo (en diagonal) encima del gradiente.
  casas?: boolean
  // Precio en Valera Coins (por defecto 300). El servidor es el que cobra.
  precio?: number
}

// Colores originales de Valera: el teal por defecto + el dorado del logo.
const VALERA_TEAL = '#1a6470'
const VALERA_ORO  = '#c9a84c'

// Precio de un patrón (para mostrar). El cobro real lo valida el servidor.
export function precioPatron(id: string): number {
  return PATRONES_ANIMADOS.find(p => p.id === id)?.precio ?? 300
}

export const PATRONES_ANIMADOS: PatronAnimado[] = [
  // El patrón de la casa: colores originales y casitas cayendo. Cuesta 100.
  { id: 'valera',  nombre: 'Valera',    colores: [VALERA_TEAL, '#134e57', VALERA_TEAL], base: VALERA_TEAL, casas: true, precio: 100 },
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

// ── Casitas cayendo (en diagonal) ────────────────────────────────────────────
// Varias casitas doradas caen en diagonal, sin parar, con tamaños y velocidades
// distintas (parallax). Opacidad baja para que el texto del header siga legible.
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
      {dim.w > 0 && Array.from({ length: Math.max(5, Math.round(dim.w / 85 * densidad)) }).map((_, i) => (
        <CasitaAnim key={i} idx={i} area={dim} color={color} animar={animar} />
      ))}
    </View>
  )
}

// Params deterministas por índice (estables entre renders). Cada casita tiene
// su carril X, tamaño, velocidad y fase inicial.
function CasitaAnim({ idx, area, color, animar }: {
  idx: number; area: { w: number; h: number }; color: string; animar: boolean
}) {
  const prog = useRef(new Animated.Value(0)).current
  // "Ruido" reproducible a partir del índice.
  const r = (n: number) => { const x = Math.sin(idx * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x) }
  // 3x más grandes que antes (antes 12–24): ahora 36–72 px, escalado al alto del
  // contenedor para que en las miniaturas del perfil no queden desproporcionadas.
  const escala = Math.min(1, area.h / 64)
  const size = Math.round((36 + r(1) * 36) * escala)
  const dur = 5000 + Math.round(r(3) * 4000)          // 5–9 s (parallax)
  const fase = r(4)                                    // 0–1: arranque escalonado
  const opacity = 0.22 + r(5) * 0.22                   // visible pero legible: 0.22–0.44
  // Caída DIAGONAL: recorre toda la altura y se desplaza de lado ~la mitad del
  // alto. Se arranca desde una X que ya descuenta ese desplazamiento para cubrir
  // todo el ancho de forma pareja.
  const deriva = area.h * 0.6
  const xIni = Math.round(-deriva + r(2) * (area.w + deriva))

  useEffect(() => {
    // Fase inicial estática. Se estabiliza aunque no anime (miniaturas).
    prog.setValue(animar ? 0 : 0.35)
    if (!animar) return
    // Nunca dejan de caer: bucle continuo SIN 'delay' interno (el delay dentro
    // de Animated.loop dejaba huecos y a la larga parecía que se detenían). El
    // desfase entre casitas se logra arrancando cada una tras 'fase*dur' una
    // sola vez; ya en el bucle, reinicia de arriba al instante (sin hueco).
    //
    // OJO web: react-native-web NO soporta useNativeDriver con Animated.loop —
    // la caída corría UNA vez y se congelaba (justo el "después de un rato dejan
    // de caer"). En web se usa el driver JS, que sí reinicia el bucle. En nativo
    // se deja el driver nativo (más fluido).
    const nativo = Platform.OS !== 'web'
    let loop: Animated.CompositeAnimation | null = null
    const t = setTimeout(() => {
      loop = Animated.loop(
        Animated.timing(prog, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: nativo, isInteraction: false }),
      )
      loop.start()
    }, Math.round(fase * dur))
    return () => { clearTimeout(t); loop?.stop() }
  }, [animar, area.w, area.h])

  const translateY = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [-size - 4, area.h + size + 4],        // entra por arriba, sale por abajo
  })
  const translateX = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [0, deriva],                           // se desplaza de lado → diagonal
  })

  return (
    <Animated.View style={{ position: 'absolute', left: xIni, transform: [{ translateX }, { translateY }] }}>
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
