// Calificación de las citas de venta con el marco de El Principio de Oz
// (Roger Connors, Tom Smith y Craig Hickman).
//
// El libro parte de una línea. Debajo está el ciclo de la víctima: ignorar el
// problema, "no es mi trabajo", culpar a otros, confusión, cubrirse las
// espaldas y esperar a ver qué pasa. Arriba están cuatro pasos: VERLO,
// ASUMIRLO, RESOLVERLO y HACERLO. Accountability, en el libro, es el puente
// que lleva de una cosa a la otra.
//
// Lo que hace este archivo es traducir esos cuatro pasos a algo que se pueda
// contar con los datos que la app ya guarda, sin inventar nada:
//
//   VERLO      ¿quedó anotado qué pasó en la cita?
//              Una cita que ya pasó y sigue sin resultado es, literalmente,
//              ignorar el problema: el primer escalón del ciclo de la víctima.
//
//   ASUMIRLO   ¿alguien escribió la retro, o la cita quedó huérfana?
//              Escribir qué pasó y cuál fue tu parte es el paso de asumirlo.
//
//   RESOLVERLO de las citas que salieron mal, ¿en cuántas quedó un siguiente
//              paso? El libro lo resume en una pregunta: "¿qué más puedo
//              hacer?". Una reagenda sin plan, sin próximo seguimiento y sin
//              cita nueva es esperar a ver qué pasa.
//
//   HACERLO    ¿se realizó la cita y se apartó?
//
// ⚠️ Lo que hay que saber de estos datos, porque cambia cómo se leen. Todo
// esto está medido, no supuesto:
//
//  · De 961 citas, 758 vienen del Excel viejo y solo el 9% tiene resultado
//    anotado. Las hechas en la app tienen resultado en el 93%. Calificar a
//    alguien por filas de Excel que nadie iba a llenar sería injusto, así que
//    las del Excel NO cuentan para las calificaciones y la pantalla dice
//    cuántas dejó fuera.
//
//  · El campo "atendió" es TEXTO LIBRE y está sucio: "atienden alla", "MTY",
//    "Videollamada", "No se hizo". Nada de eso es una persona. Por eso aquí
//    solo cuenta como dueño el que trae asesor_id, o el texto que coincide con
//    el nombre de alguien del equipo. El resto cae en "sin dueño", que es su
//    propio hallazgo y no se esconde.
//
//  · Hay muy poco volumen por persona: en 90 días solo 4 asesores pasaron de
//    10 citas. Un porcentaje sobre 3 citas no es un porcentaje, es ruido. Por
//    eso las tasas se encogen hacia el promedio del equipo (ver tasaAjustada)
//    y la pantalla siempre enseña sobre cuántas citas está calculada.

// ─── Lo que necesita de cada cita ────────────────────────────────────────────
export type CitaParaGrafica = {
  id?: string | null
  fecha_cita: string | null
  /** Si está apartada y tiene esta fecha, manda sobre la de la cita. */
  fecha_apartado?: string | null
  atendio: string | null
  asesor_id?: string | null
  prospecto: string | null
  coordino: string | null
  estado_seguimiento: string | null
  retro_completada_at?: string | null
  retro_como_estuvo?: string | null
  retro_plan_accion?: string | null
  fecha_prox_seguimiento?: string | null
  zona_interesada?: string | null
  interesado_en?: string | null
  telefono?: string | null
  cliente_nombre?: string | null
  /** 'excel' = fila del Excel viejo; no cuenta para calificar. */
  origen?: string | null
}

/** Los normalizadores de la pantalla, para no tener dos versiones de la verdad. */
export type Ayudas = {
  normalizar: (s: string) => string
  mapear: (s: string | undefined) => string
  esApartado: (s: string | null | undefined) => boolean
  esCancelada: (s: string | null | undefined) => boolean
  esReagendada: (s: string | null | undefined) => boolean
  /** id → nombre, para reconocer al equipo y saber qué texto es una persona. */
  nombrePorId: Record<string, string>
}

export type Resultado = 'aparto' | 'realizada' | 'reagendada' | 'cancelada' | 'otro' | 'sin'

export const SIN_DUENO = 'Sin dueño asignado'

