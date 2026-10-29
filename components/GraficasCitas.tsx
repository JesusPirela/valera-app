// Estadísticas de la tabla de Citas de venta.
//
// Cuatro vistas: el resumen general, y el desglose por asesor, por
// prospectador y por zona. Todo con números grandes, pasteles y barras,
// porque esto lo lee gente que quiere ver resultados, no leer explicaciones.
//
// Dos cosas que hace a propósito:
//
//  · Debajo de cada barra van los ESTADOS DE SEGUIMIENTO TAL CUAL están en la
//    tabla, con su nombre y su cuenta ("Realizada 5 · Cancelada/Reagenda 3").
//    Antes decía "3 apartaron · 2 se cayeron", y "se cayeron" era una palabra
//    inventada aquí: no se podía comprobar contra ninguna columna.
//
//  · Cada barra se abre. Si dice "Martín · 10 citas", al tocarla salen las
//    diez, con su cliente, su fecha, su estado y si tiene retro. Un número que
//    no se puede abrir hay que creérselo.
//
// No hace consultas: la pantalla ya trae las 900+ filas en memoria, así que
// todo se calcula sobre lo que ya está, y respeta los filtros de la tabla
// (fechas, columnas). Lo que se ve arriba es lo que se grafica.
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native'
import { useColors } from '../lib/ThemeContext'
import {
  Dona, BarraAsesor, BarrasPeriodo, Leyenda, s,
  Embudo, usePaleta,
} from './graficas-base'
import { infoEstadoCita } from '../lib/estados-cita'

