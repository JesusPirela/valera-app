// Cola de revisión de videos encontrados automáticamente para Valera
// University (ver supabase/functions/university-buscar-videos). Nunca se
// publica nada solo: un admin aprueba o descarta cada candidato aquí. Al
// aprobar, se crea la lección real dentro del curso contenedor de su tema.
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, Linking, RefreshControl, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type Candidato = {
  id: string
  tema: string
  curso_id: string
  youtube_url: string
  titulo: string
  descripcion: string | null
  canal: string | null
  miniatura_url: string | null
  duracion_segundos: number | null
}

const TEAL = '#1a6470'
const TEMAS: Record<string, { label: string; icon: string }> = {
  ventas:               { label: 'Ventas',                 icon: '💰' },
  inmobiliario:         { label: 'Inmobiliario',            icon: '🏠' },
  superacion_personal:  { label: 'Superación personal',     icon: '🚀' },
  administracion_tiempo:{ label: 'Administración del tiempo', icon: '⏱️' },
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Error', msg)
}

function fmtDuracion(s: number | null): string {
  if (!s) return ''
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function UniversityVideosCola() {
  useSupervisorBlock()
  const c = useColors()
  const [lista, setLista] = useState<Candidato[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data } = await supabase.from('vu_video_candidatos')
      .select('id, tema, curso_id, youtube_url, titulo, descripcion, canal, miniatura_url, duracion_segundos')
      .eq('estado', 'pendiente')
      .order('encontrado_en', { ascending: false })
    setLista((data ?? []) as Candidato[])
    setLoading(false)
    setRefreshing(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar(true) }, [cargar]))

  async function aprobar(cand: Candidato) {
    setProcesando(cand.id)
    try {
      const { data: { user } } = await getUsuarioActual()
      const { data: ultima } = await supabase.from('vu_lecciones')
        .select('orden').eq('curso_id', cand.curso_id).order('orden', { ascending: false }).limit(1).maybeSingle()
      const siguienteOrden = (ultima?.orden ?? 0) + 1

      const { data: leccion, error: eLec } = await supabase.from('vu_lecciones').insert({
        curso_id: cand.curso_id,
        titulo: cand.titulo,
        descripcion: cand.descripcion,
        youtube_url: cand.youtube_url,
        orden: siguienteOrden,
      }).select('id').single()
      if (eLec) throw eLec

      await supabase.from('vu_video_candidatos').update({
        estado: 'aprobado', leccion_id: leccion.id, revisado_por: user?.id ?? null, revisado_en: new Date().toISOString(),
      }).eq('id', cand.id)

      setLista(prev => prev.filter(x => x.id !== cand.id))
    } catch (e: any) {
      alerta('Error al aprobar: ' + e.message)
    } finally {
      setProcesando(null)
    }
  }

  async function descartar(cand: Candidato) {
    setProcesando(cand.id)
    const { data: { user } } = await getUsuarioActual()
    await supabase.from('vu_video_candidatos').update({
      estado: 'descartado', revisado_por: user?.id ?? null, revisado_en: new Date().toISOString(),
    }).eq('id', cand.id)
    setLista(prev => prev.filter(x => x.id !== cand.id))
    setProcesando(null)
  }

  async function buscarAhora() {
    setBuscando(true)
    try {
      const { data, error } = await supabase.functions.invoke('university-buscar-videos')
      if (error) {
        // El SDK solo da "Edge Function returned a non-2xx status code" — el
        // motivo real (falta YOUTUBE_API_KEY, no autorizado, etc.) viene en el
        // body de la respuesta, que hay que leer aparte de error.context.
        const body = await (error as any)?.context?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      if (data?.ok === false) throw new Error(data.error ?? 'Error desconocido')
      const resumen = data?.resumen ?? {}
      const total = Object.values(resumen).reduce((a: number, b: any) => a + Number(b ?? 0), 0)
      alerta(total > 0
        ? `Se encontraron ${total} video${total !== 1 ? 's' : ''} nuevo${total !== 1 ? 's' : ''}.`
        : 'No se encontraron videos nuevos (puede que ya estén todos en la cola).')
      await cargar(true)
    } catch (e: any) {
      alerta('Error al buscar: ' + (e.message ?? String(e)))
    } finally {
      setBuscando(false)
    }
  }

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(true) }} tintColor={TEAL} />}
    >
      <Text style={[st.h1, { color: c.text }]}>🎬 Cola de videos</Text>
      <Text style={[st.sub, { color: c.textMute }]}>
        Candidatos encontrados automáticamente en YouTube. {lista.length} pendiente{lista.length !== 1 ? 's' : ''} de revisión.
      </Text>

      <TouchableOpacity style={[st.btnBuscar, buscando && { opacity: 0.6 }]} onPress={buscarAhora} disabled={buscando}>
        {buscando
          ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.btnBuscarTxt}>Buscando en YouTube…</Text></>
          : <><Ionicons name="search" size={16} color="#fff" /><Text style={st.btnBuscarTxt}>Buscar videos ahora</Text></>}
      </TouchableOpacity>

      {lista.length === 0 ? (
        <Text style={[st.vacio, { color: c.textMute }]}>
          No hay candidatos pendientes. Se buscan solos cada lunes — o pídele a quien administre Supabase que dispare la función a mano.
        </Text>
      ) : lista.map(cand => {
        const t = TEMAS[cand.tema]
        return (
          <View key={cand.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={st.temaRow}>
              <Text style={st.temaTxt}>{t ? `${t.icon} ${t.label}` : cand.tema}</Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(cand.youtube_url)} activeOpacity={0.85}>
              {cand.miniatura_url ? (
                <Image source={{ uri: cand.miniatura_url }} style={st.miniatura} resizeMode="cover" />
              ) : null}
              {cand.duracion_segundos ? (
                <View style={st.duracionBadge}><Text style={st.duracionTxt}>{fmtDuracion(cand.duracion_segundos)}</Text></View>
              ) : null}
            </TouchableOpacity>
            <View style={{ padding: 12 }}>
              <Text style={[st.titulo, { color: c.text }]} numberOfLines={2}>{cand.titulo}</Text>
              {cand.canal ? <Text style={[st.canal, { color: c.textMute }]}>{cand.canal}</Text> : null}
              {cand.descripcion ? <Text style={[st.desc, { color: c.textSub }]} numberOfLines={3}>{cand.descripcion}</Text> : null}

              <View style={st.acciones}>
                <TouchableOpacity
                  style={[st.btn, st.btnVer, { borderColor: c.border }]}
                  onPress={() => Linking.openURL(cand.youtube_url)}
                >
                  <Ionicons name="logo-youtube" size={16} color="#c0392b" />
                  <Text style={[st.btnTxt, { color: c.textSub }]}>Ver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.btn, st.btnDescartar]}
                  disabled={procesando === cand.id}
                  onPress={() => descartar(cand)}
                >
                  {procesando === cand.id
                    ? <ActivityIndicator size="small" color="#dc2626" />
                    : <><Ionicons name="close" size={16} color="#dc2626" /><Text style={[st.btnTxt, { color: '#dc2626' }]}>Descartar</Text></>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.btn, st.btnAprobar]}
                  disabled={procesando === cand.id}
                  onPress={() => aprobar(cand)}
                >
                  {procesando === cand.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={[st.btnTxt, { color: '#fff' }]}>Aprobar</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 14 },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginTop: 30 },
  btnBuscar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: TEAL, borderRadius: 10, paddingVertical: 12, marginBottom: 16 },
  btnBuscarTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  temaRow: { paddingHorizontal: 12, paddingTop: 10 },
  temaTxt: { fontSize: 11.5, fontWeight: '800', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniatura: { width: '100%', aspectRatio: 16 / 9, marginTop: 6, backgroundColor: '#0003' },
  duracionBadge: { position: 'absolute', right: 8, bottom: 8, backgroundColor: '#000000cc', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  duracionTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  titulo: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  canal: { fontSize: 12, marginBottom: 6 },
  desc: { fontSize: 12.5, lineHeight: 17, marginBottom: 10 },
  acciones: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 10 },
  btnTxt: { fontSize: 12.5, fontWeight: '700' },
  btnVer: { borderWidth: 1 },
  btnDescartar: { backgroundColor: '#fee2e2' },
  btnAprobar: { backgroundColor: '#2e7d32' },
})
