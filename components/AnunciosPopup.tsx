// Popup de anuncios: al abrir la app, si el usuario tiene un anuncio de
// prioridad alta/crítica sin ver (o una reunión sin confirmar asistencia), le
// sale un modal. Los 'crítica' con confirmación pendiente reaparecen hasta que
// responda. Se monta en los layouts de (prospectador) y (admin).
import { useEffect, useState, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
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
  // Degradado del encabezado (más vivo que la franja plana de antes).
  const degradado: [string, string] = critico ? ['#E53935', '#A81C1C'] : ['#FFA726', '#EF6C00']

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
    <Modal visible transparent animationType="fade" onRequestClose={luego} statusBarTranslucent>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.card }]}>
          {/* Encabezado con degradado */}
          <LinearGradient colors={degradado} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
            <View style={s.headerIcon}>
              <Ionicons name={critico ? 'alert' : 'megaphone'} size={20} color="#fff" />
            </View>
            <Text style={s.headerTxt}>{critico ? 'IMPORTANTE' : 'AVISO'}</Text>
          </LinearGradient>

          {/* Contenido */}
          <ScrollView
            style={{ maxHeight: 340 }}
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[s.titulo, { color: c.text }]}>{anuncio.titulo}</Text>

            {anuncio.es_reunion && anuncio.evento_cuando ? (
              <View style={[s.cuando, { backgroundColor: acento + '1f', borderColor: acento + '66' }]}>
                <Ionicons name="calendar" size={15} color={acento} />
                <Text style={[s.cuandoTxt, { color: acento }]}>{anuncio.evento_cuando}</Text>
              </View>
            ) : null}

            <View style={[s.separador, { backgroundColor: c.border }]} />

            {/* Alineado a la izquierda: los textos largos centrados se leen mal */}
            <Text style={[s.cuerpo, { color: c.textSub }]}>{anuncio.cuerpo}</Text>
          </ScrollView>

          {/* Acciones fijas: antes iban dentro del scroll y quedaban cortadas */}
          <View style={[s.footer, { borderTopColor: c.border }]}>
            {anuncio.pide_confirmacion ? (
              <>
                <Text style={[s.pregunta, { color: c.text }]}>¿Vas a asistir?</Text>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: '#2e7d32' }, guardando && s.btnOff]}
                  disabled={guardando} onPress={() => confirmar('asiste')} activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={s.btnTxt}>Sí, asistiré</Text>
                </TouchableOpacity>
                <View style={s.btnFila}>
                  <TouchableOpacity
                    style={[s.btnSec, { borderColor: '#F57F17' }, guardando && s.btnOff]}
                    disabled={guardando} onPress={() => confirmar('tal_vez')} activeOpacity={0.85}
                  >
                    <Text style={[s.btnSecTxt, { color: '#F57F17' }]}>Tal vez</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnSec, { borderColor: '#c0392b' }, guardando && s.btnOff]}
                    disabled={guardando} onPress={() => confirmar('no_asiste')} activeOpacity={0.85}
                  >
                    <Text style={[s.btnSecTxt, { color: '#c0392b' }]}>No podré</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={s.luego} onPress={luego}>
                  <Text style={[s.luegoTxt, { color: c.textMute }]}>Responder luego</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[s.btn, { backgroundColor: acento }, guardando && s.btnOff]}
                disabled={guardando} onPress={entendido} activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={s.btnTxt}>Entendido</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 22, maxWidth: 440, width: '100%', alignSelf: 'center', overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 18px 50px rgba(0,0,0,0.45)' } as any,
      default: { elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 14 },
  headerIcon: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  headerTxt: { color: '#fff', fontWeight: '900', fontSize: 14.5, letterSpacing: 1.6 },

  body: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18 },
  titulo: { fontSize: 21, fontWeight: '900', textAlign: 'center', lineHeight: 27 },
  cuando: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    marginTop: 14, alignSelf: 'center',
  },
  cuandoTxt: { fontSize: 14.5, fontWeight: '800' },
  separador: { height: 1, marginTop: 18, marginBottom: 16, opacity: 0.7 },
  cuerpo: { fontSize: 14.5, lineHeight: 22, textAlign: 'left' },

  footer: { borderTopWidth: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18 },
  pregunta: { fontSize: 15.5, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 13, paddingVertical: 14,
  },
  btnTxt: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  btnOff: { opacity: 0.55 },
  btnFila: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnSec: { flex: 1, borderWidth: 1.5, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  btnSecTxt: { fontSize: 14.5, fontWeight: '800' },
  luego: { paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  luegoTxt: { fontSize: 13.5, fontWeight: '600' },
})
