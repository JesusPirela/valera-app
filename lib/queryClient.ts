import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,           // 5 min: no refetch si los datos son recientes
      gcTime: 1000 * 60 * 60 * 24 * 7,    // 7 días en memoria/disco
      retry: 1,
      networkMode: 'offlineFirst',         // retorna caché aunque no haya internet
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'VALERA_CACHE',
  throttleTime: 1000,
})
