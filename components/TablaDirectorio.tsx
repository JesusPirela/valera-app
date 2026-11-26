// La vista de TABLA de un directorio (colaboradores, asesores externos).
//
// Es la hermana de FilaDirectorio: las mismas filas, pero en renglones y
// columnas para cuando lo que quieres es COMPARAR —¿a quién le falta
// catálogo?, ¿quién lleva más sin actualizar?— y no mirar a uno.
//
// La geometría es la de la tabla del CRM de clientes, que es la que ya está
// probada en la app. Dos cosas de ahí que NO se pueden tocar:
//
//  1. ANCHO EXACTO, no mínimo. Con `minWidth` cada celda crece con su
//     contenido y cada renglón acaba poniendo sus columnas en un sitio
//     distinto: ningún dato queda debajo de su título. `numberOfLines` solo
//     recorta lo que se PINTA, no impide que la celda se ensanche.
//  2. En celular la tabla son DOS tablas pegadas (la primera columna fija y el
//     resto en un carrusel), y cada mitad se mide por su cuenta. Si la altura
//     del renglón dependiera del contenido, las dos mitades se despegarían y
//     el nombre dejaría de corresponder con su fila, peor conforme bajas. Por
//     eso la altura es EXACTA e idéntica en las dos mitades.
import { type ReactNode } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors } from '../lib/ThemeContext'
import { legibleSobre, luminancia, mezclar } from '../lib/color'

/**
 * El tinte del renglón.
 *
 * Mucho más bajo que el de las tarjetas (22%/30%), y a propósito: una tarjeta
 * teñida es un rectángulo de 50px con aire alrededor, un renglón de tabla es
 * una banda de borde a borde pegada a la siguiente. Con el 22% de las
 * tarjetas, diez renglones seguidos se leen como un bloque de color y las
 * letras se pierden.
 *
 * Igual que allá, el acento se ACLARA antes de mezclarlo: mezclar un morado
 * oscuro contra un fondo oscuro da otro oscuro y el color no aparece.
 */
const TINTE_CLARO = 0.11
const TINTE_OSCURO = 0.17

/** El fondo que de verdad tiene el renglón detrás. */
export function fondoRenglon(acento: string | null | undefined, card: string) {
  if (!acento) return card
  const visible = legibleSobre(acento, card, 3)
  return mezclar(visible, card, luminancia(card) < 0.18 ? TINTE_OSCURO : TINTE_CLARO)
}

export type ColTabla = {
  id: string
  label: string
  /** Ancho EXACTO en celular, en px. La primera columna es la que se queda fija. */
  ancho: number
  /** Peso de la columna en pantalla ancha. */
  flex: number
  /** La cabecera se puede tocar para ordenar por esta columna. */
  ordenable?: boolean
  /** Centra el contenido: para columnas de un solo icono. */
  centrada?: boolean
}

export type CtxCelda = {
  /** El fondo real del renglón. Los textos de color se miden contra ESTE. */
  fondo: string
  /** Ajusta un color para que se lea como texto sobre este renglón (4.5:1). */
  tinta: (color: string) => string
  /** Lo mismo para iconos y formas, que piden 3:1 y no 4.5:1. */
  tintaIcono: (color: string) => string
  /** El gris de los textos secundarios, ya ajustado a este renglón. */
  sub: string
  /** Para el "—" de una celda vacía: visible pero sin pesar. */
  vacio: string
  /** En pantalla ancha hay sitio para dos renglones de texto; en celular, uno. */
  amplio: boolean
}

export type FilaTabla = {
  clave: string
  /** El color de su estado. Tiñe el renglón igual que en la vista de tarjetas. */
  acento?: string | null
  /** Tocar el renglón (fuera de un botón) abre la edición. */
  onPress?: () => void
  /** Para lectores de pantalla. */
  etiqueta?: string
  celda: (colId: string, ctx: CtxCelda) => ReactNode
}

/** Un separador de apartado, del ancho de la tabla. */
export type SeccionTabla = {
  clave: string
  titulo: string
  /** El color del título. Si no se da, va en gris. */
  color?: string
}

export type RenglonTabla =
  | ({ tipo: 'seccion' } & SeccionTabla)
  | ({ tipo: 'fila' } & FilaTabla)

