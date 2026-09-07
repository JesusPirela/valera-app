import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  TextInput, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, SafeAreaView, Image, Alert, Linking,
  Animated, PanResponder, Dimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'

type TarjetaEquipo = {
  nombre: string
  telefono: string | null
  publicaciones: number
  clientes_nuevos: number
  citas: number
  seguimientos: number
  interacciones: number
  mensaje: string
}

type Mensaje = {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  imagen_uri?: string
  tarjetas?: TarjetaEquipo[]
}

type ImagenPendiente = { base64: string; mimeType: string; uri: string }

function TarjetaMensaje({ t }: { t: TarjetaEquipo }) {
  const abrirWhatsApp = () => {
    if (!t.telefono) return
    const digits = t.telefono.replace(/\D/g, '')
    const tel = digits.startsWith('52') && digits.length >= 12 ? digits : `52${digits}`
    Linking.openURL(`whatsapp://send?phone=${tel}&text=${encodeURIComponent(t.mensaje)}`)
  }
  return (
    <View style={ts.tarjeta}>
      <View style={ts.tarjetaTop}>
        <Text style={ts.tarjetaNombre}>{t.nombre}</Text>
        <View style={ts.tarjetaStats}>
          <Text style={ts.stat}>📤 {t.publicaciones}</Text>
          {t.clientes_nuevos > 0 && <Text style={ts.stat}>👥 {t.clientes_nuevos}</Text>}
          {t.citas > 0 && <Text style={ts.stat}>📅 {t.citas}</Text>}
          {t.seguimientos > 0 && <Text style={ts.stat}>💬 {t.seguimientos}</Text>}
        </View>
      </View>
      <Text style={ts.tarjetaMensaje}>{t.mensaje}</Text>
      {t.telefono ? (
        <TouchableOpacity style={ts.tarjetaBtn} onPress={abrirWhatsApp} activeOpacity={0.8}>
          <Text style={ts.tarjetaBtnTxt}>Enviar por WhatsApp</Text>
        </TouchableOpacity>
      ) : (
        <Text style={ts.tarjetaSinTel}>Sin número registrado</Text>
      )}
    </View>
  )
}

