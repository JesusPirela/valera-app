// Accountability de citas: qué pasó DESPUÉS de cada cita de venta.
//
// Es un eje distinto al de citas_venta.estado_seguimiento. Ese dice si la cita
// ocurrió (Realizada, Cancelada/Reagenda, Apartó…). Este dice qué contestó el
// asesor o el prospectador cuando le preguntamos en qué quedó el cliente.
//
// Dos campos separados a propósito: una cita "Realizada" puede acabar
// descartada o en apartado, y mezclarlos en una sola columna borraría justo lo
// que se quiere medir.

import { infoEstadoCita as infoEstadoCitaLocal } from './estados-cita'

export type EstadoSeguimiento =
  | 'sin_contactar'
  | 'sin_respuesta'
  | 'mandar_opciones'
  | 'se_contactaran'
  | 'compra_futuro'
  | 'falta_credito'
  | 'descartado'
  | 'aparto_compro'

type Info = {
  label: string
  /** Lo que significa, para que dos personas no lo usen distinto. */
  ayuda: string
  color: string
  /** Fondo claro para la píldora; en oscuro se calcula con tenue(). */
  bg: string
  /** Si la oportunidad sigue viva. Alimenta el resumen de las gráficas. */
  grupo: 'pendiente' | 'viva' | 'cerrada' | 'perdida'
}

/** El orden es el del recorrido: de "no hemos preguntado" a "ya se resolvió". */
// Los colores de ESTA lista están repartidos para que ninguno se parezca a
// los de la lista de la cita (lib/estados-cita.ts): la tarjeta pinta los dos
// a la vez, uno a cada lado, y si se parecen se ve de un solo color y no dice
// nada. Pasó con 'Realizada' (#0d9488) y 'Hay que mandar opciones'
// (#1a6470): dos verdes azulados a distancia 11, indistinguibles en pantalla.
//
// El reparto se eligió midiendo, no a ojo: se barrió la rueda de color entera
// buscando el reparto que deja el par MÁS PARECIDO lo más lejos posible, con
// la condición de que cada color se vea en los dos temas (>=3:1 contra la
// tarjeta blanca y contra la oscura). El par más parecido pasó de 11 a 36.
//
// Quedan fijos a propósito: el gris de 'sin_contactar' (es el único que NO
// debe llamar la atención), el rojo de 'descartado' y el oro de
// 'aparto_compro'. Por eso los demás se movieron a donde quedaba hueco:
// rosa, morado, lima, oliva y palo de rosa. Antes de cambiar uno, vale la
// pena volver a medir.
//
// El oro de 'aparto_compro' es EL MISMO que el de 'Apartó' en estados-cita.ts,
// a propósito: son la misma noticia contada dos veces (la cita acabó en
// apartado / el cliente apartó) y pintarlas de dos colores hacía creer que
// eran cosas distintas. Si se cambia uno hay que cambiar el otro.
export const ESTADOS_SEGUIMIENTO: Record<EstadoSeguimiento, Info> = {
  sin_contactar:   { label: 'Sin contactar',            ayuda: 'Todavía no le preguntamos al asesor',            color: '#64748b', bg: '#f1f5f9', grupo: 'pendiente' },
  sin_respuesta:   { label: 'Le escribimos, no contesta', ayuda: 'Ya se le preguntó y no ha respondido',          color: '#746e39', bg: '#eeeee7', grupo: 'pendiente' },
  mandar_opciones: { label: 'Hay que mandar opciones',  ayuda: 'Le interesó pero necesita ver más propiedades',   color: '#dd409f', bg: '#fbe8f3', grupo: 'viva' },
  se_contactaran:  { label: 'Se pondrán en contacto',   ayuda: 'El asesor lo va a buscar él mismo',               color: '#9262b2', bg: '#f2ecf6', grupo: 'viva' },
  compra_futuro:   { label: 'Compra a futuro',          ayuda: 'Quiere, pero más adelante',                       color: '#829c1c', bg: '#f0f3e4', grupo: 'viva' },
  falta_credito:   { label: 'Falta crédito / perfilar', ayuda: 'Depende de resolver su crédito',                  color: '#b5697c', bg: '#f6edef', grupo: 'viva' },
  descartado:      { label: 'Descartado',               ayuda: 'Ya no va a comprar',                              color: '#9b2020', bg: '#fff1f2', grupo: 'perdida' },
  aparto_compro:   { label: 'Apartó o compró',          ayuda: 'Se cerró',                                        color: '#c87f0a', bg: '#fdf2e0', grupo: 'cerrada' },
}

export const ORDEN_SEGUIMIENTO = Object.keys(ESTADOS_SEGUIMIENTO) as EstadoSeguimiento[]

