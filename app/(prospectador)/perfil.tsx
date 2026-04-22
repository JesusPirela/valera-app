import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert, Image,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

const COLORES_PRESET = [
  { label: 'Verde Valera',  valor: '#1a6470' },
  { label: 'Dorado',        valor: '#c9a84c' },
  { label: 'Azul marino',   valor: '#1e3a5f' },
  { label: 'Vino',          valor: '#7b1e3a' },
  { label: 'Verde bosque',  valor: '#2d6a4f' },
  { label: 'Gris elegante', valor: '#4a4a4a' },
  { label: 'Morado',        valor: '#5c3d99' },
  { label: 'Naranja',       valor: '#c45c1a' },
]

const AVATARES_PRESET = ['👤','🏠','⭐','🦁','🐯','🦊','🦅','🌟','💼','🚀','🎯','💎']

function mostrarAlerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function Perfil() {
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [userId, setUserId] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarEmoji, setAvatarEmoji] = useState('👤')
  const [colorAcento, setColorAcento] = useState('#1a6470')
  const [email, setEmail] = useState('')

  const fileRef = useRef<any>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setEmail(user.email ?? '')

    const { data } = await supabase
      .from('profiles')
      .select('nombre, telefono, avatar_url, color_acento')
      .eq('id', user.id)
      .single()

    if (data) {
      setNombre(data.nombre ?? '')
      setTelefono(data.telefono ?? '')
      setAvatarUrl(data.avatar_url ?? null)
      setColorAcento(data.color_acento ?? '#1a6470')
      // Si el avatar_url es un emoji (guardado como 'emoji:X')
      if (data.avatar_url?.startsWith('emoji:')) {
        setAvatarEmoji(data.avatar_url.replace('emoji:', ''))
        setAvatarUrl(null)
      }
    }
    setLoading(false)
  }

  async function subirFoto(file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { data, error } = await supabase.storage
      .from('avatares')
      .upload(path, file, { upsert: true })
    if (error) { mostrarAlerta('Error al subir foto: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('avatares').getPublicUrl(data.path)
    return publicUrl
  }

  async function guardar(nuevoAvatarUrl?: string | null) {
    if (!nombre.trim()) { mostrarAlerta('El nombre es obligatorio'); return }
    setGuardando(true)
    try {
      const avatarFinal = nuevoAvatarUrl !== undefined
        ? nuevoAvatarUrl
        : (avatarUrl ?? `emoji:${avatarEmoji}`)

      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          avatar_url: avatarFinal,
          color_acento: colorAcento,
        })
        .eq('id', userId)

      if (error) throw error
      mostrarAlerta('¡Perfil actualizado!')
      cargar()
    } catch (e: any) {
      mostrarAlerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  function seleccionarEmoji(emoji: string) {
    setAvatarEmoji(emoji)
    setAvatarUrl(null)
  }

  const avatarMostrado = avatarUrl ?? null

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Avatar */}
      <View style={[s.headerBg, { backgroundColor: colorAcento }]}>
        <View style={s.avatarWrap}>
          {avatarMostrado ? (
            <Image source={{ uri: avatarMostrado }} style={s.avatarImg} />
          ) : (
            <View style={[s.avatarEmoji, { backgroundColor: colorAcento + 'cc' }]}>
              <Text style={s.avatarEmojiText}>{avatarEmoji}</Text>
            </View>
          )}
        </View>
        <Text style={s.emailText}>{email}</Text>
      </View>

      <View style={s.body}>
        {/* Info básica */}
        <Text style={s.seccion}>INFORMACIÓN BÁSICA</Text>

        <Text style={s.label}>Nombre completo</Text>
        <TextInput
          style={s.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Tu nombre"
        />

        <Text style={s.label}>Teléfono</Text>
        <TextInput
          style={s.input}
          value={telefono}
          onChangeText={setTelefono}
          placeholder="+52 000 000 0000"
          keyboardType="phone-pad"
        />

        {/* Avatar */}
        <Text style={s.seccion}>AVATAR</Text>

        <Text style={s.label}>Avatares prediseñados</Text>
        <View style={s.emojiGrid}>
          {AVATARES_PRESET.map(e => (
            <TouchableOpacity
              key={e}
              style={[s.emojiBtn, avatarEmoji === e && !avatarMostrado && { borderColor: colorAcento, borderWidth: 3 }]}
              onPress={() => seleccionarEmoji(e)}
            >
              <Text style={s.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Subir foto */}
        <Text style={s.label}>O sube tu foto de perfil</Text>
        {Platform.OS === 'web' && (
          <>
            {/* @ts-ignore */}
            <input
              type="file"
              accept="image/*"
              ref={fileRef}
              style={{ display: 'none' }}
              onChange={async (e: any) => {
                const file = e.target.files?.[0]
                if (!file) return
                setGuardando(true)
                const url = await subirFoto(file)
                if (url) {
                  setAvatarUrl(url)
                  await guardar(url)
                }
                setGuardando(false)
              }}
            />
            <TouchableOpacity
              style={[s.btnFoto, { borderColor: colorAcento }]}
              onPress={() => fileRef.current?.click()}
            >
              <Text style={[s.btnFotoText, { color: colorAcento }]}>
                {avatarMostrado ? '🔄 Cambiar foto' : '📷 Subir foto'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Color de acento */}
        <Text style={s.seccion}>COLOR DE LA APLICACIÓN</Text>
        <Text style={s.label}>Elige tu color principal</Text>
        <View style={s.coloresGrid}>
          {COLORES_PRESET.map(c => (
            <TouchableOpacity
              key={c.valor}
              style={[
                s.colorBtn,
                { backgroundColor: c.valor },
                colorAcento === c.valor && s.colorBtnActivo,
              ]}
              onPress={() => setColorAcento(c.valor)}
            >
              {colorAcento === c.valor && <Text style={s.colorCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <View style={[s.colorPreview, { backgroundColor: colorAcento }]}>
          <Text style={s.colorPreviewText}>Vista previa del color seleccionado</Text>
        </View>

        {/* Guardar */}
        <TouchableOpacity
          style={[s.btnGuardar, { backgroundColor: colorAcento }, guardando && { opacity: 0.6 }]}
          onPress={() => guardar()}
          disabled={guardando}
        >
          {guardando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnGuardarText}>💾 Guardar perfil</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  headerBg: { alignItems: 'center', paddingTop: 30, paddingBottom: 24 },
  avatarWrap: { marginBottom: 10 },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#fff' },
  avatarEmoji: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  avatarEmojiText: { fontSize: 44 },
  emailText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  body: { padding: 20 },
  seccion: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#dde8e9', padding: 12, fontSize: 15, color: '#1a1a2e', marginBottom: 14,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  emojiBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#dde8e9',
  },
  emojiBtnText: { fontSize: 26 },
  btnFoto: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  btnFotoText: { fontSize: 14, fontWeight: '700' },
  coloresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  colorBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  colorBtnActivo: { transform: [{ scale: 1.2 }], elevation: 4 },
  colorCheck: { color: '#fff', fontSize: 18, fontWeight: '900' },
  colorPreview: { borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 24 },
  colorPreviewText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnGuardar: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
