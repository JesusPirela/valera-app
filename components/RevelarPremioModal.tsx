import { useEffect, useRef } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Image, Platform } from 'react-native'
import { AnimatedGradientView, type PatronAnimado } from '../lib/patrones'
import type { AvatarPremium } from '../lib/avatares'
import { playOpen, playWin } from '../lib/sounds'

// Revelado animado de un premio de la tienda que se entrega al instante
// (avatar animado o patrón de color al azar). No es la ruleta del cofre: es un
// "pop" con destello para que el random se sienta un premio y no un trámite.
export function RevelarPremioModal({ visible, tipo, avatar, patron, onClose }: {
  visible: boolean
  tipo: 'avatar' | 'color'
  avatar?: AvatarPremium | null
  patron?: PatronAnimado | null
  onClose: () => void
}) {
  const scale = useRef(new Animated.Value(0)).current
  const glow  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) { scale.setValue(0); glow.setValue(0); return }
    try { playOpen() } catch {}
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => { try { playWin() } catch {} })
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    ).start()
  }, [visible])

  const nombre = tipo === 'avatar' ? (avatar?.nombre ?? 'Avatar') : (patron?.nombre ?? 'Color')
  const glowRadius = glow.interpolate({ inputRange: [0, 1], outputRange: [10, 34] })

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.card}>
          <Text style={st.tituloSmall}>✨ ¡Desbloqueaste un{tipo === 'avatar' ? ' avatar' : ' color'} nuevo! ✨</Text>

          <Animated.View style={[st.discoWrap, {
            transform: [{ scale }],
            shadowRadius: glowRadius as any,
            shadowColor: '#c9a84c', shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 },
          }]}>
            {tipo === 'avatar' && avatar ? (
              <View style={st.disco}>
                <Image source={{ uri: avatar.gif }} style={{ width: 96, height: 96 }} />
              </View>
            ) : patron ? (
              <View style={st.disco}>
                <AnimatedGradientView patron={patron} style={StyleSheet.absoluteFillObject} />
              </View>
            ) : null}
          </Animated.View>

          <Text style={st.nombre}>{nombre}</Text>
          <Text style={st.sub}>Ya está disponible en tu perfil 🎉</Text>

          <TouchableOpacity style={st.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={st.btnTxt}>¡Genial!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,10,20,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#0f2233', borderRadius: 22, padding: 26, alignItems: 'center',
    width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#c9a84c55',
  },
  tituloSmall: { color: '#c9a84c', fontWeight: '800', fontSize: 14, textAlign: 'center', marginBottom: 22 },
  discoWrap: { marginBottom: 18, borderRadius: 80, elevation: 12 },
  disco: {
    width: 132, height: 132, borderRadius: 66, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#12304a',
    borderWidth: 3, borderColor: '#c9a84c',
  },
  nombre: { color: '#fff', fontWeight: '900', fontSize: 22, marginBottom: 4, textAlign: 'center' },
  sub: { color: '#8fb0c9', fontSize: 13, marginBottom: 22, textAlign: 'center' },
  btn: { backgroundColor: '#c9a84c', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 44 },
  btnTxt: { color: '#0f2233', fontWeight: '900', fontSize: 15 },
})
