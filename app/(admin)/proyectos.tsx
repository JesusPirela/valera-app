import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Platform, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'
import { useColors, useTheme } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

// ── Tipos ──────────────────────────────────────────────────────────────────

type Proyecto = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: 'general' | 'individual'
  estado: string
  prioridad: string
  progreso: number
  fecha_limite: string | null
  responsable_id: string | null
  responsable_nombre: string | null
  created_at: string
  updated_at: string
}

type Actividad = {
  id: string
  descripcion: string
  created_at: string
  user_nombre: string
}

type Archivo = {
  id: string
  nombre: string
  url: string
  tipo: 'imagen' | 'documento'
  created_at: string
  user_nombre: string
}

type Perfil = { id: string; nombre: string }

// ── Constantes ────────────────────────────────────────────────────────────

const ESTADOS: Record<string, { label: string; color: string; icono: string }> = {
  por_iniciar: { label: 'Por iniciar',  color: '#64748b', icono: '○'  },
  en_progreso: { label: 'En progreso',  color: '#3b82f6', icono: '◉'  },
  en_revision: { label: 'En revisión',  color: '#f59e0b', icono: '◎'  },
  completado:  { label: 'Completado',   color: '#22c55e', icono: '✓'  },
  pausado:     { label: 'Pausado',      color: '#ef4444', icono: '⏸'  },
}

const PRIORIDADES: Record<string, { label: string; color: string }> = {
  alta:  { label: 'Alta',  color: '#ef4444' },
  media: { label: 'Media', color: '#f59e0b' },
  baja:  { label: 'Baja',  color: '#22c55e' },
}

const TIPOS = [
  { value: 'general',    label: '🏢 General',    desc: 'Proyecto interno de empresa' },
  { value: 'individual', label: '👤 Individual',  desc: 'Asignado a una persona' },
]

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Proyectos', msg)
}

function confirmar(msg: string, onOk: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(msg)) onOk() }
  else Alert.alert('Confirmar', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: onOk },
  ])
}

