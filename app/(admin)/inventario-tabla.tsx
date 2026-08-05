import { useCallback, useMemo, useState, createElement } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { normalizar } from '../../lib/texto'
import { zonaDetallada } from '../../lib/zonas-interes'
import { PDR_POR_ZONA } from '../../lib/pdr-referencia'

const BG = '#0d1b2a', CARD = '#12283b', BORDER = '#1e3448'
const TEXT = '#e8f0f4', SUB = '#8fb0cc', MUTE = '#5f7690', GOLD = '#c9a84c'
const CIUDAD: Record<string, string> = { queretaro: 'Querétaro', monterrey: 'Monterrey', puebla: 'Puebla' }

// Correcciones manuales de zona por desarrollo (override del auto-detectado).
const OVERRIDES: [RegExp, string][] = [
  [/aurora/, 'Zakia'],
  [/\borigen\b/, 'Puertas de San Miguel'],
  [/gran valle/, 'Puertas de San Miguel'],
  [/espiga|valles campanario|campanario/, 'El Campanario'],
  [/haciendas/, 'Ciudad del Sol'],
  [/himalaya/, 'Jardines de Santiago'],
  [/junipero/, 'El Refugio'],
  [/privalia/, 'San José el Alto'],
  [/torento/, 'Monterrey'],
  [/\bcumbres\b/, 'Monterrey'],
  [/torre coordenada|coordenada/, 'El Refugio'],
  [/bugambilia/, 'El Refugio'],
  [/jacarandas/, 'El Refugio'],
  [/carriedo/, 'El Refugio'],
  [/vitea/, 'El Refugio'],
  [/villas? la joya/, 'Jardines de Santiago'],
  [/peninsula|península/, 'Monterrey'],
  [/riscos condesa|condesa/, 'Zibatá'],
  [/zaru|zarú/, 'Zarú'],
]
function zonaOverride(desarrollo: string): string | null {
  const n = normalizar(desarrollo)
  for (const [re, z] of OVERRIDES) if (re.test(n)) return z
  return null
}

