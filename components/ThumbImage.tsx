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
  const [fallback, setFallback] = useState(false)
  if (!url) return null
  return (
    <Image
      source={{ uri: fallback ? url : (thumb(url, opts) ?? url) }}
      style={style}
      resizeMode={resizeMode}
      onError={() => !fallback && setFallback(true)}
    />
  )
}
