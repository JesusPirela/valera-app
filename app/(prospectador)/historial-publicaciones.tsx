import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  TouchableOpacity, TextInput, Image,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { normalizar } from '../../lib/texto'
import { thumb } from '../../lib/img'

type Entrada = {
  id: string
  propiedad_id: string
  user_id: string
  created_at: string
  codigo: string | null
  titulo: string | null
  nombre_usuario: string | null
  email_usuario: string | null
}

const TEAL = '#1a6470'
const POR_PAGINA = 50

function fechaHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function HistorialPublicaciones() {
  const c = useColors()
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [loading, setLoading] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [hayMas, setHayMas] = useState(false)
  const [offset, setOffset] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [esStaff, setEsStaff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Portada (primera imagen) por propiedad_id, cargada aparte de la RPC.
  const [covers, setCovers] = useState<Record<string, string>>({})

  useFocusEffect(useCallback(() => {
    setOffset(0)
    setEntradas([])
    setCovers({})
    setError(null)
    cargar(0, true)
  }, []))

  async function cargarPortadas(ids: string[]) {
    const nuevos = [...new Set(ids)].filter(Boolean)
    if (!nuevos.length) return
    const { data } = await supabase
      .from('propiedad_imagenes')
      .select('propiedad_id, url, orden')
      .in('propiedad_id', nuevos)
      .order('orden', { ascending: true })
    const map: Record<string, string> = {}
    for (const r of (data ?? []) as any[]) {
      if (!map[r.propiedad_id]) map[r.propiedad_id] = r.url  // primera (orden más bajo) = portada
    }
    setCovers(prev => ({ ...prev, ...map }))
  }

  async function cargar(off: number, reset = false) {
    if (off === 0) setLoading(true)
    else setCargandoMas(true)

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    // Detectar rol para saber si se muestra columna de usuario
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    const rol = prof?.role ?? 'prospectador'
    const staff = ['admin', 'supervisor', 'asesor'].includes(rol)
    setEsStaff(staff)

    const { data, error } = await supabase.rpc('get_historial_publicaciones', {
      p_user_id: null,
      p_limit: POR_PAGINA + 1,
      p_offset: off,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      setCargandoMas(false)
      return
    }

    const lista = (data ?? []) as Entrada[]
    const hay = lista.length > POR_PAGINA
    if (hay) lista.pop()

    setEntradas(prev => reset ? lista : [...prev, ...lista])
    setHayMas(hay)
    setOffset(off + lista.length)
    setLoading(false)
    setCargandoMas(false)
    cargarPortadas(lista.map(e => e.propiedad_id)).catch(() => {})
  }

  const filtradas = entradas.filter(e => {
    if (!busqueda.trim()) return true
    const q = normalizar(busqueda)
    return (
      normalizar(e.codigo ?? '').includes(q) ||
      normalizar(e.titulo ?? '').includes(q) ||
      normalizar(e.nombre_usuario ?? '').includes(q) ||
      normalizar(e.email_usuario ?? '').includes(q)
    )
  })

  function renderItem({ item }: { item: Entrada; index: number }) {
    const cover = covers[item.propiedad_id]
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
        activeOpacity={0.85}
        onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${item.propiedad_id}` as any)}
      >
        {cover
          ? <Image source={{ uri: thumb(cover, { width: 160, quality: 60 }) }} style={s.img} resizeMode="cover" />
          : <View style={[s.img, s.imgPlaceholder]}><Text style={{ fontSize: 22 }}>🏠</Text></View>
        }
        <View style={{ flex: 1 }}>
          <View style={s.cardTop}>
            <Text style={[s.codigo, { backgroundColor: TEAL, color: '#fff' }]}>{item.codigo ?? '—'}</Text>
            <Text style={[s.fecha, { color: c.textMute }]}>{fechaHora(item.created_at)}</Text>
          </View>
          <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>{item.titulo ?? 'Sin título'}</Text>
          {esStaff && (
            <Text style={[s.usuario, { color: c.textSub }]}>
              👤 {item.nombre_usuario ?? item.email_usuario ?? 'Usuario desconocido'}
            </Text>
          )}
          <Text style={s.verHint}>Ver propiedad ›</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder="Buscar por código, título o usuario…"
          placeholderTextColor={c.textMute}
          value={busqueda}
          onChangeText={setBusqueda}
          returnKeyType="search"
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Text style={[s.clearBtn, { color: c.textMute }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 36, marginBottom: 10 }}>⚠️</Text>
          <Text style={[s.emptyTxt, { color: c.text, fontWeight: '700', marginBottom: 6 }]}>Error al cargar</Text>
          <Text style={[s.emptyTxt, { color: c.textMute, fontSize: 12 }]}>{error}</Text>
          <TouchableOpacity
            style={[s.retryBtn, { backgroundColor: TEAL, marginTop: 16 }]}
            onPress={() => { setError(null); cargar(0, true) }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : filtradas.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>
            {busqueda ? 'Sin resultados para esa búsqueda.' : 'Aún no hay publicaciones registradas.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={[s.total, { color: c.textMute }]}>
              {filtradas.length} {filtradas.length === 1 ? 'publicación' : 'publicaciones'}
              {hayMas ? ' (hay más)' : ''}
            </Text>
          }
          onEndReached={() => { if (hayMas && !cargandoMas) cargar(offset) }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            cargandoMas ? <ActivityIndicator color={TEAL} style={{ marginTop: 16 }} /> : null
          }
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, marginHorizontal: 12, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, height: 28 },
  clearBtn: { fontSize: 16, padding: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },

  total: { fontSize: 11, marginBottom: 8, marginTop: 4 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  img: { width: 72, height: 72, borderRadius: 8 },
  imgPlaceholder: { backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center' },
  verHint: { fontSize: 11, fontWeight: '700', color: TEAL, marginTop: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  codigo: { fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  fecha: { fontSize: 11 },
  titulo: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 3 },
  usuario: { fontSize: 12, marginTop: 2 },
})
