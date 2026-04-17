import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Switch, Platform, Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

type TareaDraft = {
  id?: string
  titulo: string
  descripcion: string
  requiere_archivo: boolean
  obligatoria: boolean
  _borrar?: boolean
}

type LeccionDraft = {
  _key: string
  id?: string
  titulo: string
  descripcion: string
  youtube_url: string
  contenido: string
  orden: number
  tarea: TareaDraft | null
  _borrar?: boolean
}

const NIVELES = ['basico', 'intermedio', 'avanzado'] as const
const CATEGORIAS = ['Fundamentos', 'Ventas', 'CRM', 'Producto', 'Soft skills', 'Otro']

function alerta(titulo: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}: ${msg}`)
  else Alert.alert(titulo, msg)
}

let keyCounter = 0
function nuevaKey() { return String(++keyCounter) }

function TareaEditor({ tarea, onChange, onQuitar }: {
  tarea: TareaDraft
  onChange: (campo: keyof TareaDraft, valor: any) => void
  onQuitar: () => void
}) {
  return (
    <View style={estilos.tareaEditor}>
      <View style={estilos.tareaEditorHeader}>
        <Text style={estilos.tareaEditorTitle}>📋 Tarea asignada</Text>
        <TouchableOpacity onPress={onQuitar} style={estilos.borrarTareaBtn}>
          <Text style={estilos.borrarTareaBtnText}>✕ Quitar tarea</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={estilos.lecInput}
        value={tarea.titulo}
        onChangeText={(v) => onChange('titulo', v)}
        placeholder="Título de la tarea *"
      />
      <TextInput
        style={[estilos.lecInput, { height: 70 }]}
        value={tarea.descripcion}
        onChangeText={(v) => onChange('descripcion', v)}
        placeholder="Instrucciones para el alumno..."
        multiline
        textAlignVertical="top"
      />
      <View style={estilos.tareaToggleRow}>
        <View style={estilos.tareaToggleItem}>
          <Switch
            value={tarea.requiere_archivo}
            onValueChange={(v) => onChange('requiere_archivo', v)}
            trackColor={{ false: '#ddd', true: '#1a6470' }}
            thumbColor={tarea.requiere_archivo ? '#c9a84c' : '#fff'}
          />
          <Text style={estilos.tareaToggleLabel}>Requiere subir archivo</Text>
        </View>
        <View style={estilos.tareaToggleItem}>
          <Switch
            value={tarea.obligatoria}
            onValueChange={(v) => onChange('obligatoria', v)}
            trackColor={{ false: '#ddd', true: '#1a6470' }}
            thumbColor={tarea.obligatoria ? '#c9a84c' : '#fff'}
          />
          <Text style={estilos.tareaToggleLabel}>Obligatoria para completar</Text>
        </View>
      </View>
    </View>
  )
}

export default function UniversityCursoForm() {
  const { id: cursoId } = useLocalSearchParams<{ id?: string }>()
  const esEdicion = !!cursoId

  const [loading, setLoading] = useState(esEdicion)
  const [guardando, setGuardando] = useState(false)

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [descripcionCorta, setDescripcionCorta] = useState('')
  const [imagenUrl, setImagenUrl] = useState('')
  const [instructor, setInstructor] = useState('Valera University')
  const [duracionTexto, setDuracionTexto] = useState('')
  const [categoria, setCategoria] = useState('Fundamentos')
  const [nivel, setNivel] = useState<typeof NIVELES[number]>('basico')
  const [publicado, setPublicado] = useState(false)
  const [esCertificacion, setEsCertificacion] = useState(false)
  const [lecciones, setLecciones] = useState<LeccionDraft[]>([])

  useEffect(() => {
    if (!esEdicion) return
    cargarCurso()
  }, [cursoId])

  async function cargarCurso() {
    const [{ data: curso }, { data: lecsData }] = await Promise.all([
      supabase.from('vu_cursos').select('*').eq('id', cursoId!).single(),
      supabase.from('vu_lecciones').select('*').eq('curso_id', cursoId!).order('orden'),
    ])
    if (curso) {
      setTitulo(curso.titulo ?? '')
      setDescripcion(curso.descripcion ?? '')
      setDescripcionCorta(curso.descripcion_corta ?? '')
      setImagenUrl(curso.imagen_url ?? '')
      setInstructor(curso.instructor ?? 'Valera University')
      setDuracionTexto(curso.duracion_texto ?? '')
      setCategoria(curso.categoria ?? 'Fundamentos')
      setNivel(curso.nivel ?? 'basico')
      setPublicado(curso.publicado ?? false)
      setEsCertificacion(curso.es_certificacion ?? false)
    }

    // Cargar tareas de cada lección
    const lecIds = (lecsData ?? []).map((l: any) => l.id)
    let tareasMap = new Map<string, TareaDraft>()
    if (lecIds.length > 0) {
      const { data: tareasData } = await supabase.from('vu_tareas').select('*').in('leccion_id', lecIds)
      for (const t of tareasData ?? []) {
        tareasMap.set(t.leccion_id, {
          id: t.id,
          titulo: t.titulo ?? '',
          descripcion: t.descripcion ?? '',
          requiere_archivo: t.requiere_archivo ?? false,
          obligatoria: t.obligatoria ?? true,
        })
      }
    }

    setLecciones(
      (lecsData ?? []).map((l: any) => ({
        _key: nuevaKey(),
        id: l.id,
        titulo: l.titulo ?? '',
        descripcion: l.descripcion ?? '',
        youtube_url: l.youtube_url ?? '',
        contenido: l.contenido ?? '',
        orden: l.orden,
        tarea: tareasMap.get(l.id) ?? null,
      }))
    )
    setLoading(false)
  }

  function agregarLeccion() {
    setLecciones((prev) => [
      ...prev,
      { _key: nuevaKey(), titulo: '', descripcion: '', youtube_url: '', contenido: '', orden: prev.filter((l) => !l._borrar).length + 1, tarea: null },
    ])
  }

  function actualizarLeccion(key: string, campo: keyof LeccionDraft, valor: any) {
    setLecciones((prev) => prev.map((l) => l._key === key ? { ...l, [campo]: valor } : l))
  }

  function actualizarTarea(key: string, campo: keyof TareaDraft, valor: any) {
    setLecciones((prev) => prev.map((l) => l._key === key && l.tarea
      ? { ...l, tarea: { ...l.tarea, [campo]: valor } }
      : l
    ))
  }

  function agregarTarea(key: string) {
    setLecciones((prev) => prev.map((l) => l._key === key
      ? { ...l, tarea: { titulo: '', descripcion: '', requiere_archivo: false, obligatoria: true } }
      : l
    ))
  }

  function quitarTarea(key: string) {
    setLecciones((prev) => prev.map((l) => l._key === key ? { ...l, tarea: null } : l))
  }

  function marcarBorrar(key: string) {
    setLecciones((prev) => prev.map((l) => l._key === key ? { ...l, _borrar: true } : l))
  }

  function moverLeccion(key: string, dir: -1 | 1) {
    setLecciones((prev) => {
      const visibles = prev.filter((l) => !l._borrar)
      const idx = visibles.findIndex((l) => l._key === key)
      const nuevoIdx = idx + dir
      if (nuevoIdx < 0 || nuevoIdx >= visibles.length) return prev
      const arr = [...visibles]
      ;[arr[idx], arr[nuevoIdx]] = [arr[nuevoIdx], arr[idx]]
      return arr.map((l, i) => ({ ...l, orden: i + 1 }))
    })
  }

  async function guardar() {
    if (!titulo.trim()) { alerta('Campo requerido', 'El título del curso es obligatorio.'); return }

    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const payload = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        descripcion_corta: descripcionCorta.trim() || null,
        imagen_url: imagenUrl.trim() || null,
        instructor: instructor.trim() || 'Valera University',
        duracion_texto: duracionTexto.trim() || null,
        categoria, nivel, publicado, es_certificacion: esCertificacion,
        created_by: user?.id,
      }

      let idFinal = cursoId
      if (esEdicion) {
        const { error } = await supabase.from('vu_cursos').update(payload).eq('id', cursoId!)
        if (error) { alerta('Error al guardar', error.message); return }
      } else {
        const { data, error } = await supabase.from('vu_cursos').insert(payload).select('id').single()
        if (error || !data) { alerta('Error al crear', error?.message ?? 'Error desconocido'); return }
        idFinal = data.id
      }

      const visibles = lecciones.filter((l) => !l._borrar)
      const aEliminar = lecciones.filter((l) => l._borrar && l.id)
      const aInsertar = visibles.filter((l) => !l.id)
      const aActualizar = visibles.filter((l) => !!l.id)

      // Eliminar lecciones borradas (cascade elimina sus tareas)
      await Promise.all(aEliminar.map((l) => supabase.from('vu_lecciones').delete().eq('id', l.id!)))

      // Actualizar lecciones existentes
      await Promise.all(aActualizar.map((l) => supabase.from('vu_lecciones').update({
        titulo: l.titulo.trim(),
        descripcion: l.descripcion.trim() || null,
        youtube_url: l.youtube_url.trim() || null,
        contenido: l.contenido.trim() || null,
        orden: l.orden,
      }).eq('id', l.id!)))

      // Insertar nuevas lecciones
      let nuevasLecciones: { id: string; _key: string }[] = []
      if (aInsertar.length > 0) {
        const { data: insData } = await supabase.from('vu_lecciones').insert(
          aInsertar.map((l) => ({
            curso_id: idFinal,
            titulo: l.titulo.trim() || 'Sin título',
            descripcion: l.descripcion.trim() || null,
            youtube_url: l.youtube_url.trim() || null,
            contenido: l.contenido.trim() || null,
            orden: l.orden,
          }))
        ).select('id')
        nuevasLecciones = (insData ?? []).map((d: any, i: number) => ({ id: d.id, _key: aInsertar[i]._key }))
      }

      // Sincronizar tareas
      const leccionesConId = [
        ...aActualizar.map((l) => ({ ...l, idFinal: l.id! })),
        ...nuevasLecciones.map(({ id, _key }) => {
          const lec = aInsertar.find((l) => l._key === _key)!
          return { ...lec, idFinal: id }
        }),
      ]

      for (const lec of leccionesConId) {
        if (lec.tarea) {
          const tareaPayload = {
            leccion_id: lec.idFinal,
            curso_id: idFinal,
            titulo: lec.tarea.titulo.trim() || 'Tarea',
            descripcion: lec.tarea.descripcion.trim() || null,
            requiere_archivo: lec.tarea.requiere_archivo,
            obligatoria: lec.tarea.obligatoria,
          }
          if (lec.tarea.id) {
            await supabase.from('vu_tareas').update(tareaPayload).eq('id', lec.tarea.id)
          } else {
            await supabase.from('vu_tareas').insert(tareaPayload)
          }
        } else if (lec.id) {
          // Quitaron la tarea — borrar si existía
          await supabase.from('vu_tareas').delete().eq('leccion_id', lec.idFinal)
        }
      }

      router.replace('/(admin)/university')
    } catch (e: any) {
      alerta('Error inesperado', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />

  const leccionesVisibles = lecciones.filter((l) => !l._borrar)

  return (
    <ScrollView style={estilos.container} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={estilos.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={estilos.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={estilos.titulo}>{esEdicion ? 'Editar curso' : 'Nuevo curso'}</Text>
      </View>

      <View style={estilos.body}>
        <Text style={estilos.seccion}>DATOS DEL CURSO</Text>

        <Text style={estilos.label}>Título *</Text>
        <TextInput style={estilos.input} value={titulo} onChangeText={setTitulo} placeholder="Ej. Introducción a Valera Real Estate" />

        <Text style={estilos.label}>Descripción corta</Text>
        <TextInput style={estilos.input} value={descripcionCorta} onChangeText={setDescripcionCorta} placeholder="Descripción visible en la tarjeta del curso" />

        <Text style={estilos.label}>Descripción completa</Text>
        <TextInput style={[estilos.input, estilos.inputMulti]} value={descripcion} onChangeText={setDescripcion} placeholder="Qué aprenderán los prospectadores..." multiline numberOfLines={4} textAlignVertical="top" />

        <Text style={estilos.label}>Instructor</Text>
        <TextInput style={estilos.input} value={instructor} onChangeText={setInstructor} placeholder="Valera University" />

        <Text style={estilos.label}>Duración estimada</Text>
        <TextInput style={estilos.input} value={duracionTexto} onChangeText={setDuracionTexto} placeholder="Ej. ~60 min · 4 lecciones" />

        <Text style={estilos.label}>URL portada (imagen)</Text>
        <TextInput style={estilos.input} value={imagenUrl} onChangeText={setImagenUrl} placeholder="https://..." autoCapitalize="none" />

        <Text style={estilos.label}>Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CATEGORIAS.map((c) => (
              <TouchableOpacity key={c} style={[estilos.chip, categoria === c && estilos.chipActivo]} onPress={() => setCategoria(c)}>
                <Text style={[estilos.chipText, categoria === c && estilos.chipTextActivo]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={estilos.label}>Nivel</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {NIVELES.map((n) => (
            <TouchableOpacity key={n} style={[estilos.chip, nivel === n && estilos.chipActivo, { flex: 1 }]} onPress={() => setNivel(n)}>
              <Text style={[estilos.chipText, nivel === n && estilos.chipTextActivo, { textAlign: 'center' }]}>
                {n.charAt(0).toUpperCase() + n.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={estilos.publishRow}>
          <View>
            <Text style={estilos.label}>Publicar curso</Text>
            <Text style={estilos.publishSub}>{publicado ? 'Visible para todos' : 'Borrador'}</Text>
          </View>
          <Switch value={publicado} onValueChange={setPublicado} trackColor={{ false: '#ddd', true: '#1a6470' }} thumbColor={publicado ? '#c9a84c' : '#fff'} />
        </View>

        <View style={estilos.publishRow}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.label}>Curso de certificación</Text>
            <Text style={estilos.publishSub}>
              {esCertificacion ? '🎓 Al terminar, el alumno recibe un certificado PDF' : 'Sin certificado al completar'}
            </Text>
          </View>
          <Switch value={esCertificacion} onValueChange={setEsCertificacion} trackColor={{ false: '#ddd', true: '#c9a84c' }} thumbColor={esCertificacion ? '#1a6470' : '#fff'} />
        </View>

        {/* Lecciones */}
        <View style={estilos.seccionHeader}>
          <Text style={estilos.seccion}>LECCIONES ({leccionesVisibles.length})</Text>
          <TouchableOpacity style={estilos.btnAgregar} onPress={agregarLeccion}>
            <Text style={estilos.btnAgregarText}>+ Lección</Text>
          </TouchableOpacity>
        </View>

        {leccionesVisibles.length === 0 && (
          <Text style={estilos.leccionesEmpty}>Agrega al menos una lección</Text>
        )}

        {leccionesVisibles.map((lec, idx) => (
          <View key={lec._key} style={estilos.leccionCard}>
            <View style={estilos.leccionCardHeader}>
              <View style={estilos.leccionNum}><Text style={estilos.leccionNumText}>{idx + 1}</Text></View>
              <Text style={estilos.leccionLabel}>Lección {idx + 1}</Text>
              <View style={{ flex: 1 }} />
              {idx > 0 && (
                <TouchableOpacity style={estilos.ordenBtn} onPress={() => moverLeccion(lec._key, -1)}>
                  <Text style={estilos.ordenBtnText}>↑</Text>
                </TouchableOpacity>
              )}
              {idx < leccionesVisibles.length - 1 && (
                <TouchableOpacity style={estilos.ordenBtn} onPress={() => moverLeccion(lec._key, 1)}>
                  <Text style={estilos.ordenBtnText}>↓</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={estilos.borrarBtn} onPress={() => marcarBorrar(lec._key)}>
                <Text style={estilos.borrarBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={estilos.lecInput} value={lec.titulo} onChangeText={(v) => actualizarLeccion(lec._key, 'titulo', v)} placeholder="Título de la lección *" />
            <TextInput style={estilos.lecInput} value={lec.descripcion} onChangeText={(v) => actualizarLeccion(lec._key, 'descripcion', v)} placeholder="Descripción corta" />
            <TextInput style={estilos.lecInput} value={lec.youtube_url} onChangeText={(v) => actualizarLeccion(lec._key, 'youtube_url', v)} placeholder="URL de YouTube (https://youtu.be/...)" autoCapitalize="none" />
            <TextInput style={[estilos.lecInput, { height: 70 }]} value={lec.contenido} onChangeText={(v) => actualizarLeccion(lec._key, 'contenido', v)} placeholder="Notas o texto explicativo (opcional)" multiline numberOfLines={3} textAlignVertical="top" />

            {/* Tarea de la lección */}
            {lec.tarea ? (
              <TareaEditor
                tarea={lec.tarea}
                onChange={(campo, valor) => actualizarTarea(lec._key, campo, valor)}
                onQuitar={() => quitarTarea(lec._key)}
              />
            ) : (
              <TouchableOpacity style={estilos.btnAgregarTarea} onPress={() => agregarTarea(lec._key)}>
                <Text style={estilos.btnAgregarTareaText}>+ Agregar tarea a esta lección</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={[estilos.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
          {guardando
            ? <ActivityIndicator color="#fff" />
            : <Text style={estilos.btnGuardarText}>{esEdicion ? '💾 Guardar cambios' : '🚀 Crear curso'}</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={estilos.btnCancelar} onPress={() => router.back()}>
          <Text style={estilos.btnCancelarText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: { backgroundColor: '#1a6470', padding: 20, paddingTop: 16, gap: 8 },
  backText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '800' },
  body: { padding: 20 },
  seccion: { fontSize: 11, fontWeight: '700', color: '#1a6470', letterSpacing: 1, marginBottom: 12, marginTop: 8 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a2e', marginBottom: 14 },
  inputMulti: { height: 100, textAlignVertical: 'top' },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff' },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActivo: { color: '#fff', fontWeight: '700' },
  publishRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#ddd' },
  publishSub: { fontSize: 11, color: '#888', marginTop: 2 },
  btnAgregar: { backgroundColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnAgregarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  leccionesEmpty: { color: '#aaa', textAlign: 'center', paddingVertical: 24, fontSize: 13 },
  leccionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#dde8e9' },
  leccionCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  leccionNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center' },
  leccionNumText: { color: '#c9a84c', fontSize: 12, fontWeight: '800' },
  leccionLabel: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  ordenBtn: { padding: 6, backgroundColor: '#f0f4f5', borderRadius: 6 },
  ordenBtnText: { fontSize: 13, color: '#1a6470', fontWeight: '700' },
  borrarBtn: { padding: 6, backgroundColor: '#fde8e8', borderRadius: 6 },
  borrarBtnText: { fontSize: 13, color: '#c0392b', fontWeight: '700' },
  lecInput: { backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e8eef0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1a1a2e', marginBottom: 10 },
  // Tarea
  btnAgregarTarea: { borderWidth: 1, borderColor: '#c9a84c', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  btnAgregarTareaText: { color: '#c9a84c', fontWeight: '600', fontSize: 13 },
  tareaEditor: { backgroundColor: '#fffbf0', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#c9a84c', marginTop: 8 },
  tareaEditorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tareaEditorTitle: { fontSize: 12, fontWeight: '700', color: '#c9a84c' },
  borrarTareaBtn: { padding: 4 },
  borrarTareaBtnText: { color: '#c0392b', fontSize: 11, fontWeight: '600' },
  tareaToggleRow: { gap: 8 },
  tareaToggleItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tareaToggleLabel: { fontSize: 12, color: '#555', flex: 1 },
  // Guardar
  btnGuardar: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnCancelar: { alignItems: 'center', paddingVertical: 14 },
  btnCancelarText: { color: '#aaa', fontSize: 14 },
})
