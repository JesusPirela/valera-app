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
      // Si el cursor está sobre un contenedor que SÍ puede scrollear vertical en
      // esa dirección (ej. una columna del kanban con más tarjetas de las que
      // caben), déjalo scrollear vertical y no lo conviertas a horizontal. Solo
      // se redirige a horizontal cuando ya no hay nada que bajar/subir ahí.
      let el = e.target as HTMLElement | null
      while (el && el !== node) {
        const oy = getComputedStyle(el).overflowY
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          const alTope  = e.deltaY < 0 && el.scrollTop <= 0
          const alFondo = e.deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1
          if (!alTope && !alFondo) return // la columna consume el scroll vertical
          break
        }
        el = el.parentElement
      }
      node.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    node.addEventListener('wheel', handler, { passive: false })
    cleanupRef.current = () => node.removeEventListener('wheel', handler)
  }, [])
  return ref
}
