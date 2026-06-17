import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Platform, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

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

const ESTADOS: Record<string, { label: string; color: string; bg: string; icono: string }> = {
  por_iniciar: { label: 'Por iniciar',  color: '#64748b', bg: '#f1f5f9', icono: '⭕' },
  en_progreso: { label: 'En progreso',  color: '#2563eb', bg: '#eff6ff', icono: '🔵' },
  en_revision: { label: 'En revisión',  color: '#d97706', bg: '#fffbeb', icono: '🟡' },
  completado:  { label: 'Completado',   color: '#16a34a', bg: '#f0fdf4', icono: '✅' },
  pausado:     { label: 'Pausado',      color: '#dc2626', bg: '#fef2f2', icono: '⏸️' },
}

const PRIORIDADES: Record<string, { label: string; color: string }> = {
  alta:  { label: 'Alta',  color: '#dc2626' },
  media: { label: 'Media', color: '#d97706' },
  baja:  { label: 'Baja',  color: '#16a34a' },
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
  if (diff < 0)  return { texto: `Venció hace ${Math.abs(diff)}d`, color: '#dc2626' }
  if (diff === 0) return { texto: 'Vence hoy',           color: '#d97706' }
  if (diff <= 3)  return { texto: `${diff}d restantes`,  color: '#d97706' }
  return               { texto: `${diff}d restantes`,    color: '#16a34a' }
}

// ── Componente ────────────────────────────────────────────────────────────

