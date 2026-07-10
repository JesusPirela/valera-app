// Cuentas de la casa (Chucho y Alexis). El resto de los admins son asesores a
// los que se les dio ese rol para operar, y su nombre no debe aparecer ante los
// usuarios normales como "quién subió la propiedad": ven la marca en su lugar.
// El staff (admin/supervisor) sí ve siempre el nombre real.
const ADMINS_PRINCIPALES = new Set<string>([
  '6735dd82-3c79-4fd3-86cd-870c45fbda94', // Alexis
  'd0a9694f-f73a-428f-a455-5f039e4b84dc', // Chucho
])

export const NOMBRE_MARCA = 'Valera'

export function esAdminPrincipal(userId: string | null | undefined): boolean {
  return !!userId && ADMINS_PRINCIPALES.has(userId)
}
