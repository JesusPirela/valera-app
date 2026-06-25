import { useLocalSearchParams } from 'expo-router'
import HeaderBack from './HeaderBack'

// Botón "atrás" del formulario de cliente. Si se está EDITANDO (hay id),
// vuelve al detalle de ese mismo cliente; si es nuevo, vuelve al CRM.
// (admin/prospectador según de dónde se abrió.)
export default function ClienteFormBack() {
  const { id, fromAdmin } = useLocalSearchParams<{ id?: string; fromAdmin?: string }>()
  const esAdmin = fromAdmin === '1'
  const to = id
    ? (esAdmin ? `/(admin)/detalle-cliente?id=${id}` : `/(prospectador)/detalle-cliente?id=${id}`)
    : (esAdmin ? '/(admin)/crm' : '/(prospectador)/crm')
  return <HeaderBack to={to} alwaysReplace />
}