const ts = StyleSheet.create({
  tarjeta: {
    backgroundColor: '#0d1b2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a4a5e',
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  tarjetaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 },
  tarjetaNombre: { color: '#f0e6c8', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  tarjetaStats: { flexDirection: 'row', gap: 8 },
  stat: { color: '#7a9aaa', fontSize: 12 },
  tarjetaMensaje: { color: '#c8dce6', fontSize: 13, lineHeight: 19 },
  tarjetaBtn: {
    backgroundColor: '#25D366',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tarjetaBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tarjetaSinTel: { color: '#5a7a8a', fontSize: 12, fontStyle: 'italic' },
})

const SUGERENCIAS = [
  '¿Cómo va el equipo hoy?',
  '¿Quién no ha publicado esta semana?',
  '¿Cómo van las misiones hoy?',
  '¿Quién lidera el ranking de XP?',
  '¿Cuántas citas hay esta semana?',
  '¿Quién tiene recordatorios vencidos?',
  'Muéstrame el ranking de publicaciones',
  '¿Cómo está el inventario?',
  '¿Cómo va Valera University?',
  '¿Cuántos leads hay sin asignar?',
  'Compara precios por zona',
  'Busca casas de 3 recámaras en venta',
  'Genera mensajes para el equipo de hoy',
]

export default function ValeraAIChatAdmin() {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [cargando, setCargando] = useState(false)
  const [imagenPendiente, setImagenPendiente] = useState<ImagenPendiente | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  // ── FAB arrastrable ────────────────────────────────────────────────────────
  // El botón estorbaba en la esquina; ahora se arrastra a donde el usuario quiera
  // (se pega al borde izq/der y recuerda la posición), y se pone semitransparente
  // en reposo para no tapar contenido. Un toque simple abre el chat.
  const FAB = 58, MARGEN = 14, TOPE = 64, PISO = 24
  const POS_KEY = 'valera_fab_pos_admin'
  const { width: W, height: H } = Dimensions.get('window')
  const posDefault = { x: W - FAB - 20, y: H - FAB - 110 }
  const pos = useRef(posDefault)
  const pan = useRef(new Animated.ValueXY(posDefault)).current
  const opacidad = useRef(new Animated.Value(1)).current
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clampX = (x: number) => Math.max(MARGEN, Math.min(W - FAB - MARGEN, x))
  const clampY = (y: number) => Math.max(TOPE, Math.min(H - FAB - PISO, y))
  const programarFade = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0.4, duration: 600, useNativeDriver: false }).start()
    }, 2800)
  }, [opacidad])
  const despertar = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    Animated.timing(opacidad, { toValue: 1, duration: 120, useNativeDriver: false }).start()
  }, [opacidad])

  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then(v => {
      if (v) {
        try {
          const p = JSON.parse(v)
          const x = clampX(p.x), y = clampY(p.y)
          pos.current = { x, y }; pan.setValue({ x, y })
        } catch { /* posición inválida: se queda el default */ }
      }
    })
    programarFade()
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current) }
  }, [])

  // En web, arrastrar el mouse selecciona el texto de la página y el botón salta.
  // Se desactiva la selección del body mientras se arrastra y se reactiva al soltar.
  const bloquearSeleccion = (bloquear: boolean) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const b: any = document.body.style
    b.userSelect = b.webkitUserSelect = b.msUserSelect = bloquear ? 'none' : ''
    b.cursor = bloquear ? 'grabbing' : ''
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    // Solo arrastra si de verdad se movió (así un toque simple abre el chat).
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      ;(e as any)?.preventDefault?.(); bloquearSeleccion(true)
      despertar(); pan.setOffset(pos.current); pan.setValue({ x: 0, y: 0 })
    },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_e, g) => {
      bloquearSeleccion(false)
      pan.flattenOffset()
      const esToque = Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5
      if (esToque) { setAbierto(true); despertar(); programarFade(); return }
      // Soltar: pegar al borde más cercano (izq/der) y mantener dentro de pantalla.
      const rawX = pos.current.x + g.dx, rawY = pos.current.y + g.dy
      const x = (rawX + FAB / 2 < W / 2) ? MARGEN : W - FAB - MARGEN
      const y = clampY(rawY)
      pos.current = { x, y }
      Animated.spring(pan, { toValue: { x, y }, useNativeDriver: false, friction: 7, tension: 60 }).start()
      AsyncStorage.setItem(POS_KEY, JSON.stringify({ x, y })).catch(() => {})
      programarFade()
    },
    onPanResponderTerminate: () => { bloquearSeleccion(false); pan.flattenOffset(); programarFade() },
  }), [W, H, despertar, programarFade])

  const scrollAbajo = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const seleccionarImagen = useCallback(async (fuente: 'camera' | 'library') => {
    if (cargando) return
    try {
      const perms = fuente === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perms.status !== 'granted') return

      const result = fuente === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 })

      if (result.canceled || !result.assets[0]) return

      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 700 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      )
      setImagenPendiente({ base64: compressed.base64!, mimeType: 'image/jpeg', uri: compressed.uri })
    } catch {}
  }, [cargando])

  const abrirPickerImagen = useCallback(() => {
    if (cargando) return
    if (Platform.OS === 'web') {
      seleccionarImagen('library')
    } else {
      Alert.alert('Adjuntar imagen', 'Elige una fuente', [
        { text: 'Cámara', onPress: () => seleccionarImagen('camera') },
        { text: 'Galería', onPress: () => seleccionarImagen('library') },
        { text: 'Cancelar', style: 'cancel' },
      ])
    }
  }, [cargando, seleccionarImagen])

  const enviar = useCallback(async (texto: string) => {
    const msg = texto.trim()
    const imgData = imagenPendiente
    if ((!msg && !imgData) || cargando) return

    setInput('')
    setImagenPendiente(null)

    const idUsuario = `u-${Date.now()}`
    setMensajes(prev => [...prev, {
      id: idUsuario,
      role: 'user',
      content: msg || '📷 Imagen adjunta',
      imagen_uri: imgData?.uri,
    }])
    setCargando(true)
    scrollAbajo()

    try {
      const historial = mensajes.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const body: Record<string, unknown> = { historial }
      if (msg) body.mensaje = msg
      if (imgData) body.imagen = { base64: imgData.base64, mimeType: imgData.mimeType }
      if (!msg && imgData) body.mensaje = ''

      const { data, error } = await supabase.functions.invoke('valera-ai', { body })

      const errorMsg = data?.error ?? error?.message
      if (errorMsg) throw new Error(errorMsg)

      setMensajes(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.respuesta ?? 'Sin respuesta.',
        tarjetas: data.tarjetas ?? undefined,
      }])
    } catch (e: any) {
      setMensajes(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `No pude procesar tu consulta: ${e.message}`,
        error: true,
      }])
    } finally {
      setCargando(false)
      scrollAbajo()
    }
  }, [cargando, mensajes, scrollAbajo, imagenPendiente])

  const limpiar = useCallback(() => {
    setMensajes([])
    setInput('')
    setImagenPendiente(null)
  }, [])

  return (
    <>
      {/* Botón flotante ARRASTRABLE (mantén presionado y muévelo; toca para abrir) */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[s.fab, {
          left: 0, top: 0, right: undefined, bottom: undefined,
          opacity: opacidad,
          transform: pan.getTranslateTransform(),
          ...(Platform.OS === 'web' ? { userSelect: 'none', cursor: 'grab', touchAction: 'none' } as any : {}),
        }]}
      >
        <Text style={s.fabIcon}>✦</Text>
        <Text style={s.fabLabel}>IA</Text>
      </Animated.View>

      {/* Modal del chat */}
      <Modal
        visible={abierto}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAbierto(false)}
      >
        <SafeAreaView style={s.modal}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.avatarChico}>
                <Text style={s.avatarIcon}>✦</Text>
              </View>
              <View>
                <Text style={s.headerTitulo}>Valera IA</Text>
                <Text style={s.headerSub}>Asistente de administración</Text>
              </View>
            </View>
            <View style={s.headerBotones}>
              <TouchableOpacity onPress={limpiar} style={s.btnIcono}>
                <Text style={s.btnIconoTxt}>🗑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAbierto(false)} style={s.btnIcono}>
                <Text style={s.btnIconoTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {/* Mensajes */}
            <ScrollView
              ref={scrollRef}
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={scrollAbajo}
            >
              {mensajes.length === 0 && (
                <View style={s.bienvenida}>
                  <Text style={s.bienvenidaIcon}>✦</Text>
                  <Text style={s.bienvenidaTitulo}>Hola, soy Valera IA</Text>
                  <Text style={s.bienvenidaSub}>
                    Tu asistente de administración. Pregúntame sobre actividad del equipo, citas, misiones, XP, university, campañas, recordatorios vencidos, inventario y más.
                  </Text>
                  <View style={s.sugerencias}>
                    {SUGERENCIAS.map((s2, i) => (
                      <TouchableOpacity key={i} style={s.chip} onPress={() => enviar(s2)}>
                        <Text style={s.chipTxt}>{s2}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {mensajes.map(m => (
                <View key={m.id} style={[
                  s.burbuja,
                  m.role === 'user' ? s.burbujaUser : s.burbujaAI,
                  m.tarjetas && s.burbujaAncha,
                ]}>
                  {m.role === 'assistant' && (
                    <Text style={s.burbujaLabel}>✦ Valera IA</Text>
                  )}
                  {m.imagen_uri && (
                    <Image source={{ uri: m.imagen_uri }} style={s.burbujaImg} resizeMode="cover" />
                  )}
                  <Text style={[s.burbujaTxt, m.error && s.burbujaError]}>
                    {m.content}
                  </Text>
                  {m.tarjetas && m.tarjetas.map((t, i) => (
                    <TarjetaMensaje key={i} t={t} />
                  ))}
                </View>
              ))}

              {cargando && (
                <View style={[s.burbuja, s.burbujaAI]}>
                  <Text style={s.burbujaLabel}>✦ Valera IA</Text>
                  <View style={s.typing}>
                    <ActivityIndicator size="small" color="#c9a84c" />
                    <Text style={s.typingTxt}>Consultando datos...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Preview imagen pendiente */}
            {imagenPendiente && (
              <View style={s.imgPreviewBar}>
                <Image source={{ uri: imagenPendiente.uri }} style={s.imgPreview} resizeMode="cover" />
                <TouchableOpacity style={s.imgPreviewX} onPress={() => setImagenPendiente(null)}>
                  <Text style={s.imgPreviewXTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Input */}
            <View style={s.inputBar}>
              <TouchableOpacity
                style={[s.imgBtn, cargando && s.imgBtnDisabled]}
                onPress={abrirPickerImagen}
                disabled={cargando}
              >
                <Text style={s.imgBtnIcon}>📷</Text>
              </TouchableOpacity>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder={imagenPendiente ? 'Añade un comentario (opcional)...' : 'Pregúntame algo...'}
                placeholderTextColor="#5a7a8a"
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => enviar(input)}
                editable={!cargando}
              />
              <TouchableOpacity
                style={[s.sendBtn, ((!input.trim() && !imagenPendiente) || cargando) && s.sendBtnDisabled]}
                onPress={() => enviar(input)}
                disabled={(!input.trim() && !imagenPendiente) || cargando}
              >
                <Text style={s.sendIcon}>↑</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  // ── Botón flotante ──────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  fabIcon: { fontSize: 16, color: '#0d1b2a', fontWeight: '700', lineHeight: 18 },
  fabLabel: { fontSize: 10, color: '#0d1b2a', fontWeight: '800', letterSpacing: 0.5 },

  // ── Modal ───────────────────────────────────────────────────
  modal: { flex: 1, backgroundColor: '#0d1b2a' },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a2d3e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a4a',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarChico: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 18, color: '#0d1b2a' },
  headerTitulo: { color: '#f0e6c8', fontWeight: '700', fontSize: 16 },
  headerSub: { color: '#7a9aaa', fontSize: 12 },
  headerBotones: { flexDirection: 'row', gap: 8 },
  btnIcono: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e3a4a',
  },
  btnIconoTxt: { fontSize: 16, color: '#9ab0bc' },

  // ── Scroll ─────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 8 },

  // ── Bienvenida ─────────────────────────────────────────────
  bienvenida: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 16, gap: 12 },
  bienvenidaIcon: { fontSize: 44, color: '#c9a84c' },
  bienvenidaTitulo: { color: '#f0e6c8', fontSize: 20, fontWeight: '700' },
  bienvenidaSub: { color: '#7a9aaa', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  sugerencias: { width: '100%', gap: 8, marginTop: 8 },
  chip: {
    backgroundColor: '#1a2d3e',
    borderWidth: 1,
    borderColor: '#2a4a5e',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipTxt: { color: '#c9a84c', fontSize: 13 },

  // ── Preview imagen ─────────────────────────────────────────
  imgPreviewBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a2d3e',
    borderTopWidth: 1,
    borderTopColor: '#1e3a4a',
  },
  imgPreview: { width: 80, height: 80, borderRadius: 10, borderWidth: 1, borderColor: '#2a4a5e' },
  imgPreviewX: {
    position: 'absolute',
    top: 4,
    left: 84,
    backgroundColor: '#0d1b2a',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a4a5e',
  },
  imgPreviewXTxt: { color: '#9ab0bc', fontSize: 10, lineHeight: 14 },

  // ── Botón cámara ────────────────────────────────────────────
  imgBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e3a4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgBtnDisabled: { opacity: 0.4 },
  imgBtnIcon: { fontSize: 18 },

  // ── Imagen en burbuja ───────────────────────────────────────
  burbujaImg: { width: '100%', height: 160, borderRadius: 8, marginBottom: 4 },

  // ── Burbujas ────────────────────────────────────────────────
  burbuja: { maxWidth: '88%', borderRadius: 14, padding: 12, gap: 4 },
  burbujaAncha: { maxWidth: '98%' },
  burbujaUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a6470',
    borderBottomRightRadius: 4,
  },
  burbujaAI: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a2d3e',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2a4a5e',
  },
  burbujaLabel: { color: '#c9a84c', fontSize: 11, fontWeight: '700' },
  burbujaTxt: { color: '#e8f0f4', fontSize: 14, lineHeight: 21 },
  burbujaError: { color: '#e07070' },

  // ── Typing ─────────────────────────────────────────────────
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingTxt: { color: '#7a9aaa', fontSize: 13 },

  // ── Input bar ───────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 10,
    backgroundColor: '#1a2d3e',
    borderTopWidth: 1,
    borderTopColor: '#1e3a4a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0d1b2a',
    borderWidth: 1,
    borderColor: '#2a4a5e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e8f0f4',
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#3a5060' },
  sendIcon: { fontSize: 20, color: '#0d1b2a', fontWeight: '700', lineHeight: 22 },
})
