import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking,
  ActivityIndicator, TouchableOpacity, ScrollView, FlatList, Modal, useWindowDimensions,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { OfflineBanner } from '../../components/OfflineBanner'
import * as DocumentPicker from 'expo-document-picker'
import ImportCSVModal, { parsearCSV, type ImportedRow } from '../../components/ImportCSVModal'

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
  const phone = telefono.replace(/\D/g, '')
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
  const queryClient = useQueryClient()
  const [busqueda, setBusqueda]           = useState('')
  const [estadoFiltro, setEstadoFiltro]   = useState<string | null>(null)
  const [opFiltro, setOpFiltro]           = useState<'venta' | 'renta' | null>(null)
  const [sortBy, setSortBy]               = useState<SortBy>('reciente')
  const [showSort, setShowSort]           = useState(false)
  const [vistaExcel, setVistaExcel]       = useState(false)
  const [interesFilter, setInteresFilter] = useState<string | null>(null)
  const [excelSort, setExcelSort]         = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [excelFilterModal, setExcelFilterModal] = useState<{
    col: string; label: string
    options: { value: string | null; label: string; color?: string }[]
  } | null>(null)
  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'

  const { data: clientes = [], isLoading, refetch } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, empresa, fuente_lead, estado, tipo_operacion, proximo_contacto, created_at, nivel_interes, recordatorios(id, titulo, fecha_hora, completado)')
        .order('updated_at', { ascending: false })
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
        ['detalle-cliente', c.id],
        (old: unknown) => old ?? { cliente: c, interacciones: [], recordatorios: c.recordatorios ?? [] }
      )
    }
  }, [clientes])

  // ── KPIs ──────────────────────────────────────────────────────
  const total    = clientes.length
  const activos  = clientes.filter(c => c.estado !== 'descartado' && c.estado !== 'compro').length
  const citas    = clientes.filter(c => c.estado === 'cita_agendada').length
  const vencidos = clientes.filter(c =>
    (c.recordatorios ?? []).some(r => !r.completado && new Date(r.fecha_hora) < new Date())
  ).length
  const cerrados = clientes.filter(c => c.estado === 'compro').length

  const conteos = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = clientes.filter(c => c.estado === e).length
    return acc
  }, {})

  // ── Filtros ───────────────────────────────────────────────────
  let filtrados = clientes
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase()
    filtrados = filtrados.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.empresa ?? '').toLowerCase().includes(q)
    )
  }
  if (estadoFiltro) filtrados = filtrados.filter(c => c.estado === estadoFiltro)
  if (opFiltro)     filtrados = filtrados.filter(c => c.tipo_operacion === opFiltro)
  if (interesFilter) filtrados = filtrados.filter(c => c.nivel_interes === interesFilter)

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
      else if (excelSort.col === 'fecha') cmp = a.created_at.localeCompare(b.created_at)
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
    return false
  }

  function getColFilterValue(colId: string): string | null {
    if (colId === 'estado') return estadoFiltro
    if (colId === 'operacion') return opFiltro
    if (colId === 'interes') return interesFilter
    return null
  }

  function applyColFilter(col: string, value: string | null) {
    if (col === 'estado') setEstadoFiltro(value)
    else if (col === 'operacion') setOpFiltro(value as any)
    else if (col === 'interes') setInteresFilter(value)
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
    }
  }

  // ── Importar CSV ──────────────────────────────────────────────
  const [importModal, setImportModal]   = useState(false)
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([])
  const [csvData, setCsvData]           = useState<string[][]>([])

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
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', '*/*'] })
      if (result.canceled) return
      const { default: FileSystem } = await import('expo-file-system')
      procesar(await FileSystem.readAsStringAsync(result.assets[0].uri))
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
    { id: 'nombre',    label: 'Nombre',     flex: 3,   mw: 0, sortable: true },
    { id: 'telefono',  label: 'Teléfono',   flex: 1.8, mw: 0 },
    { id: 'estado',    label: 'Estado',     flex: 2.5, mw: 0, sortable: true, filterable: true },
    { id: 'operacion', label: 'Operación',  flex: 1.5, mw: 0, filterable: true },
    { id: 'interes',   label: 'Interés',    flex: 1.5, mw: 0, filterable: true },
    { id: 'fecha',     label: 'Ingresado',  flex: 1.5, mw: 0, sortable: true },
  ] : [
    { id: 'nombre',    label: 'Nombre',     flex: 0, mw: 155 },
    { id: 'telefono',  label: 'Teléfono',   flex: 0, mw: 115 },
    { id: 'estado',    label: 'Estado',     flex: 0, mw: 145, sortable: true, filterable: true },
    { id: 'operacion', label: 'Op.',        flex: 0, mw: 80,  filterable: true },
    { id: 'interes',   label: 'Interés',    flex: 0, mw: 90,  filterable: true },
    { id: 'fecha',     label: 'Fecha',      flex: 0, mw: 100, sortable: true },
  ]

  function cStyle(col: TCol) {
    return isWeb ? { flex: col.flex } : { minWidth: col.mw }
  }

  return (
    <>
      <OfflineBanner />
      <View style={s.container}>

        {/* ── KPI strip ── */}
        <View style={s.kpiStrip}>
          <TouchableOpacity style={s.kpiItem} onPress={() => { setEstadoFiltro(null); setOpFiltro(null) }}>
            <Text style={[s.kpiNum, { color: '#3b82f6' }]}>{activos}</Text>
            <Text style={s.kpiLbl}>ACTIVOS</Text>
          </TouchableOpacity>
          <View style={s.kpiDiv} />
          <TouchableOpacity style={s.kpiItem} onPress={() => setEstadoFiltro('cita_agendada')}>
            <Text style={[s.kpiNum, { color: '#f59e0b' }]}>{citas}</Text>
            <Text style={s.kpiLbl}>CITAS</Text>
          </TouchableOpacity>
          <View style={s.kpiDiv} />
          <View style={s.kpiItem}>
            <Text style={[s.kpiNum, vencidos > 0 ? { color: '#ef4444' } : { color: '#cbd5e1' }]}>{vencidos}</Text>
            <Text style={s.kpiLbl}>VENCIDOS</Text>
          </View>
          <View style={s.kpiDiv} />
          <TouchableOpacity style={s.kpiItem} onPress={() => setEstadoFiltro('compro')}>
            <Text style={[s.kpiNum, { color: '#10b981' }]}>{cerrados}</Text>
            <Text style={s.kpiLbl}>CERRADOS</Text>
          </TouchableOpacity>
        </View>

        {/* ── Funnel bar ── */}
        {total > 0 && (
          <View style={s.funnelWrap}>
            <View style={s.funnelBar}>
              {ORDEN_ESTADOS.map(e => {
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
              })}
            </View>
            <View style={s.funnelLegend}>
              {ORDEN_ESTADOS.filter(e => conteos[e] > 0).map(e => {
                const info = estadoInfo(e)
                return (
                  <View key={e} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: info.color }]} />
                    <Text style={s.legendTxt}>{info.label} ({conteos[e]})</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Stage chips ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={s.stagePipe} contentContainerStyle={s.stagePipeContent}
        >
          <TouchableOpacity
            style={[s.stageChip, estadoFiltro === null && s.stageChipAll]}
            onPress={() => setEstadoFiltro(null)}
          >
            <Text style={[s.stageChipTxt, estadoFiltro === null && { color: '#fff', fontWeight: '700' }]}>
              Todos · {total}
            </Text>
          </TouchableOpacity>
          {ORDEN_ESTADOS.map(e => {
            const info = estadoInfo(e)
            const activo = estadoFiltro === e
            return (
              <TouchableOpacity
                key={e}
                style={[s.stageChip, activo && { backgroundColor: info.color, borderColor: info.color }]}
                onPress={() => setEstadoFiltro(activo ? null : e)}
              >
                <View style={[s.stageDot, { backgroundColor: activo ? '#fff' : info.color }]} />
                <Text style={[s.stageChipTxt, activo && { color: '#fff', fontWeight: '700' }]}>
                  {info.label}
                </Text>
                <Text style={[s.stageCnt, activo && { color: 'rgba(255,255,255,0.75)' }]}>
                  {conteos[e]}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* ── Search + sort + nuevo ── */}
        <View style={s.searchRow}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={15} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar nombre, teléfono, empresa..."
              placeholderTextColor="#94a3b8"
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={s.sortBtn} onPress={() => setShowSort(true)}>
            <Ionicons name="funnel-outline" size={15} color="#1a6470" />
            {sortBy !== 'reciente' && <View style={s.sortDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.sortBtn} onPress={() => setVistaExcel(v => !v)}>
            <Ionicons name={vistaExcel ? 'grid-outline' : 'list-outline'} size={15} color="#1a6470" />
          </TouchableOpacity>
          <TouchableOpacity style={s.sortBtn} onPress={abrirImport}>
            <Ionicons name="cloud-upload-outline" size={15} color="#1a6470" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(prospectador)/cliente-form')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Operacion tabs ── */}
        <View style={s.opRow}>
          {([null, 'venta', 'renta'] as const).map(op => {
            const label = op === null ? 'Todos' : op === 'venta' ? '🏠 Venta' : '🔑 Renta'
            const cnt   = op === null ? total : clientes.filter(c => c.tipo_operacion === op).length
            const activo = opFiltro === op
            return (
              <TouchableOpacity key={String(op)} style={[s.opTab, activo && s.opTabActivo]} onPress={() => setOpFiltro(op)}>
                <Text style={[s.opTabTxt, activo && s.opTabTxtActivo]}>{label}</Text>
                <View style={[s.opTabBadge, activo && s.opTabBadgeActivo]}>
                  <Text style={[s.opTabBadgeTxt, activo && { color: '#1a6470' }]}>{cnt}</Text>
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

          const tableRows = filtradosExcel.map((item, idx) => {
            const info = estadoInfo(item.estado)
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.excelTr, idx % 2 !== 0 && s.excelTrAlt]}
                onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                activeOpacity={0.75}
              >
                {TABLE_COLS.map(col => {
                  const cs = cStyle(col)
                  switch (col.id) {
                    case 'nombre':
                      return <Text key={col.id} style={[s.excelTd, s.excelTdBold, cs]} numberOfLines={1}>{item.nombre}</Text>
                    case 'telefono':
                      return <Text key={col.id} style={[s.excelTd, cs]} numberOfLines={1}>{item.telefono}</Text>
                    case 'estado':
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs]}>
                          <View style={[s.excelEstadoPill, { backgroundColor: info.bg }]}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: info.color }} />
                            <Text style={{ fontSize: 11, color: info.color, fontWeight: '700' }} numberOfLines={1}>{info.label}</Text>
                          </View>
                        </View>
                      )
                    case 'operacion':
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs]}>
                          {item.tipo_operacion
                            ? <View style={[s.excelOpTag, item.tipo_operacion === 'venta' ? s.excelOpVenta : s.excelOpRenta]}>
                                <Text style={[s.excelOpTxt, { color: item.tipo_operacion === 'venta' ? '#1a6470' : '#7c3aed' }]}>
                                  {item.tipo_operacion === 'venta' ? '🏠 Venta' : '🔑 Renta'}
                                </Text>
                              </View>
                            : <Text style={s.excelNull}>—</Text>
                          }
                        </View>
                      )
                    case 'interes':
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs]}>
                          {item.nivel_interes
                            ? <Text style={s.excelTd} numberOfLines={1}>{NIVEL_INTERES_LABEL[item.nivel_interes]}</Text>
                            : <Text style={s.excelNull}>—</Text>
                          }
                        </View>
                      )
                    case 'fecha':
                      return (
                        <Text key={col.id} style={[s.excelTd, s.excelTdDate, cs]} numberOfLines={1}>
                          {new Date(item.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </Text>
                      )
                    default: return null
                  }
                })}
              </TouchableOpacity>
            )
          })

          const table = (
            <View style={[s.excelTable, isWeb && { minWidth: screenWidth - 32 }]}>
              {tableHeader}
              {tableRows}
              <View style={{ height: 100 }} />
            </View>
          )

          if (isWeb) {
            return (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                <View style={s.excelTableWrap}>{table}</View>
              </ScrollView>
            )
          }
          return (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {table}
              </ScrollView>
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
                  style={s.card}
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
                        <Text style={s.cardNombre} numberOfLines={1}>{item.nombre}</Text>
                        <View style={s.cardSubRow}>
                          {item.nivel_interes
                            ? <View style={[s.fuenteTag, { backgroundColor: item.nivel_interes === 'alto' ? '#fee2e2' : item.nivel_interes === 'medio' ? '#fef3c7' : '#dbeafe' }]}>
                                <Text style={[s.fuenteTagTxt, { color: item.nivel_interes === 'alto' ? '#b91c1c' : item.nivel_interes === 'medio' ? '#92400e' : '#1e40af' }]}>
                                  {NIVEL_INTERES_LABEL[item.nivel_interes]}
                                </Text>
                              </View>
                            : null
                          }
                          {item.fuente_lead
                            ? <View style={s.fuenteTag}>
                                <Text style={s.fuenteTagTxt}>{item.fuente_lead}</Text>
                              </View>
                            : null
                          }
                        </View>
                      </View>
                      <View style={[s.estadoBadge, { backgroundColor: info.bg }]}>
                        <View style={[s.estadoDot, { backgroundColor: info.color }]} />
                        <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
                      </View>
                    </View>

                    {/* ── Meta ── */}
                    <View style={s.metaRow}>
                      <View style={s.metaItem}>
                        <Ionicons name="call-outline" size={11} color="#94a3b8" />
                        <Text style={s.metaTxt}>{item.telefono}</Text>
                      </View>
                      {item.tipo_operacion && (
                        <View style={s.metaItem}>
                          <Ionicons name="home-outline" size={11} color="#94a3b8" />
                          <Text style={[s.metaTxt, { textTransform: 'capitalize' }]}>{item.tipo_operacion}</Text>
                        </View>
                      )}
                      <View style={s.metaTime}>
                        <Ionicons name="time-outline" size={11} color="#94a3b8" />
                        <Text style={s.metaTxt}>{tiempoRelativo(item.created_at)}</Text>
                      </View>
                    </View>

                    {/* ── Recordatorio ── */}
                    {rec && (
                      <View style={[s.recRow, recVenc ? s.recVenc : recHoy ? s.recHoy : s.recProx]}>
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
                      <TouchableOpacity style={s.actionWa} onPress={() => abrirWhatsApp(item.telefono, item.nombre)}>
                        <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                        <Text style={s.actionWaTxt}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.actionCall} onPress={() => llamar(item.telefono)}>
                        <Ionicons name="call-outline" size={14} color="#0369a1" />
                        <Text style={s.actionCallTxt}>Llamar</Text>
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
          <View style={s.sortSheet}>
            <View style={s.sortHandle} />
            <Text style={s.sortTitle}>Ordenar leads</Text>
            {(['reciente', 'nombre', 'contacto'] as SortBy[]).map(opt => (
              <TouchableOpacity
                key={opt}
                style={s.sortOpt}
                onPress={() => { setSortBy(opt); setShowSort(false) }}
              >
                <View style={s.sortOptLeft}>
                  <Ionicons
                    name={opt === 'reciente' ? 'time-outline' : opt === 'nombre' ? 'text-outline' : 'calendar-outline'}
                    size={16}
                    color={sortBy === opt ? '#1a6470' : '#94a3b8'}
                  />
                  <Text style={[s.sortOptTxt, sortBy === opt && { color: '#1a6470', fontWeight: '700' }]}>
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
          <View style={s.sortSheet}>
            <View style={s.sortHandle} />
            <Text style={s.sortTitle}>{excelFilterModal?.label ?? ''}</Text>
            {excelFilterModal?.options.map(opt => {
              const active = getColFilterValue(excelFilterModal!.col) === opt.value
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={s.sortOpt}
                  onPress={() => applyColFilter(excelFilterModal!.col, opt.value)}
                >
                  <View style={s.sortOptLeft}>
                    {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                    <Text style={[s.sortOptTxt, active && { color: '#1a6470', fontWeight: '700' }]}>{opt.label}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                </TouchableOpacity>
              )
            })}
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
  kpiItem: { flex: 1, alignItems: 'center', gap: 2 },
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
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendTxt:  { fontSize: 10, color: '#64748b', fontWeight: '500' },

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
})
