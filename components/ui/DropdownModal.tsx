import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native'
import { useColors } from '../../lib/ThemeContext'

type Option = { value: number | null; label: string }

type Props = {
  options: Option[]
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
}

export default function DropdownModal({ options, value, onChange, placeholder = 'Seleccionar' }: Props) {
  const [visible, setVisible] = useState(false)
  const c = useColors()
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: c.input, borderColor: c.inputBorder }]}
        onPress={() => setVisible(true)}
      >
        <Text style={[styles.triggerText, { color: c.inputText }, !selected && { color: c.placeholder }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={[styles.arrow, { color: c.textMute }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View onStartShouldSetResponder={() => true} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.option, { borderBottomColor: c.divider }]}
                  onPress={() => { onChange(opt.value); setVisible(false) }}
                >
                  <Text style={[styles.optionText, { color: c.text }, opt.value === value && styles.optionSelected]}>
                    {opt.label}
                  </Text>
                  {opt.value === value && <Text style={{ color: '#1a6470', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  triggerText: { fontSize: 15 },
  arrow: { fontSize: 14 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    width: 200,
    maxHeight: 320,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 15 },
  optionSelected: { fontWeight: '700' },
})
