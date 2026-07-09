import { useState } from 'react'
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

export type CitaPorConfirmar = {
  id: string
  cliente_id: string
  cliente_nombre: string
  cliente_telefono: string | null
  propiedad_id: string | null
  propiedad_codigo: string | null
  fecha_cita: string
}

type Desenlace = 'realizada' | 'no_realizada' | 'reagendada'

const RESULTADOS = [
  'Muy interesado',
  'Interesado',
  'Lo va a pensar',
  'No le gustó',
  'Apartó la propiedad',
]

const MOTIVOS = [
  'Cliente canceló',
  'Cliente no asistió',
  'Asesor no asistió',
  'Otro',
]

function avisar(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

type Props = {
  cita: CitaPorConfirmar | null
  onClose: () => void
  onConfirmado: () => void
}

export default function ConfirmarCitaModal({ cita, onClose, onConfirmado }: Props) {
  const c = useColors()

  const [desenlace, setDesenlace]   = useState<Desenlace | null>(null)
  const [resultado, setResultado]   = useState<string | null>(null)
  const [motivo, setMotivo]         = useState<string | null>(null)
  const [comentarios, setComentarios] = useState('')
  const [conSeguimiento, setConSeguimiento] = useState(false)
  const [fechaSeguimiento, setFechaSeguimiento] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 3); return d
  })
  const [nuevaFecha, setNuevaFecha] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d
  })
  const [guardando, setGuardando] = useState(false)

  function reiniciar() {
    setDesenlace(null); setResultado(null); setMotivo(null)
    setComentarios(''); setConSeguimiento(false)
  }

  function cerrar() { reiniciar(); onClose() }

  async function guardar() {
    if (!cita || !desenlace) return
    if (desenlace === 'realizada' && !resultado) { avisar('Elige el resultado de la cita.'); return }
    if (desenlace === 'no_realizada' && !motivo)  { avisar('Elige el motivo.'); return }

    setGuardando(true)
    const { data, error } = await supabase.rpc('confirmar_cita', {
      p_cita_id: cita.id,
      p_desenlace: desenlace,
      p_resultado: desenlace === 'realizada' ? resultado : null,
      p_comentarios: comentarios.trim() || null,
      p_motivo: desenlace === 'no_realizada' ? motivo : null,
      p_nueva_fecha: desenlace === 'reagendada' ? nuevaFecha.toISOString() : null,
      p_proximo_seguimiento:
        desenlace === 'realizada' && conSeguimiento ? fechaSeguimiento.toISOString() : null,
    })
    setGuardando(false)

    if (error) { avisar('No se pudo guardar: ' + error.message); return }
    if (data && data.ok === false) { avisar(data.error ?? 'No se pudo guardar.'); return }

    reiniciar()
    onConfirmado()
  }

  if (!cita) return null

  const fechaStr = new Date(cita.fecha_cita).toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  const Chip = ({ label, activo, onPress, color }: {
    label: string; activo: boolean; onPress: () => void; color: string
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.chip,
        { borderColor: c.border, backgroundColor: c.bg2 },
        activo && { backgroundColor: color, borderColor: color },
      ]}
    >
      <Text style={[s.chipTxt, { color: c.text }, activo && { color: '#fff', fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )

  const Stepper = ({ valor, onCambio }: { valor: Date; onCambio: (d: Date) => void }) => (
    <>
      <View style={s.stepRow}>
        <TouchableOpacity
          style={[s.stepBtn, { borderColor: c.border }]}
          onPress={() => { const d = new Date(valor); d.setDate(d.getDate() - 1); onCambio(d) }}
        >
          <Text style={[s.stepArrow, { color: c.text }]}>◀</Text>
        </TouchableOpacity>
        <Text style={[s.stepValor, { color: c.text }]}>
          {valor.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
        </Text>
        <TouchableOpacity
          style={[s.stepBtn, { borderColor: c.border }]}
          onPress={() => { const d = new Date(valor); d.setDate(d.getDate() + 1); onCambio(d) }}
        >
          <Text style={[s.stepArrow, { color: c.text }]}>▶</Text>
        </TouchableOpacity>
      </View>
      <View style={s.stepRow}>
        <TouchableOpacity
          style={[s.stepBtn, { borderColor: c.border }]}
          onPress={() => { const d = new Date(valor); d.setMinutes(d.getMinutes() - 30); onCambio(d) }}
        >
          <Text style={[s.stepArrow, { color: c.text }]}>◀</Text>
        </TouchableOpacity>
        <Text style={[s.stepValor, { color: c.text }]}>
          {valor.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <TouchableOpacity
          style={[s.stepBtn, { borderColor: c.border }]}
          onPress={() => { const d = new Date(valor); d.setMinutes(d.getMinutes() + 30); onCambio(d) }}
        >
          <Text style={[s.stepArrow, { color: c.text }]}>▶</Text>
        </TouchableOpacity>
      </View>
    </>
  )

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cerrar}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={[s.titulo, { color: c.text }]}>¿La cita se realizó?</Text>
            <Text style={[s.sub, { color: c.textSub }]}>
              {cita.cliente_nombre}
              {cita.propiedad_codigo ? ` · ${cita.propiedad_codigo}` : ''}
            </Text>
            <Text style={[s.sub, { color: c.textMute, marginBottom: 16 }]}>{fechaStr}</Text>

            <View style={s.opciones}>
              <TouchableOpacity
                style={[s.opcion, { borderColor: '#16a34a' }, desenlace === 'realizada' && { backgroundColor: '#16a34a' }]}
                onPress={() => setDesenlace('realizada')}
              >
                <Text style={[s.opcionTxt, { color: desenlace === 'realizada' ? '#fff' : '#16a34a' }]}>
                  ✅ Sí se realizó
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.opcion, { borderColor: '#dc2626' }, desenlace === 'no_realizada' && { backgroundColor: '#dc2626' }]}
                onPress={() => setDesenlace('no_realizada')}
              >
                <Text style={[s.opcionTxt, { color: desenlace === 'no_realizada' ? '#fff' : '#dc2626' }]}>
                  ❌ No se realizó
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.opcion, { borderColor: '#d97706' }, desenlace === 'reagendada' && { backgroundColor: '#d97706' }]}
                onPress={() => setDesenlace('reagendada')}
              >
                <Text style={[s.opcionTxt, { color: desenlace === 'reagendada' ? '#fff' : '#d97706' }]}>
                  🔄 Se reagendó
                </Text>
              </TouchableOpacity>
            </View>

            {desenlace === 'realizada' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Resultado</Text>
                <View style={s.chips}>
                  {RESULTADOS.map(r => (
                    <Chip key={r} label={r} activo={resultado === r} color="#16a34a" onPress={() => setResultado(r)} />
                  ))}
                </View>

                <Text style={[s.label, { color: c.text }]}>Comentarios</Text>
                <TextInput
                  value={comentarios}
                  onChangeText={setComentarios}
                  placeholder="¿Qué dijo el cliente?"
                  placeholderTextColor={c.placeholder}
                  multiline
                  style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                />

                <TouchableOpacity style={s.checkRow} onPress={() => setConSeguimiento(v => !v)}>
                  <View style={[s.check, { borderColor: c.border }, conSeguimiento && { backgroundColor: '#1a6470', borderColor: '#1a6470' }]}>
                    {conSeguimiento && <Text style={s.checkMark}>✓</Text>}
                  </View>
                  <Text style={[s.checkTxt, { color: c.text }]}>Agendar próximo seguimiento</Text>
                </TouchableOpacity>

                {conSeguimiento && <Stepper valor={fechaSeguimiento} onCambio={setFechaSeguimiento} />}
              </>
            )}

            {desenlace === 'no_realizada' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Motivo</Text>
                <View style={s.chips}>
                  {MOTIVOS.map(m => (
                    <Chip key={m} label={m} activo={motivo === m} color="#dc2626" onPress={() => setMotivo(m)} />
                  ))}
                </View>

                <Text style={[s.label, { color: c.text }]}>Comentarios (opcional)</Text>
                <TextInput
                  value={comentarios}
                  onChangeText={setComentarios}
                  placeholder="Detalles"
                  placeholderTextColor={c.placeholder}
                  multiline
                  style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                />
              </>
            )}

            {desenlace === 'reagendada' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Nueva fecha y hora</Text>
                <Stepper valor={nuevaFecha} onCambio={setNuevaFecha} />

                <Text style={[s.label, { color: c.text }]}>Comentarios (opcional)</Text>
                <TextInput
                  value={comentarios}
                  onChangeText={setComentarios}
                  placeholder="Motivo del cambio"
                  placeholderTextColor={c.placeholder}
                  multiline
                  style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                />
              </>
            )}

            <View style={s.acciones}>
              <TouchableOpacity style={[s.btn, { backgroundColor: c.bg2 }]} onPress={cerrar} disabled={guardando}>
                <Text style={[s.btnTxt, { color: c.textSub }]}>Después</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: '#1a6470' }, (!desenlace || guardando) && { opacity: 0.5 }]}
                onPress={guardar}
                disabled={!desenlace || guardando}
              >
                {guardando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[s.btnTxt, { color: '#fff' }]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  card:      { borderRadius: 16, maxHeight: '88%', overflow: 'hidden' },
  titulo:    { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sub:       { fontSize: 13, textAlign: 'center', marginTop: 3 },
  opciones:  { gap: 8, marginBottom: 6 },
  opcion:    { borderWidth: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  opcionTxt: { fontSize: 15, fontWeight: '700' },
  label:     { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { borderWidth: 1, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12 },
  chipTxt:   { fontSize: 12.5 },
  input:     { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 70, textAlignVertical: 'top', fontSize: 14 },
  checkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  check:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkTxt:  { fontSize: 14 },
  stepRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  stepBtn:   { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  stepArrow: { fontSize: 14 },
  stepValor: { fontSize: 16, fontWeight: '700' },
  acciones:  { flexDirection: 'row', gap: 10, marginTop: 22 },
  btn:       { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt:    { fontSize: 15, fontWeight: '700' },
})
