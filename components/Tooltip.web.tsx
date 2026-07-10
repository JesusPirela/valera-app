import type { ReactNode } from 'react'

// En web envolvemos el botón en un elemento con `title`: el navegador muestra el
// recuadro nativo al dejar el cursor encima. `display:inline-flex` conserva el
// layout en fila (no añade un salto ni ocupa ancho extra). RN Web no reenvía el
// atributo `title` a View/TouchableOpacity, por eso hace falta este wrapper.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span title={label} style={{ display: 'inline-flex' }}>
      {children}
    </span>
  )
}
