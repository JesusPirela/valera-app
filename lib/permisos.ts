// Capacidades centralizadas por rol — evita repetir listas de roles a mano
// en cada pantalla. Jerarquía: nuevo < prospectador < prospectador_plus < asesor ≈ supervisor < admin.

export function esPlusOMejor(role?: string | null): boolean {
  return ['prospectador_plus', 'asesor', 'supervisor', 'admin'].includes(role ?? '')
}

export function esStaffSupervision(role?: string | null): boolean {
  return ['asesor', 'supervisor', 'admin'].includes(role ?? '')
}

export function esAdmin(role?: string | null): boolean {
  return role === 'admin'
}
