import { useState, useCallback, useEffect, createElement } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking, Alert,
  ActivityIndicator, TouchableOpacity, ScrollView, FlatList, Modal, useWindowDimensions,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { normalizar } from '../../lib/texto'
import { registrarAccion } from '../../lib/gamification'

const VISTA_CRM_KEY = '@valera_crm_vista'
import { useColors, useTheme } from '../../lib/ThemeContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { OfflineBanner } from '../../components/OfflineBanner'
import ImportCSVModal, { parsearCSV, type ImportedRow } from '../../components/ImportCSVModal'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { enqueueClienteUpdate } from '../../lib/offline-queue'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  tipo_operacion: string | null
  proximo_contacto: string | null
  created_at: string
  nivel_interes: 'alto' | 'medio' | 'bajo' | null
  notas: string | null
  zona_busqueda: string | null
  presupuesto: string | null
  recordatorios: { id: string; titulo: string; fecha_hora: string; completado: boolean }[]
}

const NIVEL_INTERES_LABEL: Record<string, string> = {
  alto: '🔥 Alto', medio: '🌡️ Medio', bajo: '❄️ Bajo',
}

export const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  primer_contacto:    { label: 'Primer contacto',  color: '#0277bd', bg: '#e1f5fe' },
  por_perfilar:       { label: 'Por perfilar',     color: '#1565c0', bg: '#e3f2fd' },
  no_contesta:        { label: 'No contesta',       color: '#757575', bg: '#f5f5f5' },
  cita_por_agendar:   { label: 'Cita por agendar', color: '#e65100', bg: '#fff3e0' },
  cita_a_futuro:      { label: 'Cita a futuro',    color: '#6d4c41', bg: '#efebe9' },
  cita_agendada:      { label: 'Cita agendada',     color: '#1a6470', bg: '#e0f4f5' },
  seguimiento_cierre: { label: 'Seg. de cierre',    color: '#6a1b9a', bg: '#f3e5f5' },
  compro:             { label: 'Apartó / Compró',   color: '#2e7d32', bg: '#e8f5e9' },
  descartado:         { label: 'Descartado',         color: '#b91c1c', bg: '#fef2f2' },
}

