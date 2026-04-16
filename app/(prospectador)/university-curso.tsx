import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Curso = {
  id: string
  titulo: string
  descripcion: string | null
  instructor: string
  nivel: string
  categoria: string
  duracion_texto: string | null
}

type Leccion = {
  id: string
  titulo: string
  descripcion: string | null
  orden: number
}

const NIVEL_LABEL: Record<string, string> = {
  basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado',
}

export default function UniversityCurso() {
  const { id: cursoId } = useLocalSearchParams<{ id: string }>()

  const [curso, setCurso] = useState<Curso | null>(null)
  const [lecciones, setLecciones] = useState<Leccion[]>([])
  const [completadasIds, setCompletadasIds] = useState<Set<string>>(new Set())
  const [tieneCert, setTieneCert] = useState(false)
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { cargar() }, [cursoId]))

  async function cargar() {
    if (!cursoId) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [
      { data: cursoData },
      { data: leccionesData },
      { data: progresoData },
      { data: certData },
    ] = await Promise.all([
      supabase.from('vu_cursos').select('id, titulo, descripcion, instructor, nivel, categoria, duracion_texto').eq('id', cursoId).single(),
      supabase.from('vu_lecciones').select('id, titulo, descripcion, orden').eq('curso_id', cursoId).order('orden'),
      supabase.from('vu_progreso').select('leccion_id').eq('user_id', user.id).eq('curso_id', cursoId),
      supabase.from('vu_certificados').select('id').eq('user_id', user.id).eq('curso_id', cursoId).maybeSingle(),
    ])

    setCurso(cursoData)
    setLecciones(leccionesData ?? [])
    setCompletadasIds(new Set((progresoData ?? []).map((p: any) => p.leccion_id)))
    setTieneCert(!!certData)
    setLoading(false)
  }

  function isLocked(leccion: Leccion): boolean {
    if (leccion.orden <= 1) return false
    const anterior = lecciones.find((l) => l.orden === leccion.orden - 1)
    return anterior ? !completadasIds.has(anterior.id) : false
  }

  function primeraLeccionPendiente(): Leccion | null {
    return lecciones.find((l) => !completadasIds.has(l.id) && !isLocked(l)) ?? null
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!curso) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#aaa' }}>Curso no encontrado</Text>
    </View>
  )

  const totalLecciones = lecciones.length
  const pct = totalLecciones > 0 ? Math.round((completadasIds.size / totalLecciones) * 100) : 0
  const siguiente = primeraLeccionPendiente()

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header del curso */}
      <View style={estilos.header}>
        <TouchableOpacity onPress={() => router.back()} style={estilos.backBtn}>
          <Text style={estilos.backText}>← Volver</Text>
        </TouchableOpacity>
        <View style={estilos.headerContent}>
          <View style={estilos.metaRow}>
            <View style={estilos.nivelBadge}>
              <Text style={estilos.nivelText}>{NIVEL_LABEL[curso.nivel] ?? curso.nivel}</Text>
            </View>
            <Text style={estilos.categoriaText}>{curso.categoria}</Text>
          </View>
          <Text style={estilos.titulo}>{curso.titulo}</Text>
          <Text style={estilos.instructor}>👤 {curso.instructor}</Text>
          {curso.duracion_texto && (
            <Text style={estilos.duracion}>⏱ {curso.duracion_texto}</Text>
          )}
        </View>
      </View>

      {/* Progreso */}
      <View style={estilos.progresoCard}>
        <View style={estilos.progresoHeader}>
          <Text style={estilos.progresoLabel}>Tu progreso</Text>
          <Text style={estilos.progresioPct}>{pct}%</Text>
        </View>
        <View style={estilos.barraFondo}>
          <View style={[estilos.barraRelleno, { width: `${pct}%` as any }]} />
        </View>
        <Text style={estilos.progresoSub}>{completadasIds.size} de {totalLecciones} lecciones completadas</Text>

        {tieneCert ? (
          <View style={estilos.certBanner}>
            <Text style={estilos.certText}>🏆 ¡Certificado obtenido! Completaste este curso.</Text>
          </View>
        ) : siguiente ? (
          <TouchableOpacity
            style={estilos.btnContinuar}
            onPress={() => router.push(`/(prospectador)/university-leccion?id=${siguiente.id}&cursoId=${cursoId}`)}
          >
            <Text style={estilos.btnContinuarText}>
              {completadasIds.size === 0 ? '▶ Comenzar curso' : '▶ Continuar donde me quedé'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Descripción */}
      {curso.descripcion && (
        <View style={estilos.descCard}>
          <Text style={estilos.descTitle}>Acerca de este curso</Text>
          <Text style={estilos.descText}>{curso.descripcion}</Text>
        </View>
      )}

      {/* Lista de lecciones */}
      <View style={estilos.leccionesCard}>
        <Text style={estilos.leccionesTitle}>Contenido del curso</Text>
        {lecciones.map((leccion) => {
          const completada = completadasIds.has(leccion.id)
          const bloqueada = isLocked(leccion)
          return (
            <TouchableOpacity
              key={leccion.id}
              style={[
                estilos.leccionRow,
                bloqueada && estilos.leccionRowBloqueada,
                completada && estilos.leccionRowCompletada,
              ]}
              onPress={() => {
                if (bloqueada) return
                router.push(`/(prospectador)/university-leccion?id=${leccion.id}&cursoId=${cursoId}`)
              }}
              activeOpacity={bloqueada ? 1 : 0.7}
            >
              <View style={[
                estilos.leccionNum,
                completada && estilos.leccionNumDone,
                bloqueada && estilos.leccionNumLocked,
              ]}>
                <Text style={[estilos.leccionNumText, (completada || !bloqueada) && { color: completada ? '#fff' : '#1a6470' }]}>
                  {completada ? '✓' : bloqueada ? '🔒' : leccion.orden}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[estilos.leccionNombre, bloqueada && { color: '#bbb' }]}>
                  {leccion.titulo}
                </Text>
                {leccion.descripcion && !bloqueada && (
                  <Text style={estilos.leccionDesc} numberOfLines={1}>{leccion.descripcion}</Text>
                )}
              </View>
              {completada && <Text style={estilos.checkIcon}>+10 pts</Text>}
              {!bloqueada && !completada && <Text style={estilos.chevron}>›</Text>}
            </TouchableOpacity>
          )
        })}
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: { backgroundColor: '#1a6470', padding: 20, paddingTop: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
  headerContent: {},
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  nivelBadge: { backgroundColor: 'rgba(201,168,76,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#c9a84c' },
  nivelText: { color: '#c9a84c', fontSize: 10, fontWeight: '700' },
  categoriaText: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  titulo: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 28, marginBottom: 8 },
  instructor: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 2 },
  duracion: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  progresoCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  progresoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progresoLabel: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  progresioPct: { fontSize: 13, fontWeight: '700', color: '#1a6470' },
  barraFondo: { height: 8, backgroundColor: '#e8eef0', borderRadius: 4, marginBottom: 6 },
  barraRelleno: { height: 8, backgroundColor: '#1a6470', borderRadius: 4 },
  progresoSub: { fontSize: 11, color: '#888', marginBottom: 12 },
  certBanner: { backgroundColor: '#c9a84c', borderRadius: 10, padding: 12, alignItems: 'center' },
  certText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnContinuar: { backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnContinuarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  descCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8eef0' },
  descTitle: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  descText: { fontSize: 13, color: '#555', lineHeight: 20 },
  leccionesCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef0' },
  leccionesTitle: { fontSize: 13, fontWeight: '700', color: '#1a6470', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  leccionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  leccionRowCompletada: { backgroundColor: '#f8fffe' },
  leccionRowBloqueada: { backgroundColor: '#fafafa' },
  leccionNum: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#1a6470', alignItems: 'center', justifyContent: 'center' },
  leccionNumDone: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  leccionNumLocked: { borderColor: '#ddd' },
  leccionNumText: { fontSize: 13, fontWeight: '700', color: '#aaa' },
  leccionNombre: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  leccionDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  checkIcon: { fontSize: 11, color: '#2e7d32', fontWeight: '700' },
  chevron: { fontSize: 20, color: '#bbb', fontWeight: '300' },
})
