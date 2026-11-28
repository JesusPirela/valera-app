// Quién pidió "probarlo" desde el link de invitación (etapa 4 de cuentas
// aliadas). De aquí no sale una cuenta automática: el admin la revisa, llama
// o escribe, y si procede, la da de alta a mano desde Equipo → Usuarios
// (elige el rol "Aliado" y ahí se le pide la inmobiliaria).
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Solicitud = {
  id: string
  nombre: string
  inmobiliaria: string
  telefono: string | null
  email: string | null
  atendida: boolean
  atendida_at: string | null
  created_at: string
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SolicitudesAliado() {
  const c = useColors()
  const [lista, setLista] = useState<Solicitud[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitudes_aliado')
      .select('id, nombre, inmobiliaria, telefono, email, atendida, atendida_at, created_at')
      .order('atendida', { ascending: true })
      .order('created_at', { ascending: false })
    setLista((data ?? []) as Solicitud[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  async function marcarAtendida(id: string) {
    setLista(prev => prev.map(s => s.id === id ? { ...s, atendida: true, atendida_at: new Date().toISOString() } : s))
    const { error } = await supabase.rpc('marcar_solicitud_aliado_atendida', { p_id: id })
    if (error) cargar()
  }

  const tel = (t: string | null) => (t ?? '').replace(/\D/g, '')
  const waUrl = (t: string) => `https://wa.me/${t.length === 10 ? '52' : ''}${t}`

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  const pendientes = lista.filter(l => !l.atendida).length

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Text style={[s.titulo, { color: c.text }]}>Solicitudes de inmobiliarias</Text>
        <Text style={[s.sub, { color: c.textSub }]}>
          Quienes pidieron probar la app desde el link de invitación.
          {pendientes > 0 ? ` · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : ''}
        </Text>
      </View>

      <FlatList
        data={lista}
        keyExtractor={x => x.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 9 }}
        refreshControl={refreshControl}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="send-outline" size={30} color={c.textMute} />
            <Text style={[s.vacioTxt, { color: c.textSub }]}>
              Todavía nadie ha pedido probarlo. Comparte el link de invitación
              desde Propiedades.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.fila, { backgroundColor: c.card, borderColor: c.border }, item.atendida && { opacity: 0.55 }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{item.inmobiliaria}</Text>
              <Text style={[s.meta, { color: c.textSub }]} numberOfLines={1}>
                {[item.nombre, item.telefono, item.email].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[s.fecha, { color: c.textMute }]}>{fecha(item.created_at)}</Text>
            </View>
            <View style={s.acciones}>
              {!!tel(item.telefono) && (
                <TouchableOpacity onPress={() => Linking.openURL(waUrl(tel(item.telefono)))} style={s.wa}>
                  <Ionicons name="logo-whatsapp" size={17} color="#128C7E" />
                </TouchableOpacity>
              )}
              {!item.atendida && (
                <TouchableOpacity onPress={() => marcarAtendida(item.id)} style={s.ok}>
                  <Ionicons name="checkmark" size={17} color="#2e7d32" />
                </TouchableOpacity>
              )}
            </View>
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
  fecha: { fontSize: 11, marginTop: 2 },
  acciones: { flexDirection: 'row', gap: 8 },
  wa: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#128C7E22' },
  ok: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2e7d3222' },
  vacio: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  vacioTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
})
