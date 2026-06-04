import { useState, useEffect, useRef } from 'react'
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  Platform, Animated, Easing, ActivityIndicator,
} from 'react-native'
import { BlurView } from 'expo-blur'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Premio = {
  id: string
  nombre: string
  icono: string
  tipo: string
  prob_cofre: number
  prob_milestone: number
}

export type RuletaConfig = {
  costo: number
  premios: Premio[]
}

// ── Config por defecto ───────────────────────────────────────────────────────

export const CONFIG_DEFAULT: RuletaConfig = {
  costo: 100,
  premios: [
    { id: 'sorteo',    nombre: 'Entrada sorteo',  icono: '🎟️', tipo: 'sorteo',        prob_cofre: 30,   prob_milestone: 35   },
    { id: 'plantilla', nombre: 'Pack plantillas',  icono: '📋', tipo: 'plantilla',      prob_cofre: 22,   prob_milestone: 25   },
    { id: 'boost',     nombre: 'Boost 3 días',     icono: '🚀', tipo: 'boost',          prob_cofre: 18,   prob_milestone: 20   },
    { id: 'lead_meta', nombre: 'Lead Meta Ads',    icono: '📱', tipo: 'lead_meta',      prob_cofre: 13,   prob_milestone: 12   },
    { id: 'curso',     nombre: 'Acceso curso',     icono: '🎓', tipo: 'curso_premium',  prob_cofre: 10,   prob_milestone: 6    },
    { id: 'lead_prem', nombre: 'Lead Premium',     icono: '⭐', tipo: 'lead_premium',   prob_cofre: 5,    prob_milestone: 1.5  },
    { id: 'merch',     nombre: 'Merch Valera',     icono: '👕', tipo: 'merch',          prob_cofre: 1.5,  prob_milestone: 0.4  },
    { id: 'comision',  nombre: 'Comisión extra',   icono: '💰', tipo: 'comision_extra', prob_cofre: 0.5,  prob_milestone: 0.1  },
  ],
}

// ── Rareza según probabilidad (estilo CSGO) ───────────────────────────────────

export function rarityColor(prob: number): string {
  if (prob >= 20) return '#9ea4b0'  // gris  - común
  if (prob >= 12) return '#4b69ff'  // azul  - poco común
  if (prob >= 5)  return '#8847ff'  // morado - raro
  if (prob >= 2)  return '#d32ce6'  // rosa  - clasificado
  if (prob >= 1)  return '#eb4b4b'  // rojo  - encubierto
  return '#e4ae39'                   // dorado - rareza especial
}

export function rarityLabel(prob: number): string {
  if (prob >= 20) return 'Común'
  if (prob >= 12) return 'Poco común'
  if (prob >= 5)  return 'Raro'
  if (prob >= 2)  return 'Clasificado'
  if (prob >= 1)  return 'Encubierto'
  return '★ Rareza especial'
}

// ── Sorteo ───────────────────────────────────────────────────────────────────

export function sortearPremio(premios: Premio[], esMilestone: boolean): Premio {
  const rand = Math.random() * 100
  let acum = 0
  for (const p of premios) {
    acum += esMilestone ? p.prob_milestone : p.prob_cofre
    if (rand <= acum) return p
  }
  return premios[0]
}

// ── Milestone storage ────────────────────────────────────────────────────────

const MILESTONE_KEY = '@valera_milestone_celebrado'

export async function checkMilestone(nivelActual: number): Promise<number | null> {
  if (nivelActual < 10 || nivelActual % 10 !== 0) return null
  try {
    let ultimo = 0
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      ultimo = parseInt(localStorage.getItem(MILESTONE_KEY) ?? '0')
    } else {
      const raw = await AsyncStorage.getItem(MILESTONE_KEY)
      ultimo = parseInt(raw ?? '0')
    }
    if (nivelActual > ultimo) {
      const val = String(nivelActual)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(MILESTONE_KEY, val)
      } else {
        await AsyncStorage.setItem(MILESTONE_KEY, val)
      }
      return nivelActual
    }
    return null
  } catch { return null }
}

// ── Constantes de animación ──────────────────────────────────────────────────

const ITEM_W      = 82
const ITEM_GAP    = 4
const ITEM_TOTAL  = ITEM_W + ITEM_GAP
const STRIP_W     = 500
const WINNER_IDX  = 40
const STRIP_LEN   = 52

