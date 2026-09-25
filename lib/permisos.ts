// Capacidades centralizadas por rol — evita repetir listas de roles a mano
// en cada pantalla. Jerarquía: nuevo < prospectador < prospectador_plus < asesor ≈ supervisor < admin.

export function esPlusOMejor(role?: string | null): boolean {
  return ['prospectador_plus', 'asesor', 'supervisor', 'gerente', 'admin'].includes(role ?? '')
}

export function esStaffSupervision(role?: string | null): boolean {
  return ['asesor', 'supervisor', 'gerente', 'admin'].includes(role ?? '')
}

export function esAdmin(role?: string | null): boolean {
  return role === 'admin'
}

// Ver quién publicó una propiedad y los conteos de publicaciones.
//
// Esos datos salen de funciones SQL que exigen admin o supervisor. Se pedían
// con esStaffSupervision, que incluye también a asesor y gerente, así que el
// servidor respondía "Access denied" y la pantalla se quedaba sin el dato sin
// decir nada. No se amplía el permiso en la base: se deja de pedir el dato
// cuando el rol no puede verlo.
export function puedeVerPublicaciones(role?: string | null): boolean {
  return ['admin', 'supervisor'].includes(role ?? '')
}

export function puedeEnviarClienteAChatbot(role?: string | null): boolean {
  return ['nuevo', 'prospectador', 'prospectador_plus', 'asesor', 'supervisor', 'admin'].includes(role ?? '')
}
