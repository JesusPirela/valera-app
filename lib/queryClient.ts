import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Incrementar CACHE_BUSTER en deploys que cambien la estructura de datos cacheados.
// Esto invalida el cache persistido en AsyncStorage para evitar datos corruptos/viejos.
// b4 (07/jul): descarta el cache inflado que causaba arranque lento (ver abajo).
// b5 (09/jul): descarta los detalles sembrados con la descripción cortada a 180.
// b6 (14/jul): staleTime global cambiado a 30 min; descarta metadatos viejos.
const CACHE_BUSTER = '6'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,         // 30 min sin refetch
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
  // 3s (antes 1s): cada persistencia serializa TODO el cache (varios MB de
  // JSON) en el hilo JS; hacerlo cada segundo producía micro-congelamientos
  // perceptibles en Android durante scroll/edición. 3s reduce el trabajo 3×
  // sin riesgo real de pérdida (solo se pierde lo no persistido si la app
  // muere en esa ventana, y el servidor sigue siendo la fuente de verdad).
  throttleTime: 3000,
})

// Edad máxima del cache persistido (se pasa en persistOptions del provider;
// como opción del persister no existe y se ignoraba silenciosamente).
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7  // 7 días

// Qué queries se GUARDAN a disco. Al migrar ~40 pantallas a React Query, todas
// empezaron a persistir su cache; al abrir la app se rehidrataba TODO ese JSON
// (varios MB) de golpe en el hilo JS → arranque lento. Solución: persistir solo
// lo pesado/offline-crítico (home y CRM). El resto sigue cacheado en MEMORIA
// durante la sesión (navegación instantánea) pero no infla el arranque.
const KEYS_PERSISTIBLES = new Set([
  'prospectador-propiedades', // home del prospectador (lo primero que se ve)
  'admin-propiedades',        // home admin
  'clientes',                 // CRM (además es crítico para el modo offline)
  'detalle-propiedad',        // abrir una propiedad sin red
])

export function shouldPersistQuery(query: { queryKey: unknown; state: { status: string } }): boolean {
  if (query.state.status !== 'success') return false
  const key = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : String(query.queryKey)
  return KEYS_PERSISTIBLES.has(key)
}
