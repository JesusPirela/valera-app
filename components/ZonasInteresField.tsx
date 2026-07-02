import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { useColors, useTheme } from '../lib/ThemeContext'
import { ZONAS_INTERES, parseZonasGuardadas, joinZonasGuardadas } from '../lib/zonas-interes'

// Selector de zonas de interés: chips multi-selección del catálogo canónico
// (Querétaro) + un campo "Otra" para una zona libre que no esté en la lista.
// Controlado por un único string (el valor de `clientes.zona_busqueda`).
export function ZonasInteresField({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (next: string) => void
}) {
  const c = useColors()
  const { primaryColor } = useTheme()
  const { zonas, otra } = parseZonasGuardadas(value)

  const toggle = (z: string) => {
    const next = zonas.includes(z) ? zonas.filter(x => x !== z) : [...zonas, z]
    onChange(joinZonasGuardadas(next, otra))
  }
  const setOtra = (t: string) => onChange(joinZonasGuardadas(zonas, t))

  return (
    <View>
      <View style={styles.wrap}>
        {ZONAS_INTERES.map(z => {
          const activo = zonas.includes(z)
          return (
            <TouchableOpacity
              key={z}
              onPress={() => toggle(z)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.card },
                activo && { backgroundColor: primaryColor, borderColor: primaryColor },
              ]}
            >
              <Text style={[styles.chipTxt, { color: activo ? '#fff' : c.textSub }]}>{z}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <TextInput
        style={[styles.otra, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={otra}
        onChangeText={setOtra}
        placeholder="Otra zona (opcional)"
        placeholderTextColor={c.placeholder}
        autoCapitalize="words"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  chipTxt: { fontSize: 13, fontWeight: '600' },
  otra: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
})
