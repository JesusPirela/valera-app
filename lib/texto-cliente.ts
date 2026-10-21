// Arma el perfil de un cliente como texto, listo para pegar en WhatsApp.
//
// Nace de la pantalla de coordinación de citas: para pasarle un cliente a
// alguien había que abrir su ficha y ir transcribiendo campo por campo, o
// mandar una captura que no se puede buscar ni reenviar.
//
// Dos reglas, y las dos importan:
//
//  1. Lo que no está registrado NO aparece. Nada de "Presupuesto: —" ni de
//     rellenar huecos: si el dato no se capturó, la línea no se escribe. Así
//     quien recibe el mensaje ve de un golpe lo que de verdad se sabe.
//  2. Los valores se traducen con las MISMAS etiquetas que enseña la app
//     ("infonavit" → "Infonavit"), para que el mensaje no hable en un idioma
//     distinto al de la pantalla de donde salió.

/** Lo que se necesita del cliente. Todo opcional salvo el nombre. */
export type ClienteParaTexto = {
  nombre: string
  telefono?: string | null
  email?: string | null
  tipo_operacion?: string | null
  presupuesto?: string | null
  tipo_credito?: string | null
  zona_busqueda?: string | null
  nivel_interes?: string | null
  num_personas?: string | null
  tiene_mascotas?: boolean | null
  detalle_mascotas?: string | null
  fecha_mudanza?: string | null
  fuente_lead?: string | null
  notas?: string | null
}

// Mismas etiquetas que usa la ficha del cliente.
const CREDITO: Record<string, string> = {
  infonavit: 'Infonavit', fovisste: 'Fovisste',
  bancario: 'Bancario', contado: 'Contado', otro: 'Otro',
}
const FUENTE: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko',
  ficha_compartida: 'Ficha compartida', coleccion_compartida: 'Colección',
  campana_fb: 'Campaña FB', grupo_fb: 'Grupo FB', otro: 'Otro',
  cofre_lead_meta: 'Campaña Meta',
  referido: 'Referido', redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría', evento: 'Evento',
}
const INTERES: Record<string, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }

const lleno = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && v.trim() !== '—'

/**
 * El presupuesto se guardó como etiqueta de un desplegable, con guiones bajos:
 * "$900mil_a_$1.2m". Tal cual se lee mal en un mensaje.
 */
function presupuestoLegible(v: string): string {
  return v.replace(/_a_/g, ' a ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Capitaliza un valor suelto que no tenga etiqueta propia ("SANTALUZ" → "Santaluz"). */
function bonito(v: string): string {
  const t = v.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

export type ExtrasTexto = {
  /** Teléfono ya formateado para mostrar; si no, se usa el del cliente. */
  telefono?: string
  /** Línea de la cita, para cuando el perfil se copia desde una cita. */
  cita?: string
  /** Propiedad de esa cita. */
  propiedad?: string
}

/**
 * Devuelve el perfil como texto. Los asteriscos son las negritas de WhatsApp;
 * en cualquier otro lado se ven como asteriscos y se entiende igual.
 */
export function textoClienteWhatsApp(c: ClienteParaTexto, extras: ExtrasTexto = {}): string {
  const l: string[] = [`*${c.nombre.trim()}*`]

  const tel = extras.telefono ?? c.telefono
  if (lleno(tel)) l.push(`📞 ${tel.trim()}`)
  if (lleno(c.email)) l.push(`✉️ ${c.email.trim()}`)

  // Lo que busca: el bloque que de verdad sirve para proponerle algo.
  const busca: string[] = []
  if (lleno(c.tipo_operacion))  busca.push(`🔑 Opera: ${bonito(c.tipo_operacion)}`)
  if (lleno(c.presupuesto))     busca.push(`💰 Presupuesto: ${presupuestoLegible(c.presupuesto)}`)
  if (lleno(c.tipo_credito))    busca.push(`🏦 Pago: ${CREDITO[c.tipo_credito.trim().toLowerCase()] ?? bonito(c.tipo_credito)}`)
  if (lleno(c.zona_busqueda))   busca.push(`📍 Busca en: ${c.zona_busqueda.trim()}`)
  if (lleno(c.nivel_interes))   busca.push(`🔥 Interés: ${INTERES[c.nivel_interes.trim().toLowerCase()] ?? bonito(c.nivel_interes)}`)
  if (busca.length) l.push('', ...busca)

  // Detalles de mudanza: casi siempre vacíos, pero cuando están deciden mucho
  // en una renta.
  const extra: string[] = []
  if (lleno(c.num_personas))  extra.push(`👥 Personas: ${c.num_personas.trim()}`)
  if (c.tiene_mascotas === true) {
    extra.push(`🐾 Mascotas: ${lleno(c.detalle_mascotas) ? c.detalle_mascotas.trim() : 'Sí'}`)
  } else if (c.tiene_mascotas === false) {
    extra.push('🐾 Mascotas: No')
  }
  if (lleno(c.fecha_mudanza)) extra.push(`📅 Se muda: ${c.fecha_mudanza.trim()}`)
  if (extra.length) l.push('', ...extra)

  if (lleno(c.fuente_lead)) {
    l.push('', `🌐 Origen: ${FUENTE[c.fuente_lead.trim().toLowerCase()] ?? bonito(c.fuente_lead)}`)
  }

  if (extras.cita || extras.propiedad) {
    const cita: string[] = []
    if (extras.cita) cita.push(`🗓️ Cita: ${extras.cita}`)
    if (extras.propiedad) cita.push(`🏠 ${extras.propiedad}`)
    l.push('', ...cita)
  }

  // Las notas al final y completas: son lo que alguien escribió a mano, y
  // recortarlas es justo perder lo que no cabe en ningún campo.
  if (lleno(c.notas)) l.push('', '📝 Notas:', c.notas.trim())

  return l.join('\n')
}
