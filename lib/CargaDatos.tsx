import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type { ThumbOpts } from './img'

// ── Modo de carga de propiedades ────────────────────────────────────────────
// Como en las apps de streaming: en internet lento se cargan menos propiedades
// de golpe y con imágenes más ligeras; en internet rápido, todo a calidad normal.
// El usuario puede forzar el modo desde Perfil, o dejarlo en Automático.
//
//   auto     → decide según la conexión (celular 2G/3G o "cara" = ahorro).
//   completo → siempre calidad/carga completa.
//   ahorro   → siempre ligero (menos imágenes, más comprimidas).
export type ModoCarga = 'auto' | 'completo' | 'ahorro'

const KEY = '@valera_modo_carga'

type Ctx = {
  modo: ModoCarga
  setModo: (m: ModoCarga) => void
  conexionLenta: boolean       // lo que detectó NetInfo (informativo, para la UI)
  ahorroActivo: boolean        // resultado final que deben usar las pantallas
}

const CargaCtx = createContext<Ctx>({
  modo: 'auto', setModo: () => {}, conexionLenta: false, ahorroActivo: false,
})

// deno-lint-ignore no-explicit-any
function detectarLenta(state: any): boolean {
  if (!state?.isConnected) return false  // sin red se maneja aparte (cache/offline)
  if (state.type === 'cellular') {
    const gen = state.details?.cellularGeneration
    if (gen === '2g' || gen === '3g') return true
  }
  if (state.details?.isConnectionExpensive) return true
  return false
}

export function CargaDatosProvider({ children }: { children: ReactNode }) {
  const [modo, setModoState] = useState<ModoCarga>('auto')
  const [conexionLenta, setConexionLenta] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === 'auto' || v === 'completo' || v === 'ahorro') setModoState(v)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // Estado inicial + suscripción a cambios de conexión.
    NetInfo.fetch().then(s => setConexionLenta(detectarLenta(s))).catch(() => {})
    const unsub = NetInfo.addEventListener(s => setConexionLenta(detectarLenta(s)))
    return unsub
  }, [])

  function setModo(m: ModoCarga) {
    setModoState(m)
    AsyncStorage.setItem(KEY, m).catch(() => {})
  }

  const ahorroActivo = modo === 'ahorro' || (modo === 'auto' && conexionLenta)

  return (
    <CargaCtx.Provider value={{ modo, setModo, conexionLenta, ahorroActivo }}>
      {children}
    </CargaCtx.Provider>
  )
}

export const useCargaDatos = () => useContext(CargaCtx)

// ── Ajustes derivados del modo ──────────────────────────────────────────────
// Un solo lugar donde vive "qué tan ligero" es el modo ahorro, para que todas
// las pantallas sean consistentes.

// Opciones de miniatura para la tarjeta del inicio.
export function opcionesImagenTarjeta(ahorro: boolean): ThumbOpts {
  return ahorro ? { width: 320, quality: 45 } : { width: 640, quality: 65 }
}

// Cuántas tarjetas dibuja la lista de entrada (menos = menos imágenes de golpe).
export function tarjetasIniciales(ahorro: boolean): number {
  return ahorro ? 3 : 6
}
export function tarjetasPorTanda(ahorro: boolean): number {
  return ahorro ? 4 : 8
}
