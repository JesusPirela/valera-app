// Mini apartado de gráficas para la tabla de citas de venta.
//
// No hace consultas: la pantalla ya trae las 900+ filas en memoria, así que
// todo se calcula aquí. Abrirlo y cerrarlo no cuesta red.
//
// ⚠️ Lo que hay que saber de estos datos, porque cambia cómo se leen:
//
//  · El campo "atendió" es TEXTO LIBRE y está sucio. De 909 citas, 489 no
//    tienen a nadie anotado. Hay "atienden alla", "MTY", "FATIMA ME PARECE",
//    y "Gimar" aparece aparte de "Gimar Salas". Por eso se agrupa por
//    asesor_id cuando existe (llave limpia; se comprobó que coincide con el
//    texto en las 329 filas donde están los dos) y por el texto normalizado
//    cuando no. Lo que no tiene a nadie se muestra en su propia barra
//    "Sin asesor anotado" en vez de esconderse: así se ve el hueco.
//
//  · El "estado de seguimiento" también está sucio: "realizada"/"Realizada",
//    "REAGENDADA"/"Reagenda", "APARTADO"/"apartado". Se agrupa con los mismos
//    normalizadores que ya usa la tabla para colorear, para que una cita no
//    cuente en dos lados.
//
//  · 718 de 909 citas NO tienen estado. Casi todas vienen del Excel viejo. Las
//    gráficas de resultado dicen el total sobre el que están calculadas, para
//    que un 80% no se lea como "80% de todas las citas".
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useColors } from '../lib/ThemeContext'
import { COL, Dona, BarraAsesor, BarrasPeriodo, Leyenda, s } from './graficas-base'

// ─── Lo que necesita de cada cita ────────────────────────────────────────────
export type CitaParaGrafica = {
  fecha_cita: string | null
  atendio: string | null
  asesor_id?: string | null
  prospecto: string | null
  coordino: string | null
  estado_seguimiento: string | null
  retro_completada_at?: string | null
}

type Props = {
  filas: CitaParaGrafica[]
  /** id → nombre, para agrupar por la llave limpia cuando la cita la trae. */
  nombrePorId?: Record<string, string>
  /** Normalizador y mapeo de apodos de la pantalla, para no duplicarlos. */
  normalizar: (s: string) => string
  mapear: (s: string | undefined) => string
  esApartado: (s: string | null | undefined) => boolean
  esCancelada: (s: string | null | undefined) => boolean
  esReagendada: (s: string | null | undefined) => boolean
}

const SIN_ASESOR = 'Sin asesor anotado'
// La cola de "atendió" tiene 50+ nombres, muchos con una sola cita y varios que
// ni son personas ("Videollamada", "atendio el asesor de alla"). Se muestran
// los primeros y el resto queda detrás de un botón, en vez de esconderlos.
const TOPE_LISTA = 15

