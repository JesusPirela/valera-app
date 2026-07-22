import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, ScrollView } from 'react-native'

type Rol = 'prospectador' | 'prospectador_plus'

const INFO: Record<Rol, {
  emoji: string
  titulo: string
  subtitulo: string
  beneficios: string[]
  color: string
  colorSub: string
}> = {
  prospectador: {
    emoji: '🎉',
    titulo: '¡Eres Prospectador!',
    subtitulo: 'Ya formas parte del equipo activo de Valera.',
    color: '#1a6470',
    colorSub: 'rgba(26,100,112,0.15)',
    beneficios: [
      '🏠 Publicar y gestionar propiedades',
      '👥 Registrar hasta 10 clientes al mes',
      '⚡ Completar misiones y ganar XP',
      '🔥 Construir tu racha diaria',
      '🏆 Participar en el ranking del equipo',
      '💰 Ganar Valera Coins y canjearlos en la Tienda',
    ],
  },
  prospectador_plus: {
    emoji: '🚀',
    titulo: '¡Eres Prospectador Plus!',
    subtitulo: 'Nivel desbloqueado. Más herramientas, más alcance.',
    color: '#7c3aed',
    colorSub: 'rgba(124,58,237,0.15)',
    beneficios: [
      '👥 Registrar hasta 20 clientes al mes',
      '🤖 Acceso al Chatbot de calificación de leads',
      '📊 Estadísticas avanzadas de tu actividad',
      '⭐ XP y coins con multiplicador Plus',
      '🎁 Cofres y premios exclusivos',
      '🔓 Todo lo que tenías antes, amplificado',
    ],
  },
}

export default function AscensoRolModal({
  rol,
  onClose,
}: {
  rol: Rol | null
  onClose: () => void
}) {
  const escala  = useRef(new Animated.Value(0.7)).current
  const opacidad = useRef(new Animated.Value(0)).current
  const giro    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!rol) return
    escala.setValue(0.7)
    opacidad.setValue(0)
    giro.setValue(0)
    Animated.parallel([
      Animated.spring(escala,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(opacidad, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(giro, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(giro, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        { iterations: 4 },
      ),
    ]).start()
  }, [rol])

  if (!rol) return null
  const info = INFO[rol]
  const balanceo = giro.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] })

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { opacity: opacidad }]}>
        <Animated.View style={[s.card, { borderColor: info.color, transform: [{ scale: escala }] }]}>
          <Animated.Text style={[s.emoji, { transform: [{ rotate: balanceo }] }]}>
            {info.emoji}
          </Animated.Text>

          <Text style={[s.titulo, { color: info.color }]}>{info.titulo}</Text>
          <Text style={s.subtitulo}>{info.subtitulo}</Text>

          <View style={[s.beneficiosBox, { backgroundColor: info.colorSub }]}>
            <Text style={[s.beneficiosTitulo, { color: info.color }]}>Lo que ahora tienes:</Text>
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {info.beneficios.map((b, i) => (
                <Text key={i} style={s.beneficio}>{b}</Text>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={[s.btn, { backgroundColor: info.color }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.btnTxt}>¡Vamos a por ello! {info.emoji}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0d1b2a',
    borderWidth: 2,
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  emoji: { fontSize: 64, marginBottom: 4 },
  titulo: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitulo: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  beneficiosBox: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  beneficiosTitulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  beneficio: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginBottom: 7, lineHeight: 18 },
  btn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
})
