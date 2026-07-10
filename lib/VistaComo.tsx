import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// "Ver como": permite a un ADMIN simular la vista de otro rol (usuario/plus/
// supervisor). Solo afecta la app de prospectador (routing + filtrado de
// contenido). Se persiste para sobrevivir recargas.
export type RolSimulado = 'prospectador' | 'prospectador_plus' | 'supervisor' | null

export const VISTA_COMO_KEY = '@valera_vista_como'

// `listo` distingue "todavía no leí el disco" de "no hay simulación activa".
// Sin él, cualquier guard que mire `vistaComo` decide con un null prematuro.
const Ctx = createContext<{ vistaComo: RolSimulado; listo: boolean; setVistaComo: (r: RolSimulado) => void }>({
  vistaComo: null,
  listo: false,
  setVistaComo: () => {},
})

export function VistaComoProvider({ children }: { children: ReactNode }) {
  const [vistaComo, setEstado] = useState<RolSimulado>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(VISTA_COMO_KEY).then(v => {
      if (v === 'prospectador' || v === 'prospectador_plus' || v === 'supervisor') setEstado(v)
    }).catch(() => {}).finally(() => setListo(true))
  }, [])

  function setVistaComo(r: RolSimulado) {
    setEstado(r)
    if (r) AsyncStorage.setItem(VISTA_COMO_KEY, r).catch(() => {})
    else AsyncStorage.removeItem(VISTA_COMO_KEY).catch(() => {})
  }

  return <Ctx.Provider value={{ vistaComo, listo, setVistaComo }}>{children}</Ctx.Provider>
}

export const useVistaComo = () => useContext(Ctx)

// Rol efectivo = el simulado (si hay) o el real.
export function rolEfectivo(rolReal: string | null | undefined, vistaComo: RolSimulado): string | null {
  return vistaComo ?? rolReal ?? null
}
