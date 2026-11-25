import { useCallback, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type ClienteLote = {
  id: string; cliente_nombre: string | null; telefono: string | null
  zona_interesada: string | null; detalles_pago: string | null; fecha_cita: string | null
}
type Lote = {
  id: string; numero: number; tamano: number; dado_at: string
  trabajado: boolean; trabajado_at: string | null; clientes: ClienteLote[] | null
}

function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso)
  if (isNaN(t.getTime())) return ''
  return t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MisLotes() {
  const c = useColors()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('mis_lotes_citas')
      setLotes((data ?? []) as Lote[])
    } catch { /* sin red */ } finally { setLoading(false) }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function copiarWhatsApp(lote: Lote) {
    const texto = `*Lote ${lote.numero} · ${lote.clientes?.length ?? 0} clientes*\n\n` + (lote.clientes ?? []).map((f, i) => {
      const partes = [f.cliente_nombre?.trim() || 'Sin nombre']
      if (f.telefono) partes.push(f.telefono)
      if (f.zona_interesada) partes.push(f.zona_interesada)
      if (f.detalles_pago) partes.push(f.detalles_pago)
      return `${i + 1}. ${partes.join(' · ')}${f.fecha_cita ? `\n   📅 ${fmtFecha(f.fecha_cita)}` : ''}`
    }).join('\n')
    try { await Clipboard.setStringAsync(texto) } catch { /* sin portapapeles */ }
    if (Platform.OS === 'web') window.alert('✓ Lote copiado (listo para pegar en WhatsApp)')
    else Alert.alert('✓ Copiado', 'Lote copiado, listo para pegar en WhatsApp.')
  }

  async function marcarTrabajado(lote: Lote) {
    setMarcando(lote.id)
    const { error } = await supabase.rpc('marcar_lote_trabajado', { p_id: lote.id })
    setMarcando(null)
    if (error) {
      const msg = error.message || 'No se pudo marcar el lote.'
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg)
      return
    }
    setLotes(prev => prev.map(l => l.id === lote.id ? { ...l, trabajado: true, trabajado_at: new Date().toISOString() } : l))
  }

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[st.h1, { color: c.text }]}>Mis lotes</Text>
        <Text style={[st.sub, { color: c.textSub }]}>
          Clientes viejos que te asignaron para re-contactar, agrupados en lotes. Márcalo como trabajado cuando termines de contactarlos a todos.
        </Text>

        {loading ? (
          <ActivityIndicator color={c.text} style={{ marginTop: 40 }} />
        ) : lotes.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>Aún no te han asignado ningún lote.</Text>
        ) : lotes.map(lote => (
          <View key={lote.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[st.cardTitulo, { color: c.text }]}>Lote {lote.numero}</Text>
              {lote.trabajado && (
                <View style={st.badgeTrabajado}><Text style={st.badgeTrabajadoTxt}>✓ Trabajado</Text></View>
              )}
            </View>
            <Text style={[st.cardSub, { color: c.textSub }]}>
              {lote.clientes?.length ?? 0} cliente{(lote.clientes?.length ?? 0) === 1 ? '' : 's'} · recibido el {fmtFecha(lote.dado_at)}
            </Text>

            {(lote.clientes ?? []).map((f, i) => (
              <View key={f.id} style={[st.clienteRow, { borderColor: c.border }]}>
                <Text style={[st.clienteNombre, { color: c.text }]} numberOfLines={1}>{i + 1}. {f.cliente_nombre?.trim() || 'Sin nombre'}</Text>
                <Text style={[st.clienteDetalle, { color: c.textSub }]} numberOfLines={1}>
                  {[f.telefono, f.zona_interesada, f.detalles_pago].filter(Boolean).join(' · ') || '—'}
                </Text>
                {f.fecha_cita && <Text style={[st.clienteFecha, { color: c.textMute }]}>📅 {fmtFecha(f.fecha_cita)}</Text>}
              </View>
            ))}

            <View style={st.cardActions}>
              <TouchableOpacity style={[st.mini, st.miniWa]} onPress={() => copiarWhatsApp(lote)}>
                <Ionicons name="logo-whatsapp" size={15} color="#16a34a" />
                <Text style={[st.miniTxt, { color: '#16a34a' }]}>Copiar para WhatsApp</Text>
              </TouchableOpacity>
              {!lote.trabajado && (
                <TouchableOpacity style={[st.mini, { borderColor: c.border }]} onPress={() => marcarTrabajado(lote)} disabled={marcando === lote.id}>
                  {marcando === lote.id
                    ? <ActivityIndicator size="small" color={c.textSub} />
                    : <><Ionicons name="checkmark-circle-outline" size={15} color={c.textSub} /><Text style={[st.miniTxt, { color: c.textSub }]}>Marcar trabajado</Text></>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  h1: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  vacio: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  cardTitulo: { fontSize: 16, fontWeight: '800' },
  cardSub: { fontSize: 12.5, marginTop: 2, marginBottom: 8 },
  badgeTrabajado: { backgroundColor: 'rgba(22,163,74,0.14)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTrabajadoTxt: { color: '#16a34a', fontSize: 11.5, fontWeight: '800' },
  clienteRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  clienteNombre: { fontSize: 13.5, fontWeight: '700' },
  clienteDetalle: { fontSize: 12, marginTop: 1 },
  clienteFecha: { fontSize: 11, marginTop: 1 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  miniWa: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  miniTxt: { fontSize: 13, fontWeight: '700' },
})
