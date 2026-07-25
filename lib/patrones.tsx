import { useRef, useEffect, useState } from 'react'
import { View, Animated, Easing, StyleSheet, LayoutChangeEvent, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path, Circle, Rect, Polygon, G } from 'react-native-svg'

// Figuras que pueden caer en un patrón (misma técnica para todas).
export type FiguraTipo = 'casa' | 'llave' | 'edificio' | 'estrella' | 'diamante' | 'corona'

export type PatronAnimado = {
  id: string
  nombre: string
  colores: [string, string, string]
  base: string
  // Si tiene 'figura', se dibujan esas figuras cayendo en diagonal encima del
  // color animado. Si además tiene 'nivel', es RECOMPENSA por nivel (se
  // desbloquea al llegar). Si no, es un patrón de tienda (precio en coins).
  figura?: FiguraTipo
  nivel?: number
  brillo?: boolean   // halo en las figuras (para los de nivel alto)
  color?: string     // color de las figuras (por defecto dorado del logo)
  // Multiplicador de opacidad de las figuras (1 = normal). Se baja cuando las
  // figuras son CLARAS y taparían el texto claro del header (p. ej. diamante).
  figAlpha?: number
  precio?: number    // patrones de tienda; por defecto 300
}

// Colores originales de Valera: el teal por defecto + el dorado del logo.
const VALERA_TEAL = '#1a6470'
const VALERA_ORO  = '#c9a84c'

// Precio de un patrón de tienda (para mostrar). El cobro lo valida el servidor.
export function precioPatron(id: string): number {
  return PATRONES_ANIMADOS.find(p => p.id === id)?.precio ?? 300
}
// Nivel requerido de un patrón-recompensa (0 si no es de nivel).
export function nivelPatron(id: string): number {
  return PATRONES_ANIMADOS.find(p => p.id === id)?.nivel ?? 0
}

// ── FIGURAS por nivel (capa independiente) ──────────────────────────────────
// Las figuras cayendo YA NO van pegadas a un color: son una CAPA que el usuario
// pone encima del fondo que elija (color principal o patrón de tienda). Se
// desbloquean por nivel (más bajos que antes). Cada una trae su color temático.
export type FiguraNivel = {
  id: FiguraTipo
  nombre: string
  nivel: number
  color: string
  brillo?: boolean
  figAlpha?: number
}
export const FIGURAS_NIVEL: FiguraNivel[] = [
  { id: 'casa',     nombre: 'Casas',     nivel: 10, color: VALERA_ORO },
  { id: 'llave',    nombre: 'Llaves',    nivel: 20, color: '#ffd54f' },
  { id: 'edificio', nombre: 'Edificios', nivel: 30, color: '#ce93d8' },
  { id: 'estrella', nombre: 'Estrellas', nivel: 45, color: '#ffe082', brillo: true },
  { id: 'diamante', nombre: 'Diamantes', nivel: 60, color: '#e0f7fa', brillo: true, figAlpha: 0.5 },
  { id: 'corona',   nombre: 'Coronas',   nivel: 80, color: '#ffd700', brillo: true },
]
export function figuraNivelDef(id: string | null | undefined): FiguraNivel | null {
  if (!id) return null
  return FIGURAS_NIVEL.find(f => f.id === id) ?? null
}

export const PATRONES_ANIMADOS: PatronAnimado[] = [
  // Patrones de tienda: SOLO color animado (las figuras van aparte).
  { id: 'aurora',  nombre: 'Aurora',    colores: ['#5c3d99', '#00838f', '#283593'], base: '#5c3d99' },
  { id: 'lava',    nombre: 'Lava',      colores: ['#e65100', '#b71c1c', '#c62828'], base: '#c62828' },
  { id: 'ocean',   nombre: 'Océano',    colores: ['#01579b', '#006064', '#0288d1'], base: '#01579b' },
  { id: 'forest',  nombre: 'Bosque',    colores: ['#1b5e20', '#004d40', '#33691e'], base: '#2e7d32' },
  { id: 'sunset',  nombre: 'Atardecer', colores: ['#ad1457', '#e65100', '#c9a84c'], base: '#e65100' },
  { id: 'galaxy',  nombre: 'Galaxia',   colores: ['#4a148c', '#1a237e', '#311b92'], base: '#4a148c' },
  { id: 'rose',    nombre: 'Rosa',      colores: ['#ad1457', '#880e4f', '#e91e63'], base: '#ad1457' },
  { id: 'arctic',  nombre: 'Ártico',    colores: ['#0097a7', '#0277bd', '#00bcd4'], base: '#0097a7' },
]

