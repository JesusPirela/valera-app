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
          /* Splash de arranque: se ve AL INSTANTE (es HTML plano, no espera al
             bundle de JS de ~1MB). Mientras la app descarga, el usuario ve la
             marca y un spinner en vez de una pantalla teal vacía. Se quita solo
             cuando React monta la app en #root. */
          #boot-splash {
            position: fixed; inset: 0; z-index: 99999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: #1a6470; gap: 22px;
            transition: opacity .35s ease; opacity: 1;
            font-family: -apple-system, Segoe UI, Roboto, sans-serif;
          }
          #boot-splash.hide { opacity: 0; pointer-events: none; }
          #boot-splash .marca {
            color: #fff; font-size: 30px; font-weight: 800; letter-spacing: 6px;
          }
          #boot-splash .sub { color: rgba(255,255,255,.7); font-size: 12px; letter-spacing: 2px; margin-top: -14px; }
          #boot-splash .spin {
            width: 38px; height: 38px; border-radius: 50%;
            border: 3px solid rgba(255,255,255,.25); border-top-color: #fff;
            animation: bs-rot .8s linear infinite;
          }
          @keyframes bs-rot { to { transform: rotate(360deg); } }
        ` }} />
      </head>
      <body>
        <div id="boot-splash">
          <div className="marca">VALERA</div>
          <div className="sub">REAL ESTATE</div>
          <div className="spin" />
        </div>
        {children}
        {/* El script va DESPUÉS de {children} (que contiene #root): así, cuando
            se ejecuta al parsear, #root ya existe en el DOM y podemos observar
            cuándo React monta la app para quitar el splash. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function () {
            var el = document.getElementById('boot-splash');
            if (!el) return;
            var done = false;
            function quitar() {
              if (done) return; done = true;
              el.classList.add('hide');
              setTimeout(function () { el && el.parentNode && el.parentNode.removeChild(el); }, 400);
            }
            var root = document.getElementById('root');
            // Quitar en cuanto React monte algo dentro de #root.
            if (root) {
              if (root.childNodes.length) { quitar(); return; }
              var obs = new MutationObserver(function () {
                if (root.childNodes.length) { obs.disconnect(); quitar(); }
              });
              obs.observe(root, { childList: true });
            } else {
              // Sin #root aún: reintentar en el próximo frame.
              var tries = 0;
              var iv = setInterval(function () {
                var r = document.getElementById('root');
                tries++;
                if (r && r.childNodes.length) { clearInterval(iv); quitar(); }
                else if (tries > 600) { clearInterval(iv); quitar(); }
              }, 100);
            }
            // Red de seguridad: nunca dejar el splash pegado más de 20s.
            setTimeout(quitar, 20000);
          })();
        ` }} />
      </body>
    </html>
  )
}
