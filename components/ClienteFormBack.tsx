import { useLocalSearchParams } from 'expo-router'
import HeaderBack from './HeaderBack'

// Botón "atrás" del formulario de cliente.
//
// Vuelve a donde estabas de verdad. El destino de abajo es solo el PLAN B para
// cuando no hay historial (entraste por un enlace directo): si editas, el
// detalle de ese cliente; si es nuevo, el CRM.
//
// Antes forzaba ese destino SIEMPRE (alwaysReplace), así que al editar desde la
// lista del CRM te dejaba en el detalle del cliente en vez de devolverte a la
// lista de la que habías salido.
export default function ClienteFormBack() {
  const { id, fromAdmin } = useLocalSearchParams<{ id?: string; fromAdmin?: string }>()
  const esAdmin = fromAdmin === '1'
  const to = id
    ? (esAdmin ? `/(admin)/detalle-cliente?id=${id}` : `/(prospectador)/detalle-cliente?id=${id}`)
    : (esAdmin ? '/(admin)/crm' : '/(prospectador)/crm')
  return <HeaderBack to={to} />
}
