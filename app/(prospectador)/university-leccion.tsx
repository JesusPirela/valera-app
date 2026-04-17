import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Linking, TextInput, Alert,
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

type Tarea = {
  id: string
  titulo: string
  descripcion: string | null
  requiere_archivo: boolean
  obligatoria: boolean
}

type Entrega = {
  id: string
  tarea_id: string
  estado: string
  calificacion: number | null
  feedback: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  respuesta_texto: string | null
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
      <View style={vpS.container}>
        {/* @ts-ignore */}
        <iframe src={embed} style={{ width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen title="Valera University" />
      </View>
    )
  }
  return (
    <TouchableOpacity style={vpS.native} onPress={() => Linking.openURL(url!)}>
      <Text style={vpS.playIcon}>▶</Text>
      <Text style={vpS.playText}>Ver video en YouTube</Text>
    </TouchableOpacity>
  )
}
const vpS = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  native: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', gap: 8 },
  playIcon: { fontSize: 40, color: '#c9a84c' },
  playText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})

const ESTADO_INFO: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:       { label: 'Pendiente de revisión', color: '#e65100', bg: '#fff3e0' },
  aprobada:        { label: '✅ Aprobada',            color: '#2e7d32', bg: '#e8f5e9' },
  necesita_mejorar: { label: '📝 Necesita mejorar',  color: '#c0392b', bg: '#fde8e8' },
}

function mostrarError(t: string, m: string) {
  if (Platform.OS === 'web') window.alert(`${t}: ${m}`)
  else Alert.alert(t, m)
}