export const ORDEN_ESTADOS = [
  'primer_contacto', 'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_a_futuro', 'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

// Etapas de venta seleccionables al crear/editar un cliente. Es la lista
// canónica usada en el formulario y en la pantalla de detalle: incluye TODAS
// las etapas (primer contacto, cita a futuro, etc.) para que coincidan.
export const ETAPAS_CLIENTE = ORDEN_ESTADOS

function estadoInfo(e: string) {
  return ESTADOS[e] ?? { label: e, color: '#64748b', bg: '#f1f5f9' }
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Ayer'
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function proximoRec(recs: Cliente['recordatorios']) {
  return recs
    .filter(r => !r.completado)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())[0] ?? null
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export function abrirWhatsApp(telefono: string, nombre: string) {
  let phone = telefono.replace(/\D/g, '')
  // Normalizar número mexicano para WhatsApp (formato nuevo: 52 + 10 dígitos = 12 total)
  if (phone.startsWith('5252')) phone = phone.slice(2)           // doble código de país
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3) // formato viejo con 1
  const num = phone.length === 10 ? `52${phone}` : phone
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else Linking.openURL(url)
}

function llamar(tel: string) { Linking.openURL(`tel:${tel}`) }

type SortBy = 'reciente' | 'nombre' | 'contacto'
const SORT_LABELS: Record<SortBy, string> = {
  reciente: 'Más reciente',
  nombre:   'Nombre A–Z',
  contacto: 'Próximo contacto',
}

export default function CRM() {
  // ?mios=1 → "Mi CRM": solo los clientes de los que el usuario es responsable.
  // (Para supervisores, que por RLS ven los de todo el equipo.)
  const { mios } = useLocalSearchParams<{ mios?: string }>()
  const soloMios = mios === '1'
  const c = useColors()
  const { darkMode } = useTheme()
  const queryClient = useQueryClient()
  const { isOnline, refreshPending } = useOfflineSync()
  const [userRole, setUserRole]           = useState<string | null>(null)
  const [busqueda, setBusqueda]           = useState('')
  const [estadoFiltro, setEstadoFiltro]   = useState<string | null>(null)
  const [filtroVencidos, setFiltroVencidos] = useState(false)
  const [opFiltro, setOpFiltro]           = useState<'venta' | 'renta' | null>(null)
  const [sortBy, setSortBy]               = useState<SortBy>('reciente')
  const [showSort, setShowSort]           = useState(false)
  const [vistaExcel, setVistaExcel]       = useState(false)

  // Recordar la vista elegida (tabla/lista) hasta que el usuario la cambie
  useEffect(() => {
    AsyncStorage.getItem(VISTA_CRM_KEY).then(v => { if (v === 'tabla') setVistaExcel(true) }).catch(() => {})
    supabase.auth.getSession().then(({ data: s }) => {
      const uid = s.session?.user?.id
      if (uid) {
        supabase.from('profiles').select('role').eq('id', uid).maybeSingle().then(({ data: p }) => {
          if (p?.role) setUserRole(p.role)
        })
      }
    })
  }, [])
  function toggleVista() {
    setVistaExcel(prev => {
      const next = !prev
      AsyncStorage.setItem(VISTA_CRM_KEY, next ? 'tabla' : 'lista').catch(() => {})
      return next
    })
  }
  const [interesFilter, setInteresFilter] = useState<string | null>(null)
  const [zonaFilter, setZonaFilter]       = useState<string | null>(null)
  const [excelSort, setExcelSort]         = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [excelFilterModal, setExcelFilterModal] = useState<{
    col: string; label: string
    options: { value: string | null; label: string; color?: string }[]
  } | null>(null)
  // Edición inline en la tabla Excel
  const [editCell, setEditCell] = useState<{ id: string; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  const [cellPicker, setCellPicker] = useState<{
    id: string; col: string; label: string
    options: { value: string | null; label: string; color?: string }[]
  } | null>(null)
  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'

  const { data: clientes = [], isLoading, refetch } = useQuery<Cliente[]>({
    // Sufijo 'v2': invalida cualquier caché persistido en disco de antes del
    // 23/jun/2026, cuando supervisor/asesor todavía veían los clientes de
    // todo el equipo. Sin esto, un asesor podría ver por un instante (o más,
    // si está offline) datos cacheados de antes de restringir la RLS.
    queryKey: ['clientes', soloMios ? 'mios' : 'all', 'v2'],
    queryFn: async () => {
      let q = supabase
        .from('clientes')
        .select('id, nombre, telefono, email, empresa, fuente_lead, estado, tipo_operacion, proximo_contacto, created_at, nivel_interes, notas, zona_busqueda, presupuesto, recordatorios(id, titulo, fecha_hora, completado)')
        .is('eliminado_at', null)
        .order('updated_at', { ascending: false })
      if (soloMios) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) q = q.eq('responsable_id', user.id)
      }
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  useFocusEffect(useCallback(() => { refetch() }, [refetch]))

  useEffect(() => {
    if (!clientes.length) return
    for (const c of clientes) {
      queryClient.setQueryData(
        ['detalle-cliente', c.id, 'v2'],
        (old: unknown) => old ?? { cliente: c, interacciones: [], recordatorios: c.recordatorios ?? [] }
      )
    }
  }, [clientes])

  // ── KPIs ──────────────────────────────────────────────────────
  // Base filtrada por operación para que KPIs y chips sean consistentes con la lista
  const clientesBase = opFiltro ? clientes.filter(c => c.tipo_operacion === opFiltro) : clientes

  const total    = clientesBase.length
  const activos  = clientesBase.filter(c => c.estado !== 'descartado' && c.estado !== 'compro').length
  const citas    = clientesBase.filter(c => c.estado === 'cita_agendada').length
  const vencidos = clientesBase.filter(c =>
    (c.recordatorios ?? []).some(r => !r.completado && new Date(r.fecha_hora) < new Date())
  ).length
  const cerrados = clientesBase.filter(c => c.estado === 'compro').length

  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = clientesBase.filter(c => c.estado === e).length
    return acc
  }, {})

  // ── Filtros ───────────────────────────────────────────────────
  let filtrados = clientes
  if (busqueda.trim()) {
    const q = normalizar(busqueda)
    filtrados = filtrados.filter(c =>
      normalizar(c.nombre).includes(q) || c.telefono.includes(q) ||
      normalizar(c.email).includes(q) ||
      normalizar(c.empresa).includes(q)
    )
  }
  if (estadoFiltro) filtrados = filtrados.filter(c => c.estado === estadoFiltro)
  if (filtroVencidos) filtrados = filtrados.filter(c => (c.recordatorios ?? []).some(r => !r.completado && new Date(r.fecha_hora) < new Date()))
  if (opFiltro)     filtrados = filtrados.filter(c => c.tipo_operacion === opFiltro)
  if (interesFilter) filtrados = filtrados.filter(c => c.nivel_interes === interesFilter)
  if (zonaFilter)   filtrados = filtrados.filter(c => c.zona_busqueda === zonaFilter)

  if (sortBy === 'nombre') {
    filtrados = [...filtrados].sort((a, b) => a.nombre.localeCompare(b.nombre))
  } else if (sortBy === 'contacto') {
    filtrados = [...filtrados].sort((a, b) => {
      const aT = a.proximo_contacto ? new Date(a.proximo_contacto).getTime() : Infinity
      const bT = b.proximo_contacto ? new Date(b.proximo_contacto).getTime() : Infinity
      return aT - bT
    })
  }

  // ── Excel table helpers ───────────────────────────────────────
  let filtradosExcel = filtrados
  if (excelSort) {
    filtradosExcel = [...filtrados].sort((a, b) => {
      let cmp = 0
      if (excelSort.col === 'nombre') cmp = a.nombre.localeCompare(b.nombre)
      else if (excelSort.col === 'estado') cmp = a.estado.localeCompare(b.estado)
      else if (excelSort.col === 'fecha') {
        // Próxima fecha de seguimiento; los sin fecha van al final
        const aT = a.proximo_contacto ? new Date(a.proximo_contacto).getTime() : Infinity
        const bT = b.proximo_contacto ? new Date(b.proximo_contacto).getTime() : Infinity
        cmp = aT === bT ? 0 : aT < bT ? -1 : 1
      }
      return excelSort.dir === 'asc' ? cmp : -cmp
    })
  }

  function handleColSort(colId: string) {
    setExcelSort(prev => {
      if (prev?.col === colId) {
        if (prev.dir === 'asc') return { col: colId, dir: 'desc' as const }
        return null
      }
      return { col: colId, dir: 'asc' as const }
    })
  }

  function isColFiltered(colId: string): boolean {
    if (colId === 'estado') return estadoFiltro !== null
    if (colId === 'operacion') return opFiltro !== null
    if (colId === 'interes') return interesFilter !== null
    if (colId === 'zona') return zonaFilter !== null
    return false
  }

  function getColFilterValue(colId: string): string | null {
    if (colId === 'estado') return estadoFiltro
    if (colId === 'operacion') return opFiltro
    if (colId === 'interes') return interesFilter
    if (colId === 'zona') return zonaFilter
    return null
  }

  function applyColFilter(col: string, value: string | null) {
    if (col === 'estado') setEstadoFiltro(value)
    else if (col === 'operacion') setOpFiltro(value as any)
    else if (col === 'interes') setInteresFilter(value)
    else if (col === 'zona') setZonaFilter(value)
    setExcelFilterModal(null)
  }

  function handleOpenColFilter(colId: string) {
    if (colId === 'estado') {
      setExcelFilterModal({
        col: 'estado', label: 'Filtrar por Estado',
        options: [
          { value: null, label: 'Todos los estados' },
          ...ORDEN_ESTADOS.map(e => ({ value: e, label: estadoInfo(e).label, color: estadoInfo(e).color })),
        ],
      })
    } else if (colId === 'operacion') {
      setExcelFilterModal({
        col: 'operacion', label: 'Filtrar por Operación',
        options: [
          { value: null, label: 'Todos' },
          { value: 'venta', label: '🏠 Venta' },
          { value: 'renta', label: '🔑 Renta' },
        ],
      })
    } else if (colId === 'interes') {
      setExcelFilterModal({
        col: 'interes', label: 'Filtrar por Interés',
        options: [
          { value: null, label: 'Todos' },
          { value: 'alto', label: '🔥 Alto' },
          { value: 'medio', label: '🌡️ Medio' },
          { value: 'bajo', label: '❄️ Bajo' },
        ],
      })
    } else if (colId === 'zona') {
      const zonasUnicas = [...new Set(
        clientes.map(cl => cl.zona_busqueda).filter(Boolean)
      )].sort() as string[]
      setExcelFilterModal({
        col: 'zona', label: 'Filtrar por Zona',
        options: [
          { value: null, label: 'Todas las zonas' },
          ...zonasUnicas.map(z => ({ value: z, label: z })),
        ],
      })
    }
  }

  // ── Edición inline en la tabla Excel ──────────────────────────
  // Mapea el id de columna al campo real de la tabla `clientes`
  const COL_FIELD: Record<string, string> = {
    nombre: 'nombre', telefono: 'telefono', estado: 'estado',
    operacion: 'tipo_operacion', interes: 'nivel_interes', fecha: 'proximo_contacto',
    notas: 'notas', zona: 'zona_busqueda', presupuesto: 'presupuesto',
  }

  async function guardarCelda(id: string, col: string, value: string | null) {
    const campo = COL_FIELD[col]
    if (!campo) return
    const estadoPrevio = clientes.find(cl => cl.id === id)?.estado
    setSavingCell(true)
    // Actualización optimista inmediata en cache
    queryClient.setQueryData<Cliente[]>(['clientes', soloMios ? 'mios' : 'all', 'v2'], (old) =>
      (old ?? []).map(cl => cl.id === id ? { ...cl, [campo]: value } as Cliente : cl)
    )

    if (!isOnline) {
      // Sin conexión: encolar y salir; el banner mostrará el pendiente
      await enqueueClienteUpdate(id, { [campo]: value })
      await refreshPending()
      setSavingCell(false)
      setEditCell(null)
      return
    }

    const { error } = await supabase.from('clientes').update({ [campo]: value }).eq('id', id)
    if (error) {
      const m = `No se pudo guardar: ${error.message}`
      Platform.OS === 'web' ? window.alert(m) : Alert.alert('Error', m)
      await refetch() // revierte al estado real si falla
    } else {
      // Valera Coins al cambiar de etapa a cita agendada / venta cerrada
      if (campo === 'estado' && value !== estadoPrevio) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          if (value === 'cita_agendada') registrarAccion(user.id, 'agendar_cita').catch(() => {})
          else if (value === 'compro')   registrarAccion(user.id, 'cerrar_venta').catch(() => {})
        }
        if (value === 'compro' && userRole !== 'admin') {
          const msg = '✅ Solicitud de apartado enviada. El equipo lo revisará y confirmará pronto.'
          Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Solicitud enviada', msg)
        }
      }
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    }
    setSavingCell(false)
    setEditCell(null)
  }

  function abrirEdicion(item: Cliente, col: string) {
    // Columnas de enumeración → selector; texto/fecha → input inline
    if (col === 'estado') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar estado',
        options: ORDEN_ESTADOS.map(e => ({ value: e, label: estadoInfo(e).label, color: estadoInfo(e).color })),
      })
    } else if (col === 'operacion') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar operación',
        options: [
          { value: null, label: '— Sin operación' },
          { value: 'venta', label: '🏠 Venta' },
          { value: 'renta', label: '🔑 Renta' },
        ],
      })
    } else if (col === 'interes') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar nivel de interés',
        options: [
          { value: null, label: '— Sin definir' },
          { value: 'alto', label: '🔥 Alto' },
          { value: 'medio', label: '🌡️ Medio' },
          { value: 'bajo', label: '❄️ Bajo' },
        ],
      })
    } else {
      // nombre, telefono, fecha, notas, zona, presupuesto → edición de texto inline
      const inicial = col === 'fecha'
        ? (item.proximo_contacto ? item.proximo_contacto.slice(0, 10) : '')
        : col === 'nombre' ? item.nombre
        : col === 'telefono' ? item.telefono
        : col === 'notas' ? (item.notas ?? '')
        : col === 'zona' ? (item.zona_busqueda ?? '')
        : col === 'presupuesto' ? (item.presupuesto ?? '') : ''
      setEditValue(inicial)
      setEditCell({ id: item.id, col })
    }
  }

  function guardarTexto() {
    if (!editCell) return
    if (editCell.col === 'fecha') {
      const trimmed = editValue.trim()
      if (!trimmed) {
        // Campo vacío → no borrar la fecha; solo cerrar el editor
        setEditCell(null)
        return
      }
      guardarCelda(editCell.id, editCell.col, `${trimmed}T12:00:00`)
    } else {
      guardarCelda(editCell.id, editCell.col, editValue.trim() || null)
    }
  }

  // ── Importar CSV ──────────────────────────────────────────────
  const [importModal, setImportModal]   = useState(false)
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([])
  const [csvData, setCsvData]           = useState<string[][]>([])
  const [exportando, setExportando]     = useState(false)

  async function exportarCSV() {
    if (exportando || !clientes.length) return
    setExportando(true)
    try {
      const cab = ['Nombre', 'Teléfono', 'Email', 'Empresa', 'Estado', 'Tipo Operación', 'Nivel Interés', 'Zona Búsqueda', 'Presupuesto', 'Próximo Contacto', 'Notas', 'Creado']
      const filas = clientes.map(cl => [
        cl.nombre, cl.telefono, cl.email ?? '', cl.empresa ?? '',
        ESTADOS[cl.estado]?.label ?? cl.estado, cl.tipo_operacion ?? '',
        cl.nivel_interes ?? '', cl.zona_busqueda ?? '', cl.presupuesto ?? '',
        cl.proximo_contacto ? new Date(cl.proximo_contacto).toLocaleDateString('es-MX') : '',
        (cl.notas ?? '').replace(/[\r\n]+/g, ' '),
        new Date(cl.created_at).toLocaleDateString('es-MX'),
      ])
      const csv = '﻿' + [cab, ...filas].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `mis-clientes-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        Alert.alert('Exportar CSV', 'La descarga de CSV solo está disponible en la versión web.')
      }
    } catch (e: any) {
      Alert.alert('Error', 'Error al exportar: ' + e.message)
    } finally {
      setExportando(false)
    }
  }

  async function abrirImport() {
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

  async function handleImportConfirm(rows: ImportedRow[]) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sesión expirada')
    const { error } = await supabase.from('clientes').insert(rows.map(r => ({
      nombre: r.nombre, telefono: r.telefono,
      email: r.email, empresa: r.empresa,
      tipo_operacion: r.tipo_operacion, estado: r.estado ?? 'por_perfilar',
      zona_busqueda: r.zona_busqueda, presupuesto: r.presupuesto,
      fuente_lead: r.fuente_lead ?? 'sheets', notas: r.notas,
      responsable_id: user.id,
    })))
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: ['clientes'] })
  }

  // ── Excel table columns ───────────────────────────────────────
  type TCol = { id: string; label: string; flex: number; mw: number; sortable?: boolean; filterable?: boolean }
  const TABLE_COLS: TCol[] = isWeb ? [
    { id: 'nombre',      label: 'Nombre',         flex: 2.2, mw: 0, sortable: true },
    { id: 'telefono',    label: 'Teléfono',       flex: 1.2, mw: 0 },
    { id: 'estado',      label: 'Estado',         flex: 1.3, mw: 0, sortable: true, filterable: true },
    { id: 'operacion',   label: 'Op.',            flex: 0.8, mw: 0, filterable: true },
    { id: 'interes',     label: 'Interés',        flex: 0.8, mw: 0, filterable: true },
    { id: 'zona',        label: 'Zona',           flex: 1.4, mw: 0, filterable: true },
    { id: 'presupuesto', label: 'Presupuesto',    flex: 1.2, mw: 0 },
    { id: 'fecha',       label: 'Prox. seguim.',  flex: 1.5, mw: 0, sortable: true },
    { id: 'notas',       label: 'Notas',          flex: 2.5, mw: 0 },
  ] : [
    { id: 'nombre',      label: 'Nombre',         flex: 0, mw: 130 },
    { id: 'telefono',    label: 'Teléfono',       flex: 0, mw: 100 },
    { id: 'estado',      label: 'Estado',         flex: 0, mw: 105, sortable: true, filterable: true },
    { id: 'operacion',   label: 'Op.',            flex: 0, mw: 60,  filterable: true },
    { id: 'interes',     label: 'Interés',        flex: 0, mw: 70,  filterable: true },
    { id: 'zona',        label: 'Zona',           flex: 0, mw: 110, filterable: true },
    { id: 'presupuesto', label: 'Presupuesto',    flex: 0, mw: 105 },
    { id: 'fecha',       label: 'Prox. seguim.',  flex: 0, mw: 105, sortable: true },
    { id: 'notas',       label: 'Notas',          flex: 0, mw: 180 },
  ]

  function cStyle(col: TCol) {
    return isWeb ? { flex: col.flex } : { minWidth: col.mw }
  }

  return (
    <>
      <OfflineBanner />
      <View style={[s.container, { backgroundColor: c.bg }]}>

        {/* ── KPI strip (todos clickeables) ── */}
        <View style={[s.kpiStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === null && !filtroVencidos && s.kpiActivo]}
            onPress={() => { setEstadoFiltro(null); setOpFiltro(null); setFiltroVencidos(false) }}
          >
            <Text style={[s.kpiNum, { color: '#3b82f6' }]}>{activos}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>ACTIVOS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === 'cita_agendada' && s.kpiActivo]}
            onPress={() => { setFiltroVencidos(false); setEstadoFiltro(estadoFiltro === 'cita_agendada' ? null : 'cita_agendada') }}
          >
            <Text style={[s.kpiNum, { color: '#f59e0b' }]}>{citas}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>CITAS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, filtroVencidos && s.kpiActivo]}
            onPress={() => { setEstadoFiltro(null); setFiltroVencidos(v => !v) }}
          >
            <Text style={[s.kpiNum, vencidos > 0 ? { color: '#ef4444' } : { color: c.border }]}>{vencidos}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>VENCIDOS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === 'compro' && s.kpiActivo]}
            onPress={() => { setFiltroVencidos(false); setEstadoFiltro(estadoFiltro === 'compro' ? null : 'compro') }}
          >
            <Text style={[s.kpiNum, { color: '#10b981' }]}>{cerrados}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>CERRADOS</Text>
          </TouchableOpacity>
        </View>

        {/* ── Funnel bar ── */}
        <View style={[s.funnelWrap, { backgroundColor: c.card }]}>
          <View style={[s.funnelBar, { backgroundColor: darkMode ? c.border : '#e2e8f0' }]}>
            {total === 0 ? (
              <View style={[s.funnelSeg, { flex: 1, backgroundColor: c.border }]} />
            ) : (
              ORDEN_ESTADOS.map(e => {
                const n = conteos[e]
                if (n === 0) return null
                const info = estadoInfo(e)
                return (
                  <TouchableOpacity
                    key={e}
                    style={[s.funnelSeg, { flex: n, backgroundColor: info.color }]}
                    onPress={() => setEstadoFiltro(estadoFiltro === e ? null : e)}
                    activeOpacity={0.75}
                  />
                )
              })
            )}
          </View>
          {total === 0 && !isLoading ? (
            <Text style={s.funnelEmpty}>Agrega tu primer lead para ver el embudo de ventas</Text>
          ) : (
            <View style={s.funnelLegend}>
              {ORDEN_ESTADOS.filter(e => conteos[e] > 0).map(e => {
                const info = estadoInfo(e)
                const activo = estadoFiltro === e
                return (
                  <TouchableOpacity
                    key={e}
                    style={[s.legendItem, activo && { backgroundColor: info.color + '22', borderRadius: 12, paddingHorizontal: 6 }]}
                    onPress={() => { setFiltroVencidos(false); setEstadoFiltro(activo ? null : e) }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.legendDot, { backgroundColor: info.color }]} />
                    <Text style={[s.legendTxt, { color: activo ? info.color : c.textSub }, activo && { fontWeight: '700' }]}>{info.label} ({conteos[e]})</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>


        {/* ── Botón chats de WhatsApp ── */}
        <TouchableOpacity style={s.btnCampana} onPress={() => router.push('/(prospectador)/chats')}>
          <Text style={s.btnCampanaTxt}>💬 Chats de WhatsApp</Text>
        </TouchableOpacity>

        {/* ── Search + sort + nuevo ── */}
        <View style={s.searchRow}>
          <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textMute} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.searchInput, { color: c.text }]}
              placeholder="Buscar nombre, teléfono, empresa..."
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => setShowSort(true)}>
            <Ionicons name="funnel-outline" size={15} color="#1a6470" />
            {sortBy !== 'reciente' && <View style={s.sortDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={toggleVista}>
            <Ionicons name={vistaExcel ? 'grid-outline' : 'list-outline'} size={15} color="#1a6470" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={abrirImport}>
            <Ionicons name="cloud-upload-outline" size={15} color="#1a6470" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={exportarCSV} disabled={exportando}>
            {exportando
              ? <ActivityIndicator size="small" color="#1a6470" />
              : <Ionicons name="download-outline" size={15} color="#1a6470" />
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(prospectador)/cliente-form')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Operacion tabs ── */}
        <View style={[s.opRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          {([null, 'venta', 'renta'] as const).map(op => {
            const label = op === null ? 'Todos' : op === 'venta' ? '🏠 Venta' : '🔑 Renta'
            const cnt   = op === null ? clientes.length : clientes.filter(c => c.tipo_operacion === op).length
            const activo = opFiltro === op
            return (
              <TouchableOpacity key={String(op)} style={[s.opTab, activo && s.opTabActivo]} onPress={() => setOpFiltro(op)}>
                <Text style={[s.opTabTxt, { color: c.textMute }, activo && s.opTabTxtActivo]}>{label}</Text>
                <View style={[s.opTabBadge, { backgroundColor: c.border }, activo && s.opTabBadgeActivo]}>
                  <Text style={[s.opTabBadgeTxt, { color: c.textMute }, activo && { color: '#1a6470' }]}>{cnt}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Sort label ── */}
        {sortBy !== 'reciente' && (
          <View style={s.sortActiveBar}>
            <Ionicons name="funnel" size={11} color="#1a6470" />
            <Text style={s.sortActiveTxt}>Ordenado por: {SORT_LABELS[sortBy]}</Text>
            <TouchableOpacity onPress={() => setSortBy('reciente')}>
              <Ionicons name="close-circle" size={14} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── List ── */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 48 }} />
        ) : filtrados.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="people-outline" size={32} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>{busqueda || estadoFiltro ? 'Sin resultados' : 'Sin leads aún'}</Text>
            {!busqueda && !estadoFiltro && (
              <Text style={s.emptySub}>Agrega tu primer lead con el botón "Nuevo lead"</Text>
            )}
          </View>
        ) : vistaExcel ? (() => {
          const tableHeader = (
            <View style={s.excelTrHead}>
              {TABLE_COLS.map(col => {
                const isSorted = excelSort?.col === col.id
                const filtered = isColFiltered(col.id)
                return (
                  <View key={col.id} style={[s.excelTh, cStyle(col)]}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 }}
                      onPress={col.sortable ? () => handleColSort(col.id) : undefined}
                      disabled={!col.sortable}
                    >
                      <Text style={s.excelThTxt} numberOfLines={1}>{col.label}</Text>
                      {col.sortable && (
                        <Ionicons
                          name={!isSorted ? 'swap-vertical-outline' : excelSort!.dir === 'asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
                          size={11} color={isSorted ? '#fbbf24' : 'rgba(255,255,255,0.45)'}
                        />
                      )}
                    </TouchableOpacity>
                    {col.filterable && (
                      <TouchableOpacity style={[s.excelThFilter, filtered && s.excelThFilterOn]} onPress={() => handleOpenColFilter(col.id)}>
                        <Ionicons name="funnel" size={10} color={filtered ? '#fbbf24' : 'rgba(255,255,255,0.4)'} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          )

          function renderExcelRow(item: Cliente, idx: number) {
            const info = estadoInfo(item.estado)
            return (
              <View
                key={item.id}
                style={[s.excelTr, { borderBottomColor: c.border }, idx % 2 !== 0 && { backgroundColor: darkMode ? '#0a1827' : '#f8fafc' }]}
              >
                {TABLE_COLS.map(col => {
                  const cs = cStyle(col)
                  const editando = editCell?.id === item.id && editCell?.col === col.id
                  // Editor de texto inline (nombre, teléfono, fecha, notas, zona, presupuesto)
                  if (editando && (col.id === 'nombre' || col.id === 'telefono' || col.id === 'fecha' || col.id === 'notas' || col.id === 'zona' || col.id === 'presupuesto')) {
                    if (col.id === 'fecha' && isWeb) {
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs]}>
                          {createElement('input', {
                            type: 'date',
                            autoFocus: true,
                            value: editValue,
                            onChange: (e: any) => setEditValue(e.target.value),
                            onBlur: guardarTexto,
                            onKeyDown: (e: any) => { if (e.key === 'Enter') guardarTexto(); if (e.key === 'Escape') setEditCell(null) },
                            style: { width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #1a9aaa', fontSize: 12, fontFamily: 'inherit', color: darkMode ? '#fff' : '#111', background: darkMode ? '#0a1827' : '#fff' },
                          })}
                        </View>
                      )
                    }
                    if (col.id === 'notas' && isWeb) {
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs, { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 6 }]}>
                          {createElement('textarea', {
                            autoFocus: true,
                            value: editValue,
                            onChange: (e: any) => setEditValue(e.target.value),
                            onBlur: guardarTexto,
                            onKeyDown: (e: any) => { if (e.key === 'Escape') { guardarTexto(); } },
                            placeholder: 'Escribe una nota...',
                            rows: 4,
                            style: {
                              width: '100%', minHeight: 80, resize: 'vertical',
                              padding: '6px 8px', borderRadius: 6,
                              border: '1.5px solid #1a9aaa', fontSize: 12,
                              fontFamily: 'inherit', lineHeight: '1.45',
                              color: darkMode ? '#fff' : '#111',
                              background: darkMode ? '#0a1827' : '#fff',
                              outline: 'none',
                            },
                          })}
                        </View>
                      )
                    }
                    return (
                      <View key={col.id} style={[s.excelTdCell, cs, col.id === 'notas' && { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 6 }]}>
                        <TextInput
                          autoFocus
                          value={editValue}
                          onChangeText={setEditValue}
                          onBlur={guardarTexto}
                          onSubmitEditing={col.id !== 'notas' ? guardarTexto : undefined}
                          placeholder={col.id === 'fecha' ? 'AAAA-MM-DD' : col.id === 'notas' ? 'Escribe una nota...' : ''}
                          placeholderTextColor={c.textMute}
                          keyboardType={col.id === 'telefono' ? 'phone-pad' : 'default'}
                          multiline={col.id === 'notas'}
                          numberOfLines={col.id === 'notas' ? 4 : 1}
                          style={[s.cellInput, { color: c.text, borderColor: '#1a9aaa', backgroundColor: c.bg }, col.id === 'notas' && { minHeight: 80, textAlignVertical: 'top' }]}
                        />
                      </View>
                    )
                  }

                  // Celdas (click → editar)
                  switch (col.id) {
                    case 'nombre':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'nombre')} activeOpacity={0.6}>
                          <Text style={[s.excelTd, s.excelTdBold, s.cellTxtNoPad, { color: c.text }]} numberOfLines={1}>{item.nombre}</Text>
                        </TouchableOpacity>
                      )
                    case 'telefono':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'telefono')} activeOpacity={0.6}>
                          <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub }]} numberOfLines={1}>{item.telefono}</Text>
                        </TouchableOpacity>
                      )
                    case 'estado':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'estado')} activeOpacity={0.6}>
                          <View style={[s.excelEstadoPill, { backgroundColor: darkMode ? info.color + '28' : info.bg }]}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: info.color }} />
                            <Text style={{ fontSize: 11, color: info.color, fontWeight: '700' }} numberOfLines={1}>{info.label}</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    case 'operacion':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'operacion')} activeOpacity={0.6}>
                          {item.tipo_operacion
                            ? <View style={[s.excelOpTag, item.tipo_operacion === 'venta'
                                ? { backgroundColor: darkMode ? 'rgba(26,100,112,0.22)' : '#e0f4f5' }
                                : { backgroundColor: darkMode ? 'rgba(124,58,237,0.22)' : '#f3e8ff' }]}>
                                <Text style={[s.excelOpTxt, { color: item.tipo_operacion === 'venta' ? '#1a9aaa' : '#a78bfa' }]}>
                                  {item.tipo_operacion === 'venta' ? '🏠 Venta' : '🔑 Renta'}
                                </Text>
                              </View>
                            : <Text style={[s.excelNull, { color: c.border }]}>—</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'interes':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'interes')} activeOpacity={0.6}>
                          {item.nivel_interes
                            ? <Text style={[s.excelTd, { color: c.textSub }]} numberOfLines={1}>{NIVEL_INTERES_LABEL[item.nivel_interes]}</Text>
                            : <Text style={[s.excelNull, { color: c.border }]}>—</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'fecha': {
                      const ts = item.proximo_contacto ? new Date(item.proximo_contacto) : null
                      const vencido = ts ? ts.getTime() < Date.now() : false
                      const hoy = ts ? ts.toDateString() === new Date().toDateString() : false
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'fecha')} activeOpacity={0.6}>
                          {ts
                            ? <Text style={[s.excelTd, s.excelTdDate, s.cellTxtNoPad, { color: vencido ? '#ef4444' : hoy ? '#d97706' : c.textSub }]} numberOfLines={1}>
                                {vencido ? '⚠ ' : hoy ? '📌 ' : ''}{ts.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: c.border }]}>+ agregar</Text>
                          }
                        </TouchableOpacity>
                      )
                    }
                    case 'zona':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'zona')} activeOpacity={0.6}>
                          {item.zona_busqueda
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub }]} numberOfLines={1}>{item.zona_busqueda}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: c.border }]}>+ zona</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'presupuesto':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'presupuesto')} activeOpacity={0.6}>
                          {item.presupuesto
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: '#2e7d32', fontWeight: '700' }]} numberOfLines={1}>{item.presupuesto}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: c.border }]}>+ presup.</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'notas':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs, { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 8 }]} onPress={() => abrirEdicion(item, 'notas')} activeOpacity={0.6}>
                          {item.notas
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub, fontSize: 12, lineHeight: 17 }]} numberOfLines={3}>{item.notas}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: c.border }]}>+ agregar</Text>
                          }
                        </TouchableOpacity>
                      )
                    default: return null
                  }
                })}
              </View>
            )
          }

          if (isWeb) {
            const table = (
              <View style={[s.excelTable, { minWidth: screenWidth - 32 }]}>
                {tableHeader}
                {filtradosExcel.map((item, idx) => renderExcelRow(item, idx))}
                <View style={{ height: 100 }} />
              </View>
            )
            return (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                <View style={[s.excelTableWrap, { backgroundColor: c.card }]}>{table}</View>
              </ScrollView>
            )
          }

          // Mobile: FlatList virtualizado (las filas no se montan todas a la vez,
          // evita que la app se trabe con cientos de clientes en vista Excel)
          const mobileTableWidth = TABLE_COLS.reduce((sum, col) => sum + col.mw, 0)
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <FlatList
                data={filtradosExcel}
                keyExtractor={item => item.id}
                style={{ width: mobileTableWidth }}
                ListHeaderComponent={() => tableHeader}
                stickyHeaderIndices={[0]}
                renderItem={({ item, index }) => renderExcelRow(item, index)}
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                windowSize={7}
                maxToRenderPerBatch={20}
                initialNumToRender={20}
              />
            </ScrollView>
          )
        })() : (
          <FlatList
            data={filtrados}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100, paddingTop: 10 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const info      = estadoInfo(item.estado)
              const rec       = proximoRec(item.recordatorios ?? [])
              const recVenc   = rec && new Date(rec.fecha_hora) < new Date()
              const recHoy    = rec && !recVenc && new Date(rec.fecha_hora).toDateString() === new Date().toDateString()
              const inits     = iniciales(item.nombre)

              return (
                <TouchableOpacity
                  style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                  activeOpacity={0.8}
                >
                  <View style={[s.cardBar, { backgroundColor: info.color }]} />
                  <View style={s.cardBody}>

                    {/* ── Fila superior ── */}
                    <View style={s.cardHead}>
                      <View style={[s.avatar, { backgroundColor: info.color + '22' }]}>
                        <Text style={[s.avatarTxt, { color: info.color }]}>{inits}</Text>
                      </View>
                      <View style={s.cardHeadInfo}>
                        <Text style={[s.cardNombre, { color: c.text }]} numberOfLines={1}>{item.nombre}</Text>
                        <View style={s.cardSubRow}>
                          {item.nivel_interes
                            ? <View style={[s.fuenteTag, {
                                backgroundColor: item.nivel_interes === 'alto'
                                  ? (darkMode ? '#2d0f0f' : '#fee2e2')
                                  : item.nivel_interes === 'medio'
                                  ? (darkMode ? '#271c07' : '#fef3c7')
                                  : (darkMode ? '#0d1e3d' : '#dbeafe'),
                              }]}>
                                <Text style={[s.fuenteTagTxt, {
                                  color: item.nivel_interes === 'alto'
                                    ? (darkMode ? '#f87171' : '#b91c1c')
                                    : item.nivel_interes === 'medio'
                                    ? (darkMode ? '#fbbf24' : '#92400e')
                                    : (darkMode ? '#93c5fd' : '#1e40af'),
                                }]}>
                                  {NIVEL_INTERES_LABEL[item.nivel_interes]}
                                </Text>
                              </View>
                            : null
                          }
                          {item.fuente_lead
                            ? <View style={[s.fuenteTag, { backgroundColor: darkMode ? c.bg : '#f1f5f9' }]}>
                                <Text style={[s.fuenteTagTxt, { color: c.textSub }]}>{item.fuente_lead}</Text>
                              </View>
                            : null
                          }
                        </View>
                      </View>
                      <View style={[s.estadoBadge, { backgroundColor: darkMode ? info.color + '40' : info.bg }]}>
                        <View style={[s.estadoDot, { backgroundColor: info.color }]} />
                        <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
                      </View>
                    </View>

                    {/* ── Meta ── */}
                    <View style={s.metaRow}>
                      <View style={s.metaItem}>
                        <Ionicons name="call-outline" size={11} color={c.textMute} />
                        <Text style={[s.metaTxt, { color: c.textSub }]}>{item.telefono}</Text>
                      </View>
                      {item.tipo_operacion && (
                        <View style={s.metaItem}>
                          <Ionicons name="home-outline" size={11} color={c.textMute} />
                          <Text style={[s.metaTxt, { color: c.textSub, textTransform: 'capitalize' }]}>{item.tipo_operacion}</Text>
                        </View>
                      )}
                      <View style={s.metaTime}>
                        <Ionicons name="time-outline" size={11} color={c.textMute} />
                        <Text style={[s.metaTxt, { color: c.textMute }]}>{tiempoRelativo(item.created_at)}</Text>
                      </View>
                    </View>

                    {/* ── Recordatorio ── */}
                    {rec && (
                      <View style={[s.recRow,
                        recVenc ? { backgroundColor: darkMode ? '#2a0e0e' : '#fef2f2' }
                        : recHoy ? { backgroundColor: darkMode ? '#27190a' : '#fffbeb' }
                        : { backgroundColor: darkMode ? '#091e20' : '#f0fdfa' },
                      ]}>
                        <Ionicons
                          name={recVenc ? 'warning-outline' : recHoy ? 'alarm-outline' : 'calendar-outline'}
                          size={12}
                          color={recVenc ? '#ef4444' : recHoy ? '#d97706' : '#1a6470'}
                        />
                        <Text
                          style={[s.recTxt, { color: recVenc ? '#ef4444' : recHoy ? '#92400e' : '#1a6470' }]}
                          numberOfLines={1}
                        >
                          {recVenc ? '⚠ Vencido · ' : recHoy ? 'Hoy · ' : ''}
                          {new Date(rec.fecha_hora).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })} — {rec.titulo}
                        </Text>
                      </View>
                    )}

                    {/* ── Acciones ── */}
                    <View style={s.actions}>
                      <TouchableOpacity
                        style={[s.actionWa, darkMode && { backgroundColor: '#0b2016', borderColor: '#1a6b38' }]}
                        onPress={() => abrirWhatsApp(item.telefono, item.nombre)}
                      >
                        <Ionicons name="logo-whatsapp" size={14} color={darkMode ? '#22c55e' : '#16a34a'} />
                        <Text style={[s.actionWaTxt, darkMode && { color: '#22c55e' }]}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionCall, darkMode && { backgroundColor: '#091929', borderColor: '#0e5282' }]}
                        onPress={() => llamar(item.telefono)}
                      >
                        <Ionicons name="call-outline" size={14} color={darkMode ? '#38bdf8' : '#0369a1'} />
                        <Text style={[s.actionCallTxt, darkMode && { color: '#38bdf8' }]}>Llamar</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                </TouchableOpacity>
              )
            }}
          />
        )}
      </View>

      {/* ── Sort bottom sheet ── */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowSort(false)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>Ordenar leads</Text>
            {(['reciente', 'nombre', 'contacto'] as SortBy[]).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.sortOpt, { borderBottomColor: c.border }]}
                onPress={() => { setSortBy(opt); setShowSort(false) }}
              >
                <View style={s.sortOptLeft}>
                  <Ionicons
                    name={opt === 'reciente' ? 'time-outline' : opt === 'nombre' ? 'text-outline' : 'calendar-outline'}
                    size={16}
                    color={sortBy === opt ? '#1a6470' : c.textMute}
                  />
                  <Text style={[s.sortOptTxt, { color: c.textSub }, sortBy === opt && { color: '#1a9aaa', fontWeight: '700' }]}>
                    {SORT_LABELS[opt]}
                  </Text>
                </View>
                {sortBy === opt && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Column filter modal ── */}
      <Modal visible={excelFilterModal !== null} transparent animationType="slide" onRequestClose={() => setExcelFilterModal(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setExcelFilterModal(null)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>{excelFilterModal?.label ?? ''}</Text>
            {excelFilterModal?.options.map(opt => {
              const active = getColFilterValue(excelFilterModal!.col) === opt.value
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[s.sortOpt, { borderBottomColor: c.border }]}
                  onPress={() => applyColFilter(excelFilterModal!.col, opt.value)}
                >
                  <View style={s.sortOptLeft}>
                    {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                    <Text style={[s.sortOptTxt, { color: c.textSub }, active && { color: '#1a9aaa', fontWeight: '700' }]}>{opt.label}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Selector inline para celdas de estado/operación/interés ── */}
      <Modal visible={cellPicker !== null} transparent animationType="slide" onRequestClose={() => setCellPicker(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setCellPicker(null)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>{cellPicker?.label ?? ''}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {cellPicker?.options.map(opt => {
                const cl = clientes.find(x => x.id === cellPicker.id)
                const actualVal = cl
                  ? (cellPicker.col === 'estado' ? cl.estado
                    : cellPicker.col === 'operacion' ? cl.tipo_operacion
                    : cl.nivel_interes)
                  : null
                const active = actualVal === opt.value
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[s.sortOpt, { borderBottomColor: c.border }]}
                    onPress={() => {
                      const p = cellPicker
                      setCellPicker(null)
                      if (p.col === 'estado' && opt.value === 'compro' && userRole !== 'admin') {
                        const msg = '¿El cliente ya apartó? Esta acción notificará al administrador para que verifique y apruebe el apartado.'
                        const confirmar = Platform.OS === 'web'
                          ? window.confirm(msg)
                          : undefined
                        if (Platform.OS === 'web') {
                          if (confirmar) guardarCelda(p.id, p.col, opt.value)
                        } else {
                          Alert.alert('Confirmar apartado', msg, [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Sí, enviar', onPress: () => guardarCelda(p.id, p.col, opt.value) },
                          ])
                        }
                      } else {
                        guardarCelda(p.id, p.col, opt.value)
                      }
                    }}
                    disabled={savingCell}
                  >
                    <View style={s.sortOptLeft}>
                      {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                      <Text style={[s.sortOptTxt, { color: c.textSub }, active && { color: '#1a9aaa', fontWeight: '700' }]}>{opt.label}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <ImportCSVModal
        visible={importModal}
        csvHeaders={csvHeaders}
        csvData={csvData}
        onClose={() => setImportModal(false)}
        onConfirm={handleImportConfirm}
      />
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  addBtn: {
    width: 42, height: 42, backgroundColor: '#1a6470',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },

  // ── KPI strip ───────────────────────────────────────────────────
  kpiStrip: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  kpiItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, borderRadius: 10 },
  kpiActivo: { backgroundColor: 'rgba(26,100,112,0.12)' },
  kpiNum:  { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  kpiLbl:  { fontSize: 9, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.6 },
  kpiDiv:  { width: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },

  // ── Funnel ──────────────────────────────────────────────────────
  funnelWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 10 },
  funnelBar: {
    height: 6, flexDirection: 'row', borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  funnelSeg: { height: '100%' },
  funnelLegend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8,
  },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 7, height: 7, borderRadius: 4 },
  legendTxt:    { fontSize: 10, color: '#64748b', fontWeight: '500' },
  funnelEmpty:  { fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' },

  // ── Stage chips ─────────────────────────────────────────────────
  stagePipe:        { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  stagePipeContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  stageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  stageChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  stageDot:     { width: 6, height: 6, borderRadius: 3 },
  stageChipTxt: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  stageCnt:     { fontSize: 11, color: '#94a3b8', fontWeight: '700' },

  // ── Botón chats ─────────────────────────────────────────────────
  btnCampana: {
    marginHorizontal: 12, marginTop: 8,
    backgroundColor: '#25D366', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
    flexShrink: 0,
  },
  btnCampanaTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Search ──────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b' },
  sortBtn: {
    width: 42, height: 42, backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  sortDot: {
    position: 'absolute', top: 8, right: 8,
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444',
  },

  // ── Operation tabs ──────────────────────────────────────────────
  opRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  opTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  opTabActivo:   { borderBottomColor: '#1a6470' },
  opTabTxt:      { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  opTabTxtActivo:{ color: '#1a6470' },
  opTabBadge:    { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  opTabBadgeActivo: { backgroundColor: '#e0f4f5' },
  opTabBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },

  // ── Sort active bar ─────────────────────────────────────────────
  sortActiveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#e0f4f5',
  },
  sortActiveTxt: { flex: 1, fontSize: 12, color: '#1a6470', fontWeight: '600' },

  // ── Empty ────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySub:   { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  // ── Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    marginBottom: 10, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 14 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarTxt:    { fontSize: 15, fontWeight: '800' },
  cardHeadInfo: { flex: 1, minWidth: 0 },
  cardNombre:   { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
  cardSubRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardEmpresa:  { fontSize: 12, color: '#64748b' },
  fuenteTag:    { backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  fuenteTagTxt: { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'capitalize' },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, flexShrink: 0, maxWidth: 130,
  },
  estadoDot: { width: 5, height: 5, borderRadius: 3 },
  estadoTxt: { fontSize: 11, fontWeight: '700' },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, alignItems: 'center' },
  metaTime: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' as any },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:  { fontSize: 12, color: '#64748b' },

  recRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  recVenc: { backgroundColor: '#fef2f2' },
  recHoy:  { backgroundColor: '#fffbeb' },
  recProx: { backgroundColor: '#f0fdfa' },
  recTxt:  { fontSize: 12, flex: 1, fontWeight: '500' },

  actions:      { flexDirection: 'row', gap: 8 },
  actionWa: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  actionWaTxt:  { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  actionCall: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f0f9ff', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bae6fd',
  },
  actionCallTxt: { fontSize: 13, fontWeight: '600', color: '#0369a1' },

  // ── Sort bottom sheet ────────────────────────────────────────────
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sortSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  sortHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 20,
  },
  sortTitle:   { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  sortOpt:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sortOptLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortOptTxt:  { fontSize: 15, color: '#334155', fontWeight: '500' },

  // ── Vista Tabla Monday.com ───────────────────────────────────────
  excelTableWrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  excelTable: { flex: 1 },
  excelTrHead: {
    flexDirection: 'row',
    backgroundColor: '#1a3547',
    minHeight: 44,
    alignItems: 'stretch',
  },
  excelTh: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  excelThTxt: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3, flex: 1 },
  excelThFilter: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 4,
  },
  excelThFilterOn: { backgroundColor: 'rgba(251,191,36,0.2)' },
  excelTr: {
    flexDirection: 'row',
    minHeight: 44,
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  excelTrAlt: { backgroundColor: '#f8fafc' },
  excelTd: {
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  excelTdBold: { fontWeight: '700', color: '#0f172a' },
  excelTdDate: { fontSize: 12, color: '#64748b' },
  excelTdCell: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  excelEstadoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  excelOpTag: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  excelOpVenta: { backgroundColor: '#e0f4f5' },
  excelOpRenta: { backgroundColor: '#f3e8ff' },
  excelOpTxt: { fontSize: 12, fontWeight: '600' },
  excelNull: { fontSize: 13, color: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 10 },
  cellTxtNoPad: { paddingHorizontal: 0, paddingVertical: 0 },
  cellInput: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 13,
  },
})
