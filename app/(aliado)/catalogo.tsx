// El catálogo compartido, como lo ve una inmobiliaria aliada.
//
// Ven lo nuestro y lo de las demás agencias, con fotos, precio y ficha. Lo que
// NO ven es a quién llamar: el teléfono y el correo de cada agencia están
// tapados en la base (20261127_aliados_3), así que si una propiedad les
// interesa tienen que contactarnos. Esa regla no vive en esta pantalla —aquí
// solo no se pinta—, vive en los permisos.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, TextInput,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import { normalizar } from '../../lib/texto'

type Prop = {
  id: string; codigo: string | null; titulo: string | null; precio: number | null
  direccion: string | null; operacion: string | null; tipo: string | null
  recamaras: number | null; banos: number | null; m2: number | null
  inmobiliaria_id: string | null
  inmobiliarias: { nombre: string } | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number | null }[] | null
}

const money = (n: number | null) =>
  n ? '$' + Math.round(n).toLocaleString('es-MX') : 'Sin precio'

export default function AliadoCatalogo() {
  const c = useColors()
  const [lista, setLista] = useState<Prop[]>([])
  const [busca, setBusca] = useState('')
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, recamaras, banos, m2, inmobiliaria_id, inmobiliarias(nombre), propiedad_imagenes(url, thumb_url, orden)')
      .eq('es_inventario', false)
      .eq('estado', 'disponible')
      .order('created_at', { ascending: false })
      .limit(120)
    setLista((data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Prop[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const q = normalizar(busca)
  const vistas = q
    ? lista.filter(p =>
        normalizar(p.titulo).includes(q) ||
        normalizar(p.direccion).includes(q) ||
        normalizar(p.codigo).includes(q))
    : lista

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Text style={[s.titulo, { color: c.text }]}>Catálogo compartido</Text>
        <Text style={[s.sub, { color: c.textSub }]}>
          Lo último publicado por todas las inmobiliarias. ¿Te interesa alguna? Escríbenos.
        </Text>
        <View style={[s.busca, { borderColor: c.border, backgroundColor: c.card }]}>
          <Ionicons name="search-outline" size={16} color={c.textSub} />
          <TextInput
            style={[s.buscaInp, { color: c.text }]}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por título, dirección o código…"
            placeholderTextColor={c.placeholder}
          />
        </View>
      </View>

      <FlatList
        data={vistas}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 10 }}
        renderItem={({ item }) => {
          const img = (item.propiedad_imagenes ?? [])
            .slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0]
          return (
            <TouchableOpacity
              style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${item.id}` as any)}
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
                  {[item.direccion, item.inmobiliarias?.nombre].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <Text style={[s.meta, { color: c.textSub, textAlign: 'center', marginTop: 40 }]}>
            Sin resultados.
          </Text>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 10 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  fila: { flexDirection: 'row', gap: 11, borderWidth: 1, borderRadius: 13, padding: 9, alignItems: 'center' },
  foto: { width: 76, height: 62, borderRadius: 9 },
  nombre: { fontSize: 14.5, fontWeight: '800' },
  precio: { fontSize: 14, fontWeight: '900' },
  meta: { fontSize: 12 },
})
