import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// "Ver como": permite a un ADMIN simular la vista de otro rol (usuario/plus/
// supervisor). Solo afecta la app de prospectador (routing + filtrado de
// contenido). Se persiste para sobrevivir recargas.
export type RolSimulado = 'prospectador' | 'prospectador_plus' | 'supervisor' | null

export const VISTA_COMO_KEY = '@valera_vista_como'

const Ctx = createContext<{ vistaComo: RolSimulado; setVistaComo: (r: RolSimulado) => void }>({
  vistaComo: null,
  setVistaComo: () => {},
})

export function VistaComoProvider({ children }: { children: ReactNode }) {
  const [vistaComo, setEstado] = useState<RolSimulado>(null)

  useEffect(() => {
    AsyncStorage.getItem(VISTA_COMO_KEY).then(v => {
      if (v === 'prospectador' || v === 'prospectador_plus' || v === 'supervisor') setEstado(v)
    }).catch(() => {})
  }, [])

  function setVistaComo(r: RolSimulado) {
    setEstado(r)
    if (r) AsyncStorage.setItem(VISTA_COMO_KEY, r).catch(() => {})
    else AsyncStorage.removeItem(VISTA_COMO_KEY).catch(() => {})
  }

  return <Ctx.Provider value={{ vistaComo, setVistaComo }}>{children}</Ctx.Provider>
}

export const useVistaComo = () => useContext(Ctx)

// Rol efectivo = el simulado (si hay) o el real.
export function rolEfectivo(rolReal: string | null | undefined, vistaComo: RolSimulado): string | null {
  return vistaComo ?? rolReal ?? null
}
