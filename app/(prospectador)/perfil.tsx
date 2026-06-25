import { useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert, Image,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { useTheme, useColors } from '../../lib/ThemeContext'
import ToggleSwitch from '../../components/ToggleSwitch'
import CambiarCuenta from '../../components/CambiarCuenta'
import { getUserStats, calcularNivel, infoNivel, tituloPorNivel, type UserStats } from '../../lib/gamification'

const COLORES_LIBRES = [
  '#1a6470', '#c9a84c', '#1e3a5f', '#7b1e3a',
  '#2d6a4f', '#4a4a4a', '#5c3d99', '#c45c1a',
]
const COLORES_PREMIUM = [
  '#c2185b', '#e64a19', '#00838f', '#558b2f',
  '#283593', '#ff6f00', '#006064', '#4a148c',
  '#37474f', '#1b5e20', '#880e4f', '#bf360c',
]

const AVATARES_LIBRES  = ['👤','🏠','⭐','🦁','🐯','🦊','🦅','🌟','💼','🚀','🎯','💎']

const NOTO = (hex: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`

type AvatarPremium = { emoji: string; gif: string; nombre: string }
const AVATARES_PREMIUM: AvatarPremium[] = [
  { emoji: '🔥', gif: NOTO('1f525'), nombre: 'Fuego'        },
  { emoji: '⚡', gif: NOTO('26a1'),  nombre: 'Rayo'         },
  { emoji: '🌈', gif: NOTO('1f308'), nombre: 'Arcoíris'     },
  { emoji: '🦋', gif: NOTO('1f98b'), nombre: 'Mariposa'     },
  { emoji: '🐉', gif: NOTO('1f409'), nombre: 'Dragón'       },
  { emoji: '🦄', gif: NOTO('1f984'), nombre: 'Unicornio'    },
  { emoji: '👑', gif: NOTO('1f451'), nombre: 'Corona'       },
  { emoji: '💫', gif: NOTO('1f4ab'), nombre: 'Destello'     },
  { emoji: '🌸', gif: NOTO('1f338'), nombre: 'Cerezo'       },
  { emoji: '🔮', gif: NOTO('1f52e'), nombre: 'Bola mágica'  },
  { emoji: '🌊', gif: NOTO('1f30a'), nombre: 'Ola'          },
  { emoji: '🏆', gif: NOTO('1f3c6'), nombre: 'Trofeo'       },
  { emoji: '🎉', gif: NOTO('1f389'), nombre: 'Fiesta'       },
  { emoji: '✨', gif: NOTO('2728'),  nombre: 'Brillos'      },
  { emoji: '🦁', gif: NOTO('1f981'), nombre: 'León'         },
  { emoji: '🐺', gif: NOTO('1f43a'), nombre: 'Lobo'         },
]

// Mapa rápido emoji → GIF para el header
const GIF_MAP: Record<string, string> = Object.fromEntries(
  AVATARES_PREMIUM.map(a => [a.emoji, a.gif])
)

function mostrarAlerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

type AvatarGridProps = {
  avatarsDesbloqueados: string[]
  avatarEmoji: string
  avatarMostrado: string | null
  comprando: string | null
  gifsFallidos: Set<string>
  seleccionarEmoji: (e: string) => void
  comprarItem: (tipo: string, valor: string) => void
  onGifError: (e: string) => void
}
const AvatarGrid = memo(function AvatarGrid({
  avatarsDesbloqueados, avatarEmoji, avatarMostrado, comprando,
  gifsFallidos, seleccionarEmoji, comprarItem, onGifError,
}: AvatarGridProps) {
  return (
    <View style={s.emojiGrid}>
      {AVATARES_PREMIUM.map(({ emoji: e, gif, nombre }) => {
        const desbloqueado = avatarsDesbloqueados.includes(e)
        const seleccionado = avatarEmoji === e && !avatarMostrado
        const enCompra = comprando === e
        return (
          <TouchableOpacity
            key={e}
            style={[
              s.emojiBtn,
              desbloqueado
                ? { backgroundColor: '#1a1200', borderColor: '#c9a84c88' }
                : { backgroundColor: '#f5f5f5', borderColor: '#ddd', opacity: 0.6 },
              seleccionado && desbloqueado && { borderColor: '#c9a84c', borderWidth: 3 },
            ]}
            onPress={() => {
              if (desbloqueado) { seleccionarEmoji(e); return }
              comprarItem('avatar', e)
            }}
            disabled={enCompra}
          >
            {desbloqueado && !gifsFallidos.has(e) ? (
              <Image
                source={{ uri: gif }}
                style={{ width: 38, height: 38 }}
                resizeMode="contain"
                onError={() => onGifError(e)}
              />
            ) : (
              <Text style={s.emojiBtnText}>{e}</Text>
            )}
            {enCompra && (
              <View style={s.lockOverlay}>
                <ActivityIndicator size="small" color="#c9a84c" />
              </View>
            )}
            {!desbloqueado && !enCompra && (
              <View style={s.lockOverlay}>
                <Text style={s.lockIcon}>🔒</Text>
              </View>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
})

export default function Perfil() {
  const { setPrimaryColor, darkMode, toggleDarkMode, fontScaleCap, toggleFontScaleCap } = useTheme()
  const c = useColors()

  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [comprando, setComprando] = useState<string | null>(null)
  const [coloresDesbloqueados, setColoresDesbloqueados] = useState<string[]>([])
  const [avatarsDesbloqueados, setAvatarsDesbloqueados] = useState<string[]>([])
  const [gifsFallidos, setGifsFallidos] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState('')
  const [nombre, setNombre] = useState('')
  const [stats, setStats] = useState<UserStats | null>(null)
  const [telefono, setTelefono] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarEmoji, setAvatarEmoji] = useState('👤')
  const [colorAcento, setColorAcento] = useState('#1a6470')
  const [email, setEmail] = useState('')
  const fileRef = useRef<any>(null)

  // Inyectar keyframes CSS para animaciones de avatares premium en web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    if (document.getElementById('perfil-premium-anim')) return
    const s = document.createElement('style')
    s.id = 'perfil-premium-anim'
    s.textContent = `
      @keyframes av-bounce  {0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @keyframes av-flash   {0%,90%,100%{opacity:1}45%{opacity:0.2}}
      @keyframes av-spin    {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
      @keyframes av-flutter {0%,100%{transform:rotate(0deg) scaleX(1)}25%{transform:rotate(-15deg) scaleX(0.7)}75%{transform:rotate(15deg) scaleX(0.7)}}
      @keyframes av-roar    {0%,100%{transform:scale(1)}30%{transform:scale(1.3) rotate(-5deg)}60%{transform:scale(1.3) rotate(5deg)}}
      @keyframes av-jump    {0%,100%{transform:translateY(0) scaleY(1)}40%{transform:translateY(-12px) scaleY(1.1)}90%{transform:translateY(0) scaleY(0.85)}}
      @keyframes av-shimmer {0%,100%{filter:brightness(1)}50%{filter:brightness(1.5) drop-shadow(0 0 6px gold)}}
      @keyframes av-orbit   {0%{transform:rotate(0deg) translateX(4px) rotate(0deg)}100%{transform:rotate(360deg) translateX(4px) rotate(-360deg)}}
      @keyframes av-wobble  {0%,100%{transform:rotate(0deg)}20%{transform:rotate(-15deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(5deg)}}
      @keyframes av-sway    {0%,100%{transform:rotate(0deg) translateY(0)}50%{transform:rotate(10deg) translateY(-4px)}}
      @keyframes av-pulse   {0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
      @keyframes av-wave    {0%,100%{transform:skewX(0deg)}25%{transform:skewX(-10deg)}75%{transform:skewX(10deg)}}
      @keyframes av-float   {0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes av-twinkle {0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.3) rotate(180deg)}}
      @keyframes av-shake   {0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
    `
    document.head.appendChild(s)
  }, [])


  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setEmail(user.email ?? '')

    const [{ data }, statsData] = await Promise.all([
      supabase.from('profiles').select('nombre, telefono, avatar_url, color_acento, colores_desbloqueados, avatares_desbloqueados').eq('id', user.id).single(),
      getUserStats(user.id),
    ])
    setStats(statsData)

    if (data) {
      setNombre(data.nombre ?? '')
      setTelefono(data.telefono ?? '')
      setColorAcento(data.color_acento ?? '#1a6470')
      setColoresDesbloqueados((data as any).colores_desbloqueados ?? [])
      setAvatarsDesbloqueados((data as any).avatares_desbloqueados ?? [])
      if (data.avatar_url?.startsWith('emoji:')) {
        setAvatarEmoji(data.avatar_url.replace('emoji:', ''))
        setAvatarUrl(null)
      } else {
        setAvatarUrl(data.avatar_url ?? null)
      }
    }
    setLoading(false)
  }

  async function comprarItem(tipo: 'color' | 'avatar', valor: string) {
    if (comprando) return
    const label = tipo === 'color' ? `el color ${valor}` : `el avatar ${valor}`
    const confirmar = Platform.OS === 'web'
      ? window.confirm(`¿Desbloquear ${label} por 500 Valera Coins?`)
      : await new Promise<boolean>(r => Alert.alert('Desbloquear', `¿Desbloquear ${label} por 500 Valera Coins?`,
          [{ text: 'Cancelar', style: 'cancel', onPress: () => r(false) }, { text: 'Comprar', onPress: () => r(true) }]))
    if (!confirmar) return
    setComprando(valor)
    const { data, error } = await supabase.rpc('desbloquear_item_perfil', { p_tipo: tipo, p_valor: valor })
    setComprando(null)
    if (error || !data?.ok) {
      mostrarAlerta(data?.error ?? error?.message ?? 'Error al desbloquear')
      return
    }
    if (tipo === 'color') setColoresDesbloqueados(prev => [...prev, valor])
    else setAvatarsDesbloqueados(prev => [...prev, valor])
    mostrarAlerta(`¡Desbloqueado! Te quedan ${data.coins_restantes} Valera Coins 🎉`)
  }

  async function subirArchivo(payload: ArrayBuffer | File, mimeType: string, ext: string): Promise<string | null> {
    const path = `${userId}/avatar.${ext}`
    const { data, error } = await supabase.storage
      .from('avatares')
      .upload(path, payload, { upsert: true, contentType: mimeType })
    if (error) { mostrarAlerta('Error al subir foto: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('avatares').getPublicUrl(data.path)
    return publicUrl
  }

  async function subirFotoNativa(uri: string, mimeType: string): Promise<string | null> {
    try {
      const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
      const arraybuffer = await fetch(uri).then(r => r.arrayBuffer())
      return subirArchivo(arraybuffer, mimeType, ext)
    } catch (e: any) {
      mostrarAlerta('Error al procesar la imagen: ' + e.message)
      return null
    }
  }

  async function subirFotoWeb(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    return subirArchivo(file, file.type, ext)
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
      setPrimaryColor(colorAcento)
      mostrarAlerta('¡Perfil actualizado!')
      cargar()
    } catch (e: any) {
      mostrarAlerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function seleccionarFoto() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        mostrarAlerta('Necesitamos permiso para acceder a tu galería.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      })
      if (!result.canceled) {
        const asset = result.assets[0]
        setGuardando(true)
        const mimeType = asset.mimeType ?? 'image/jpeg'
        const url = await subirFotoNativa(asset.uri, mimeType)
        if (url) {
          setAvatarUrl(url)
          await guardar(url)
        }
        setGuardando(false)
      }
    } else {
      fileRef.current?.click()
    }
  }

  function seleccionarEmoji(emoji: string) {
    setAvatarEmoji(emoji)
    setAvatarUrl(null)
  }

  const handleGifError = useCallback((e: string) => {
    setGifsFallidos(prev => new Set([...prev, e]))
  }, [])

  const avatarMostrado = avatarUrl ?? null

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />

  return (
    <ScrollView style={[s.container, darkMode && { backgroundColor: '#0d1b2a' }]} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Avatar */}
      <View style={[s.headerBg, { backgroundColor: colorAcento }]}>
        <View style={s.avatarWrap}>
          {avatarMostrado ? (
            <Image source={{ uri: avatarMostrado }} style={s.avatarImg} />
          ) : GIF_MAP[avatarEmoji] && avatarsDesbloqueados.includes(avatarEmoji) && !gifsFallidos.has(avatarEmoji) ? (
            <View style={[s.avatarEmoji, { backgroundColor: '#1a1200', borderColor: '#c9a84c' }]}>
              <Image
                source={{ uri: GIF_MAP[avatarEmoji] }}
                style={{ width: 66, height: 66 }}
                resizeMode="contain"
                onError={() => setGifsFallidos(prev => new Set([...prev, avatarEmoji]))}
              />
            </View>
          ) : (
            <View style={[s.avatarEmoji, { backgroundColor: colorAcento + 'cc' }]}>
              <Text style={s.avatarEmojiText}>{avatarEmoji}</Text>
            </View>
          )}
        </View>
        <Text style={s.emailText}>{email}</Text>
      </View>

      {/* Gamification stats */}
      {stats && (() => {
        const nivel = calcularNivel(stats.xp)
        const info = infoNivel(stats.xp)
        const titulo = tituloPorNivel(nivel)
        return (
          <View style={[s.statsCard, { backgroundColor: c.card, borderColor: colorAcento + '44' }]}>
            <View style={s.statsTop}>
              <View style={[s.nivelBadge, { backgroundColor: colorAcento }]}>
                <Text style={s.nivelNum}>{nivel}</Text>
                <Text style={s.nivelLbl}>Nv.</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.statsTitle, { color: colorAcento }]}>{titulo}</Text>
                <Text style={s.statsXP}>{stats.xp.toLocaleString()} XP totales</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${info.porcentaje}%` as any, backgroundColor: colorAcento }]} />
                </View>
                <Text style={s.barLabel}>{info.xpActual} / {info.xpNecesario} XP para nivel {nivel + 1}</Text>
              </View>
            </View>
            <View style={[s.statsRow, { borderTopColor: c.border }]}>
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: c.text }]}>💰 {stats.valera_coins.toLocaleString()}</Text>
                <Text style={[s.statLbl, { color: c.textMute }]}>Valera Coins</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: c.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: c.text }]}>🔥 {stats.streak_dias}</Text>
                <Text style={[s.statLbl, { color: c.textMute }]}>Días seguidos</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: c.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: c.text }]}>🏠 {stats.total_propiedades}</Text>
                <Text style={[s.statLbl, { color: c.textMute }]}>Propiedades</Text>
              </View>
            </View>
          </View>
        )
      })()}

      <View style={s.body}>
        {/* Info básica */}
        <Text style={s.seccion}>INFORMACIÓN BÁSICA</Text>

        <Text style={[s.label, { color: c.textSub }]}>Nombre completo</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Tu nombre"
          placeholderTextColor={c.textMute}
        />

        <Text style={[s.label, { color: c.textSub }]}>Teléfono</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          value={telefono}
          onChangeText={setTelefono}
          placeholder="+52 000 000 0000"
          placeholderTextColor={c.textMute}
          keyboardType="phone-pad"
        />

        {/* Avatar */}
        <Text style={s.seccion}>AVATAR</Text>

        <Text style={s.label}>Avatares prediseñados</Text>
        <View style={s.emojiGrid}>
          {AVATARES_LIBRES.map(e => (
            <TouchableOpacity
              key={e}
              style={[s.emojiBtn, { backgroundColor: c.card, borderColor: c.border }, avatarEmoji === e && !avatarMostrado && { borderColor: colorAcento, borderWidth: 3 }]}
              onPress={() => seleccionarEmoji(e)}
            >
              <Text style={s.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.premiumHeader}>
          <Text style={s.premiumLabel}>✨ Avatares animados</Text>
          <Text style={s.premiumTag}>500 💰 c/u</Text>
        </View>
        <AvatarGrid
          avatarsDesbloqueados={avatarsDesbloqueados}
          avatarEmoji={avatarEmoji}
          avatarMostrado={avatarMostrado}
          comprando={comprando}
          gifsFallidos={gifsFallidos}
          seleccionarEmoji={seleccionarEmoji}
          comprarItem={comprarItem}
          onGifError={handleGifError}
        />

        {/* Subir foto — funciona en web y nativo */}
        <Text style={s.label}>O sube tu foto de perfil</Text>

        {Platform.OS === 'web' && (
          // @ts-ignore
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={async (e: any) => {
              const file = e.target.files?.[0]
              if (!file) return
              setGuardando(true)
              const url = await subirFotoWeb(file)
              if (url) {
                setAvatarUrl(url)
                await guardar(url)
              }
              setGuardando(false)
            }}
          />
        )}

        <TouchableOpacity
          style={[s.btnFoto, { borderColor: colorAcento }]}
          onPress={seleccionarFoto}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color={colorAcento} />
          ) : (
            <Text style={[s.btnFotoText, { color: colorAcento }]}>
              {avatarMostrado ? '🔄 Cambiar foto' : '📷 Subir foto'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Apariencia */}
        <Text style={s.seccion}>APARIENCIA</Text>
        <View style={[s.modoRow, darkMode && { backgroundColor: '#111f2e', borderColor: '#1e3448' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.modoTitulo, darkMode && { color: '#fff' }]}>
              {darkMode ? '🌙 Modo oscuro' : '☀️ Modo claro'}
            </Text>
            <Text style={[s.modoSub, darkMode && { color: '#7a9ab5' }]}>
              {darkMode ? 'La app usa fondos oscuros' : 'La app usa fondos claros'}
            </Text>
          </View>
          <ToggleSwitch
            value={darkMode}
            onValueChange={toggleDarkMode}
            trackColor={{ false: '#dde8e9', true: colorAcento + '88' }}
            thumbColor={darkMode ? colorAcento : '#aaa'}
          />
        </View>

        <View style={[s.modoRow, darkMode && { backgroundColor: '#111f2e', borderColor: '#1e3448' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.modoTitulo, darkMode && { color: '#fff' }]}>
              📐 Ajustar tamaño de letra
            </Text>
            <Text style={[s.modoSub, darkMode && { color: '#7a9ab5' }]}>
              Si en tu celular el tamaño de letra grande hace que los botones y textos de la app se amontonen, activa esto para corregirlo.
            </Text>
          </View>
          <ToggleSwitch
            value={fontScaleCap}
            onValueChange={toggleFontScaleCap}
            trackColor={{ false: '#dde8e9', true: colorAcento + '88' }}
            thumbColor={fontScaleCap ? colorAcento : '#aaa'}
          />
        </View>

        {/* Color de acento */}
        <Text style={s.seccion}>COLOR DE LA APLICACIÓN</Text>
        <Text style={s.label}>Elige tu color principal</Text>
        <View style={s.coloresGrid}>
          {COLORES_LIBRES.map(valor => (
            <TouchableOpacity
              key={valor}
              style={[s.colorBtn, { backgroundColor: valor }, colorAcento === valor && s.colorBtnActivo]}
              onPress={() => setColorAcento(valor)}
            >
              {colorAcento === valor && <Text style={s.colorCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.premiumHeader}>
          <Text style={s.premiumLabel}>✨ Colores premium</Text>
          <Text style={s.premiumTag}>500 💰 c/u</Text>
        </View>
        <View style={s.coloresGrid}>
          {COLORES_PREMIUM.map(valor => {
            const desbloqueado = coloresDesbloqueados.includes(valor)
            const enCompra = comprando === valor
            return (
              <TouchableOpacity
                key={valor}
                style={[
                  s.colorBtn,
                  { backgroundColor: valor },
                  !desbloqueado && { opacity: 0.45 },
                  colorAcento === valor && desbloqueado && s.colorBtnActivo,
                ]}
                onPress={() => {
                  if (desbloqueado) { setColorAcento(valor); return }
                  comprarItem('color', valor)
                }}
                disabled={enCompra}
              >
                {colorAcento === valor && desbloqueado && <Text style={s.colorCheck}>✓</Text>}
                {enCompra && (
                  <View style={s.lockOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                {!desbloqueado && !enCompra && (
                  <View style={s.lockOverlay}>
                    <Text style={[s.lockIcon, { fontSize: 13 }]}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
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

        {/* Mi Actividad */}
        <TouchableOpacity
          style={s.btnActividad}
          onPress={() => router.push('/(prospectador)/mi-actividad' as any)}
        >
          <Text style={s.btnActividadText}>📊 Mi actividad — gráficas de conexión</Text>
        </TouchableOpacity>

        {/* Mi Historial */}
        <TouchableOpacity
          style={[s.btnActividad, { marginTop: 10, backgroundColor: '#1a1500', borderColor: '#c9a84c' }]}
          onPress={() => router.push('/(prospectador)/mi-historial' as any)}
        >
          <Text style={[s.btnActividadText, { color: '#c9a84c' }]}>🏆 Mi historial — estadísticas de toda la vida</Text>
        </TouchableOpacity>

        {/* Cambiar de cuenta (solo si hay 2+ guardadas) */}
        <CambiarCuenta />

        {/* Cerrar sesión */}
        <TouchableOpacity
          style={s.btnSalir}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={s.btnSalirText}>Cerrar sesión</Text>
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
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  premiumLabel: { fontSize: 13, fontWeight: '700', color: '#c9a84c' },
  premiumTag: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 26 },
  lockIcon: { fontSize: 18 },
  btnFoto: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  btnFotoText: { fontSize: 14, fontWeight: '700' },
  modoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#dde8e9', marginBottom: 8,
    // darkMode override se aplica inline
  },
  modoTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  modoSub:    { fontSize: 12, color: '#888' },

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
  btnActividad: {
    marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#1a6470', backgroundColor: '#e8f5f6',
  },
  btnActividadText: { color: '#1a6470', fontWeight: '700', fontSize: 14 },
  btnSalir: { marginTop: 12, marginBottom: 32, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0' },
  btnSalirText: { color: '#e74c3c', fontWeight: '700', fontSize: 15 },

  statsCard: {
    margin: 16, marginTop: -8,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statsTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  nivelBadge: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  nivelNum: { fontSize: 20, fontWeight: '900', color: '#fff', lineHeight: 22 },
  nivelLbl: { fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  statsTitle: { fontSize: 14, fontWeight: '800', marginBottom: 1 },
  statsXP: { fontSize: 11, color: '#888', marginBottom: 6 },
  barTrack: { height: 6, backgroundColor: '#e8eef0', borderRadius: 3, overflow: 'hidden', marginBottom: 3 },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { fontSize: 10, color: '#aaa' },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 13, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  statLbl: { fontSize: 10, color: '#aaa' },
  statDivider: { width: 1, height: 32, backgroundColor: '#f0f0f0' },
})
