import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { CAMPOS_FORM } from '../../lib/formulario-campos'

const TEAL = '#1a6470'

type Form = { id: string; tipo: string; ref: string; titulo: string | null; campos: string[]; activo: boolean }

export default function FormularioCaptura() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    if (!token) return
    const { data } = await supabase.from('formularios_captura').select('id, tipo, ref, titulo, campos, activo').eq('id', token).maybeSingle()
    setForm((data as Form) ?? null)
    setLoading(false)
  }, [token])
  useEffect(() => { cargar() }, [cargar])

  // Campos a mostrar: los fijos + los configurados.
  const camposMostrar = CAMPOS_FORM.filter(c => c.fijo || (form?.campos ?? []).includes(c.key))

  async function enviar() {
    setError('')
    if (!(valores.nombre ?? '').trim() || !(valores.telefono ?? '').trim()) {
      setError('Por favor llena tu nombre y teléfono.'); return
    }
    setEnviando(true)
    try {
      const { data, error: e } = await supabase.functions.invoke('registrar-lead-formulario', { body: { token, respuestas: valores } })
      if (e) { setError('No se pudo enviar. Intenta de nuevo.'); return }
      if ((data as any)?.ok === false) { setError((data as any).error ?? 'No se pudo enviar.'); return }
      setEnviado(true)
    } catch {
      setError('No se pudo enviar. Revisa tu conexión.')
    } finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={TEAL} /></View>
  if (!form || !form.activo) return <View style={s.center}><Text style={s.msg}>Este formulario ya no está disponible.</Text></View>

  if (enviado) return (
    <View style={s.center}>
      <Text style={{ fontSize: 54 }}>✅</Text>
      <Text style={s.graciasTit}>¡Gracias por registrarte!</Text>
      <Text style={s.gracias}>Un asesor te contactará muy pronto.</Text>
    </View>
  )

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 520, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.marca}>VALERA REAL ESTATE</Text>
        <Text style={s.titulo}>{form.titulo || 'Déjanos tus datos'}</Text>
        <Text style={s.sub}>Completa el formulario y un asesor te contactará.</Text>
      </View>

      {camposMostrar.map(campo => (
        <View key={campo.key} style={{ marginBottom: 14 }}>
          <Text style={s.label}>{campo.label}{campo.fijo ? ' *' : ''}</Text>
          {campo.tipo === 'opciones' ? (
            <View style={s.chips}>
              {(campo.opciones ?? []).map(op => {
                const activo = valores[campo.key] === op.valor
                return (
                  <TouchableOpacity key={op.valor} style={[s.chip, activo && s.chipOn]}
                    onPress={() => setValores(v => ({ ...v, [campo.key]: op.valor }))}>
                    <Text style={[s.chipTxt, activo && s.chipTxtOn]}>{op.etiqueta}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <TextInput
              style={[s.input, campo.key === 'notas' && { height: 90, textAlignVertical: 'top' }]}
              value={valores[campo.key] ?? ''}
              onChangeText={t => setValores(v => ({ ...v, [campo.key]: t }))}
              placeholder={campo.tipo === 'email' ? 'tu@correo.com' : campo.tipo === 'telefono' ? '10 dígitos' : ''}
              placeholderTextColor="#9aa8b3"
              keyboardType={campo.tipo === 'telefono' ? 'phone-pad' : campo.tipo === 'email' ? 'email-address' : 'default'}
              autoCapitalize={campo.tipo === 'email' ? 'none' : 'sentences'}
              multiline={campo.key === 'notas'}
            />
          )}
        </View>
      ))}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TouchableOpacity style={[s.btn, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Enviar mis datos</Text>}
      </TouchableOpacity>
      <Text style={s.aviso}>Tus datos se comparten solo con tu asesor de Valera Real Estate.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef2f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#eef2f4' },
  msg: { fontSize: 15, color: '#5f7690', textAlign: 'center' },
  header: { marginBottom: 18 },
  marca: { color: TEAL, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  titulo: { color: '#123', fontSize: 22, fontWeight: '900', marginTop: 6 },
  sub: { color: '#5f7690', fontSize: 13.5, marginTop: 4 },
  label: { color: '#334', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5dee3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#123' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5dee3', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { color: '#334', fontSize: 14, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  error: { color: '#c0392b', fontSize: 13, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  btn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  aviso: { color: '#8fa0ab', fontSize: 11.5, textAlign: 'center', marginTop: 12 },
  graciasTit: { fontSize: 20, fontWeight: '900', color: '#123', marginTop: 12 },
  gracias: { fontSize: 14, color: '#5f7690', marginTop: 6, textAlign: 'center' },
})
