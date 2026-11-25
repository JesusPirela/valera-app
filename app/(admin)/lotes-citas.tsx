import { useCallback, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type LoteRow = {
  id: string; numero: number; tamano: number; citas_ids: string[]
  dado_at: string; trabajado: boolean; trabajado_at: string | null
  asignado_texto: string | null
  asignado: { nombre: string } | null
  creador: { nombre: string } | null
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso)
  if (isNaN(t.getTime())) return '—'
  return t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Vista de solo lectura: todos los lotes que se han dado desde "Armar lotes"
// en citas-venta — a quién, cuándo, y si ya lo trabajó. La creación/asignación
// pasa en citas-venta mismo (ahí vive el corte de clientes); esta pantalla es
// el historial y estado del CRM.
export default function LotesCitas() {
  const c = useColors()
  const [lotes, setLotes] = useState<LoteRow[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('lotes_citas')
      .select('id, numero, tamano, citas_ids, dado_at, trabajado, trabajado_at, asignado_texto, asignado:profiles!lotes_citas_asignado_a_fkey(nombre), creador:profiles!lotes_citas_creado_por_fkey(nombre)')
      .order('dado_at', { ascending: false })
    setLotes((data ?? []) as any)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const pendientes = lotes.filter(l => !l.trabajado).length

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[st.h1, { color: c.text }]}>Lotes de citas-venta</Text>
        <Text style={[st.sub, { color: c.textSub }]}>
          Historial de lotes dados desde "Armar lotes" en Citas de venta. {lotes.length} en total, {pendientes} sin trabajar.
        </Text>

        {loading ? (
          <ActivityIndicator color={c.text} style={{ marginTop: 40 }} />
        ) : lotes.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>Aún no se ha dado ningún lote.</Text>
        ) : lotes.map(l => (
          <View key={l.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[st.cardTitulo, { color: c.text }]}>Lote {l.numero} · {l.tamano} clientes</Text>
              <View style={[st.badge, l.trabajado ? st.badgeOk : st.badgePend]}>
                <Text style={[st.badgeTxt, { color: l.trabajado ? '#16a34a' : '#b45309' }]}>{l.trabajado ? '✓ Trabajado' : 'Pendiente'}</Text>
              </View>
            </View>
            <Text style={[st.linea, { color: c.textSub }]}>Dado a <Text style={{ fontWeight: '700' }}>{l.asignado?.nombre ?? l.asignado_texto ?? '—'}</Text> el {fmtFecha(l.dado_at)}</Text>
            <Text style={[st.linea, { color: c.textMute }]}>Armado por {l.creador?.nombre ?? '—'}{l.trabajado_at ? ` · trabajado el ${fmtFecha(l.trabajado_at)}` : ''}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  vacio: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  cardTitulo: { fontSize: 15, fontWeight: '800' },
  linea: { fontSize: 12.5, marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeOk: { backgroundColor: 'rgba(22,163,74,0.14)' },
  badgePend: { backgroundColor: 'rgba(180,83,9,0.14)' },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
})
