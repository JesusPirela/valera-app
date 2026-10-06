// Mini apartado de gráficas para la tabla de apartados y cierres.
//
// Igual que el de citas: no consulta nada, calcula sobre las filas que la
// pantalla ya tiene y respeta lo que esté filtrado arriba.
//
// ⚠️ Esta tabla es CHICA y está incompleta. Al construirla había 63 registros y:
//   · solo 16 tienen asesor anotado — las gráficas por asesor cubren un cuarto;
//   · NINGUNO tiene comisión ni fecha de escrituración capturada;
//   · 26 de 63 tienen fecha de cita, así que la gráfica por mes deja fuera más
//     de la mitad.
// Cada tarjeta dice sobre cuántos registros está calculada, para que un
// porcentaje no se lea como si cubriera todo.
import { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useColors } from '../lib/ThemeContext'
import { COL, Dona, BarraAsesor, BarrasPeriodo, Leyenda, s } from './graficas-base'

export type CierreParaGrafica = {
  etapa: string | null
  tipo_operacion: string | null
  atendio: string | null
  prospecto: string | null
  coordino: string | null
  fecha_cita: string | null
  comision: number | string | null
}

type Props = {
  filas: CierreParaGrafica[]
  normalizar: (s: string) => string
  mapear: (s: string | undefined) => string
}

const SIN_ASESOR = 'Sin asesor anotado'

// Las etapas de esta tabla son una lista cerrada (Apartado, Trámite,
// Escriturado, Caído), no texto libre como el estado de las citas. Aun así se
// comparan normalizadas por si alguien escribe "apartado" en minúsculas.
const ETAPAS: { clave: string; label: string; color: string }[] = [
  { clave: 'apartado',    label: 'Apartado',    color: COL.aparto },
  { clave: 'tramite',     label: 'Trámite',     color: COL.reagendada },
  { clave: 'escriturado', label: 'Escriturado', color: COL.realizada },
  { clave: 'caido',       label: 'Caído',       color: COL.cancelada },
]

