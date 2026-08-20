// Pantalla SIMPLE para el asesor: sus citas que faltan de retroalimentación.
// Cada tarjeta abre el wizard de 3 preguntas. Pensada para que sea obvia.
import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import RetroCitaWizard, { CitaRetro } from '../../components/RetroCitaWizard'

type Pend = {
  id: string; cliente_nombre: string | null; telefono: string | null; detalles_pago: string | null
  interesado_en: string | null; dia_cita: string | null; prospecto: string | null; coordino: string | null; atendio: string | null
}

export default function MisRetros() {
  const c = useColors()
  const [lista, setLista] = useState<Pend[]>([])
  const [loading, setLoading] = useState(true)
  const [wizard, setWizard] = useState<CitaRetro | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('get_mis_citas_pendientes_retro')
    setLista((data ?? []) as Pend[]); setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <Text style={[st.titulo, { color: c.text }]}>📝 Cuéntanos cómo te fue</Text>
      <Text style={[st.sub, { color: c.textMute }]}>
        {loading ? ' ' : lista.length === 0
          ? '¡Estás al día! No tienes citas por responder. 🎉'
          : `Tienes ${lista.length} cita${lista.length !== 1 ? 's' : ''} por responder. Toca una y contesta 3 preguntas rápidas.`}
      </Text>

      {loading ? <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} /> : (
        <ScrollView style={{ flex: 1, marginTop: 14 }} showsVerticalScrollIndicator={false}>
          {lista.map(p => (
            <TouchableOpacity key={p.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]} activeOpacity={0.85} onPress={() => setWizard(p)}>
              <View style={{ flex: 1 }}>
                <Text style={[st.cliente, { color: c.text }]} numberOfLines={1}>{p.cliente_nombre || 'Cliente'}</Text>
                {p.interesado_en ? <Text style={[st.linea, { color: c.textSub }]} numberOfLines={2}>🏠 {p.interesado_en}</Text> : null}
                {p.dia_cita ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>📅 {p.dia_cita}</Text> : null}
                {p.telefono ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>📞 {p.telefono}</Text> : null}
                {p.detalles_pago ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>💳 {p.detalles_pago}</Text> : null}
                {p.prospecto ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>🌱 Prospectó: {p.prospecto}</Text> : null}
                {p.coordino ? <Text style={[st.linea, { color: c.textMute }]} numberOfLines={1}>🧭 Coordinó: {p.coordino}</Text> : null}
              </View>
              <View style={st.responder}><Text style={st.responderTxt}>Responder ›</Text></View>
            </TouchableOpacity>
          ))}
          {lista.length === 0 && (
            <View style={st.vacio}>
              <Text style={{ fontSize: 52 }}>🎉</Text>
              <Text style={[st.vacioTxt, { color: c.textMute }]}>Sin pendientes. ¡Buen trabajo!</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {wizard && <RetroCitaWizard cita={wizard} onClose={() => setWizard(null)} onSaved={cargar} />}
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  titulo: { fontSize: 24, fontWeight: '900' },
  sub: { fontSize: 14.5, lineHeight: 20, marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  cliente: { fontSize: 18, fontWeight: '800' },
  linea: { fontSize: 13, marginTop: 3 },
  responder: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  responderTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  vacio: { alignItems: 'center', marginTop: 50, gap: 10 },
  vacioTxt: { fontSize: 15 },
})
