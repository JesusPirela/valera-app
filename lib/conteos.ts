// Cuántas recámaras, baños y estacionamientos puede tener una propiedad.
//
// Esto NO es un tope de captura. Durante mucho tiempo lo fue: al importar se
// hacía Math.min(recamaras, 5), y los desplegables sólo ofrecían hasta "5+".
// El resultado medido (24/nov/2026) sobre 2,691 propiedades: CERO con 6
// recámaras, CERO con 5 baños y CERO con 4 estacionamientos — imposible en
// inventario real. 88 propiedades tenían su propia descripción contradiciendo
// al dato guardado ("🛏️ 7 recámaras" con recamaras = 5).
//
// Ahora el número que venga en la ficha se guarda tal cual. El tope de abajo
// sólo descarta números MAL LEÍDOS: si un parser confunde los m² o un año con
// las recámaras y saca 249 o 2025, eso no se guarda. Una casa de 8 recámaras
// sí se guarda con 8.
export const TOPE = {
  recamaras: 30,
  banos: 30,
  mediosBanos: 10,
  estacionamientos: 50,
} as const

// Devuelve el conteo si es un número creíble; null si no lo es.
// Rechaza negativos, decimales raros y cualquier cosa por encima del tope.
export function conteo(n: number | null | undefined, tope: number): number | null {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return null
  const r = Math.round(n)
  if (r < 0 || r > tope) return null
  return r
}

export type OpcionConteo = { value: number | null; label: string }

// Arma las opciones de un desplegable de conteo.
//
// Clave: si el valor guardado queda FUERA de la lista (una casa de 12
// recámaras), se agrega como opción. Sin esto, DropdownModal no encuentra el
// valor (busca options.find(o => o.value === value)), enseña el placeholder
// como si estuviera vacío, y el siguiente guardado lo borraría. Ese era el
// segundo tramo del bug: aunque el import trajera el número correcto, la
// pantalla de editar lo perdía.
export function opcionesConteo(desde: number, hasta: number, valor: number | null): OpcionConteo[] {
  const ops: OpcionConteo[] = [{ value: null, label: '—' }]
  for (let n = desde; n <= hasta; n++) ops.push({ value: n, label: String(n) })
  if (valor != null && (valor < desde || valor > hasta)) {
    ops.push({ value: valor, label: String(valor) })
    ops.sort((a, b) => (a.value ?? -1) - (b.value ?? -1))
  }
  return ops
}
