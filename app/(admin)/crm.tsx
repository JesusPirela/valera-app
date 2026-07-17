import { useState, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking,
  ActivityIndicator, TouchableOpacity, ScrollView, Modal, Alert,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { normalizar } from '../../lib/texto'
import { useColors } from '../../lib/ThemeContext'
import { ESTADOS, ORDEN_ESTADOS as ORDEN_ESTADOS_BASE } from '../(prospectador)/crm'
import ImportCSVModal, { parsearCSV, type ImportedRow } from '../../components/ImportCSVModal'
import { normalizarTelefono } from '../../lib/telefono'
import { usePullRefresh } from '../../hooks/usePullRefresh'
// Pantalla recuperable + log si el CRM lanza un error al renderizar (en vez de
// quedarse en blanco/negro). expo-router usa este export por ruta.
export { ErrorBoundary } from '../../components/PantallaError'

type ClienteAdmin = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  estado: string
  tipo_operacion: string | null
  created_at: string
  responsable_id: string
  prospectador_nombre: string
  prospectador_email: string
  eliminado_at?: string | null
}

type Seccion = {
  title: string
  email: string
  responsableId: string
  data: ClienteAdmin[]
  total: number
}

const ORDEN_ESTADOS = ORDEN_ESTADOS_BASE

const ESTADOS_LISTA = ORDEN_ESTADOS

function estadoInfo(estado: string) {
  return ESTADOS[estado] ?? { label: estado, color: '#555', bg: '#eee' }
}

