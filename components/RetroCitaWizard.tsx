// Wizard de retroalimentación de una cita de venta: 3 preguntas, una por una,
// con transiciones suaves (deslizan y se desvanecen). Al terminar guarda la
// retro con la RPC guardar_retro_cita. Se usa desde la tabla de Citas de Venta
// y (a futuro) desde el popup para asesores.
import { useRef, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  KeyboardAvoidingView, Platform, ActivityIndicator, Easing,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

export type CitaRetro = {
  id: string
  cliente_nombre: string | null
  interesado_en: string | null
  telefono?: string | null
  detalles_pago?: string | null
  dia_cita?: string | null
  prospecto?: string | null
  coordino?: string | null
  atendio?: string | null
  retro_como_estuvo?: string | null
  retro_info_extra?: string | null
  retro_plan_accion?: string | null
}

const PASOS = [
  { key: 'como', icono: '🗣️', titulo: '¿Cómo estuvo la cita?', hint: 'Cuéntanos cómo se dio: interés del cliente, ambiente, qué le mostraste, cómo reaccionó…' },
  { key: 'info', icono: '🔎', titulo: '¿Qué información extra conseguimos?', hint: 'Datos nuevos del prospecto: presupuesto real, tiempos, situación de crédito, lo que sea útil.' },
  { key: 'plan', icono: '🎯', titulo: '¿Cuál es el plan de acción?', hint: 'El siguiente paso concreto: qué opciones mandarle, cuándo darle seguimiento, qué necesita para avanzar.' },
] as const

export default function RetroCitaWizard({ cita, onClose, onSaved }: {
  cita: CitaRetro
  onClose: () => void
  onSaved?: () => void
}) {
  const c = useColors()
  const [paso, setPaso] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [resp, setResp] = useState<[string, string, string]>([
    cita.retro_como_estuvo ?? '', cita.retro_info_extra ?? '', cita.retro_plan_accion ?? '',
  ])

  // Animación de transición entre pasos
  const anim = useRef(new Animated.Value(0)).current  // 0 = en su lugar
  const opacidad = useRef(new Animated.Value(1)).current

  function animarHacia(nuevoPaso: number, dir: 1 | -1) {
    // Sale hacia un lado y desvanece…
    Animated.parallel([
      Animated.timing(anim, { toValue: -dir * 40, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacidad, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setPaso(nuevoPaso)
      // …entra desde el otro lado.
      anim.setValue(dir * 40)
      Animated.parallel([
        Animated.spring(anim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
        Animated.timing(opacidad, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start()
    })
  }

  const setRespPaso = (v: string) => setResp(r => { const n = [...r] as [string, string, string]; n[paso] = v; return n })

  async function guardar() {
    setGuardando(true)
    try {
      const { error } = await supabase.rpc('guardar_retro_cita', {
        p_id: cita.id,
        p_como_estuvo: resp[0].trim() || null,
        p_info_extra: resp[1].trim() || null,
        p_plan_accion: resp[2].trim() || null,
      })
      if (error) throw error
      onSaved?.()
      onClose()
    } catch (e: any) {
      // Mostrar el error en el propio botón
      setGuardando(false)
    }
  }

  const esUltimo = paso === PASOS.length - 1
  const P = PASOS[paso]

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          {/* Encabezado con TODOS los datos de la cita (contexto para el asesor) */}
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>RETROALIMENTACIÓN</Text>
              <Text style={[s.cliente, { color: c.text }]} numberOfLines={1}>{cita.cliente_nombre || 'Cliente'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: c.textMute }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.datos, { backgroundColor: c.bg, borderColor: c.border }]}>
            {cita.interesado_en ? <Text style={[s.datoLinea, { color: c.text }]} numberOfLines={2}>🏠 {cita.interesado_en}</Text> : null}
            {cita.dia_cita ? <Text style={[s.datoLinea, { color: c.textSub }]} numberOfLines={1}>📅 {cita.dia_cita}</Text> : null}
            {cita.telefono ? <Text style={[s.datoLinea, { color: c.textSub }]} numberOfLines={1}>📞 {cita.telefono}</Text> : null}
            {cita.detalles_pago ? <Text style={[s.datoLinea, { color: c.textSub }]} numberOfLines={1}>💳 {cita.detalles_pago}</Text> : null}
            {cita.prospecto ? <Text style={[s.datoLinea, { color: c.textMute }]} numberOfLines={1}>🌱 Prospectó: {cita.prospecto}</Text> : null}
            {cita.coordino ? <Text style={[s.datoLinea, { color: c.textMute }]} numberOfLines={1}>🧭 Coordinó: {cita.coordino}</Text> : null}
          </View>

          {/* Barra de progreso por pasos */}
          <View style={s.progreso}>
            {PASOS.map((_, i) => (
              <View key={i} style={[s.progSeg, { backgroundColor: i <= paso ? '#1a6470' : c.border }]} />
            ))}
          </View>
          <Text style={[s.contador, { color: c.textMute }]}>Paso {paso + 1} de {PASOS.length}</Text>

          {/* Pregunta (animada) */}
          <Animated.View style={{ transform: [{ translateX: anim }], opacity: opacidad }}>
            <Text style={s.icono}>{P.icono}</Text>
            <Text style={[s.pregunta, { color: c.text }]}>{P.titulo}</Text>
            <Text style={[s.hint, { color: c.textMute }]}>{P.hint}</Text>
            <TextInput
              style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={resp[paso]}
              onChangeText={setRespPaso}
              placeholder="Escribe aquí…"
              placeholderTextColor={c.textMute}
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </Animated.View>

          {/* Acciones */}
          <View style={s.acciones}>
            <TouchableOpacity
              style={[s.btnAtras, { opacity: paso === 0 ? 0.35 : 1 }]}
              disabled={paso === 0 || guardando}
              onPress={() => animarHacia(paso - 1, -1)}
            >
              <Text style={[s.btnAtrasTxt, { color: c.textSub }]}>‹ Atrás</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {esUltimo ? (
              <TouchableOpacity style={s.btnPrim} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnPrimTxt}>Guardar ✓</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.btnPrim} onPress={() => animarHacia(paso + 1, 1)}>
                <Text style={s.btnPrimTxt}>Siguiente ›</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, padding: 22, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#c9a84c' },
  cliente: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  prop: { fontSize: 12.5, marginTop: 1 },
  datos: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 3, marginBottom: 12 },
  datoLinea: { fontSize: 12.5, lineHeight: 17 },
  progreso: { flexDirection: 'row', gap: 6 },
  progSeg: { flex: 1, height: 5, borderRadius: 3 },
  contador: { fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 14 },
  icono: { fontSize: 30, textAlign: 'center', marginBottom: 6 },
  pregunta: { fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  hint: { fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginBottom: 14, paddingHorizontal: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, minHeight: 120 },
  acciones: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  btnAtras: { paddingVertical: 11, paddingHorizontal: 8 },
  btnAtrasTxt: { fontSize: 15, fontWeight: '700' },
  btnPrim: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 26, minWidth: 128, alignItems: 'center' },
  btnPrimTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
