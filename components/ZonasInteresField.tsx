import { useEffect, useState } from 'react'
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

  // El input de "Otra" usa estado local: si mandáramos cada tecla por
  // joinZonasGuardadas (que hace trim), el espacio final se recortaría en el
  // acto y sería imposible teclear espacios ("El Mirador Norte"). Local mientras
  // se escribe; el valor guardado se normaliza en cada cambio, ya sin trailing.
  const [otraLocal, setOtraLocal] = useState(otra)
  useEffect(() => {
    // Sincronizar solo cuando el valor externo (guardado) difiere de lo tecleado
    // ignorando espacios de borde — evita pisar lo que el usuario está escribiendo.
    if (otra !== otraLocal.trim()) setOtraLocal(otra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otra])

  const toggle = (z: string) => {
    const next = zonas.includes(z) ? zonas.filter(x => x !== z) : [...zonas, z]
    onChange(joinZonasGuardadas(next, otraLocal))
  }
  const setOtra = (t: string) => {
    setOtraLocal(t)
    onChange(joinZonasGuardadas(zonas, t))
  }

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
        value={otraLocal}
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
