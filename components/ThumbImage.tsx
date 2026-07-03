import { useState } from 'react'
import { Image, ImageStyle, StyleProp } from 'react-native'
import { thumb, ThumbOpts } from '../lib/img'

type Props = {
  url: string | null | undefined
  opts?: ThumbOpts
  style?: StyleProp<ImageStyle>
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center'
}

export function ThumbImage({ url, opts, style, resizeMode = 'cover' }: Props) {
  // Si la miniatura transformada falla (red/CDN que bloquea /render/image, cuota
  // agotada, etc.) se cae a la imagen original. Se compara contra la URL
  // transformada actual para que el fallback se reinicie solo al cambiar de
  // imagen (tarjetas recicladas en listas no quedan pegadas en fallback).
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  if (!url) return null
  const transformada = thumb(url, opts) ?? url
  const src = erroredSrc === transformada ? url : transformada
  return (
    <Image
      source={{ uri: src }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setErroredSrc(transformada)}
    />
  )
}
