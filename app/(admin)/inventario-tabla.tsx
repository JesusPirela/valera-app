import { useCallback, useEffect, useMemo, useState, createElement } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
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
  [/meseta/, 'Ciudad Meseta'],
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
function valorRef(r: PdrRow, col: ColId): number | string {
  switch (col) {
    case 'precio': return r.precio ?? Number.POSITIVE_INFINITY
    case 'tipo': return normalizar(r.tipo ?? '')
    case 'caract': return normalizar(r.caract ?? '')
    case 'entrega': return ''
    default: return normalizar(r.etiqueta)
  }
}
function cmp(va: number | string, vb: number | string, dir: SortDir): number {
  const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
  return dir === 'asc' ? r : -r
}
function cmpProp(a: Prop, b: Prop, col: ColId, dir: SortDir) { return cmp(valorCol(a, col), valorCol(b, col), dir) }
function cmpRef(a: PdrRow, b: PdrRow, col: ColId, dir: SortDir) { return cmp(valorRef(a, col), valorRef(b, col), dir) }

type EditState = { tabla: 'prop' | 'pdr'; id: string; campo: string; val: string } | null

// Filtro + orden de UNA tabla (zona). Cada zona tiene el suyo.
type ZF = {
  modelo: string; caract: string; entrega: string; tipo: string | null; rec: number | null
  pmin: string; pmax: string; sortCol: ColId | null; sortDir: SortDir; openCol: ColId | null
}
const ZF0: ZF = { modelo: '', caract: '', entrega: '', tipo: null, rec: null, pmin: '', pmax: '', sortCol: null, sortDir: 'asc', openCol: null }

type ZonaData = {
  zona: string; ciudad: string; total: number; desde: number | null; color: string
  desarrollos: { nombre: string; modelos: Prop[] }[]; refs: PdrRow[]; soloRef: boolean
}

