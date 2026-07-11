import { useState, useCallback } from 'react'
import { RefreshControl } from 'react-native'

// Pull-to-refresh reutilizable: jala hacia abajo, aparece el spinner y al soltar
// corre `onRefresh`. Devuelve un RefreshControl ya listo para pasarlo a
// cualquier ScrollView / FlatList / SectionList vía la prop `refreshControl`.
//
// El estado `refreshing` es propio del control, independiente del "loading" de
// pantalla completa que cada pantalla ya tenga, así que jalar muestra solo el
// spinnercito de arriba y no reemplaza el contenido.
export function usePullRefresh(onRefresh: () => Promise<unknown> | void, tint = '#1a6470') {
  const [refreshing, setRefreshing] = useState(false)
  const handle = useCallback(async () => {
    setRefreshing(true)
    try { await onRefresh() } catch { /* no romper el gesto si la carga falla */ }
    finally { setRefreshing(false) }
  }, [onRefresh])

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={handle} tintColor={tint} colors={[tint]} />
  )
  return { refreshing, refreshControl, onRefresh: handle }
}
