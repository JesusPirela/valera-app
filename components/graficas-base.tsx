// Piezas de gráfica compartidas por los apartados de citas y de apartados.
// Son las mismas que usa estadisticas.tsx (dona en SVG, barras con pista), aquí
// juntas para que las dos pantallas se vean igual y un arreglo valga para las
// dos.
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../lib/ThemeContext'

// ─── Los colores de estado ───────────────────────────────────────────────────
// Estos seis no son colores decorativos: cada uno significa un resultado, y
// salen pegados uno al lado del otro en las donas y en las barras apiladas. Si
// dos no se distinguen, la gráfica miente.
//
// Se midieron con un validador de paletas en vez de a ojo, y salieron dos
// problemas de verdad en los colores que había antes:
//
//  · reagendada (#e08e3c) contra cancelada (#d9534f) estaban a ΔE 14.2, por
//    debajo del piso de 15: costaba distinguirlas INCLUSO con visión normal. Y
//    son justo las dos que más importa separar.
//  · cancelada (#d9534f) contra realizada (#2e9e5b) estaban a ΔE 3.0 para
//    daltonismo deuteranope, que es el más común. Para esas personas el rojo y
//    el verde eran el mismo color, o sea que la gráfica no decía nada.
//
// Con el rojo más oscuro y el ámbar más amarillo, todos los pares pasan: 8.1
// el peor para daltonismo, 19.7 el peor con visión normal.
//
// Lo que NO se persiguió: que los seis tengan la misma luminosidad. Esa regla
// es para paletas de identidad (una serie por cliente, por ejemplo), donde el
// tono es lo único que distingue. Aquí la diferencia de luminosidad entre el
// rojo y el verde es precisamente lo que salva al daltónico, así que igualarla
// rompería lo que se acaba de arreglar.
export const COL = {
  realizada:  '#2e9e5b',
  aparto:     '#1a6470',
  cancelada:  '#c62828',
  reagendada: '#e9a820',
  otro:       '#8d9db6',
  sinEstado:  '#c4cedb',
}

// El modo oscuro se ELIGE, no se voltea solo: los mismos colores sobre el
// fondo #111f2e no llegan al contraste mínimo de 3:1 y el verde azulado se ve
// casi negro. Estos son pasos propios, validados contra ese fondo, y mantienen
// la misma separación entre rojo y verde (14.1 para daltonismo).
export const COL_OSCURO: typeof COL = {
  realizada:  '#8ff0b0',
  aparto:     '#3aa8c4',
  cancelada:  '#e04a44',
  reagendada: '#e9a820',
  otro:       '#93a3bb',
  sinEstado:  '#4a5a6e',
}

/** Los colores de estado del tema que esté puesto. */
export function usePaleta(): typeof COL {
  const { darkMode } = useTheme()
  return darkMode ? COL_OSCURO : COL
}

