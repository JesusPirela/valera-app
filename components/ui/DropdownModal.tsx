import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native'

type Option = { value: number | null; label: string }

type Props = {
  options: Option[]
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
}

export default function DropdownModal({ options, value, onChange, placeholder = 'Seleccionar' }: Props) {
  const [visible, setVisible] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)}>
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.arrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View onStartShouldSetResponder={() => true} style={styles.card}>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={styles.option}
                  onPress={() => { onChange(opt.value); setVisible(false) }}
                >
                  <Text style={[styles.optionText, opt.value === value && styles.optionSelected]}>
                    {opt.label}
                  </Text>
                  {opt.value === value && <Text style={styles.check}>✓</Text>}
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
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  triggerText: { fontSize: 15, color: '#1a6470' },
  placeholder: { color: '#aaa' },
  arrow: { fontSize: 14, color: '#888' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
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
  },
  optionText: { fontSize: 15, color: '#1a6470' },
  optionSelected: { fontWeight: '700' },
  check: { color: '#1a6470', fontSize: 14, fontWeight: '700' },
})
