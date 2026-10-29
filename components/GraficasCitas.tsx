// Tablero de accountability de las citas de venta, armado con el marco de
// El Principio de Oz (Roger Connors, Tom Smith y Craig Hickman).
//
// El libro parte de una línea. Debajo está el ciclo de la víctima: ignorarlo,
// "no es mi trabajo", culpar, confusión, cubrirse las espaldas y esperar a ver
// qué pasa. Arriba están cuatro pasos: VERLO, ASUMIRLO, RESOLVERLO y HACERLO.
// Esta pantalla mide esos cuatro pasos con los datos que la app ya guarda, y
// enseña quién está arriba y quién abajo de la línea.
//
// Las cuentas no viven aquí: viven en lib/accountability-citas.ts, con la
// explicación de cómo se traduce cada paso del libro a algo contable. Aquí
// solo se dibuja.
//
// No hace consultas: la pantalla ya trae las 900+ filas en memoria, así que
// todo se calcula sobre lo que ya está. Abrirlo y cerrarlo no cuesta red, y
// las gráficas respetan los filtros de la tabla (fechas, columnas estilo
// Excel), así que nunca dicen algo distinto de lo que se ve arriba.
import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useColors } from '../lib/ThemeContext'
import {
  Leyenda, s,
  Embudo, PuntosConLinea, CuatroPasosBarras, BarraMezcla,
  usePaleta, usePaletaLinea, sOz,
} from './graficas-base'
import {
  clasificar, resumenOrganizacional, calificarPersonas, analizarReagendas,
  cicloVictima, porZona, embudo,
  CORTE_SOBRE_LA_LINEA, CORTE_EN_LA_LINEA, MINIMO_PARA_CALIFICAR,
  type CitaParaGrafica, type Ayudas, type Persona,
} from '../lib/accountability-citas'

export type { CitaParaGrafica }

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

type Seccion = 'resumen' | 'personas' | 'reagendas' | 'ciclo' | 'zonas'
const SECCIONES: { k: Seccion; t: string }[] = [
  { k: 'resumen',   t: 'La operación' },
  { k: 'personas',  t: 'Calificar gente' },
  { k: 'reagendas', t: 'Reagendas' },
  { k: 'ciclo',     t: 'Ciclo de la víctima' },
  { k: 'zonas',     t: 'Zonas' },
]

type Papel = 'dueno' | 'prospecto' | 'coordino'
const PAPELES: { k: Papel; t: string; sub: string }[] = [
  { k: 'dueno',     t: 'Quién atendió',  sub: 'Por asesor_id, o por el nombre cuando coincide con alguien del equipo.' },
  { k: 'prospecto', t: 'Quién prospectó', sub: 'Del campo «prospecto», que es texto libre.' },
  { k: 'coordino',  t: 'Quién coordinó',  sub: 'Del campo «coordinó», que es texto libre.' },
]

// La cola de nombres es larga y con muchos de una sola cita. Se enseñan los
// primeros y el resto queda detrás de un botón, en vez de esconderlos.
const TOPE_LISTA = 12

// Referencia del sector para la recuperación de reagendas. Viene de guías de
// venta inmobiliaria y de appointment setting, no de un estándar: sirve para
// saber si un número es malo, no como meta oficial. Lo que dicen es que por
// debajo de 60% el equipo está siendo pasivo cuando una cita se cae.
const REF_RECUPERACION = 60

