import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Alert,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Entrega = {
  id: string
  user_id: string
  tarea_id: string
  leccion_id: string
  curso_id: string
  respuesta_texto: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  estado: 'pendiente' | 'aprobada' | 'necesita_mejorar'
  calificacion: number | null
  feedback: string | null
  revisado_at: string | null
  created_at: string
  // joined
  usuario_nombre: string | null
  tarea_titulo: string | null
  leccion_titulo: string | null
  curso_titulo: string | null
}

const ESTADO_LABELS: Record<string, string> = {
  pendiente: '⏳ Pendiente',
  aprobada: '✅ Aprobada',
  necesita_mejorar: '📝 Necesita mejorar',
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  aprobada: '#10b981',
  necesita_mejorar: '#ef4444',
}

function mostrarAlerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function AdminEntregas() {
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('pendiente')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form de calificación por entrega
  const [calForm, setCalForm] = useState<Record<string, {
    estado: string; calificacion: string; feedback: string; guardando: boolean
  }>>({})

  useFocusEffect(useCallback(() => { cargar() }, [filtroEstado]))

  async function cargar() {
    setLoading(true)
    try {
      // Fetch entregas with related tareas/lecciones/cursos
      // profiles join is done separately because user_id FK points to auth.users, not public.profiles
      const { data, error } = await supabase
        .from('vu_entregas')
        .select(`
          id, user_id, tarea_id, leccion_id, curso_id,
          respuesta_texto, archivo_url, archivo_nombre,
          estado, calificacion, feedback, revisado_at, created_at,
          vu_tareas:tarea_id ( titulo ),
          vu_lecciones:leccion_id ( titulo ),
          vu_cursos:curso_id ( titulo )
        `)
        .eq('estado', filtroEstado)
        .order('created_at', { ascending: false })

      if (error) throw error

      const rows = data ?? []

      // Fetch profile names separately
      const userIds = [...new Set(rows.map((e: any) => e.user_id))]
      let perfilMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: perfiles } = await supabase
          .from('profiles')
          .select('id, nombre')
          .in('id', userIds)
        ;(perfiles ?? []).forEach((p: any) => { perfilMap[p.id] = p.nombre })
      }

      const mapped: Entrega[] = rows.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        tarea_id: e.tarea_id,
        leccion_id: e.leccion_id,
        curso_id: e.curso_id,
        respuesta_texto: e.respuesta_texto,
        archivo_url: e.archivo_url,
        archivo_nombre: e.archivo_nombre,
        estado: e.estado,
        calificacion: e.calificacion,
        feedback: e.feedback,
        revisado_at: e.revisado_at,
        created_at: e.created_at,
        usuario_nombre: perfilMap[e.user_id] ?? null,
        tarea_titulo: e.vu_tareas?.titulo ?? null,
        leccion_titulo: e.vu_lecciones?.titulo ?? null,
        curso_titulo: e.vu_cursos?.titulo ?? null,
      }))

      setEntregas(mapped)
    } catch (e: any) {
      mostrarAlerta('Error cargando entregas: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function initForm(entrega: Entrega) {
    setCalForm(prev => ({
      ...prev,
      [entrega.id]: {
        estado: entrega.estado === 'pendiente' ? 'aprobada' : entrega.estado,
        calificacion: entrega.calificacion != null ? String(entrega.calificacion) : '',
        feedback: entrega.feedback ?? '',
        guardando: false,
      }
    }))
  }

  function getForm(id: string) {
    return calForm[id] ?? { estado: 'aprobada', calificacion: '', feedback: '', guardando: false }
  }

  function updateForm(id: string, patch: Partial<typeof calForm[string]>) {
    setCalForm(prev => ({ ...prev, [id]: { ...getForm(id), ...patch } }))
  }

  async function calificar(entrega: Entrega) {
    const form = getForm(entrega.id)
    if (!form.estado) return mostrarAlerta('Selecciona un estado')
    updateForm(entrega.id, { guardando: true })
    try {
      const { error } = await supabase.rpc('calificar_entrega', {
        p_entrega_id: entrega.id,
        p_estado: form.estado,
        p_calificacion: form.calificacion ? parseInt(form.calificacion) : null,
        p_feedback: form.feedback || null,
      })
      if (error) throw error
      mostrarAlerta('Calificación guardada')
      setExpandedId(null)
      cargar()
    } catch (e: any) {
      mostrarAlerta('Error: ' + e.message)
    } finally {
      updateForm(entrega.id, { guardando: false })
    }
  }

  const filtros = ['pendiente', 'aprobada', 'necesita_mejorar']

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.titulo}>Entregas de Tareas</Text>
      </View>

      {/* Filtros */}
      <View style={s.filtros}>
        {filtros.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filtroBtn, filtroEstado === f && { backgroundColor: ESTADO_COLORS[f] }]}
            onPress={() => setFiltroEstado(f)}
          >
            <Text style={[s.filtroText, filtroEstado === f && { color: '#fff' }]}>
              {ESTADO_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
      ) : entregas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No hay entregas con estado "{filtroEstado}"</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.lista}>
          {entregas.map(e => {
            const expanded = expandedId === e.id
            const form = getForm(e.id)
            const color = ESTADO_COLORS[e.estado]
            return (
              <View key={e.id} style={s.card}>
                {/* Card header */}
                <TouchableOpacity
                  style={s.cardHeader}
                  onPress={() => {
                    if (expanded) {
                      setExpandedId(null)
                    } else {
                      setExpandedId(e.id)
                      initForm(e)
                    }
                  }}
                >
                  <View style={[s.estadoBadge, { backgroundColor: color }]}>
                    <Text style={s.estadoBadgeText}>{ESTADO_LABELS[e.estado]}</Text>
                  </View>
                  <View style={s.cardInfo}>
                    <Text style={s.cardUsuario}>{e.usuario_nombre ?? 'Usuario'}</Text>
                    <Text style={s.cardTarea}>{e.tarea_titulo ?? 'Tarea'}</Text>
                    <Text style={s.cardMeta}>
                      {e.curso_titulo} › {e.leccion_titulo}
                    </Text>
                    <Text style={s.cardFecha}>
                      {new Date(e.created_at).toLocaleDateString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {/* Expanded detail */}
                {expanded && (
                  <View style={s.cardBody}>
                    {/* Respuesta texto */}
                    {e.respuesta_texto ? (
                      <View style={s.seccion}>
                        <Text style={s.seccionLabel}>Respuesta del alumno:</Text>
                        <View style={s.respuestaBox}>
                          <Text style={s.respuestaText}>{e.respuesta_texto}</Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Archivo adjunto */}
                    {e.archivo_url ? (
                      <View style={s.seccion}>
                        <Text style={s.seccionLabel}>Archivo adjunto:</Text>
                        <TouchableOpacity
                          style={s.archivoBtn}
                          onPress={() => {
                            if (Platform.OS === 'web') window.open(e.archivo_url!, '_blank')
                          }}
                        >
                          <Text style={s.archivoBtnText}>
                            📎 {e.archivo_nombre ?? 'Ver archivo'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {!e.respuesta_texto && !e.archivo_url && (
                      <Text style={s.sinContenido}>Sin respuesta de texto ni archivo adjunto.</Text>
                    )}

                    {/* Sección calificación */}
                    <View style={s.calificacionBox}>
                      <Text style={s.calificacionTitulo}>Calificar entrega</Text>

                      {/* Estado */}
                      <Text style={s.fieldLabel}>Estado *</Text>
                      <View style={s.estadoRow}>
                        {['aprobada', 'necesita_mejorar'].map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={[
                              s.estadoOpt,
                              { borderColor: ESTADO_COLORS[opt] },
                              form.estado === opt && { backgroundColor: ESTADO_COLORS[opt] },
                            ]}
                            onPress={() => updateForm(e.id, { estado: opt })}
                          >
                            <Text style={[
                              s.estadoOptText,
                              form.estado === opt && { color: '#fff' },
                            ]}>
                              {ESTADO_LABELS[opt]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Calificación numérica */}
                      <Text style={s.fieldLabel}>Calificación (0-100, opcional)</Text>
                      <TextInput
                        style={s.input}
                        value={form.calificacion}
                        onChangeText={v => updateForm(e.id, { calificacion: v })}
                        keyboardType="numeric"
                        placeholder="Ej: 85"
                        placeholderTextColor="#666"
                        maxLength={3}
                      />

                      {/* Feedback */}
                      <Text style={s.fieldLabel}>Comentario / Feedback (opcional)</Text>
                      <TextInput
                        style={[s.input, s.textarea]}
                        value={form.feedback}
                        onChangeText={v => updateForm(e.id, { feedback: v })}
                        multiline
                        numberOfLines={4}
                        placeholder="Escribe tu retroalimentación aquí..."
                        placeholderTextColor="#666"
                      />

                      <TouchableOpacity
                        style={[s.guardarBtn, form.guardando && s.guardarBtnDis]}
                        onPress={() => calificar(e)}
                        disabled={form.guardando}
                      >
                        {form.guardando
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={s.guardarBtnText}>Guardar calificación</Text>
                        }
                      </TouchableOpacity>
                    </View>

                    {/* Historial de revisión si ya fue revisada */}
                    {e.revisado_at && (
                      <Text style={s.revisadoText}>
                        Última revisión: {new Date(e.revisado_at).toLocaleDateString('es-MX')}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  backBtn: { padding: 4 },
  backText: { color: '#c9a84c', fontSize: 14 },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  filtros: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingVertical: 12, flexWrap: 'wrap',
  },
  filtroBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
  },
  filtroText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#666', fontSize: 15 },
  lista: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14,
  },
  estadoBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    marginTop: 2, alignSelf: 'flex-start',
  },
  estadoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardInfo: { flex: 1, gap: 2 },
  cardUsuario: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardTarea: { color: '#c9a84c', fontSize: 13, fontWeight: '600' },
  cardMeta: { color: '#888', fontSize: 12 },
  cardFecha: { color: '#555', fontSize: 11, marginTop: 2 },
  chevron: { color: '#555', fontSize: 16, alignSelf: 'center' },
  cardBody: {
    padding: 14, paddingTop: 0, gap: 12,
    borderTopWidth: 1, borderTopColor: '#252525',
  },
  seccion: { gap: 6 },
  seccionLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  respuestaBox: {
    backgroundColor: '#111', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  respuestaText: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  archivoBtn: {
    backgroundColor: '#1e2a3a', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#2a3a4a',
  },
  archivoBtnText: { color: '#60a5fa', fontSize: 14 },
  sinContenido: { color: '#555', fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },
  calificacionBox: {
    backgroundColor: '#111', borderRadius: 10, padding: 14,
    gap: 8, borderWidth: 1, borderColor: '#252525',
  },
  calificacionTitulo: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600' },
  estadoRow: { flexDirection: 'row', gap: 10 },
  estadoOpt: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 2, alignItems: 'center',
  },
  estadoOptText: { color: '#aaa', fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 8,
    borderWidth: 1, borderColor: '#333', padding: 10, fontSize: 14,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  guardarBtn: {
    backgroundColor: '#c9a84c', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  guardarBtnDis: { opacity: 0.5 },
  guardarBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  revisadoText: { color: '#555', fontSize: 11, textAlign: 'right' },
})