export default function GraficasCierres({ filas, normalizar, mapear }: Props) {
  const C = useColors()

  const d = useMemo(() => {
    const etapaDe = (f: CierreParaGrafica) => {
      const n = normalizar(f.etapa ?? '')
      return ETAPAS.find(e => n.includes(e.clave))?.clave ?? (n ? 'otra' : 'sin')
    }

    const porEtapa = new Map<string, number>()
    for (const f of filas) porEtapa.set(etapaDe(f), (porEtapa.get(etapaDe(f)) ?? 0) + 1)

    const partesEtapa = ETAPAS
      .map(e => ({ label: e.label, value: porEtapa.get(e.clave) ?? 0, color: e.color }))
      .filter(p => p.value > 0)
    const sinEtapa = (porEtapa.get('sin') ?? 0) + (porEtapa.get('otra') ?? 0)

    // ── Por asesor, con el desglose de etapa dentro de la barra ──
    const porAsesor = new Map<string, { nombre: string; total: number; apartado: number; tramite: number; escriturado: number; caido: number; otra: number }>()
    for (const f of filas) {
      const texto = (f.atendio ?? '').trim()
      const nombre = texto ? mapear(texto) : SIN_ASESOR
      const k = texto ? normalizar(nombre) : 'sin'
      if (!porAsesor.has(k)) porAsesor.set(k, { nombre, total: 0, apartado: 0, tramite: 0, escriturado: 0, caido: 0, otra: 0 })
      const a = porAsesor.get(k)!
      a.total++
      const e = etapaDe(f)
      if (e === 'apartado') a.apartado++
      else if (e === 'tramite') a.tramite++
      else if (e === 'escriturado') a.escriturado++
      else if (e === 'caido') a.caido++
      else a.otra++
    }
    const asesores = [...porAsesor.values()].sort((x, y) => y.total - x.total)
    const conAsesor = filas.length - (porAsesor.get('sin')?.total ?? 0)

    // ── Venta vs renta ──
    const porOperacion = new Map<string, number>()
    for (const f of filas) {
      const v = (f.tipo_operacion ?? '').trim()
      const k = v ? mapear(v) : 'Sin anotar'
      porOperacion.set(k, (porOperacion.get(k) ?? 0) + 1)
    }
    const partesOperacion = [...porOperacion.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label, value,
        color: [COL.aparto, COL.realizada, COL.reagendada, COL.otro, COL.sinEstado][i % 5],
      }))

    // ── Rankings de texto libre ──
    const ranking = (campo: 'coordino' | 'prospecto') => {
      const m = new Map<string, { nombre: string; n: number }>()
      for (const f of filas) {
        const v = (f[campo] ?? '').trim()
        if (!v) continue
        const nombre = mapear(v)
        const k = normalizar(nombre)
        if (!m.has(k)) m.set(k, { nombre, n: 0 })
        m.get(k)!.n++
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12)
    }

    // ── Por mes, sobre la fecha de la cita que originó el apartado ──
    const meses = new Map<string, number>()
    for (const f of filas) {
      if (!f.fecha_cita) continue
      const k = f.fecha_cita.slice(0, 7)
      meses.set(k, (meses.get(k) ?? 0) + 1)
    }
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const porMes = [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([k, v]) => ({ etiqueta: `${MES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valor: v }))

    return {
      total: filas.length, partesEtapa, sinEtapa, asesores, conAsesor,
      partesOperacion, coordino: ranking('coordino'), prospecto: ranking('prospecto'),
      porMes, sinFecha: filas.filter(f => !f.fecha_cita).length,
      conComision: filas.filter(f => f.comision != null && String(f.comision).trim() !== '').length,
      cuenta: {
        apartado: porEtapa.get('apartado') ?? 0,
        tramite: porEtapa.get('tramite') ?? 0,
        escriturado: porEtapa.get('escriturado') ?? 0,
        caido: porEtapa.get('caido') ?? 0,
      },
    }
  }, [filas, normalizar, mapear])

  const maxAsesor = Math.max(1, ...d.asesores.map(a => a.total))
  const maxCoord  = Math.max(1, ...d.coordino.map(a => a.n))
  const maxProsp  = Math.max(1, ...d.prospecto.map(a => a.n))
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
      <View style={s.kpis}>
        {[
          { n: d.total,              t: 'Registros' },
          { n: d.cuenta.apartado,    t: 'Apartados',    c: COL.aparto },
          { n: d.cuenta.tramite,     t: 'En trámite',   c: COL.reagendada },
          { n: d.cuenta.escriturado, t: 'Escriturados', c: COL.realizada },
          { n: d.cuenta.caido,       t: 'Caídos',       c: COL.cancelada },
        ].map((k, i) => (
          <View key={i} style={[s.kpi, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.kpiNum, { color: k.c ?? C.text }]}>{k.n}</Text>
            <Text style={s.kpiTxt}>{k.t}</Text>
          </View>
        ))}
      </View>

      <Tarjeta
        titulo="En qué etapa van"
        sub={d.sinEtapa > 0 ? `${d.sinEtapa} sin etapa anotada, fuera de la dona.` : undefined}
      >
        <View style={s.donaFila}>
          <Dona
            partes={d.partesEtapa}
            centro={String(d.total - d.sinEtapa)}
            subcentro="con etapa"
            colorTexto={C.text}
          />
          <Leyenda partes={d.partesEtapa} total={d.total - d.sinEtapa} colorTexto={C.text} />
        </View>
      </Tarjeta>

      <Tarjeta
        titulo="Apartados por asesor"
        sub={d.conAsesor < d.total
          ? `⚠️ Solo ${d.conAsesor} de ${d.total} registros tienen asesor anotado. Cada barra está partida por etapa: 🟦 apartado · 🟧 trámite · 🟩 escriturado · 🟥 caído.`
          : 'Cada barra está partida por etapa: 🟦 apartado · 🟧 trámite · 🟩 escriturado · 🟥 caído.'}
      >
        {d.asesores.length === 0
          ? <Text style={s.vacio}>Sin registros.</Text>
          : d.asesores.map((a, i) => (
              <BarraAsesor
                key={a.nombre + i}
                pos={i + 1}
                nombre={a.nombre}
                total={a.total}
                max={maxAsesor}
                colorTexto={a.nombre === SIN_ASESOR ? '#9aa5ab' : C.text}
                colorPista={pista}
                tramos={[
                  { valor: a.apartado,    color: COL.aparto },
                  { valor: a.tramite,     color: COL.reagendada },
                  { valor: a.escriturado, color: COL.realizada },
                  { valor: a.caido,       color: COL.cancelada },
                  { valor: a.otra,        color: COL.sinEstado },
                ]}
              />
            ))}
      </Tarjeta>

      <Tarjeta titulo="Venta o renta">
        <View style={s.donaFila}>
          <Dona partes={d.partesOperacion} centro={String(d.total)} subcentro="registros" colorTexto={C.text} />
          <Leyenda partes={d.partesOperacion} total={d.total} colorTexto={C.text} />
        </View>
      </Tarjeta>

      <Tarjeta
        titulo="Apartados por mes"
        sub={d.sinFecha > 0 ? `${d.sinFecha} de ${d.total} no tienen fecha de cita y no salen aquí.` : undefined}
      >
        {d.porMes.length === 0
          ? <Text style={s.vacio}>Ningún registro tiene fecha de cita.</Text>
          : <BarrasPeriodo datos={d.porMes} colorTexto={C.text} colorPista={pista} />}
      </Tarjeta>

      <Tarjeta titulo="Quién coordinó">
        {d.coordino.length === 0
          ? <Text style={s.vacio}>Nadie anotado.</Text>
          : d.coordino.map((a, i) => (
              <BarraAsesor key={a.nombre} pos={i + 1} nombre={a.nombre} total={a.n} max={maxCoord}
                colorTexto={C.text} colorPista={pista} tramos={[{ valor: 1, color: COL.realizada }]} />
            ))}
      </Tarjeta>

      <Tarjeta titulo="Quién prospectó">
        {d.prospecto.length === 0
          ? <Text style={s.vacio}>Nadie anotado.</Text>
          : d.prospecto.map((a, i) => (
              <BarraAsesor key={a.nombre} pos={i + 1} nombre={a.nombre} total={a.n} max={maxProsp}
                colorTexto={C.text} colorPista={pista} tramos={[{ valor: 1, color: COL.reagendada }]} />
            ))}
      </Tarjeta>

      {/* Las comisiones no se grafican porque no hay ni una capturada. Mejor
          decirlo que mostrar una gráfica en cero que parezca que no se vendió
          nada. */}
      {d.conComision === 0 && (
        <View style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.tarjetaTitulo, { color: C.text }]}>Comisiones</Text>
          <Text style={s.tarjetaSub}>
            No hay ninguna comisión capturada en los {d.total} registros, así que no hay nada que
            graficar. En cuanto se empiecen a llenar, aquí va el monto por asesor y por mes.
          </Text>
        </View>
      )}
    </View>
  )
}
