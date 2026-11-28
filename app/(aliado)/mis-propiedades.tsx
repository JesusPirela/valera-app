// SUS propiedades: las de su inmobiliaria y nada más.
//
// El filtro no es cosa de esta pantalla: la base solo les deja escribir las
// que llevan su `inmobiliaria_id` (ver 20261127_aliados_4_rol.sql). Aquí se
// consulta por ese mismo id para que la lista enseñe lo mismo que pueden
// tocar; si alguien cambiara esta consulta a mano, seguiría sin poder editar
// lo ajeno.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'

type Prop = {
  id: string; codigo: string | null; titulo: string | null; precio: number | null
  direccion: string | null; operacion: string | null; estado: string | null
  recamaras: number | null; banos: number | null; m2: number | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number | null }[] | null
}

type Estadisticas = {
  disponibles: number; vendidas: number; rentadas: number
  publicaciones: number; vistas: number
}

const money = (n: number | null) =>
  n ? '$' + Math.round(n).toLocaleString('es-MX') : 'Sin precio'

export default function AliadoPropiedades() {
  const c = useColors()
  const [lista, setLista] = useState<Prop[]>([])
  const [cargando, setCargando] = useState(true)
  const [agencia, setAgencia] = useState<string | null>(null)
  const [stats, setStats] = useState<Estadisticas | null>(null)

  const cargar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: perfil } = await supabase
      .from('profiles').select('inmobiliaria_id').eq('id', session.user.id).single()
    if (!perfil?.inmobiliaria_id) { setCargando(false); return }
    const [{ data: inm }, { data }, { data: est }] = await Promise.all([
      supabase.from('inmobiliarias').select('nombre').eq('id', perfil.inmobiliaria_id).single(),
      supabase.from('propiedades')
        .select('id, codigo, titulo, precio, direccion, operacion, estado, recamaras, banos, m2, propiedad_imagenes(url, thumb_url, orden)')
        .eq('inmobiliaria_id', perfil.inmobiliaria_id)
        .order('created_at', { ascending: false }),
      supabase.rpc('estadisticas_aliado'),
    ])
    setAgencia(inm?.nombre ?? null)
    setLista((data ?? []) as unknown as Prop[])
    setStats((est ?? null) as Estadisticas | null)
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Nuestras propiedades</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            {lista.length === 0
              ? `Todavía no hay ninguna publicada${agencia ? ` de ${agencia}` : ''}.`
              : `${lista.length} publicada${lista.length === 1 ? '' : 's'}${agencia ? ` · ${agencia}` : ''}`}
          </Text>
        </View>
        <TouchableOpacity style={s.btnAgregar} onPress={() => router.push('/(aliado)/nueva-propiedad')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.btnAgregarTxt}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={s.statsGrid}>
          {[
            { icono: 'home' as const, color: '#1a6470', num: stats.disponibles, lbl: 'Disponibles' },
            { icono: 'checkmark-done' as const, color: '#2e7d32', num: stats.vendidas + stats.rentadas, lbl: 'Vendidas/rentadas' },
            { icono: 'eye' as const, color: '#5e35b1', num: stats.vistas, lbl: 'Vistas de tu catálogo' },
            { icono: 'megaphone' as const, color: '#c9a84c', num: stats.publicaciones, lbl: 'Veces impulsadas' },
          ].map((b, i) => (
            <View key={i} style={[s.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[s.statIcono, { backgroundColor: b.color + '22' }]}>
                <Ionicons name={b.icono} size={16} color={b.color} />
              </View>
              <Text style={[s.statNum, { color: c.text }]}>{b.num}</Text>
              <Text style={[s.statLbl, { color: c.textSub }]}>{b.lbl}</Text>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={lista}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 10 }}
        ListEmptyComponent={
          <View style={s.vacio}>
            <Ionicons name="home-outline" size={30} color={c.textMute} />
            <Text style={[s.vacioTxt, { color: c.textSub }]}>
              Aquí van las propiedades de tu inmobiliaria. Las que subas se verán
              también en el catálogo compartido.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const img = (item.propiedad_imagenes ?? [])
            .slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0]
          return (
            <TouchableOpacity
              style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => item.codigo && router.push(`/ficha/${item.codigo}` as any)}
              activeOpacity={0.75}
            >
              {img
                ? <Image source={{ uri: thumb(img.thumb_url ?? img.url, { width: 200 }) }} style={s.foto} />
                : <View style={[s.foto, { backgroundColor: c.border }]} />}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>
                  {item.titulo ?? item.codigo ?? 'Sin título'}
                </Text>
                <Text style={[s.precio, { color: c.text }]}>{money(item.precio)}</Text>
                <Text style={[s.meta, { color: c.textSub }]} numberOfLines={1}>
                  {[item.direccion, item.operacion, item.estado].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginHorizontal: 14, marginTop: 4,
  },
  statCard: {
    flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 13,
    padding: 12, gap: 4,
  },
  statIcono: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 19, fontWeight: '900' },
  statLbl: { fontSize: 11 },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#5e35b1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9,
  },
  btnAgregarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  fila: { flexDirection: 'row', gap: 11, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center' },
  foto: { width: 76, height: 62, borderRadius: 9 },
  nombre: { fontSize: 14.5, fontWeight: '800' },
  precio: { fontSize: 14, fontWeight: '900' },
  meta: { fontSize: 12 },
  vacio: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  vacioTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
})