// Cuánto pesa cada paso en la calificación final. Están aquí, a la vista, para
// que se puedan mover sin buscarlos entre el código. Hacerlo pesa más porque
// el libro se llama "logrando resultados": asumir sin resultado no basta.
export const PESOS = { verlo: 20, asumirlo: 20, resolverlo: 25, hacerlo: 35 }

// Con cuántas citas de "prior" se encoge una tasa hacia el promedio del
// equipo. Con k=5, alguien con 2 de 2 no sale con el 100%: sale cerca del
// promedio, y conforme acumula citas su número propio pesa más. Es lo que
// evita que el primero de la lista sea siempre el que tuvo una buena tarde.
export const K_ENCOGIMIENTO = 5

// El mínimo para que una calificación se muestre como tal. Por debajo se
// enseña igual, pero marcada como que todavía no alcanza para juzgar.
export const MINIMO_PARA_CALIFICAR = 5

// Dónde cae la línea del libro. Son cortes absolutos a propósito y no contra
// el promedio del equipo: si la línea fuera el promedio, la mitad del equipo
// estaría siempre debajo por definición, y eso no es lo que el libro dice.
export const CORTE_SOBRE_LA_LINEA = 70
export const CORTE_EN_LA_LINEA = 40

// ─── Una cita, con sus hechos a la vista ─────────────────────────────────────
export type CitaClasificada = {
  cita: CitaParaGrafica
  /** Cuenta para calificar (no viene del Excel viejo). */
  evaluable: boolean
  /** La fecha de la cita ya pasó, así que ya debería tener resultado. */
  yaPaso: boolean
  resultado: Resultado
  /** Salió mal: se reagendó o se canceló. */
  salioMal: boolean
  tieneResultado: boolean
  /** Dueño reconocible: asesor_id, o un texto que es el nombre de alguien. */
  duenoNombre: string | null
  duenoLlave: string
  tieneRetro: boolean
  tienePlan: boolean
  tieneProxSeguimiento: boolean
  /** Quedó algún siguiente paso de cualquier tipo. */
  tieneSiguientePaso: boolean
  /** Con qué cliente es, para rastrear si una reagenda se volvió a agendar. */
  persona: string
  zona: string | null
}

const limpio = (v: string | null | undefined) => (v ?? '').trim()
const vacio = (v: string | null | undefined) => limpio(v).length === 0

export function clasificar(filas: CitaParaGrafica[], a: Ayudas): CitaClasificada[] {
  const ahora = Date.now()

  // Los nombres del equipo, normalizados. Sirven para distinguir "Gimar Salas"
  // (una persona) de "atienden alla" (no una persona).
  const delEquipo = new Set(
    Object.values(a.nombrePorId).filter(Boolean).map(n => a.normalizar(n)),
  )

  return filas.map(f => {
    const e = f.estado_seguimiento
    let resultado: Resultado
    if (vacio(e)) resultado = 'sin'
    else if (a.esApartado(e)) resultado = 'aparto'
    else if (a.esCancelada(e)) resultado = 'cancelada'
    else if (a.esReagendada(e)) resultado = 'reagendada'
    else {
      // "Esperando retroalimentación" es la etiqueta que el tablero del asesor
      // le pone al estado 'realizada': la cita SÍ ocurrió, solo falta la retro.
      const n = a.normalizar(e!)
      resultado = (n.includes('realizada') || n.includes('esperando retro')) ? 'realizada' : 'otro'
    }

    // ── El dueño ──
    const porId = f.asesor_id ? a.nombrePorId[f.asesor_id] : undefined
    const texto = limpio(f.atendio)
    let duenoNombre: string | null = null
    let duenoLlave = 'sin'
    if (porId) {
      duenoNombre = porId
      duenoLlave = `id:${f.asesor_id}`
    } else if (texto) {
      const mapeado = a.mapear(texto)
      const norm = a.normalizar(mapeado)
      // Solo si el texto es el nombre de alguien del equipo cuenta como dueño.
      if (delEquipo.has(norm)) {
        duenoNombre = mapeado
        duenoLlave = `tx:${norm}`
      }
    }

    const tienePlan = !vacio(f.retro_plan_accion)
    const tieneProx = !vacio(f.fecha_prox_seguimiento)
    const fechaRef = f.fecha_apartado || f.fecha_cita
    const t = fechaRef ? Date.parse(fechaRef) : NaN

    return {
      cita: f,
      evaluable: limpio(f.origen).toLowerCase() !== 'excel',
      yaPaso: Number.isFinite(t) ? t < ahora : false,
      resultado,
      salioMal: resultado === 'reagendada' || resultado === 'cancelada',
      tieneResultado: resultado !== 'sin',
      duenoNombre,
      duenoLlave,
      tieneRetro: !!f.retro_completada_at || !vacio(f.retro_como_estuvo),
      tienePlan,
      tieneProxSeguimiento: tieneProx,
      tieneSiguientePaso: tienePlan || tieneProx,
      // El teléfono es la llave buena; si falta, el nombre normalizado.
      persona: limpio(f.telefono) || a.normalizar(limpio(f.cliente_nombre)),
      zona: vacio(f.zona_interesada) ? null : limpio(f.zona_interesada),
    }
  })
}

