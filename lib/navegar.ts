import { router } from 'expo-router'

// Navegación tolerante al arranque.
//
// expo-router lanza "Attempted to navigate before mounting the Root Layout
// component" si se navega antes de que el layout raíz haya montado su
// navegador. Pasa con las navegaciones que NO salen de un render, sino de un
// callback que puede dispararse en cualquier momento: el listener de
// onAuthStateChange (un SIGNED_OUT que llega durante el arranque) o un
// forzarLogout() disparado por Realtime. Como el error se lanza dentro de una
// promesa, salía en el monitoreo como "promesa sin manejar" y la navegación
// simplemente no ocurría: el usuario se quedaba donde estaba.
//
// Aquí se intenta navegar y, si el navegador aún no está listo, se reintenta en
// los siguientes ticks hasta que lo esté. Cuando todo va bien (el caso normal)
// el primer intento funciona y esto no cambia nada.
const REINTENTOS = 40          // ~4 s en total, de sobra para que monte el layout
const ESPERA_MS  = 100

export function navegarSeguro(ruta: string, intento = 0): void {
  try {
    router.replace(ruta as any)
  } catch (e) {
    if (intento >= REINTENTOS) return   // se rinde en silencio; nunca romper por navegar
    setTimeout(() => navegarSeguro(ruta, intento + 1), ESPERA_MS)
  }
}
