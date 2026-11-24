// La fila de un directorio de contactos (colaboradores, asesores externos).
//
// Vive aquí y no en cada pantalla porque son DOS listas de lo mismo —gente de
// fuera con la que trabajamos— y cuando cada una tenía su propio diseño se
// veían como dos apps distintas: una con emoji y tarjetas de tres pisos, la
// otra con iconos y cuatro renglones. Ahora las dos arman la misma fila y lo
// único que cambia es qué va en cada hueco.
//
// La fila es de DOS renglones a propósito:
//   renglón 1: a quién estoy viendo (nombre + su etiqueta)
//   renglón 2: lo que necesito saber para decidir (zona, teléfono, estado)
// Todo lo demás —editar, borrar, los campos largos— vive en la hoja de edición
// que se abre al tocar la fila. Antes editar y borrar eran dos botones pegados
// de 16px: el de borrar quedaba a cuatro milímetros del de editar.
import type { ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors } from '../lib/ThemeContext'
import { legibleSobre, mezclar } from '../lib/color'

export type AccionFila = {
  icono: keyof typeof Ionicons.glyphMap
  color: string
  /** Fondo del botón. Si no se da, se tiñe con el propio color. */
  fondo?: string
  onPress: () => void
  /** Para lectores de pantalla y para el title del navegador. */
  etiqueta: string
}

export type PastillaFila = {
  texto: string
  color: string
  /**
   * Pintada con el color de fondo, no teñida.
   *
   * Sirve para una escala: dos pastillas del MISMO tono, una sólida y una
   * suave, se leen como "mucho" y "algo". Con dos colores distintos se leerían
   * como dos categorías que no tienen nada que ver.
   */
  solida?: boolean
  icono?: keyof typeof Ionicons.glyphMap
}

type Props = {
  /** Barra de color del borde izquierdo: el estado de un vistazo. */
  acento: string
  /** Una o dos letras. */
  inicial: string
  titulo: string
  /** Etiquetas a la derecha del nombre. Los null/false se ignoran. */
  pastillas?: (PastillaFila | null | false | undefined)[]
  /** El segundo renglón. Lo arma la pantalla porque cada lista dice otra cosa. */
  meta?: ReactNode
  acciones?: (AccionFila | null | false | undefined)[]
  /** Tocar la fila abre la edición. */
  onPress?: () => void
}

export default function FilaDirectorio({
  acento, inicial, titulo, pastillas, meta, acciones, onPress,
}: Props) {
  const c = useColors()
  // El color que llega es el de la marca del estado, elegido para verse bien en
  // claro. Sobre la tarjeta oscura varios quedaban por debajo del mínimo
  // legible, así que se ajusta el brillo conservando el tono: 4.5:1 para texto
  // y 3:1 para los iconos, que es lo que piden las reglas de contraste.
  //
  // Y se mide contra el FONDO QUE DE VERDAD TIENE DETRÁS: el avatar y las
  // pastillas llevan su propio fondo teñido con su mismo color, así que medir
  // contra la tarjeta daba números de más. Medido: la inicial verde salía a
  // 4.02 y la pastilla "Importante" a 4.09 creyendo las dos que iban en 4.5.
  const tinta = (col: string, fondo: string) => legibleSobre(col, fondo, 4.5)
  const tintaIcono = (col: string, fondo: string) => legibleSobre(col, fondo, 3)
  const fondoAvatar = mezclar(acento, c.card, 0.18)

  const pills = (pastillas ?? []).filter(Boolean) as PastillaFila[]
  const btns = (acciones ?? []).filter(Boolean) as AccionFila[]

  return (
    <TouchableOpacity
      style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Editar ${titulo}` : titulo}
    >
      <View style={[s.acento, { backgroundColor: acento }]} />
      <View style={[s.avatar, { backgroundColor: fondoAvatar }]}>
        <Text style={[s.inicial, { color: tinta(acento, fondoAvatar) }]}>{inicial}</Text>
      </View>

      <View style={s.centro}>
        <View style={s.tituloRow}>
          <Text style={[s.titulo, { color: c.text }]} numberOfLines={1}>{titulo}</Text>
          {pills.map(p => {
            const fondo = p.solida ? p.color : mezclar(p.color, c.card, 0.14)
            const tintaPill = p.solida ? legibleSobre('#ffffff', fondo, 4.5) : tinta(p.color, fondo)
            return (
              <View key={p.texto} style={[s.pastilla, { backgroundColor: fondo }]}>
                {p.icono && <Ionicons name={p.icono} size={9.5} color={tintaPill} />}
                <Text style={[s.pastillaTxt, { color: tintaPill }]} numberOfLines={1}>{p.texto}</Text>
              </View>
            )
          })}
        </View>
        {meta}
      </View>

      {btns.length > 0 && (
        <View style={s.acciones}>
          {btns.map(a => {
            const fondo = a.fondo ?? mezclar(a.color, c.card, 0.14)
            return (
              <TouchableOpacity
                key={a.etiqueta}
                // La fila entera también es un botón (abre la edición). En el
                // teléfono gana el de dentro, pero en web los dos se disparan y
                // tocar WhatsApp abría además la hoja de edición detrás.
                onPress={(e: any) => { e?.stopPropagation?.(); a.onPress() }}
                style={[s.accion, { backgroundColor: fondo }]}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={a.etiqueta}
              >
                <Ionicons name={a.icono} size={16} color={tintaIcono(a.color, fondo)} />
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </TouchableOpacity>
  )
}

/** El segundo renglón, con sus puntos separadores. Los vacíos no dejan hueco. */
export function MetaFila({ partes }: { partes: (ReactNode | null | false | undefined)[] }) {
  const c = useColors()
  const vivas = partes.filter(p => p !== null && p !== false && p !== undefined && p !== '')
  if (vivas.length === 0) return null
  return (
    <View style={s.metaRow}>
      {vivas.map((p, i) => (
        <View key={i} style={s.metaItem}>
          {i > 0 && <Text style={[s.metaSep, { color: c.textSub }]}>·</Text>}
          {typeof p === 'string'
            ? <Text style={[s.metaTxt, { color: c.textSub, flexShrink: 1 }]} numberOfLines={1}>{p}</Text>
            : p}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
    paddingRight: 10, paddingVertical: 9, marginBottom: 8,
  },
  acento: { width: 4, alignSelf: 'stretch', marginRight: 2 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  inicial: { fontSize: 13, fontWeight: '800' },
  centro: { flex: 1, minWidth: 0, gap: 2 },
  tituloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  pastilla: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5, maxWidth: 118,
  },
  pastillaTxt: { fontSize: 10, fontWeight: '800' },
  // El segundo renglón se queda DENTRO de su columna. Sin el minWidth:0 y el
  // overflow, un texto largo —el campo de zona tiene recados de hasta 131
  // caracteres— empujaba la fila y se metía por debajo de los botones de
  // WhatsApp, que es como se veía en la captura.
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', overflow: 'hidden' },
  metaItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  metaSep: { fontSize: 12, marginHorizontal: 5, opacity: 0.6 },
  metaTxt: { fontSize: 12, fontWeight: '600' },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accion: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
})
