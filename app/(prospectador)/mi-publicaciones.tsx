import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { ThumbImage } from '../../components/ThumbImage'

type Pub = {
  propiedad_id: string
  veces_publicada: number
  fecha_publicacion: string | null
  propiedades: {
    codigo: string | null
    titulo: string | null
    precio: number | null
    tipo: string | null
    operacion: string | null
    estado: string | null
    propiedad_imagenes: { url: string; orden: number }[]
  } | null
}

function formatFecha(f: string | null): string {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

export default function MisPublicaciones() {
  const c = useColors()
  const [loading, setLoading] = useState(true)
  const [pubs, setPubs] = useState<Pub[]>([])
  const [totalVeces, setTotalVeces] = useState(0)

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('propiedad_publicacion')
      .select('propiedad_id, veces_publicada, fecha_publicacion, propiedades(codigo, titulo, precio, tipo, operacion, estado, propiedad_imagenes(url, orden))')
      .eq('user_id', user.id)
      .gt('veces_publicada', 0)
      .order('fecha_publicacion', { ascending: false })

    const lista = ((data ?? []) as any[]).map(r => ({
      ...r,
      propiedades: Array.isArray(r.propiedades) ? r.propiedades[0] ?? null : r.propiedades,
    })) as Pub[]
    setPubs(lista)
    setTotalVeces(lista.reduce((s, p) => s + (p.veces_publicada ?? 0), 0))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])
  const { refreshControl } = usePullRefresh(cargar)

  function renderItem({ item }: { item: Pub }) {
    const prop = item.propiedades
    const cover = prop?.propiedad_imagenes?.length
      ? [...prop.propiedad_imagenes].sort((a, b) => a.orden - b.orden)[0]?.url
      : null
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
        activeOpacity={0.85}
        onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${item.propiedad_id}` as any)}
      >
        {cover
          ? <ThumbImage url={cover} opts={{ width: 200, quality: 60 }} style={s.img} resizeMode="cover" />
          : <View style={[s.img, s.imgPlaceholder]}><Text style={{ fontSize: 24 }}>🏠</Text></View>
        }
        <View style={s.info}>
          <Text style={[s.codigo, { color: c.textSub }]}>{prop?.codigo ?? 'Propiedad'}</Text>
          <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>
            {prop?.titulo ?? 'Propiedad no disponible'}
          </Text>
          {prop?.precio != null && (
            <Text style={s.precio}>${prop.precio.toLocaleString('es-MX')} MXN</Text>
          )}
          <View style={s.metaRow}>
            <Text style={s.vecesBadge}>📤 {item.veces_publicada} {item.veces_publicada === 1 ? 'vez' : 'veces'}</Text>
            {item.fecha_publicacion && (
              <Text style={[s.fecha, { color: c.textSub }]}>Última: {formatFecha(item.fecha_publicacion)}</Text>
            )}
          </View>
          <Text style={s.verHint}>Ver propiedad ›</Text>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.resumen, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.resumenItem}>
          <Text style={s.resumenNum}>{pubs.length}</Text>
          <Text style={[s.resumenLabel, { color: c.textSub }]}>Propiedades</Text>
        </View>
        <View style={[s.resumenDivisor, { backgroundColor: c.border }]} />
        <View style={s.resumenItem}>
          <Text style={s.resumenNum}>{totalVeces}</Text>
          <Text style={[s.resumenLabel, { color: c.textSub }]}>Publicaciones totales</Text>
        </View>
      </View>

      {pubs.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 44, marginBottom: 8 }}>📭</Text>
          <Text style={[s.vacioTitulo, { color: c.text }]}>Aún no has publicado propiedades</Text>
          <Text style={[s.vacioTxt, { color: c.textSub }]}>
            Cuando publiques una propiedad, aparecerá aquí tu historial.
          </Text>
        </View>
      ) : (
        <FlatList
          refreshControl={refreshControl}
          data={pubs}
          keyExtractor={(item) => item.propiedad_id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  resumen: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    margin: 14, marginBottom: 0, borderRadius: 14, borderWidth: 1, paddingVertical: 16,
  },
  resumenItem: { alignItems: 'center', flex: 1 },
  resumenNum: { fontSize: 24, fontWeight: '900', color: '#1a6470' },
  resumenLabel: { fontSize: 12, marginTop: 2 },
  resumenDivisor: { width: 1, height: 36 },
  card: {
    flexDirection: 'row', borderRadius: 14, borderWidth: 1,
    overflow: 'hidden', marginBottom: 12,
  },
  img: { width: 104, height: 104 },
  imgPlaceholder: { backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, padding: 10, justifyContent: 'center' },
  codigo: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  titulo: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  precio: { fontSize: 14, fontWeight: '800', color: '#1a6470', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  vecesBadge: {
    fontSize: 12, fontWeight: '700', color: '#1a6470',
    backgroundColor: 'rgba(26,100,112,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  fecha: { fontSize: 11 },
  verHint: { fontSize: 11, fontWeight: '700', color: '#1a6470', marginTop: 6 },
  vacioTitulo: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  vacioTxt: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
