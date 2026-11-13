// Coordinación de citas: el número al que se le escribe y cómo se arma el
// mensaje.
//
// Esto vivía SOLO dentro de detalle-propiedad.tsx. Al poder agendar también
// desde la ficha del cliente harían falta dos copias, y dos copias de un
// mensaje se separan: alguien agrega un dato en una y la otra se queda atrás.
// Por eso está aquí, y las dos pantallas lo importan.

/** Número centralizado de contacto Valera (WhatsApp + llamadas). */
export const VALERA_PHONE = '4428679083'
/** El mismo, en formato internacional sin "+", como lo pide wa.me. */
export const VALERA_WA = `52${VALERA_PHONE}`

export const TIPOS_CREDITO_LABEL: Record<string, string> = {
  infonavit: 'Infonavit',
  fovisste: 'Fovisste',
  bancario: 'Bancario',
  contado: 'Contado',
  otro: 'Otro',
}

/** Lo que se sabe del cliente y sirve para coordinar. Todo opcional menos el nombre. */
export type ClienteParaCita = {
  nombre: string
  telefono?: string | null
  tipo_operacion?: 'venta' | 'renta' | 'captacion' | string | null
  nivel_interes?: 'alto' | 'medio' | 'bajo' | string | null
  email?: string | null
  tipo_credito?: string | null
  presupuesto?: string | null
  zona_busqueda?: string | null
  num_personas?: string | null
  tiene_mascotas?: boolean | null
  detalle_mascotas?: string | null
  fecha_mudanza?: string | null
  problemas_poliza?: boolean | null
}

/**
 * Los datos del cliente que le sirven a quien coordina, en viñetas.
 *
 * Cambia según la operación a propósito: a quien coordina una VENTA le importa
 * el crédito; a quien coordina una RENTA le importan las mascotas y la póliza.
 * Un dato que no está capturado NO se inventa ni se rellena: simplemente no
 * sale en el mensaje.
 */
export function construirInfoCliente(cliente: ClienteParaCita): string {
  const datos: string[] = []
  if (cliente.nivel_interes) {
    const label = ({ alto: '🔥 Alto', medio: '🌡️ Medio', bajo: '❄️ Bajo' } as Record<string, string>)[cliente.nivel_interes]
    if (label) datos.push(`• Nivel de interés: ${label}`)
  }
  if (cliente.tipo_operacion === 'venta') {
    if (cliente.email) datos.push(`• Email: ${cliente.email}`)
    if (cliente.tipo_credito) datos.push(`• Tipo de crédito: ${TIPOS_CREDITO_LABEL[cliente.tipo_credito] ?? cliente.tipo_credito}`)
    if (cliente.presupuesto) datos.push(`• Presupuesto: ${cliente.presupuesto}`)
    if (cliente.zona_busqueda) datos.push(`• Zona de búsqueda: ${cliente.zona_busqueda}`)
  } else if (cliente.tipo_operacion === 'renta') {
    if (cliente.num_personas) datos.push(`• Personas: ${cliente.num_personas}`)
    if (cliente.tiene_mascotas != null) {
      datos.push(`• Mascotas: ${cliente.tiene_mascotas ? `Sí${cliente.detalle_mascotas ? ` (${cliente.detalle_mascotas})` : ''}` : 'No'}`)
    }
    if (cliente.fecha_mudanza) datos.push(`• Mudanza: ${cliente.fecha_mudanza}`)
    if (cliente.presupuesto) datos.push(`• Presupuesto: ${cliente.presupuesto}`)
    if (cliente.zona_busqueda) datos.push(`• Zonas de interés: ${cliente.zona_busqueda}`)
    if (cliente.problemas_poliza != null) datos.push(`• Problemas con póliza: ${cliente.problemas_poliza ? 'Sí' : 'No'}`)
  }
  return datos.length > 0 ? `\n${datos.join('\n')}` : ''
}

/** La fecha de la cita como se escribe en el mensaje: "lunes 24 de noviembre, 10:00". */
export function fechaCitaLegible(fecha: Date): string {
  return fecha.toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
}

type ArgsMensaje = {
  cliente: ClienteParaCita
  /** Código de la propiedad (VR-1701) o el texto libre si es de fuera. */
  propiedad: string
  /** Nombre de la constructora, si aplica. */
  constructora?: string | null
  fecha: Date
  /** true cuando se está moviendo una cita que ya existía. */
  reagenda?: boolean
}

/** El mensaje de WhatsApp para coordinar (o mover) una cita. */
export function mensajeCoordinacion({ cliente, propiedad, constructora, fecha, reagenda }: ArgsMensaje): string {
  const quien = `*${cliente.nombre}*${cliente.telefono ? ` (${cliente.telefono})` : ''}`
  const dond = `*${propiedad}*${constructora ? ` (${constructora})` : ''}`
  const cuando = `*${fechaCitaLegible(fecha)}*`
  const info = construirInfoCliente(cliente)
  return reagenda
    ? `Hola, necesito *mover* la cita de ${quien} para la propiedad ${dond}. La nueva fecha es el ${cuando}.${info}`
    : `Hola, quiero coordinar una cita para ${quien} para la propiedad ${dond} el ${cuando}.${info}`
}

/** El enlace de WhatsApp listo para abrir con ese mensaje. */
export const enlaceWhatsAppValera = (mensaje: string) =>
  `https://wa.me/${VALERA_WA}?text=${encodeURIComponent(mensaje)}`