// ─── Encoger una tasa hacia el promedio ──────────────────────────────────────
/**
 * Una tasa honesta cuando hay pocas citas.
 *
 * Con 2 de 2 citas apartadas, la tasa cruda dice 100% y pone a esa persona
 * arriba de alguien con 14 de 20. No porque sea mejor, sino porque tuvo menos
 * oportunidades de fallar. Esto mezcla su resultado con el del equipo, pesando
 * el del equipo como si fueran K citas más: con pocas citas el número se acerca
 * al promedio, y conforme acumula, el suyo manda. Es el ajuste que usan los
 * rankings cuando las muestras son chicas.
 *
 * Devuelve null si no hay ni una cita: cero citas no es cero por ciento, es que
 * no se sabe. Son cosas distintas y confundirlas es el error clásico.
 */
export function tasaAjustada(
  exitos: number, n: number, tasaEquipo: number, k = K_ENCOGIMIENTO,
): number | null {
  if (n <= 0) return null
  return ((exitos + k * tasaEquipo) / (n + k)) * 100
}

const tasa = (exitos: number, n: number) => (n > 0 ? exitos / n : 0)

// ─── Los cuatro pasos, de una persona o de toda la operación ─────────────────
export type CuatroPasos = {
  /** Anotó qué pasó: resultado / citas que ya pasaron. */
  verlo: number | null
  verloBase: number
  verloExitos: number
  /** Escribió la retro: retros / citas que ya pasaron. */
  asumirlo: number | null
  asumirloBase: number
  asumirloExitos: number
  /** De las que salieron mal, en cuántas quedó un siguiente paso. */
  resolverlo: number | null
  resolverloBase: number
  resolverloExitos: number
  /** Se realizó o apartó: (realizadas + apartó) / citas con resultado. */
  hacerlo: number | null
  hacerloBase: number
  hacerloExitos: number
}

type Crudo = { v: [number, number]; a: [number, number]; r: [number, number]; h: [number, number] }

function contarPasos(cs: CitaClasificada[]): Crudo {
  const pasadas = cs.filter(c => c.yaPaso)
  const conResultado = cs.filter(c => c.tieneResultado)
  const malas = cs.filter(c => c.salioMal)
  return {
    v: [pasadas.filter(c => c.tieneResultado).length, pasadas.length],
    a: [pasadas.filter(c => c.tieneRetro).length, pasadas.length],
    r: [malas.filter(c => c.tieneSiguientePaso).length, malas.length],
    h: [conResultado.filter(c => c.resultado === 'realizada' || c.resultado === 'aparto').length, conResultado.length],
  }
}

// ─── La calificación de una persona ──────────────────────────────────────────
export type Persona = {
  llave: string
  nombre: string
  citas: number
  pasos: CuatroPasos
  /** 0 a 100, promedio pesado de los cuatro pasos que se pudieron calcular. */
  calificacion: number | null
  /** Dónde cae en la línea del libro. */
  donde: 'sobre' | 'en' | 'bajo' | 'sin_datos'
  /** Alcanza el mínimo de citas para tomarse en serio. */
  confiable: boolean
  /** Cuentas crudas, para enseñarlas junto al porcentaje. */
  aparto: number
  realizadas: number
  reagendadas: number
  canceladas: number
  sinResultado: number
}

