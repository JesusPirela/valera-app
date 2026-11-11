/**
 * Hacer legible el color de acento sobre el fondo que toque.
 *
 * El acento lo elige cada usuario y varios de los patrones de la app son
 * OSCUROS: aurora #5c3d99, galaxy #4a148c, ocean #01579b, y el propio color
 * por defecto #1a6470. En modo oscuro esos colores se pintaban tal cual sobre
 * el fondo #0f1e2d y el contraste medido quedaba en 1.17:1 (galaxy), 1.70:1
 * (aurora), 2.04:1 (el de fábrica) — por debajo incluso del 3:1 que pide la
 * WCAG para un icono, no digamos el 4.5:1 del texto. Resultado: la fila de
 * filtros "ni se veía".
 *
 * Lo que NO se hizo: una tabla fija de "versión clara" por acento. Se rompe en
 * cuanto alguien elige un color propio con el selector, que es justo lo que la
 * app permite. En vez de eso se sube (o se baja) la LUMINOSIDAD del mismo
 * tono hasta alcanzar el contraste pedido. El tono y la saturación no se
 * tocan: sigue siendo "su" color, solo que visible.
 */

const RE_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

function aRgb(color: string): [number, number, number] | null {
  const m = color.trim().match(RE_HEX)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

const aHex = (rgb: number[]) =>
  '#' + rgb.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')

/** Luminancia relativa (WCAG 2.1, 1.4.3). */
export function luminancia(color: string): number {
  const rgb = aRgb(color)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste entre dos colores (1 = iguales, 21 = negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (bajo + 0.05)
}

function rgbAHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0))
          : max === G ? (B - R) / d + 2
          :             (R - G) / d + 4
  return [h / 6, s, l]
}

function hslAHex(h: number, s: number, l: number): string {
  if (s === 0) return aHex([l * 255, l * 255, l * 255])
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return aHex([canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255])
}

/** Mezcla `encima` sobre `debajo` con opacidad `alfa` (0–1). Sirve para saber
 *  el color REAL de un fondo translúcido antes de medirle el contraste. */
export function mezclar(encima: string, debajo: string, alfa: number): string {
  const a = aRgb(encima), b = aRgb(debajo)
  if (!a || !b) return debajo
  return aHex(a.map((c, i) => c * alfa + b[i] * (1 - alfa)))
}

/**
 * El mismo color, aclarado u oscurecido lo justo para que se lea sobre `fondo`.
 *
 * @param minimo razón de contraste pedida: 4.5 para texto (WCAG AA), 3 para
 *               iconos, bordes y texto grande.
 * Devuelve el color original si ya cumple, o si no se puede interpretar
 * (gradientes, `rgb(...)`, nombres CSS): más vale no tocarlo que romperlo.
 */
export function legibleSobre(color: string, fondo: string, minimo = 4.5): string {
  const rgb = aRgb(color)
  if (!rgb || !aRgb(fondo)) return color
  if (contraste(color, fondo) >= minimo) return color

  const [h, s, l] = rgbAHsl(rgb)
  // Hacia el blanco si el fondo es oscuro; hacia el negro si es claro.
  const aclarar = luminancia(fondo) < 0.18
  let mejor = color
  for (let paso = 1; paso <= 100; paso++) {
    const nl = aclarar ? Math.min(1, l + paso / 100) : Math.max(0, l - paso / 100)
    mejor = hslAHex(h, s, nl)
    if (contraste(mejor, fondo) >= minimo) return mejor
    if (nl === 0 || nl === 1) break
  }
  return mejor
}
