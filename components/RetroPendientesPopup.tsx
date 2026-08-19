// Popup para ASESORES: "tienes varias citas para dar retroalimentación".
// Lista las citas pendientes del asesor; al tocar una abre el wizard de 3
// preguntas y, al guardar, la quita de la lista.
//
// ⚠️ DORMIDO A PROPÓSITO: este componente NO está montado en ningún layout
// todavía (para no molestar a los usuarios, como se pidió). Para activarlo,
// montarlo en app/(prospectador)/_layout.tsx:  <RetroPendientesPopup enabled />
import { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'
import RetroCitaWizard, { CitaRetro } from './RetroCitaWizard'

type Pendiente = { id: string; cliente_nombre: string | null; interesado_en: string | null; dia_cita: string | null }

export default function RetroPendientesPopup({ enabled = false }: { enabled?: boolean }) {
  const c = useColors()
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [abierto, setAbierto] = useState(false)
  const [wizard, setWizard] = useState<CitaRetro | null>(null)

  async function cargar() {
    const { data } = await supabase.rpc('get_mis_citas_pendientes_retro')
    const lista = (data ?? []) as Pendiente[]
    setPendientes(lista)
    if (lista.length > 0) setAbierto(true)
  }

  useEffect(() => { if (enabled) cargar() }, [enabled])

  if (!enabled || pendientes.length === 0) return null

  return (
    <>
      <Modal visible={abierto && !wizard} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: c.card }]}>
            <Text style={s.emoji}>📝</Text>
            <Text style={[s.titulo, { color: c.text }]}>Tienes {pendientes.length} cita{pendientes.length !== 1 ? 's' : ''} por retroalimentar</Text>
            <Text style={[s.sub, { color: c.textMute }]}>Cuéntanos cómo te fue en cada una. Toca una para empezar.</Text>
            <FlatList
              style={{ maxHeight: 300, marginTop: 12 }}
              data={pendientes}
              keyExtractor={p => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.item, { borderColor: c.border }]} onPress={() => setWizard(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.itemNombre, { color: c.text }]} numberOfLines={1}>{item.cliente_nombre || 'Cliente'}</Text>
                    {item.interesado_en ? <Text style={[s.itemSub, { color: c.textMute }]} numberOfLines={1}>🏠 {item.interesado_en}</Text> : null}
                  </View>
                  <Text style={s.itemFlecha}>›</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.despues} onPress={() => setAbierto(false)}>
              <Text style={[s.despuesTxt, { color: c.textSub }]}>Más tarde</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {wizard && (
        <RetroCitaWizard
          cita={wizard}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); cargar() }}
        />
      )}
    </>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, padding: 22, maxWidth: 440, width: '100%', alignSelf: 'center' },
  emoji: { fontSize: 34, textAlign: 'center' },
  titulo: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  itemNombre: { fontSize: 15, fontWeight: '700' },
  itemSub: { fontSize: 12, marginTop: 1 },
  itemFlecha: { fontSize: 22, color: '#1a6470', fontWeight: '800' },
  despues: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  despuesTxt: { fontSize: 14, fontWeight: '600' },
})