export default function UniversityLeccion() {
  const { id, cursoId } = useLocalSearchParams<{ id: string; cursoId: string }>()

  const [leccion, setLeccion] = useState<Leccion | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [entregas, setEntregas] = useState<Map<string, Entrega>>(new Map())
  const [yaCompletada, setYaCompletada] = useState(false)
  const [completando, setCompletando] = useState(false)
  const [resultado, setResultado] = useState<{ curso_completado: boolean; certificado_nuevo: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  // Estado por tarea (texto de respuesta y archivo seleccionado)
  const [respuestas, setRespuestas] = useState<Map<string, string>>(new Map())
  const [archivos, setArchivos] = useState<Map<string, { file: any; nombre: string }>>(new Map())
  const [entregando, setEntregando] = useState<string | null>(null)
  const fileRefs = useRef<Map<string, any>>(new Map())

  useEffect(() => { cargar() }, [id])

  async function cargar() {
    if (!id) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [
      { data: lecData },
      { data: tareasData },
      { data: progData },
    ] = await Promise.all([
      supabase.from('vu_lecciones').select('*').eq('id', id).single(),
      supabase.from('vu_tareas').select('*').eq('leccion_id', id).order('created_at'),
      supabase.from('vu_progreso').select('id').eq('user_id', user.id).eq('leccion_id', id).maybeSingle(),
    ])

    setLeccion(lecData)
    setTareas(tareasData ?? [])
    setYaCompletada(!!progData)

    // Cargar entregas del usuario para las tareas de esta lección
    if (tareasData && tareasData.length > 0) {
      const tareaIds = tareasData.map((t: any) => t.id)
      const { data: entregasData } = await supabase
        .from('vu_entregas')
        .select('*')
        .eq('user_id', user.id)
        .in('tarea_id', tareaIds)
      const mapa = new Map<string, Entrega>()
      for (const e of entregasData ?? []) mapa.set(e.tarea_id, e)
      setEntregas(mapa)
    }

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
        setResultado({ curso_completado: data.curso_completado, certificado_nuevo: data.certificado_nuevo })
      }
    } finally {
      setCompletando(false)
    }
  }

  async function subirArchivo(tareaId: string, userId: string): Promise<{ url: string; nombre: string } | null> {
    const archivoInfo = archivos.get(tareaId)
    if (!archivoInfo) return null
    const { file, nombre } = archivoInfo
    const path = `${userId}/${tareaId}/${Date.now()}_${nombre}`
    const { data, error } = await supabase.storage.from('vu-entregas').upload(path, file, { upsert: true })
    if (error) { mostrarError('Error al subir archivo', error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('vu-entregas').getPublicUrl(data.path)
    return { url: publicUrl, nombre }
  }

  async function entregarTarea(tareaId: string) {
    if (!leccion || !cursoId) return
    const tarea = tareas.find((t) => t.id === tareaId)
    if (!tarea) return

    const respuesta = respuestas.get(tareaId) ?? ''
    if (!respuesta.trim() && !archivos.has(tareaId)) {
      mostrarError('Entrega vacía', 'Escribe una respuesta o sube un archivo antes de entregar.')
      return
    }
    if (tarea.requiere_archivo && !archivos.has(tareaId) && !entregas.get(tareaId)?.archivo_url) {
      mostrarError('Archivo requerido', 'Esta tarea requiere que subas un archivo.')
      return
    }

    setEntregando(tareaId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let archivoUrl: string | null = null
      let archivoNombre: string | null = null
      if (archivos.has(tareaId)) {
        const res = await subirArchivo(tareaId, user.id)
        if (!res) { setEntregando(null); return }
        archivoUrl = res.url
        archivoNombre = res.nombre
      }

      const { data, error } = await supabase.rpc('entregar_tarea', {
        p_tarea_id: tareaId,
        p_leccion_id: leccion.id,
        p_curso_id: cursoId,
        p_respuesta: respuesta.trim() || null,
        p_archivo_url: archivoUrl,
        p_archivo_nombre: archivoNombre,
      })

      if (error) { mostrarError('Error al entregar', error.message); return }

      // Actualizar estado local
      if (data?.leccion_completada) {
        setYaCompletada(true)
        if (data.resultado) {
          setResultado({ curso_completado: data.resultado.curso_completado, certificado_nuevo: data.resultado.certificado_nuevo })
        }
      }

      // Recargar entregas
      await cargar()
    } finally {
      setEntregando(null)
    }
  }

  const tareasObligatorias = tareas.filter((t) => t.obligatoria)
  const todasEntregadas = tareasObligatorias.every((t) => entregas.has(t.id))
  const tieneTareasObligatorias = tareasObligatorias.length > 0

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!leccion) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#aaa' }}>Lección no encontrada</Text>
    </View>
  )

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Nav */}
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

      <View style={estilos.body}>
        <Text style={estilos.titulo}>{leccion.titulo}</Text>
        {leccion.descripcion && <Text style={estilos.descripcion}>{leccion.descripcion}</Text>}

        {/* Nota: siempre puedes volver a ver el material */}
        <View style={estilos.infoNote}>
          <Text style={estilos.infoNoteText}>💡 Puedes volver a ver este video y el material cuando quieras.</Text>
        </View>

        {leccion.contenido && (
          <View style={estilos.contenidoCard}>
            <Text style={estilos.contenidoLabel}>📝 Notas de la lección</Text>
            <Text style={estilos.contenidoText}>{leccion.contenido}</Text>
          </View>
        )}

        {/* ── Sección de tareas ── */}
        {tareas.length > 0 && (
          <View style={estilos.tareasSeccion}>
            <Text style={estilos.tareasTitle}>📋 Tareas de esta lección</Text>

            {tareas.map((tarea) => {
              const entrega = entregas.get(tarea.id)
              const estadoInfo = entrega ? (ESTADO_INFO[entrega.estado] ?? ESTADO_INFO.pendiente) : null
              const respuesta = respuestas.get(tarea.id) ?? ''
              const archivo = archivos.get(tarea.id)
              const estaEntregando = entregando === tarea.id

              return (
                <View key={tarea.id} style={estilos.tareaCard}>
                  <View style={estilos.tareaHeader}>
                    <Text style={estilos.tareaTitulo}>{tarea.titulo}</Text>
                    {tarea.obligatoria && (
                      <View style={estilos.obligBadge}><Text style={estilos.obligText}>Obligatoria</Text></View>
                    )}
                  </View>
                  {tarea.descripcion && <Text style={estilos.tareaDesc}>{tarea.descripcion}</Text>}

                  {/* Estado de entrega existente */}
                  {entrega && estadoInfo && (
                    <View style={[estilos.estadoBanner, { backgroundColor: estadoInfo.bg }]}>
                      <Text style={[estilos.estadoText, { color: estadoInfo.color }]}>{estadoInfo.label}</Text>
                      {entrega.calificacion != null && (
                        <Text style={[estilos.estadoText, { color: estadoInfo.color }]}>Calificación: {entrega.calificacion}</Text>
                      )}
                      {entrega.feedback && (
                        <Text style={[estilos.feedbackText, { color: estadoInfo.color }]}>"{entrega.feedback}"</Text>
                      )}
                      {entrega.archivo_url && (
                        <TouchableOpacity onPress={() => Linking.openURL(entrega.archivo_url!)}>
                          <Text style={estilos.archivoLink}>📎 {entrega.archivo_nombre ?? 'Ver archivo entregado'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Form de entrega (siempre visible para poder re-entregar si necesita_mejorar) */}
                  {(!entrega || entrega.estado === 'necesita_mejorar') && (
                    <View style={estilos.entregaForm}>
                      <TextInput
                        style={estilos.respuestaInput}
                        value={respuesta}
                        onChangeText={(v) => setRespuestas((prev) => new Map(prev).set(tarea.id, v))}
                        placeholder="Escribe tu respuesta aquí..."
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        placeholderTextColor="#aaa"
                      />

                      {/* File upload (web) */}
                      {Platform.OS === 'web' && (
                        <>
                          {/* @ts-ignore */}
                          <input
                            type="file"
                            ref={(el) => fileRefs.current.set(tarea.id, el)}
                            style={{ display: 'none' }}
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx,.ppt,.pptx,.zip"
                            onChange={(e: any) => {
                              const f = e.target.files?.[0]
                              if (f) setArchivos((prev) => new Map(prev).set(tarea.id, { file: f, nombre: f.name }))
                            }}
                          />
                          <TouchableOpacity
                            style={estilos.btnSubirArchivo}
                            onPress={() => fileRefs.current.get(tarea.id)?.click()}
                          >
                            <Text style={estilos.btnSubirArchivoText}>
                              {archivo ? `📎 ${archivo.nombre}` : tarea.requiere_archivo ? '📎 Subir archivo (requerido)' : '📎 Adjuntar archivo (opcional)'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}

                      <TouchableOpacity
                        style={[estilos.btnEntregar, estaEntregando && { opacity: 0.6 }]}
                        onPress={() => entregarTarea(tarea.id)}
                        disabled={estaEntregando}
                      >
                        {estaEntregando
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={estilos.btnEntregarText}>
                              {entrega ? '🔄 Volver a entregar' : '📤 Entregar tarea'}
                            </Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* Resultado curso completado */}
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

        {/* Botón marcar completada — solo si no hay tareas obligatorias pendientes */}
        {yaCompletada ? (
          <View style={estilos.completadaBanner}>
            <Text style={estilos.completadaText}>✓ Lección completada · +10 puntos</Text>
          </View>
        ) : tieneTareasObligatorias ? (
          !todasEntregadas ? (
            <View style={estilos.pendienteBanner}>
              <Text style={estilos.pendienteText}>
                📋 Entrega las tareas obligatorias para completar esta lección
              </Text>
            </View>
          ) : (
            <View style={estilos.completadaBanner}>
              <Text style={estilos.completadaText}>📤 Tarea entregada · pendiente de revisión</Text>
            </View>
          )
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
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1a6470' },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
  numBadge: { backgroundColor: 'rgba(201,168,76,0.3)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  numBadgeText: { color: '#c9a84c', fontSize: 11, fontWeight: '700' },
  body: { padding: 20 },
  titulo: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 8, lineHeight: 26 },
  descripcion: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 10 },
  infoNote: { backgroundColor: '#e8f4f5', borderRadius: 8, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#1a6470' },
  infoNoteText: { fontSize: 12, color: '#1a6470' },
  contenidoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e8eef0' },
  contenidoLabel: { fontSize: 12, fontWeight: '700', color: '#1a6470', marginBottom: 8 },
  contenidoText: { fontSize: 14, color: '#444', lineHeight: 22 },
  // Tareas
  tareasSeccion: { marginBottom: 20 },
  tareasTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a2e', marginBottom: 12 },
  tareaCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#dde8e9', borderLeftWidth: 3, borderLeftColor: '#1a6470' },
  tareaHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  tareaTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  obligBadge: { backgroundColor: '#1a6470', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  obligText: { color: '#c9a84c', fontSize: 10, fontWeight: '700' },
  tareaDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 10 },
  estadoBanner: { borderRadius: 10, padding: 12, marginBottom: 10, gap: 4 },
  estadoText: { fontSize: 13, fontWeight: '700' },
  feedbackText: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  archivoLink: { fontSize: 12, color: '#1a6470', textDecorationLine: 'underline', marginTop: 4 },
  entregaForm: { gap: 10 },
  respuestaInput: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', padding: 12, fontSize: 14, color: '#1a1a2e', minHeight: 100, textAlignVertical: 'top' },
  btnSubirArchivo: { backgroundColor: '#f0f4f5', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9', borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
  btnSubirArchivoText: { color: '#1a6470', fontSize: 13, fontWeight: '600' },
  btnEntregar: { backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnEntregarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Completar
  completadaBanner: { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4caf50', marginBottom: 16 },
  completadaText: { color: '#2e7d32', fontWeight: '700', fontSize: 14 },
  pendienteBanner: { backgroundColor: '#fff8e1', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ffb300', marginBottom: 16 },
  pendienteText: { color: '#e65100', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  btnCompletar: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  btnCompletarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cursoDoneCard: { backgroundColor: '#c9a84c', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20 },
  cursoDoneIcon: { fontSize: 40, marginBottom: 8 },
  cursoDoneTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cursoDoneSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 14 },
  btnVerCurso: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  btnVerCursoText: { color: '#c9a84c', fontWeight: '700', fontSize: 14 },
})