// ── Figuras (siluetas doradas) ───────────────────────────────────────────────
// Cada patrón-recompensa deja caer una figura distinta. Se dibujan como silueta
// rellena para que lean bien pequeñas y con opacidad baja.
function trazoFigura(tipo: FiguraTipo, color: string) {
  switch (tipo) {
    case 'casa':
      return <Path d="M12 3.5 L21.5 11.5 L18.8 11.5 L18.8 20.5 L5.2 20.5 L5.2 11.5 L2.5 11.5 Z" fill={color} />
    case 'llave':
      return (
        <G>
          <Circle cx="12" cy="6.5" r="4.2" fill="none" stroke={color} strokeWidth="2.4" />
          <Path d="M12 10.7 L12 21 M12 18 L15.2 18 M12 15.3 L14.6 15.3" stroke={color} strokeWidth="2.3" strokeLinecap="round" fill="none" />
        </G>
      )
    case 'edificio':
      return (
        <G fill={color}>
          <Rect x="3.5" y="10" width="4.2" height="11" rx="0.4" />
          <Rect x="9.9" y="4.5" width="4.4" height="16.5" rx="0.4" />
          <Rect x="16.3" y="8" width="4.2" height="13" rx="0.4" />
        </G>
      )
    case 'estrella':
      return <Polygon points="12,2.6 14.35,9.1 21.2,9.25 15.75,13.5 17.65,20.2 12,16.2 6.35,20.2 8.25,13.5 2.8,9.25 9.65,9.1" fill={color} />
    case 'diamante':
      return <Path d="M7 3.5 H17 L21 9 L12 21.5 L3 9 Z" fill={color} />
    case 'corona':
      return (
        <G fill={color}>
          <Path d="M3 18 L4.6 8 L9 12.8 L12 5.2 L15 12.8 L19.4 8 L21 18 Z" />
          <Rect x="3.5" y="18" width="17" height="2.6" rx="0.6" />
        </G>
      )
  }
}

function Figura({ tipo, size, color, opacity, brillo }: {
  tipo: FiguraTipo; size: number; color: string; opacity: number; brillo?: boolean
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Brillo: una copia más grande y tenue detrás → halo (sin blur, funciona
          igual en web y nativo). */}
      {brillo && (
        <G opacity={opacity * 0.5} transform="translate(12 12) scale(1.35) translate(-12 -12)">
          {trazoFigura(tipo, color)}
        </G>
      )}
      <G opacity={opacity}>{trazoFigura(tipo, color)}</G>
    </Svg>
  )
}

// ── Figuras cayendo (en diagonal) ────────────────────────────────────────────
// Varias figuras caen en diagonal, sin parar, con tamaños y velocidades
// distintas (parallax). Opacidad baja para que el texto del header siga legible.
function FigurasCayendo({ figura, color = VALERA_ORO, brillo, figAlpha = 1, animar = true, densidad = 1 }: {
  figura: FiguraTipo; color?: string; brillo?: boolean; figAlpha?: number; animar?: boolean; densidad?: number
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0 && (width !== dim.w || height !== dim.h)) setDim({ w: width, h: height })
  }

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={onLayout} pointerEvents="none">
      {dim.w > 0 && Array.from({ length: Math.max(5, Math.round(dim.w / 85 * densidad)) }).map((_, i) => (
        <FiguraAnim key={i} idx={i} area={dim} figura={figura} color={color} brillo={brillo} figAlpha={figAlpha} animar={animar} />
      ))}
    </View>
  )
}

// Params deterministas por índice (estables entre renders). Cada figura tiene
// su carril X, tamaño, velocidad y fase inicial.
function FiguraAnim({ idx, area, figura, color, brillo, figAlpha, animar }: {
  idx: number; area: { w: number; h: number }; figura: FiguraTipo; color: string; brillo?: boolean; figAlpha: number; animar: boolean
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
  const opacity = (0.22 + r(5) * 0.22) * figAlpha      // 0.22–0.44, atenuado por figAlpha
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
      <Figura tipo={figura} size={size} color={color} opacity={opacity} brillo={brillo} />
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
    // JS en web / nativo en móvil: en web el driver nativo congela el loop tras
    // una vuelta (mismo motivo que las figuras).
    const nativo = Platform.OS !== 'web'
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: nativo }),
        Animated.timing(anim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: nativo }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [patron.id, animate])

  if (!animate) {
    return (
      <View style={[{ overflow: 'hidden' }, style]}>
        <LinearGradient colors={patron.colores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        {patron.figura && <FigurasCayendo figura={patron.figura} color={patron.color} brillo={patron.brillo} figAlpha={patron.figAlpha} animar={false} />}
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
      {patron.figura && <FigurasCayendo figura={patron.figura} color={patron.color} brillo={patron.brillo} figAlpha={patron.figAlpha} animar />}
      {children}
    </View>
  )
}

// Capa de figuras cayendo, independiente del fondo. Se pone ENCIMA de cualquier
// fondo (color o patrón de tienda).
export function CapaFiguras({ figuraId, animar = true }: { figuraId: string | null | undefined; animar?: boolean }) {
  const f = figuraNivelDef(figuraId)
  if (!f) return null
  return <FigurasCayendo figura={f.id} color={f.color} brillo={f.brillo} figAlpha={f.figAlpha} animar={animar} />
}

export function AccentBackground({ acentoId, figura, animarFigura = true, style, children }: {
  acentoId: string
  // Figura cayendo encima del fondo (id de FIGURAS_NIVEL). Independiente del fondo.
  figura?: string | null
  animarFigura?: boolean
  style?: any
  children?: React.ReactNode
}) {
  const patron = patronDeAcento(acentoId)
  const overlay = figura ? <CapaFiguras figuraId={figura} animar={animarFigura} /> : null
  if (patron) {
    return (
      <AnimatedGradientView patron={patron} style={style}>
        {overlay}
        {children}
      </AnimatedGradientView>
    )
  }
  return (
    <View style={[{ overflow: 'hidden' }, style, { backgroundColor: acentoId }]}>
      {overlay}
      {children}
    </View>
  )
}