function armarPasos(crudo: Crudo, equipo: Crudo): CuatroPasos {
  return {
    verlo:      tasaAjustada(crudo.v[0], crudo.v[1], tasa(equipo.v[0], equipo.v[1])),
    verloBase: crudo.v[1], verloExitos: crudo.v[0],
    asumirlo:   tasaAjustada(crudo.a[0], crudo.a[1], tasa(equipo.a[0], equipo.a[1])),
    asumirloBase: crudo.a[1], asumirloExitos: crudo.a[0],
    resolverlo: tasaAjustada(crudo.r[0], crudo.r[1], tasa(equipo.r[0], equipo.r[1])),
    resolverloBase: crudo.r[1], resolverloExitos: crudo.r[0],
    hacerlo:    tasaAjustada(crudo.h[0], crudo.h[1], tasa(equipo.h[0], equipo.h[1])),
    hacerloBase: crudo.h[1], hacerloExitos: crudo.h[0],
  }
}

function calificar(p: CuatroPasos): number | null {
  const partes: [number, number][] = []
  if (p.verlo      !== null) partes.push([p.verlo, PESOS.verlo])
  if (p.asumirlo   !== null) partes.push([p.asumirlo, PESOS.asumirlo])
  if (p.resolverlo !== null) partes.push([p.resolverlo, PESOS.resolverlo])
  if (p.hacerlo    !== null) partes.push([p.hacerlo, PESOS.hacerlo])
  if (partes.length === 0) return null
  // Se reparte entre los pasos que SÍ se pudieron calcular. A quien no tuvo
  // ninguna cita que saliera mal no se le castiga por no tener "resolverlo":
  // no tuvo nada que resolver.
  const peso = partes.reduce((s, [, w]) => s + w, 0)
  return partes.reduce((s, [v, w]) => s + v * w, 0) / peso
}

function donde(c: number | null, confiable: boolean): Persona['donde'] {
  if (c === null || !confiable) return 'sin_datos'
  if (c >= CORTE_SOBRE_LA_LINEA) return 'sobre'
  if (c >= CORTE_EN_LA_LINEA) return 'en'
  return 'bajo'
}

/**
 * Califica a cada persona por el papel que pidas.
 *
 * - 'dueno'        quien atendió la cita (asesor). Solo cuenta a los que se
 *                  pueden reconocer; el resto se junta en "sin dueño".
 * - 'prospecto'    quien la prospectó, por el campo de texto libre.
 * - 'coordino'     quien la coordinó, igual por texto libre.
 */
export function calificarPersonas(
  cs: CitaClasificada[],
  papel: 'dueno' | 'prospecto' | 'coordino',
  a: Ayudas,
): { personas: Persona[]; sinDueno: CitaClasificada[]; equipo: CuatroPasos } {
  const evaluables = cs.filter(c => c.evaluable)
  const equipoCrudo = contarPasos(evaluables)

  const grupos = new Map<string, { nombre: string; citas: CitaClasificada[] }>()
  const sinDueno: CitaClasificada[] = []

  for (const c of evaluables) {
    let llave: string
    let nombre: string
    if (papel === 'dueno') {
      if (!c.duenoNombre) { sinDueno.push(c); continue }
      llave = c.duenoLlave
      nombre = c.duenoNombre
    } else {
      const texto = limpio(c.cita[papel])
      if (!texto) { sinDueno.push(c); continue }
      nombre = a.mapear(texto)
      llave = a.normalizar(nombre)
    }
    if (!grupos.has(llave)) grupos.set(llave, { nombre, citas: [] })
    grupos.get(llave)!.citas.push(c)
  }

  const personas: Persona[] = [...grupos.entries()].map(([llave, g]) => {
    const pasos = armarPasos(contarPasos(g.citas), equipoCrudo)
    const calificacion = calificar(pasos)
    const confiable = g.citas.length >= MINIMO_PARA_CALIFICAR
    return {
      llave,
      nombre: g.nombre,
      citas: g.citas.length,
      pasos,
      calificacion,
      confiable,
      donde: donde(calificacion, confiable),
      aparto:       g.citas.filter(c => c.resultado === 'aparto').length,
      realizadas:   g.citas.filter(c => c.resultado === 'realizada').length,
      reagendadas:  g.citas.filter(c => c.resultado === 'reagendada').length,
      canceladas:   g.citas.filter(c => c.resultado === 'cancelada').length,
      sinResultado: g.citas.filter(c => !c.tieneResultado).length,
    }
  })

  // Los que no alcanzan el mínimo van al final: siguen a la vista, pero no se
  // mezclan con los que sí tienen suficientes citas para compararse.
  personas.sort((x, y) => {
    if (x.confiable !== y.confiable) return x.confiable ? -1 : 1
    return (y.calificacion ?? -1) - (x.calificacion ?? -1)
  })

  return { personas, sinDueno, equipo: armarPasos(equipoCrudo, equipoCrudo) }
}

