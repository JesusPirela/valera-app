import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native'
import { useColors } from '../lib/ThemeContext'

// Dar un lote (de citas-venta o de Vinte): o se elige un prospectador real de
// la app (le aparecerá en su propia pantalla de lotes asignados) o se escribe
// a mano el nombre de quien lo recibió fuera de la app. Una vez confirmado,
// el lote queda bloqueado — no se puede volver a dar (índice único sobre el
// hash del conjunto de ids, en la migración de cada tabla).
export default function DarLoteModal({ numero, cantidad, profiles, onClose, onConfirmar }: {
  numero: number
  cantidad: number
  profiles: { id: string; nombre: string }[]
  onClose: () => void
  onConfirmar: (asignadoA: string | null, asignadoTexto: string) => Promise<void>
}) {
  const c = useColors()
  const [modo, setModo] = useState<'usuario' | 'texto'>('usuario')
  const [prospectadorId, setProspectadorId] = useState<string | null>(null)
  const [buscaProspectador, setBuscaProspectador] = useState('')
  const [nombreTexto, setNombreTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const listaProspectadores = profiles.filter(p => !buscaProspectador.trim() || p.nombre.toLowerCase().includes(buscaProspectador.toLowerCase()))
  const puedeConfirmar = modo === 'usuario' ? !!prospectadorId : nombreTexto.trim().length > 0

  async function confirmar() {
    setEnviando(true)
    await onConfirmar(modo === 'usuario' ? prospectadorId : null, modo === 'usuario' ? '' : nombreTexto)
    setEnviando(false)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#7c3aed' }}>DAR LOTE {numero}</Text>
            <TouchableOpacity onPress={onClose} disabled={enviando}><Text style={{ fontSize: 20, color: c.textMute }}>✕</Text></TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12.5, color: c.textMute, marginBottom: 10 }}>
            {cantidad} cliente{cantidad === 1 ? '' : 's'}. Una vez dado, este lote queda bloqueado — no se puede volver a dar.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TouchableOpacity style={[s.modoBtn, { borderColor: c.border }, modo === 'usuario' && s.modoBtnOn]} onPress={() => setModo('usuario')}>
              <Text style={[s.modoTxt, { color: modo === 'usuario' ? '#fff' : c.textSub }]}>Usuario de la app</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modoBtn, { borderColor: c.border }, modo === 'texto' && s.modoBtnOn]} onPress={() => setModo('texto')}>
              <Text style={[s.modoTxt, { color: modo === 'texto' ? '#fff' : c.textSub }]}>Escribir nombre</Text>
            </TouchableOpacity>
          </View>

          {modo === 'usuario' ? (
            <>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={buscaProspectador} onChangeText={setBuscaProspectador} placeholder="Buscar…" placeholderTextColor={c.textMute} autoFocus />
              <ScrollView style={{ maxHeight: 260, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                {listaProspectadores.map(p => (
                  <TouchableOpacity key={p.id} style={[s.item, p.id === prospectadorId && { backgroundColor: 'rgba(124,58,237,0.14)' }]} onPress={() => setProspectadorId(p.id)}>
                    <Text style={[s.itemTxt, { color: c.text, fontWeight: p.id === prospectadorId ? '800' : '400' }]} numberOfLines={1}>{p.nombre}</Text>
                  </TouchableOpacity>
                ))}
                {listaProspectadores.length === 0 && <Text style={{ color: c.textMute, padding: 12, fontSize: 12.5 }}>Sin resultados.</Text>}
              </ScrollView>
              <Text style={{ fontSize: 11, color: c.textMute, marginTop: 6 }}>Le aparecerá en su propia pantalla de lotes asignados dentro de la app.</Text>
            </>
          ) : (
            <>
              <Text style={s.fieldLabel}>Nombre de quien recibió el lote</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={nombreTexto} onChangeText={setNombreTexto} placeholder="Ej. Juan Pérez (aliado externo)" placeholderTextColor={c.textMute} autoFocus />
              <Text style={{ fontSize: 11, color: c.textMute, marginTop: 6 }}>Úsalo cuando el lote se entregó fuera de la app (de palabra, WhatsApp, etc.). No le aparecerá a nadie dentro de la app.</Text>
            </>
          )}

          <TouchableOpacity
            style={[s.enviarBtn, (!puedeConfirmar || enviando) && { opacity: 0.5 }, { marginTop: 14 }]}
            disabled={!puedeConfirmar || enviando}
            onPress={confirmar}
          >
            {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.enviarTxt}>✓ Confirmar lote dado</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.cancelBtn, { borderColor: '#ccc' }]} onPress={onClose} disabled={enviando}><Text style={[s.cancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, borderRadius: 14, padding: 16 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  itemTxt: { fontSize: 13.5, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  enviarBtn: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  enviarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  cancelTxt: { fontWeight: '700', fontSize: 14 },
  modoBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  modoBtnOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  modoTxt: { fontSize: 12.5, fontWeight: '700' },
})