function formatFecha(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function diasRestantes(fl: string | null): { texto: string; color: string } | null {
  if (!fl) return null
  const diff = Math.ceil((new Date(fl).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return { texto: `Vencido hace ${Math.abs(diff)}d`, color: '#ef4444' }
  if (diff === 0) return { texto: 'Vence hoy',          color: '#f59e0b' }
  if (diff <= 3)  return { texto: `${diff}d restantes`, color: '#f59e0b' }
  return               { texto: `${diff}d restantes`,   color: '#22c55e' }
}

// ── Componente ────────────────────────────────────────────────────────────

export default function Proyectos() {
  useSupervisorBlock()
  const c = useColors()
  const { darkMode } = useTheme()

  const [proyectos, setProyectos]     = useState<Proyecto[]>([])
  const [loading, setLoading]         = useState(true)
  const [perfiles, setPerfiles]       = useState<Perfil[]>([])
  const [filtroEstado, setFiltroEstado]       = useState<string | null>(null)
  const [filtroPrioridad, setFiltroPrioridad] = useState<string | null>(null)

  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState<Proyecto | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'general' as 'general' | 'individual',
    estado: 'por_iniciar', prioridad: 'media',
    progreso: 0, fecha_limite: '', responsable_id: '',
  })

  const [detalle, setDetalle]         = useState<Proyecto | null>(null)
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [archivos, setArchivos]       = useState<Archivo[]>([])
  const [cargandoAct, setCargandoAct] = useState(false)
  const [nuevaAct, setNuevaAct]       = useState('')
  const [guardandoAct, setGuardandoAct] = useState(false)
  const [subiendoArchivo, setSubiendoArchivo] = useState(false)
  const [tabDetalle, setTabDetalle]   = useState<'actividad' | 'archivos'>('actividad')
  const [editandoProg, setEditandoProg] = useState(false)
  const [rawProg, setRawProg]           = useState('')

  useFocusEffect(useCallback(() => { cargar() }, []))

  const yaCargoRef = useRef(false)
  const { refreshControl } = usePullRefresh(cargar)

  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    yaCargoRef.current = true
    const [projRes, perfRes] = await Promise.all([
      supabase.from('proyectos').select('*').order('updated_at', { ascending: false }),
      supabase.from('profiles').select('id, nombre').eq('role', 'admin').order('nombre'),
    ])
    const perfilesData = (perfRes.data ?? []) as Perfil[]
    setPerfiles(perfilesData)
    const mapa = new Map(perfilesData.map(p => [p.id, p.nombre]))
    const data = (projRes.data ?? []).map((p: any) => ({
      ...p,
      responsable_nombre: p.responsable_id ? (mapa.get(p.responsable_id) ?? 'Desconocido') : null,
    })) as Proyecto[]
    setProyectos(data)
    setLoading(false)
  }

  async function cargarActividades(pid: string) {
    setCargandoAct(true)
    const [actRes, arcRes] = await Promise.all([
      supabase.from('proyecto_actividades')
        .select('id, descripcion, created_at, profiles(nombre)')
        .eq('proyecto_id', pid).order('created_at', { ascending: false }),
      supabase.from('proyecto_archivos')
        .select('id, nombre, url, tipo, created_at, profiles(nombre)')
        .eq('proyecto_id', pid).order('created_at', { ascending: false }),
    ])
    setCargandoAct(false)
    setActividades((actRes.data ?? []).map((a: any) => ({
      id: a.id, descripcion: a.descripcion, created_at: a.created_at,
      user_nombre: a.profiles?.nombre ?? 'Admin',
    })))
    setArchivos((arcRes.data ?? []).map((a: any) => ({
      id: a.id, nombre: a.nombre, url: a.url, tipo: a.tipo,
      created_at: a.created_at, user_nombre: a.profiles?.nombre ?? 'Admin',
    })))
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ titulo: '', descripcion: '', tipo: 'general', estado: 'por_iniciar', prioridad: 'media', progreso: 0, fecha_limite: '', responsable_id: '' })
    setModal(true)
  }

  function abrirEditar(p: Proyecto) {
    setEditando(p)
    setForm({ titulo: p.titulo, descripcion: p.descripcion ?? '', tipo: p.tipo, estado: p.estado, prioridad: p.prioridad, progreso: p.progreso, fecha_limite: p.fecha_limite ?? '', responsable_id: p.responsable_id ?? '' })
    setModal(true)
  }

  async function guardar() {
    if (!form.titulo.trim()) { alerta('El título es obligatorio.'); return }
    setGuardando(true)
    const payload = {
      titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
      tipo: form.tipo, estado: form.estado, prioridad: form.prioridad,
      progreso: Math.max(0, Math.min(100, form.progreso)),
      fecha_limite: form.fecha_limite || null, responsable_id: form.responsable_id || null,
    }
    if (editando) {
      const { error } = await supabase.from('proyectos').update(payload).eq('id', editando.id)
      if (error) { alerta('Error: ' + error.message); setGuardando(false); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('proyecto_actividades').insert({ proyecto_id: editando.id, user_id: user.id, descripcion: `Proyecto editado · estado: ${ESTADOS[form.estado]?.label ?? form.estado}` })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: nuevo, error } = await supabase.from('proyectos').insert({ ...payload, creado_por: user?.id }).select().single()
      if (error) { alerta('Error: ' + error.message); setGuardando(false); return }
      if (nuevo && user) await supabase.from('proyecto_actividades').insert({ proyecto_id: nuevo.id, user_id: user.id, descripcion: 'Proyecto creado' })
    }
    setGuardando(false); setModal(false); cargar()
  }

  async function cerrarProyecto(p: Proyecto) {
    confirmar(`¿Marcar "${p.titulo}" como completado?`, async () => {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('proyectos').update({ estado: 'completado', progreso: 100 }).eq('id', p.id)
      if (user) await supabase.from('proyecto_actividades').insert({ proyecto_id: p.id, user_id: user.id, descripcion: 'Proyecto cerrado como completado ✅' })
      cargar()
    })
  }

  async function agregarActividad() {
    if (!detalle || !nuevaAct.trim()) return
    setGuardandoAct(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('proyecto_actividades').insert({ proyecto_id: detalle.id, user_id: user!.id, descripcion: nuevaAct.trim() })
    setGuardandoAct(false); setNuevaAct(''); cargarActividades(detalle.id)
  }

  async function guardarProgreso() {
    if (!detalle) return
    const pct = Math.max(0, Math.min(100, parseInt(rawProg) || 0))
    const { error } = await supabase.from('proyectos').update({ progreso: pct }).eq('id', detalle.id)
    if (!error) {
      const nuevoProy = { ...detalle, progreso: pct }
      setDetalle(nuevoProy)
      setProyectos(ps => ps.map(p => p.id === detalle.id ? { ...p, progreso: pct } : p))
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('proyecto_actividades').insert({ proyecto_id: detalle.id, user_id: user.id, descripcion: `Progreso actualizado a ${pct}%` })
      cargarActividades(detalle.id)
    }
    setEditandoProg(false)
  }

  async function subirArchivo() {
    if (!detalle) return
    const upload = async (file: Blob | File, nombre: string, mimeType: string) => {
      setSubiendoArchivo(true)
      const ext = nombre.split('.').pop() ?? 'bin'
      const path = `${detalle.id}/${Date.now()}.${ext}`
      const { data: up, error } = await supabase.storage.from('proyectos-archivos').upload(path, file, { contentType: mimeType, upsert: true })
      if (error) { alerta('Error al subir: ' + error.message); setSubiendoArchivo(false); return }
      const { data: urlData } = supabase.storage.from('proyectos-archivos').getPublicUrl(up.path)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('proyecto_archivos').insert({
        proyecto_id: detalle.id, user_id: user!.id,
        nombre, url: urlData.publicUrl,
        tipo: mimeType.startsWith('image/') ? 'imagen' : 'documento',
      })
      setSubiendoArchivo(false)
      cargarActividades(detalle.id)
    }
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,.pdf,.doc,.docx,.xlsx,.pptx'
      input.onchange = async (e: any) => {
        const file: File = e.target.files?.[0]
        if (!file) return
        await upload(file, file.name, file.type)
      }
      input.click()
    } else {
      try {
        const ImagePicker = await import('expo-image-picker')
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
        if (result.canceled || !result.assets[0]) return
        const asset = result.assets[0]
        const res  = await fetch(asset.uri)
        const blob = await res.blob()
        const ext  = asset.uri.split('.').pop() ?? 'jpg'
        await upload(blob, asset.fileName ?? `foto_${Date.now()}.${ext}`, asset.mimeType ?? 'image/jpeg')
      } catch { setSubiendoArchivo(false) }
    }
  }

  async function eliminarArchivo(archivo: Archivo) {
    confirmar(`¿Eliminar "${archivo.nombre}"?`, async () => {
      const pathMatch = archivo.url.match(/proyectos-archivos\/(.+)$/)
      if (pathMatch) await supabase.storage.from('proyectos-archivos').remove([pathMatch[1]])
      await supabase.from('proyecto_archivos').delete().eq('id', archivo.id)
      if (detalle) cargarActividades(detalle.id)
    })
  }

  const filtrados = proyectos
    .filter(p => !filtroEstado    || p.estado    === filtroEstado)
    .filter(p => !filtroPrioridad || p.prioridad === filtroPrioridad)

  const totalPorEstado = Object.keys(ESTADOS).reduce<Record<string, number>>((acc, e) => {
    acc[e] = proyectos.filter(p => p.estado === e).length; return acc
  }, {})

  const enProgreso  = proyectos.filter(p => p.estado === 'en_progreso').length
  const completados = proyectos.filter(p => p.estado === 'completado').length

  // Colores dinámicos para dark mode
  const sheetBg    = darkMode ? '#0d1b2a' : '#fff'
  const sheetBg2   = darkMode ? '#111f2e' : '#f8fafc'
  const sheetBorder = darkMode ? '#1e3448' : '#f1f5f9'
  const textPrim   = darkMode ? '#e8f0f4' : '#0f172a'
  const textSub    = darkMode ? '#7a9ab5' : '#475569'
  const textMute   = darkMode ? '#556a7a' : '#94a3b8'
  const inputBg    = darkMode ? '#1a2d3f' : '#f5f8f9'
  const inputBorder = darkMode ? '#2a4560' : '#dde8e9'

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: darkMode ? '#0a1520' : '#1a6470' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Proyectos</Text>
            <View style={s.headerStats}>
              <Text style={s.headerStatTxt}>{proyectos.length} total</Text>
              <View style={s.headerStatDot} />
              <Text style={[s.headerStatTxt, { color: '#60a5fa' }]}>{enProgreso} en progreso</Text>
              <View style={s.headerStatDot} />
              <Text style={[s.headerStatTxt, { color: '#4ade80' }]}>{completados} completados</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={s.btnNuevo} onPress={abrirNuevo}>
          <Ionicons name="add" size={18} color="#1a3a2a" />
          <Text style={s.btnNuevoTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.kpiScroll, { backgroundColor: c.card, borderBottomColor: c.border }]}
        contentContainerStyle={s.kpiContent}
      >
        {Object.entries(ESTADOS).map(([key, cfg]) => {
          const activo = filtroEstado === key
          return (
            <TouchableOpacity
              key={key}
              style={[s.kpiCard, { backgroundColor: activo ? cfg.color + '20' : c.bg, borderColor: activo ? cfg.color : c.border }]}
              onPress={() => setFiltroEstado(filtroEstado === key ? null : key)}
            >
              <View style={[s.kpiDot, { backgroundColor: cfg.color }]} />
              <Text style={[s.kpiNum, { color: cfg.color }]}>{totalPorEstado[key] ?? 0}</Text>
              <Text style={[s.kpiLbl, { color: textMute }]}>{cfg.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Filtro prioridad */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.chipScroll, { backgroundColor: c.card, borderBottomColor: c.border }]}
        contentContainerStyle={s.chipContent}
      >
        {[{ key: null, label: 'Todos', color: '#64748b' }, ...Object.entries(PRIORIDADES).map(([key, cfg]) => ({ key, ...cfg }))].map(item => {
          const activo = filtroPrioridad === item.key
          return (
            <TouchableOpacity
              key={String(item.key)}
              style={[s.filterChip, { borderColor: activo ? item.color : c.border, backgroundColor: activo ? item.color : c.bg }]}
              onPress={() => setFiltroPrioridad(activo ? null : item.key)}
            >
              {item.key && <View style={[s.chipDot, { backgroundColor: activo ? '#fff' : item.color }]} />}
              <Text style={[s.chipTxt, { color: activo ? '#fff' : textSub }]}>{item.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 60 }} />
      ) : filtrados.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: darkMode ? '#111f2e' : '#f1f5f9' }]}>
            <Ionicons name="folder-open-outline" size={36} color={textMute} />
          </View>
          <Text style={[s.emptyTitulo, { color: textPrim }]}>
            {proyectos.length === 0 ? 'Sin proyectos aún' : 'Sin resultados'}
          </Text>
          <Text style={[s.emptySub, { color: textMute }]}>
            {proyectos.length === 0 ? 'Toca "Nuevo" para crear tu primer proyecto' : 'Prueba con otros filtros'}
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={refreshControl}
          contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {filtrados.map(p => {
            const est  = ESTADOS[p.estado] ?? ESTADOS.por_iniciar
            const prio = PRIORIDADES[p.prioridad] ?? PRIORIDADES.media
            const dias = diasRestantes(p.fecha_limite)
            const tipo = TIPOS.find(t => t.value === p.tipo)
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => { setDetalle(p); setTabDetalle('actividad'); setEditandoProg(false); cargarActividades(p.id) }}
                activeOpacity={0.8}
              >
                {/* Accent bar */}
                <View style={[s.cardAccent, { backgroundColor: prio.color }]} />
                <View style={s.cardBody}>
                  {/* Row 1: título + estado */}
                  <View style={s.cardRow1}>
                    <Text style={[s.cardTitulo, { color: textPrim }]} numberOfLines={1}>{p.titulo}</Text>
                    <View style={[s.estadoPill, { backgroundColor: est.color + (darkMode ? '30' : '15'), borderColor: est.color + '50' }]}>
                      <Text style={[s.estadoPillTxt, { color: est.color }]}>{est.icono} {est.label}</Text>
                    </View>
                  </View>
                  {/* Row 2: tipo + responsable */}
                  <View style={s.cardMeta}>
                    <Text style={[s.cardMetaTxt, { color: textMute }]}>{tipo?.label}</Text>
                    {p.responsable_nombre && (
                      <>
                        <Text style={[s.cardMetaSep, { color: c.border }]}>·</Text>
                        <Ionicons name="person-circle-outline" size={12} color={textMute} />
                        <Text style={[s.cardMetaTxt, { color: textMute }]}>{p.responsable_nombre}</Text>
                      </>
                    )}
                    {dias && (
                      <>
                        <Text style={[s.cardMetaSep, { color: c.border }]}>·</Text>
                        <Ionicons name="time-outline" size={12} color={dias.color} />
                        <Text style={[s.cardMetaTxt, { color: dias.color }]}>{dias.texto}</Text>
                      </>
                    )}
                  </View>
                  {/* Descripción */}
                  {p.descripcion ? (
                    <Text style={[s.cardDesc, { color: textSub }]} numberOfLines={2}>{p.descripcion}</Text>
                  ) : null}
                  {/* Progress */}
                  <View style={s.progressRow}>
                    <View style={[s.progressTrack, { backgroundColor: darkMode ? '#1e3448' : '#e2e8f0' }]}>
                      <View style={[s.progressFill, { width: `${p.progreso}%` as any, backgroundColor: est.color }]} />
                    </View>
                    <Text style={[s.progressPct, { color: est.color }]}>{p.progreso}%</Text>
                  </View>
                  {/* Actions */}
                  <View style={s.cardActions}>
                    <View style={[s.prioBadge, { backgroundColor: prio.color + '20', borderColor: prio.color + '40' }]}>
                      <View style={[s.prioDot, { backgroundColor: prio.color }]} />
                      <Text style={[s.prioTxt, { color: prio.color }]}>{prio.label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {p.estado !== 'completado' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: '#22c55e20', borderColor: '#22c55e40' }]}
                          onPress={() => cerrarProyecto(p)}
                        >
                          <Ionicons name="checkmark" size={13} color="#22c55e" />
                          <Text style={[s.actionBtnTxt, { color: '#22c55e' }]}>Cerrar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: darkMode ? '#1a2d3f' : '#e8f4f5', borderColor: darkMode ? '#2a4560' : '#b2d8dd' }]}
                        onPress={() => abrirEditar(p)}
                      >
                        <Ionicons name="create-outline" size={13} color="#3b82f6" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* ── Modal detalle ── */}
      <Modal visible={!!detalle} animationType="slide" transparent onRequestClose={() => setDetalle(null)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: sheetBg }]}>
            {detalle && (() => {
              const est  = ESTADOS[detalle.estado] ?? ESTADOS.por_iniciar
              const prio = PRIORIDADES[detalle.prioridad] ?? PRIORIDADES.media
              const dias = diasRestantes(detalle.fecha_limite)
              return (
                <>
                  {/* Handle */}
                  <View style={[s.sheetHandle, { backgroundColor: darkMode ? '#2a4560' : '#e2e8f0' }]} />

                  {/* Cabecera */}
                  <View style={[s.detalleHeader, { borderBottomColor: sheetBorder }]}>
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={[s.detalleTitulo, { color: textPrim }]} numberOfLines={3}>{detalle.titulo}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <View style={[s.estadoPill, { backgroundColor: est.color + '20', borderColor: est.color + '50' }]}>
                          <Text style={[s.estadoPillTxt, { color: est.color }]}>{est.icono} {est.label}</Text>
                        </View>
                        <View style={[s.estadoPill, { backgroundColor: prio.color + '20', borderColor: prio.color + '50' }]}>
                          <View style={[s.prioDot, { backgroundColor: prio.color }]} />
                          <Text style={[s.estadoPillTxt, { color: prio.color }]}>{prio.label}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity style={[s.closeBtn, { backgroundColor: darkMode ? '#1a2d3f' : '#f1f5f9' }]} onPress={() => setDetalle(null)}>
                      <Ionicons name="close" size={18} color={textMute} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 16, gap: 14 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {detalle.descripcion ? (
                      <Text style={[s.detalleDesc, { color: textSub }]}>{detalle.descripcion}</Text>
                    ) : null}

                    {/* Info cards row */}
                    {(detalle.responsable_nombre || dias || detalle.fecha_limite) && (
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {detalle.responsable_nombre && (
                          <View style={[s.infoChip, { backgroundColor: sheetBg2, borderColor: darkMode ? '#2a4560' : '#e2e8f0' }]}>
                            <Ionicons name="person-outline" size={12} color={textMute} />
                            <Text style={[s.infoChipTxt, { color: textSub }]}>{detalle.responsable_nombre}</Text>
                          </View>
                        )}
                        {dias && (
                          <View style={[s.infoChip, { backgroundColor: dias.color + '15', borderColor: dias.color + '30' }]}>
                            <Ionicons name="calendar-outline" size={12} color={dias.color} />
                            <Text style={[s.infoChipTxt, { color: dias.color }]}>{dias.texto} · {formatFecha(detalle.fecha_limite)}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Progreso */}
                    <View style={[s.progresoBox, { backgroundColor: sheetBg2, borderColor: darkMode ? '#2a4560' : '#e2e8f0' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View>
                          <Text style={[s.progresoLbl, { color: textSub }]}>Progreso del proyecto</Text>
                          <Text style={[s.progresoPct, { color: est.color }]}>{detalle.progreso}%</Text>
                        </View>
                        {!editandoProg ? (
                          <TouchableOpacity
                            style={[s.btnEditProg, { backgroundColor: est.color + '20', borderColor: est.color + '40' }]}
                            onPress={() => { setRawProg(String(detalle.progreso)); setEditandoProg(true) }}
                          >
                            <Ionicons name="pencil" size={12} color={est.color} />
                            <Text style={[s.btnEditProgTxt, { color: est.color }]}>Editar</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                              style={[s.progInput, { backgroundColor: darkMode ? '#0d1b2a' : '#fff', borderColor: est.color, color: est.color }]}
                              value={rawProg}
                              onChangeText={setRawProg}
                              keyboardType="numeric"
                              maxLength={3}
                              autoFocus
                            />
                            <Text style={{ fontSize: 14, color: textMute }}>%</Text>
                            <TouchableOpacity style={[s.btnOk, { backgroundColor: est.color }]} onPress={guardarProgreso}>
                              <Text style={s.btnOkTxt}>OK</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditandoProg(false)}>
                              <Ionicons name="close" size={18} color={textMute} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <View style={[s.progressTrack, { backgroundColor: darkMode ? '#0d1b2a' : '#e2e8f0', height: 8, borderRadius: 4 }]}>
                        <View style={[s.progressFill, { width: `${detalle.progreso}%` as any, backgroundColor: est.color, borderRadius: 4, height: 8 }]} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                        {[0, 25, 50, 75, 100].map(v => (
                          <TouchableOpacity
                            key={v}
                            style={[s.progQuick, { borderColor: detalle.progreso === v ? est.color : (darkMode ? '#2a4560' : '#e2e8f0'), backgroundColor: detalle.progreso === v ? est.color : 'transparent' }]}
                            onPress={async () => {
                              const { data: { user } } = await supabase.auth.getUser()
                              await supabase.from('proyectos').update({ progreso: v }).eq('id', detalle.id)
                              if (user) await supabase.from('proyecto_actividades').insert({ proyecto_id: detalle.id, user_id: user.id, descripcion: `Progreso actualizado a ${v}%` })
                              setDetalle(d => d ? { ...d, progreso: v } : d)
                              setProyectos(ps => ps.map(p => p.id === detalle.id ? { ...p, progreso: v } : p))
                              cargarActividades(detalle.id)
                            }}
                          >
                            <Text style={[s.progQuickTxt, { color: detalle.progreso === v ? '#fff' : textMute }]}>{v}%</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Tabs */}
                    <View style={[s.tabRow, { borderBottomColor: sheetBorder }]}>
                      {([
                        { key: 'actividad', label: '💬 Notas' },
                        { key: 'archivos',  label: `📎 Archivos${archivos.length ? ` (${archivos.length})` : ''}` },
                      ] as const).map(tab => (
                        <TouchableOpacity
                          key={tab.key}
                          style={[s.tabBtn, tabDetalle === tab.key && { borderBottomColor: '#3b82f6' }]}
                          onPress={() => setTabDetalle(tab.key)}
                        >
                          <Text style={[s.tabBtnTxt, { color: tabDetalle === tab.key ? '#3b82f6' : textMute }]}>{tab.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Tab notas */}
                    {tabDetalle === 'actividad' && (
                      <>
                        <View style={s.nuevaActRow}>
                          <TextInput
                            style={[s.nuevaActInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrim }]}
                            value={nuevaAct}
                            onChangeText={setNuevaAct}
                            placeholder="Agregar nota de avance..."
                            placeholderTextColor={textMute}
                            multiline
                          />
                          <TouchableOpacity
                            style={[s.btnAct, guardandoAct && { opacity: 0.6 }]}
                            onPress={agregarActividad}
                            disabled={guardandoAct}
                          >
                            {guardandoAct
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Ionicons name="send" size={16} color="#fff" />
                            }
                          </TouchableOpacity>
                        </View>
                        {cargandoAct
                          ? <ActivityIndicator color="#3b82f6" />
                          : actividades.length === 0
                            ? <Text style={[s.actVacia, { color: textMute }]}>Sin notas aún.</Text>
                            : actividades.map(a => (
                              <View key={a.id} style={[s.actRow, { borderBottomColor: sheetBorder }]}>
                                <View style={[s.actDot, { backgroundColor: '#3b82f6' }]} />
                                <View style={{ flex: 1 }}>
                                  <Text style={[s.actDesc, { color: textPrim }]}>{a.descripcion}</Text>
                                  <Text style={[s.actMeta, { color: textMute }]}>
                                    {a.user_nombre} · {new Date(a.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                </View>
                              </View>
                            ))
                        }
                      </>
                    )}

                    {/* Tab archivos */}
                    {tabDetalle === 'archivos' && (
                      <>
                        <TouchableOpacity
                          style={[s.btnSubir, { borderColor: darkMode ? '#2a4560' : '#1a6470' }, subiendoArchivo && { opacity: 0.6 }]}
                          onPress={subirArchivo}
                          disabled={subiendoArchivo}
                        >
                          {subiendoArchivo
                            ? <ActivityIndicator color="#3b82f6" size="small" />
                            : <>
                                <Ionicons name="cloud-upload-outline" size={18} color="#3b82f6" />
                                <Text style={[s.btnSubirTxt, { color: '#3b82f6' }]}>Subir imagen o archivo</Text>
                              </>
                          }
                        </TouchableOpacity>
                        {archivos.length === 0
                          ? <Text style={[s.actVacia, { color: textMute }]}>Sin archivos adjuntos aún.</Text>
                          : (
                            <View style={s.archivosGrid}>
                              {archivos.map(a => (
                                <View key={a.id} style={[s.archivoCard, { backgroundColor: sheetBg2, borderColor: darkMode ? '#2a4560' : '#e2e8f0' }]}>
                                  {a.tipo === 'imagen'
                                    ? <Image source={{ uri: a.url }} style={s.archivoImg} resizeMode="cover" />
                                    : <View style={[s.archivoDocIcon, { backgroundColor: darkMode ? '#1a2d3f' : '#e8f4f5' }]}>
                                        <Ionicons name="document-outline" size={30} color="#3b82f6" />
                                      </View>
                                  }
                                  <Text style={[s.archivoNombre, { color: textPrim }]} numberOfLines={1}>{a.nombre}</Text>
                                  <Text style={[s.archivoMeta, { color: textMute }]}>{a.user_nombre}</Text>
                                  <TouchableOpacity style={s.archivoEliminar} onPress={() => eliminarArchivo(a)}>
                                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          )
                        }
                      </>
                    )}
                  </ScrollView>

                  {/* Footer */}
                  <View style={[s.detalleFooter, { borderTopColor: sheetBorder, backgroundColor: sheetBg }]}>
                    <TouchableOpacity
                      style={[s.footerBtn, { borderColor: darkMode ? '#2a4560' : '#e2e8f0' }]}
                      onPress={() => { setDetalle(null); abrirEditar(detalle) }}
                    >
                      <Ionicons name="create-outline" size={15} color="#3b82f6" />
                      <Text style={[s.footerBtnTxt, { color: '#3b82f6' }]}>Editar</Text>
                    </TouchableOpacity>
                    {detalle.estado !== 'completado' && (
                      <TouchableOpacity
                        style={[s.footerBtnPrimary, { backgroundColor: '#22c55e' }]}
                        onPress={() => { setDetalle(null); cerrarProyecto(detalle) }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                        <Text style={s.footerBtnPrimaryTxt}>Marcar completado</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Modal crear / editar ── */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.overlay}>
          <ScrollView
            style={[s.formSheet, { backgroundColor: sheetBg }]}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[s.sheetHandle, { backgroundColor: darkMode ? '#2a4560' : '#e2e8f0' }]} />
            <Text style={[s.formTitle, { color: textPrim }]}>{editando ? 'Editar proyecto' : 'Nuevo proyecto'}</Text>

            <Text style={[s.lbl, { color: textMute }]}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {TIPOS.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.tipoBtn, { borderColor: form.tipo === t.value ? '#3b82f6' : inputBorder, backgroundColor: form.tipo === t.value ? '#3b82f620' : inputBg }]}
                  onPress={() => setForm(f => ({ ...f, tipo: t.value as any }))}
                >
                  <Text style={[s.tipoBtnTxt, { color: form.tipo === t.value ? '#3b82f6' : textPrim }]}>{t.label}</Text>
                  <Text style={[s.tipoBtnDesc, { color: textMute }]}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.lbl, { color: textMute }]}>Título *</Text>
            <TextInput
              style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrim }]}
              value={form.titulo}
              onChangeText={v => setForm(f => ({ ...f, titulo: v }))}
              placeholder="Nombre del proyecto"
              placeholderTextColor={textMute}
            />

            <Text style={[s.lbl, { color: textMute }]}>Descripción</Text>
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top', backgroundColor: inputBg, borderColor: inputBorder, color: textPrim }]}
              value={form.descripcion}
              onChangeText={v => setForm(f => ({ ...f, descripcion: v }))}
              placeholder="¿En qué consiste?"
              placeholderTextColor={textMute}
              multiline
            />

            <Text style={[s.lbl, { color: textMute }]}>Estado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {Object.entries(ESTADOS).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.filterChip, { borderColor: form.estado === key ? cfg.color : inputBorder, backgroundColor: form.estado === key ? cfg.color + '20' : inputBg }]}
                    onPress={() => setForm(f => ({ ...f, estado: key }))}
                  >
                    <Text style={[s.chipTxt, { color: form.estado === key ? cfg.color : textSub }]}>{cfg.icono} {cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.lbl, { color: textMute }]}>Prioridad</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {Object.entries(PRIORIDADES).map(([key, cfg]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.filterChip, { flex: 1, justifyContent: 'center', borderColor: form.prioridad === key ? cfg.color : inputBorder, backgroundColor: form.prioridad === key ? cfg.color + '20' : inputBg }]}
                  onPress={() => setForm(f => ({ ...f, prioridad: key }))}
                >
                  <View style={[s.chipDot, { backgroundColor: form.prioridad === key ? cfg.color : textMute }]} />
                  <Text style={[s.chipTxt, { color: form.prioridad === key ? cfg.color : textSub }]}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.lbl, { color: textMute }]}>Progreso: {form.progreso}%</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {[0, 25, 50, 75, 100].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.progQuick, { flex: 1, borderColor: form.progreso === v ? '#3b82f6' : inputBorder, backgroundColor: form.progreso === v ? '#3b82f620' : inputBg }]}
                  onPress={() => setForm(f => ({ ...f, progreso: v }))}
                >
                  <Text style={[s.progQuickTxt, { color: form.progreso === v ? '#3b82f6' : textSub }]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.lbl, { color: textMute }]}>Fecha límite (YYYY-MM-DD)</Text>
            <TextInput
              style={[s.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrim }]}
              value={form.fecha_limite}
              onChangeText={v => setForm(f => ({ ...f, fecha_limite: v }))}
              placeholder="2026-12-31"
              placeholderTextColor={textMute}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[s.lbl, { color: textMute }]}>Responsable</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[s.filterChip, { borderColor: !form.responsable_id ? '#3b82f6' : inputBorder, backgroundColor: !form.responsable_id ? '#3b82f620' : inputBg }]}
                  onPress={() => setForm(f => ({ ...f, responsable_id: '' }))}
                >
                  <Text style={[s.chipTxt, { color: !form.responsable_id ? '#3b82f6' : textSub }]}>Sin asignar</Text>
                </TouchableOpacity>
                {perfiles.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.filterChip, { borderColor: form.responsable_id === p.id ? '#3b82f6' : inputBorder, backgroundColor: form.responsable_id === p.id ? '#3b82f620' : inputBg }]}
                    onPress={() => setForm(f => ({ ...f, responsable_id: p.id }))}
                  >
                    <Text style={[s.chipTxt, { color: form.responsable_id === p.id ? '#3b82f6' : textSub }]}>{p.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.formBtns}>
              <TouchableOpacity style={[s.btnCancelar, { borderColor: inputBorder }]} onPress={() => setModal(false)}>
                <Text style={[s.btnCancelarTxt, { color: textSub }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnGuardarTxt}>{editando ? 'Guardar cambios' : 'Crear proyecto'}</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  headerStatTxt: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  headerStatDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  btnNuevo: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#4ade80', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnNuevoTxt: { color: '#1a3a2a', fontWeight: '800', fontSize: 13 },

  // KPI
  kpiScroll: { flexGrow: 0, borderBottomWidth: 1 },
  kpiContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  kpiCard: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, gap: 3, minWidth: 90 },
  kpiDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 2 },
  kpiNum: { fontSize: 22, fontWeight: '900', lineHeight: 26 },
  kpiLbl: { fontSize: 9, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Filtros
  chipScroll: { flexGrow: 0, borderBottomWidth: 1 },
  chipContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 7, flexDirection: 'row', alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipTxt: { fontSize: 12, fontWeight: '600' },

  // Lista vacía
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitulo: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Cards
  card: { borderRadius: 16, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 6 },
  cardRow1: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitulo: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  estadoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  estadoPillTxt: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  cardMetaTxt: { fontSize: 11, fontWeight: '500' },
  cardMetaSep: { fontSize: 11 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 4, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressPct: { fontSize: 11, fontWeight: '800', minWidth: 32, textAlign: 'right' },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  prioBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  prioDot: { width: 6, height: 6, borderRadius: 3 },
  prioTxt: { fontSize: 11, fontWeight: '600' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  actionBtnTxt: { fontSize: 12, fontWeight: '700' },

  // Modales
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', flex: 1 },
  formSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  // Detalle header
  detalleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, borderBottomWidth: 1 },
  detalleTitulo: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  detalleDesc: { fontSize: 14, lineHeight: 22 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Info chips en detalle
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  infoChipTxt: { fontSize: 12, fontWeight: '600' },

  // Progreso en detalle
  progresoBox: { borderRadius: 14, padding: 14, borderWidth: 1 },
  progresoLbl: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  progresoPct: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  btnEditProg: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  btnEditProgTxt: { fontSize: 12, fontWeight: '700' },
  progInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700', width: 60, textAlign: 'center' },
  btnOk: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnOkTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  progQuick: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  progQuickTxt: { fontSize: 11, fontWeight: '700' },

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnTxt: { fontSize: 13, fontWeight: '600' },

  // Actividad
  nuevaActRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  nuevaActInput: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, maxHeight: 80 },
  btnAct: { backgroundColor: '#3b82f6', borderRadius: 12, padding: 12 },
  actVacia: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  actRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  actDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  actDesc: { fontSize: 13, lineHeight: 18 },
  actMeta: { fontSize: 11, marginTop: 2 },

  // Archivos
  btnSubir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14 },
  btnSubirTxt: { fontSize: 14, fontWeight: '700' },
  archivosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  archivoCard: { width: '47%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, position: 'relative' },
  archivoImg: { width: '100%', height: 100 },
  archivoDocIcon: { height: 80, alignItems: 'center', justifyContent: 'center' },
  archivoNombre: { fontSize: 11, fontWeight: '600', padding: 8, paddingBottom: 2 },
  archivoMeta: { fontSize: 10, paddingHorizontal: 8, paddingBottom: 8 },
  archivoEliminar: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 5 },

  // Footer detalle
  detalleFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  footerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13 },
  footerBtnTxt: { fontSize: 14, fontWeight: '700' },
  footerBtnPrimary: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  footerBtnPrimaryTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Form
  formTitle: { fontSize: 20, fontWeight: '900', marginBottom: 6, marginTop: 8 },
  lbl: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },
  input: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  tipoBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 3 },
  tipoBtnTxt: { fontSize: 13, fontWeight: '700' },
  tipoBtnDesc: { fontSize: 10 },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 28 },
  btnCancelar: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnCancelarTxt: { fontWeight: '600', fontSize: 15 },
  btnGuardar: { flex: 2, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGuardarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
