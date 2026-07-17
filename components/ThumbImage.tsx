import { useState, memo } from 'react'
import { ImageStyle, StyleProp } from 'react-native'
import { Image } from 'expo-image'
import { thumb, ThumbOpts } from '../lib/img'

type Props = {
  url: string | null | undefined
  opts?: ThumbOpts
  style?: StyleProp<ImageStyle>
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center'
  // Cuando es true, la imagen adopta la PROPORCIÓN REAL de la foto (medida al
  // cargar). Así se ve completa y llenando el ancho, sin barras ni recorte: una
  // foto vertical se muestra alta, una horizontal ancha. Se acota entre
  // minAspect y maxAspect para que ninguna quede absurdamente alta o como tira.
  autoAspect?: boolean
  minAspect?: number   // proporción (ancho/alto) mínima; p.ej. 0.72 = no tan alta
  maxAspect?: number   // proporción máxima; p.ej. 1.6 = no tan ancha/tira
  onRatio?: (ratio: number) => void
}

export const ThumbImage = memo(function ThumbImage({
  url, opts, style, resizeMode = 'cover',
  autoAspect = false, minAspect = 0.72, maxAspect = 1.6, onRatio,
}: Props) {
  // Si la miniatura transformada falla (red/CDN que bloquea /render/image, cuota
  // agotada, etc.) se cae a la imagen original. Se compara contra la URL
  // transformada actual para que el fallback se reinicie solo al cambiar de
  // imagen (tarjetas recicladas en listas no quedan pegadas en fallback).
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const [ratio, setRatio] = useState<number | null>(null)
  if (!url) return null
  const transformada = thumb(url, opts) ?? url
  const src = erroredSrc === transformada ? url : transformada
  return (
    <Image
      source={{ uri: src }}
      style={[style, autoAspect && ratio ? { aspectRatio: ratio } : null]}
      contentFit={resizeMode === 'contain' ? 'contain' : resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'scale-down' : 'cover'}
      cachePolicy="memory-and-disk"
      transition={120}
      onLoad={autoAspect ? (e) => {
        const s: any = e?.source
        if (s?.width && s?.height) {
          const r = Math.min(maxAspect, Math.max(minAspect, s.width / s.height))
          setRatio(r)
          onRatio?.(r)
        }
      } : undefined}
      onError={() => setErroredSrc(transformada)}
    />
  )
})
