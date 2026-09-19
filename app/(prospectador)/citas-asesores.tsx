// Vista de admin/gerencia: tablero de citas de TODOS los asesores.
// Ruta separada de la pestaña "Citas" (asesor-citas) para que el modo admin
// no se quede pegado al volver a "mis citas".
import { AsesorCitasAdmin } from './asesor-citas'

export default function CitasAsesores() {
  return <AsesorCitasAdmin />
}