export default function InventarioTabla() {
  const [props, setProps] = useState<Prop[]>([])
  const [pdrRows, setPdrRows] = useState<PdrRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())  // zonas abiertas (colapsadas por defecto)
  const [edit, setEdit] = useState<EditState>(null)
  const [busqueda, setBusqueda] = useState('')
  const [zf, setZf] = useState<Record<string, ZF>>({})   // filtros por zona
  const [esAdmin, setEsAdmin] = useState(false)           // solo admin edita; supervisor ve

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
      setEsAdmin(data?.role === 'admin')
    })()
  }, [])

  // Navegación al tocar una propiedad: admin → edición; supervisor → ficha (prospecto).
  const abrirEdicion = (id: string) => router.push({ pathname: '/(admin)/editar-propiedad', params: { id } })
  const abrirProspecto = (id: string) => router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id } })

  const getZf = (z: string): ZF => zf[z] ?? ZF0
  const patchZf = (z: string, patch: Partial<ZF>) => setZf(prev => ({ ...prev, [z]: { ...(prev[z] ?? ZF0), ...patch } }))
  const zfActiva = (f: ZF, id: ColId) =>
    (id === 'modelo' && !!f.modelo) ||
    (id === 'precio' && (!!f.pmin || !!f.pmax)) ||
    (id === 'caract' && (!!f.caract || f.rec != null)) ||
    (id === 'tipo' && !!f.tipo) ||
    (id === 'entrega' && !!f.entrega)
  const zfNfiltros = (f: ZF) => COLS.filter(c => zfActiva(f, c.id)).length

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

  // Zonas con TODOS sus datos (solo aplica la búsqueda global). El filtro/orden
  // por columna se aplica por-zona en el render (aplicarZF).
  const zonas = useMemo<ZonaData[]>(() => {
    const q = normalizar(busqueda.trim())
    const zonaDe = (p: Prop) => {
      const z = zonaOverride(p.nombre_constructora ?? '') ?? zonaDetallada(`${p.direccion ?? ''} ${p.titulo ?? ''}`) ?? 'Otras zonas'
      if (normalizar(z).includes('monterrey')) return 'Monterrey'
      return z
    }
    const filtradas = q
      ? props.filter(p => normalizar(`${p.nombre_constructora ?? ''} ${p.titulo ?? ''} ${p.codigo ?? ''} ${zonaDe(p)}`).includes(q))
      : props

    const porZona = new Map<string, Prop[]>()
    for (const p of filtradas) {
      const z = zonaDe(p)
      if (!porZona.has(z)) porZona.set(z, [])
      porZona.get(z)!.push(p)
    }
    const pdrDe = (zona: string) => pdrRows.filter(r => normalizar(r.zona) === normalizar(zona))

    const liveZonas: ZonaData[] = Array.from(porZona.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([zona, ps]) => {
        const ciudad = CIUDAD[ps.find(x => x.zona)?.zona ?? ''] ?? ''
        const desde = ps.reduce((m, p) => (p.precio != null && p.precio < m ? p.precio : m), Infinity)
        const porDes = new Map<string, Prop[]>()
        for (const p of ps) {
          const d = p.nombre_constructora?.trim() || 'Sin desarrollo'
          if (!porDes.has(d)) porDes.set(d, [])
          porDes.get(d)!.push(p)
        }
        const desarrollos = Array.from(porDes.entries()).map(([nombre, modelos]) => ({ nombre, modelos }))
        return { zona, ciudad, total: ps.length, desde: isFinite(desde) ? desde : null, color: colorZona(zona), desarrollos, refs: pdrDe(zona), soloRef: false }
      })

    // Zonas con PDR que NO tienen inventario en vivo → tarjeta solo-referencia.
    const usadas = new Set(liveZonas.map(z => normalizar(z.zona)))
    const refZonas: ZonaData[] = Array.from(new Set(pdrRows.map(r => r.zona)))
      .filter(zona => !usadas.has(normalizar(zona)))
      .map(zona => ({ zona, ciudad: '', total: 0, desde: null, color: colorZona(zona), desarrollos: [], refs: pdrDe(zona), soloRef: true }))
      .filter(z => z.refs.length > 0 && (!q || normalizar(z.zona).includes(q) || z.refs.some(r => normalizar(r.etiqueta).includes(q))))

    const result = [...liveZonas, ...refZonas]
    const alFondo = (zona: string) => { const n = normalizar(zona); return n.includes('monterrey') || n.includes('puebla') }
    return [...result.filter(z => !alFondo(z.zona)), ...result.filter(z => alFondo(z.zona))]
  }, [props, pdrRows, busqueda])

  // Aplica el filtro/orden de una zona a sus desarrollos y PDR.
  function aplicarZF(z: ZonaData, f: ZF) {
    const qm = normalizar(f.modelo.trim()), qc = normalizar(f.caract.trim()), qe = normalizar(f.entrega.trim())
    const nMin = Number(f.pmin.replace(/\D/g, '')) || 0
    const nMax = Number(f.pmax.replace(/\D/g, '')) || Infinity
    const propPasa = (p: Prop) => {
      if (f.tipo && p.tipo !== f.tipo) return false
      if (f.rec != null && (p.recamaras ?? 0) < f.rec) return false
      if (p.precio != null && (p.precio < nMin || p.precio > nMax)) return false
      if (qm && !normalizar(`${p.titulo ?? ''} ${p.codigo ?? ''}`).includes(qm)) return false
      if (qc && !normalizar(caract(p)).includes(qc)) return false
      if (qe && !normalizar(p.entrega_aprox ?? '').includes(qe)) return false
      return true
    }
    let desarrollos = z.desarrollos
      .map(d => ({ nombre: d.nombre, modelos: d.modelos.filter(propPasa) }))
      .filter(d => d.modelos.length > 0)
    if (f.sortCol) {
      for (const d of desarrollos) d.modelos = [...d.modelos].sort((a, b) => cmpProp(a, b, f.sortCol!, f.sortDir))
      desarrollos = [...desarrollos].sort((a, b) => cmpProp(a.modelos[0], b.modelos[0], f.sortCol!, f.sortDir))
    } else {
      desarrollos = [...desarrollos].sort((a, b) => a.nombre.localeCompare(b.nombre))
    }
    const refPasa = (r: PdrRow) => {
      if (f.tipo && normalizar(r.tipo ?? '') !== normalizar(f.tipo)) return false
      if (r.precio != null && (r.precio < nMin || r.precio > nMax)) return false
      if (qm && !normalizar(r.etiqueta).includes(qm)) return false
      if (qc && !normalizar(r.caract ?? '').includes(qc)) return false
      return true
    }
    let refs = z.refs.filter(refPasa)
    if (f.sortCol) refs = [...refs].sort((a, b) => cmpRef(a, b, f.sortCol!, f.sortDir))
    return { desarrollos, refs }
  }

  const toggle = (z: string) => setExpandidas(prev => { const n = new Set(prev); n.has(z) ? n.delete(z) : n.add(z); return n })
  const expandirTodo = () => setExpandidas(new Set(zonas.map(z => z.zona)))
  const colapsarTodo = () => setExpandidas(new Set())
  const isWeb = Platform.OS === 'web'

  // Celda editable inline (admin). Supervisor: no edita; si hay onView, navega.
  const celda = (tabla: 'prop' | 'pdr', id: string, campo: string, valorEdit: string, contenido: React.ReactNode, wrapStyle: any, numerico = false, onView?: () => void) => {
    if (!esAdmin) {
      if (onView) return <TouchableOpacity style={wrapStyle} onPress={onView} activeOpacity={0.6}>{contenido}</TouchableOpacity>
      return <View style={wrapStyle}>{contenido}</View>
    }
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

  // Barra de filtro/orden de UNA zona (con su propio estado).
  const filtroZona = (z: ZonaData, f: ZF) => {
    const tipos = Array.from(new Set(z.desarrollos.flatMap(d => d.modelos.map(m => m.tipo)).filter(Boolean))) as string[]
    const nf = zfNfiltros(f)
    const setSort = (col: ColId, dir: SortDir) => patchZf(z.zona, { sortCol: col, sortDir: dir })
    return (
      <View style={s.zfBar}>
        <View style={s.zfHead}>
          {COLS.map(col => {
            const on = zfActiva(f, col.id)
            const sorted = f.sortCol === col.id
            return (
              <TouchableOpacity key={col.id} style={[{ flex: col.flex }, s.zfCol, f.openCol === col.id && s.zfColOpen]}
                onPress={() => patchZf(z.zona, { openCol: f.openCol === col.id ? null : col.id })} activeOpacity={0.7}>
                <Text style={[s.zfColTxt, (on || sorted) && { color: GOLD }]} numberOfLines={1}>
                  {col.label}{sorted ? (f.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Text>
                <Text style={[s.zfArrow, on && { color: GOLD }]}>{on ? '▾●' : '▾'}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {f.openCol && (
          <View style={s.zfPanel}>
            <Text style={s.panelLbl}>Ordenar</Text>
            <View style={[s.chips, { marginBottom: 10 }]}>
              <TouchableOpacity style={[s.chip, f.sortCol === f.openCol && f.sortDir === 'asc' && s.chipOn]} onPress={() => setSort(f.openCol!, 'asc')}>
                <Text style={[s.chipTxt, f.sortCol === f.openCol && f.sortDir === 'asc' && s.chipTxtOn]}>▲ Ascendente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.chip, f.sortCol === f.openCol && f.sortDir === 'desc' && s.chipOn]} onPress={() => setSort(f.openCol!, 'desc')}>
                <Text style={[s.chipTxt, f.sortCol === f.openCol && f.sortDir === 'desc' && s.chipTxtOn]}>▼ Descendente</Text>
              </TouchableOpacity>
              {f.sortCol === f.openCol && (
                <TouchableOpacity style={s.chip} onPress={() => patchZf(z.zona, { sortCol: null })}>
                  <Text style={s.chipTxt}>✕ Sin orden</Text>
                </TouchableOpacity>
              )}
            </View>

            {f.openCol === 'modelo' && (
              <TextInput style={s.panelInput} value={f.modelo} onChangeText={v => patchZf(z.zona, { modelo: v })} autoFocus
                placeholder="Contiene… (modelo o código)" placeholderTextColor={MUTE} />
            )}
            {f.openCol === 'entrega' && (
              <View>
                {(() => {
                  const entregas = Array.from(new Set(z.desarrollos.flatMap(d => d.modelos.map(m => m.entrega_aprox)).filter(Boolean))) as string[]
                  return entregas.length > 0 ? (
                    <View style={[s.chips, { marginBottom: 8 }]}>
                      {entregas.map(e => (
                        <TouchableOpacity key={e} style={[s.chip, normalizar(f.entrega) === normalizar(e) && s.chipOn]}
                          onPress={() => patchZf(z.zona, { entrega: normalizar(f.entrega) === normalizar(e) ? '' : e })}>
                          <Text style={[s.chipTxt, normalizar(f.entrega) === normalizar(e) && s.chipTxtOn]}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null
                })()}
                <TextInput style={s.panelInput} value={f.entrega} onChangeText={v => patchZf(z.zona, { entrega: v })}
                  placeholder="Contiene… (entrega)" placeholderTextColor={MUTE} />
              </View>
            )}
            {f.openCol === 'precio' && (
              <View style={s.precioRow}>
                <TextInput style={s.precioInput} value={f.pmin} onChangeText={v => patchZf(z.zona, { pmin: v })} placeholder="Mínimo" placeholderTextColor={MUTE} keyboardType="numeric" />
                <Text style={{ color: MUTE }}>—</Text>
                <TextInput style={s.precioInput} value={f.pmax} onChangeText={v => patchZf(z.zona, { pmax: v })} placeholder="Máximo" placeholderTextColor={MUTE} keyboardType="numeric" />
              </View>
            )}
            {f.openCol === 'caract' && (
              <View>
                <Text style={s.panelLbl}>Recámaras (mínimo)</Text>
                <View style={s.chips}>
                  {[null, 1, 2, 3, 4].map(r => (
                    <TouchableOpacity key={r ?? 'all'} style={[s.chip, f.rec === r && s.chipOn]} onPress={() => patchZf(z.zona, { rec: r })}>
                      <Text style={[s.chipTxt, f.rec === r && s.chipTxtOn]}>{r == null ? 'Todas' : `${r}+`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.panelLbl, { marginTop: 10 }]}>Texto</Text>
                <TextInput style={s.panelInput} value={f.caract} onChangeText={v => patchZf(z.zona, { caract: v })}
                  placeholder="Contiene… (ej. 3 rec, 2 baños)" placeholderTextColor={MUTE} />
              </View>
            )}
            {f.openCol === 'tipo' && (
              <View style={s.chips}>
                <TouchableOpacity style={[s.chip, f.tipo == null && s.chipOn]} onPress={() => patchZf(z.zona, { tipo: null })}>
                  <Text style={[s.chipTxt, f.tipo == null && s.chipTxtOn]}>Todos</Text>
                </TouchableOpacity>
                {tipos.map(t => (
                  <TouchableOpacity key={t} style={[s.chip, f.tipo === t && s.chipOn]} onPress={() => patchZf(z.zona, { tipo: t })}>
                    <Text style={[s.chipTxt, f.tipo === t && s.chipTxtOn]}>{tipoLabel(t)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={s.zfPanelBtns}>
              {nf > 0 && (
                <TouchableOpacity onPress={() => setZf(prev => ({ ...prev, [z.zona]: { ...ZF0, sortCol: f.sortCol, sortDir: f.sortDir } }))}>
                  <Text style={s.zfClearTxt}>✕ Limpiar filtros ({nf})</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={s.panelClose} onPress={() => patchZf(z.zona, { openCol: null })}>
                <Text style={s.panelCloseTxt}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={s.page}>
      <View style={s.head}>
        <Text style={s.title}>🏷️ Tabla de precios</Text>
        <Text style={s.sub}>{esAdmin ? 'Toca una celda para editarla' : 'Toca una propiedad para ver su ficha'} · filtra cada zona por separado · {props.length} modelos</Text>
      </View>

      <View style={s.toolbar}>
        <TextInput style={s.search} value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar zona, desarrollo, modelo…" placeholderTextColor={MUTE} />
      </View>
      <View style={s.expandRow}>
        <TouchableOpacity onPress={expandirTodo}><Text style={s.expandLink}>▼ Expandir todo</Text></TouchableOpacity>
        <TouchableOpacity onPress={colapsarTodo}><Text style={s.expandLink}>▶ Colapsar todo</Text></TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 10 }} keyboardShouldPersistTaps="handled">
          {zonas.map(z => {
            const abierta = expandidas.has(z.zona)
            const f = getZf(z.zona)
            const { desarrollos, refs } = abierta ? aplicarZF(z, f) : { desarrollos: [], refs: [] }
            const nf = zfNfiltros(f)
            return (
              <View key={z.zona} style={[s.zonaCard, { borderColor: z.color }]}>
                <TouchableOpacity style={[s.zonaHead, { backgroundColor: z.color }]} onPress={() => toggle(z.zona)} activeOpacity={0.85}>
                  <Text style={s.zonaChevron}>{abierta ? '▼' : '▶'}</Text>
                  <Text style={s.zonaTxt} numberOfLines={1}>{z.zona}{z.ciudad && normalizar(z.ciudad) !== normalizar(z.zona) ? ` · ${z.ciudad}` : ''}</Text>
                  {(nf > 0 || f.sortCol) && <Text style={s.zonaFiltroTag}>filtrado</Text>}
                  {z.desde != null ? <Text style={s.zonaDesde}>desde {fmtPrecio(z.desde)}</Text> : null}
                  {z.soloRef
                    ? <Text style={s.zonaRefBadge}>solo PDR</Text>
                    : <Text style={s.zonaMeta}>{z.total}</Text>}
                </TouchableOpacity>

                {abierta && (
                  <View style={{ backgroundColor: z.color + '14' }}>
                    {filtroZona(z, f)}

                    {desarrollos.map(d => (
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
                        {d.modelos.map(p => (
                          <View key={p.id} style={s.row}>
                            <View style={s.cModelo}>
                              {celda('prop', p.id, 'modelo', p.titulo ?? '',
                                <Text style={s.modeloTxt} numberOfLines={2}>{p.titulo}</Text>, s.cellFull, false, () => abrirProspecto(p.id))}
                              {p.codigo ? (
                                <TouchableOpacity onPress={() => (esAdmin ? abrirEdicion(p.id) : abrirProspecto(p.id))} activeOpacity={0.6}>
                                  <Text style={esAdmin ? s.codigoLink : s.codigoTxt}>#{p.codigo}{esAdmin ? ' · editar ↗' : ' ↗'}</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity onPress={() => (esAdmin ? abrirEdicion(p.id) : abrirProspecto(p.id))} activeOpacity={0.6}>
                                  <Text style={s.codigoLink}>{esAdmin ? 'editar ↗' : 'ver ↗'}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            {celda('prop', p.id, 'precio', String(p.precio ?? ''),
                              <Text style={s.precioTxt}>{fmtPrecio(p.precio)}</Text>, s.cPrecio, true, () => abrirProspecto(p.id))}
                            {celda('prop', p.id, 'caract', caract(p) === '—' ? '' : caract(p),
                              <Text style={[s.cellTxt]} numberOfLines={2}>{caract(p)}</Text>, s.cCaract, false, () => abrirProspecto(p.id))}
                            {celda('prop', p.id, 'tipo', p.tipo ?? '',
                              <Text style={[s.cellTxt]} numberOfLines={1}>{tipoLabel(p.tipo)}</Text>, s.cTipo, false, () => abrirProspecto(p.id))}
                            {celda('prop', p.id, 'entrega', p.entrega_aprox ?? '',
                              <Text style={[s.entregaTxt, !p.entrega_aprox && { color: MUTE }]} numberOfLines={1}>{p.entrega_aprox || (esAdmin ? '+ agregar' : '—')}</Text>, s.cEntrega, false, () => abrirProspecto(p.id))}
                          </View>
                        ))}
                      </View>
                    ))}
                    {!z.soloRef && desarrollos.length === 0 && <Text style={s.zonaVacia}>Ningún modelo con estos filtros.</Text>}

                    {/* PDR · Precios de referencia (editable) */}
                    <View style={[s.pdrHead, { backgroundColor: z.color }]}>
                      <Text style={s.pdrHeadTxt}>PDR · Precios de referencia</Text>
                      <Text style={s.pdrHeadMeta}>{refs.length}</Text>
                    </View>
                    {refs.length > 0 && (
                      <View style={[s.row, s.colHead]}>
                        <Text style={[s.cModelo, s.colHeadTxt]}>Referencia</Text>
                        <Text style={[s.cPrecio, s.colHeadTxt]}>Precio</Text>
                        <Text style={[s.cCaract, s.colHeadTxt]}>Características</Text>
                        <Text style={[s.cTipo, s.colHeadTxt]}>Tipo</Text>
                        <Text style={[s.cEntrega, s.colHeadTxt]}> </Text>
                      </View>
                    )}
                    {refs.map(r => (
                      <View key={r.id} style={[s.row, s.pdrDataRow]}>
                        {celda('pdr', r.id, 'etiqueta', r.etiqueta,
                          <Text style={s.modeloTxt} numberOfLines={2}>{r.etiqueta}</Text>, s.cModelo)}
                        {celda('pdr', r.id, 'precio', String(r.precio ?? ''),
                          <Text style={s.pdrRefPrecio}>{fmtPrecio(r.precio)}</Text>, s.cPrecio, true)}
                        {celda('pdr', r.id, 'caract', r.caract ?? '',
                          <Text style={[s.cellTxt]} numberOfLines={2}>{r.caract || '—'}</Text>, s.cCaract)}
                        {celda('pdr', r.id, 'tipo', r.tipo ?? '',
                          <Text style={[s.cellTxt]} numberOfLines={1}>{r.tipo ?? '—'}</Text>, s.cTipo)}
                        {esAdmin
                          ? <TouchableOpacity style={[s.cEntrega, { alignItems: 'flex-end' }]} onPress={() => borrarPdr(r.id)}>
                              <Text style={s.pdrDelTxt}>🗑</Text>
                            </TouchableOpacity>
                          : <View style={s.cEntrega} />}
                      </View>
                    ))}
                    {esAdmin && (
                      <TouchableOpacity style={s.pdrAddBtn} onPress={() => agregarPdr(z.zona)}>
                        <Text style={s.pdrAddTxt}>＋ Agregar referencia</Text>
                      </TouchableOpacity>
                    )}
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
  expandRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 14, paddingVertical: 8 },
  expandLink: { color: GOLD, fontSize: 12.5, fontWeight: '800' },

  // Filtro por zona
  zfBar: { paddingHorizontal: 8, paddingTop: 6 },
  zfHead: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, gap: 6 },
  zfCol: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, gap: 2 },
  zfColOpen: { backgroundColor: 'rgba(201,168,76,0.12)' },
  zfColTxt: { color: SUB, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', flexShrink: 1 },
  zfArrow: { color: MUTE, fontSize: 10, fontWeight: '900' },
  zfPanel: { backgroundColor: CARD, borderWidth: 1, borderColor: GOLD, borderRadius: 12, marginTop: 6, padding: 12 },
  zfPanelBtns: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  zfClearTxt: { color: '#ffb4b4', fontSize: 12.5, fontWeight: '800' },
  panelLbl: { color: SUB, fontSize: 12, fontWeight: '800', marginBottom: 6 },
  panelInput: { backgroundColor: '#152f45', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: TEXT, fontSize: 13 },
  panelClose: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
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
  zonaFiltroTag: { color: '#1a1200', fontSize: 9.5, fontWeight: '900', backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', textTransform: 'uppercase' },
  zonaDesde: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800' },
  zonaMeta: { color: '#fff', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  zonaRefBadge: { color: '#fff', fontSize: 10.5, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', textTransform: 'uppercase' },
  zonaVacia: { color: MUTE, fontSize: 12, fontStyle: 'italic', paddingHorizontal: 14, paddingVertical: 12 },
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
  cellFull: { alignSelf: 'stretch' },
  modeloTxt: { color: TEXT, fontSize: 12.5, fontWeight: '700' },
  codigoTxt: { color: MUTE, fontSize: 10, marginTop: 1 },
  codigoLink: { color: GOLD, fontSize: 10, fontWeight: '800', marginTop: 2 },
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