// ─── La operación completa ───────────────────────────────────────────────────
export type ResumenOrganizacional = {
  total: number
  delExcel: number
  evaluables: number
  pasadas: number
  pasos: CuatroPasos
  calificacion: number | null
  /** Citas sin un dueño reconocible. Es el paso ASUMIRLO de la organización. */
  sinDueno: number
  conDueno: number
  /** % de reagendas de las que no tienen dueño, contra las que sí. */
  reagendaSinDueno: number | null
  reagendaConDueno: number | null
}

export function resumenOrganizacional(cs: CitaClasificada[]): ResumenOrganizacional {
  const evaluables = cs.filter(c => c.evaluable)
  const crudo = contarPasos(evaluables)
  const pasos = armarPasos(crudo, crudo)

  const sin = evaluables.filter(c => !c.duenoNombre)
  const con = evaluables.filter(c => !!c.duenoNombre)
  const pctReag = (l: CitaClasificada[]) =>
    l.length > 0 ? (l.filter(c => c.resultado === 'reagendada').length / l.length) * 100 : null

  return {
    total: cs.length,
    delExcel: cs.length - evaluables.length,
    evaluables: evaluables.length,
    pasadas: evaluables.filter(c => c.yaPaso).length,
    pasos,
    calificacion: calificar(pasos),
    sinDueno: sin.length,
    conDueno: con.length,
    reagendaSinDueno: pctReag(sin),
    reagendaConDueno: pctReag(con),
  }
}

// ─── El ciclo de la víctima, con firma en los datos ──────────────────────────
// Cada escalón del ciclo deja un rastro distinto. No se adivina la intención de
// nadie: se cuenta el rastro y se deja la lista para que se pueda abrir y ver.
export type EscalonVictima = {
  clave: string
  nombre: string
  /** Qué significa, en una línea, para quien no leyó el libro. */
  explica: string
  /** Qué se contó exactamente, para que nadie tenga que adivinarlo. */
  comoSeMide: string
  citas: CitaClasificada[]
}

export function cicloVictima(cs: CitaClasificada[]): EscalonVictima[] {
  const ev = cs.filter(c => c.evaluable)
  const pasadas = ev.filter(c => c.yaPaso)

  return [
    {
      clave: 'ignorar',
      nombre: 'Ignorarlo',
      explica: 'La cita ya pasó y nadie anotó qué salió de ella.',
      comoSeMide: 'Citas con fecha ya cumplida y el resultado en blanco.',
      citas: pasadas.filter(c => !c.tieneResultado),
    },
    {
      clave: 'no_es_mi_trabajo',
      nombre: 'No es mi trabajo',
      explica: 'La cita no tiene un dueño reconocible, así que no es de nadie.',
      comoSeMide: 'Sin asesor asignado, y el texto de «atendió» no es alguien del equipo.',
      citas: ev.filter(c => !c.duenoNombre),
    },
    {
      clave: 'confusion',
      nombre: 'Confusión',
      explica: 'Nadie apuntó qué buscaba el cliente, así que no hay con qué trabajarlo.',
      comoSeMide: 'Sin zona de interés y sin lo que le interesaba.',
      citas: ev.filter(c => !c.zona && !c.cita.interesado_en?.trim()),
    },
    {
      clave: 'cubrirse',
      nombre: 'Cubrirse las espaldas',
      explica: 'Se escribió la retro, pero sin un siguiente paso: cumple el trámite y no resuelve.',
      comoSeMide: 'Con retro escrita, y sin plan de acción ni próximo seguimiento.',
      citas: pasadas.filter(c => c.tieneRetro && !c.tieneSiguientePaso),
    },
    {
      clave: 'esperar',
      nombre: 'Esperar a ver qué pasa',
      explica: 'La cita se cayó y ahí quedó: ni plan, ni próxima fecha, ni cita nueva.',
      comoSeMide: 'Reagendada o cancelada, sin siguiente paso y sin otra cita después.',
      citas: ev.filter(c => c.salioMal && !c.tieneSiguientePaso && !seVolvioAAgendar(c, ev)),
    },
  ]
}