export const infoSeguimiento = (e: string | null | undefined): Info =>
  ESTADOS_SEGUIMIENTO[(e ?? 'sin_contactar') as EstadoSeguimiento] ?? ESTADOS_SEGUIMIENTO.sin_contactar

export const GRUPOS: Record<Info['grupo'], { label: string; color: string }> = {
  pendiente: { label: 'Falta preguntar', color: '#9a7018' },
  viva:      { label: 'Sigue viva',      color: '#1a6470' },
  cerrada:   { label: 'Cerrada',         color: '#c87f0a' },
  perdida:   { label: 'Perdida',         color: '#9b2020' },
}

/** Desde cuándo entra una cita al accountability. */
export const DESDE = '2026-09-01'

/**
 * La fecha que cuenta para una cita: si se apartó, manda la del apartado.
 * Misma regla que la tabla de citas de venta, para que las dos pantallas
 * metan la misma cita en el mismo mes.
 */
export function fechaEfectivaCita(f: { fecha_apartado?: string | null; fecha_cita?: string | null }): string | null {
  return f.fecha_apartado ?? f.fecha_cita ?? null
}

/** "2026-09" → "septiembre 2026", para agrupar y para los chips de mes. */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function mesDe(iso: string | null): string | null {
  if (!iso) return null
  return iso.slice(0, 7)
}
export function mesLegible(mes: string): string {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

// ── El estado VIEJO de la cita (citas_venta.estado_seguimiento) ────────────
// La lista, con sus colores y emojis, ya vive en lib/estados-cita.ts y es la
// misma que usa la tabla de citas de venta. Se reusa en vez de copiarla: dos
// listas de lo mismo acaban diciendo cosas distintas.
//
// Hace falta aquí porque mientras nadie haya puesto el estado nuevo, la
// tarjeta se pinta con el viejo: así se distinguen de un vistazo las
// reagendadas de las realizadas sin abrir nada.
export { ESTADOS_CITA_VENTA, infoEstadoCita } from './estados-cita'

/** El color del estado con el que quedó la cita. Gris si nadie lo capturó. */
export const colorEstadoCita = (e: string | null | undefined): string =>
  infoEstadoCitaLocal(e)?.color ?? '#8a94a6'

/** Las 3 preguntas de la retro, con el texto exacto que se le hizo al asesor. */
export const PREGUNTAS_RETRO = [
  { campo: 'retro_como_estuvo', titulo: '¿Cómo estuvo la cita?' },
  { campo: 'retro_info_extra',  titulo: '¿Qué información extra conseguimos?' },
  { campo: 'retro_plan_accion', titulo: '¿Cuál es el plan de acción?' },
] as const

/**
 * El mensaje que se le manda al asesor o al prospectador para preguntarle en
 * qué quedó el cliente.
 *
 * Lleva los datos de la cita porque quien lo recibe atendió decenas: sin el
 * cliente, la fecha y la propiedad tendría que adivinar de cuál le hablan, y
 * eso es exactamente lo que hace que nadie conteste.
 */
/**
 * La propiedad, como se lee en un mensaje.
 *
 * El campo trae a veces un enlace entero de un portal. Pegado en WhatsApp
 * ocupa cuatro renglones y tapa el resto del mensaje, así que de un enlace se
 * saca el texto que de verdad dice algo (el final de la dirección).
 */
function legibleLaPropiedad(txt: string): string {
  if (!/^https?:\/\//i.test(txt.trim())) return txt
  try {
    const partes = new URL(txt.trim()).pathname.split('/').filter(Boolean)
    const ultima = partes[partes.length - 1] ?? ''
    const limpio = decodeURIComponent(ultima).replace(/[-_]+/g, ' ').trim()
    if (!limpio) return txt
    return limpio.charAt(0).toUpperCase() + limpio.slice(1)
  } catch {
    return txt
  }
}

export function mensajeAccountability(args: {
  paraQuien: string
  cliente: string
  telefono?: string | null
  dia?: string | null
  propiedad?: string | null
  zona?: string | null
  estadoCita?: string | null
}): string {
  const l: string[] = []
  l.push(`Hola ${args.paraQuien.split(' ')[0]}, te escribo por una cita para ponernos al día:`)
  l.push('')
  l.push(`• Cliente: *${args.cliente}*${args.telefono ? ` (${args.telefono})` : ''}`)
  if (args.dia) l.push(`• Cita: ${args.dia}`)
  if (args.propiedad) l.push(`• Propiedad: ${legibleLaPropiedad(args.propiedad)}`)
  if (args.zona) l.push(`• Zona: ${args.zona}`)
  // "Estado de la cita" y no "quedó como": la pregunta de abajo es sobre el
  // CLIENTE, y decir las dos cosas con la misma palabra hacía que pareciera
  // que ya estábamos contestando lo que preguntamos.
  if (args.estadoCita) l.push(`• Estado de la cita: ${args.estadoCita}`)
  l.push('')
  l.push('¿Qué pasó con el cliente después? ¿Sigue interesado, hay que mandarle más opciones, o ya se descartó?')
  return l.join(String.fromCharCode(10))
}

// ── ¿A QUIÉN le estamos escribiendo? ──────────────────────────────────────
//
// `citas_venta.atendio` y `.prospecto` son TEXTO LIBRE: lo que alguien tecleó
// el día de la cita. La tarjeta decía "Copiar para el asesor: Fatima" —solo el
// primer nombre— y eso no alcanza: en la app hay DOS Fátimas activas, Fatima
// Ruiz (prospectador plus) y Fátima Gutiérrez Zarate (nuevo). Quien iba a
// mandar el mensaje no tenía forma de saber a cuál.
//
// Medido sobre las 389 citas que entran al accountability (desde el
// 1/sep/2026), tomando cada nombre distinto de "atendió" y "prospectó":
//
//   · 32 nombres (248 citas) salen de una sola persona y nadie más se llama
//     así: no hay nada que aclarar.
//   · 8 nombres (92 citas) SÍ identifican a una persona, pero hay OTRA con el
//     mismo primer nombre. Aquí es donde enseñar solo el primer nombre se
//     equivoca, y es una de cada cuatro citas.
//   · 1 nombre (1 cita) corresponde a DOS perfiles con el nombre idéntico
//     ("Andrés Valera", uno admin y otro supervisor): no se puede decidir y
//     hay que decirlo en vez de elegir uno al azar.
//   · 4 nombres (4 citas) no están capturados igual que en el perfil, pero hay
//     una sola persona con ese primer nombre: probable, no seguro.
//   · 23 nombres (44 citas) no corresponden a nadie de la app: son asesores de
//     fuera ("Javier Venegas", "Connie Gardea") o recados ("atienden alla").
//     Antes la tarjeta decía "Copiar para el asesor: Javier" como si supiera
//     quién era.

export type PersonaApp = {
  id: string
  nombre: string
  role: string | null
  telefono: string | null
  activo: boolean
}

export type QuienEs =
  /** Se sabe quién es. `exacta` false = se dedujo por el primer nombre. */
  | { tipo: 'una'; persona: PersonaApp; exacta: boolean; homonimos: PersonaApp[] }
  /** Hay varias personas que encajan y la cita no dice cuál. */
  | { tipo: 'varias'; candidatas: PersonaApp[] }
  /** Nadie en la app se llama así. */
  | { tipo: 'fuera' }

/** Minúsculas, sin acentos y con un solo espacio entre palabras. */
function clave(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const primerNombre = (s: string | null | undefined) => clave(s).split(' ')[0] ?? ''

/**
 * Quién es la persona que dice un campo de texto libre.
 *
 * El orden importa: primero se busca el nombre COMPLETO entre quienes siguen
 * activos (es lo que casi siempre acierta), luego entre quienes ya no lo
 * están —una cita vieja puede ser de alguien que se fue— y solo al final se
 * intenta por el primer nombre, que es una deducción y se marca como tal.
 *
 * Cuando encaja más de una persona NO se elige: se devuelven todas. Elegir
 * una sería inventarse el dato, que es exactamente lo que hacía el primer
 * nombre a secas.
 */
export function quienEs(texto: string | null | undefined, gente: PersonaApp[]): QuienEs {
  const k = clave(texto)
  if (!k) return { tipo: 'fuera' }

  const activos = gente.filter(p => p.activo)
  const exactas = (lista: PersonaApp[]) => lista.filter(p => clave(p.nombre) === k)

  let candidatas = exactas(activos)
  let exacta = true
  if (candidatas.length === 0) candidatas = exactas(gente.filter(p => !p.activo))
  if (candidatas.length === 0) {
    candidatas = activos.filter(p => primerNombre(p.nombre) === primerNombre(k))
    exacta = false
  }

  if (candidatas.length === 0) return { tipo: 'fuera' }
  if (candidatas.length > 1) return { tipo: 'varias', candidatas }

  const persona = candidatas[0]
  // Los homónimos son los OTROS que comparten el primer nombre. No cambian a
  // quién le escribes; cambian que tengas que leer el apellido antes de
  // mandarlo.
  const homonimos = activos.filter(p =>
    p.id !== persona.id && primerNombre(p.nombre) === primerNombre(persona.nombre))
  return { tipo: 'una', persona, exacta, homonimos }
}
