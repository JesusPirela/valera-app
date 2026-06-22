import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

const INTRO_KEY = '@vu_intro_seen'

type CursoCard = {
  id: string
  titulo: string
  descripcion_corta: string | null
  imagen_url: string | null
  nivel: string
  categoria: string
  instructor: string
  duracion_texto: string | null
  totalLecciones: number
  completadas: number
  tieneCertificado: boolean
  es_certificacion: boolean
}

const NIVEL_COLOR: Record<string, string> = {
  basico: '#2e7d32',
  intermedio: '#e65100',
  avanzado: '#6a1b9a',
}

function BarraProgreso({ pct }: { pct: number }) {
  return (
    <View style={estilos.barraFondo}>
      <View style={[estilos.barraRelleno, { width: `${Math.min(100, pct)}%` as any }]} />
    </View>
  )
}

function VideoEmbed({ url }: { url: string }) {
  const embed = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)
  const src = embed ? `https://www.youtube.com/embed/${embed[1]}?autoplay=1&rel=0` : url
  if (Platform.OS !== 'web') return null
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9 }}>
      {/* @ts-ignore */}
      <iframe src={src} style={{ width: '100%', height: '100%', border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen title="Intro Valera University" />
    </View>
  )
}

export default function University() {
  const c = useColors()
  const [cursos, setCursos] = useState<CursoCard[]>([])
  const [totalPuntos, setTotalPuntos] = useState(0)
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [loading, setLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(false)
  const [introUrl, setIntroUrl] = useState('')
  const [introTitulo, setIntroTitulo] = useState('Bienvenido a Valera University')

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [
      { data: perfil },
      { data: cursosData },
      { data: progresoData },
      { data: certData },
      { data: puntosData },
      { data: configData },
    ] = await Promise.all([
      supabase.from('profiles').select('nombre').eq('id', user.id).single(),
      supabase.from('vu_cursos').select('id, titulo, descripcion_corta, imagen_url, nivel, categoria, instructor, duracion_texto, es_certificacion, vu_lecciones(id)').eq('publicado', true).order('orden'),
      supabase.from('vu_progreso').select('leccion_id, curso_id').eq('user_id', user.id),
      supabase.from('vu_certificados').select('curso_id').eq('user_id', user.id),
      supabase.from('vu_puntos').select('puntos').eq('user_id', user.id),
      supabase.from('vu_config').select('clave, valor').in('clave', ['intro_video_url', 'intro_video_titulo']),
    ])

    setNombreUsuario(perfil?.nombre ?? 'Prospectador')

    // Config de intro
    const cfg = Object.fromEntries((configData ?? []).map((r: any) => [r.clave, r.valor]))
    const videoUrl = cfg['intro_video_url'] ?? ''
    const videoTitulo = cfg['intro_video_titulo'] ?? 'Bienvenido a Valera University'
    setIntroUrl(videoUrl)
    setIntroTitulo(videoTitulo)

    // Mostrar intro si hay video y no se ha visto
    if (videoUrl) {
      const visto = await AsyncStorage.getItem(INTRO_KEY)
      if (!visto) setShowIntro(true)
    }

    const completadasPorCurso = new Map<string, number>()
    for (const p of progresoData ?? []) {
      completadasPorCurso.set(p.curso_id, (completadasPorCurso.get(p.curso_id) ?? 0) + 1)
    }
    const certSet = new Set((certData ?? []).map((c: any) => c.curso_id))
    const pts = (puntosData ?? []).reduce((sum: number, r: any) => sum + (r.puntos ?? 0), 0)
    setTotalPuntos(pts)

    setCursos((cursosData ?? []).map((c: any) => ({
      id: c.id,
      titulo: c.titulo,
      descripcion_corta: c.descripcion_corta,
      imagen_url: c.imagen_url,
      nivel: c.nivel ?? 'basico',
      categoria: c.categoria ?? 'general',
      instructor: c.instructor ?? 'Valera University',
      duracion_texto: c.duracion_texto,
      totalLecciones: (c.vu_lecciones ?? []).length,
      completadas: completadasPorCurso.get(c.id) ?? 0,
      tieneCertificado: certSet.has(c.id),
      es_certificacion: c.es_certificacion ?? false,
    })))
    setLoading(false)
  }

  async function cerrarIntro() {
    await AsyncStorage.setItem(INTRO_KEY, '1')
    setShowIntro(false)
  }

  const totalCerts = cursos.filter((c) => c.es_certificacion && c.tieneCertificado).length
  const enProgreso = cursos.filter((c) => c.completadas > 0 && !c.tieneCertificado).length

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* ── Modal de video de introducción ── */}
      <Modal visible={showIntro} transparent animationType="fade" onRequestClose={cerrarIntro}>
        <View style={estilos.modalOverlay}>
          <View style={[estilos.modalCard, { backgroundColor: c.card }]}>
            <View style={estilos.modalHeader}>
              <Text style={estilos.modalTitulo}>🎓 {introTitulo}</Text>
              <TouchableOpacity onPress={cerrarIntro} style={estilos.modalCloseBtn}>
                <Text style={estilos.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={estilos.modalVideo}>
              <VideoEmbed url={introUrl} />
            </View>
            <View style={estilos.modalFooter}>
              <TouchableOpacity style={estilos.btnSaltar} onPress={cerrarIntro}>
                <Text style={estilos.btnSaltarText}>Saltar introducción</Text>
              </TouchableOpacity>
              <TouchableOpacity style={estilos.btnCerrarModal} onPress={cerrarIntro}>
                <Text style={estilos.btnCerrarModalText}>Entendido →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={[estilos.container, { backgroundColor: c.bg }]} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={estilos.header}>
          <View style={estilos.headerLogo}>
            <Text style={estilos.logoIcon}>🎓</Text>
            <View>
              <Text style={estilos.logoTitle}>Valera University</Text>
              <Text style={estilos.logoSub}>Tu plataforma de capacitación</Text>
            </View>
          </View>
          <View style={estilos.puntosChip}>
            <Text style={estilos.puntosIcon}>⭐</Text>
            <Text style={estilos.puntosText}>{totalPuntos} pts</Text>
          </View>
        </View>

        {/* Bienvenida */}
        <View style={[estilos.bienvenida, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <Text style={[estilos.bienvenidaText, { color: c.text }]}>¡Hola, {nombreUsuario}!</Text>
          <Text style={[estilos.bienvenidaSub, { color: c.textMute }]}>Sigue aprendiendo y ganando puntos</Text>
        </View>

        {/* Stats */}
        <View style={[estilos.statsRow, { backgroundColor: c.bg }]}>
          <View style={[estilos.statCard, { backgroundColor: c.card }]}>
            <Text style={estilos.statNum}>{cursos.length}</Text>
            <Text style={[estilos.statLabel, { color: c.textMute }]}>Disponibles</Text>
          </View>
          <View style={[estilos.statCard, { backgroundColor: c.card, borderColor: '#e65100' }]}>
            <Text style={[estilos.statNum, { color: '#e65100' }]}>{enProgreso}</Text>
            <Text style={[estilos.statLabel, { color: c.textMute }]}>En progreso</Text>
          </View>
          <View style={[estilos.statCard, { backgroundColor: c.card, borderColor: '#2e7d32' }]}>
            <Text style={[estilos.statNum, { color: '#2e7d32' }]}>{cursos.filter(cv => cv.tieneCertificado).length}</Text>
            <Text style={[estilos.statLabel, { color: c.textMute }]}>Completados</Text>
          </View>
          <View style={[estilos.statCard, { backgroundColor: c.card, borderColor: '#c9a84c' }]}>
            <Text style={[estilos.statNum, { color: '#c9a84c' }]}>{totalCerts}</Text>
            <Text style={[estilos.statLabel, { color: c.textMute }]}>Certificados</Text>
          </View>
        </View>

        {/* Ver intro de nuevo */}
        {introUrl ? (
          <TouchableOpacity
            style={[estilos.btnVerIntro, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => setShowIntro(true)}
          >
            <Text style={estilos.btnVerIntroText}>▶ Ver video de introducción</Text>
          </TouchableOpacity>
        ) : null}

        {/* Cursos */}
        <View style={estilos.seccionRow}>
          <View style={estilos.seccionAccent} />
          <Text style={estilos.seccion}>Cursos disponibles</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
        ) : cursos.length === 0 ? (
          <View style={estilos.empty}>
            <Text style={estilos.emptyIcon}>📚</Text>
            <Text style={estilos.emptyText}>No hay cursos publicados aún</Text>
          </View>
        ) : (
          cursos.map((curso) => {
            const pct = curso.totalLecciones > 0
              ? Math.round((curso.completadas / curso.totalLecciones) * 100) : 0
            const nivelColor = NIVEL_COLOR[curso.nivel] ?? '#555'
            const nivelLabel = curso.nivel.charAt(0).toUpperCase() + curso.nivel.slice(1)
            const inicial = curso.titulo.trim().charAt(0).toUpperCase()
            return (
              <TouchableOpacity
                key={curso.id}
                style={[estilos.card, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => router.push(`/(prospectador)/university-curso?id=${curso.id}`)}
                activeOpacity={0.85}
              >
                {/* Imagen o placeholder con letra inicial */}
                <View style={estilos.cardImgWrapper}>
                  {curso.imagen_url ? (
                    <Image source={{ uri: curso.imagen_url }} style={estilos.cardImg} />
                  ) : (
                    <View style={[estilos.cardImgPlaceholder, { backgroundColor: nivelColor }]}>
                      <Text style={estilos.cardImgInit}>{inicial}</Text>
                      <Text style={estilos.cardImgCat}>{curso.categoria.toUpperCase()}</Text>
                    </View>
                  )}
                  {/* Badges sobre la imagen */}
                  <View style={estilos.imgOverlayRow}>
                    <View style={[estilos.nivelBadgeImg, { backgroundColor: nivelColor }]}>
                      <Text style={estilos.nivelBadgeImgText}>{nivelLabel}</Text>
                    </View>
                    {curso.tieneCertificado && (
                      <View style={estilos.completadoBadge}>
                        <Text style={estilos.completadoBadgeText}>
                          {curso.es_certificacion ? '🏆 Certificado' : '✅ Completado'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={estilos.cardBody}>
                  <Text style={estilos.categoriaChip}>{curso.categoria}</Text>
                  <Text style={[estilos.cardTitulo, { color: c.text }]}>{curso.titulo}</Text>
                  {curso.descripcion_corta && (
                    <Text style={[estilos.cardDesc, { color: c.textSub }]} numberOfLines={2}>{curso.descripcion_corta}</Text>
                  )}
                  <View style={estilos.metaRow}>
                    <Text style={[estilos.metaText, { color: c.textMute }]}>👤 {curso.instructor}</Text>
                    {curso.duracion_texto && <Text style={[estilos.metaText, { color: c.textMute }]}>⏱ {curso.duracion_texto}</Text>}
                  </View>
                  <View style={estilos.progresoRow}>
                    <View style={estilos.progresoTopRow}>
                      <Text style={estilos.progresoLabel}>{curso.completadas}/{curso.totalLecciones} lecciones</Text>
                      <Text style={[estilos.progresoLabel, { color: pct === 100 ? '#2e7d32' : '#1a6470', fontWeight: '700' }]}>{pct}%</Text>
                    </View>
                    <BarraProgreso pct={pct} />
                  </View>
                  <TouchableOpacity
                    style={[estilos.btnEntrar, curso.tieneCertificado && estilos.btnEntrarDone]}
                    onPress={() => router.push(`/(prospectador)/university-curso?id=${curso.id}`)}
                  >
                    <Text style={estilos.btnEntrarText}>
                      {curso.tieneCertificado
                        ? (curso.es_certificacion ? '🏆 Ver certificado' : '✅ Ver curso')
                        : (curso.completadas > 0 ? '▶  Continuar' : '▶  Comenzar')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  // Modal intro
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, overflow: 'hidden' },
  modalHeader: { backgroundColor: '#1a6470', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  modalTitulo: { color: '#c9a84c', fontSize: 16, fontWeight: '800', flex: 1 },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '700' },
  modalVideo: { backgroundColor: '#000' },
  modalFooter: { flexDirection: 'row', gap: 10, padding: 16 },
  btnSaltar: { flex: 1, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  btnSaltarText: { color: '#888', fontSize: 14 },
  btnCerrarModal: { flex: 1, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnCerrarModalText: { color: '#c9a84c', fontWeight: '700', fontSize: 14 },
  btnVerIntro: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1a6470', borderRadius: 10, marginHorizontal: 16, marginBottom: 12, paddingVertical: 10, alignItems: 'center' },
  btnVerIntroText: { color: '#1a6470', fontWeight: '600', fontSize: 13 },
  // Layout
  header: { backgroundColor: '#1a6470', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLogo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: { fontSize: 32 },
  logoTitle: { color: '#c9a84c', fontSize: 18, fontWeight: '800' },
  logoSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
  puntosChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#c9a84c', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  puntosIcon: { fontSize: 14 },
  puntosText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bienvenida: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  bienvenidaText: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  bienvenidaSub: { fontSize: 12, color: '#888', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1a6470' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#1a6470' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },
  seccionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  seccionAccent: { width: 4, height: 16, backgroundColor: '#c9a84c', borderRadius: 2 },
  seccion: { fontSize: 13, fontWeight: '700', color: '#1a6470', letterSpacing: 0.5, textTransform: 'uppercase' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#aaa', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef0', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  cardImgWrapper: { position: 'relative' },
  cardImg: { width: '100%', height: 165 },
  cardImgPlaceholder: { width: '100%', height: 165, alignItems: 'center', justifyContent: 'center', gap: 4 },
  cardImgInit: { fontSize: 56, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  cardImgCat: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5 },
  imgOverlayRow: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', gap: 6 },
  nivelBadgeImg: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  nivelBadgeImgText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  completadoBadge: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  completadoBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  cardBody: { padding: 14 },
  categoriaChip: { fontSize: 10, fontWeight: '600', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  cardTitulo: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginBottom: 4, lineHeight: 22 },
  cardDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  metaText: { fontSize: 11, color: '#888' },
  progresoRow: { marginBottom: 14 },
  progresoTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progresoLabel: { fontSize: 11, color: '#888' },
  barraFondo: { height: 6, backgroundColor: '#e8eef0', borderRadius: 3 },
  barraRelleno: { height: 6, backgroundColor: '#1a6470', borderRadius: 3 },
  btnEntrar: { backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnEntrarDone: { backgroundColor: '#c9a84c' },
  btnEntrarText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
})
