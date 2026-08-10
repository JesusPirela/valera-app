import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, Alert, Platform, Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as MediaLibrary from 'expo-media-library'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type VideoMarketing = {
  id: string
  titulo: string
  descripcion: string | null
  categoria: string
  video_url: string
  thumbnail_url: string | null
  created_at: string
}

const CATEGORIAS = [
  { value: 'todos',        label: 'Todos',              emoji: '🎞️' },
  { value: 'reel',         label: 'Reels',              emoji: '🎬' },
  { value: 'presentacion', label: 'Presentación',       emoji: '🏢' },
  { value: 'tour',         label: 'Tour',               emoji: '🏠' },
  { value: 'motivacional', label: 'Motivacional',       emoji: '💪' },
  { value: 'otro',         label: 'Otro',               emoji: '📁' },
]

function catLabel(v: string) {
  return CATEGORIAS.find(c => c.value === v) ?? { label: v, emoji: '📁' }
}

export default function VideosProspectador() {
  const c = useColors()
  const [videos, setVideos] = useState<VideoMarketing[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [descargando, setDescargando] = useState<Record<string, boolean>>({})

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('videos_marketing')
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: false })
    setVideos(data ?? [])
    setCargando(false)
  }

  const filtrados = filtro === 'todos' ? videos : videos.filter(v => v.categoria === filtro)

  async function abrirVideo(video: VideoMarketing) {
    const soporte = await Linking.canOpenURL(video.video_url)
    if (soporte) {
      Linking.openURL(video.video_url)
    } else {
      Alert.alert('Error', 'No se pudo abrir el video.')
    }
  }

  async function descargarYCompartir(video: VideoMarketing) {
    if (Platform.OS === 'web') {
      Linking.openURL(video.video_url)
      return
    }

    setDescargando(prev => ({ ...prev, [video.id]: true }))
    try {
      const ext = video.video_url.split('?')[0].split('.').pop() ?? 'mp4'
      const localUri = `${FileSystem.cacheDirectory}valera_${video.id}.${ext}`

      // Si ya está en cache, reusar
      const info = await FileSystem.getInfoAsync(localUri)
      if (!info.exists) {
        const dl = FileSystem.createDownloadResumable(video.video_url, localUri)
        const result = await dl.downloadAsync()
        if (!result?.uri) throw new Error('Descarga fallida')
      }

      const puedeCompartir = await Sharing.isAvailableAsync()
      if (puedeCompartir) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'video/mp4',
          dialogTitle: video.titulo,
        })
      } else {
        // Guardar en galería si no hay sharing
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(localUri)
          Alert.alert('¡Guardado!', 'El video se guardó en tu galería.')
        } else {
          Alert.alert('Sin permiso', 'Activa el acceso a la galería en ajustes.')
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo descargar el video.')
    } finally {
      setDescargando(prev => ({ ...prev, [video.id]: false }))
    }
  }

  async function guardarEnGaleria(video: VideoMarketing) {
    if (Platform.OS === 'web') {
      Linking.openURL(video.video_url)
      return
    }

    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Sin permiso', 'Activa el acceso a la galería en ajustes para guardar el video.')
      return
    }

    setDescargando(prev => ({ ...prev, [`save_${video.id}`]: true }))
    try {
      const ext = video.video_url.split('?')[0].split('.').pop() ?? 'mp4'
      const localUri = `${FileSystem.cacheDirectory}valera_save_${video.id}.${ext}`
      const dl = FileSystem.createDownloadResumable(video.video_url, localUri)
      const result = await dl.downloadAsync()
      if (!result?.uri) throw new Error('Descarga fallida')
      await MediaLibrary.saveToLibraryAsync(result.uri)
      Alert.alert('¡Guardado!', `"${video.titulo}" se guardó en tu galería. Puedes subirlo desde allí a tus stories o publicaciones.`)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar el video.')
    } finally {
      setDescargando(prev => ({ ...prev, [`save_${video.id}`]: false }))
    }
  }

  const renderVideo = ({ item }: { item: VideoMarketing }) => {
    const cat = catLabel(item.categoria)
    const bajandoShare = descargando[item.id]
    const bajandoSave  = descargando[`save_${item.id}`]

    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.thumbWrap} onPress={() => abrirVideo(item)} activeOpacity={0.85}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={s.thumb} resizeMode="cover" />
          ) : (
            <View style={[s.thumbPlaceholder, { backgroundColor: c.bg }]}>
              <Text style={s.thumbIcon}>🎬</Text>
            </View>
          )}
          <View style={s.playOverlay}>
            <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
          </View>
          <View style={s.catBadge}>
            <Text style={s.catBadgeTxt}>{cat.emoji} {cat.label}</Text>
          </View>
        </TouchableOpacity>

        <View style={s.info}>
          <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>{item.titulo}</Text>
          {item.descripcion ? (
            <Text style={[s.desc, { color: c.textSub }]} numberOfLines={2}>{item.descripcion}</Text>
          ) : null}
          <Text style={[s.fecha, { color: c.textMute }]}>
            {new Date(item.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>

          <View style={s.acciones}>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#1a6470' }]}
              onPress={() => guardarEnGaleria(item)}
              disabled={bajandoSave || bajandoShare}
            >
              {bajandoSave
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="download-outline" size={16} color="#fff" />
              }
              <Text style={s.btnTxt}>{bajandoSave ? 'Guardando…' : 'Guardar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#25D366' }]}
              onPress={() => descargarYCompartir(item)}
              disabled={bajandoShare || bajandoSave}
            >
              {bajandoShare
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="share-outline" size={16} color="#fff" />
              }
              <Text style={s.btnTxt}>{bajandoShare ? 'Preparando…' : 'Compartir'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={[s.headerTitle, { color: c.text }]}>🎬 Videos de marketing</Text>
        <Text style={[s.headerSub, { color: c.textSub }]}>
          Descarga y comparte con tus clientes o en tus stories
        </Text>
      </View>

      {/* Filtro de categorías */}
      <View style={[s.filtrosWrap, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <FlatList
          data={CATEGORIAS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={c => c.value}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.chip, filtro === item.value && s.chipActive]}
              onPress={() => setFiltro(item.value)}
            >
              <Text style={[s.chipTxt, filtro === item.value && s.chipTxtActive]}>
                {item.emoji} {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={v => v.id}
          renderItem={renderVideo}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎬</Text>
              <Text style={[s.emptyTitle, { color: c.text }]}>Sin videos{filtro !== 'todos' ? ` en "${catLabel(filtro).label}"` : ''}</Text>
              <Text style={[s.emptyDesc, { color: c.textSub }]}>
                {filtro !== 'todos' ? 'Prueba con otra categoría.' : 'Los administradores aún no han subido videos.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  filtrosWrap: { borderBottomWidth: 1 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTxtActive: { color: '#fff' },
  card: {
    borderRadius: 14, borderWidth: 1,
    marginBottom: 16, overflow: 'hidden',
  },
  thumbWrap: { position: 'relative', height: 190 },
  thumb: { width: '100%', height: 190 },
  thumbPlaceholder: {
    width: '100%', height: 190,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbIcon: { fontSize: 48 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  catBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  catBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  info: { padding: 14 },
  titulo: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  desc: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  fecha: { fontSize: 11, marginBottom: 12 },
  acciones: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
})
