// Campos del formulario de captura de leads. Cada uno mapea a una columna real
// del CRM (clientes), para que la respuesta llene directo al cliente.
// El asesor elige cuáles incluir; Nombre y Teléfono van siempre (obligatorios).

export type CampoForm = {
  key: string            // columna en clientes
  label: string          // pregunta que ve el cliente
  tipo: 'texto' | 'email' | 'telefono' | 'opciones'
  opciones?: { valor: string; etiqueta: string }[]
  fijo?: boolean         // siempre presente (nombre / teléfono)
}

export const CAMPOS_FORM: CampoForm[] = [
  { key: 'nombre',         label: 'Nombre completo',          tipo: 'texto',    fijo: true },
  { key: 'telefono',       label: 'Teléfono / WhatsApp',      tipo: 'telefono', fijo: true },
  { key: 'email',          label: 'Correo electrónico',       tipo: 'email' },
  { key: 'tipo_operacion', label: '¿Compra o renta?',         tipo: 'opciones', opciones: [{ valor: 'venta', etiqueta: 'Compra' }, { valor: 'renta', etiqueta: 'Renta' }] },
  { key: 'zona_busqueda',  label: '¿Qué zona te interesa?',   tipo: 'texto' },
  { key: 'presupuesto',    label: 'Presupuesto aproximado',   tipo: 'texto' },
  { key: 'tipo_credito',   label: 'Tipo de crédito',          tipo: 'texto' },
  { key: 'notas',          label: 'Comentarios',              tipo: 'texto' },
]

// Los seleccionables (todos menos los fijos).
export const CAMPOS_OPCIONALES = CAMPOS_FORM.filter(c => !c.fijo)
export const campoPorKey = (k: string) => CAMPOS_FORM.find(c => c.key === k)
