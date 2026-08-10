import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
  ScrollView, Platform, Image,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
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
  { value: 'reel',         label: 'Reel / Story',       emoji: '🎬' },
  { value: 'presentacion', label: 'Presentación',        emoji: '🏢' },
  { value: 'tour',         label: 'Tour de propiedad',   emoji: '🏠' },
  { value: 'motivacional', label: 'Motivacional',        emoji: '💪' },
  { value: 'otro',         label: 'Otro',                emoji: '📁' },
]

function catLabel(v: string) {
  return CATEGORIAS.find(c => c.value === v) ?? { label: v, emoji: '📁' }
}

export default function VideosMarketing() {
  const c = useColors()
  const [videos, setVideos] = useState<VideoMarketing[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  // Form de nuevo video
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('reel')
  const [videoFile, setVideoFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null)
  const [thumbFile, setThumbFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState('')

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

  async function pickVideo() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true })
    if (result.canceled || !result.assets?.[0]) return
    const a = result.assets[0]
    setVideoFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'video/mp4' })
  }

  async function pickThumb() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const a = result.assets[0]
    setThumbFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'image/jpeg' })
  }

  async function subirVideo() {
    if (!titulo.trim()) { alert('El título es requerido.'); return }
    if (!videoFile) { alert('Selecciona un video.'); return }

    setSubiendo(true)
    try {
      const { data: { user } } = await getUsuarioActual()
      if (!user) throw new Error('No autenticado')

      const ts = Date.now()
      const ext = videoFile.name.split('.').pop() ?? 'mp4'
      const videoPath = `${user.id}/${ts}.${ext}`

      // Subir video
      setProgreso('Subiendo video…')
      const videoBlob = await fetch(videoFile.uri).then(r => r.blob())
      const { error: errVideo } = await supabase.storage
        .from('videos-marketing')
        .upload(videoPath, videoBlob, { contentType: videoFile.mimeType, upsert: false })
      if (errVideo) throw errVideo

      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('videos-marketing')
        .getPublicUrl(videoPath)

      // Subir thumbnail (opcional)
      let thumbnailUrl: string | null = null
      if (thumbFile) {
        setProgreso('Subiendo portada…')
        const thumbExt = thumbFile.name.split('.').pop() ?? 'jpg'
        const thumbPath = `thumbnails/${user.id}/${ts}.${thumbExt}`
        const thumbBlob = await fetch(thumbFile.uri).then(r => r.blob())
        const { error: errThumb } = await supabase.storage
          .from('videos-marketing')
          .upload(thumbPath, thumbBlob, { contentType: thumbFile.mimeType, upsert: false })
        if (!errThumb) {
          const { data: { publicUrl } } = supabase.storage
            .from('videos-marketing')
            .getPublicUrl(thumbPath)
          thumbnailUrl = publicUrl
        }
      }

      setProgreso('Guardando…')
      const { error: errDB } = await supabase.from('videos_marketing').insert({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        categoria,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        subido_por: user.id,
      })
      if (errDB) throw errDB

      resetForm()
      setModalVisible(false)
      cargar()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo subir el video.')
    } finally {
      setSubiendo(false)
      setProgreso('')
    }
  }

  async function eliminar(video: VideoMarketing) {
    const ok = Platform.OS === 'web'
      ? window.confirm(`¿Eliminar "${video.titulo}"?`)
      : await new Promise<boolean>(r =>
          Alert.alert('Eliminar', `¿Eliminar "${video.titulo}"?`, [
            { text: 'Cancelar', style: 'cancel', onPress: () => r(false) },
            { text: 'Eliminar', style: 'destructive', onPress: () => r(true) },
          ])
        )
    if (!ok) return
    setEliminandoId(video.id)
    await supabase.from('videos_marketing').update({ activo: false }).eq('id', video.id)
    setEliminandoId(null)
    setVideos(prev => prev.filter(v => v.id !== video.id))
  }

  function resetForm() {
    setTitulo(''); setDescripcion(''); setCategoria('reel')
    setVideoFile(null); setThumbFile(null)
  }

  const renderVideo = ({ item }: { item: VideoMarketing }) => {
    const cat = catLabel(item.categoria)
    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.cardThumb}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={s.thumb} resizeMode="cover" />
          ) : (
            <View style={[s.thumbPlaceholder, { backgroundColor: c.bg }]}>
              <Text style={s.thumbIcon}>🎬</Text>
            </View>
          )}
          <View style={s.catBadge}>
            <Text style={s.catBadgeTxt}>{cat.emoji} {cat.label}</Text>
          </View>
        </View>
        <View style={s.cardInfo}>
          <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={2}>{item.titulo}</Text>
          {item.descripcion ? (
            <Text style={[s.cardDesc, { color: c.textSub }]} numberOfLines={2}>{item.descripcion}</Text>
          ) : null}
          <Text style={[s.cardDate, { color: c.textMute }]}>
            {new Date(item.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={() => eliminar(item)}
          disabled={eliminandoId === item.id}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {eliminandoId === item.id
            ? <ActivityIndicator size="small" color="#ef4444" />
            : <Ionicons name="trash-outline" size={20} color="#ef4444" />
          }
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={[s.headerTitle, { color: c.text }]}>🎬 Videos de marketing</Text>
        <Text style={[s.headerSub, { color: c.textSub }]}>
          {videos.length} video{videos.length !== 1 ? 's' : ''} disponibles para prospectadores
        </Text>
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={v => v.id}
          renderItem={renderVideo}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎬</Text>
              <Text style={[s.emptyTitle, { color: c.text }]}>Sin videos todavía</Text>
              <Text style={[s.emptyDesc, { color: c.textSub }]}>
                Sube reels y contenido para que los prospectadores los compartan con sus clientes.
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => { resetForm(); setModalVisible(true) }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal nuevo video */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !subiendo && setModalVisible(false)}>
        <View style={[s.modalContainer, { backgroundColor: c.bg }]}>
          <View style={[s.modalHeader, { borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={() => !subiendo && setModalVisible(false)} disabled={subiendo}>
              <Text style={[s.modalCancel, { color: subiendo ? c.textMute : '#ef4444' }]}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: c.text }]}>Nuevo video</Text>
            <TouchableOpacity onPress={subirVideo} disabled={subiendo}>
              {subiendo
                ? <ActivityIndicator size="small" color="#1a6470" />
                : <Text style={s.modalSave}>Subir</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {progreso ? (
              <View style={[s.progresoBar, { backgroundColor: c.card }]}>
                <ActivityIndicator size="small" color="#1a6470" />
                <Text style={[s.progresoTxt, { color: c.textSub }]}>{progreso}</Text>
              </View>
            ) : null}

            <View>
              <Text style={[s.label, { color: c.textSub }]}>Título *</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="Ej. Reel Zibatá agosto 2026"
                placeholderTextColor={c.textMute}
                value={titulo}
                onChangeText={setTitulo}
                editable={!subiendo}
              />
            </View>

            <View>
              <Text style={[s.label, { color: c.textSub }]}>Descripción</Text>
              <TextInput
                style={[s.input, s.inputMulti, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="Descripción opcional del video…"
                placeholderTextColor={c.textMute}
                value={descripcion}
                onChangeText={setDescripcion}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!subiendo}
              />
            </View>

            <View>
              <Text style={[s.label, { color: c.textSub }]}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CATEGORIAS.map(cat => (
                    <TouchableOpacity
                      key={cat.value}
                      style={[s.catChip, categoria === cat.value && s.catChipActive]}
                      onPress={() => !subiendo && setCategoria(cat.value)}
                    >
                      <Text style={[s.catChipTxt, categoria === cat.value && s.catChipTxtActive]}>
                        {cat.emoji} {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <TouchableOpacity
              style={[s.pickBtn, { backgroundColor: c.card, borderColor: videoFile ? '#1a6470' : c.border }]}
              onPress={pickVideo}
              disabled={subiendo}
            >
              <Ionicons name={videoFile ? 'checkmark-circle' : 'videocam-outline'} size={22} color={videoFile ? '#1a6470' : c.textSub} />
              <View style={{ flex: 1 }}>
                <Text style={[s.pickBtnTitle, { color: videoFile ? '#1a6470' : c.text }]}>
                  {videoFile ? 'Video seleccionado' : 'Seleccionar video *'}
                </Text>
                {videoFile && (
                  <Text style={[s.pickBtnSub, { color: c.textSub }]} numberOfLines={1}>{videoFile.name}</Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.pickBtn, { backgroundColor: c.card, borderColor: thumbFile ? '#c9a84c' : c.border }]}
              onPress={pickThumb}
              disabled={subiendo}
            >
              <Ionicons name={thumbFile ? 'checkmark-circle' : 'image-outline'} size={22} color={thumbFile ? '#c9a84c' : c.textSub} />
              <View style={{ flex: 1 }}>
                <Text style={[s.pickBtnTitle, { color: thumbFile ? '#c9a84c' : c.text }]}>
                  {thumbFile ? 'Portada seleccionada' : 'Seleccionar portada (opcional)'}
                </Text>
                {thumbFile && (
                  <Text style={[s.pickBtnSub, { color: c.textSub }]} numberOfLines={1}>{thumbFile.name}</Text>
                )}
              </View>
            </TouchableOpacity>

            <Text style={[s.hint, { color: c.textMute }]}>
              Formatos soportados: MP4, MOV, WEBM. Máximo 500 MB por video.{'\n'}
              La portada aparece como miniatura en la app del prospectador.
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    marginBottom: 12, overflow: 'hidden',
  },
  cardThumb: { width: 90, height: 90, position: 'relative' },
  thumb: { width: 90, height: 90 },
  thumbPlaceholder: {
    width: 90, height: 90,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbIcon: { fontSize: 32 },
  catBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
  },
  catBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '600' },
  cardInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { fontSize: 12, marginBottom: 4, lineHeight: 16 },
  cardDate: { fontSize: 11 },
  deleteBtn: { padding: 14 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1a6470',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalCancel: { fontSize: 15 },
  modalSave: { fontSize: 15, fontWeight: '700', color: '#1a6470' },
  progresoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10,
  },
  progresoTxt: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15,
  },
  inputMulti: { minHeight: 80, paddingTop: 11 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: 'transparent',
  },
  catChipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  catChipTxt: { fontSize: 13, color: '#555', fontWeight: '500' },
  catChipTxtActive: { color: '#fff' },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1.5,
  },
  pickBtnTitle: { fontSize: 14, fontWeight: '600' },
  pickBtnSub: { fontSize: 12, marginTop: 2 },
  hint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
