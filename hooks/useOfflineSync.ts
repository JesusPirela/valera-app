import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { flushQueue, getPendingCount } from '../lib/offline-queue'
import { queryClient } from '../lib/queryClient'

export type OfflineSyncState = {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  syncError: string | null
  refreshPending: () => Promise<void>
  syncNow: () => Promise<void>
}

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline]       = useState(true)
  const [isSyncing, setIsSyncing]     = useState(false)
  const [pendingCount, setPending]    = useState(0)
  const [syncError, setSyncError]     = useState<string | null>(null)
  const syncingRef                    = useRef(false)

  const refreshPending = useCallback(async () => {
    const n = await getPendingCount()
    setPending(n)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setIsSyncing(true)
    setSyncError(null)
    try {
      const { success, failed } = await flushQueue()
      if (success > 0) {
        // Invalidar cache para reflejar los datos recién guardados
        queryClient.invalidateQueries({ queryKey: ['clientes'] })
        // Publicaciones encoladas ya aplicadas → refrescar contadores x/10
        queryClient.invalidateQueries({ queryKey: ['publicaciones-usuario'] })
      }
      if (failed > 0) {
        setSyncError(`${failed} cambio${failed > 1 ? 's' : ''} no se pudo${failed > 1 ? 'eron' : ''} enviar`)
      }
      await refreshPending()
    } catch (e: any) {
      setSyncError(e?.message ?? 'Error al sincronizar')
    } finally {
      syncingRef.current = false
      setIsSyncing(false)
    }
  }, [refreshPending])

  useEffect(() => {
    // Al abrir la app: leer estado y, si hay conexión, VACIAR la cola de una vez.
    // Antes solo se sincronizaba en la transición offline→online estando la app
    // abierta; si el usuario publicaba con mala señal, cerraba y reabría ya con
    // internet, la publicación quedaba pendiente para siempre. Ahora se drena al
    // arrancar (y al volver a primer plano, abajo).
    NetInfo.fetch().then(async state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false)
      setIsOnline(online)
      await refreshPending()
      if (online && (await getPendingCount()) > 0) syncNow()
    })
  }, [syncNow, refreshPending])

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false)
      setIsOnline(prev => {
        // Al recuperar conexión, sincronizar automáticamente
        if (!prev && online) {
          syncNow()
        }
        return online
      })
    })
    return unsub
  }, [syncNow])

  useEffect(() => {
    // Al volver a primer plano (típico: publiqué, bloqueé el teléfono, volví con
    // señal), intentar drenar la cola si quedó algo y hay conexión.
    const sub = AppState.addEventListener('change', async next => {
      if (next !== 'active') return
      const state = await NetInfo.fetch()
      const online = !!(state.isConnected && state.isInternetReachable !== false)
      if (online && (await getPendingCount()) > 0) syncNow()
    })
    return () => sub.remove()
  }, [syncNow])

  useEffect(() => {
    // Drenado periódico. Los disparadores de arriba (abrir la app, recuperar
    // conexión, volver a primer plano) NO cubren un caso real: cuando algo se
    // encola no por falta de internet, sino porque la SESIÓN no respondió a
    // tiempo al guardar (socket muerto tras un rato inactivo). Ahí la red nunca
    // se cae, así que no hay transición offline→online y en web la pestaña
    // sigue "activa": la cola se quedaba esperando a la próxima apertura.
    // Con esto lo pendiente sube solo en cuanto la sesión se recupera.
    const id = setInterval(async () => {
      try {
        if (await getPendingCount() > 0) {
          const state = await NetInfo.fetch()
          if (state.isConnected && state.isInternetReachable !== false) syncNow()
        }
      } catch { /* se reintenta al siguiente tick */ }
    }, 45000)
    return () => clearInterval(id)
  }, [syncNow])

  return { isOnline, isSyncing, pendingCount, syncError, refreshPending, syncNow }
}