// ─── El apartado ─────────────────────────────────────────────────────────────
export default function GraficasCitas({
  filas, nombrePorId = {}, normalizar, mapear, esApartado, esCancelada, esReagendada,
}: Props) {
  const C = useColors()
  const [verTodos, setVerTodos] = useState(false)

  const d = useMemo(() => {
    // No hay selector de periodo aquí a propósito: se recibe lo que la tabla
    // ya tiene filtrado (fechas, "sin asignar" y los filtros estilo Excel de
    // cada columna). Así las gráficas siempre dicen lo mismo que lo que se ve
    // arriba, en vez de dos controles de fecha que se contradicen.
    const base = filas

    // ── Clasificación del resultado, en un solo lugar ──
    // El orden importa: "CANCELADA/REAGENDA" cuenta como cancelada, no como
    // reagendada, igual que en los colores de la tabla.
    const clase = (f: CitaParaGrafica): 'aparto' | 'cancelada' | 'reagendada' | 'realizada' | 'otro' | 'sin' => {
      const e = f.estado_seguimiento
      if (!e || !e.trim()) return 'sin'
      if (esApartado(e)) return 'aparto'
      if (esCancelada(e)) return 'cancelada'
      if (esReagendada(e)) return 'reagendada'
      // "Esperando retroalimentación" es la etiqueta que el tablero del asesor
      // le pone al estado 'realizada': la cita SÍ ocurrió, solo falta la retro.
      // Sin esta línea caía en "otro" y las realizadas salían de menos.
      const n = normalizar(e)
      if (n.includes('realizada') || n.includes('esperando retro')) return 'realizada'
      return 'otro'
    }

    const cuenta = { aparto: 0, cancelada: 0, reagendada: 0, realizada: 0, otro: 0, sin: 0 }
    for (const f of base) cuenta[clase(f)]++
    const conEstado = base.length - cuenta.sin

    // ── Agrupado por asesor ──
    // Llave: asesor_id si lo trae (limpio), si no el texto con apodos mapeados.
    const porAsesor = new Map<string, { nombre: string; total: number; aparto: number; realizada: number; cancelada: number; reagendada: number; otro: number; sin: number }>()
    for (const f of base) {
      const porId = f.asesor_id ? nombrePorId[f.asesor_id] : undefined
      const texto = (f.atendio ?? '').trim()
      const nombre = porId ?? (texto ? mapear(texto) : SIN_ASESOR)
      const llave = porId ? `id:${f.asesor_id}` : (texto ? `tx:${normalizar(nombre)}` : 'sin')
      if (!porAsesor.has(llave)) {
        porAsesor.set(llave, { nombre, total: 0, aparto: 0, realizada: 0, cancelada: 0, reagendada: 0, otro: 0, sin: 0 })
      }
      const a = porAsesor.get(llave)!
      a.total++
      a[clase(f)]++
    }
    const asesores = [...porAsesor.values()].sort((x, y) => y.total - x.total)

    // Tasa de apartado: solo tiene sentido sobre las citas CON estado. Un
    // asesor con 50 citas sin estado no tiene 0% de apartado, tiene 0 datos.
    const conversion = asesores
      .map(a => {
        const base2 = a.total - a.sin
        return { ...a, base: base2, pct: base2 > 0 ? (a.aparto / base2) * 100 : null }
      })
      .filter(a => a.base >= 3 && a.nombre !== SIN_ASESOR)
      .sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1))

    // ── Rankings de texto libre (coordinó / prospectó) ──
    const ranking = (campo: 'coordino' | 'prospecto') => {
      const m = new Map<string, { nombre: string; n: number }>()
      for (const f of base) {
        const v = (f[campo] ?? '').trim()
        if (!v) continue
        const nombre = mapear(v)
        const k = normalizar(nombre)
        if (!m.has(k)) m.set(k, { nombre, n: 0 })
        m.get(k)!.n++
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12)
    }

    // ── Citas por mes ──
    const meses = new Map<string, number>()
    for (const f of base) {
      if (!f.fecha_cita) continue
      const k = f.fecha_cita.slice(0, 7)          // YYYY-MM
      meses.set(k, (meses.get(k) ?? 0) + 1)
    }
    const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const porMes = [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([k, v]) => ({ etiqueta: `${NOMBRE_MES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valor: v }))

    // ── Retro ──
    const retroEscrita = base.filter(f => !!f.retro_completada_at).length

    return {
      total: base.length, cuenta, conEstado, asesores, conversion, porMes,
      coordino: ranking('coordino'), prospecto: ranking('prospecto'),
      retroEscrita, sinFecha: base.filter(f => !f.fecha_cita).length,
    }
  }, [filas, nombrePorId, normalizar, mapear, esApartado, esCancelada, esReagendada])

  const partesEstado = [
    { label: 'Apartó',             value: d.cuenta.aparto,     color: COL.aparto },
    { label: 'Realizada',          value: d.cuenta.realizada,  color: COL.realizada },
    { label: 'Reagendada',         value: d.cuenta.reagendada,  color: COL.reagendada },
    { label: 'Cancelada',          value: d.cuenta.cancelada,  color: COL.cancelada },
    { label: 'Otro estado',        value: d.cuenta.otro,       color: COL.otro },
  ].filter(p => p.value > 0)

  const maxAsesor = Math.max(1, ...d.asesores.map(a => a.total))
  const maxCoord  = Math.max(1, ...d.coordino.map(a => a.n))
  const maxProsp  = Math.max(1, ...d.prospecto.map(a => a.n))
  // El tono de la pista sale de la paleta, no escrito a mano: así sirve en
  // claro y en oscuro sin tener que preguntar en qué tema estamos.
  const pista     = C.divider

  const Tarjeta = ({ titulo, sub, children }: { titulo: string; sub?: string; children: any }) => (
    <View style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[s.tarjetaTitulo, { color: C.text }]}>{titulo}</Text>
      {sub ? <Text style={s.tarjetaSub}>{sub}</Text> : null}
      {children}
    </View>
  )

  return (
    <View style={{ gap: 12 }}>
      {/* Resumen */}
      <View style={s.kpis}>
        {[
          { n: d.total,              t: 'Citas' },
          { n: d.cuenta.aparto,      t: 'Apartaron', c: COL.aparto },
          { n: d.cuenta.realizada,   t: 'Realizadas', c: COL.realizada },
          { n: d.cuenta.reagendada,  t: 'Reagendadas', c: COL.reagendada },
          { n: d.cuenta.cancelada,   t: 'Canceladas', c: COL.cancelada },
          { n: d.cuenta.sin,         t: 'Sin estado', c: '#9aa5ab' },
        ].map((k, i) => (
          <View key={i} style={[s.kpi, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.kpiNum, { color: k.c ?? C.text }]}>{k.n}</Text>
            <Text style={s.kpiTxt}>{k.t}</Text>
          </View>
        ))}
      </View>

      {/* Estado de seguimiento */}
      <Tarjeta
        titulo="En qué acabaron las citas"
        sub={d.conEstado > 0
          ? `Sobre las ${d.conEstado} citas que tienen estado anotado. Las otras ${d.cuenta.sin} no lo tienen.`
          : 'Ninguna cita del periodo tiene estado anotado.'}
      >
        <View style={s.donaFila}>
          <Dona
            partes={partesEstado}
            centro={String(d.conEstado)}
            subcentro="con estado"
            colorTexto={C.text}
          />
          <Leyenda partes={partesEstado} total={d.conEstado} colorTexto={C.text} />
        </View>
      </Tarjeta>

      {/* Por asesor */}
      <Tarjeta
        titulo="Citas por asesor"
        sub="Cada barra está partida por el resultado: 🟦 apartó · 🟩 realizada · 🟧 reagendada · 🟥 cancelada · ⬜ sin estado."
      >
        {d.asesores.length === 0
          ? <Text style={s.vacio}>Sin citas en el periodo.</Text>
          : (verTodos ? d.asesores : d.asesores.slice(0, TOPE_LISTA)).map((a, i) => (
              <BarraAsesor
                key={a.nombre + i}
                pos={i + 1}
                nombre={a.nombre}
                total={a.total}
                max={maxAsesor}
                colorTexto={a.nombre === SIN_ASESOR ? '#9aa5ab' : C.text}
                colorPista={pista}
                tramos={[
                  { valor: a.aparto,     color: COL.aparto },
                  { valor: a.realizada,  color: COL.realizada },
                  { valor: a.reagendada, color: COL.reagendada },
                  { valor: a.cancelada,  color: COL.cancelada },
                  { valor: a.otro,       color: COL.otro },
                  { valor: a.sin,        color: COL.sinEstado },
                ]}
                nota={a.sin === a.total ? 'ninguna tiene estado anotado' : undefined}
              />
            ))}
        {d.asesores.length > TOPE_LISTA && (
          <TouchableOpacity onPress={() => setVerTodos(v => !v)} style={s.verMas}>
            <Text style={s.verMasTxt}>
              {verTodos
                ? '▲ Ver solo los primeros'
                : `▼ Ver los otros ${d.asesores.length - TOPE_LISTA} (casi todos con 1 o 2 citas)`}
            </Text>
          </TouchableOpacity>
        )}
      </Tarjeta>

      {/* Conversión */}
      <Tarjeta
        titulo="Quién convierte mejor"
        sub="Porcentaje de citas que acabaron en apartado, solo contando las que tienen estado. Se omite a quien tenga menos de 3 citas con estado: con una o dos, el porcentaje no dice nada."
      >
        {d.conversion.length === 0
          ? <Text style={s.vacio}>Todavía no hay nadie con 3 o más citas con estado anotado.</Text>
          : d.conversion.map((a, i) => (
              <BarraAsesor
                key={a.nombre + i}
                pos={i + 1}
                nombre={a.nombre}
                total={Math.round(a.pct ?? 0)}
                sufijo="%"
                max={100}
                colorTexto={C.text}
                colorPista={pista}
                tramos={[{ valor: 1, color: COL.aparto }]}
                nota={`${a.aparto} de ${a.base} citas con estado`}
              />
            ))}
      </Tarjeta>

      {/* Por mes */}
      <Tarjeta
        titulo="Citas por mes"
        sub={d.sinFecha > 0 ? `${d.sinFecha} citas no tienen fecha y no salen aquí.` : undefined}
      >
        {d.porMes.length === 0
          ? <Text style={s.vacio}>Sin citas con fecha en el periodo.</Text>
          : <BarrasPeriodo datos={d.porMes} colorTexto={C.text} colorPista={pista} />}
      </Tarjeta>

      {/* Coordinó / prospectó */}
      <Tarjeta titulo="Quién coordinó" sub="Del campo «coordinó», texto libre.">
        {d.coordino.length === 0
          ? <Text style={s.vacio}>Nadie anotado.</Text>
          : d.coordino.map((a, i) => (
              <BarraAsesor key={a.nombre} pos={i + 1} nombre={a.nombre} total={a.n} max={maxCoord}
                colorTexto={C.text} colorPista={pista} tramos={[{ valor: 1, color: COL.realizada }]} />
            ))}
      </Tarjeta>

      <Tarjeta titulo="Quién prospectó" sub="Del campo «prospecto», texto libre.">
        {d.prospecto.length === 0
          ? <Text style={s.vacio}>Nadie anotado.</Text>
          : d.prospecto.map((a, i) => (
              <BarraAsesor key={a.nombre} pos={i + 1} nombre={a.nombre} total={a.n} max={maxProsp}
                colorTexto={C.text} colorPista={pista} tramos={[{ valor: 1, color: COL.reagendada }]} />
            ))}
      </Tarjeta>

      {/* Retro */}
      <Tarjeta titulo="Retroalimentación" sub="Cuántas citas ya tienen retro escrita.">
        <View style={s.donaFila}>
          <Dona
            partes={[
              { label: 'Con retro', value: d.retroEscrita, color: COL.realizada },
              { label: 'Sin retro', value: d.total - d.retroEscrita, color: COL.sinEstado },
            ]}
            centro={d.total > 0 ? `${Math.round((d.retroEscrita / d.total) * 100)}%` : '0%'}
            subcentro="con retro"
            colorTexto={C.text}
          />
          <Leyenda
            partes={[
              { label: 'Con retro', value: d.retroEscrita, color: COL.realizada },
              { label: 'Sin retro', value: d.total - d.retroEscrita, color: COL.sinEstado },
            ]}
            total={d.total}
            colorTexto={C.text}
          />
        </View>
      </Tarjeta>
    </View>
  )
}
