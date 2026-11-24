// La hoja para elegir cómo se ordena una lista.
//
// Vive aquí porque los dos directorios (colaboradores, asesores externos)
// necesitan lo mismo, y porque el orden NO cabía en un chip: cuando eran dos
// opciones el chip se podía ir alternando a toques, pero con cuatro o cinco un
// chip que cambia de texto cada vez que lo tocas obliga a dar la vuelta
// completa para volver al que querías, y nunca enseña qué otras formas hay.
//
// Cada opción trae una línea de para-qué-sirve: "Nombre (A–Z)" se entiende
// solo, pero "Los más olvidados" no, y es justo el orden que más sirve.
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors } from '../lib/ThemeContext'
import { legibleSobre } from '../lib/color'

export type OpcionOrden<T extends string> = {
  valor: T
  etiqueta: string
  /** Para qué sirve este orden, en palabras de quien usa la lista. */
  desc: string
  icono: keyof typeof Ionicons.glyphMap
}

type Props<T extends string> = {
  visible: boolean
  titulo?: string
  opciones: OpcionOrden<T>[]
  valor: T
  onElegir: (v: T) => void
  onCerrar: () => void
  /** El color de la marca de la pantalla (teal en los directorios). */
  acento?: string
}

export default function HojaOrden<T extends string>({
  visible, titulo = 'Ordenar la lista por', opciones, valor, onElegir, onCerrar, acento = '#1a6470',
}: Props<T>) {
  const c = useColors()
  // El acento está elegido para fondo claro; sobre la tarjeta oscura queda por
  // debajo del mínimo legible, así que se le ajusta el brillo conservando el
  // tono (4.5:1 para el texto, 3:1 para el icono).
  const tinta = legibleSobre(acento, c.card, 4.5)
  const tintaIcono = legibleSobre(acento, c.card, 3)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onCerrar}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[s.hoja, { backgroundColor: c.card }]}>
            <View style={s.handle} />
            <Text style={[s.titulo, { color: c.text }]}>{titulo}</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 7, paddingTop: 4 }}>
              {opciones.map(op => {
                const on = op.valor === valor
                return (
                  <TouchableOpacity
                    key={op.valor}
                    style={[s.opcion, {
                      borderColor: on ? tinta : c.inputBorder,
                      backgroundColor: on ? acento + '14' : c.input,
                    }]}
                    onPress={() => { onElegir(op.valor); onCerrar() }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons name={op.icono} size={18} color={on ? tintaIcono : c.textSub} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.opTit, { color: on ? tinta : c.text }]}>{op.etiqueta}</Text>
                      <Text style={[s.opSub, { color: c.textSub }]}>{op.desc}</Text>
                    </View>
                    {on && <Ionicons name="checkmark" size={18} color={tintaIcono} />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <TouchableOpacity style={s.cerrar} onPress={onCerrar}>
              <Text style={[s.cerrarTxt, { color: c.textSub }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  hoja: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11,
  },
  opTit: { fontSize: 14.5, fontWeight: '800' },
  opSub: { fontSize: 11.5, marginTop: 1 },
  cerrar: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  cerrarTxt: { fontSize: 14, fontWeight: '700' },
})