type Props = {
  columnas: ColTabla[]
  renglones: RenglonTabla[]
  /** Qué columna está ordenando ahora y hacia dónde, para pintar la flecha. */
  orden?: { col: string; dir: 'asc' | 'desc' } | null
  onOrdenar?: (colId: string) => void
  /** El color de la cabecera. El de la marca de la pantalla. */
  acentoCabeza?: string
  /** Va arriba de la tabla y se desplaza con ella (buscador, avisos…). */
  encabezado?: ReactNode
  /** Qué se pinta al final, dentro del scroll. */
  pie?: ReactNode
  refreshControl?: any
}

/** Dos renglones de nota (17 de interlínea) más el respiro de arriba y abajo. */
const ALTO_FILA = 48
const ALTO_CABEZA = 42
const ALTO_SECCION = 30

export default function TablaDirectorio({
  columnas, renglones, orden, onOrdenar, acentoCabeza = '#1a3547', encabezado, pie, refreshControl,
}: Props) {
  const c = useColors()
  const { width } = useWindowDimensions()
  // 900 y no 820: esta tabla trae diez columnas, dos más que la del CRM.
  // Por debajo de eso caben pero quedan de 70px, que no alcanzan para una
  // pastilla de estado ni para una fecha.
  const amplio = Platform.OS === 'web' && width >= 900

  const estiloCol = (col: ColTabla) =>
    amplio
      ? { flex: col.flex }
      : { width: col.ancho, flexGrow: 0, flexShrink: 0, overflow: 'hidden' as const }

  function cabeceras(cols: ColTabla[]) {
    return cols.map(col => {
      const activa = orden?.col === col.id
      return (
        <View key={col.id} style={[s.th, estiloCol(col), col.centrada && { justifyContent: 'center' }]}>
          <TouchableOpacity
            style={[s.thToque, col.centrada && { justifyContent: 'center' }]}
            onPress={col.ordenable && onOrdenar ? () => onOrdenar(col.id) : undefined}
            disabled={!col.ordenable || !onOrdenar}
            accessibilityRole={col.ordenable ? 'button' : undefined}
            accessibilityLabel={col.ordenable ? `Ordenar por ${col.label}` : undefined}
          >
            <Text style={s.thTxt} numberOfLines={1}>{col.label}</Text>
            {col.ordenable && (
              <Ionicons
                name={!activa ? 'swap-vertical-outline' : orden!.dir === 'asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
                size={11}
                color={activa ? '#fbbf24' : 'rgba(255,255,255,0.45)'}
              />
            )}
          </TouchableOpacity>
        </View>
      )
    })
  }

  function renderRenglon(r: RenglonTabla, cols: ColTabla[], primeraMitad: boolean, ultimo = false) {
    if (r.tipo === 'seccion') {
      // El separador se pinta en LAS DOS mitades con la misma altura exacta:
      // si solo se pintara en una, las filas de abajo se despegarían.
      return (
        <View
          key={r.clave}
          style={[s.seccion, { height: ALTO_SECCION, backgroundColor: mezclar(c.textSub, c.card, 0.07), borderBottomColor: c.border }]}
        >
          {primeraMitad && (
            <Text style={[s.seccionTxt, { color: r.color ? legibleSobre(r.color, mezclar(c.textSub, c.card, 0.07), 4.5) : c.textSub }]} numberOfLines={1}>
              {r.titulo}
            </Text>
          )}
        </View>
      )
    }

    const fondo = fondoRenglon(r.acento, c.card)
    const ctx: CtxCelda = {
      fondo,
      tinta: (col: string) => legibleSobre(col, fondo, 4.5),
      tintaIcono: (col: string) => legibleSobre(col, fondo, 3),
      sub: legibleSobre(c.textSub, fondo, 4.5),
      // El "—" de una celda vacía se MEZCLA hacia el fondo, no se pasa por
      // legibleSobre: esa función solo sube el contraste cuando falta y nunca
      // lo baja, así que el gris de siempre ya cumplía y el "—" salía
      // exactamente igual de fuerte que un dato de verdad. Medido, al 55% da
      // 2.38–2.48:1 en los dos temas y con los cinco colores de renglón: se
      // ve que la celda está vacía sin competir con lo que sí tiene dato.
      vacio: mezclar(c.textSub, fondo, 0.55),
      amplio,
    }
    const acentoVisible = r.acento ? legibleSobre(r.acento, c.card, 3) : null

    return (
      <TouchableOpacity
        key={r.clave}
        style={[
          s.tr,
          { backgroundColor: fondo, borderBottomColor: c.border },
          !amplio && { height: ALTO_FILA },
          // En web el marco NO recorta (lo necesita la cabecera fija), así que
          // es el último renglón el que redondea las esquinas de abajo.
          ultimo && { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderBottomWidth: 0 },
        ]}
        onPress={r.onPress}
        disabled={!r.onPress}
        activeOpacity={0.7}
        accessibilityRole={r.onPress ? 'button' : undefined}
        accessibilityLabel={r.onPress ? r.etiqueta : undefined}
      >
        {/* La franja de color solo va en la primera mitad: en la otra sería
            una raya en medio de la tabla. */}
        {primeraMitad && acentoVisible && <View style={[s.franja, { backgroundColor: acentoVisible }]} />}
        {cols.map(col => (
          <View
            key={col.id}
            style={[s.td, estiloCol(col), col.centrada && { alignItems: 'center', justifyContent: 'center' }]}
          >
            {r.celda(col.id, ctx)}
          </View>
        ))}
      </TouchableOpacity>
    )
  }

  if (amplio) {
    // LA CABECERA SE QUEDA ARRIBA.
    //
    // Con 73 renglones, en cuanto bajas un poco los títulos de las columnas se
    // van y te quedas mirando pastillas sin saber cuál es cuál. `sticky` la
    // ancla al borde de arriba mientras la tabla esté en pantalla.
    //
    // Para que funcione, el marco NO puede recortar: un ancestro con
    // `overflow: hidden` se vuelve el contenedor de referencia y la cabecera
    // se queda pegada a una caja que no se desplaza, o sea, a nada. Por eso
    // las esquinas redondeadas las ponen la cabecera (arriba) y el último
    // renglón (abajo) en vez del marco.
    //
    // Es solo de web: esta rama no corre en el teléfono.
    const pegajosa = { position: 'sticky', top: 0, zIndex: 3 } as any
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }} refreshControl={refreshControl}>
        {encabezado}
        <View style={[s.marco, { backgroundColor: c.card, borderColor: c.border, overflow: 'visible' }]}>
          <View style={[
            s.trHead,
            { backgroundColor: acentoCabeza, minHeight: ALTO_CABEZA, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
            pegajosa,
          ]}>
            {cabeceras(columnas)}
          </View>
          {renglones.map((r, i) => renderRenglon(r, columnas, true, i === renglones.length - 1))}
        </View>
        {pie}
      </ScrollView>
    )
  }

  // En celular la primera columna se queda fija: si no, al desplazarte para
  // ver las notas pierdes de vista de quién es cada renglón.
  const fija = columnas[0]
  const mueven = columnas.slice(1)
  const anchoScroll = mueven.reduce((n, col) => n + col.ancho, 0)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 80 }} refreshControl={refreshControl}>
      {encabezado}
      <View style={[s.marco, { backgroundColor: c.card, borderColor: c.border, flexDirection: 'row' }]}>
        <View style={[s.colFija, { width: fija.ancho, borderRightColor: c.border }]}>
          <View style={[s.trHead, { backgroundColor: acentoCabeza, height: ALTO_CABEZA }]}>{cabeceras([fija])}</View>
          {renglones.map(r => renderRenglon(r, [fija], true))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: anchoScroll }}>
            <View style={[s.trHead, { backgroundColor: acentoCabeza, height: ALTO_CABEZA }]}>{cabeceras(mueven)}</View>
            {renglones.map(r => renderRenglon(r, mueven, false))}
          </View>
        </ScrollView>
      </View>
      {pie}
    </ScrollView>
  )
}

