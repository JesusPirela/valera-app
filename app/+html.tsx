import type { PropsWithChildren } from 'react'
import { ScrollViewStyleReset } from 'expo-router/html'

// HTML raíz del build web. Solo se usa en web (Metro lo inyecta al generar el
// index.html); no afecta a la app nativa.
//
// El <style> pinta el fondo del documento con el teal de la marca ANTES de que
// cargue el bundle de JS. Así, mientras se descarga la app, el usuario ve el
// color de Valera en vez de un flash en blanco. El spinner de arranque usa el
// mismo teal, así que la transición es continua.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#1a6470" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { background-color: #1a6470; }
          body { margin: 0; }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
