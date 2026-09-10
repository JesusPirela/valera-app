// Popup de anuncios: al abrir la app, si el usuario tiene un anuncio de
// prioridad alta/crítica sin ver (o una reunión sin confirmar asistencia), le
// sale un modal. Los 'crítica' con confirmación pendiente reaparecen hasta que
// responda. Se monta en los layouts de (prospectador) y (admin).
import { useEffect, useState, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

type Anuncio = {
  id: string; titulo: string; cuerpo: string; prioridad: 'normal' | 'alta' | 'critica'
  es_reunion: boolean; evento_cuando: string | null; pide_confirmacion: boolean
  confirmacion: 'asiste' | 'no_asiste' | 'tal_vez' | null; created_at: string
}

export default function AnunciosPopup() {
  const c = useColors()
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null)
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set()) // descartados en esta sesión
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('get_mi_anuncio_pendiente')
    const a = (data ?? [])[0] as Anuncio | undefined
    if (a && !saliendo.has(a.id)) setAnuncio(a)
    else setAnuncio(null)
  }, [saliendo])

  useEffect(() => { cargar() }, [cargar])

  if (!anuncio) return null
  const critico = anuncio.prioridad === 'critica'
  const acento = critico ? '#C62828' : '#F57F17'

  async function entendido() {
    if (!anuncio) return
    setGuardando(true)
    await supabase.rpc('marcar_anuncio_visto', { p_anuncio_id: anuncio.id })
    setSaliendo(prev => new Set(prev).add(anuncio.id))
    setGuardando(false)
    setAnuncio(null)
  }

  async function confirmar(valor: 'asiste' | 'no_asiste' | 'tal_vez') {
    if (!anuncio) return
    setGuardando(true)
    await supabase.rpc('confirmar_anuncio', { p_anuncio_id: anuncio.id, p_confirmacion: valor })
    setSaliendo(prev => new Set(prev).add(anuncio.id))
    setGuardando(false)
    setAnuncio(null)
    setTimeout(cargar, 300) // por si hay otro pendiente
  }

  function luego() {
    if (!anuncio) return
    setSaliendo(prev => new Set(prev).add(anuncio.id))
    setAnuncio(null)
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={luego}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          <View style={[s.tag, { backgroundColor: acento }]}>
            <Text style={s.tagTxt}>{critico ? '🚨 IMPORTANTE' : '📣 AVISO'}</Text>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: 22, paddingTop: 16 }}>
            <Text style={[s.titulo, { color: c.text }]}>{anuncio.titulo}</Text>

            {anuncio.es_reunion && anuncio.evento_cuando ? (
              <View style={[s.cuando, { borderColor: acento }]}>
                <Text style={[s.cuandoTxt, { color: acento }]}>📅 {anuncio.evento_cuando}</Text>
              </View>
            ) : null}

            <Text style={[s.cuerpo, { color: c.textSub }]}>{anuncio.cuerpo}</Text>

            {anuncio.pide_confirmacion ? (
              <>
                <Text style={[s.pregunta, { color: c.text }]}>¿Vas a asistir?</Text>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#2e7d32' }]} disabled={guardando} onPress={() => confirmar('asiste')}>
                  <Text style={s.btnTxt}>✅ Sí, asistiré</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#F57F17' }]} disabled={guardando} onPress={() => confirmar('tal_vez')}>
                  <Text style={s.btnTxt}>🤔 Tal vez</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#c0392b' }]} disabled={guardando} onPress={() => confirmar('no_asiste')}>
                  <Text style={s.btnTxt}>❌ No podré</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.luego} onPress={luego}>
                  <Text style={[s.luegoTxt, { color: c.textMute }]}>Responder luego</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[s.btn, { backgroundColor: acento, marginTop: 16 }]} disabled={guardando} onPress={entendido}>
                <Text style={s.btnTxt}>Entendido</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, maxWidth: 440, width: '100%', alignSelf: 'center', overflow: 'hidden' },
  tag: { paddingVertical: 8, alignItems: 'center' },
  tagTxt: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  titulo: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  cuando: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, alignItems: 'center' },
  cuandoTxt: { fontSize: 15, fontWeight: '800' },
  cuerpo: { fontSize: 14.5, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  pregunta: { fontSize: 15.5, fontWeight: '800', textAlign: 'center', marginTop: 18, marginBottom: 6 },
  btn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 9 },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  luego: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  luegoTxt: { fontSize: 13.5, fontWeight: '600' },
})
