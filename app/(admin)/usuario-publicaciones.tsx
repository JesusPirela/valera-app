import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  FlatList, Image, TextInput, Alert, Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import { normalizar } from '../../lib/texto'

const RED = '#c0392b'
const TEAL = '#1a6470'

type Pub = {
  propiedad_id: string
  codigo: string | null
  titulo: string | null
  veces: number
  fecha: string | null
  imagen: string | null
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function UsuarioPublicaciones() {
  const c = useColors()
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const [pubs, setPubs] = useState<Pub[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [procesando, setProcesando] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('get_publicaciones_usuario', { p_user_id: id })
    setPubs((data ?? []) as Pub[])
    setLoading(false)
  }, [id])

  useEffect(() => { cargar() }, [id])

  function confirmar(titulo: string, mensaje: string, onOk: () => void) {
    if (Platform.OS === 'web') {
      if (window.confirm(`${titulo}\n\n${mensaje}`)) onOk()
    } else {
      Alert.alert(titulo, mensaje, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Despublicar', style: 'destructive', onPress: onOk },
      ])
    }
  }

  async function despublicar(p: Pub) {
    confirmar(
      'Despublicar propiedad',
      `Quitar la publicación de ${p.codigo ?? 'esta propiedad'} a ${nombre}. El usuario podrá volver a publicarla.`,
      async () => {
        setProcesando(prev => new Set(prev).add(p.propiedad_id))
        const { error } = await supabase.rpc('admin_despublicar_propiedad', {
          p_user_id: id, p_propiedad_id: p.propiedad_id,
        })
        if (error) {
          Alert.alert('Error', 'No se pudo despublicar.')
        } else {
          setPubs(prev => prev.filter(x => x.propiedad_id !== p.propiedad_id))
        }
        setProcesando(prev => { const s = new Set(prev); s.delete(p.propiedad_id); return s })
      }
    )
  }

  async function despublicarTodas() {
    confirmar(
      'Despublicar TODAS',
      `Se quitarán las ${pubs.length} publicaciones de ${nombre}. Esta acción no se puede deshacer.`,
      async () => {
        setLoading(true)
        const { error } = await supabase.rpc('admin_despublicar_todas', { p_user_id: id })
        if (error) { Alert.alert('Error', 'No se pudieron despublicar.'); setLoading(false); return }
        setPubs([])
        setLoading(false)
      }
    )
  }

  const filtradas = busqueda.trim()
    ? pubs.filter(p => {
        const q = normalizar(busqueda)
        return normalizar(p.codigo).includes(q) || normalizar(p.titulo).includes(q)
      })
    : pubs

  const header = (
    <View>
      <Text style={[s.title, { color: c.text }]}>📤 Publicaciones</Text>
      <Text style={[s.sub, { color: c.textMute }]}>{nombre} · {pubs.length} {pubs.length === 1 ? 'publicación' : 'publicaciones'}</Text>

      <View style={[s.searchRow, { backgroundColor: c.card, borderColor: c.inputBorder }]}>
        <Text style={{ fontSize: 15, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: c.inputText }]}
          placeholder="Buscar por código o título..."
          placeholderTextColor={c.placeholder}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}><Text style={{ color: '#aaa', fontSize: 16 }}>✕</Text></TouchableOpacity>
        )}
      </View>

      {pubs.length > 0 && (
        <TouchableOpacity style={s.todasBtn} onPress={despublicarTodas}>
          <Text style={s.todasBtnTxt}>🗑 Despublicar todas ({pubs.length})</Text>
        </TouchableOpacity>
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <FlatList
        data={filtradas}
        keyExtractor={(item) => item.propiedad_id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        renderItem={({ item }) => {
          const ocupado = procesando.has(item.propiedad_id)
          return (
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              {item.imagen
                ? <Image source={{ uri: thumb(item.imagen, { width: 160, quality: 55 }) }} style={s.img} />
                : <View style={[s.img, s.imgPh]}><Text style={{ fontSize: 22 }}>🏠</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={[s.codigo, { color: TEAL }]}>{item.codigo ?? '—'}</Text>
                <Text style={[s.cardTitulo, { color: c.text }]} numberOfLines={2}>{item.titulo ?? 'Sin título'}</Text>
                <Text style={[s.cardMeta, { color: c.textMute }]}>
                  📤 {item.veces} {item.veces === 1 ? 'vez' : 'veces'}{item.fecha ? ` · ${fechaCorta(item.fecha)}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={[s.despubBtn, ocupado && { opacity: 0.5 }]} onPress={() => despublicar(item)} disabled={ocupado}>
                {ocupado
                  ? <ActivityIndicator size="small" color={RED} />
                  : <Text style={s.despubBtnTxt}>Despublicar</Text>}
              </TouchableOpacity>
            </View>
          )
        }}
        ListEmptyComponent={
          <Text style={[s.vacio, { color: c.textMute }]}>
            {busqueda.trim() ? 'Sin resultados.' : 'Este usuario no tiene publicaciones activas.'}
          </Text>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 14, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15 },

  todasBtn: {
    alignSelf: 'flex-start', borderWidth: 1.5, borderColor: RED, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14,
  },
  todasBtnTxt: { color: RED, fontSize: 13, fontWeight: '700' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 10,
  },
  img: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e8f0f0' },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  codigo: { fontSize: 12, fontWeight: '800' },
  cardTitulo: { fontSize: 14, fontWeight: '700', marginTop: 1 },
  cardMeta: { fontSize: 12, marginTop: 3, fontWeight: '600' },

  despubBtn: {
    borderWidth: 1.5, borderColor: RED, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, minWidth: 92, alignItems: 'center',
  },
  despubBtnTxt: { color: RED, fontSize: 12, fontWeight: '700' },

  vacio: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 40 },
})
