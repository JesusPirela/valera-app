// Estadísticas de la tabla de Citas de venta.
//
// Cuatro vistas: el resumen general, y el desglose por asesor, por
// prospectador y por zona. Todo con números grandes, pasteles y barras,
// porque esto lo lee gente que quiere ver resultados, no leer explicaciones.
//
// No hace consultas: la pantalla ya trae las 900+ filas en memoria, así que
// todo se calcula sobre lo que ya está, y respeta los filtros de la tabla
// (fechas, columnas). Lo que se ve arriba es lo que se grafica.
//
// ⚠️ Dos cosas de estos datos que cambian cómo se leen:
//
//  · "Atendió", "prospecto" y "coordinó" son TEXTO LIBRE y están sucios:
//    "atienden alla", "MTY", "Gimar" aparte de "Gimar Salas". Por eso se
//    agrupa por asesor_id cuando la cita lo trae (llave limpia) y por el
//    texto con apodos mapeados cuando no. Lo que no tiene a nadie se enseña
//    como "Sin asesor anotado" en vez de esconderse: el hueco también es dato.
//
//  · Muchas citas vienen del Excel viejo y no traen resultado. Esas NO se
//    esconden: cuentan como "Sin estado", que es su propia barra y su propio
//    pedazo del pastel. Así el total siempre cuadra con el de la tabla.
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useColors } from '../lib/ThemeContext'
import {
  Dona, BarraAsesor, BarrasPeriodo, Leyenda, s,
  Embudo, usePaleta,
} from './graficas-base'