// ─── Reagendas ───────────────────────────────────────────────────────────────
function fechaDe(c: CitaClasificada): number {
  const f = c.cita.fecha_apartado || c.cita.fecha_cita
  const t = f ? Date.parse(f) : NaN
  return Number.isFinite(t) ? t : 0
}

/** ¿Esta persona volvió a tener cita después de esta? */
function seVolvioAAgendar(c: CitaClasificada, todas: CitaClasificada[]): boolean {
  if (!c.persona) return false
  const t = fechaDe(c)
  return todas.some(o => o !== c && o.persona === c.persona && fechaDe(o) > t)
}

/**
 * ¿El estado de esta cita menciona una reagenda, de cualquier forma?
 *
 * Hace falta aparte de `resultado === 'reagendada'` por esto: la tabla cuenta
 * "CANCELADA/REAGENDA" como CANCELADA, no como reagendada, porque ahí manda la
 * cancelación y así están los colores. Eso se respeta para no tener dos
 * verdades sobre la misma pantalla.
 *
 * Pero el apartado de reagendas es justo sobre reagendas, y de 257 citas con
 * resultado, 64 dicen "reagendada" y otras 32 dicen "cancelada/reagenda".
 * Dejar fuera esas 32 sería esconder un tercio del problema, así que aquí se
 * cuentan las dos y la pantalla lo dice.
 */
export function mencionaReagenda(c: CitaClasificada, a: Ayudas): boolean {
  return a.normalizar(c.cita.estado_seguimiento ?? '').includes('reagend')
}

export type AnalisisReagendas = {
  total: number
  /** De esas, cuántas la tabla cuenta como canceladas por decir "cancelada/reagenda". */
  tambienCanceladas: number
  /** Volvieron a tener una cita después. */
  recuperadas: number
  /** Y de esas, acabaron en apartado o realizada. */
  recuperadasBien: number
  /** Ni cita nueva, ni plan, ni próxima fecha. */
  abandonadas: number
  conSiguientePaso: number
  tasaRecuperacion: number | null
  /** Las que siguen vivas y se pueden rescatar hoy. */
  rescatables: CitaClasificada[]
}

export function analizarReagendas(cs: CitaClasificada[], a: Ayudas): AnalisisReagendas {
  const ev = cs.filter(c => c.evaluable)
  const reag = ev.filter(c => mencionaReagenda(c, a))
  const recuperadas = reag.filter(c => seVolvioAAgendar(c, ev))
  const recuperadasBien = recuperadas.filter(c =>
    ev.some(o => o.persona === c.persona && fechaDe(o) > fechaDe(c)
      && (o.resultado === 'aparto' || o.resultado === 'realizada')),
  )
  const abandonadas = reag.filter(c => !seVolvioAAgendar(c, ev) && !c.tieneSiguientePaso)

  return {
    total: reag.length,
    tambienCanceladas: reag.filter(c => c.resultado === 'cancelada').length,
    recuperadas: recuperadas.length,
    recuperadasBien: recuperadasBien.length,
    abandonadas: abandonadas.length,
    conSiguientePaso: reag.filter(c => c.tieneSiguientePaso).length,
    tasaRecuperacion: reag.length > 0 ? (recuperadas.length / reag.length) * 100 : null,
    // Las más recientes primero: son las que todavía se pueden rescatar.
    rescatables: [...abandonadas].sort((a, b) => fechaDe(b) - fechaDe(a)),
  }
}

// ─── Por zona ────────────────────────────────────────────────────────────────
export type Zona = {
  nombre: string
  /** Todas las citas de la zona, Excel incluido: es la demanda que hubo. */
  citasTotales: number
  /** Las que cuentan para las tasas (sin Excel). */
  citas: number
  conResultado: number
  aparto: number
  realizadas: number
  reagendadas: number
  canceladas: number
  sinResultado: number
  /** Encogida hacia el promedio, como las de las personas. */
  tasaApartado: number | null
  tasaReagenda: number | null
}

