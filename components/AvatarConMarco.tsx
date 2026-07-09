import { View, Text, Image, StyleSheet } from 'react-native'
import { marcoPorNivel } from '../lib/marcos'

// Emojis premium → GIF animado de Noto (mismo mapa que perfil/ranking).
const NOTO = (hex: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`
const GIF_MAP: Record<string, string> = {
  '🔥': NOTO('1f525'), '⚡': NOTO('26a1'), '🌈': NOTO('1f308'), '🦋': NOTO('1f98b'),
  '🐉': NOTO('1f409'), '🦄': NOTO('1f984'), '👑': NOTO('1f451'), '💫': NOTO('1f4ab'),
  '🌸': NOTO('1f338'), '🔮': NOTO('1f52e'), '🌊': NOTO('1f30a'), '🏆': NOTO('1f3c6'),
  '🎉': NOTO('1f389'), '✨': NOTO('2728'),  '🦁': NOTO('1f981'), '🐺': NOTO('1f43a'),
}

type Props = {
  avatarUrl: string | null
  nombre: string
  nivel: number
  size?: number
  /** Anima el GIF del emoji premium (solo donde valga la pena: perfil propio). */
  animado?: boolean
  /** Fondo del hueco del avatar (para que el marco se lea recortado). */
  fondo?: string
}

/**
 * Avatar con marco por nivel. Muestra, en este orden:
 *  foto de perfil → emoji premium (GIF/PNG de Noto) → emoji simple → inicial.
 * El marco es puramente visual y sale del nivel; no hay estado extra que guardar.
 */
export default function AvatarConMarco({
  avatarUrl, nombre, nivel, size = 72, animado = false, fondo = '#0d1b2a',
}: Props) {
  const marco = marcoPorNivel(nivel)
  const borde = Math.max(2, Math.round(size * 0.055))
  const interior = size - borde * 2

  const esFoto = !!avatarUrl && /^https?:\/\//.test(avatarUrl)
  const emoji = avatarUrl?.startsWith('emoji:') ? avatarUrl.replace('emoji:', '') : null
  const gif = emoji ? GIF_MAP[emoji] : null

  return (
    <View
      style={[
        s.marco,
        {
          width: size, height: size, borderRadius: size / 2,
          borderWidth: borde, borderColor: marco.color,
          // Halo suave en los marcos altos (diamante en adelante).
          ...(marco.brillo
            ? { shadowColor: marco.color, shadowOpacity: 0.85, shadowRadius: size * 0.16, shadowOffset: { width: 0, height: 0 }, elevation: 8 }
            : null),
        },
      ]}
    >
      {/* Aro interior: da el acabado metálico sin cambiar el layout */}
      <View
        style={[
          s.interior,
          {
            width: interior, height: interior, borderRadius: interior / 2,
            backgroundColor: fondo,
            borderWidth: marco.colorInterior ? Math.max(1, Math.round(size * 0.02)) : 0,
            borderColor: marco.colorInterior ?? 'transparent',
          },
        ]}
      >
        {esFoto ? (
          <Image source={{ uri: avatarUrl! }} style={{ width: interior, height: interior }} resizeMode="cover" />
        ) : gif ? (
          <Image
            // Estático salvo que se pida animado: decodificar muchos GIFs a la vez
            // es lo que hacía lento el perfil con todo desbloqueado.
            source={{ uri: animado ? gif : gif.replace('512.gif', '512.png') }}
            style={{ width: interior * 0.72, height: interior * 0.72 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={{ fontSize: interior * (emoji ? 0.55 : 0.44), fontWeight: '800', color: '#c9a84c' }}>
            {emoji ?? (nombre?.[0]?.toUpperCase() ?? '?')}
          </Text>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  marco: { alignItems: 'center', justifyContent: 'center' },
  interior: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})