// ─── Lo que necesita de cada cita ────────────────────────────────────────────
export type CitaParaGrafica = {
  fecha_cita: string | null
  /** Si está apartada y tiene esta fecha, manda sobre la de la cita. */
  fecha_apartado?: string | null
  atendio: string | null
  asesor_id?: string | null
  prospecto: string | null
  coordino: string | null
  estado_seguimiento: string | null
  retro_completada_at?: string | null
  zona_interesada?: string | null
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
const SIN_ZONA = 'Sin zona anotada'
// Las listas tienen 50+ nombres, muchos con una sola cita. Se enseñan los
// primeros y el resto queda detrás de un botón.
const TOPE_LISTA = 15

const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Vista = 'resumen' | 'asesores' | 'prospectadores' | 'zonas'
const VISTAS: { k: Vista; t: string }[] = [
  { k: 'resumen',        t: '📊 Resumen' },
  { k: 'asesores',       t: '🤝 Asesores' },
  { k: 'prospectadores', t: '🌱 Prospectadores' },
  { k: 'zonas',          t: '📍 Zonas' },
]

type Clase = 'aparto' | 'realizada' | 'reagendada' | 'cancelada' | 'otro' | 'sin'
type Grupo = {
  nombre: string
  total: number
  aparto: number; realizada: number; reagendada: number; cancelada: number; otro: number; sin: number
  /** Cuántas de sus citas ya tienen retro escrita. */
  conRetro: number
}

export default function GraficasCitas({
  filas, nombrePorId = {}, normalizar, mapear, esApartado, esCancelada, esReagendada,
}: Props) {
  const C = useColors()
  const P = usePaleta()
  const pista = C.divider

  const [vista, setVista] = useState<Vista>('resumen')
  const [verTodos, setVerTodos] = useState(false)

  const d = useMemo(() => {
    const base = filas

    // ── En qué acabó cada cita ──
    // El orden importa: "CANCELADA/REAGENDA" cuenta como cancelada, igual que
    // en los colores de la tabla, para que una cita no cuente en dos lados.
    const clase = (f: CitaParaGrafica): Clase => {
      const e = f.estado_seguimiento
      if (!e || !e.trim()) return 'sin'
      if (esApartado(e)) return 'aparto'
      if (esCancelada(e)) return 'cancelada'
      if (esReagendada(e)) return 'reagendada'
      // "Esperando retroalimentación" es como el tablero del asesor llama al
      // estado 'realizada': la cita SÍ ocurrió, solo falta la retro.
      const n = normalizar(e)
      if (n.includes('realizada') || n.includes('esperando retro')) return 'realizada'
      return 'otro'
    }

    const cuenta: Record<Clase, number> = { aparto: 0, realizada: 0, reagendada: 0, cancelada: 0, otro: 0, sin: 0 }
    let conRetro = 0
    for (const f of base) {
      cuenta[clase(f)]++
      if (f.retro_completada_at) conRetro++
    }

    // ── Agrupar por quien sea ──
    const agrupar = (llaveDe: (f: CitaParaGrafica) => { llave: string; nombre: string }): Grupo[] => {
      const m = new Map<string, Grupo>()
      for (const f of base) {
        const { llave, nombre } = llaveDe(f)
        if (!m.has(llave)) {
          m.set(llave, { nombre, total: 0, aparto: 0, realizada: 0, reagendada: 0, cancelada: 0, otro: 0, sin: 0, conRetro: 0 })
        }
        const g = m.get(llave)!
        g.total++
        g[clase(f)]++
        if (f.retro_completada_at) g.conRetro++
      }
      return [...m.values()].sort((a, b) => b.total - a.total)
    }

    const asesores = agrupar(f => {
      const porId = f.asesor_id ? nombrePorId[f.asesor_id] : undefined
      const texto = (f.atendio ?? '').trim()
      const nombre = porId ?? (texto ? mapear(texto) : SIN_ASESOR)
      const llave = porId ? `id:${f.asesor_id}` : (texto ? `tx:${normalizar(nombre)}` : 'sin')
      return { llave, nombre }
    })

    const porCampo = (campo: 'prospecto' | 'coordino', vacio: string) => agrupar(f => {
      const v = (f[campo] ?? '').trim()
      if (!v) return { llave: 'sin', nombre: vacio }
      const nombre = mapear(v)
      return { llave: normalizar(nombre), nombre }
    })

    const prospectadores = porCampo('prospecto', 'Sin prospectador anotado')

    const zonas = agrupar(f => {
      const v = (f.zona_interesada ?? '').trim()
      if (!v) return { llave: 'sin', nombre: SIN_ZONA }
      return { llave: normalizar(v), nombre: v }
    })

    // ── Por mes ──
    const fechaDe = (f: CitaParaGrafica) =>
      (f.fecha_apartado && esApartado(f.estado_seguimiento)) ? f.fecha_apartado : f.fecha_cita
    const meses = new Map<string, number>()
    for (const f of base) {
      const fe = fechaDe(f)
      if (!fe) continue
      const k = fe.slice(0, 7)
      meses.set(k, (meses.get(k) ?? 0) + 1)
    }
    const porMes = [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([k, v]) => ({ etiqueta: `${NOMBRE_MES[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valor: v }))

    return {
      total: base.length, cuenta, conRetro,
      conEstado: base.length - cuenta.sin,
      asesores, prospectadores, zonas, porMes,
    }
  }, [filas, nombrePorId, normalizar, mapear, esApartado, esCancelada, esReagendada])

  // Los colores de cada resultado, en un solo lugar para que el pastel, las
  // barras y la leyenda nunca se contradigan.
  const partes = [
    { label: 'Apartó',       value: d.cuenta.aparto,     color: P.aparto },
    { label: 'Realizada',    value: d.cuenta.realizada,  color: P.realizada },
    { label: 'Reagendada',   value: d.cuenta.reagendada, color: P.reagendada },
    { label: 'Cancelada',    value: d.cuenta.cancelada,  color: P.cancelada },
    { label: 'Otro estado',  value: d.cuenta.otro,       color: P.otro },
    { label: 'Sin estado',   value: d.cuenta.sin,        color: P.sinEstado },
  ].filter(p => p.value > 0)

  const tramosDe = (g: Grupo) => [
    { valor: g.aparto, color: P.aparto },
    { valor: g.realizada, color: P.realizada },
    { valor: g.reagendada, color: P.reagendada },
    { valor: g.cancelada, color: P.cancelada },
    { valor: g.otro, color: P.otro },
    { valor: g.sin, color: P.sinEstado },
  ]

  const Tarjeta = ({ titulo, sub, children }: { titulo: string; sub?: string; children: any }) => (
    <View style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[s.tarjetaTitulo, { color: C.text }]}>{titulo}</Text>
      {sub ? <Text style={s.tarjetaSub}>{sub}</Text> : null}
      {children}
    </View>
  )

  const LeyendaResultados = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 11 }}>
      {partes.map(p => (
        <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.color }} />
          <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>{p.label}</Text>
        </View>
      ))}
    </View>
  )

  // Una lista de barras, igual para asesores, prospectadores y zonas.
  const ListaBarras = ({ grupos, vacio }: { grupos: Grupo[]; vacio: string }) => {
    const max = Math.max(1, ...grupos.map(g => g.total))
    const mostrar = verTodos ? grupos : grupos.slice(0, TOPE_LISTA)
    if (grupos.length === 0) return <Text style={s.vacio}>{vacio}</Text>
    return (
      <>
        {mostrar.map((g, i) => (
          <BarraAsesor
            key={g.nombre + i}
            pos={i + 1}
            nombre={g.nombre}
            total={g.total}
            max={max}
            tramos={tramosDe(g)}
            colorTexto={C.text}
            colorPista={pista}
            nota={`${g.aparto} apartaron · ${g.reagendada + g.cancelada} se cayeron · ${g.conRetro} con retro`}
          />
        ))}
        {grupos.length > TOPE_LISTA ? (
          <TouchableOpacity style={s.verMas} onPress={() => setVerTodos(v => !v)}>
            <Text style={s.verMasTxt}>
              {verTodos ? 'Ver menos' : `Ver los ${grupos.length - TOPE_LISTA} restantes`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {LeyendaResultados}
      </>
    )
  }

  const pct = (n: number) => d.total > 0 ? Math.round((n / d.total) * 100) : 0

  return (
    <View style={{ gap: 12 }}>
      {/* Pestañas */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 7, paddingVertical: 2 }}>
          {VISTAS.map(v => {
            const on = vista === v.k
            return (
              <TouchableOpacity
                key={v.k}
                onPress={() => { setVista(v.k); setVerTodos(false) }}
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
                  borderColor: on ? P.aparto : C.border,
                  backgroundColor: on ? P.aparto : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : C.textSub }}>{v.t}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* ═══════════ RESUMEN ═══════════ */}
      {vista === 'resumen' && (
        <>
          <View style={s.kpis}>
            {[
              { n: d.total,              t: 'Citas',       c: C.text },
              { n: d.cuenta.realizada,   t: 'Realizadas',  c: P.realizada },
              { n: d.cuenta.aparto,      t: 'Apartaron',   c: P.aparto },
              { n: d.cuenta.reagendada,  t: 'Reagendadas', c: P.reagendada },
              { n: d.cuenta.cancelada,   t: 'Canceladas',  c: P.cancelada },
              { n: d.cuenta.sin,         t: 'Sin estado',  c: '#9aa5ab' },
            ].map((k, i) => (
              <View key={i} style={[s.kpi, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[s.kpiNum, { color: k.c }]}>{k.n}</Text>
                <Text style={s.kpiTxt}>{k.t}</Text>
              </View>
            ))}
          </View>

          <Tarjeta titulo="En qué acabaron las citas">
            <View style={s.donaFila}>
              <Dona
                partes={partes}
                centro={String(d.total)}
                subcentro="citas"
                colorTexto={C.text}
              />
              <Leyenda partes={partes} total={d.total} colorTexto={C.text} />
            </View>
            {/* El porcentaje que importa va sobre las que SÍ tienen estado.
                Sacado sobre el total diría "2% apartaron", pero es que de 3 de
                cada 4 citas nadie anotó en qué acabaron: no es que no hayan
                apartado, es que no se sabe. */}
            {d.conEstado > 0 ? (
              <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 11 }}>
                De las <Text style={{ fontWeight: '800', color: C.text }}>{d.conEstado}</Text> citas
                con estado anotado, <Text style={{ fontWeight: '800', color: P.aparto }}>{d.cuenta.aparto} apartaron </Text>
                ({Math.round((d.cuenta.aparto / d.conEstado) * 100)}%)
                y <Text style={{ fontWeight: '800', color: P.reagendada }}>{d.cuenta.reagendada + d.cuenta.cancelada} se cayeron</Text>.
              </Text>
            ) : null}
          </Tarjeta>

          <Tarjeta titulo="Retroalimentación">
            <View style={s.donaFila}>
              <Dona
                partes={[
                  { label: 'Con retro', value: d.conRetro, color: P.realizada },
                  { label: 'Sin retro', value: d.total - d.conRetro, color: P.sinEstado },
                ]}
                centro={`${pct(d.conRetro)}%`}
                subcentro="con retro"
                colorTexto={C.text}
              />
              <Leyenda
                partes={[
                  { label: 'Con retro', value: d.conRetro, color: P.realizada },
                  { label: 'Sin retro', value: d.total - d.conRetro, color: P.sinEstado },
                ]}
                total={d.total}
                colorTexto={C.text}
              />
            </View>
            <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 11 }}>
              Faltan <Text style={{ fontWeight: '800', color: C.text }}>{d.total - d.conRetro}</Text> retros
              por escribir.
            </Text>
          </Tarjeta>

          <Tarjeta titulo="De la cita al apartado">
            <Embudo
              pasos={[
                { nombre: 'Citas',               n: d.total,              nota: 'Todas las que se ven arriba' },
                { nombre: 'Con estado anotado',  n: d.conEstado,          nota: 'Alguien escribió en qué acabó' },
                { nombre: 'Se realizaron',       n: d.cuenta.realizada + d.cuenta.aparto, nota: 'La cita sí ocurrió' },
                { nombre: 'Apartaron',           n: d.cuenta.aparto,      nota: 'Acabó en apartado' },
              ]}
              colorTexto={C.text}
              colorPista={pista}
              color={P.aparto}
            />
          </Tarjeta>

          <Tarjeta titulo="Citas por mes">
            {d.porMes.length === 0
              ? <Text style={s.vacio}>Ninguna cita con fecha.</Text>
              : <BarrasPeriodo datos={d.porMes} colorTexto={C.text} colorPista={pista} />}
          </Tarjeta>
        </>
      )}

      {/* ═══════════ ASESORES ═══════════ */}
      {vista === 'asesores' && (
        <Tarjeta titulo="Citas por asesor" sub="El largo de la barra son sus citas; los colores, en qué acabaron.">
          <ListaBarras grupos={d.asesores} vacio="Ninguna cita con asesor." />
        </Tarjeta>
      )}

      {/* ═══════════ PROSPECTADORES ═══════════ */}
      {vista === 'prospectadores' && (
        <Tarjeta titulo="Citas por prospectador" sub="Quién trajo cada cita y en qué acabó.">
          <ListaBarras grupos={d.prospectadores} vacio="Ninguna cita con prospectador." />
        </Tarjeta>
      )}

      {/* ═══════════ ZONAS ═══════════ */}
      {vista === 'zonas' && (
        <Tarjeta titulo="Citas por zona" sub="Dónde se están dando las citas y cómo les va.">
          <ListaBarras grupos={d.zonas} vacio="Ninguna cita con zona." />
        </Tarjeta>
      )}
    </View>
  )
}
