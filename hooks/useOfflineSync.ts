import { useState, useEffect, useCallback, useRef } from 'react'
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
    // Leer estado inicial y conteo de pendientes
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected ?? true)
    })
    refreshPending()
  }, [])

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

  return { isOnline, isSyncing, pendingCount, syncError, refreshPending, syncNow }
}