/**
 * Las zonas, con una distinción que importa: el VOLUMEN sale de todas las
 * citas y las TASAS solo de las evaluables.
 *
 * Es que la zona sí está capturada en el Excel viejo (61% de esas filas la
 * traen), pero el resultado no (9%). Si el volumen se limitara a las citas de
 * la app, Real Solare pasaría de 150 citas a 17 y se vería como una zona
 * menor, cuando es de lejos la que más demanda tiene. Y si las tasas usaran el
 * Excel, saldrían calculadas sobre filas vacías. Así que cada número usa la
 * base que le corresponde, y la pantalla enseña las dos.
 */
export function porZona(cs: CitaClasificada[]): { zonas: Zona[]; sinZona: number } {
  const ev = cs.filter(c => c.evaluable)
  const conResultadoTodas = ev.filter(c => c.tieneResultado)
  const tasaEquipoApart = tasa(conResultadoTodas.filter(c => c.resultado === 'aparto').length, conResultadoTodas.length)
  const tasaEquipoReag = tasa(conResultadoTodas.filter(c => c.resultado === 'reagendada').length, conResultadoTodas.length)

  // El volumen cuenta TODAS las citas de la zona; las tasas, solo las de la app.
  const totales = new Map<string, number>()
  let sinZona = 0
  for (const c of cs) {
    if (!c.zona) { if (c.evaluable) sinZona++; continue }
    totales.set(c.zona, (totales.get(c.zona) ?? 0) + 1)
  }

  const m = new Map<string, CitaClasificada[]>()
  for (const c of ev) {
    if (!c.zona) continue
    if (!m.has(c.zona)) m.set(c.zona, [])
    m.get(c.zona)!.push(c)
  }
  // Una zona que solo aparece en el Excel sigue siendo demanda, así que
  // aparece con su volumen y sin tasas, en vez de desaparecer.
  for (const z of totales.keys()) if (!m.has(z)) m.set(z, [])

  const zonas: Zona[] = [...m.entries()].map(([nombre, lista]) => {
    const conRes = lista.filter(c => c.tieneResultado)
    const aparto = lista.filter(c => c.resultado === 'aparto').length
    const reag = lista.filter(c => c.resultado === 'reagendada').length
    return {
      nombre,
      citasTotales: totales.get(nombre) ?? lista.length,
      citas: lista.length,
      conResultado: conRes.length,
      aparto,
      realizadas:   lista.filter(c => c.resultado === 'realizada').length,
      reagendadas:  reag,
      canceladas:   lista.filter(c => c.resultado === 'cancelada').length,
      sinResultado: lista.filter(c => !c.tieneResultado).length,
      tasaApartado: tasaAjustada(aparto, conRes.length, tasaEquipoApart),
      tasaReagenda: tasaAjustada(reag, conRes.length, tasaEquipoReag),
    }
  }).sort((a, b) => b.citasTotales - a.citasTotales)

  return { zonas, sinZona }
}

// ─── El embudo ───────────────────────────────────────────────────────────────
export type PasoEmbudo = { nombre: string; n: number; nota: string }

export function embudo(cs: CitaClasificada[]): PasoEmbudo[] {
  const ev = cs.filter(c => c.evaluable)
  const pasadas = ev.filter(c => c.yaPaso)
  const conRes = pasadas.filter(c => c.tieneResultado)
  const ocurrieron = conRes.filter(c => c.resultado === 'realizada' || c.resultado === 'aparto')
  const apartaron = conRes.filter(c => c.resultado === 'aparto')
  return [
    { nombre: 'Agendadas',   n: pasadas.length,    nota: 'Citas con fecha ya cumplida' },
    { nombre: 'Con resultado anotado', n: conRes.length, nota: 'Alguien escribió qué pasó' },
    { nombre: 'Se realizaron', n: ocurrieron.length, nota: 'La cita de verdad ocurrió' },
    { nombre: 'Apartaron',   n: apartaron.length,  nota: 'Acabó en apartado' },
  ]
}
