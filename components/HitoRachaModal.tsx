import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from 'react-native'
import type { HitoRacha } from '../lib/gamification'

// Celebración al llegar a un hito de racha (7, 15, 30, 45, 60, 100, 180, 365).
// Lo que no se celebra, no se persigue: la racha tiene que SENTIRSE, no solo
// contarse. Se muestra una sola vez por hito (el servidor lleva la cuenta).
export default function HitoRachaModal({ hito, onClose }: { hito: HitoRacha | null; onClose: () => void }) {
  const escala = useRef(new Animated.Value(0.6)).current
  const giro   = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!hito) return
    escala.setValue(0.6)
    giro.setValue(0)
    Animated.parallel([
      Animated.spring(escala, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(giro, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(giro, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ),
    ]).start()
  }, [hito])

  if (!hito) return null

  const balanceo = giro.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] })

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.card, { transform: [{ scale: escala }] }]}>
          <Animated.Text style={[s.llama, { transform: [{ rotate: balanceo }] }]}>🔥</Animated.Text>

          <Text style={s.dias}>{hito.dias}</Text>
          <Text style={s.titulo}>
            {hito.dias >= 365 ? '¡UN AÑO ENTERO!'
              : hito.dias >= 100 ? '¡Racha legendaria!'
              : hito.dias >= 30 ? '¡Racha imparable!'
              : '¡Racha en llamas!'}
          </Text>
          <Text style={s.sub}>
            {hito.dias} días seguidos cumpliendo tu meta. Muy pocos llegan aquí.
          </Text>

          <View style={s.premios}>
            <View style={s.premio}>
              <Text style={s.premioVal}>+{hito.coins.toLocaleString()}</Text>
              <Text style={s.premioLbl}>💰 Valera Coins</Text>
            </View>
            {hito.protectores > 0 && (
              <View style={s.premio}>
                <Text style={s.premioVal}>+{hito.protectores}</Text>
                <Text style={s.premioLbl}>🛡️ Protector{hito.protectores > 1 ? 'es' : ''}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={s.btn} onPress={onClose}>
            <Text style={s.btnTxt}>¡Seguir así! 🔥</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#1a1200', borderWidth: 2, borderColor: '#c9a84c',
    borderRadius: 22, padding: 26, alignItems: 'center', width: '100%', maxWidth: 340,
  },
  llama: { fontSize: 70 },
  dias: { fontSize: 54, fontWeight: '900', color: '#c9a84c', lineHeight: 58 },
  titulo: { fontSize: 19, fontWeight: '900', color: '#fff', marginTop: 2, textAlign: 'center' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  premios: { flexDirection: 'row', gap: 14, marginTop: 18 },
  premio: {
    backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', minWidth: 110,
  },
  premioVal: { fontSize: 20, fontWeight: '900', color: '#c9a84c' },
  premioLbl: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  btn: {
    backgroundColor: '#c9a84c', borderRadius: 12, paddingVertical: 13,
    paddingHorizontal: 30, marginTop: 22, width: '100%', alignItems: 'center',
  },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 15 },
})