function tiempoRelativo(fechaISO: string) {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias}d`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function abrirWhatsApp(telefono: string, nombre: string) {
  const num = normalizarTelefono(telefono)
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else Linking.openURL(url)
}

type UsuarioSimple = { id: string; nombre: string }

export default function AdminCRM() {
  const c = useColors()
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [operacionFiltro, setOperacionFiltro] = useState<'venta' | 'renta' | null>(null)
  const [miId, setMiId] = useState<string | null>(null)
  const cargadoUnaVez = useRef(false)
  const colapsoInicialAplicado = useRef(false)

  const [modalNuevo, setModalNuevo] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoEmpresa, setNuevoEmpresa] = useState('')
  const [nuevoTipoOp, setNuevoTipoOp] = useState<'venta' | 'renta'>('venta')
  const [nuevoEstado, setNuevoEstado] = useState('por_perfilar')
  const [nuevoUserId, setNuevoUserId] = useState('')
  const [usuariosLista, setUsuariosLista] = useState<UsuarioSimple[]>([])
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [papeleraModal, setPapeleraModal] = useState(false)
  const [papeleraClientes, setPapeleraClientes] = useState<ClienteAdmin[]>([])
  const [papeleraCargando, setPapeleraCargando] = useState(false)
  const [exportando, setExportando] = useState(false)

  async function cargarClientes() {
    if (!cargadoUnaVez.current) setLoading(true)
    setErrorMsg(null)

    let yo = miId
    if (!yo) {
      const { data: { user } } = await supabase.auth.getUser()
      yo = user?.id ?? null
      if (yo) setMiId(yo)
    }

    // Paginar: PostgREST corta en 1000 filas/petición. Sin esto, con >1000
    // clientes el CRM solo contaba/mostraba los primeros 1000 (por eso el total
    // se quedaba clavado en "1000" aunque hubiera más).
    const PAGE = 1000
    let clientesData: any[] = []
    let errorClientes: any = null
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, empresa, estado, tipo_operacion, created_at, responsable_id')
        .is('eliminado_at', null)
        .order('updated_at', { ascending: false })
        .range(desde, desde + PAGE - 1)
      if (error) { errorClientes = error; break }
      clientesData = clientesData.concat(data ?? [])
      if (!data || data.length < PAGE) break
    }

    if (errorClientes) { setErrorMsg(errorClientes.message); setLoading(false); cargadoUnaVez.current = true; return }
    if (!clientesData.length) { setSecciones([]); setLoading(false); cargadoUnaVez.current = true; return }

    const idsUnicos = [...new Set(clientesData.map((c: any) => c.responsable_id).filter(Boolean))]
    const { data: perfilesData } = await supabase
      .from('profiles').select('id, nombre').in('id', idsUnicos)

    const mapaPerfiles = new Map<string, string>()
    for (const p of perfilesData ?? []) mapaPerfiles.set(p.id, p.nombre ?? 'Sin nombre')

    const clientesNorm: ClienteAdmin[] = clientesData.map((c: any) => ({
      id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email,
      empresa: c.empresa, estado: c.estado, tipo_operacion: c.tipo_operacion ?? null,
      created_at: c.created_at, responsable_id: c.responsable_id,
      prospectador_nombre: mapaPerfiles.get(c.responsable_id) ?? 'Sin asignar',
      prospectador_email: '',
    }))

    // Agrupar por responsable_id (no por nombre, para distinguir homónimos
    // y para poder identificar de forma confiable "mis" clientes).
    const mapaProsp = new Map<string, ClienteAdmin[]>()
    for (const cl of clientesNorm) {
      const key = cl.responsable_id || 'sin_asignar'
      if (!mapaProsp.has(key)) mapaProsp.set(key, [])
      mapaProsp.get(key)!.push(cl)
    }

    const nuevasSecciones = Array.from(mapaProsp.entries())
      .map(([respId, clientes]) => ({
        title: clientes[0]?.prospectador_nombre ?? 'Sin asignar',
        email: '',
        responsableId: respId,
        data: clientes,
        total: clientes.length,
      }))
      .sort((a, b) => {
        // Mis propios clientes siempre hasta arriba
        if (yo && a.responsableId === yo) return -1
        if (yo && b.responsableId === yo) return 1
        return a.title.localeCompare(b.title)
      })

    setSecciones(nuevasSecciones)

    // Por defecto todas las secciones aparecen colapsadas (incluida la propia);
    // solo se aplica una vez para no pisar los toggles manuales del usuario.
    if (!colapsoInicialAplicado.current) {
      setSeccionesColapsadas(new Set(nuevasSecciones.map(s => s.responsableId)))
      colapsoInicialAplicado.current = true
    }

    setLoading(false)
    cargadoUnaVez.current = true
  }

  useFocusEffect(useCallback(() => { cargarClientes() }, []))
  const { refreshControl } = usePullRefresh(cargarClientes)

  async function abrirModalNuevo() {
    setNuevoNombre(''); setNuevoTelefono(''); setNuevoEmail('')
    setNuevoEmpresa(''); setNuevoTipoOp('venta'); setNuevoEstado('por_perfilar'); setNuevoUserId('')
    const { data } = await supabase.from('profiles').select('id, nombre').neq('role', 'admin').order('nombre')
    setUsuariosLista((data ?? []) as UsuarioSimple[])
    setModalNuevo(true)
  }

  async function confirmarEliminarCliente(item: ClienteAdmin) {
    const { count } = await supabase
      .from('recordatorios')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', item.id)
    const seguimientos = count ?? 0
    const aviso = seguimientos > 0
      ? `\n\n⚠️ Este cliente tiene ${seguimientos} seguimiento${seguimientos > 1 ? 's' : ''} registrado${seguimientos > 1 ? 's' : ''}. Al eliminarlo se perderán esos datos.`
      : ''
    const mensaje = `¿Mover a "${item.nombre}" a la papelera?${aviso}`
    if (Platform.OS === 'web') {
      if (window.confirm(mensaje)) eliminarCliente(item.id)
    } else {
      Alert.alert('Eliminar cliente', mensaje, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarCliente(item.id) },
      ])
    }
  }

  async function eliminarCliente(id: string) {
    const { error } = await supabase.from('clientes').update({ eliminado_at: new Date().toISOString() }).eq('id', id)
    if (error) { Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); return }
    setSecciones(prev =>
      prev
        .map(sec => ({ ...sec, data: sec.data.filter(c => c.id !== id), total: sec.total - (sec.data.some(c => c.id === id) ? 1 : 0) }))
        .filter(sec => sec.data.length > 0)
    )
  }

  async function cargarPapelera() {
    setPapeleraCargando(true)
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, empresa, estado, tipo_operacion, created_at, responsable_id, eliminado_at')
      .not('eliminado_at', 'is', null)
      .order('eliminado_at', { ascending: false })
    if (data) {
      const idsUnicos = [...new Set(data.map((c: any) => c.responsable_id).filter(Boolean))]
      const { data: perfs } = await supabase.from('profiles').select('id, nombre').in('id', idsUnicos)
      const mapa = new Map((perfs ?? []).map((p: any) => [p.id, p.nombre ?? 'Sin nombre']))
      setPapeleraClientes(data.map((c: any) => ({
        ...c, prospectador_nombre: mapa.get(c.responsable_id) ?? 'Sin asignar', prospectador_email: '',
      })))
    }
    setPapeleraCargando(false)
  }

  async function restaurarCliente(id: string) {
    const { error } = await supabase.from('clientes').update({ eliminado_at: null }).eq('id', id)
    if (error) { Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); return }
    setPapeleraClientes(prev => prev.filter(c => c.id !== id))
    cargarClientes()
  }

  async function exportarCSV() {
    setExportando(true)
    try {
      // Paginar: sin esto la exportación se cortaba en 1000 clientes.
      const PAGE = 1000
      let data: any[] = []
      for (let desde = 0; ; desde += PAGE) {
        const { data: lote } = await supabase
          .from('clientes')
          .select('nombre, telefono, email, empresa, estado, tipo_operacion, proximo_contacto, notas, zona_busqueda, presupuesto, created_at, responsable_id')
          .is('eliminado_at', null)
          .order('updated_at', { ascending: false })
          .range(desde, desde + PAGE - 1)
        data = data.concat(lote ?? [])
        if (!lote || lote.length < PAGE) break
      }
      if (!data.length) return
      const idsUnicos = [...new Set(data.map((c: any) => c.responsable_id).filter(Boolean))]
      const { data: perfs } = await supabase.from('profiles').select('id, nombre').in('id', idsUnicos)
      const mapa = new Map((perfs ?? []).map((p: any) => [p.id, p.nombre ?? '']))
      const headers = ['Nombre', 'Teléfono', 'Email', 'Empresa', 'Estado', 'Operación', 'Próx. contacto', 'Zona', 'Presupuesto', 'Notas', 'Asesor', 'Fecha alta']
      const rows = data.map((c: any) => [
        c.nombre, c.telefono, c.email ?? '', c.empresa ?? '',
        ESTADOS[c.estado]?.label ?? c.estado,
        c.tipo_operacion ?? '',
        c.proximo_contacto ? new Date(c.proximo_contacto).toLocaleDateString('es-MX') : '',
        c.zona_busqueda ?? '', c.presupuesto ?? '',
        (c.notas ?? '').replace(/\n/g, ' '),
        mapa.get(c.responsable_id) ?? '',
        new Date(c.created_at).toLocaleDateString('es-MX'),
      ])
      const csv = [headers, ...rows]
        .map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      if (Platform.OS === 'web') {
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setExportando(false)
    }
  }

  async function guardarNuevoCliente() {
    if (!nuevoNombre.trim()) { Platform.OS === 'web' ? window.alert('El nombre es requerido') : Alert.alert('Error', 'El nombre es requerido'); return }
    if (!nuevoTelefono.trim()) { Platform.OS === 'web' ? window.alert('El teléfono es requerido') : Alert.alert('Error', 'El teléfono es requerido'); return }
    if (!nuevoUserId) { Platform.OS === 'web' ? window.alert('Selecciona un asesor') : Alert.alert('Error', 'Selecciona un asesor'); return }
    setGuardandoCliente(true)
    const { error } = await supabase.from('clientes').insert({
      nombre: nuevoNombre.trim(), telefono: nuevoTelefono.trim(),
      email: nuevoEmail.trim() || null, empresa: nuevoEmpresa.trim() || null,
      tipo_operacion: nuevoTipoOp, estado: nuevoEstado,
      fuente_lead: 'admin', responsable_id: nuevoUserId,
    })
    setGuardandoCliente(false)
    if (error) { Platform.OS === 'web' ? window.alert(error.message) : Alert.alert('Error', error.message); return }
    setModalNuevo(false)
    cargarClientes()
  }

  const { todosClientes, totalGlobal, totalPipeline, enProceso, comprados, conteosPorEstado } = useMemo(() => {
    const todos = secciones.flatMap((s) => s.data)
    const pipeline = operacionFiltro ? todos.filter(c => c.tipo_operacion === operacionFiltro) : todos
    return {
      todosClientes: todos,
      totalGlobal: todos.length,
      clientesParaPipeline: pipeline,
      totalPipeline: pipeline.length,
      enProceso: pipeline.filter(c => c.estado === 'seguimiento_cierre' || c.estado === 'cita_agendada').length,
      comprados: pipeline.filter(c => c.estado === 'compro').length,
      conteosPorEstado: ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
        acc[e] = pipeline.filter((c) => c.estado === e).length
        return acc
      }, {}),
    }
  }, [secciones, operacionFiltro])

  const seccionesFiltradas: Seccion[] = useMemo(() => secciones
    .map((sec) => {
      let clientes = sec.data
      if (busqueda.trim()) {
        const q = normalizar(busqueda)
        clientes = clientes.filter((c) =>
          normalizar(c.nombre).includes(q) || c.telefono.includes(q) ||
          normalizar(c.empresa).includes(q) ||
          normalizar(sec.title).includes(q)
        )
      }
      if (estadoFiltro) clientes = clientes.filter((c) => c.estado === estadoFiltro)
      if (operacionFiltro) clientes = clientes.filter((c) => c.tipo_operacion === operacionFiltro)
      return { ...sec, data: clientes }
    })
    .filter((sec) => sec.data.length > 0),
  [secciones, busqueda, estadoFiltro, operacionFiltro])

  // ── Importar CSV ─────────────────────────────────────────────
  const [importModal, setImportModal]   = useState(false)
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([])
  const [csvData, setCsvData]           = useState<string[][]>([])
  const [usuariosImport, setUsuariosImport] = useState<UsuarioSimple[]>([])

  async function abrirImport() {
    const { data: perfs } = await supabase.from('profiles').select('id, nombre').neq('role', 'admin').order('nombre')
    setUsuariosImport((perfs ?? []) as UsuarioSimple[])
    const procesar = (texto: string) => {
      const matriz = parsearCSV(texto)
      if (matriz.length < 2) return
      setCsvHeaders(matriz[0])
      setCsvData(matriz.slice(1))
      setImportModal(true)
    }
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv,text/csv'
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0]
        if (!file) return
        procesar(await file.text())
      }
      input.click()
    } else {
      try {
        const DocumentPicker = await import('expo-document-picker')
        const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', '*/*'] })
        if (result.canceled) return
        const { default: FileSystem } = await import('expo-file-system')
        procesar(await FileSystem.readAsStringAsync(result.assets[0].uri))
      } catch {
        // módulo nativo no disponible en este build
      }
    }
  }

  async function handleImportConfirm(rows: ImportedRow[], responsableId?: string) {
    if (!responsableId) throw new Error('Asesor requerido')
    const { error } = await supabase.from('clientes').insert(rows.map(r => ({
      nombre: r.nombre, telefono: r.telefono,
      email: r.email, empresa: r.empresa,
      tipo_operacion: r.tipo_operacion, estado: r.estado ?? 'por_perfilar',
      zona_busqueda: r.zona_busqueda, presupuesto: r.presupuesto,
      fuente_lead: r.fuente_lead ?? 'sheets', notas: r.notas,
      responsable_id: responsableId,
    })))
    if (error) throw error
    cargarClientes()
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>

      {/* Stats banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#c9a84c' }]}>{totalGlobal}</Text>
          <Text style={styles.statLabel}>Leads</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#e07bb5' }]}>{enProceso}</Text>
          <Text style={styles.statLabel}>En proceso</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#4cdb8a' }]}>{comprados}</Text>
          <Text style={styles.statLabel}>Cerrados</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#c9a84c' }]}>{secciones.length}</Text>
          <Text style={styles.statLabel}>Asesores</Text>
        </View>
      </View>

      {/* Filtro Venta / Renta */}
      <View style={[styles.operacionRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {([null, 'venta', 'renta'] as const).map((op) => {
          const activo = operacionFiltro === op
          const label = op === null ? 'Todos' : op === 'venta' ? 'Venta' : 'Renta'
          return (
            <TouchableOpacity key={label} style={[styles.operacionTab, activo && styles.operacionTabActivo]} onPress={() => setOperacionFiltro(op)}>
              <Text style={[styles.operacionTabText, activo && styles.operacionTabTextActivo]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Pipeline chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pipelineScroll, { backgroundColor: c.card, borderBottomColor: c.border }]} contentContainerStyle={styles.pipelineContent}>
        <TouchableOpacity
          style={[styles.pipelineChip, estadoFiltro === null && styles.pipelineChipAll]}
          onPress={() => setEstadoFiltro(null)}
        >
          <View style={[styles.pipelineDot, { backgroundColor: estadoFiltro === null ? '#c9a84c' : '#aaa' }]} />
          <View>
            <Text style={[styles.pipelineCount, estadoFiltro === null && styles.pipelineCountAll]}>{totalPipeline}</Text>
            <Text style={[styles.pipelineLabel, estadoFiltro === null && styles.pipelineLabelAll]}>Todos</Text>
          </View>
        </TouchableOpacity>
        {ORDEN_ESTADOS.map((e) => {
          const info = estadoInfo(e)
          const activo = estadoFiltro === e
          return (
            <TouchableOpacity
              key={e}
              style={[styles.pipelineChip, activo && { backgroundColor: info.bg, borderColor: info.color }]}
              onPress={() => setEstadoFiltro(activo ? null : e)}
            >
              <View style={[styles.pipelineDot, { backgroundColor: info.color }]} />
              <View>
                <Text style={[styles.pipelineCount, activo && { color: info.color }]}>{conteosPorEstado[e]}</Text>
                <Text style={[styles.pipelineLabel, activo && { color: info.color, fontWeight: '600' }]}>{info.label}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Botón leads de campaña */}
      <TouchableOpacity style={styles.btnCampana} onPress={() => router.push('/(admin)/campaign-leads')}>
        <Text style={styles.btnCampanaTxt}>📣 Leads de Campaña</Text>
      </TouchableOpacity>

      {/* Botón chats de WhatsApp */}
      <TouchableOpacity style={[styles.btnCampana, { backgroundColor: '#25D366' }]} onPress={() => router.push('/(admin)/chats')}>
        <Text style={styles.btnCampanaTxt}>💬 Chats de WhatsApp</Text>
      </TouchableOpacity>

      {/* Fila papelera + exportar */}
      <View style={styles.accionesRow}>
        <TouchableOpacity style={[styles.btnAccion, { borderColor: '#e74c3c20', backgroundColor: '#fef5f5' }]}
          onPress={() => { cargarPapelera(); setPapeleraModal(true) }}>
          <Ionicons name="trash-outline" size={14} color="#e74c3c" />
          <Text style={[styles.btnAccionTxt, { color: '#e74c3c' }]}>Papelera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnAccion, { borderColor: '#1a647020', backgroundColor: '#f0f8fa' }]}
          onPress={exportarCSV} disabled={exportando}>
          <Ionicons name="download-outline" size={14} color="#1a6470" />
          <Text style={[styles.btnAccionTxt, { color: '#1a6470' }]}>{exportando ? 'Exportando…' : 'Exportar CSV'}</Text>
        </TouchableOpacity>
      </View>

      {/* Búsqueda + botón importar + botón nuevo */}
      <View style={styles.searchRow}>
        <View style={[styles.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={16} color="#9eafb2" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: c.inputText }]}
            placeholder="Buscar cliente o asesor..."
            placeholderTextColor={c.placeholder}
            value={busqueda}
            onChangeText={setBusqueda}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity style={styles.btnExportar} onPress={abrirImport}>
          <Ionicons name="cloud-upload-outline" size={16} color="#1a6470" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnNuevo} onPress={abrirModalNuevo}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <Text style={{ color: '#c0392b', fontSize: 13 }}>{errorMsg}</Text>
        </View>
      ) : seccionesFiltradas.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={48} color="#d0dfe1" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }} refreshControl={refreshControl}>
          {seccionesFiltradas.map((sec) => {
            const colapsada = seccionesColapsadas.has(sec.responsableId)
            const totalSec = secciones.find((s) => s.responsableId === sec.responsableId)?.total ?? 0
            const initProsp = iniciales(sec.title)
            const esPropia = sec.responsableId === miId

            return (
              <View key={sec.responsableId} style={styles.seccion}>
                {/* Cabecera del prospectador */}
                <TouchableOpacity
                  style={[styles.secHeader, { backgroundColor: c.card }, esPropia && styles.secHeaderPropia]}
                  onPress={() => setSeccionesColapsadas((prev) => {
                    const s = new Set(prev)
                    s.has(sec.responsableId) ? s.delete(sec.responsableId) : s.add(sec.responsableId)
                    return s
                  })}
                  activeOpacity={0.75}
                >
                  <View style={styles.secHeaderLeft}>
                    <View style={styles.secAvatar}>
                      <Text style={styles.secAvatarText}>{initProsp}</Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.secNombre, { color: c.text }]}>{sec.title}</Text>
                        {esPropia && (
                          <View style={styles.secPropiaBadge}>
                            <Text style={styles.secPropiaBadgeTxt}>TÚ</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.secSub}>{sec.data.length} mostrando · {totalSec} total</Text>
                    </View>
                  </View>
                  <Ionicons name={colapsada ? 'chevron-forward' : 'chevron-down'} size={16} color="#c0cdd0" />
                </TouchableOpacity>

                {/* Cards de clientes */}
                {!colapsada && sec.data.map((item) => {
                  const info = estadoInfo(item.estado)
                  const initials = iniciales(item.nombre)
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => router.push(`/(admin)/detalle-cliente?id=${item.id}`)}
                      activeOpacity={0.82}
                    >
                      <View style={[styles.cardAccent, { backgroundColor: info.color }]} />
                      <View style={styles.cardInner}>
                        <View style={styles.cardTop}>
                          <View style={[styles.avatar, { backgroundColor: info.color + '18' }]}>
                            <Text style={[styles.avatarText, { color: info.color }]}>{initials}</Text>
                          </View>
                          <View style={styles.cardInfo}>
                            <Text style={[styles.cardNombre, { color: c.text }]} numberOfLines={1}>{item.nombre}</Text>
                            <Text style={styles.cardSub} numberOfLines={1}>
                              {item.empresa ? item.empresa : item.telefono}
                            </Text>
                          </View>
                          <View style={[styles.estadoBadge, { backgroundColor: info.bg, borderColor: info.color + '50' }]}>
                            <View style={[styles.estadoDot, { backgroundColor: info.color }]} />
                            <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                          </View>
                        </View>

                        <View style={styles.cardMeta}>
                          {item.empresa ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="call-outline" size={11} color="#b0bfc2" />
                              <Text style={styles.metaText}>{item.telefono}</Text>
                            </View>
                          ) : null}
                          {item.tipo_operacion ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="home-outline" size={11} color="#b0bfc2" />
                              <Text style={styles.metaText}>{item.tipo_operacion}</Text>
                            </View>
                          ) : null}
                          <View style={styles.metaItem}>
                            <Ionicons name="time-outline" size={11} color="#b0bfc2" />
                            <Text style={styles.metaText}>{tiempoRelativo(item.created_at)}</Text>
                          </View>
                        </View>

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.actionWa}
                            onPress={() => abrirWhatsApp(item.telefono, item.nombre)}
                          >
                            <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                            <Text style={styles.actionWaText}>WhatsApp</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionCall}
                            onPress={() => Linking.openURL(`tel:${normalizarTelefono(item.telefono)}`)}
                          >
                            <Ionicons name="call-outline" size={12} color="#1a6470" />
                            <Text style={styles.actionCallText}>Llamar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionDelete}
                            onPress={() => confirmarEliminarCliente(item)}
                          >
                            <Ionicons name="trash-outline" size={12} color="#c0392b" />
                          </TouchableOpacity>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Ionicons name="chevron-forward" size={14} color="#d0d8da" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* Modal nuevo cliente */}
      <Modal visible={modalNuevo} animationType="slide" transparent onRequestClose={() => setModalNuevo(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitulo, { color: c.text }]}>Nuevo cliente</Text>
              <TouchableOpacity onPress={() => setModalNuevo(false)}>
                <Ionicons name="close" size={22} color="#9eafb2" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.mLabel}>Nombre *</Text>
              <TextInput style={[styles.mInput, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="Nombre completo" value={nuevoNombre} onChangeText={setNuevoNombre} autoCapitalize="words" />

              <Text style={styles.mLabel}>Teléfono *</Text>
              <TextInput style={[styles.mInput, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="10 dígitos" value={nuevoTelefono} onChangeText={setNuevoTelefono} keyboardType="phone-pad" />

              <Text style={styles.mLabel}>Email</Text>
              <TextInput style={[styles.mInput, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="correo@ejemplo.com" value={nuevoEmail} onChangeText={setNuevoEmail} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.mLabel}>Empresa</Text>
              <TextInput style={[styles.mInput, { borderColor: c.inputBorder, color: c.inputText, backgroundColor: c.input }]} placeholder="Empresa (opcional)" value={nuevoEmpresa} onChangeText={setNuevoEmpresa} />

              <Text style={styles.mLabel}>Tipo de operación</Text>
              <View style={styles.mRow}>
                {(['venta', 'renta'] as const).map(op => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.mChip, nuevoTipoOp === op && styles.mChipActivo]}
                    onPress={() => setNuevoTipoOp(op)}
                  >
                    <Text style={[styles.mChipTxt, nuevoTipoOp === op && { color: '#fff' }]}>
                      {op === 'venta' ? 'Venta' : 'Renta'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.mLabel}>Estado inicial</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={styles.mRow}>
                  {ESTADOS_LISTA.map(e => {
                    const info = ESTADOS[e] ?? { label: e, color: '#555', bg: '#eee' }
                    return (
                      <TouchableOpacity
                        key={e}
                        style={[styles.mChip, { borderColor: info.color }, nuevoEstado === e && { backgroundColor: info.bg }]}
                        onPress={() => setNuevoEstado(e)}
                      >
                        <Text style={[styles.mChipTxt, { color: info.color }]}>{info.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>

              <Text style={styles.mLabel}>Asignar a asesor *</Text>
              {usuariosLista.length === 0 ? (
                <Text style={styles.mHint}>No hay asesores registrados</Text>
              ) : (
                <View style={styles.mUsuariosList}>
                  {usuariosLista.map(u => (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.mUsuarioRow, nuevoUserId === u.id && styles.mUsuarioRowActivo]}
                      onPress={() => setNuevoUserId(u.id)}
                    >
                      <View style={[styles.mAvatar, { backgroundColor: nuevoUserId === u.id ? '#d4f0e2' : '#e8f2f4' }]}>
                        <Text style={[styles.mAvatarTxt, { color: nuevoUserId === u.id ? '#2a8a5a' : '#1a6470' }]}>
                          {(u.nombre ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.mUsuarioNombre, { color: c.text }, nuevoUserId === u.id && { color: '#2a8a5a', fontWeight: '700' }]}>
                        {u.nombre}
                      </Text>
                      {nuevoUserId === u.id && <Ionicons name="checkmark-circle" size={18} color="#2a8a5a" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.mGuardarBtn, guardandoCliente && { opacity: 0.6 }]}
                onPress={guardarNuevoCliente}
                disabled={guardandoCliente}
              >
                {guardandoCliente
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.mGuardarTxt}>Crear cliente</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImportCSVModal
        visible={importModal}
        csvHeaders={csvHeaders}
        csvData={csvData}
        onClose={() => setImportModal(false)}
        onConfirm={handleImportConfirm}
        users={usuariosImport}
      />

      {/* Modal papelera */}
      <Modal visible={papeleraModal} animationType="slide" transparent onRequestClose={() => setPapeleraModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: c.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitulo, { color: c.text }]}>Papelera ({papeleraClientes.length})</Text>
              <TouchableOpacity onPress={() => setPapeleraModal(false)}>
                <Ionicons name="close" size={22} color="#9eafb2" />
              </TouchableOpacity>
            </View>
            {papeleraCargando ? (
              <ActivityIndicator size="large" color="#1a6470" style={{ marginVertical: 32 }} />
            ) : papeleraClientes.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Ionicons name="checkmark-circle-outline" size={48} color="#4cdb8a" />
                <Text style={{ color: '#9eafb2', marginTop: 10, fontSize: 14 }}>La papelera está vacía</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                {papeleraClientes.map(item => {
                  const diasEliminado = Math.floor((Date.now() - new Date(item.eliminado_at!).getTime()) / 86400000)
                  return (
                    <View key={item.id} style={[styles.papeleraCard, { borderColor: c.border, backgroundColor: c.bg }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.papeleraNombre, { color: c.text }]} numberOfLines={1}>{item.nombre}</Text>
                        <Text style={styles.papeleraSub}>{item.prospectador_nombre} · Eliminado hace {diasEliminado === 0 ? 'hoy' : `${diasEliminado}d`}</Text>
                      </View>
                      <TouchableOpacity style={styles.btnRestaurar} onPress={() => restaurarCliente(item.id)}>
                        <Ionicons name="arrow-undo-outline" size={13} color="#1a6470" />
                        <Text style={styles.btnRestaurarTxt}>Restaurar</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },


  // Stats
  statsBanner: {
    flexDirection: 'row', backgroundColor: '#1a6470',
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  statSep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Operacion tabs
  operacionRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  operacionTab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  operacionTabActivo: { borderBottomColor: '#c9a84c' },
  operacionTabText: { fontSize: 13, fontWeight: '600', color: '#b0bec5' },
  operacionTabTextActivo: { color: '#1a6470' },

  // Pipeline
  pipelineScroll: { flexGrow: 0, flexShrink: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f3' },
  pipelineContent: { paddingHorizontal: 10, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  pipelineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e8e8e8',
    backgroundColor: '#fafafa', minWidth: 75,
  },
  pipelineChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  pipelineDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  pipelineCount: { fontSize: 15, fontWeight: '800', color: '#444', lineHeight: 18 },
  pipelineCountAll: { color: '#fff' },
  pipelineLabel: { fontSize: 10, color: '#888', fontWeight: '600', lineHeight: 13 },
  pipelineLabelAll: { color: '#c9a84c' },

  // Search
  btnCampana: {
    marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
    flexShrink: 0,
  },
  btnCampanaTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e2e8ea', paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14 },
  btnExportar: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0',
    width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
  },
  btnNuevo: {
    backgroundColor: '#1a6470', borderRadius: 14,
    width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1a6470', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 16, color: '#9eafb2', fontWeight: '600' },

  // Sección prospectador
  seccion: { marginHorizontal: 12, marginTop: 14 },
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, padding: 14, marginBottom: 6,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  secHeaderPropia: { borderWidth: 1.5, borderColor: '#c9a84c' },
  secPropiaBadge: { backgroundColor: '#c9a84c', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  secPropiaBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  secAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center',
  },
  secAvatarText: { color: '#c9a84c', fontSize: 16, fontWeight: '800' },
  secNombre: { fontSize: 15, fontWeight: '700' },
  secSub: { fontSize: 11, color: '#aaa', marginTop: 1 },

  // Card
  card: {
    borderRadius: 14, marginBottom: 8,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#1a2e30', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1,
  },
  cardAccent: { width: 4, flexShrink: 0 },
  cardInner: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardNombre: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 11, color: '#9eafb2', marginTop: 1 },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, flexShrink: 0, alignSelf: 'flex-start',
  },
  estadoDot: { width: 4, height: 4, borderRadius: 2 },
  estadoText: { fontSize: 10, fontWeight: '700' },

  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 7 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#8a9fa2' },

  cardActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionWa: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f0fdf6', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#d1f7e2',
  },
  actionWaText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  actionCall: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f0f8fa', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#cde8ed',
  },
  actionCallText: { fontSize: 11, fontWeight: '600', color: '#1a6470' },
  actionDelete: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fef2f0', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#fbd9d2',
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitulo: { fontSize: 18, fontWeight: '800' },
  mLabel: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 14 },
  mInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  mRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mChip: { borderWidth: 1.5, borderColor: '#e0eaec', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  mChipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  mChipTxt: { fontSize: 13, fontWeight: '600', color: '#1a6470' },
  mHint: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
  mUsuariosList: { borderWidth: 1, borderColor: '#e0eaec', borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  mUsuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4f5' },
  mUsuarioRowActivo: { backgroundColor: '#f0fcf6' },
  mAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  mAvatarTxt: { fontSize: 14, fontWeight: '700' },
  mUsuarioNombre: { flex: 1, fontSize: 14 },
  mGuardarBtn: { backgroundColor: '#c9a84c', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  mGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Modal import
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40 },
  mTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  mFieldLabel: { fontSize: 11, fontWeight: '700', color: '#8a9ea0', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 6 },
  mUsuarioAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e0f4f5', alignItems: 'center', justifyContent: 'center' },
  mUsuarioAvatarTxt: { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  mUsuarioSeleccionado: { backgroundColor: '#f0fcf6' },
  mCancelarBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  mCancelarTxt: { fontSize: 14, color: '#94a3b8' },
  importErrorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, marginBottom: 16 },
  importErrorTxt: { flex: 1, fontSize: 13, color: '#b91c1c', lineHeight: 18 },
  importInfoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

  // Acciones rápidas (papelera + exportar)
  accionesRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  btnAccion: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 9,
  },
  btnAccionTxt: { fontSize: 12, fontWeight: '700' },

  // Papelera
  papeleraCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  papeleraNombre: { fontSize: 14, fontWeight: '700' },
  papeleraSub: { fontSize: 11, color: '#9eafb2', marginTop: 2 },
  btnRestaurar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e0f4f5', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  btnRestaurarTxt: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  importInfoTxt:  { fontSize: 15, fontWeight: '700' },
  importRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  importRowNombre: { fontSize: 14, fontWeight: '700' },
  importRowSub:    { fontSize: 12, color: '#64748b', marginTop: 2 },
  importMas:       { fontSize: 12, color: '#94a3b8', paddingTop: 8, textAlign: 'center' as const },
  importHint: { fontSize: 11, color: '#94a3b8', lineHeight: 16, marginVertical: 12, textAlign: 'center' as const },
})
