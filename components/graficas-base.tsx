// Piezas de gráfica compartidas por los apartados de citas y de apartados.
// Son las mismas que usa estadisticas.tsx (dona en SVG, barras con pista), aquí
// juntas para que las dos pantallas se vean igual y un arreglo valga para las
// dos.
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'

export const COL = {
  realizada:  '#2e9e5b',
  aparto:     '#1a6470',
  cancelada:  '#d9534f',
  reagendada: '#e08e3c',
  otro:       '#8d9db6',
  sinEstado:  '#c4cedb',
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

export function Dona({ partes, size = 150, centro, subcentro, colorTexto }: {
  partes: { label: string; value: number; color: string }[]
  size?: number
  centro?: string
  subcentro?: string
  colorTexto: string
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
        return d ? <Path key={i} d={d} fill={p.color} /> : null
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
export function BarrasPeriodo({ datos, colorTexto, colorPista }: {
  datos: { etiqueta: string; valor: number }[]
  colorTexto: string
  colorPista: string
}) {
  const max = Math.max(1, ...datos.map(d => d.valor))
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.barrasFila}>
        {datos.map((d, i) => (
          <View key={i} style={s.barraCol}>
            <Text style={[s.barraColNum, { color: colorTexto }]}>{d.valor > 0 ? d.valor : ''}</Text>
            <View style={[s.barraColPista, { backgroundColor: colorPista }]}>
              <View style={{
                height: Math.max((d.valor / max) * 90, d.valor > 0 ? 4 : 0),
                backgroundColor: COL.aparto, borderRadius: 4, width: '100%',
              }} />
            </View>
            <Text style={s.barraColEtiqueta} numberOfLines={1}>{d.etiqueta}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

export function Leyenda({ partes, total, colorTexto }: {
  partes: { label: string; value: number; color: string }[]
  total: number
  colorTexto: string
}) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      {partes.map((p, i) => (
        <View key={i} style={s.leyendaFila}>
          <View style={[s.leyendaPunto, { backgroundColor: p.color }]} />
          <Text style={[s.leyendaLabel, { color: colorTexto }]} numberOfLines={1}>{p.label}</Text>
          <Text style={[s.leyendaVal, { color: colorTexto }]}>{p.value}</Text>
          <Text style={s.leyendaPct}>{total > 0 ? `${Math.round((p.value / total) * 100)}%` : '0%'}</Text>
        </View>
      ))}
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
