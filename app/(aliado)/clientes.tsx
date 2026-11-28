// Sus clientes. Los suyos y nada más.
//
// No hace falta filtrar aquí: la regla de la base ya deja ver únicamente los
// clientes de los que uno es responsable (y a los admins de Valera, los
// nuestros). Un aliado no ve un solo cliente nuestro, ni nosotros los vemos
// mezclados con los nuestros en su pantalla.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type Cliente = {
  id: string; nombre: string | null; telefono: string | null
  estado: string | null; zona_busqueda: string | null; presupuesto: string | null
  created_at: string
}

export default function AliadoClientes() {
  const c = useColors()
  const [lista, setLista] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, estado, zona_busqueda, presupuesto, created_at')
      .order('created_at', { ascending: false })
    setLista((data ?? []) as Cliente[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  const tel = (t: string | null) => (t ?? '').replace(/\D/g, '')

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Text style={[s.titulo, { color: c.text }]}>Nuestros clientes</Text>
        <Text style={[s.sub, { color: c.textSub }]}>
          {lista.length === 0 ? 'Todavía no hay ninguno.' : `${lista.length} en total`}
        </Text>
      </View>

      <FlatList
        data={lista}
        keyExtractor={x => x.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 9 }}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="people-outline" size={30} color={c.textMute} />
            <Text style={[s.vacioTxt, { color: c.textSub }]}>
              Aquí llevas a tus clientes: a quién le estás buscando qué, y cómo
              vas con cada uno.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>
                {item.nombre ?? 'Sin nombre'}
              </Text>
              <Text style={[s.meta, { color: c.textSub }]} numberOfLines={1}>
                {[item.telefono, item.zona_busqueda, item.presupuesto].filter(Boolean).join(' · ') || 'Sin datos'}
              </Text>
            </View>
            {!!tel(item.telefono) && (
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://wa.me/${tel(item.telefono).length === 10 ? '52' : ''}${tel(item.telefono)}`)}
                style={s.wa}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp a ${item.nombre ?? 'el cliente'}`}
              >
                <Ionicons name="logo-whatsapp" size={17} color="#128C7E" />
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 11 },
  nombre: { fontSize: 14.5, fontWeight: '800' },
  meta: { fontSize: 12 },
  wa: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#128C7E22' },
  vacio: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  vacioTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
})