/** Una celda de texto, con su recorte y su color ya puestos. */
export function CeldaTexto({
  children, ctx, color, negrita = false, lineas,
}: {
  children: string | null | undefined
  ctx: CtxCelda
  color?: string
  negrita?: boolean
  lineas?: number
}) {
  if (!children) return <Text style={[s.tdTxt, { color: ctx.vacio }]}>—</Text>
  return (
    <Text
      style={[s.tdTxt, negrita && s.tdFuerte, { color: color ?? ctx.sub }]}
      numberOfLines={lineas ?? (ctx.amplio ? 2 : 1)}
    >
      {children}
    </Text>
  )
}

/** Una pastilla de estado dentro de una celda. */
export function CeldaPastilla({
  texto, color, ctx, icono, solida = false,
}: {
  texto: string
  color: string
  ctx: CtxCelda
  icono?: keyof typeof Ionicons.glyphMap
  solida?: boolean
}) {
  const fondo = solida ? color : mezclar(color, ctx.fondo, 0.16)
  const tinta = solida ? legibleSobre('#ffffff', fondo, 4.5) : legibleSobre(color, fondo, 4.5)
  return (
    <View style={[s.pastilla, { backgroundColor: fondo }]}>
      {icono && <Ionicons name={icono} size={9.5} color={tinta} />}
      <Text style={[s.pastillaTxt, { color: tinta }]} numberOfLines={1}>{texto}</Text>
    </View>
  )
}

