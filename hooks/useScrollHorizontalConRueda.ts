import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

// En web, la rueda del mouse solo dispara scroll VERTICAL por default — un
// ScrollView horizontal queda inalcanzable salvo arrastrando su barra (delgada
// y fácil de pasar por alto) o con gestos de trackpad. Este hook redirige el
// scroll vertical de la rueda hacia scrollLeft mientras el cursor está encima.
export function useScrollHorizontalConRueda() {
  const ref = useRef<any>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = ref.current?.getScrollableNode?.() ?? ref.current
    if (!node) return
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      node.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
  }, [])
  return ref
}