export default function Proyectos() {
  useSupervisorBlock()
  const [proyectos, setProyectos]     = useState<Proyecto[]>([])
  const [loading, setLoading]         = useState(true)
  const [perfiles, setPerfiles]       = useState<Perfil[]>([])
  const [filtroEstado, setFiltroEstado]       = useState<string | null>(null)
  const [filtroPrioridad, setFiltroPrioridad] = useState<string | null>(null)

  // Modal crear / editar
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState<Proyecto | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'general' as 'general' | 'individual',
    estado: 'por_iniciar', prioridad: 'media',
    progreso: 0, fecha_limite: '', responsable_id: '',
  })

  // Modal detalle
  const [detalle, setDetalle]         = useState<Proyecto | null>(null)
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [archivos, setArchivos]       = useState<Archivo[]>([])
  const [cargandoAct, setCargandoAct] = useState(false)
  const [nuevaAct, setNuevaAct]       = useState('')
  const [guardandoAct, setGuardandoAct] = useState(false)
  const [subiendoArchivo, setSubiendoArchivo] = useState(false)
  const [tabDetalle, setTabDetalle]   = useState<'actividad' | 'archivos'>('actividad')

  // Edición de progreso inline
  const [editandoProg, setEditandoProg] = useState(false)
  const [rawProg, setRawProg]           = useState('')

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
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

  // ── Guardar proyecto ──────────────────────────────────────────────────
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

  // ── Actividad / nota ──────────────────────────────────────────────────
  async function agregarActividad() {
    if (!detalle || !nuevaAct.trim()) return
    setGuardandoAct(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('proyecto_actividades').insert({ proyecto_id: detalle.id, user_id: user!.id, descripcion: nuevaAct.trim() })
    setGuardandoAct(false); setNuevaAct(''); cargarActividades(detalle.id)
  }

  // ── Progreso inline ───────────────────────────────────────────────────
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

  // ── Subir archivo ─────────────────────────────────────────────────────
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
      // Extraer path del storage desde la URL pública
      const pathMatch = archivo.url.match(/proyectos-archivos\/(.+)$/)
      if (pathMatch) await supabase.storage.from('proyectos-archivos').remove([pathMatch[1]])
      await supabase.from('proyecto_archivos').delete().eq('id', archivo.id)
      if (detalle) cargarActividades(detalle.id)
    })
  }

  // ── Filtrado ──────────────────────────────────────────────────────────
  const filtrados = proyectos
    .filter(p => !filtroEstado    || p.estado    === filtroEstado)
    .filter(p => !filtroPrioridad || p.prioridad === filtroPrioridad)

  const totalPorEstado = Object.keys(ESTADOS).reduce<Record<string, number>>((acc, e) => {
    acc[e] = proyectos.filter(p => p.estado === e).length; return acc
  }, {})

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Dashboard de Proyectos</Text>
            <Text style={s.headerSub}>{proyectos.length} proyectos · {proyectos.filter(p => p.estado === 'en_progreso').length} en progreso</Text>
          </View>
        </View>
        <TouchableOpacity style={s.btnNuevo} onPress={abrirNuevo}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.btnNuevoTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* KPI strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.kpiScroll} contentContainerStyle={s.kpiContent}>
        {Object.entries(ESTADOS).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[s.kpiCard, filtroEstado === key && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
            onPress={() => setFiltroEstado(filtroEstado === key ? null : key)}
          >
            <Text style={s.kpiIcn}>{cfg.icono}</Text>
            <Text style={[s.kpiNum, { color: cfg.color }]}>{totalPorEstado[key] ?? 0}</Text>
            <Text style={s.kpiLbl}>{cfg.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtro prioridad */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <TouchableOpacity style={[s.chip, !filtroPrioridad && s.chipActive]} onPress={() => setFiltroPrioridad(null)}>
          <Text style={[s.chipTxt, !filtroPrioridad && { color: '#fff' }]}>Todas</Text>
        </TouchableOpacity>
        {Object.entries(PRIORIDADES).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[s.chip, filtroPrioridad === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
            onPress={() => setFiltroPrioridad(filtroPrioridad === key ? null : key)}
          >
            <View style={[s.chipDot, { backgroundColor: cfg.color }, filtroPrioridad === key && { backgroundColor: '#fff' }]} />
            <Text style={[s.chipTxt, filtroPrioridad === key && { color: '#fff' }]}>{cfg.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 48 }} />
      ) : filtrados.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcn}>📂</Text>
          <Text style={s.emptyTxt}>{proyectos.length === 0 ? 'Sin proyectos aún' : 'Sin resultados'}</Text>
          {proyectos.length === 0 && <Text style={s.emptySub}>Crea tu primer proyecto con el botón "Nuevo"</Text>}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 12 }} showsVerticalScrollIndicator={false}>
          {filtrados.map(p => {
            const est  = ESTADOS[p.estado] ?? ESTADOS.por_iniciar
            const prio = PRIORIDADES[p.prioridad] ?? PRIORIDADES.media
            const dias = diasRestantes(p.fecha_limite)
            const tipo = TIPOS.find(t => t.value === p.tipo)
            return (
              <TouchableOpacity key={p.id} style={s.card}
                onPress={() => { setDetalle(p); setTabDetalle('actividad'); setEditandoProg(false); cargarActividades(p.id) }}
                activeOpacity={0.85}
              >
                <View style={[s.cardAccent, { backgroundColor: prio.color }]} />
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitulo} numberOfLines={1}>{p.titulo}</Text>
                      <View style={s.cardMeta}>
                        <Text style={s.cardTipo}>{tipo?.label}</Text>
                        {p.responsable_nombre && (
                          <><Text style={s.cardMetaSep}>·</Text>
                          <Ionicons name="person-outline" size={11} color="#94a3b8" />
                          <Text style={s.cardMetaTxt}>{p.responsable_nombre}</Text></>
                        )}
                      </View>
                    </View>
                    <View style={[s.estadoBadge, { backgroundColor: est.bg, borderColor: est.color + '55' }]}>
                      <Text style={[s.estadoTxt, { color: est.color }]}>{est.icono} {est.label}</Text>
                    </View>
                  </View>
                  {p.descripcion ? <Text style={s.cardDesc} numberOfLines={2}>{p.descripcion}</Text> : null}
                  <View style={s.progressWrap}>
                    <View style={s.progressBg}>
                      <View style={[s.progressFill, { width: `${p.progreso}%` as any, backgroundColor: est.color }]} />
                    </View>
                    <Text style={s.progressPct}>{p.progreso}%</Text>
                  </View>
                  <View style={s.cardFooter}>
                    {dias ? (
                      <View style={s.fechaRow}>
                        <Ionicons name="calendar-outline" size={11} color={dias.color} />
                        <Text style={[s.fechaTxt, { color: dias.color }]}>{dias.texto}</Text>
                      </View>
                    ) : <View />}
                    <View style={s.cardBtns}>
                      {p.estado !== 'completado' && (
                        <TouchableOpacity style={s.btnCerrar} onPress={() => cerrarProyecto(p)}>
                          <Text style={s.btnCerrarTxt}>✓ Cerrar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditar(p)}>
                        <Ionicons name="create-outline" size={14} color="#1a6470" />
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
          <View style={s.detalleSheet}>
            {detalle && (() => {
              const est  = ESTADOS[detalle.estado] ?? ESTADOS.por_iniciar
              const prio = PRIORIDADES[detalle.prioridad] ?? PRIORIDADES.media
              const dias = diasRestantes(detalle.fecha_limite)
              return (
                <>
                  {/* Header del detalle */}
                  <View style={s.detalleHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detalleTitulo} numberOfLines={2}>{detalle.titulo}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <View style={[s.estadoBadge, { backgroundColor: est.bg, borderColor: est.color + '55' }]}>
                          <Text style={[s.estadoTxt, { color: est.color }]}>{est.icono} {est.label}</Text>
                        </View>
                        <View style={[s.estadoBadge, { backgroundColor: prio.color + '15', borderColor: prio.color + '55' }]}>
                          <Text style={[s.estadoTxt, { color: prio.color }]}>↑ {prio.label}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setDetalle(null)} style={{ padding: 4 }}>
                      <Ionicons name="close" size={22} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {detalle.descripcion ? <Text style={s.detalleDesc}>{detalle.descripcion}</Text> : null}

                    {/* Progreso editable */}
                    <View style={s.progresoBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={s.progresoLbl}>Progreso</Text>
                        {!editandoProg ? (
                          <TouchableOpacity
                            style={s.btnEditProg}
                            onPress={() => { setRawProg(String(detalle.progreso)); setEditandoProg(true) }}
                          >
                            <Ionicons name="pencil" size={12} color="#1a6470" />
                            <Text style={s.btnEditProgTxt}>Editar</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                              style={s.progInput}
                              value={rawProg}
                              onChangeText={setRawProg}
                              keyboardType="numeric"
                              maxLength={3}
                              autoFocus
                            />
                            <Text style={{ fontSize: 14, color: '#64748b' }}>%</Text>
                            <TouchableOpacity style={s.btnGuardarProg} onPress={guardarProgreso}>
                              <Text style={s.btnGuardarProgTxt}>OK</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditandoProg(false)}>
                              <Ionicons name="close" size={18} color="#94a3b8" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <View style={s.progressWrap}>
                        <View style={[s.progressBg, { flex: 1 }]}>
                          <View style={[s.progressFill, { width: `${detalle.progreso}%` as any, backgroundColor: est.color }]} />
                        </View>
                        <Text style={[s.progressPct, { fontSize: 16, fontWeight: '800', color: est.color }]}>{detalle.progreso}%</Text>
                      </View>
                      {/* Accesos rápidos de porcentaje */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        {[0, 25, 50, 75, 100].map(v => (
                          <TouchableOpacity
                            key={v}
                            style={[s.progQuick, detalle.progreso === v && { backgroundColor: est.color }]}
                            onPress={async () => {
                              const { data: { user } } = await supabase.auth.getUser()
                              await supabase.from('proyectos').update({ progreso: v }).eq('id', detalle.id)
                              if (user) await supabase.from('proyecto_actividades').insert({ proyecto_id: detalle.id, user_id: user.id, descripcion: `Progreso actualizado a ${v}%` })
                              setDetalle(d => d ? { ...d, progreso: v } : d)
                              setProyectos(ps => ps.map(p => p.id === detalle.id ? { ...p, progreso: v } : p))
                              cargarActividades(detalle.id)
                            }}
                          >
                            <Text style={[s.progQuickTxt, detalle.progreso === v && { color: '#fff' }]}>{v}%</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Info */}
                    {(detalle.responsable_nombre || dias) && (
                      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                        {detalle.responsable_nombre && (
                          <View style={s.infoRow}>
                            <Ionicons name="person-outline" size={13} color="#64748b" />
                            <Text style={s.infoTxt}>{detalle.responsable_nombre}</Text>
                          </View>
                        )}
                        {dias && (
                          <View style={s.infoRow}>
                            <Ionicons name="calendar-outline" size={13} color={dias.color} />
                            <Text style={[s.infoTxt, { color: dias.color }]}>{dias.texto} · {formatFecha(detalle.fecha_limite)}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Tabs: Notas | Archivos */}
                    <View style={s.tabRow}>
                      <TouchableOpacity style={[s.tabBtn, tabDetalle === 'actividad' && s.tabBtnActive]} onPress={() => setTabDetalle('actividad')}>
                        <Text style={[s.tabBtnTxt, tabDetalle === 'actividad' && s.tabBtnTxtActive]}>💬 Notas del equipo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.tabBtn, tabDetalle === 'archivos' && s.tabBtnActive]} onPress={() => setTabDetalle('archivos')}>
                        <Text style={[s.tabBtnTxt, tabDetalle === 'archivos' && s.tabBtnTxtActive]}>📎 Archivos ({archivos.length})</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Tab notas */}
                    {tabDetalle === 'actividad' && (
                      <>
                        <View style={s.nuevaActRow}>
                          <TextInput
                            style={s.nuevaActInput}
                            value={nuevaAct}
                            onChangeText={setNuevaAct}
                            placeholder="Agregar nota de avance..."
                            placeholderTextColor="#94a3b8"
                            multiline
                          />
                          <TouchableOpacity style={[s.btnAct, guardandoAct && { opacity: 0.6 }]} onPress={agregarActividad} disabled={guardandoAct}>
                            {guardandoAct ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
                          </TouchableOpacity>
                        </View>
                        {cargandoAct ? <ActivityIndicator color="#1a6470" /> :
                          actividades.length === 0
                            ? <Text style={s.actVacia}>Sin notas aún. Sé el primero en agregar una.</Text>
                            : actividades.map(a => (
                              <View key={a.id} style={s.actRow}>
                                <View style={s.actDot} />
                                <View style={{ flex: 1 }}>
                                  <Text style={s.actDesc}>{a.descripcion}</Text>
                                  <Text style={s.actMeta}>
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
                          style={[s.btnSubir, subiendoArchivo && { opacity: 0.6 }]}
                          onPress={subirArchivo}
                          disabled={subiendoArchivo}
                        >
                          {subiendoArchivo
                            ? <ActivityIndicator color="#1a6470" size="small" />
                            : <><Ionicons name="cloud-upload-outline" size={18} color="#1a6470" /><Text style={s.btnSubirTxt}>Subir imagen o archivo</Text></>
                          }
                        </TouchableOpacity>

                        {archivos.length === 0
                          ? <Text style={s.actVacia}>Sin archivos adjuntos aún.</Text>
                          : (
                            <View style={s.archivosGrid}>
                              {archivos.map(a => (
                                <View key={a.id} style={s.archivoCard}>
                                  {a.tipo === 'imagen' ? (
                                    <Image source={{ uri: a.url }} style={s.archivoImg} resizeMode="cover" />
                                  ) : (
                                    <View style={s.archivoDocIcon}>
                                      <Ionicons name="document-outline" size={30} color="#1a6470" />
                                    </View>
                                  )}
                                  <Text style={s.archivoNombre} numberOfLines={1}>{a.nombre}</Text>
                                  <Text style={s.archivoMeta}>{a.user_nombre}</Text>
                                  <TouchableOpacity style={s.archivoEliminar} onPress={() => eliminarArchivo(a)}>
                                    <Ionicons name="trash-outline" size={14} color="#dc2626" />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          )
                        }
                      </>
                    )}
                  </ScrollView>

                  <View style={s.detalleFooter}>
                    <TouchableOpacity style={s.btnEditarDetalle} onPress={() => { setDetalle(null); abrirEditar(detalle) }}>
                      <Ionicons name="create-outline" size={15} color="#1a6470" />
                      <Text style={s.btnEditarDetalleTxt}>Editar</Text>
                    </TouchableOpacity>
                    {detalle.estado !== 'completado' && (
                      <TouchableOpacity style={s.btnCerrarDetalle} onPress={() => { setDetalle(null); cerrarProyecto(detalle) }}>
                        <Text style={s.btnCerrarDetalleTxt}>✓ Cerrar proyecto</Text>
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
          <ScrollView style={s.formSheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.formTitle}>{editando ? 'Editar proyecto' : 'Nuevo proyecto'}</Text>

            <Text style={s.lbl}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {TIPOS.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.tipoBtn, form.tipo === t.value && s.tipoBtnActive]}
                  onPress={() => setForm(f => ({ ...f, tipo: t.value as any }))}
                >
                  <Text style={[s.tipoBtnTxt, form.tipo === t.value && { color: '#fff' }]}>{t.label}</Text>
                  <Text style={[s.tipoBtnDesc, form.tipo === t.value && { color: 'rgba(255,255,255,0.75)' }]}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Título *</Text>
            <TextInput style={s.input} value={form.titulo} onChangeText={v => setForm(f => ({ ...f, titulo: v }))} placeholder="Nombre del proyecto" />

            <Text style={s.lbl}>Descripción</Text>
            <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={form.descripcion} onChangeText={v => setForm(f => ({ ...f, descripcion: v }))} placeholder="¿En qué consiste?" multiline />

            <Text style={s.lbl}>Estado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {Object.entries(ESTADOS).map(([key, cfg]) => (
                  <TouchableOpacity key={key} style={[s.chip, form.estado === key && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setForm(f => ({ ...f, estado: key }))}>
                    <Text style={[s.chipTxt, form.estado === key && { color: '#fff' }]}>{cfg.icono} {cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.lbl}>Prioridad</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {Object.entries(PRIORIDADES).map(([key, cfg]) => (
                <TouchableOpacity key={key} style={[s.chip, { flex: 1, justifyContent: 'center' }, form.prioridad === key && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setForm(f => ({ ...f, prioridad: key }))}>
                  <Text style={[s.chipTxt, form.prioridad === key && { color: '#fff' }]}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Progreso: {form.progreso}%</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {[0, 25, 50, 75, 100].map(v => (
                <TouchableOpacity key={v} style={[s.chip, { flex: 1, justifyContent: 'center' }, form.progreso === v && s.chipActive]} onPress={() => setForm(f => ({ ...f, progreso: v }))}>
                  <Text style={[s.chipTxt, form.progreso === v && { color: '#fff' }]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Fecha límite (YYYY-MM-DD)</Text>
            <TextInput style={s.input} value={form.fecha_limite} onChangeText={v => setForm(f => ({ ...f, fecha_limite: v }))} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" />

            <Text style={s.lbl}>Responsable</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[s.chip, !form.responsable_id && s.chipActive]} onPress={() => setForm(f => ({ ...f, responsable_id: '' }))}>
                  <Text style={[s.chipTxt, !form.responsable_id && { color: '#fff' }]}>Sin asignar</Text>
                </TouchableOpacity>
                {perfiles.map(p => (
                  <TouchableOpacity key={p.id} style={[s.chip, form.responsable_id === p.id && s.chipActive]} onPress={() => setForm(f => ({ ...f, responsable_id: p.id }))}>
                    <Text style={[s.chipTxt, form.responsable_id === p.id && { color: '#fff' }]}>{p.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.formBtns}>
              <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}>
                <Text style={s.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnGuardarTxt}>{editando ? 'Guardar cambios' : 'Crear proyecto'}</Text>}
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
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  btnNuevo:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnNuevoTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  kpiScroll:  { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  kpiContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  kpiCard:    { alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', minWidth: 80, gap: 2 },
  kpiIcn: { fontSize: 18 },
  kpiNum: { fontSize: 20, fontWeight: '800' },
  kpiLbl: { fontSize: 9, color: '#64748b', fontWeight: '600', textAlign: 'center' },

  chipRow:    { paddingHorizontal: 12, paddingVertical: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipDot:    { width: 7, height: 7, borderRadius: 4 },
  chipTxt:    { fontSize: 12, color: '#64748b', fontWeight: '600' },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyIcn: { fontSize: 48 },
  emptyTxt: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },

  card:       { backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', overflow: 'hidden', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardAccent: { width: 5 },
  cardBody:   { flex: 1, padding: 14 },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
  cardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTipo:   { fontSize: 11, color: '#64748b', fontWeight: '500' },
  cardMetaSep:{ color: '#cbd5e1' },
  cardMetaTxt:{ fontSize: 11, color: '#64748b' },
  cardDesc:   { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 8 },
  estadoBadge:{ flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  estadoTxt:  { fontSize: 11, fontWeight: '700' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressBg:   { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressPct:  { fontSize: 11, fontWeight: '700', color: '#64748b', minWidth: 30, textAlign: 'right' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fechaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fechaTxt:   { fontSize: 11, fontWeight: '600' },
  cardBtns:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btnCerrar:  { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#bbf7d0' },
  btnCerrarTxt:{ fontSize: 12, color: '#16a34a', fontWeight: '700' },
  btnEditar:  { backgroundColor: '#e8f4f5', borderRadius: 8, padding: 7, borderWidth: 1, borderColor: '#b2d8dd' },

  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  detalleSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', flex: 1 },
  formSheet:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%' },

  detalleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detalleTitulo: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  detalleDesc:   { fontSize: 14, color: '#475569', lineHeight: 20 },

  // Progreso editable
  progresoBox:     { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  progresoLbl:     { fontSize: 13, fontWeight: '700', color: '#334155' },
  btnEditProg:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e8f4f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  btnEditProgTxt:  { fontSize: 12, color: '#1a6470', fontWeight: '700' },
  progInput:       { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700', color: '#1a6470', width: 60, textAlign: 'center' },
  btnGuardarProg:  { backgroundColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnGuardarProgTxt:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  progQuick:       { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  progQuickTxt:    { fontSize: 11, fontWeight: '700', color: '#64748b' },

  // Info row
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoTxt: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  // Tabs
  tabRow:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tabBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:  { borderBottomColor: '#1a6470' },
  tabBtnTxt:     { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabBtnTxtActive:{ color: '#1a6470' },

  // Actividad
  nuevaActRow:  { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  nuevaActInput:{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1a1a2e', maxHeight: 80 },
  btnAct:       { backgroundColor: '#1a6470', borderRadius: 12, padding: 12 },
  actVacia:     { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  actRow:       { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  actDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a6470', marginTop: 5, flexShrink: 0 },
  actDesc:      { fontSize: 13, color: '#334155', lineHeight: 18 },
  actMeta:      { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  // Archivos
  btnSubir:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#1a6470', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 14 },
  btnSubirTxt:   { fontSize: 14, color: '#1a6470', fontWeight: '700' },
  archivosGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  archivoCard:   { width: '47%', backgroundColor: '#f8fafc', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  archivoImg:    { width: '100%', height: 100 },
  archivoDocIcon:{ height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f4f5' },
  archivoNombre: { fontSize: 11, fontWeight: '600', color: '#334155', padding: 8, paddingBottom: 2 },
  archivoMeta:   { fontSize: 10, color: '#94a3b8', paddingHorizontal: 8, paddingBottom: 8 },
  archivoEliminar:{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12, padding: 4 },

  // Footer
  detalleFooter:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  btnEditarDetalle:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 12, paddingVertical: 12 },
  btnEditarDetalleTxt: { fontSize: 14, color: '#1a6470', fontWeight: '700' },
  btnCerrarDetalle:    { flex: 2, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnCerrarDetalleTxt: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // Form
  formTitle:    { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 16 },
  lbl:          { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6, marginTop: 14 },
  input:        { backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e' },
  tipoBtn:      { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, gap: 3 },
  tipoBtnActive:{ backgroundColor: '#1a6470', borderColor: '#1a6470' },
  tipoBtnTxt:   { fontSize: 13, fontWeight: '700', color: '#334155' },
  tipoBtnDesc:  { fontSize: 10, color: '#94a3b8' },
  formBtns:     { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancelar:  { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnCancelarTxt:{ color: '#64748b', fontWeight: '600', fontSize: 15 },
  btnGuardar:   { flex: 2, backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGuardarTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
})
