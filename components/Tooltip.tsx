import type { ReactNode } from 'react'

// Tooltip al pasar el cursor. En nativo no hay hover, así que es transparente:
// devuelve el hijo tal cual. La versión web (Tooltip.web.tsx) sí muestra el
// recuadro usando el atributo title del navegador.
export function Tooltip({ children }: { label: string; children: ReactNode }) {
  return <>{children}</>
}