// ─── Dona ────────────────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arco(cx: number, cy: number, rOut: number, rIn: number, desde: number, hasta: number) {
  if (hasta - desde <= 0) return ''
  // Un anillo de 360° exactos no se puede dibujar con un solo arco: inicio y
  // fin caen en el mismo punto y no pinta nada. Se recorta un pelo.
  const fin = hasta - desde >= 360 ? desde + 359.99 : hasta
  const grande = fin - desde > 180 ? 1 : 0
  const a = polar(cx, cy, rOut, desde), b = polar(cx, cy, rOut, fin)
  const c = polar(cx, cy, rIn, fin),    d = polar(cx, cy, rIn, desde)
  return [
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${grande} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
    `L ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${grande} 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export function Dona({ partes, size = 150, centro, subcentro, colorTexto, onTocar }: {
  partes: { label: string; value: number; color: string }[]
  size?: number
  centro?: string
  subcentro?: string
  colorTexto: string
  /** Si se pasa, cada rebanada se puede tocar para ver qué hay dentro. */
  onTocar?: (indice: number) => void
}) {
  const cx = size / 2, cy = size / 2
  const rOut = size / 2 - 4, rIn = rOut * 0.6
  const total = partes.reduce((s, p) => s + p.value, 0)
  if (total === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9aa5ab', fontSize: 12 }}>Sin datos</Text>
      </View>
    )
  }
  let acum = 0
  return (
    <Svg width={size} height={size}>
      {partes.map((p, i) => {
        const desde = (acum / total) * 360
        acum += p.value
        const d = arco(cx, cy, rOut, rIn, desde, (acum / total) * 360)
        return d ? (
          <Path
            key={i}
            d={d}
            fill={p.color}
            // react-native-svg espera que onPress devuelva algo; por eso el
            // envoltorio en vez de pasar la función pelada.
            onPress={onTocar ? (() => { onTocar(i) }) as any : undefined}
          />
        ) : null
      })}
      {centro ? (
        <SvgText x={cx} y={subcentro ? cy - 2 : cy + 6} textAnchor="middle"
                 fill={colorTexto} fontSize={subcentro ? 21 : 17} fontWeight="bold">
          {centro}
        </SvgText>
      ) : null}
      {subcentro ? (
        <SvgText x={cx} y={cy + 17} textAnchor="middle" fill="#9aa5ab" fontSize={10.5}>
          {subcentro}
        </SvgText>
      ) : null}
    </Svg>
  )
}

// ─── Barra horizontal con desglose ───────────────────────────────────────────
// Una sola barra por asesor, partida en los colores del resultado. Así se ve
// de un golpe quién atiende más Y a quién le aparta más gente, que es lo que
// una barra sola no dice.
export function BarraAsesor({ pos, nombre, total, max, tramos, colorTexto, colorPista, nota, sufijo }: {
  pos: number
  nombre: string
  total: number
  max: number
  tramos: { valor: number; color: string }[]
  colorTexto: string
  colorPista: string
  nota?: string
  /** "%" en las gráficas de porcentaje. Sin esto un 7% se lee como 7 citas. */
  sufijo?: string
}) {
  const ancho = max > 0 ? (total / max) * 100 : 0
  return (
    <View style={s.barraFila}>
      <Text style={[s.barraPos, { color: colorTexto }]}>{pos}</Text>
      <View style={{ flex: 1 }}>
        <View style={s.barraCabeza}>
          <Text style={[s.barraNombre, { color: colorTexto }]} numberOfLines={1}>{nombre}</Text>
          <Text style={[s.barraTotal, { color: colorTexto }]}>{total}{sufijo ?? ''}</Text>
        </View>
        <View style={[s.barraPista, { backgroundColor: colorPista }]}>
          <View style={{ flexDirection: 'row', width: `${Math.max(ancho, 1.5)}%`, height: '100%', borderRadius: 5, overflow: 'hidden' }}>
            {tramos.filter(t => t.valor > 0).map((t, i) => (
              <View key={i} style={{ flex: t.valor, backgroundColor: t.color }} />
            ))}
          </View>
        </View>
        {nota ? <Text style={s.barraNota}>{nota}</Text> : null}
      </View>
    </View>
  )
}

// ─── Barras verticales por periodo ───────────────────────────────────────────
export function BarrasPeriodo({ datos, colorTexto, colorPista, onTocar }: {
  datos: { etiqueta: string; valor: number }[]
  colorTexto: string
  colorPista: string
  /** Si se pasa, cada mes se puede tocar para ver sus citas. */
  onTocar?: (indice: number) => void
}) {
  const max = Math.max(1, ...datos.map(d => d.valor))
  const Col: any = onTocar ? TouchableOpacity : View
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.barrasFila}>
        {datos.map((d, i) => (
          <Col
            key={i}
            style={s.barraCol}
            {...(onTocar ? { onPress: () => onTocar(i), activeOpacity: 0.7 } : {})}
          >
            <Text style={[s.barraColNum, { color: colorTexto }]}>{d.valor > 0 ? d.valor : ''}</Text>
            <View style={[s.barraColPista, { backgroundColor: colorPista }]}>
              <View style={{
                height: Math.max((d.valor / max) * 90, d.valor > 0 ? 4 : 0),
                backgroundColor: COL.aparto, borderRadius: 4, width: '100%',
              }} />
            </View>
            <Text style={s.barraColEtiqueta} numberOfLines={1}>{d.etiqueta}</Text>
          </Col>
        ))}
      </View>
    </ScrollView>
  )
}

export function Leyenda({ partes, total, colorTexto, onTocar }: {
  partes: { label: string; value: number; color: string }[]
  total: number
  colorTexto: string
  /** Si se pasa, cada renglón abre lo que hay dentro de esa rebanada. */
  onTocar?: (indice: number) => void
}) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      {partes.map((p, i) => {
        const fila = (
          <View style={s.leyendaFila}>
            <View style={[s.leyendaPunto, { backgroundColor: p.color }]} />
            <Text style={[s.leyendaLabel, { color: colorTexto }]} numberOfLines={1}>{p.label}</Text>
            <Text style={[s.leyendaVal, { color: colorTexto }]}>{p.value}</Text>
            <Text style={s.leyendaPct}>{total > 0 ? `${Math.round((p.value / total) * 100)}%` : '0%'}</Text>
          </View>
        )
        return onTocar
          ? <TouchableOpacity key={i} activeOpacity={0.6} onPress={() => onTocar(i)}>{fila}</TouchableOpacity>
          : <View key={i}>{fila}</View>
      })}
    </View>
  )
}

export const s = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, minWidth: 92, borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: 'center' },
  kpiNum: { fontSize: 21, fontWeight: '800' },
  kpiTxt: { fontSize: 11, color: '#9aa5ab', marginTop: 2, fontWeight: '600' },

  tarjeta: { borderRadius: 14, borderWidth: 1, padding: 15 },
  tarjetaTitulo: { fontSize: 14.5, fontWeight: '800', marginBottom: 3 },
  tarjetaSub: { fontSize: 11.5, color: '#9aa5ab', marginBottom: 13, lineHeight: 16 },
  vacio: { fontSize: 12.5, color: '#9aa5ab', paddingVertical: 10 },

  donaFila: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

  leyendaFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  leyendaPunto: { width: 9, height: 9, borderRadius: 5 },
  leyendaLabel: { flex: 1, fontSize: 12 },
  leyendaVal: { fontSize: 12, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  leyendaPct: { fontSize: 11, color: '#9aa5ab', minWidth: 34, textAlign: 'right' },

  barraFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 11 },
  barraPos: { fontSize: 11.5, fontWeight: '800', width: 18, opacity: 0.5, marginTop: 1 },
  barraCabeza: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  barraNombre: { flex: 1, fontSize: 13, fontWeight: '600' },
  barraTotal: { fontSize: 13, fontWeight: '800', marginLeft: 8 },
  barraPista: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barraNota: { fontSize: 10.5, color: '#9aa5ab', marginTop: 3 },

  verMas: { paddingVertical: 9, alignItems: 'center' },
  verMasTxt: { fontSize: 12, color: '#1a6470', fontWeight: '700' },

  barrasFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingVertical: 4 },
  barraCol: { alignItems: 'center', width: 42 },
  barraColNum: { fontSize: 10.5, fontWeight: '700', marginBottom: 3, height: 14 },
  barraColPista: { width: 22, height: 90, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barraColEtiqueta: { fontSize: 9.5, color: '#9aa5ab', marginTop: 5 },
})


// ─── Embudo ──────────────────────────────────────────────────────────────────
// Barras que se van angostando, con la caída anotada entre una y otra. La
// caída es el dato: un embudo sin ella es una lista de números en desorden.
export function Embudo({ pasos, colorTexto, colorPista, color, onTocar }: {
  pasos: { nombre: string; n: number; nota: string }[]
  colorTexto: string
  colorPista: string
  color: string
  /** Si se pasa, cada escalón se puede tocar para ver sus citas. */
  onTocar?: (indice: number) => void
}) {
  const max = Math.max(1, ...pasos.map(p => p.n))
  const Caja: any = onTocar ? TouchableOpacity : View
  return (
    <View>
      {pasos.map((p, i) => {
        const previo = i > 0 ? pasos[i - 1].n : null
        const caida = previo && previo > 0 ? 100 - (p.n / previo) * 100 : null
        return (
          <View key={p.nombre}>
            {caida !== null ? (
              <View style={sOz.embudoCaidaFila}>
                <Text style={sOz.embudoCaida}>
                  {'↓'} se cayeron {Math.round(caida)}%  ({(previo ?? 0) - p.n} citas)
                </Text>
              </View>
            ) : null}
            <Caja
              style={sOz.embudoFila}
              {...(onTocar ? { onPress: () => onTocar(i), activeOpacity: 0.7 } : {})}
            >
              <View style={{ flex: 1 }}>
                <View style={s.barraCabeza}>
                  <Text style={[sOz.embudoNombre, { color: colorTexto }]} numberOfLines={1}>{p.nombre}</Text>
                  <Text style={[sOz.embudoNum, { color: colorTexto }]}>{p.n}</Text>
                </View>
                <View style={[sOz.embudoPista, { backgroundColor: colorPista }]}>
                  <View style={{
                    width: `${Math.max((p.n / max) * 100, p.n > 0 ? 2 : 0)}%`,
                    height: '100%', backgroundColor: color, borderRadius: 6,
                  }} />
                </View>
                <Text style={s.barraNota}>{p.nota}</Text>
              </View>
            </Caja>
          </View>
        )
      })}
    </View>
  )
}

export const sOz = StyleSheet.create({
  embudoFila: { flexDirection: 'row', alignItems: 'flex-start' },
  embudoNombre: { flex: 1, fontSize: 13, fontWeight: '700' },
  embudoNum: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  embudoPista: { height: 12, borderRadius: 6, overflow: 'hidden' },
  embudoCaidaFila: { paddingLeft: 10, paddingVertical: 5 },
  embudoCaida: { fontSize: 10.5, color: '#9aa5ab', fontWeight: '700' },
})
