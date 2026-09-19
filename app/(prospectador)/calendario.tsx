// Calendario IN-APP del asesor — conectado a SUS propias citas y seguimientos.
// La lógica vive en components/CalendarioView (compartida con admin/gerencia).
import CalendarioView from '../../components/CalendarioView'

export default function CalendarioAsesor() {
  return <CalendarioView esAsesor />
}
