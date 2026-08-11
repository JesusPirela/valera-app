import { useEffect, useState, useRef } from 'react'
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
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Guarda (crea o actualiza) el formulario. El link es el mismo `id` estable,
  // así que actualizar los campos NO cambia el link ya compartido.
  async function persistir(nextCampos: string[], nextActivo: boolean) {
    setEstado('guardando')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setEstado('idle'); return }
    const { data, error } = await supabase.from('formularios_captura')
      .upsert({ owner_id: user.id, tipo, ref: refId, titulo, campos: nextCampos, activo: nextActivo }, { onConflict: 'owner_id,tipo,ref' })
      .select('id').single()
    if (!error && data) {
      setToken(data.id)
      setEstado('guardado')
      setTimeout(() => setEstado('idle'), 1600)
    } else { setEstado('idle') }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCargando(false); return }
      const { data } = await supabase.from('formularios_captura')
        .select('id, campos, activo').eq('owner_id', user.id).eq('tipo', tipo).eq('ref', refId).maybeSingle()
      if (data) {
        setToken(data.id); setCampos(data.campos ?? []); setActivo(data.activo)
        setCargando(false)
      } else {
        // No existía: se crea de una vez con los campos por defecto para que el
        // link ya esté listo sin que el asesor tenga que presionar nada.
        setCargando(false)
        await persistir(['email', 'tipo_operacion', 'zona_busqueda', 'presupuesto'], true)
      }
    })()
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [tipo, refId])

  // Al togglear un campo: actualiza la UI y auto-guarda (con un pequeño debounce
  // para no pegarle a la BD en cada toque). Sin botón "Actualizar".
  const toggle = (k: string) => setCampos(c => {
    const next = c.includes(k) ? c.filter(x => x !== k) : [...c, k]
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistir(next, activo), 450)
    return next
  })

  async function toggleActivo() {
    const nuevo = !activo
    setActivo(nuevo)
    await persistir(campos, nuevo)
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
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              <View style={s.labelRow}>
                <Text style={s.label}>¿Qué datos pedir? (Nombre y teléfono van siempre)</Text>
                {estado === 'guardando' ? <Text style={s.estadoTxt}>Guardando…</Text>
                  : estado === 'guardado' ? <Text style={[s.estadoTxt, { color: '#16a34a' }]}>Guardado ✓</Text> : null}
              </View>
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

              <Text style={s.linkLabel}>Tu link (se actualiza solo):</Text>
              <View style={s.linkBox}>
                {token
                  ? <Text style={s.linkTxt} numberOfLines={1}>{link}</Text>
                  : <ActivityIndicator color={TEAL} size="small" />}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[s.btnSec, { flex: 1 }, !token && { opacity: 0.5 }]} onPress={copiar} disabled={!token}><Text style={s.btnSecTxt}>📋 Copiar</Text></TouchableOpacity>
                <TouchableOpacity style={[s.btnSec, { flex: 1, backgroundColor: '#25D366' }, !token && { opacity: 0.5 }]} onPress={compartirWA} disabled={!token}><Text style={[s.btnSecTxt, { color: '#fff' }]}>WhatsApp</Text></TouchableOpacity>
              </View>

              <TouchableOpacity style={s.activoRow} onPress={toggleActivo} disabled={!token}>
                <Text style={s.activoTxt}>Formulario {activo ? 'activo' : 'desactivado'}</Text>
                <View style={[s.switch, activo && s.switchOn]}><View style={[s.knob, activo && s.knobOn]} /></View>
              </TouchableOpacity>
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
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  label: { fontSize: 13, fontWeight: '800', color: '#334', flex: 1 },
  estadoTxt: { fontSize: 12, fontWeight: '700', color: '#8fa0ab' },
  linkLabel: { fontSize: 12, fontWeight: '700', color: '#5f7690', marginBottom: 6 },
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