/** Un botón de icono dentro de una celda (WhatsApp, catálogo, editar…). */
export function CeldaBoton({
  icono, color, ctx, onPress, etiqueta,
}: {
  icono: keyof typeof Ionicons.glyphMap
  color: string
  ctx: CtxCelda
  onPress: () => void
  etiqueta: string
}) {
  const fondo = mezclar(color, ctx.fondo, 0.14)
  return (
    <TouchableOpacity
      // El renglón entero también es un botón (abre la edición). En el teléfono
      // gana el de dentro, pero en web los dos se disparan.
      onPress={(e: any) => { e?.stopPropagation?.(); onPress() }}
      style={[s.btnCelda, { backgroundColor: fondo }]}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
    >
      <Ionicons name={icono} size={15} color={legibleSobre(color, fondo, 3)} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  marco: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  colFija: { borderRightWidth: 2, zIndex: 2 },
  trHead: { flexDirection: 'row', alignItems: 'stretch' },
  th: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 8,
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)',
  },
  thToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  thTxt: { color: '#fff', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  tr: { flexDirection: 'row', minHeight: 44, alignItems: 'stretch', borderBottomWidth: 1 },
  franja: { width: 3, alignSelf: 'stretch' },
  td: { paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'center', alignItems: 'flex-start', minWidth: 0 },
  tdTxt: { fontSize: 12.5, fontWeight: '600' },
  tdFuerte: { fontSize: 13, fontWeight: '800' },
  seccion: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderBottomWidth: 1 },
  seccionTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  pastilla: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%',
  },
  pastillaTxt: { fontSize: 10.5, fontWeight: '800' },
  btnCelda: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})

/**
 * El interruptor entre las dos vistas. Va en las dos pantallas de directorio
 * para que el gesto sea el mismo en las dos.
 *
 * Son dos botones y no uno que alterna: con uno solo, el icono tiene que
 * decir "a dónde vas" y se lee como "dónde estás", que es justo al revés. Con
 * dos, el que está prendido ES dónde estás.
 */
export function SelectorVista({
  vista, onCambiar, acento,
}: {
  vista: 'lista' | 'tabla'
  onCambiar: (v: 'lista' | 'tabla') => void
  acento: string
}) {
  const c = useColors()
  const opciones = [
    { v: 'lista' as const, icono: 'list-outline' as const, etiqueta: 'Ver como lista' },
    { v: 'tabla' as const, icono: 'grid-outline' as const, etiqueta: 'Ver como tabla' },
  ]
  return (
    <View style={[sv.caja, { borderColor: c.border, backgroundColor: c.card }]}>
      {opciones.map(o => {
        const on = vista === o.v
        return (
          <TouchableOpacity
            key={o.v}
            onPress={() => onCambiar(o.v)}
            style={[sv.btn, on && { backgroundColor: acento }]}
            accessibilityRole="button"
            accessibilityLabel={o.etiqueta}
            accessibilityState={{ selected: on }}
          >
            <Ionicons name={o.icono} size={15} color={on ? legibleSobre('#ffffff', acento, 3) : c.textSub} />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const sv = StyleSheet.create({
  caja: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden' },
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