const END_X = -(WINNER_IDX * ITEM_TOTAL + ITEM_W / 2) + STRIP_W / 2

// Dimensiones del cofre
const CHEST_W   = 210
const CHEST_H   = 155
const LID_INNER = 52
const HINGE_H   = 7
const LID_H     = LID_INNER + HINGE_H

function buildStrip(premios: Premio[], winner: Premio): Premio[] {
  return Array.from({ length: STRIP_LEN }, (_, i) =>
    i === WINNER_IDX
      ? winner
      : premios[Math.floor(Math.random() * premios.length)]
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

type Fase = 'listo' | 'abriendo' | 'girando' | 'resultado'

interface Props {
  visible: boolean
  esMilestone?: boolean
  nivel?: number
  premios?: Premio[]
  costoGirar?: number
  puedePagar?: boolean
  onConfirmarAbrir?: () => Promise<boolean>  // descuenta coins; retorna false si no pudo
  onClose: () => void
  onGanar: (premio: Premio) => void
  onGirarOtraVez?: () => void
}

export function RuletaModal({
  visible, esMilestone = false, nivel,
  premios: premiosProp, costoGirar, puedePagar = true,
  onConfirmarAbrir,
  onClose, onGanar, onGirarOtraVez,
}: Props) {
  const premios = premiosProp ?? CONFIG_DEFAULT.premios

  const [fase, setFase]           = useState<Fase>('listo')
  const [strip, setStrip]         = useState<Premio[]>([])
  const [ganador, setGanador]     = useState<Premio | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const scrollX    = useRef(new Animated.Value(0)).current
  const chestScale = useRef(new Animated.Value(1)).current
  const chestRot   = useRef(new Animated.Value(0)).current
  const glowOpac   = useRef(new Animated.Value(0)).current
  // Animaciones del cofre estilo CSGO
  const lidY       = useRef(new Animated.Value(0)).current
  const lidOpac    = useRef(new Animated.Value(1)).current
  const flashOpac  = useRef(new Animated.Value(0)).current
  const glowAnim   = useRef(new Animated.Value(0)).current
  const glowLoop   = useRef<Animated.CompositeAnimation | null>(null)

  function startGlowLoop() {
    glowLoop.current?.stop()
    glowAnim.setValue(0.2)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1,   duration: 1100, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.2, duration: 1100, useNativeDriver: true }),
      ])
    )
    glowLoop.current = loop
    loop.start()
  }

  function resetAll() {
    glowLoop.current?.stop()
    glowLoop.current = null
    scrollX.setValue(0)
    chestScale.setValue(1)
    chestRot.setValue(0)
    glowOpac.setValue(0)
    lidY.setValue(0)
    lidOpac.setValue(1)
    flashOpac.setValue(0)
    glowAnim.setValue(0)
  }

  useEffect(() => {
    if (!visible) {
      setFase('listo')
      setStrip([])
      setGanador(null)
      resetAll()
      setConfirmando(false)
    } else {
      startGlowLoop()
    }
  }, [visible])

  const chestRotInterp = chestRot.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] })

  async function abrirCofre() {
    // Confirmar pago solo para cofres (no milestone)
    if (onConfirmarAbrir && !esMilestone) {
      setConfirmando(true)
      const ok = await onConfirmarAbrir()
      setConfirmando(false)
      if (!ok) return
    }
    glowLoop.current?.stop()
    setFase('abriendo')

    Animated.sequence([
      // Vibración
      Animated.timing(chestRot,   { toValue:  1,   duration: 65,  useNativeDriver: true }),
      Animated.timing(chestRot,   { toValue: -1,   duration: 65,  useNativeDriver: true }),
      Animated.timing(chestRot,   { toValue:  1,   duration: 65,  useNativeDriver: true }),
      Animated.timing(chestRot,   { toValue:  0,   duration: 65,  useNativeDriver: true }),
      // Escala up
      Animated.timing(chestScale, { toValue: 1.1,  duration: 180, useNativeDriver: true }),
      // Flash
      Animated.timing(flashOpac,  { toValue: 0.85, duration: 90,  useNativeDriver: true }),
      // Tapa vuela hacia arriba + flash se desvanece
      Animated.parallel([
        Animated.timing(lidY,      { toValue: -110, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lidOpac,   { toValue: 0,    duration: 320, useNativeDriver: true }),
        Animated.timing(flashOpac, { toValue: 0,    duration: 420, useNativeDriver: true }),
        Animated.timing(glowAnim,  { toValue: 0,    duration: 420, useNativeDriver: true }),
      ]),
      // Cofre desaparece
      Animated.timing(chestScale, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => iniciarGiro())
  }

  function iniciarGiro() {
    const winner   = sortearPremio(premios, esMilestone)
    const newStrip = buildStrip(premios, winner)
    setStrip(newStrip)
    setGanador(winner)
    scrollX.setValue(0)
    setFase('girando')

    Animated.timing(scrollX, {
      toValue:  END_X,
      duration: 6500,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpac, { toValue: 1,   duration: 500, useNativeDriver: true }),
          Animated.timing(glowOpac, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        ]),
        { iterations: 4 }
      ).start(() => glowOpac.setValue(1))

      setFase('resultado')
      onGanar(winner)
    })
  }

  function girarOtraVez() {
    setGanador(null)
    setStrip([])
    scrollX.setValue(0)
    glowOpac.setValue(0)
    chestScale.setValue(1)
    chestRot.setValue(0)
    lidY.setValue(0)
    lidOpac.setValue(1)
    flashOpac.setValue(0)
    setFase('listo')
    startGlowLoop()
    onGirarOtraVez?.()
  }

  const titulo = esMilestone ? `🏆 ¡Nivel ${nivel}!` : 'Cofre Valera'
  const sub    = esMilestone
    ? `Premio especial por alcanzar el nivel ${nivel}`
    : 'Abre el cofre y descubre tu recompensa'

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={cs.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={cs.card} onPress={() => {}}>

          {/* Cerrar */}
          <TouchableOpacity style={cs.closeBtn} onPress={onClose}>
            <Text style={cs.closeTxt}>✕</Text>
          </TouchableOpacity>

          <Text style={cs.titulo}>{titulo}</Text>
          <Text style={cs.sub}>{sub}</Text>

          {/* ── Fase: cofre cerrado / abriendo ── */}
          {(fase === 'listo' || fase === 'abriendo') && (
            <View style={cs.chestArea}>
              {/* Contenedor cofre + glow */}
              <View style={cs.chestAndGlow}>
                {/* Anillo de glow que pulsa */}
                <Animated.View style={[cs.glowRing, { opacity: glowAnim }]} pointerEvents="none" />

                {/* Cofre animado */}
                <Animated.View style={[cs.chestOuter, {
                  transform: [{ scale: chestScale }, { rotate: chestRotInterp }],
                }]}>
                  {/* Cuerpo del cofre (siempre visible, debajo de la tapa) */}
                  <View style={cs.chestBody}>
                    {/* Banda dorada en la unión tapa-cuerpo */}
                    <View style={cs.chestBandMid} />
                    {/* Centro con logo */}
                    <View style={cs.chestCenter}>
                      <Text style={cs.chestHex}>⬡</Text>
                      <Text style={cs.chestBrand}>VALERA</Text>
                    </View>
                    {/* Línea decorativa inferior */}
                    <View style={cs.chestBandBot} />
                  </View>

                  {/* Tapa del cofre (vuela hacia arriba al abrir) */}
                  <Animated.View style={[cs.chestLid, {
                    transform: [{ translateY: lidY }],
                    opacity: lidOpac,
                  }]}>
                    <View style={cs.lidBody}>
                      <Text style={cs.lidTitle}>
                        {esMilestone ? 'PREMIO ESPECIAL' : 'COFRE MISTERIOSO'}
                      </Text>
                      <View style={cs.lidRidge} />
                    </View>
                    {/* Bisagra dorada (línea inferior de la tapa) */}
                    <View style={cs.lidHinge} />
                  </Animated.View>

                  {/* Flash blanco-dorado al abrirse */}
                  <Animated.View
                    style={[cs.chestFlash, { opacity: flashOpac }]}
                    pointerEvents="none"
                  />
                </Animated.View>
              </View>

              {fase === 'listo' && (
                <TouchableOpacity
                  style={[cs.openBtn, confirmando && { opacity: 0.7 }]}
                  onPress={abrirCofre}
                  disabled={confirmando}
                >
                  {confirmando
                    ? <ActivityIndicator color={DARK} size="small" />
                    : <Text style={cs.openBtnTxt}>
                        {esMilestone ? '★  ABRIR PREMIO  ★' : 'ABRIR COFRE'}
                      </Text>
                  }
                </TouchableOpacity>
              )}
              {fase === 'abriendo' && (
                <Text style={cs.openingTxt}>Abriendo...</Text>
              )}
            </View>
          )}

          {/* ── Fase: girando / resultado ── */}
          {(fase === 'girando' || fase === 'resultado') && strip.length > 0 && (
            <View style={cs.stripWrap}>
              {/* Punteros dorados */}
              <View style={cs.pointerTop}><View style={cs.pointerTriTop} /></View>
              <View style={cs.pointerBot}><View style={cs.pointerTriBot} /></View>

              {/* Tira de items */}
              <View style={cs.stripClip}>
                <Animated.View style={[cs.stripRow, { transform: [{ translateX: scrollX }] }]}>
                  {strip.map((p, i) => {
                    const prob  = esMilestone ? p.prob_milestone : p.prob_cofre
                    const color = rarityColor(prob)
                    const isWin = fase === 'resultado' && i === WINNER_IDX
                    return (
                      <View
                        key={i}
                        style={[
                          cs.stripItem,
                          { borderColor: color + '99' },
                          isWin && cs.stripItemWin,
                          isWin && { borderColor: color },
                        ]}
                      >
                        {isWin && (
                          <Animated.View style={[cs.winGlow, { opacity: glowOpac, backgroundColor: color + '30' }]} />
                        )}
                        <View style={[cs.stripRarity, { backgroundColor: color }]} />
                        <Text style={cs.stripIcn}>{p.icono}</Text>
                        <Text style={[cs.stripNom, { color }]} numberOfLines={2}>{p.nombre}</Text>
                      </View>
                    )
                  })}
                </Animated.View>

                {/* Blur lateral izquierdo */}
                <BlurView intensity={80} tint="dark" style={cs.fadeLeft} pointerEvents="none" />
                {/* Blur lateral derecho */}
                <BlurView intensity={80} tint="dark" style={cs.fadeRight} pointerEvents="none" />
              </View>
            </View>
          )}

          {/* ── Fase: resultado — card ganador ── */}
          {fase === 'resultado' && ganador && (
            <View style={cs.resultCard}>
              <View style={[cs.resultRarityBar, {
                backgroundColor: rarityColor(esMilestone ? ganador.prob_milestone : ganador.prob_cofre),
              }]} />
              <Text style={cs.resultIcn}>{ganador.icono}</Text>
              <Text style={[cs.resultRarity, {
                color: rarityColor(esMilestone ? ganador.prob_milestone : ganador.prob_cofre),
              }]}>
                {rarityLabel(esMilestone ? ganador.prob_milestone : ganador.prob_cofre)}
              </Text>
              <Text style={cs.resultNom}>{ganador.nombre}</Text>
              <Text style={cs.resultSub}>El equipo Valera te lo entregará pronto 🎁</Text>

              <View style={cs.resultBtns}>
                {onGirarOtraVez && !esMilestone && (
                  <TouchableOpacity
                    style={[cs.otraVezBtn, !puedePagar && cs.btnDis]}
                    onPress={girarOtraVez}
                    disabled={!puedePagar}
                  >
                    <Text style={cs.otraVezTxt}>
                      🎁 Otra vez{costoGirar ? ` · ${costoGirar} 💰` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={cs.cerrarBtn} onPress={onClose}>
                  <Text style={cs.cerrarTxt}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const DARK  = '#0f1923'
const DARK2 = '#16202d'
const DARK3 = '#1b2838'
const CARD  = '#1e2d3d'
const GOLD  = '#c9a84c'
const TEXT  = '#c6d4df'

const cs = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    width: '100%', maxWidth: 540, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a475e',
  },
  closeBtn: { position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 6 },
  closeTxt: { color: '#7a9ab5', fontSize: 16, fontWeight: '700' },
  titulo:   { fontSize: 20, fontWeight: '900', color: GOLD, marginBottom: 2 },
  sub:      { fontSize: 12, color: TEXT, marginBottom: 18, textAlign: 'center', opacity: 0.7 },

  // ── Área del cofre ──
  chestArea: { alignItems: 'center', paddingVertical: 8, gap: 20 },

  // Contenedor con glow ring detrás del cofre
  chestAndGlow: {
    width: CHEST_W + 26,
    height: CHEST_H + 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: GOLD,
  },

  // Contenedor del cofre animado
  chestOuter: {
    width: CHEST_W,
    height: CHEST_H,
  },

  // Cuerpo del cofre (fondo completo)
  chestBody: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: DARK2,
    borderWidth: 2, borderColor: GOLD,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Banda dorada en la posición de la unión tapa-cuerpo
  chestBandMid: {
    position: 'absolute',
    top: LID_INNER,
    left: 0, right: 0,
    height: HINGE_H,
    backgroundColor: GOLD,
  },
  chestCenter: { alignItems: 'center', marginTop: HINGE_H + 8 },
  chestHex:    { fontSize: 38, color: GOLD },
  chestBrand:  { fontSize: 9, fontWeight: '900', color: GOLD, letterSpacing: 4, marginTop: 4 },
  chestBandBot: {
    position: 'absolute',
    bottom: 13, left: 18, right: 18,
    height: 1.5, backgroundColor: GOLD + '55',
  },

  // Tapa (parte superior que vuela al abrir)
  chestLid: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  lidBody: {
    height: LID_INNER,
    backgroundColor: DARK3,
    borderWidth: 2, borderColor: GOLD,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10, borderTopRightRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    gap: 7,
  },
  lidTitle: {
    fontSize: 8, fontWeight: '900',
    color: GOLD + 'bb', letterSpacing: 2.5,
  },
  lidRidge: {
    width: 80, height: 1.5,
    backgroundColor: GOLD + '44', borderRadius: 1,
  },
  // Bisagra dorada (línea inferior de la tapa)
  lidHinge: { height: HINGE_H, backgroundColor: GOLD },

  // Flash dorado-blanco al abrir
  chestFlash: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#e8d488',
    borderRadius: 10,
  },

  openBtn: {
    backgroundColor: GOLD, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 48,
  },
  openBtnTxt: { color: DARK, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  openingTxt: { color: TEXT, fontSize: 14, opacity: 0.6 },

  // ── Strip de items ──
  stripWrap: {
    width: '100%', alignItems: 'center', marginBottom: 12,
    position: 'relative',
  },
  pointerTop: { position: 'absolute', top: -1, left: '50%', marginLeft: -8, zIndex: 10 },
  pointerBot: { position: 'absolute', bottom: -1, left: '50%', marginLeft: -8, zIndex: 10 },
  pointerTriTop: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: GOLD,
  },
  pointerTriBot: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 14,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: GOLD,
  },
  stripClip: {
    width: STRIP_W, overflow: 'hidden',
    backgroundColor: DARK,
    borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#2a475e',
    position: 'relative',
  },
  // Degradados laterales — ocultan los items lejanos al centro
  fadeLeft: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    width: 170, zIndex: 5,
  },
  fadeRight: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: 170, zIndex: 5,
  },
  stripRow: { flexDirection: 'row', paddingVertical: 6, gap: ITEM_GAP },
  stripItem: {
    width: ITEM_W, height: 115,
    backgroundColor: DARK3, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 3, overflow: 'hidden',
    position: 'relative',
  },
  stripItemWin: { borderWidth: 2 },
  winGlow:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stripRarity:  { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  stripIcn:     { fontSize: 30, marginBottom: 4 },
  stripNom: {
    fontSize: 9, textAlign: 'center', fontWeight: '700',
    lineHeight: 12, paddingHorizontal: 4,
  },

  // ── Resultado ──
  resultCard: {
    width: '100%', backgroundColor: DARK2, borderRadius: 12,
    alignItems: 'center', overflow: 'hidden', marginTop: 4,
    borderWidth: 1, borderColor: '#2a475e',
  },
  resultRarityBar: { width: '100%', height: 4 },
  resultIcn:       { fontSize: 48, marginTop: 14, marginBottom: 4 },
  resultRarity: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  },
  resultNom:  { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 4, textAlign: 'center' },
  resultSub:  { fontSize: 11, color: TEXT, opacity: 0.6, marginBottom: 14 },

  resultBtns: { width: '100%', flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#2a475e' },
  otraVezBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#1a2b3c', borderRightWidth: 1, borderRightColor: '#2a475e',
  },
  otraVezTxt: { color: GOLD, fontSize: 13, fontWeight: '800' },
  cerrarBtn:  { flex: 1, paddingVertical: 14, alignItems: 'center' },
  cerrarTxt:  { color: TEXT, fontSize: 13, fontWeight: '600', opacity: 0.7 },
  btnDis:     { opacity: 0.35 },
})