// Color estable por zona (cada zona su color).
const PALETA = ['#2563eb', '#059669', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#dc2626', '#4f46e5', '#16a34a', '#c026d3', '#ea580c', '#0d9488', '#9333ea', '#65a30d', '#e11d48']
function colorZona(z: string): string {
  let h = 0
  for (let i = 0; i < z.length; i++) h = (h * 31 + z.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

type Prop = {
  id: string; codigo: string | null; titulo: string; precio: number | null
  tipo: string | null; recamaras: number | null; banos: number | null; medios_banos: number | null
  nombre_constructora: string | null; zona: string | null; direccion: string | null
  entrega_aprox: string | null; caracteristicas_texto: string | null
}

type PdrRow = { id: string; zona: string; etiqueta: string; precio: number | null; caract: string | null; tipo: string | null; orden: number }

function fmtPrecio(p: number | null) { return p == null ? '—' : '$' + p.toLocaleString('es-MX') }
function caract(p: Prop) {
  if (p.caracteristicas_texto && p.caracteristicas_texto.trim()) return p.caracteristicas_texto
  const parts: string[] = []
  if (p.recamaras != null) parts.push(`${p.recamaras} rec`)
  if (p.banos != null) parts.push(`${p.banos}${p.medios_banos ? '.' + p.medios_banos : ''} baños`)
  return parts.join(' · ') || '—'
}
const tipoLabel = (t: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—')

// Columnas de la tabla (para los filtros tipo Excel).
type ColId = 'modelo' | 'precio' | 'caract' | 'tipo' | 'entrega'
type SortDir = 'asc' | 'desc'
const COLS: { id: ColId; label: string; flex: number }[] = [
  { id: 'modelo', label: 'Modelo', flex: 2.4 },
  { id: 'precio', label: 'Precio', flex: 1.3 },
  { id: 'caract', label: 'Características', flex: 1.6 },
  { id: 'tipo', label: 'Tipo', flex: 1 },
  { id: 'entrega', label: 'Entrega', flex: 1.5 },
]

// Valor comparable por columna (para ordenar ascendente/descendente).
function valorCol(p: Prop, col: ColId): number | string {
  switch (col) {
    case 'precio': return p.precio ?? Number.POSITIVE_INFINITY
    case 'caract': return p.recamaras ?? -1
    case 'tipo': return normalizar(tipoLabel(p.tipo))
    case 'entrega': return normalizar(p.entrega_aprox ?? '')
    default: return normalizar(p.titulo ?? '')
  }
}

type EditState = { tabla: 'prop' | 'pdr'; id: string; campo: string; val: string } | null

export default function InventarioTabla() {
  const [props, setProps] = useState<Prop[]>([])
  const [pdrRows, setPdrRows] = useState<PdrRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())  // zonas abiertas (colapsadas por defecto)
  const [edit, setEdit] = useState<EditState>(null)

  // Buscador global + filtros por columna (tipo Excel, aplican a todas las tablas)
  const [busqueda, setBusqueda] = useState('')
  const [openCol, setOpenCol] = useState<ColId | null>(null)
  const [fModelo, setFModelo] = useState('')
  const [fCaract, setFCaract] = useState('')
  const [fEntrega, setFEntrega] = useState('')
  const [fTipo, setFTipo] = useState<string | null>(null)
  const [fRec, setFRec] = useState<number | null>(null)
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [sortCol, setSortCol] = useState<ColId | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: propData }, { data: pdrData }] = await Promise.all([
        supabase.from('propiedades')
          .select('id, codigo, titulo, precio, tipo, recamaras, banos, medios_banos, nombre_constructora, zona, direccion, entrega_aprox, caracteristicas_texto')
          .eq('es_constructora', true).eq('es_inventario', false)
          .order('precio', { ascending: true, nullsFirst: false }),
        supabase.from('pdr_referencia').select('*').order('orden', { ascending: true }),
      ])
      setProps((propData ?? []) as Prop[])
      // Sembrar la tabla de PDR desde el dataset estático la primera vez que está vacía.
      if (!pdrData || pdrData.length === 0) {
        const seed = PDR_POR_ZONA.flatMap((g, gi) => g.refs.map((r, i) => ({
          zona: g.zona, etiqueta: r.etiqueta, precio: r.precio, caract: r.caract, tipo: r.tipo, orden: gi * 100 + i,
        })))
        const { data: inserted } = await supabase.from('pdr_referencia').insert(seed).select()
        setPdrRows((inserted ?? []) as PdrRow[])
      } else {
        setPdrRows(pdrData as PdrRow[])
      }
    } finally { setLoading(false) }
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // ── Edición inline (como Excel) ────────────────────────────────
  const PROP_COL: Record<string, string> = { modelo: 'titulo', precio: 'precio', caract: 'caracteristicas_texto', tipo: 'tipo', entrega: 'entrega_aprox' }
  async function commitEdit() {
    if (!edit) return
    const { tabla, id, campo, val } = edit
    setEdit(null)
    if (tabla === 'prop') {
      const col = PROP_COL[campo]
      const value: any = campo === 'precio' ? (Number(val.replace(/\D/g, '')) || null) : (val.trim() || null)
      setProps(prev => prev.map(p => p.id === id ? { ...p, [col]: value } : p))
      await supabase.from('propiedades').update({ [col]: value }).eq('id', id)
    } else {
      const value: any = campo === 'precio' ? (Number(val.replace(/\D/g, '')) || null) : (campo === 'etiqueta' ? val.trim() : (val.trim() || null))
      setPdrRows(prev => prev.map(r => r.id === id ? { ...r, [campo]: value } : r))
      await supabase.from('pdr_referencia').update({ [campo]: value }).eq('id', id)
    }
  }
  async function agregarPdr(zona: string) {
    const ordenMax = pdrRows.filter(r => r.zona === zona).reduce((m, r) => Math.max(m, r.orden), 0)
    const { data } = await supabase.from('pdr_referencia')
      .insert({ zona, etiqueta: 'Nueva referencia', precio: null, caract: null, tipo: null, orden: ordenMax + 1 })
      .select().single()
    if (data) {
      setPdrRows(prev => [...prev, data as PdrRow])
      setEdit({ tabla: 'pdr', id: (data as PdrRow).id, campo: 'etiqueta', val: 'Nueva referencia' })
    }
  }
  async function borrarPdr(id: string) {
    setPdrRows(prev => prev.filter(r => r.id !== id))
    await supabase.from('pdr_referencia').delete().eq('id', id)
  }

  // Tipos presentes en los datos (para el filtro de la columna Tipo).
  const tiposDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const p of props) if (p.tipo) set.add(p.tipo)
    return Array.from(set).sort()
  }, [props])

  const zonas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const qModelo = normalizar(fModelo.trim())
    const qCaract = normalizar(fCaract.trim())
    const qEntrega = normalizar(fEntrega.trim())
    const nMin = Number(precioMin.replace(/\D/g, '')) || 0
    const nMax = Number(precioMax.replace(/\D/g, '')) || Infinity

    const zonaDe = (p: Prop) => {
      const z = zonaOverride(p.nombre_constructora ?? '') ?? zonaDetallada(`${p.direccion ?? ''} ${p.titulo ?? ''}`) ?? 'Otras zonas'
      if (normalizar(z).includes('monterrey')) return 'Monterrey'
      return z
    }

    const filtradas = props.filter(p => {
      if (fTipo && p.tipo !== fTipo) return false
      if (fRec != null && (p.recamaras ?? 0) < fRec) return false
      if (p.precio != null && (p.precio < nMin || p.precio > nMax)) return false
      if (qModelo && !normalizar(`${p.titulo ?? ''} ${p.codigo ?? ''}`).includes(qModelo)) return false
      if (qCaract && !normalizar(caract(p)).includes(qCaract)) return false
      if (qEntrega && !normalizar(p.entrega_aprox ?? '').includes(qEntrega)) return false
      if (q) {
        const hay = normalizar(`${p.nombre_constructora ?? ''} ${p.titulo ?? ''} ${p.codigo ?? ''} ${zonaDe(p)}`)
        if (!hay.includes(q)) return false
      }
      return true
    })

    // Filtro para los PDR de referencia (precio + tipo + búsqueda).
    const refPasa = (r: PdrRow, zona: string) => {
      if (fTipo && normalizar(r.tipo ?? '') !== normalizar(fTipo)) return false
      if (r.precio != null && (r.precio < nMin || r.precio > nMax)) return false
      if (qModelo && !normalizar(r.etiqueta).includes(qModelo)) return false
      if (qCaract && !normalizar(r.caract ?? '').includes(qCaract)) return false
      if (q && !normalizar(`${r.etiqueta} ${zona}`).includes(q)) return false
      return true
    }
    const pdrDe = (zona: string) => pdrRows.filter(r => normalizar(r.zona) === normalizar(zona) && refPasa(r, zona))

    const porZona = new Map<string, Prop[]>()
    for (const p of filtradas) {
      const z = zonaDe(p)
      if (!porZona.has(z)) porZona.set(z, [])
      porZona.get(z)!.push(p)
    }

    const liveZonas = Array.from(porZona.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([zona, ps]) => {
        const ciudad = CIUDAD[ps.find(x => x.zona)?.zona ?? ''] ?? ''
        const desde = ps.reduce((m, p) => (p.precio != null && p.precio < m ? p.precio : m), Infinity)
        const desdeVal = isFinite(desde) ? desde : null
        const porDes = new Map<string, Prop[]>()
        for (const p of ps) {
          const d = p.nombre_constructora?.trim() || 'Sin desarrollo'
          if (!porDes.has(d)) porDes.set(d, [])
          porDes.get(d)!.push(p)
        }
        const desarrollos = Array.from(porDes.entries())
          .map(([nombre, modelos]) => ({ nombre, modelos }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        return { zona, ciudad, total: ps.length, desde: desdeVal, color: colorZona(zona), desarrollos, refs: pdrDe(zona), soloRef: false }
      })

    // Zonas con PDR que NO tienen inventario en vivo → tarjeta solo-referencia.
    const usadas = new Set(liveZonas.map(z => normalizar(z.zona)))
    const zonasPdr = Array.from(new Set(pdrRows.map(r => r.zona)))
    const refZonas = zonasPdr
      .filter(zona => !usadas.has(normalizar(zona)))
      .map(zona => ({ zona, ciudad: '', total: 0, desde: null as number | null, color: colorZona(zona), desarrollos: [] as { nombre: string; modelos: Prop[] }[], refs: pdrDe(zona), soloRef: true }))
      .filter(z => z.refs.length > 0)

    // Monterrey y Puebla siempre hasta el fondo.
    const result = [...liveZonas, ...refZonas]
    const alFondo = (zona: string) => { const n = normalizar(zona); return n.includes('monterrey') || n.includes('puebla') }
    return [...result.filter(z => !alFondo(z.zona)), ...result.filter(z => alFondo(z.zona))]
  }, [props, pdrRows, busqueda, fModelo, fCaract, fEntrega, fTipo, fRec, precioMin, precioMax])

  const toggle = (z: string) => setExpandidas(prev => { const n = new Set(prev); n.has(z) ? n.delete(z) : n.add(z); return n })
  const expandirTodo = () => setExpandidas(new Set(zonas.map(z => z.zona)))
  const colapsarTodo = () => setExpandidas(new Set())
  const limpiarFiltros = () => { setFModelo(''); setFCaract(''); setFEntrega(''); setFTipo(null); setFRec(null); setPrecioMin(''); setPrecioMax(''); setOpenCol(null) }
  const colActiva = (id: ColId) =>
    (id === 'modelo' && !!fModelo) ||
    (id === 'precio' && (!!precioMin || !!precioMax)) ||
    (id === 'caract' && (!!fCaract || fRec != null)) ||
    (id === 'tipo' && !!fTipo) ||
    (id === 'entrega' && !!fEntrega)
  const nFiltros = COLS.filter(c => colActiva(c.id)).length
  const isWeb = Platform.OS === 'web'

  // Orden ascendente/descendente por columna (aplica a todas las tablas).
  const setSort = (col: ColId, dir: SortDir) => { setSortCol(col); setSortDir(dir) }
  const ordenar = (m: Prop[]) => {
    if (!sortCol) return m
    return [...m].sort((a, b) => {
      const va = valorCol(a, sortCol), vb = valorCol(b, sortCol)
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? r : -r
    })
  }
  const ordenarRefs = (rs: PdrRow[]) => {
    if (!sortCol) return rs
    return [...rs].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortCol === 'precio') { va = a.precio ?? Infinity; vb = b.precio ?? Infinity }
      else if (sortCol === 'tipo') { va = normalizar(a.tipo ?? ''); vb = normalizar(b.tipo ?? '') }
      else if (sortCol === 'caract') { va = normalizar(a.caract ?? ''); vb = normalizar(b.caract ?? '') }
      else { va = normalizar(a.etiqueta); vb = normalizar(b.etiqueta) }
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? r : -r
    })
  }
  const sortArrow = (id: ColId) => (sortCol === id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  // Celda editable inline (click → input; Enter/blur guarda; Escape cancela).
  const celda = (tabla: 'prop' | 'pdr', id: string, campo: string, valorEdit: string, contenido: React.ReactNode, wrapStyle: any, numerico = false) => {
    const activo = edit && edit.tabla === tabla && edit.id === id && edit.campo === campo
    if (activo) {
      return (
        <View style={wrapStyle}>
          {isWeb
            ? createElement('input', {
                autoFocus: true, value: edit!.val, inputMode: numerico ? 'numeric' : undefined,
                onChange: (e: any) => setEdit({ ...edit!, val: e.target.value }),
                onBlur: commitEdit,
                onKeyDown: (e: any) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null) },
                style: { width: '100%', boxSizing: 'border-box', padding: '4px 6px', borderRadius: 6, border: `1px solid ${GOLD}`, background: BG, color: TEXT, fontSize: 12 },
              })
            : <TextInput autoFocus value={edit!.val} keyboardType={numerico ? 'numeric' : 'default'}
                onChangeText={v => setEdit({ ...edit!, val: v })} onBlur={commitEdit} style={s.cellInput} />}
        </View>
      )
    }
    return (
      <TouchableOpacity style={wrapStyle} onPress={() => setEdit({ tabla, id, campo, val: valorEdit })} activeOpacity={0.6}>
        {contenido}
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.page}>
      <View style={s.head}>
        <Text style={s.title}>🏷️ Tabla de precios</Text>
        <Text style={s.sub}>Toca cualquier celda para editarla · {props.length} modelos</Text>
      </View>

      {/* Buscador + expandir/colapsar */}
      <View style={s.toolbar}>
        <TextInput style={s.search} value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar zona, desarrollo, modelo…" placeholderTextColor={MUTE} />
        {nFiltros > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={limpiarFiltros}>
            <Text style={s.clearTxt}>✕ Filtros ({nFiltros})</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={s.expandRow}>
        <TouchableOpacity onPress={expandirTodo}><Text style={s.expandLink}>▼ Expandir todo</Text></TouchableOpacity>
        <TouchableOpacity onPress={colapsarTodo}><Text style={s.expandLink}>▶ Colapsar todo</Text></TouchableOpacity>
      </View>

      {/* Encabezado de columnas con filtro tipo Excel (aplica a todas las tablas) */}
      <View style={s.filterHead}>
        {COLS.map(col => {
          const on = colActiva(col.id)
          return (
            <TouchableOpacity key={col.id} style={[{ flex: col.flex }, s.filterCol, openCol === col.id && s.filterColOpen]}
              onPress={() => setOpenCol(openCol === col.id ? null : col.id)} activeOpacity={0.7}>
              <Text style={[s.filterColTxt, (on || sortCol === col.id) && { color: GOLD }]} numberOfLines={1}>{col.label}{sortArrow(col.id)}</Text>
              <Text style={[s.filterColArrow, on && { color: GOLD }]}>{on ? '▾●' : '▾'}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Panel del filtro de la columna abierta */}
      {openCol && (
        <View style={s.colPanel}>
          <Text style={s.panelLbl}>Ordenar</Text>
          <View style={[s.chips, { marginBottom: 10 }]}>
            <TouchableOpacity style={[s.chip, sortCol === openCol && sortDir === 'asc' && s.chipOn]} onPress={() => setSort(openCol, 'asc')}>
              <Text style={[s.chipTxt, sortCol === openCol && sortDir === 'asc' && s.chipTxtOn]}>▲ Ascendente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.chip, sortCol === openCol && sortDir === 'desc' && s.chipOn]} onPress={() => setSort(openCol, 'desc')}>
              <Text style={[s.chipTxt, sortCol === openCol && sortDir === 'desc' && s.chipTxtOn]}>▼ Descendente</Text>
            </TouchableOpacity>
            {sortCol === openCol && (
              <TouchableOpacity style={s.chip} onPress={() => setSortCol(null)}>
                <Text style={s.chipTxt}>✕ Sin orden</Text>
              </TouchableOpacity>
            )}
          </View>
          {openCol === 'modelo' && (
            <TextInput style={s.panelInput} value={fModelo} onChangeText={setFModelo} autoFocus
              placeholder="Contiene… (modelo o código)" placeholderTextColor={MUTE} />
          )}
          {openCol === 'entrega' && (
            <TextInput style={s.panelInput} value={fEntrega} onChangeText={setFEntrega} autoFocus
              placeholder="Contiene… (entrega)" placeholderTextColor={MUTE} />
          )}
          {openCol === 'precio' && (
            <View style={s.precioRow}>
              <TextInput style={s.precioInput} value={precioMin} onChangeText={setPrecioMin} placeholder="Mínimo" placeholderTextColor={MUTE} keyboardType="numeric" />
              <Text style={{ color: MUTE }}>—</Text>
              <TextInput style={s.precioInput} value={precioMax} onChangeText={setPrecioMax} placeholder="Máximo" placeholderTextColor={MUTE} keyboardType="numeric" />
            </View>
          )}
          {openCol === 'caract' && (
            <View>
              <Text style={s.panelLbl}>Recámaras (mínimo)</Text>
              <View style={s.chips}>
                {[null, 1, 2, 3, 4].map(r => (
                  <TouchableOpacity key={r ?? 'all'} style={[s.chip, fRec === r && s.chipOn]} onPress={() => setFRec(r)}>
                    <Text style={[s.chipTxt, fRec === r && s.chipTxtOn]}>{r == null ? 'Todas' : `${r}+`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.panelLbl, { marginTop: 10 }]}>Texto</Text>
              <TextInput style={s.panelInput} value={fCaract} onChangeText={setFCaract}
                placeholder="Contiene… (ej. 3 rec, 2 baños)" placeholderTextColor={MUTE} />
            </View>
          )}
          {openCol === 'tipo' && (
            <View style={s.chips}>
              <TouchableOpacity style={[s.chip, fTipo == null && s.chipOn]} onPress={() => setFTipo(null)}>
                <Text style={[s.chipTxt, fTipo == null && s.chipTxtOn]}>Todos</Text>
              </TouchableOpacity>
              {tiposDisponibles.map(t => (
                <TouchableOpacity key={t} style={[s.chip, fTipo === t && s.chipOn]} onPress={() => setFTipo(t)}>
                  <Text style={[s.chipTxt, fTipo === t && s.chipTxtOn]}>{tipoLabel(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={s.panelClose} onPress={() => setOpenCol(null)}>
            <Text style={s.panelCloseTxt}>Listo</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 10 }} keyboardShouldPersistTaps="handled">
          {zonas.map(z => {
            const abierta = expandidas.has(z.zona)
            return (
              <View key={z.zona} style={[s.zonaCard, { borderColor: z.color }]}>
                <TouchableOpacity style={[s.zonaHead, { backgroundColor: z.color }]} onPress={() => toggle(z.zona)} activeOpacity={0.85}>
                  <Text style={s.zonaChevron}>{abierta ? '▼' : '▶'}</Text>
                  <Text style={s.zonaTxt} numberOfLines={1}>{z.zona}{z.ciudad && normalizar(z.ciudad) !== normalizar(z.zona) ? ` · ${z.ciudad}` : ''}</Text>
                  {z.desde != null ? <Text style={s.zonaDesde}>desde {fmtPrecio(z.desde)}</Text> : null}
                  {z.soloRef
                    ? <Text style={s.zonaRefBadge}>solo PDR</Text>
                    : <Text style={s.zonaMeta}>{z.total}</Text>}
                </TouchableOpacity>

                {abierta && (
                  <View style={{ backgroundColor: z.color + '14' }}>
                    {z.desarrollos.map(d => (
                      <View key={d.nombre}>
                        <View style={[s.desHead, { borderLeftColor: z.color }]}>
                          <Text style={[s.desTxt, { color: z.color }]}>{d.nombre}</Text>
                          <Text style={s.desMeta}>{d.modelos.length}</Text>
                        </View>
                        <View style={[s.row, s.colHead]}>
                          <Text style={[s.cModelo, s.colHeadTxt]}>Modelo</Text>
                          <Text style={[s.cPrecio, s.colHeadTxt]}>Precio</Text>
                          <Text style={[s.cCaract, s.colHeadTxt]}>Características</Text>
                          <Text style={[s.cTipo, s.colHeadTxt]}>Tipo</Text>
                          <Text style={[s.cEntrega, s.colHeadTxt]}>Entrega</Text>
                        </View>
                        {ordenar(d.modelos).map(p => (
                          <View key={p.id} style={s.row}>
                            {celda('prop', p.id, 'modelo', p.titulo ?? '',
                              <><Text style={s.modeloTxt} numberOfLines={2}>{p.titulo}</Text>{p.codigo ? <Text style={s.codigoTxt}>{p.codigo}</Text> : null}</>,
                              s.cModelo)}
                            {celda('prop', p.id, 'precio', String(p.precio ?? ''),
                              <Text style={s.precioTxt}>{fmtPrecio(p.precio)}</Text>, s.cPrecio, true)}
                            {celda('prop', p.id, 'caract', caract(p) === '—' ? '' : caract(p),
                              <Text style={[s.cellTxt]} numberOfLines={2}>{caract(p)}</Text>, s.cCaract)}
                            {celda('prop', p.id, 'tipo', p.tipo ?? '',
                              <Text style={[s.cellTxt]} numberOfLines={1}>{tipoLabel(p.tipo)}</Text>, s.cTipo)}
                            {celda('prop', p.id, 'entrega', p.entrega_aprox ?? '',
                              <Text style={[s.entregaTxt, !p.entrega_aprox && { color: MUTE }]} numberOfLines={1}>{p.entrega_aprox || '+ agregar'}</Text>, s.cEntrega)}
                          </View>
                        ))}
                      </View>
                    ))}

                    {/* PDR · Precios de referencia (editable) al final de la zona */}
                    <View style={[s.pdrHead, { backgroundColor: z.color }]}>
                      <Text style={s.pdrHeadTxt}>PDR · Precios de referencia</Text>
                      <Text style={s.pdrHeadMeta}>{z.refs.length}</Text>
                    </View>
                    {z.refs.length > 0 && (
                      <View style={[s.row, s.colHead]}>
                        <Text style={[s.cModelo, s.colHeadTxt]}>Referencia</Text>
                        <Text style={[s.cPrecio, s.colHeadTxt]}>Precio</Text>
                        <Text style={[s.cCaract, s.colHeadTxt]}>Características</Text>
                        <Text style={[s.cTipo, s.colHeadTxt]}>Tipo</Text>
                        <Text style={[s.cEntrega, s.colHeadTxt]}> </Text>
                      </View>
                    )}
                    {ordenarRefs(z.refs).map(r => (
                      <View key={r.id} style={[s.row, s.pdrDataRow]}>
                        {celda('pdr', r.id, 'etiqueta', r.etiqueta,
                          <Text style={s.modeloTxt} numberOfLines={2}>{r.etiqueta}</Text>, s.cModelo)}
                        {celda('pdr', r.id, 'precio', String(r.precio ?? ''),
                          <Text style={s.pdrRefPrecio}>{fmtPrecio(r.precio)}</Text>, s.cPrecio, true)}
                        {celda('pdr', r.id, 'caract', r.caract ?? '',
                          <Text style={[s.cellTxt]} numberOfLines={2}>{r.caract || '—'}</Text>, s.cCaract)}
                        {celda('pdr', r.id, 'tipo', r.tipo ?? '',
                          <Text style={[s.cellTxt]} numberOfLines={1}>{r.tipo ?? '—'}</Text>, s.cTipo)}
                        <TouchableOpacity style={[s.cEntrega, { alignItems: 'flex-end' }]} onPress={() => borrarPdr(r.id)}>
                          <Text style={s.pdrDelTxt}>🗑</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={s.pdrAddBtn} onPress={() => agregarPdr(z.zona)}>
                      <Text style={s.pdrAddTxt}>＋ Agregar referencia</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )
          })}
          {zonas.length === 0 && <Text style={s.vacio}>Sin resultados.</Text>}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  head: { paddingHorizontal: 16, paddingTop: 14 },
  title: { color: TEXT, fontSize: 20, fontWeight: '900' },
  sub: { color: MUTE, fontSize: 12, marginTop: 3 },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  search: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: TEXT, fontSize: 14 },
  clearBtn: { justifyContent: 'center', backgroundColor: '#5a1f1f', borderWidth: 1, borderColor: '#8a3030', borderRadius: 10, paddingHorizontal: 12 },
  clearTxt: { color: '#ffb4b4', fontSize: 12.5, fontWeight: '800' },
  expandRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 14, paddingVertical: 8 },
  expandLink: { color: GOLD, fontSize: 12.5, fontWeight: '800' },

  filterHead: { flexDirection: 'row', marginHorizontal: 10, backgroundColor: '#0a1622', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, gap: 6 },
  filterCol: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 2 },
  filterColOpen: { backgroundColor: 'rgba(201,168,76,0.1)' },
  filterColTxt: { color: SUB, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', flexShrink: 1 },
  filterColArrow: { color: MUTE, fontSize: 10, fontWeight: '900' },
  colPanel: { backgroundColor: CARD, borderWidth: 1, borderColor: GOLD, borderRadius: 12, marginHorizontal: 10, marginTop: 6, padding: 12 },
  panelLbl: { color: SUB, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  panelInput: { backgroundColor: '#152f45', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: TEXT, fontSize: 13 },
  panelClose: { alignSelf: 'flex-end', marginTop: 10, backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  panelCloseTxt: { color: '#1a1200', fontSize: 12.5, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#152f45', borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { color: SUB, fontSize: 12, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  precioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  precioInput: { flex: 1, backgroundColor: '#152f45', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, color: TEXT, fontSize: 13 },

  zonaCard: { borderWidth: 1.5, borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  zonaHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  zonaChevron: { color: '#fff', fontSize: 13, fontWeight: '900' },
  zonaTxt: { color: '#fff', fontSize: 15, fontWeight: '900', flex: 1 },
  zonaDesde: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800' },
  zonaMeta: { color: '#fff', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  zonaRefBadge: { color: '#fff', fontSize: 10.5, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', textTransform: 'uppercase' },
  desHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 7, marginTop: 2 },
  desTxt: { fontSize: 13.5, fontWeight: '800' },
  desMeta: { color: MUTE, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  colHead: { backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 4 },
  colHeadTxt: { color: SUB, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cModelo: { flex: 2.4 },
  cPrecio: { flex: 1.3 },
  cCaract: { flex: 1.6 },
  cTipo: { flex: 1 },
  cEntrega: { flex: 1.5 },
  cellTxt: { color: SUB, fontSize: 12 },
  cellInput: { borderWidth: 1, borderColor: GOLD, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, color: TEXT, fontSize: 12 },
  modeloTxt: { color: TEXT, fontSize: 12.5, fontWeight: '700' },
  codigoTxt: { color: MUTE, fontSize: 10, marginTop: 1 },
  precioTxt: { color: '#4ade80', fontSize: 13, fontWeight: '900' },
  entregaTxt: { color: TEXT, fontSize: 12, fontWeight: '600' },
  pdrHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 12, paddingVertical: 8 },
  pdrHeadTxt: { color: '#fff', fontSize: 12.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  pdrHeadMeta: { color: '#fff', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  pdrDataRow: { backgroundColor: 'rgba(0,0,0,0.18)' },
  pdrRefPrecio: { color: GOLD, fontSize: 13, fontWeight: '900' },
  pdrDelTxt: { fontSize: 13 },
  pdrAddBtn: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.05)' },
  pdrAddTxt: { color: GOLD, fontSize: 12.5, fontWeight: '800' },
  vacio: { color: MUTE, textAlign: 'center', padding: 30 },
})
