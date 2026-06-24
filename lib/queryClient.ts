import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Incrementar CACHE_BUSTER en deploys que cambien la estructura de datos cacheados.
// Esto invalida el cache persistido en AsyncStorage para evitar datos corruptos/viejos.
const CACHE_BUSTER = '3'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,          // 5 min sin refetch
      gcTime: 1000 * 60 * 60 * 24 * 3,  // 3 días en disco
      retry: 2,
      networkMode: 'offlineFirst',        // muestra cache aunque no haya internet
    },
    mutations: {
      networkMode: 'offlineFirst',        // pausa mutaciones offline y las reintenta al reconectar
      retry: 3,
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: `VALERA_CACHE_b${CACHE_BUSTER}`,
  throttleTime: 1000,
  maxAge: 1000 * 60 * 60 * 24 * 7,     // descartar cache con más de 7 días
})
