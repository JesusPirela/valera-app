import { useEffect, useState } from 'react'
import {
  View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Platform, Alert, Share, Linking,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { CAMPOS_OPCIONALES } from '../lib/formulario-campos'

const TEAL = '#1a6470'
const BASE = 'https://valeraapp.valerarealestate.com/formulario/'

// Modal para generar un link con formulario de captura de una ficha o colección.
export default function CompartirFormulario({ tipo, refId, titulo, onClose }: {
  tipo: 'ficha' | 'coleccion'; refId: string; titulo: string; onClose: () => void
}) {
  const [campos, setCampos] = useState<string[]>(['email', 'tipo_operacion', 'zona_busqueda', 'presupuesto'])
  const [activo, setActivo] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCargando(false); return }
      const { data } = await supabase.from('formularios_captura')
        .select('id, campos, activo').eq('owner_id', user.id).eq('tipo', tipo).eq('ref', refId).maybeSingle()
      if (data) { setToken(data.id); setCampos(data.campos ?? []); setActivo(data.activo) }
      setCargando(false)
    })()
  }, [tipo, refId])

  const toggle = (k: string) => setCampos(c => c.includes(k) ? c.filter(x => x !== k) : [...c, k])

  async function generar() {
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { Alert.alert('Error', 'Inicia sesión.'); return }
      const { data, error } = await supabase.from('formularios_captura')
        .upsert({ owner_id: user.id, tipo, ref: refId, titulo, campos, activo: true }, { onConflict: 'owner_id,tipo,ref' })
        .select('id').single()
      if (error) { Alert.alert('Error', error.message); return }
      setToken(data.id); setActivo(true)
    } finally { setGuardando(false) }
  }

  async function toggleActivo() {
    if (!token) return
    const nuevo = !activo
    setActivo(nuevo)
    await supabase.from('formularios_captura').update({ activo: nuevo }).eq('id', token)
  }

  const link = token ? BASE + token : ''

  async function copiar() {
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(link); Alert.alert('Copiado', 'Link copiado.') }
      catch { (window as any).prompt('Copia el link:', link) }
    } else {
      try { await Share.share({ message: link }) } catch { /* cancelado */ }
    }
  }
  function compartirWA() {
    const msg = `Hola, déjame tus datos aquí para atenderte mejor:\n${link}`
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url)
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.bg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={e => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.titulo}>Compartir con formulario</Text>
          <Text style={s.sub}>Genera un link donde el cliente deja sus datos y entra directo a tu CRM.</Text>

          {cargando ? <ActivityIndicator color={TEAL} style={{ marginTop: 24 }} /> : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={s.label}>¿Qué datos pedir? (Nombre y teléfono van siempre)</Text>
              <View style={s.chips}>
                {CAMPOS_OPCIONALES.map(c => {
                  const on = campos.includes(c.key)
                  return (
                    <TouchableOpacity key={c.key} style={[s.chip, on && s.chipOn]} onPress={() => toggle(c.key)}>
                      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{on ? '✓ ' : ''}{c.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {!token ? (
                <TouchableOpacity style={[s.btn, guardando && { opacity: 0.6 }]} onPress={generar} disabled={guardando}>
                  {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Generar link</Text>}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={[s.btn, { backgroundColor: '#0d6b73' }, guardando && { opacity: 0.6 }]} onPress={generar} disabled={guardando}>
                    {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Actualizar campos</Text>}
                  </TouchableOpacity>

                  <View style={s.linkBox}><Text style={s.linkTxt} numberOfLines={1}>{link}</Text></View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[s.btnSec, { flex: 1 }]} onPress={copiar}><Text style={s.btnSecTxt}>📋 Copiar</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.btnSec, { flex: 1, backgroundColor: '#25D366' }]} onPress={compartirWA}><Text style={[s.btnSecTxt, { color: '#fff' }]}>WhatsApp</Text></TouchableOpacity>
                  </View>

                  <TouchableOpacity style={s.activoRow} onPress={toggleActivo}>
                    <Text style={s.activoTxt}>Formulario {activo ? 'activo' : 'desactivado'}</Text>
                    <View style={[s.switch, activo && s.switchOn]}><View style={[s.knob, activo && s.knobOn]} /></View>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={s.cerrar} onPress={onClose}><Text style={s.cerrarTxt}>Cerrar</Text></TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30, maxWidth: 560, width: '100%', alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d5dee3', alignSelf: 'center', marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '900', color: '#123' },
  sub: { fontSize: 13, color: '#5f7690', marginTop: 4, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '800', color: '#334', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { backgroundColor: '#f1f5f7', borderWidth: 1, borderColor: '#d5dee3', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: '#e0f4f5', borderColor: TEAL },
  chipTxt: { fontSize: 13, fontWeight: '700', color: '#556' },
  chipTxtOn: { color: TEAL },
  btn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  linkBox: { backgroundColor: '#f1f5f7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  linkTxt: { color: '#1a6470', fontSize: 13, fontWeight: '600' },
  btnSec: { backgroundColor: '#e0f4f5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnSecTxt: { color: TEAL, fontSize: 14, fontWeight: '800' },
  activoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingVertical: 10 },
  activoTxt: { fontSize: 14, fontWeight: '700', color: '#334' },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: '#cbd5db', padding: 3 },
  switchOn: { backgroundColor: TEAL },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  cerrar: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  cerrarTxt: { color: '#5f7690', fontSize: 14, fontWeight: '700' },
})
