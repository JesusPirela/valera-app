import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Linking,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Leccion = {
  id: string
  titulo: string
  descripcion: string | null
  youtube_url: string | null
  contenido: string | null
  orden: number
  curso_id: string
}

function getEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1` : null
}

function VideoPlayer({ url }: { url: string | null }) {
  const embed = getEmbedUrl(url)
  if (!embed) return null

  if (Platform.OS === 'web') {
    return (
      <View style={vpStyles.container}>
        {/* @ts-ignore — iframe válido en web */}
        <iframe
          src={embed}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          title="Valera University video"
        />
      </View>
    )
  }

  // Nativo: abrir en YouTube
  return (
    <TouchableOpacity style={vpStyles.nativePlaceholder} onPress={() => Linking.openURL(url!)}>
      <Text style={vpStyles.playIcon}>▶</Text>
      <Text style={vpStyles.playText}>Ver video en YouTube</Text>
    </TouchableOpacity>
  )
}

const vpStyles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  nativePlaceholder: {
    width: '100%', aspectRatio: 16 / 9, backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  playIcon: { fontSize: 40, color: '#c9a84c' },
  playText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})

export default function UniversityLeccion() {
  const { id, cursoId } = useLocalSearchParams<{ id: string; cursoId: string }>()

  const [leccion, setLeccion] = useState<Leccion | null>(null)
  const [yaCompletada, setYaCompletada] = useState(false)
  const [completando, setCompletando] = useState(false)
  const [resultado, setResultado] = useState<{ curso_completado: boolean; certificado_nuevo: boolean; puntos: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [id])

  async function cargar() {
    if (!id) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: lecData }, { data: progData }] = await Promise.all([
      supabase.from('vu_lecciones').select('*').eq('id', id).single(),
      supabase.from('vu_progreso').select('id').eq('user_id', user.id).eq('leccion_id', id).maybeSingle(),
    ])

    setLeccion(lecData)
    setYaCompletada(!!progData)
    setLoading(false)
  }

  async function marcarCompletada() {
    if (!leccion || !cursoId || yaCompletada || completando) return
    setCompletando(true)
    try {
      const { data, error } = await supabase.rpc('completar_leccion', {
        p_leccion_id: leccion.id,
        p_curso_id: cursoId,
      })
      if (!error && data) {
        setYaCompletada(true)
        setResultado({
          curso_completado: data.curso_completado,
          certificado_nuevo: data.certificado_nuevo,
          puntos: data.puntos ?? 10,
        })
      }
    } finally {
      setCompletando(false)
    }
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!leccion) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#aaa' }}>Lección no encontrada</Text>
    </View>
  )

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Navegación */}
      <View style={estilos.navBar}>
        <TouchableOpacity onPress={() => router.push(`/(prospectador)/university-curso?id=${cursoId}`)}>
          <Text style={estilos.backText}>← Volver al curso</Text>
        </TouchableOpacity>
        <View style={estilos.numBadge}>
          <Text style={estilos.numBadgeText}>Lección {leccion.orden}</Text>
        </View>
      </View>

      {/* Video */}
      <VideoPlayer url={leccion.youtube_url} />

      {/* Contenido */}
      <View style={estilos.body}>
        <Text style={estilos.titulo}>{leccion.titulo}</Text>

        {leccion.descripcion && (
          <Text style={estilos.descripcion}>{leccion.descripcion}</Text>
        )}

        {leccion.contenido && (
          <View style={estilos.contenidoCard}>
            <Text style={estilos.contenidoLabel}>📝 Notas de la lección</Text>
            <Text style={estilos.contenidoText}>{leccion.contenido}</Text>
          </View>
        )}

        {/* Resultado tras completar */}
        {resultado?.curso_completado && (
          <View style={estilos.cursoDoneCard}>
            <Text style={estilos.cursoDoneIcon}>🎓</Text>
            <Text style={estilos.cursoDoneTitle}>¡Curso completado!</Text>
            <Text style={estilos.cursoDoneSub}>Ganaste 60 puntos y tu certificado ya está disponible</Text>
            <TouchableOpacity
              style={estilos.btnVerCurso}
              onPress={() => router.push(`/(prospectador)/university-curso?id=${cursoId}`)}
            >
              <Text style={estilos.btnVerCursoText}>Ver certificado →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Botón completar */}
        {yaCompletada ? (
          <View style={estilos.completadaBanner}>
            <Text style={estilos.completadaText}>
              ✓ Lección completada · +{resultado?.puntos ?? 10} puntos
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[estilos.btnCompletar, completando && { opacity: 0.6 }]}
            onPress={marcarCompletada}
            disabled={completando}
          >
            {completando
              ? <ActivityIndicator color="#fff" />
              : <Text style={estilos.btnCompletarText}>✓ Marcar como completada · +10 pts</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1a6470',
  },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
  numBadge: { backgroundColor: 'rgba(201,168,76,0.3)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  numBadgeText: { color: '#c9a84c', fontSize: 11, fontWeight: '700' },
  body: { padding: 20 },
  titulo: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 8, lineHeight: 26 },
  descripcion: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 },
  contenidoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e8eef0' },
  contenidoLabel: { fontSize: 12, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  contenidoText: { fontSize: 14, color: '#444', lineHeight: 22 },
  completadaBanner: {
    backgroundColor: '#e8f5e9', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#4caf50', marginBottom: 16,
  },
  completadaText: { color: '#2e7d32', fontWeight: '700', fontSize: 14 },
  btnCompletar: {
    backgroundColor: '#1a6470', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginBottom: 16,
  },
  btnCompletarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cursoDoneCard: {
    backgroundColor: '#c9a84c', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 20,
  },
  cursoDoneIcon: { fontSize: 40, marginBottom: 8 },
  cursoDoneTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cursoDoneSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 14 },
  btnVerCurso: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  btnVerCursoText: { color: '#c9a84c', fontWeight: '700', fontSize: 14 },
})
