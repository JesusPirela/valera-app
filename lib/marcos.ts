// ── Marcos de perfil por nivel ────────────────────────────────────────────────
// Solo es decoración: un borde alrededor del avatar. No cambia la estructura del
// perfil ni desbloquea nada más. Se derivan del nivel (que ya se calcula del XP),
// así que no hay estado nuevo que guardar ni sincronizar.

export type Marco = {
  nivel: number      // nivel mínimo para desbloquearlo
  id: string
  nombre: string
  color: string      // color principal del borde
  colorInterior?: string  // aro interior (da sensación de metal/profundidad)
  brillo?: boolean   // halo suave alrededor (marcos altos)
}

export const MARCOS: Marco[] = [
  { nivel: 1,   id: 'basico',     nombre: 'Básico',     color: '#5c7a8a' },
  { nivel: 5,   id: 'bronce',     nombre: 'Bronce',     color: '#b0703c', colorInterior: '#e0a86a' },
  { nivel: 10,  id: 'plata',      nombre: 'Plata',      color: '#9fb3c0', colorInterior: '#e8f0f4' },
  { nivel: 20,  id: 'oro',        nombre: 'Oro',        color: '#c9a84c', colorInterior: '#f5e2a0' },
  { nivel: 30,  id: 'platino',    nombre: 'Platino',    color: '#6fc7c2', colorInterior: '#d6f5f2' },
  { nivel: 40,  id: 'diamante',   nombre: 'Diamante',   color: '#5aa9f5', colorInterior: '#cbe6ff', brillo: true },
  { nivel: 50,  id: 'maestro',    nombre: 'Maestro',    color: '#9a63dd', colorInterior: '#e0cbf7', brillo: true },
  { nivel: 75,  id: 'legendario', nombre: 'Legendario', color: '#ff8a3d', colorInterior: '#ffd7b0', brillo: true },
  { nivel: 100, id: 'elite',      nombre: 'Élite',      color: '#ff4d6d', colorInterior: '#ffc2cd', brillo: true },
]

// Marco vigente para un nivel (el más alto que ya alcanzó).
export function marcoPorNivel(nivel: number): Marco {
  let actual = MARCOS[0]
  for (const m of MARCOS) if (nivel >= m.nivel) actual = m
  return actual
}

// Siguiente marco por desbloquear (null si ya tiene el máximo).
export function siguienteMarco(nivel: number): Marco | null {
  return MARCOS.find(m => m.nivel > nivel) ?? null
}
