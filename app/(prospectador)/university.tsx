import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

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

export default function University() {
  const [cursos, setCursos] = useState<CursoCard[]>([])
  const [totalPuntos, setTotalPuntos] = useState(0)
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [loading, setLoading] = useState(true)

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
    ] = await Promise.all([
      supabase.from('profiles').select('nombre').eq('id', user.id).single(),
      supabase.from('vu_cursos').select('id, titulo, descripcion_corta, imagen_url, nivel, categoria, instructor, duracion_texto, vu_lecciones(id)').eq('publicado', true).order('orden'),
      supabase.from('vu_progreso').select('leccion_id, curso_id').eq('user_id', user.id),
      supabase.from('vu_certificados').select('curso_id').eq('user_id', user.id),
      supabase.from('vu_puntos').select('puntos').eq('user_id', user.id),
    ])

    setNombreUsuario(perfil?.nombre ?? 'Prospectador')

    const completadasPorCurso = new Map<string, number>()
    for (const p of progresoData ?? []) {
      completadasPorCurso.set(p.curso_id, (completadasPorCurso.get(p.curso_id) ?? 0) + 1)
    }
    const certSet = new Set((certData ?? []).map((c: any) => c.curso_id))
    const pts = (puntosData ?? []).reduce((sum: number, r: any) => sum + (r.puntos ?? 0), 0)
    setTotalPuntos(pts)

    const cards: CursoCard[] = (cursosData ?? []).map((c: any) => ({
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
    }))

    setCursos(cards)
    setLoading(false)
  }

  const totalCerts = cursos.filter((c) => c.tieneCertificado).length
  const enProgreso = cursos.filter((c) => c.completadas > 0 && !c.tieneCertificado).length
  const completados = cursos.filter((c) => c.tieneCertificado).length

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 40 }}>
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
      <View style={estilos.bienvenida}>
        <Text style={estilos.bienvenidaText}>¡Hola, {nombreUsuario}!</Text>
        <Text style={estilos.bienvenidaSub}>Sigue aprendiendo y ganando puntos</Text>
      </View>

      {/* Stats */}
      <View style={estilos.statsRow}>
        <View style={estilos.statCard}>
          <Text style={estilos.statNum}>{cursos.length}</Text>
          <Text style={estilos.statLabel}>Disponibles</Text>
        </View>
        <View style={[estilos.statCard, { borderColor: '#e65100' }]}>
          <Text style={[estilos.statNum, { color: '#e65100' }]}>{enProgreso}</Text>
          <Text style={estilos.statLabel}>En progreso</Text>
        </View>
        <View style={[estilos.statCard, { borderColor: '#2e7d32' }]}>
          <Text style={[estilos.statNum, { color: '#2e7d32' }]}>{completados}</Text>
          <Text style={estilos.statLabel}>Completados</Text>
        </View>
        <View style={[estilos.statCard, { borderColor: '#c9a84c' }]}>
          <Text style={[estilos.statNum, { color: '#c9a84c' }]}>{totalCerts}</Text>
          <Text style={estilos.statLabel}>Certificados</Text>
        </View>
      </View>

      {/* Cursos */}
      <Text style={estilos.seccion}>Cursos disponibles</Text>

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
            ? Math.round((curso.completadas / curso.totalLecciones) * 100)
            : 0
          const nivelColor = NIVEL_COLOR[curso.nivel] ?? '#555'
          return (
            <TouchableOpacity
              key={curso.id}
              style={estilos.card}
              onPress={() => router.push(`/(prospectador)/university-curso?id=${curso.id}`)}
              activeOpacity={0.85}
            >
              {/* Portada */}
              {curso.imagen_url ? (
                <Image source={{ uri: curso.imagen_url }} style={estilos.cardImg} />
              ) : (
                <View style={estilos.cardImgPlaceholder}>
                  <Text style={estilos.cardImgIcon}>🎓</Text>
                </View>
              )}

              <View style={estilos.cardBody}>
                {/* Badges */}
                <View style={estilos.badgeRow}>
                  <View style={[estilos.nivelBadge, { backgroundColor: nivelColor + '20', borderColor: nivelColor }]}>
                    <Text style={[estilos.nivelText, { color: nivelColor }]}>
                      {curso.nivel.charAt(0).toUpperCase() + curso.nivel.slice(1)}
                    </Text>
                  </View>
                  <Text style={estilos.categoriaText}>{curso.categoria}</Text>
                  {curso.tieneCertificado && (
                    <Text style={estilos.certBadge}>🏆 Completado</Text>
                  )}
                </View>

                <Text style={estilos.cardTitulo}>{curso.titulo}</Text>
                {curso.descripcion_corta && (
                  <Text style={estilos.cardDesc} numberOfLines={2}>{curso.descripcion_corta}</Text>
                )}

                <View style={estilos.metaRow}>
                  <Text style={estilos.metaText}>👤 {curso.instructor}</Text>
                  {curso.duracion_texto && (
                    <Text style={estilos.metaText}>⏱ {curso.duracion_texto}</Text>
                  )}
                </View>

                {/* Progreso */}
                <View style={estilos.progresoRow}>
                  <BarraProgreso pct={pct} />
                  <Text style={estilos.progresoLabel}>{curso.completadas}/{curso.totalLecciones} lecciones</Text>
                </View>

                <TouchableOpacity
                  style={[estilos.btnEntrar, curso.tieneCertificado && estilos.btnEntrarDone]}
                  onPress={() => router.push(`/(prospectador)/university-curso?id=${curso.id}`)}
                >
                  <Text style={estilos.btnEntrarText}>
                    {curso.tieneCertificado ? '🏆 Ver certificado' : curso.completadas > 0 ? '▶ Continuar' : '▶ Comenzar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )
        })
      )}
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: {
    backgroundColor: '#1a6470',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: { fontSize: 32 },
  logoTitle: { color: '#c9a84c', fontSize: 18, fontWeight: '800' },
  logoSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
  puntosChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#c9a84c', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  puntosIcon: { fontSize: 14 },
  puntosText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bienvenida: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  bienvenidaText: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  bienvenidaSub: { fontSize: 12, color: '#888', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#1a6470',
  },
  statNum: { fontSize: 20, fontWeight: '800', color: '#1a6470' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2, textAlign: 'center' },
  seccion: {
    fontSize: 13, fontWeight: '700', color: '#1a6470',
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginHorizontal: 16, marginBottom: 8,
  },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#aaa', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8eef0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImg: { width: '100%', height: 160 },
  cardImgPlaceholder: {
    width: '100%', height: 160,
    backgroundColor: '#1a6470',
    alignItems: 'center', justifyContent: 'center',
  },
  cardImgIcon: { fontSize: 52 },
  cardBody: { padding: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  nivelBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  nivelText: { fontSize: 10, fontWeight: '700' },
  categoriaText: { fontSize: 11, color: '#888' },
  certBadge: { fontSize: 11, color: '#c9a84c', fontWeight: '700' },
  cardTitulo: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  metaText: { fontSize: 11, color: '#888' },
  progresoRow: { marginBottom: 14 },
  progresoLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  barraFondo: { height: 6, backgroundColor: '#e8eef0', borderRadius: 3 },
  barraRelleno: { height: 6, backgroundColor: '#1a6470', borderRadius: 3 },
  btnEntrar: {
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnEntrarDone: { backgroundColor: '#c9a84c' },
  btnEntrarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
