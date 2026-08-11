import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, Alert, Platform, Linking, ScrollView,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
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

type PropiedadConVideo = {
  id: string
  titulo: string
  codigo: string
  video_url: string
  precio: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const CATEGORIAS = [
  { value: 'todos',        label: 'Todos',         emoji: '🎞️' },
  { value: 'reel',         label: 'Reels',         emoji: '🎬' },
  { value: 'presentacion', label: 'Presentación',  emoji: '🏢' },
  { value: 'tour',         label: 'Tour',          emoji: '🏠' },
  { value: 'motivacional', label: 'Motivacional',  emoji: '💪' },
  { value: 'otro',         label: 'Otro',          emoji: '📁' },
]

function catLabel(v: string) {
  return CATEGORIAS.find(c => c.value === v) ?? { label: v, emoji: '📁' }
}

function formatPrecio(p: number | null) {
  if (!p) return null
  return `$${p.toLocaleString('es-MX')} MXN`
}

export default function VideosProspectador() {
  const c = useColors()
  const [videos, setVideos] = useState<VideoMarketing[]>([])
  const [propVideos, setPropVideos] = useState<PropiedadConVideo[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [descargando, setDescargando] = useState<Record<string, boolean>>({})

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setCargando(true)
    const [{ data: mkt }, { data: props }] = await Promise.all([
      supabase
        .from('videos_marketing')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('propiedades')
        .select('id, titulo, codigo, video_url, precio, propiedad_imagenes(url, orden)')
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    setVideos(mkt ?? [])
    setPropVideos((props ?? []) as PropiedadConVideo[])
    setCargando(false)
  }

  const filtrados = filtro === 'todos' ? videos : videos.filter(v => v.categoria === filtro)

  async function abrirVideo(url: string) {
    const ok = await Linking.canOpenURL(url)
    if (ok) Linking.openURL(url)
    else Alert.alert('Error', 'No se pudo abrir el video.')
  }

  async function guardarEnGaleria(id: string, url: string, titulo: string) {
    if (Platform.OS === 'web') {
      const a = document.createElement('a')
      a.href = url
      a.download = `${titulo.replace(/[^a-z0-9]/gi, '_')}.mp4`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Sin permiso', 'Activa el acceso a la galería en ajustes.')
      return
    }
    setDescargando(prev => ({ ...prev, [`save_${id}`]: true }))
    try {
      const ext = url.split('?')[0].split('.').pop() ?? 'mp4'
      const localUri = `${FileSystem.cacheDirectory}valera_save_${id}.${ext}`
      const dl = FileSystem.createDownloadResumable(url, localUri)
      const result = await dl.downloadAsync()
      if (!result?.uri) throw new Error('Descarga fallida')
      await MediaLibrary.saveToLibraryAsync(result.uri)
      Alert.alert('¡Guardado!', `"${titulo}" se guardó en tu galería.`)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar el video.')
    } finally {
      setDescargando(prev => ({ ...prev, [`save_${id}`]: false }))
    }
  }

  async function compartir(id: string, url: string, titulo: string) {
    if (Platform.OS === 'web') {
      // Intentar Web Share API (funciona en Chrome móvil y Safari)
      if (typeof navigator !== 'undefined' && navigator.share) {
        try { await navigator.share({ title: titulo, url }); return } catch { /* cancelado */ }
      }
      // Fallback: descarga directa en vez de abrir pestaña
      const a = document.createElement('a')
      a.href = url
      a.download = `${titulo.replace(/[^a-z0-9]/gi, '_')}.mp4`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    setDescargando(prev => ({ ...prev, [id]: true }))
    try {
      const ext = url.split('?')[0].split('.').pop() ?? 'mp4'
      const localUri = `${FileSystem.cacheDirectory}valera_${id}.${ext}`
      const info = await FileSystem.getInfoAsync(localUri)
      if (!info.exists) {
        const dl = FileSystem.createDownloadResumable(url, localUri)
        const result = await dl.downloadAsync()
        if (!result?.uri) throw new Error('Descarga fallida')
      }
      const ok = await Sharing.isAvailableAsync()
      if (ok) {
        await Sharing.shareAsync(localUri, { mimeType: 'video/mp4', dialogTitle: titulo })
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(localUri)
          Alert.alert('¡Guardado!', 'El video se guardó en tu galería.')
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo compartir el video.')
    } finally {
      setDescargando(prev => ({ ...prev, [id]: false }))
    }
  }

  // ── Card de video de marketing ────────────────────────────────
  const renderVideo = ({ item }: { item: VideoMarketing }) => {
    const cat = catLabel(item.categoria)
    const bajandoShare = descargando[item.id]
    const bajandoSave  = descargando[`save_${item.id}`]

    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity style={s.thumbWrap} onPress={() => abrirVideo(item.video_url)} activeOpacity={0.85}>
          {item.thumbnail_url
            ? <Image source={{ uri: item.thumbnail_url }} style={s.thumb} resizeMode="cover" />
            : <View style={[s.thumbPlaceholder, { backgroundColor: c.bg }]}><Text style={s.thumbIcon}>🎬</Text></View>
          }
          <View style={s.playOverlay}>
            <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
          </View>
          <View style={s.catBadge}>
            <Text style={s.catBadgeTxt}>{cat.emoji} {cat.label}</Text>
          </View>
        </TouchableOpacity>

        <View style={s.info}>
          <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>{item.titulo}</Text>
          {item.descripcion
            ? <Text style={[s.desc, { color: c.textSub }]} numberOfLines={2}>{item.descripcion}</Text>
            : null}
          <Text style={[s.fecha, { color: c.textMute }]}>
            {new Date(item.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          <View style={s.acciones}>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#1a6470' }]}
              onPress={() => guardarEnGaleria(item.id, item.video_url, item.titulo)}
              disabled={bajandoSave || bajandoShare}
            >
              {bajandoSave
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="download-outline" size={16} color="#fff" />}
              <Text style={s.btnTxt}>{bajandoSave ? 'Guardando…' : 'Guardar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: '#25D366' }]}
              onPress={() => compartir(item.id, item.video_url, item.titulo)}
              disabled={bajandoShare || bajandoSave}
            >
              {bajandoShare
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="share-outline" size={16} color="#fff" />}
              <Text style={s.btnTxt}>{bajandoShare ? 'Preparando…' : 'Compartir'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── Sección de videos de propiedades ─────────────────────────
  const PropVideosSection = () => {
    if (propVideos.length === 0) return null
    return (
      <View style={{ marginBottom: 8 }}>
        <View style={[s.seccionHeader, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={s.seccionEmoji}>🏠</Text>
          <View>
            <Text style={[s.seccionTitulo, { color: c.text }]}>Videos de propiedades</Text>
            <Text style={[s.seccionSub, { color: c.textSub }]}>
              {propVideos.length} propiedad{propVideos.length !== 1 ? 'es' : ''} con video
            </Text>
          </View>
        </View>

        {propVideos.map(prop => {
          const portada = [...(prop.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
          const bajandoShare = descargando[`prop_${prop.id}`]
          const bajandoSave  = descargando[`save_prop_${prop.id}`]

          return (
            <View key={prop.id} style={[s.propCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {/* Thumbnail con overlay de play */}
              <TouchableOpacity
                style={s.propThumbWrap}
                onPress={() => abrirVideo(prop.video_url)}
                activeOpacity={0.85}
              >
                {portada
                  ? <Image source={{ uri: portada.url }} style={s.propThumb} resizeMode="cover" />
                  : <View style={[s.thumbPlaceholder, { backgroundColor: c.bg, height: 160 }]}><Text style={s.thumbIcon}>🏠</Text></View>
                }
                {/* Oscurece el fondo para que el play se vea bien */}
                <View style={[s.playOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                  <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.95)" />
                </View>
                {/* Badge "VIDEO" */}
                <View style={s.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  <Text style={s.videoBadgeTxt}>VIDEO</Text>
                </View>
              </TouchableOpacity>

              {/* Info y acciones */}
              <View style={s.propInfo}>
                <Text style={[s.propCodigo, { color: c.textMute }]}>{prop.codigo}</Text>
                <Text style={[s.propTitulo, { color: c.text }]} numberOfLines={2}>{prop.titulo}</Text>
                {prop.precio ? (
                  <Text style={[s.propPrecio, { color: '#1a6470' }]}>{formatPrecio(prop.precio)}</Text>
                ) : null}

                <View style={s.propAcciones}>
                  {/* Ver propiedad */}
                  <TouchableOpacity
                    style={[s.propBtn, { backgroundColor: '#1a6470', flex: 1.4 }]}
                    onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${prop.id}`)}
                  >
                    <Ionicons name="home-outline" size={14} color="#fff" />
                    <Text style={s.btnTxt}>Ver propiedad</Text>
                  </TouchableOpacity>

                  {/* Guardar */}
                  <TouchableOpacity
                    style={[s.propBtn, { backgroundColor: '#455A64' }]}
                    onPress={() => guardarEnGaleria(`prop_${prop.id}`, prop.video_url, prop.titulo)}
                    disabled={bajandoSave || bajandoShare}
                  >
                    {bajandoSave
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="download-outline" size={14} color="#fff" />}
                  </TouchableOpacity>

                  {/* Compartir */}
                  <TouchableOpacity
                    style={[s.propBtn, { backgroundColor: '#25D366' }]}
                    onPress={() => compartir(`prop_${prop.id}`, prop.video_url, prop.titulo)}
                    disabled={bajandoShare || bajandoSave}
                  >
                    {bajandoShare
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="share-outline" size={14} color="#fff" />}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  // ── Header del FlatList de marketing ─────────────────────────
  const MktHeader = () => {
    if (filtro === 'todos' && videos.length === 0 && propVideos.length === 0) return null
    return (
      <>
        <PropVideosSection />
        {(filtro === 'todos' ? videos.length > 0 : filtrados.length > 0 || videos.length > 0) && (
          <View style={[s.seccionHeader, { backgroundColor: c.card, borderColor: c.border, marginBottom: 0 }]}>
            <Text style={s.seccionEmoji}>🎬</Text>
            <View>
              <Text style={[s.seccionTitulo, { color: c.text }]}>Videos de marketing</Text>
              <Text style={[s.seccionSub, { color: c.textSub }]}>Para stories, reels y compartir con clientes</Text>
            </View>
          </View>
        )}
      </>
    )
  }

  const hayContenido = videos.length > 0 || propVideos.length > 0

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={[s.headerTitle, { color: c.text }]}>🎬 Videos</Text>
        <Text style={[s.headerSub, { color: c.textSub }]}>
          Descarga y comparte con tus clientes o en tus stories
        </Text>
      </View>

      {/* Filtro de categorías — solo aplica a marketing */}
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
          data={filtro === 'todos' ? videos : filtrados}
          keyExtractor={v => v.id}
          renderItem={renderVideo}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={<MktHeader />}
          ListEmptyComponent={
            !hayContenido ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🎬</Text>
                <Text style={[s.emptyTitle, { color: c.text }]}>Sin videos todavía</Text>
                <Text style={[s.emptyDesc, { color: c.textSub }]}>
                  Los administradores aún no han subido videos.
                </Text>
              </View>
            ) : filtro !== 'todos' && filtrados.length === 0 ? (
              <View style={[s.empty, { paddingTop: 32 }]}>
                <Text style={[s.emptyTitle, { color: c.text }]}>Sin videos en "{catLabel(filtro).label}"</Text>
                <Text style={[s.emptyDesc, { color: c.textSub }]}>Prueba con otra categoría.</Text>
              </View>
            ) : null
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

  // Sección header
  seccionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, marginBottom: 12,
    borderRadius: 12, borderWidth: 1,
  },
  seccionEmoji: { fontSize: 26 },
  seccionTitulo: { fontSize: 15, fontWeight: '700' },
  seccionSub: { fontSize: 12, marginTop: 1 },

  // Card de marketing
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

  // Cards de propiedades
  propCard: {
    borderRadius: 14, borderWidth: 1,
    marginBottom: 14, overflow: 'hidden',
  },
  propThumbWrap: { position: 'relative', height: 160 },
  propThumb: { width: '100%', height: 160 },
  videoBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(26,100,112,0.9)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  videoBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  propInfo: { padding: 12 },
  propCodigo: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  propTitulo: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  propPrecio: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  propAcciones: { flexDirection: 'row', gap: 8 },
  propBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 9,
  },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
})