// ─── Lo que necesita de cada cita ────────────────────────────────────────────
export type CitaParaGrafica = {
  id?: string | null
  cliente_nombre?: string | null
  interesado_en?: string | null
  fecha_cita: string | null
  /** Si está apartada y tiene esta fecha, manda sobre la de la cita. */
  fecha_apartado?: string | null
  dia_cita?: string | null
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
const SIN_ESTADO = 'Sin estado'
const TOPE_LISTA = 15

const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Vista = 'resumen' | 'asesores' | 'prospectadores' | 'zonas'
const VISTAS: { k: Vista; t: string }[] = [
  { k: 'resumen',        t: '📊 Resumen' },
  { k: 'asesores',       t: '🤝 Asesores' },
  { k: 'prospectadores', t: '🌱 Prospectadores' },
  { k: 'zonas',          t: '📍 Zonas' },
]

// Los cinco cajones de color de las barras y del pastel. Son menos que los
// estados de la tabla a propósito: diez colores en una barra de 10px no se
// distinguen. Los estados completos van escritos debajo de cada barra, que es
// donde sí se leen.
type Cajon = 'aparto' | 'realizada' | 'cayo' | 'otro' | 'sin'

type Grupo = {
  llave: string
  nombre: string
  total: number
  cajones: Record<Cajon, number>
  /** Cuenta por estado REAL, tal como está escrito en la tabla. */
  porEstado: { estado: string; n: number; color: string }[]
  conRetro: number
  /** Sus citas, para poder abrir el grupo y verlas una por una. */
  citas: CitaParaGrafica[]
}

export default function GraficasCitas({
  filas, nombrePorId = {}, normalizar, mapear, esApartado, esCancelada, esReagendada,
}: Props) {
  const C = useColors()
  const P = usePaleta()
  const pista = C.divider

  const [vista, setVista] = useState<Vista>('resumen')
  const [verTodos, setVerTodos] = useState(false)
  const [verFuera, setVerFuera] = useState(false)
  /** El grupo abierto, con sus citas a la vista. */
  const [abierto, setAbierto] = useState<Grupo | null>(null)

  // Color del estado para la lista de citas. Sale de la paleta validada en vez
  // de los colores de la tabla, para que la gráfica no use dos juegos.
  const colorEstado = (e: string | null | undefined): string => {
    if (!e || !e.trim()) return P.sinEstado
    if (esApartado(e)) return P.aparto
    if (esCancelada(e) || esReagendada(e)) return P.cancelada
    const n = normalizar(e)
    if (n.includes('realizada') || n.includes('esperando retro')) return P.realizada
    return P.otro
  }

  const d = useMemo(() => {
    const base = filas

    // El cajón de color al que va cada cita.
    const cajonDe = (f: CitaParaGrafica): Cajon => {
      const e = f.estado_seguimiento
      if (!e || !e.trim()) return 'sin'
      if (esApartado(e)) return 'aparto'
      // Cancelada y reagenda son un solo estado, como lo decidió el equipo.
      if (esCancelada(e) || esReagendada(e)) return 'cayo'
      const n = normalizar(e)
      if (n.includes('realizada') || n.includes('esperando retro')) return 'realizada'
      return 'otro'
    }

    // El nombre del estado tal cual, ya normalizado por la base.
    const estadoDe = (f: CitaParaGrafica): string => {
      const e = (f.estado_seguimiento ?? '').trim()
      if (!e) return SIN_ESTADO
      return infoEstadoCita(e)?.label ?? e
    }

    const vacio = (): Record<Cajon, number> => ({ aparto: 0, realizada: 0, cayo: 0, otro: 0, sin: 0 })

    const cuenta = vacio()
    let conRetro = 0
    for (const f of base) {
      cuenta[cajonDe(f)]++
      if (f.retro_completada_at) conRetro++
    }

    // Cada grupo se queda con SUS citas, no solo con la cuenta: es lo que deja
    // abrir "Martín · 10 citas" y ver las diez.
    const agrupar = (
      llaveDe: (f: CitaParaGrafica) => { llave: string; nombre: string },
      filtro?: (f: CitaParaGrafica) => boolean,
    ): Grupo[] => {
      const m = new Map<string, Grupo & { estados: Map<string, number> }>()
      for (const f of base) {
        if (filtro && !filtro(f)) continue
        const { llave, nombre } = llaveDe(f)
        if (!m.has(llave)) {
          m.set(llave, {
            llave, nombre, total: 0, cajones: vacio(), porEstado: [],
            conRetro: 0, citas: [], estados: new Map(),
          })
        }
        const g = m.get(llave)!
        g.total++
        g.cajones[cajonDe(f)]++
        if (f.retro_completada_at) g.conRetro++
        g.citas.push(f)
        const e = estadoDe(f)
        g.estados.set(e, (g.estados.get(e) ?? 0) + 1)
      }
      return [...m.values()]
        .map(g => {
          const { estados, ...resto } = g
          return {
            ...resto,
            porEstado: [...estados.entries()]
              .map(([estado, n]) => ({ estado, n, color: colorEstado(estado === SIN_ESTADO ? null : estado) }))
              .sort((a, b) => b.n - a.n),
          }
        })
        .sort((a, b) => b.total - a.total)
    }

    // ── Asesores: los de la app aparte de los de fuera ──
    //
    // En "atendió" conviven tres cosas: gente del equipo, gente de otras
    // inmobiliarias ("atienden allá", "MTY", "Puebla") y cosas que ni son
    // personas ("No se hizo", "Videollamada"). Medido: 12 nombres del equipo
    // con 358 citas, contra una cola de 49 nombres con 97.
    //
    // Mezclados, la cola ensucia la lista y no deja comparar al equipo. Arriba
    // van los de la app, que son a los que se les puede pedir cuentas; abajo
    // el resto amontonado, que sigue a la vista porque también es información:
    // esas citas las atendió alguien de fuera.
    // nombre normalizado → id. Sirve para dos cosas: saber si un texto es de
    // alguien del equipo, y —sobre todo— que una misma persona no salga dos
    // veces. Pasaba con Gimar Salas: unas citas la traen por asesor_id y otras
    // sólo escrita en "atendió", y cada vía armaba su propia llave, así que
    // aparecía partida en dos barras.
    const idPorNombre = new Map<string, string>()
    for (const [id, nombre] of Object.entries(nombrePorId)) {
      if (nombre) idPorNombre.set(normalizar(nombre), id)
    }
    const nombresEquipo = new Set(idPorNombre.keys())
    const esDelEquipo = (f: CitaParaGrafica) => {
      if (f.asesor_id && nombrePorId[f.asesor_id]) return true
      const texto = (f.atendio ?? '').trim()
      // mapear() primero: "Gimar" es Gimar Salas, y sin esto saldría de fuera.
      return texto ? nombresEquipo.has(normalizar(mapear(texto))) : false
    }
    const tieneAlguien = (f: CitaParaGrafica) => !!(f.atendio ?? '').trim() || !!f.asesor_id

    const llaveAsesor = (f: CitaParaGrafica) => {
      const porId = f.asesor_id ? nombrePorId[f.asesor_id] : undefined
      if (porId) return { llave: `id:${f.asesor_id}`, nombre: porId }

      const texto = (f.atendio ?? '').trim()
      if (!texto) return { llave: 'sin', nombre: SIN_ASESOR }

      const nombre = mapear(texto)
      const norm = normalizar(nombre)
      // Si el texto es alguien del equipo, se usa SU id como llave, para que
      // caiga en la misma barra que sus citas con asesor_id.
      const id = idPorNombre.get(norm)
      return id ? { llave: `id:${id}`, nombre: nombrePorId[id] } : { llave: `tx:${norm}`, nombre }
    }

    const asesoresEquipo = agrupar(llaveAsesor, f => esDelEquipo(f))
    const asesoresFuera  = agrupar(llaveAsesor, f => !esDelEquipo(f) && tieneAlguien(f))
    const sinAsesor      = agrupar(llaveAsesor, f => !tieneAlguien(f))

    const prospectadores = agrupar(f => {
      const v = (f.prospecto ?? '').trim()
      if (!v) return { llave: 'sin', nombre: 'Sin prospectador anotado' }
      const nombre = mapear(v)
      return { llave: normalizar(nombre), nombre }
    })

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
      asesoresEquipo, asesoresFuera, sinAsesor, prospectadores, zonas, porMes,
    }
  }, [filas, nombrePorId, normalizar, mapear, esApartado, esCancelada, esReagendada])

  const partes = [
    { label: 'Apartó',             value: d.cuenta.aparto,    color: P.aparto },
    { label: 'Realizada',          value: d.cuenta.realizada, color: P.realizada },
    { label: 'Cancelada/Reagenda', value: d.cuenta.cayo,      color: P.cancelada },
    { label: 'Otros estados',      value: d.cuenta.otro,      color: P.otro },
    { label: 'Sin estado',         value: d.cuenta.sin,       color: P.sinEstado },
  ].filter(p => p.value > 0)

  const tramosDe = (g: Grupo) => [
    { valor: g.cajones.aparto, color: P.aparto },
    { valor: g.cajones.realizada, color: P.realizada },
    { valor: g.cajones.cayo, color: P.cancelada },
    { valor: g.cajones.otro, color: P.otro },
    { valor: g.cajones.sin, color: P.sinEstado },
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

  // Una barra por grupo. Debajo, los estados reales con su cuenta; al tocarla,
  // se abren sus citas.
  const Barras = ({ grupos, max, desde = 0 }: { grupos: Grupo[]; max: number; desde?: number }) => (
    <>
      {grupos.map((g, i) => (
        <TouchableOpacity key={g.llave} activeOpacity={0.7} onPress={() => setAbierto(g)}>
          <BarraAsesor
            pos={desde + i + 1}
            nombre={g.nombre}
            total={g.total}
            max={max}
            tramos={tramosDe(g)}
            colorTexto={C.text}
            colorPista={pista}
            nota={g.porEstado.map(e => `${e.estado} ${e.n}`).join('  ·  ')}
          />
        </TouchableOpacity>
      ))}
    </>
  )

  const ListaBarras = ({ grupos, vacio }: { grupos: Grupo[]; vacio: string }) => {
    const max = Math.max(1, ...grupos.map(g => g.total))
    const mostrar = verTodos ? grupos : grupos.slice(0, TOPE_LISTA)
    if (grupos.length === 0) return <Text style={s.vacio}>{vacio}</Text>
    return (
      <>
        <Barras grupos={mostrar} max={max} />
        {grupos.length > TOPE_LISTA ? (
          <TouchableOpacity style={s.verMas} onPress={() => setVerTodos(v => !v)}>
            <Text style={s.verMasTxt}>
              {verTodos ? 'Ver menos' : `Ver los ${grupos.length - TOPE_LISTA} restantes`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {LeyendaResultados}
        <Text style={{ fontSize: 10.5, color: C.textMute, marginTop: 9 }}>
          Toca una barra para ver sus citas una por una.
        </Text>
      </>
    )
  }

  const pct = (n: number) => d.total > 0 ? Math.round((n / d.total) * 100) : 0

  const fechaCorta = (f: CitaParaGrafica) => {
    const v = f.fecha_apartado && esApartado(f.estado_seguimiento) ? f.fecha_apartado : f.fecha_cita
    if (!v) return f.dia_cita ?? 'Sin fecha'
    const t = new Date(v)
    return isNaN(t.getTime())
      ? (f.dia_cita ?? 'Sin fecha')
      : t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })
  }

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
                onPress={() => { setVista(v.k); setVerTodos(false); setVerFuera(false) }}
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
              { n: d.total,              t: 'Citas',            c: C.text },
              { n: d.cuenta.realizada,   t: 'Realizadas',       c: P.realizada },
              { n: d.cuenta.aparto,      t: 'Apartaron',        c: P.aparto },
              { n: d.cuenta.cayo,        t: 'Cancel./Reagenda', c: P.cancelada },
              { n: d.conRetro,           t: 'Con retro',        c: P.realizada },
              { n: d.cuenta.sin,         t: 'Sin estado',       c: '#9aa5ab' },
            ].map((k, i) => (
              <View key={i} style={[s.kpi, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[s.kpiNum, { color: k.c }]}>{k.n}</Text>
                <Text style={s.kpiTxt}>{k.t}</Text>
              </View>
            ))}
          </View>

          <Tarjeta titulo="En qué acabaron las citas">
            <View style={s.donaFila}>
              <Dona partes={partes} centro={String(d.total)} subcentro="citas" colorTexto={C.text} />
              <Leyenda partes={partes} total={d.total} colorTexto={C.text} />
            </View>
            {d.conEstado > 0 ? (
              <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 17, marginTop: 11 }}>
                De las <Text style={{ fontWeight: '800', color: C.text }}>{d.conEstado}</Text> citas
                con estado anotado, <Text style={{ fontWeight: '800', color: P.aparto }}>{d.cuenta.aparto} apartaron </Text>
                ({Math.round((d.cuenta.aparto / d.conEstado) * 100)}%)
                y <Text style={{ fontWeight: '800', color: P.cancelada }}>{d.cuenta.cayo} quedaron en Cancelada/Reagenda</Text>.
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
                { nombre: 'Citas',              n: d.total,     nota: 'Todas las que se ven arriba' },
                { nombre: 'Con estado anotado', n: d.conEstado, nota: 'Alguien escribió en qué acabó' },
                { nombre: 'Se realizaron',      n: d.cuenta.realizada + d.cuenta.aparto, nota: 'La cita sí ocurrió' },
                { nombre: 'Apartaron',          n: d.cuenta.aparto, nota: 'Acabó en apartado' },
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
      {vista === 'asesores' && (() => {
        const max = Math.max(1, ...d.asesoresEquipo.map(g => g.total), ...d.asesoresFuera.map(g => g.total))
        const totalFuera = d.asesoresFuera.reduce((a, g) => a + g.total, 0)
        const totalSin = d.sinAsesor.reduce((a, g) => a + g.total, 0)
        return (
          <>
            <Tarjeta titulo="Asesores del equipo" sub="Los que tienen cuenta en la app.">
              {d.asesoresEquipo.length === 0
                ? <Text style={s.vacio}>Ninguna cita atendida por alguien del equipo.</Text>
                : <>
                    <Barras grupos={verTodos ? d.asesoresEquipo : d.asesoresEquipo.slice(0, TOPE_LISTA)} max={max} />
                    {d.asesoresEquipo.length > TOPE_LISTA ? (
                      <TouchableOpacity style={s.verMas} onPress={() => setVerTodos(v => !v)}>
                        <Text style={s.verMasTxt}>
                          {verTodos ? 'Ver menos' : `Ver los ${d.asesoresEquipo.length - TOPE_LISTA} restantes`}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {LeyendaResultados}
                    <Text style={{ fontSize: 10.5, color: C.textMute, marginTop: 9 }}>
                      Toca una barra para ver sus citas una por una.
                    </Text>
                  </>}
            </Tarjeta>

            {totalFuera > 0 ? (
              <Tarjeta
                titulo="Atendieron de fuera"
                sub="Nombres que no tienen cuenta en la app: otras inmobiliarias, apoyos, o anotaciones que ni son personas."
              >
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 30, fontWeight: '800', color: P.otro }}>{totalFuera}</Text>
                  <Text style={{ fontSize: 12.5, color: C.textSub, fontWeight: '600' }}>
                    citas en {d.asesoresFuera.length} nombres distintos
                  </Text>
                </View>
                <TouchableOpacity style={s.verMas} onPress={() => setVerFuera(v => !v)}>
                  <Text style={s.verMasTxt}>{verFuera ? 'Ocultar' : 'Ver quiénes son'}</Text>
                </TouchableOpacity>
                {verFuera ? <Barras grupos={d.asesoresFuera} max={max} /> : null}
              </Tarjeta>
            ) : null}

            {totalSin > 0 ? (
              <Tarjeta titulo="Sin asesor anotado" sub="Nadie escribió quién atendió estas citas.">
                <Barras grupos={d.sinAsesor} max={max} />
              </Tarjeta>
            ) : null}
          </>
        )
      })()}

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

      {/* ═══════════ LAS CITAS DE UN GRUPO ═══════════ */}
      <Modal visible={!!abierto} transparent animationType="fade" onRequestClose={() => setAbierto(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
          <View style={{
            backgroundColor: C.card, borderRadius: 16, padding: 16,
            maxHeight: '86%', maxWidth: 620, width: '100%', alignSelf: 'center',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16.5, fontWeight: '800', color: C.text }} numberOfLines={1}>
                  {abierto?.nombre}
                </Text>
                <Text style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>
                  {abierto?.total} {abierto?.total === 1 ? 'cita' : 'citas'}
                  {abierto ? `  ·  ${abierto.conRetro} con retro` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAbierto(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: 22, color: C.textMute }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* El desglose por estado, otra vez, para no tener que contarlo */}
            {abierto ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10, marginBottom: 6 }}>
                {abierto.porEstado.map(e => (
                  <View key={e.estado} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    borderWidth: 1, borderColor: e.color, borderRadius: 999,
                    paddingHorizontal: 9, paddingVertical: 4,
                  }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: e.color }} />
                    <Text style={{ fontSize: 11, color: C.text, fontWeight: '700' }}>{e.estado} {e.n}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView style={{ marginTop: 6 }}>
              {(abierto?.citas ?? []).map((f, i) => {
                const est = (f.estado_seguimiento ?? '').trim()
                const col = colorEstado(est || null)
                return (
                  <View key={f.id ?? i} style={{
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.divider,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text }} numberOfLines={1}>
                        {f.cliente_nombre?.trim() || 'Sin nombre'}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: C.textMute }}>{fechaCorta(f)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: col + '22', borderRadius: 999,
                        paddingHorizontal: 8, paddingVertical: 3,
                      }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col }} />
                        <Text style={{ fontSize: 11, color: C.text, fontWeight: '700' }}>
                          {est || SIN_ESTADO}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: f.retro_completada_at ? P.realizada : C.textMute, fontWeight: '700' }}>
                        {f.retro_completada_at ? '✓ con retro' : 'sin retro'}
                      </Text>
                    </View>
                    {(f.interesado_en?.trim() || f.zona_interesada?.trim()) ? (
                      <Text style={{ fontSize: 11, color: C.textSub, marginTop: 5 }} numberOfLines={1}>
                        {[f.interesado_en?.trim(), f.zona_interesada?.trim()].filter(Boolean).join('  ·  ')}
                      </Text>
                    ) : null}
                  </View>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}
