import { useCallback, useRef } from 'react'
import { Platform } from 'react-native'

// En web, la rueda del mouse solo dispara scroll VERTICAL por default — un
// ScrollView horizontal queda inalcanzable salvo arrastrando su barra (delgada
// y fácil de pasar por alto) o con gestos de trackpad. Este hook redirige el
// scroll vertical de la rueda hacia scrollLeft mientras el cursor está encima.
//
// Callback ref (no useRef+useEffect): el ScrollView objetivo suele estar detrás
// de un `loading ? ... : <ScrollView ref .../>` — con useEffect(dep [])  el
// efecto corre una sola vez, ANTES de que el ScrollView exista, y el listener
// nunca se conecta. El callback ref en cambio se dispara cada vez que React
// monta (o desmonta) el nodo real, sin importar cuándo ocurra eso.
export function useScrollHorizontalConRueda() {
  const cleanupRef = useRef<(() => void) | null>(null)
  const ref = useCallback((instance: any) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (Platform.OS !== 'web' || !instance) return
    const node = instance.getScrollableNode?.() ?? instance
    if (!node?.addEventListener) return
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      node.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    node.addEventListener('wheel', handler, { passive: false })
    cleanupRef.current = () => node.removeEventListener('wheel', handler)
  }, [])
  return ref
}
