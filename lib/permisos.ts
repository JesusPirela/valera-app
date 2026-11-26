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

/**
 * El rol, escrito como se le dice a una persona.
 *
 * Vivía copiado dentro de BusquedaGlobal y de CambiarCuenta. Aquí queda uno
 * solo; esas dos siguen con el suyo hasta que se toquen por otra razón, para
 * no mover de paso pantallas que hoy funcionan.
 */
export function rolLabel(role?: string | null): string {
  const m: Record<string, string> = {
    admin: 'Admin', gerente: 'Gerente', supervisor: 'Supervisor', asesor: 'Asesor',
    prospectador: 'Prospectador', prospectador_plus: 'Prospectador Plus', nuevo: 'Nuevo',
  }
  return m[role ?? ''] ?? (role ?? 'sin rol')
}
