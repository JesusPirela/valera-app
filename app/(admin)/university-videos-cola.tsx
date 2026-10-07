// Cola de revisión + publicación de videos encontrados automáticamente para
// Valera University (ver supabase/functions/university-buscar-videos). Nunca
// se publica nada solo apenas se encuentra: un admin aprueba o descarta cada
// candidato aquí. "Aprobar" ya NO crea la lección de inmediato — la mete a
// una cola de publicación que un cron vacía de a UNO, lunes/miércoles/viernes
// (ver vu_publicar_siguiente_video() / 20261007_university_cola_publicacion.sql),
// para que entren los 3 videos semanales a ese ritmo aunque se aprueben
// varios de un jalón.
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

// Próximas N fechas de publicación (lunes=1, miércoles=3, viernes=5), solo
// para mostrar un estimado junto a cada posición de la cola — el cron real
// corre 9:00 am esos días y siempre publica el más antiguo primero.
function proximasFechasPublicacion(n: number): Date[] {
  const dias = [1, 3, 5]
  const fechas: Date[] = []
  const cursor = new Date()
  cursor.setHours(9, 0, 0, 0)
  while (fechas.length < n) {
    cursor.setDate(cursor.getDate() + 1)
    if (dias.includes(cursor.getDay())) fechas.push(new Date(cursor))
  }
  return fechas
}
function fmtFechaCorta(d: Date): string {
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function UniversityVideosCola() {
  useSupervisorBlock()
  const c = useColors()
  const [pendientes, setPendientes] = useState<Candidato[]>([])
  const [enCola, setEnCola] = useState<Candidato[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [publicando, setPublicando] = useState(false)

  const COLS = 'id, tema, curso_id, youtube_url, titulo, descripcion, canal, miniatura_url, duracion_segundos'

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [{ data: pend }, { data: cola }] = await Promise.all([
      supabase.from('vu_video_candidatos').select(COLS).eq('estado', 'pendiente').order('encontrado_en', { ascending: false }),
      supabase.from('vu_video_candidatos').select(COLS).eq('estado', 'aprobado').order('revisado_en', { ascending: true }),
    ])
    setPendientes((pend ?? []) as Candidato[])
    setEnCola((cola ?? []) as Candidato[])
    setLoading(false)
    setRefreshing(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar(true) }, [cargar]))

  // Ya NO crea la lección: solo mete el candidato a la cola de publicación.
  // El cron (lunes/miércoles/viernes) es quien la crea de verdad.
  async function aprobar(cand: Candidato) {
    setProcesando(cand.id)
    const { data: { user } } = await getUsuarioActual()
    const { error } = await supabase.from('vu_video_candidatos').update({
      estado: 'aprobado', revisado_por: user?.id ?? null, revisado_en: new Date().toISOString(),
    }).eq('id', cand.id)
    if (!error) {
      setPendientes(prev => prev.filter(x => x.id !== cand.id))
      setEnCola(prev => [...prev, cand])
    } else {
      alerta('Error al aprobar: ' + error.message)
    }
    setProcesando(null)
  }

  async function descartar(cand: Candidato) {
    setProcesando(cand.id)
    const { data: { user } } = await getUsuarioActual()
    await supabase.from('vu_video_candidatos').update({
      estado: 'descartado', revisado_por: user?.id ?? null, revisado_en: new Date().toISOString(),
    }).eq('id', cand.id)
    setPendientes(prev => prev.filter(x => x.id !== cand.id))
    setProcesando(null)
  }

  // Lo regresa a "pendientes" (no lo descarta) por si se aprobó por error.
  async function quitarDeCola(cand: Candidato) {
    setProcesando(cand.id)
    const { error } = await supabase.from('vu_video_candidatos').update({
      estado: 'pendiente', revisado_por: null, revisado_en: null,
    }).eq('id', cand.id)
    if (!error) {
      setEnCola(prev => prev.filter(x => x.id !== cand.id))
      setPendientes(prev => [cand, ...prev])
    } else {
      alerta('Error: ' + error.message)
    }
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

  // Dispara a mano lo que normalmente hace el cron del lunes/miércoles/viernes
  // — publica el siguiente de la cola, sin esperar al día que toque.
  async function publicarSiguienteAhora() {
    setPublicando(true)
    try {
      const { data, error } = await supabase.rpc('vu_publicar_siguiente_video')
      if (error) throw error
      alerta(data ? 'Se publicó el siguiente video de la cola.' : 'La cola de publicación está vacía.')
      await cargar(true)
    } catch (e: any) {
      alerta('Error al publicar: ' + (e.message ?? String(e)))
    } finally {
      setPublicando(false)
    }
  }

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  const fechasCola = proximasFechasPublicacion(enCola.length)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(true) }} tintColor={TEAL} />}
    >
      <Text style={[st.h1, { color: c.text }]}>🎬 Cola de videos</Text>
      <Text style={[st.sub, { color: c.textMute }]}>
        Candidatos encontrados automáticamente en YouTube. {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} de revisión.
      </Text>

      <TouchableOpacity style={[st.btnBuscar, buscando && { opacity: 0.6 }]} onPress={buscarAhora} disabled={buscando}>
        {buscando
          ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.btnBuscarTxt}>Buscando en YouTube…</Text></>
          : <><Ionicons name="search" size={16} color="#fff" /><Text style={st.btnBuscarTxt}>Buscar videos ahora</Text></>}
      </TouchableOpacity>

      {/* ── Cola de publicación: se suben solos lunes/miércoles/viernes ── */}
      {enCola.length > 0 && (
        <View style={[st.colaBox, { backgroundColor: c.card, borderColor: '#7c3aed55' }]}>
          <View style={st.colaHeader}>
            <Text style={[st.colaTitulo, { color: c.text }]}>
              📅 En cola para publicar ({enCola.length})
            </Text>
            <TouchableOpacity style={[st.btnPublicar, publicando && { opacity: 0.6 }]} onPress={publicarSiguienteAhora} disabled={publicando}>
              {publicando
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={st.btnPublicarTxt}>Publicar siguiente ahora</Text>}
            </TouchableOpacity>
          </View>
          <Text style={[st.colaSub, { color: c.textMute }]}>
            Se publican solos de a uno, lunes/miércoles/viernes 9:00 am — el más antiguo primero.
          </Text>
          {enCola.map((cand, i) => (
            <View key={cand.id} style={[st.colaFila, { borderTopColor: c.border }]}>
              <View style={st.colaPos}><Text style={st.colaPosTxt}>{i + 1}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[st.colaFilaTitulo, { color: c.text }]} numberOfLines={1}>{cand.titulo}</Text>
                <Text style={[st.colaFilaMeta, { color: c.textMute }]}>
                  {TEMAS[cand.tema]?.label ?? cand.tema} · aprox. {fmtFechaCorta(fechasCola[i])}
                </Text>
              </View>
              <TouchableOpacity
                style={st.colaQuitarBtn}
                disabled={procesando === cand.id}
                onPress={() => quitarDeCola(cand)}
              >
                {procesando === cand.id
                  ? <ActivityIndicator size="small" color="#dc2626" />
                  : <Text style={st.colaQuitarTxt}>Quitar</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {pendientes.length === 0 ? (
        <Text style={[st.vacio, { color: c.textMute }]}>
          No hay candidatos pendientes. Se buscan solos cada lunes — o pídele a quien administre Supabase que dispare la función a mano.
        </Text>
      ) : (
      <View style={st.grid}>
      {pendientes.map(cand => {
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
      </View>
      )}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 14 },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginTop: 30 },
  btnBuscar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: TEAL, borderRadius: 10, paddingVertical: 10, marginBottom: 16, maxWidth: 260 },
  btnBuscarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  colaBox: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 18 },
  colaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  colaTitulo: { fontSize: 14.5, fontWeight: '800' },
  colaSub: { fontSize: 11, marginTop: 3, marginBottom: 4 },
  btnPublicar: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnPublicarTxt: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
  colaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  colaPos: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#7c3aed22', alignItems: 'center', justifyContent: 'center' },
  colaPosTxt: { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  colaFilaTitulo: { fontSize: 12.5, fontWeight: '700' },
  colaFilaMeta: { fontSize: 10.5, marginTop: 1 },
  colaQuitarBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  colaQuitarTxt: { fontSize: 11, fontWeight: '700', color: '#dc2626' },

  // Grid responsivo: cada card tiene un ancho fijo chico y el navegador va
  // acomodando las que quepan por fila (RN Web respeta flexWrap como CSS).
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: 240, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  temaRow: { paddingHorizontal: 9, paddingTop: 7 },
  temaTxt: { fontSize: 10, fontWeight: '800', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.3 },
  miniatura: { width: '100%', aspectRatio: 16 / 9, marginTop: 4, backgroundColor: '#0003' },
  duracionBadge: { position: 'absolute', right: 6, bottom: 6, backgroundColor: '#000000cc', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  duracionTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  titulo: { fontSize: 12.5, fontWeight: '800', marginBottom: 2 },
  canal: { fontSize: 10.5, marginBottom: 4 },
  desc: { fontSize: 11, lineHeight: 14.5, marginBottom: 8 },
  acciones: { flexDirection: 'row', gap: 5 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 8, paddingVertical: 7 },
  btnTxt: { fontSize: 10.5, fontWeight: '700' },
  btnVer: { borderWidth: 1 },
  btnDescartar: { backgroundColor: '#fee2e2' },
  btnAprobar: { backgroundColor: '#2e7d32' },
})
