import { useState, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  TextInput, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, SafeAreaView,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Mensaje = {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}

const SUGERENCIAS = [
  '¿Cómo va el equipo hoy?',
  '¿Quién no ha publicado esta semana?',
  '¿Cuántos leads hay sin asignar?',
  'Muéstrame el ranking de publicaciones',
  '¿Cómo está el inventario?',
]

export default function ValeraAIChatAdmin() {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [cargando, setCargando] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  const scrollAbajo = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const enviar = useCallback(async (texto: string) => {
    const msg = texto.trim()
    if (!msg || cargando) return

    setInput('')
    const idUsuario = `u-${Date.now()}`
    setMensajes(prev => [...prev, { id: idUsuario, role: 'user', content: msg }])
    setCargando(true)
    scrollAbajo()

    try {
      // Solo enviamos los últimos 10 mensajes para no inflar tokens
      const historial = mensajes.slice(-10).map(m => ({ role: m.role, content: m.content }))

      const { data, error } = await supabase.functions.invoke('valera-ai', {
        body: { mensaje: msg, historial },
      })

      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? 'Error de conexión')
      }

      setMensajes(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.respuesta ?? 'Sin respuesta.',
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
  }, [cargando, mensajes, scrollAbajo])

  const limpiar = useCallback(() => {
    setMensajes([])
    setInput('')
  }, [])

  return (
    <>
      {/* Botón flotante */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => setAbierto(true)}
        activeOpacity={0.85}
      >
        <Text style={s.fabIcon}>✦</Text>
        <Text style={s.fabLabel}>IA</Text>
      </TouchableOpacity>

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
                    Tu asistente de administración. Pregúntame sobre el equipo, inventario, leads o el pipeline de clientes.
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
                <View key={m.id} style={[s.burbuja, m.role === 'user' ? s.burbujaUser : s.burbujaAI]}>
                  {m.role === 'assistant' && (
                    <Text style={s.burbujaLabel}>✦ Valera IA</Text>
                  )}
                  <Text style={[s.burbujaTxt, m.error && s.burbujaError]}>
                    {m.content}
                  </Text>
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

            {/* Input */}
            <View style={s.inputBar}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="Pregúntame algo..."
                placeholderTextColor="#5a7a8a"
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => enviar(input)}
                editable={!cargando}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || cargando) && s.sendBtnDisabled]}
                onPress={() => enviar(input)}
                disabled={!input.trim() || cargando}
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
    bottom: 28,
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

  // ── Burbujas ────────────────────────────────────────────────
  burbuja: { maxWidth: '88%', borderRadius: 14, padding: 12, gap: 4 },
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