export default function GraficasCitas({
  filas, nombrePorId = {}, normalizar, mapear, esApartado, esCancelada, esReagendada,
}: Props) {
  const C = useColors()
  const P = usePaleta()
  const PL = usePaletaLinea()
  const pista = C.divider

  const [seccion, setSeccion] = useState<Seccion>('resumen')
  const [papel, setPapel] = useState<Papel>('dueno')
  const [verTodos, setVerTodos] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const ayudas: Ayudas = useMemo(
    () => ({ normalizar, mapear, esApartado, esCancelada, esReagendada, nombrePorId }),
    [normalizar, mapear, esApartado, esCancelada, esReagendada, nombrePorId],
  )

  const cs = useMemo(() => clasificar(filas, ayudas), [filas, ayudas])
  const org = useMemo(() => resumenOrganizacional(cs), [cs])
  const emb = useMemo(() => embudo(cs), [cs])
  const grupo = useMemo(() => calificarPersonas(cs, papel, ayudas), [cs, papel, ayudas])
  const reag = useMemo(() => analizarReagendas(cs, ayudas), [cs, ayudas])
  const ciclo = useMemo(() => cicloVictima(cs), [cs])
  const zonas = useMemo(() => porZona(cs), [cs])

  const Tarjeta = ({ titulo, sub, children }: { titulo: string; sub?: string; children: any }) => (
    <View style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[s.tarjetaTitulo, { color: C.text }]}>{titulo}</Text>
      {sub ? <Text style={s.tarjetaSub}>{sub}</Text> : null}
      {children}
    </View>
  )

  const colorDonde = (d: Persona['donde']) =>
    d === 'sobre' ? PL.sobre : d === 'en' ? PL.en : d === 'bajo' ? PL.bajo : PL.sin
  const palabraDonde = (d: Persona['donde']) =>
    d === 'sobre' ? 'Sobre la línea' : d === 'en' ? 'En la línea' : d === 'bajo' ? 'Bajo la línea' : 'Pocas citas'

  // Los cuatro pasos, listos para dibujar. El color es de estado y siempre va
  // con la palabra al lado: el color solo no es una etiqueta.
  const pasosDe = (p: { verlo: number | null; verloExitos: number; verloBase: number
                        asumirlo: number | null; asumirloExitos: number; asumirloBase: number
                        resolverlo: number | null; resolverloExitos: number; resolverloBase: number
                        hacerlo: number | null; hacerloExitos: number; hacerloBase: number }) => [
    { nombre: '1 Verlo',      pct: p.verlo,      exitos: p.verloExitos,      base: p.verloBase,      color: P.aparto },
    { nombre: '2 Asumirlo',   pct: p.asumirlo,   exitos: p.asumirloExitos,   base: p.asumirloBase,   color: P.aparto },
    { nombre: '3 Resolverlo', pct: p.resolverlo, exitos: p.resolverloExitos, base: p.resolverloBase, color: P.aparto },
    { nombre: '4 Hacerlo',    pct: p.hacerlo,    exitos: p.hacerloExitos,    base: p.hacerloBase,    color: P.aparto },
  ]

  // ─── Las pestañas ──────────────────────────────────────────────────────────
  const Pestañas = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 7, paddingVertical: 2 }}>
        {SECCIONES.map(x => {
          const on = seccion === x.k
          return (
            <TouchableOpacity
              key={x.k}
              onPress={() => setSeccion(x.k)}
              style={{
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                borderColor: on ? P.aparto : C.border,
                backgroundColor: on ? P.aparto : 'transparent',
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : C.textSub }}>
                {x.t}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </ScrollView>
  )

  // ─── Aviso de qué quedó fuera ──────────────────────────────────────────────
  // Va en todas las secciones: si no se dice, cualquier número de esta pantalla
  // se lee como si cubriera las 963 citas, y no es así.
  const Aviso = org.delExcel > 0 ? (
    <View style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border, paddingVertical: 11 }]}>
      <Text style={{ fontSize: 11.5, color: C.textSub, lineHeight: 16.5 }}>
        Calificando <Text style={{ fontWeight: '800', color: C.text }}>{org.evaluables} citas</Text> hechas
        en la app. Las <Text style={{ fontWeight: '800' }}>{org.delExcel}</Text> del Excel viejo quedan
        fuera: solo el 9% trae resultado anotado, contra el 93% de las de la app, y calificar a alguien
        por filas que nadie iba a llenar no sería justo.
      </Text>
    </View>
  ) : null

  return (
    <View style={{ gap: 12 }}>
      {Pestañas}
      {Aviso}

      {/* ══════════════════ LA OPERACIÓN ══════════════════ */}
      {seccion === 'resumen' && (
        <>
          <Tarjeta
            titulo="Los cuatro pasos de la operación"
            sub="El Principio de Oz: para pasar de la víctima al resultado hay que verlo, asumirlo, resolverlo y hacerlo. Así va el equipo completo en cada paso."
          >
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontSize: 44, fontWeight: '800', color: colorDonde(
                org.calificacion === null ? 'sin_datos'
                  : org.calificacion >= CORTE_SOBRE_LA_LINEA ? 'sobre'
                  : org.calificacion >= CORTE_EN_LA_LINEA ? 'en' : 'bajo',
              ) }}>
                {org.calificacion === null ? '—' : Math.round(org.calificacion)}
              </Text>
              <Text style={{ fontSize: 12, color: C.textSub, fontWeight: '700' }}>
                calificación de la operación, de 100
              </Text>
            </View>

            <CuatroPasosBarras pasos={pasosDe(org.pasos)} colorTexto={C.text} colorPista={pista} />

            <View style={{ marginTop: 14, gap: 7 }}>
              {[
                ['1 Verlo', 'Que quede anotado qué pasó en la cita. Una cita que ya pasó y sigue en blanco es ignorar el problema, el primer escalón del ciclo de la víctima.'],
                ['2 Asumirlo', 'Que alguien escriba la retro: qué pasó y cuál fue su parte.'],
                ['3 Resolverlo', 'De las citas que salieron mal, en cuántas quedó un siguiente paso. El libro lo resume en una pregunta: «¿qué más puedo hacer?».'],
                ['4 Hacerlo', 'Que la cita de verdad ocurra y acabe en algo.'],
              ].map(([t, x]) => (
                <Text key={t} style={{ fontSize: 11, color: C.textSub, lineHeight: 15.5 }}>
                  <Text style={{ fontWeight: '800', color: C.text }}>{t}. </Text>{x}
                </Text>
              ))}
            </View>
          </Tarjeta>

          <Tarjeta
            titulo="En qué se cae el embudo"
            sub="De las citas cuya fecha ya pasó, cuántas llegan a cada paso. La caída entre un paso y otro es el dato que importa."
          >
            <Embudo pasos={emb} colorTexto={C.text} colorPista={pista} color={P.aparto} />
          </Tarjeta>

          <Tarjeta
            titulo="«No es mi trabajo», en números"
            sub="El segundo escalón del ciclo de la víctima: la cita que no es de nadie. Aquí se ve qué le pasa a una cita según si tiene dueño o no."
          >
            <View style={s.kpis}>
              <View style={[s.kpi, { backgroundColor: C.bg2, borderColor: C.border }]}>
                <Text style={[s.kpiNum, { color: PL.bajo }]}>{org.sinDueno}</Text>
                <Text style={s.kpiTxt}>sin dueño</Text>
              </View>
              <View style={[s.kpi, { backgroundColor: C.bg2, borderColor: C.border }]}>
                <Text style={[s.kpiNum, { color: PL.sobre }]}>{org.conDueno}</Text>
                <Text style={s.kpiTxt}>con dueño</Text>
              </View>
            </View>

            {org.reagendaSinDueno !== null && org.reagendaConDueno !== null ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 9 }}>
                  Cuántas se reagendan
                </Text>
                <PuntosConLinea
                  filas={[
                    { nombre: 'Sin dueño', valor: org.reagendaSinDueno, color: PL.bajo },
                    { nombre: 'Con dueño', valor: org.reagendaConDueno, color: PL.sobre },
                  ]}
                  cortes={[]}
                  colorTexto={C.text}
                  colorPista={pista}
                  colorLinea={C.textMute}
                />
                <Text style={{ fontSize: 11, color: C.textSub, lineHeight: 15.5, marginTop: 6 }}>
                  Una cita sin dueño se reagenda {(org.reagendaSinDueno / Math.max(org.reagendaConDueno, 0.01)).toFixed(1)} veces
                  más que una que sí lo tiene. Puede ser que asignar al asesor evite la caída, o que la
                  cita se cayera antes de que alguien la tomara y por eso el campo quedó vacío: con
                  estos datos no se puede saber cuál de las dos. Lo que sí se ve es que la cita sin
                  dueño es la que se muere.
                </Text>
              </View>
            ) : null}
          </Tarjeta>
        </>
      )}

      {/* ══════════════════ CALIFICAR GENTE ══════════════════ */}
      {seccion === 'personas' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {PAPELES.map(x => {
                const on = papel === x.k
                return (
                  <TouchableOpacity
                    key={x.k}
                    onPress={() => { setPapel(x.k); setAbierta(null); setVerTodos(false) }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1,
                      borderColor: on ? P.aparto : C.border,
                      backgroundColor: on ? P.aparto : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#fff' : C.textSub }}>
                      {x.t}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>

          <Tarjeta
            titulo="Dónde cae cada quien"
            sub={`${PAPELES.find(p => p.k === papel)!.sub} La línea del libro está en ${CORTE_SOBRE_LA_LINEA}; por debajo de ${CORTE_EN_LA_LINEA} es el ciclo de la víctima.`}
          >
            {grupo.personas.filter(p => p.confiable).length === 0 ? (
              <Text style={s.vacio}>
                Nadie llega todavía a {MINIMO_PARA_CALIFICAR} citas en lo que está filtrado, que es el
                mínimo para calificar a alguien sin inventar.
              </Text>
            ) : (
              <>
                <PuntosConLinea
                  filas={grupo.personas.filter(p => p.confiable).map(p => ({
                    nombre: p.nombre,
                    valor: p.calificacion,
                    color: colorDonde(p.donde),
                  }))}
                  cortes={[
                    { en: CORTE_EN_LA_LINEA, nombre: 'ciclo' },
                    { en: CORTE_SOBRE_LA_LINEA, nombre: 'la línea' },
                  ]}
                  colorTexto={C.text}
                  colorPista={pista}
                  colorLinea={C.text}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 10 }}>
                  {([['sobre', 'Sobre la línea'], ['en', 'En la línea'], ['bajo', 'Bajo la línea']] as const).map(([k, t]) => (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colorDonde(k) }} />
                      <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>{t}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Tarjeta>

          {/* Cada persona, con sus cuatro pasos y las cuentas crudas */}
          {(verTodos ? grupo.personas : grupo.personas.slice(0, TOPE_LISTA)).map(p => {
            const abierto = abierta === p.llave
            return (
              <TouchableOpacity
                key={p.llave}
                activeOpacity={0.85}
                onPress={() => setAbierta(abierto ? null : p.llave)}
                style={[s.tarjeta, { backgroundColor: C.card, borderColor: C.border, paddingVertical: 13 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colorDonde(p.donde) + '22',
                    borderWidth: 2, borderColor: colorDonde(p.donde),
                  }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>
                      {p.calificacion === null || !p.confiable ? '—' : Math.round(p.calificacion)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }} numberOfLines={1}>
                      {p.nombre}
                    </Text>
                    <Text style={{ fontSize: 11, color: colorDonde(p.donde), fontWeight: '700', marginTop: 1 }}>
                      {palabraDonde(p.donde)}
                      <Text style={{ color: C.textMute, fontWeight: '600' }}>
                        {'  ·  '}{p.citas} {p.citas === 1 ? 'cita' : 'citas'}
                      </Text>
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, color: C.textMute }}>{abierto ? '▴' : '▾'}</Text>
                </View>

                {!p.confiable ? (
                  <Text style={{ fontSize: 10.5, color: C.textSub, marginTop: 8, lineHeight: 14.5 }}>
                    Con {p.citas} {p.citas === 1 ? 'cita' : 'citas'} no se puede calificar: hacen falta
                    al menos {MINIMO_PARA_CALIFICAR}. Un porcentaje sobre dos citas no es un porcentaje.
                  </Text>
                ) : null}

                {abierto ? (
                  <View style={{ marginTop: 13, gap: 12 }}>
                    <CuatroPasosBarras pasos={pasosDe(p.pasos)} colorTexto={C.text} colorPista={pista} />
                    <View>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.text, marginBottom: 7 }}>
                        En qué acabaron sus citas
                      </Text>
                      <BarraMezcla tramos={[
                        { valor: p.aparto, color: P.aparto },
                        { valor: p.realizadas, color: P.realizada },
                        { valor: p.reagendadas, color: P.reagendada },
                        { valor: p.canceladas, color: P.cancelada },
                        { valor: p.sinResultado, color: P.sinEstado },
                      ]} />
                      <Leyenda
                        partes={[
                          { label: 'Apartó', value: p.aparto, color: P.aparto },
                          { label: 'Realizada', value: p.realizadas, color: P.realizada },
                          { label: 'Reagendada', value: p.reagendadas, color: P.reagendada },
                          { label: 'Cancelada', value: p.canceladas, color: P.cancelada },
                          { label: 'Sin resultado', value: p.sinResultado, color: P.sinEstado },
                        ].filter(x => x.value > 0)}
                        total={p.citas}
                        colorTexto={C.text}
                      />
                    </View>
                    <Text style={{ fontSize: 10.5, color: C.textMute, lineHeight: 14.5 }}>
                      Los porcentajes están acercados al promedio del equipo según cuántas citas tenga
                      esta persona: con pocas citas pesa más el promedio, con muchas pesa más lo suyo.
                      Es lo que evita que quien tuvo dos citas buenas salga arriba de quien lleva veinte.
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )
          })}

          {grupo.personas.length > TOPE_LISTA ? (
            <TouchableOpacity style={s.verMas} onPress={() => setVerTodos(v => !v)}>
              <Text style={s.verMasTxt}>
                {verTodos ? 'Ver menos' : `Ver los ${grupo.personas.length - TOPE_LISTA} restantes`}
              </Text>
            </TouchableOpacity>
          ) : null}

          {grupo.sinDueno.length > 0 ? (
            <Tarjeta
              titulo="Citas que no entraron a ninguna calificación"
              sub="Nadie reconocible anotado en este papel, así que no se le pueden cargar a nadie."
            >
              <Text style={{ fontSize: 24, fontWeight: '800', color: PL.bajo }}>
                {grupo.sinDueno.length}
              </Text>
              <Text style={{ fontSize: 11.5, color: C.textSub, lineHeight: 16, marginTop: 4 }}>
                {papel === 'dueno'
                  ? 'Sin asesor asignado, o con un texto que no es una persona del equipo («atienden allá», «videollamada», «no se hizo»). Son el hueco más grande del tablero: mientras estén así, no hay a quién preguntarle qué pasó.'
                  : 'El campo está vacío en estas citas.'}
              </Text>
            </Tarjeta>
          ) : null}
        </>
      )}

      {/* ══════════════════ REAGENDAS ══════════════════ */}
      {seccion === 'reagendas' && (
        <>
          <Tarjeta
            titulo="Qué pasa cuando una cita se cae"
            sub="Una reagenda no es el problema: es una circunstancia. El libro mide el accountability en lo que pasa DESPUÉS. Aquí está lo que pasa después."
          >
            <View style={s.kpis}>
              {/* Los dos de en medio van en color de texto normal, no en
                  verde: son resultados deseables, pero 6 y 1 no son buenas
                  noticias. Pintarlos de verde haría que el color dijera «bien»
                  donde el número dice lo contrario, y el color de estado no
                  está para adornar. */}
              {[
                { n: reag.total, t: 'reagendas', c: P.reagendada },
                { n: reag.recuperadas, t: reag.recuperadas === 1 ? 'volvió a agendarse' : 'volvieron a agendarse', c: C.text },
                { n: reag.recuperadasBien, t: reag.recuperadasBien === 1 ? 'acabó bien' : 'acabaron bien', c: C.text },
                { n: reag.abandonadas, t: 'ahí quedaron', c: PL.bajo },
              ].map((k, i) => (
                <View key={i} style={[s.kpi, { backgroundColor: C.bg2, borderColor: C.border }]}>
                  <Text style={[s.kpiNum, { color: k.c }]}>{k.n}</Text>
                  <Text style={s.kpiTxt}>{k.t}</Text>
                </View>
              ))}
            </View>

            {reag.tasaRecuperacion !== null ? (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 9 }}>
                  Recuperación de reagendas
                </Text>
                <PuntosConLinea
                  filas={[{
                    nombre: 'Valera',
                    valor: reag.tasaRecuperacion,
                    color: reag.tasaRecuperacion >= REF_RECUPERACION ? PL.sobre : PL.bajo,
                  }]}
                  cortes={[{ en: REF_RECUPERACION, nombre: 'referencia' }]}
                  colorTexto={C.text}
                  colorPista={pista}
                  colorLinea={C.text}
                />
                <Text style={{ fontSize: 11, color: C.textSub, lineHeight: 16, marginTop: 6 }}>
                  De {reag.total} citas que se cayeron, {reag.recuperadas} volvieron a agendarse
                  ({Math.round(reag.tasaRecuperacion)}%) y {reag.recuperadasBien} acabaron en algo.
                  Las guías de venta inmobiliaria toman el {REF_RECUPERACION}% como la raya por debajo
                  de la cual el equipo está siendo pasivo cuando una cita se cae. Son referencias de
                  despachos y proveedores, no un estándar, así que sirven para saber si el número es
                  malo, no como meta oficial.
                </Text>
                {reag.tambienCanceladas > 0 ? (
                  <Text style={{ fontSize: 10.5, color: C.textMute, lineHeight: 14.5, marginTop: 7 }}>
                    Incluye {reag.tambienCanceladas} que la tabla pinta como canceladas porque su
                    estado dice «cancelada/reagenda». Ahí manda la cancelación para el color, pero
                    para este conteo siguen siendo reagendas y dejarlas fuera esconde un tercio del
                    problema.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Tarjeta>

          {reag.rescatables.length > 0 ? (
            <Tarjeta
              titulo={`${reag.rescatables.length} se pueden rescatar hoy`}
              sub="Se cayeron y no quedó nada: ni plan, ni próxima fecha, ni otra cita. Las más recientes primero, que son las que todavía se acuerdan de ustedes."
            >
              {reag.rescatables.slice(0, 15).map((c, i) => (
                <View key={c.cita.id ?? i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingVertical: 9,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.divider,
                }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: PL.bajo }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }} numberOfLines={1}>
                      {c.cita.cliente_nombre?.trim() || 'Sin nombre'}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: C.textSub, marginTop: 1 }} numberOfLines={1}>
                      {[
                        c.cita.fecha_cita ? new Date(c.cita.fecha_cita).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null,
                        c.duenoNombre ?? 'sin dueño',
                        c.zona,
                      ].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                </View>
              ))}
              {reag.rescatables.length > 15 ? (
                <Text style={{ fontSize: 11, color: C.textMute, marginTop: 9 }}>
                  Y {reag.rescatables.length - 15} más. La lista completa son las citas reagendadas o
                  canceladas de la tabla de arriba, sin plan de acción.
                </Text>
              ) : null}
            </Tarjeta>
          ) : null}
        </>
      )}

      {/* ══════════════════ CICLO DE LA VÍCTIMA ══════════════════ */}
      {seccion === 'ciclo' && (
        <>
          <Tarjeta
            titulo="El ciclo de la víctima, con rastro en los datos"
            sub="Cada escalón del ciclo deja una huella distinta en la tabla. Aquí no se adivina la intención de nadie: se cuenta la huella y se dice exactamente qué se contó."
          >
            {ciclo.map((e, i) => {
              const max = Math.max(1, ...ciclo.map(x => x.citas.length))
              return (
                <View key={e.clave} style={{
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.divider,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: e.citas.length > 0 ? PL.bajo : PL.sobre, minWidth: 42 }}>
                      {e.citas.length}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '800', color: C.text }}>
                      {e.nombre}
                    </Text>
                  </View>
                  {/* La pista va con alto propio y SIN flex: dentro de una
                      columna, flex:1 pone flex-basis en 0 y le gana al alto,
                      así que la barra se quedaba de 0px y no se veía nada. */}
                  <View style={{
                    height: 8, borderRadius: 4, overflow: 'hidden',
                    backgroundColor: pista, marginTop: 8, marginBottom: 8,
                  }}>
                    <View style={{
                      width: `${(e.citas.length / max) * 100}%`,
                      height: '100%', backgroundColor: PL.bajo, borderRadius: 4,
                    }} />
                  </View>
                  <Text style={{ fontSize: 11.5, color: C.textSub, lineHeight: 16 }}>{e.explica}</Text>
                  <Text style={{ fontSize: 10.5, color: C.textMute, lineHeight: 14.5, marginTop: 4 }}>
                    Se cuenta: {e.comoSeMide}
                  </Text>
                </View>
              )
            })}
          </Tarjeta>

          <Tarjeta titulo="Lo que este tablero NO puede medir" sub="Para que nadie lea un hueco como un cero.">
            <Text style={{ fontSize: 11.5, color: C.textSub, lineHeight: 16.5 }}>
              El escalón de <Text style={{ fontWeight: '800', color: C.text }}>culpar a otros</Text> es
              el que falta. Haría falta leer cada retro y juzgar si echa la culpa, y eso no se puede
              contar sin ponerle palabras en la boca a quien la escribió. Lo más cerca que se puede
              llegar con estos datos es «cubrirse las espaldas»: la retro escrita sin ningún siguiente
              paso. Describir sin resolver.
            </Text>
          </Tarjeta>
        </>
      )}

      {/* ══════════════════ ZONAS ══════════════════ */}
      {seccion === 'zonas' && (
        <Tarjeta
          titulo="Por zona"
          sub="El volumen cuenta todas las citas, porque la zona sí viene capturada en el Excel viejo. Las tasas solo cuentan las de la app, donde el resultado está anotado. Son bases distintas a propósito."
        >
          {zonas.zonas.length === 0 ? (
            <Text style={s.vacio}>Ninguna cita de lo filtrado trae zona.</Text>
          ) : (
            <>
              {/* La barra se angosta según cuántas citas CON RESULTADO tenga la
                  zona, no al 100% siempre. Si todas midieran lo mismo, una zona
                  con una sola cita anotada se vería tan sólida como una con
                  catorce, y un caso suelto se leería como un patrón. */}
              {(() => {
                const maxRes = Math.max(1, ...zonas.zonas.map(z => z.conResultado))
                const MIN_PARA_PROPORCION = 3
                return zonas.zonas.slice(0, verTodos ? 100 : TOPE_LISTA).map((z, i) => (
                  <View key={z.nombre} style={{
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.divider,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }} numberOfLines={1}>
                        {z.nombre}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>{z.citasTotales}</Text>
                    </View>
                    {z.conResultado >= MIN_PARA_PROPORCION ? (
                      <>
                        <View style={{ marginTop: 7, width: `${(z.conResultado / maxRes) * 100}%` }}>
                          <BarraMezcla tramos={[
                            { valor: z.aparto, color: P.aparto },
                            { valor: z.realizadas, color: P.realizada },
                            { valor: z.reagendadas, color: P.reagendada },
                            { valor: z.canceladas, color: P.cancelada },
                          ]} alto={9} />
                        </View>
                        <Text style={{ fontSize: 10.5, color: C.textMute, marginTop: 5 }}>
                          {z.conResultado} con resultado  ·  {z.aparto} apartaron  ·  {z.reagendadas} reagendadas
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 10.5, color: C.textMute, marginTop: 5 }}>
                        {z.conResultado === 0
                          ? 'Ninguna cita con resultado anotado, así que no hay nada que repartir.'
                          : `Solo ${z.conResultado} con resultado anotado: muy pocas para sacar una proporción.`}
                      </Text>
                    )}
                  </View>
                ))
              })()}

              {zonas.zonas.length > TOPE_LISTA ? (
                <TouchableOpacity style={s.verMas} onPress={() => setVerTodos(v => !v)}>
                  <Text style={s.verMasTxt}>
                    {verTodos ? 'Ver menos' : `Ver las ${zonas.zonas.length - TOPE_LISTA} restantes`}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 12 }}>
                {[
                  ['Apartó', P.aparto], ['Realizada', P.realizada],
                  ['Reagendada', P.reagendada], ['Cancelada', P.cancelada],
                ].map(([t, c]) => (
                  <View key={t as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c as string }} />
                    <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>{t as string}</Text>
                  </View>
                ))}
              </View>

              {zonas.sinZona > 0 ? (
                <Text style={{ fontSize: 11, color: C.textMute, marginTop: 11, lineHeight: 15.5 }}>
                  {zonas.sinZona} citas de la app no traen zona, así que no salen en ninguna de estas
                  barras. Es el primer hueco a cerrar si se quiere comparar zonas en serio.
                </Text>
              ) : null}
            </>
          )}
        </Tarjeta>
      )}
    </View>
  )
}
