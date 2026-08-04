import { useCallback, useMemo, useState, createElement } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { normalizar } from '../../lib/texto'
import { zonaDetallada } from '../../lib/zonas-interes'

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
  nombre_constructora: string | null; zona: string | null; direccion: string | null; entrega_aprox: string | null
}

function fmtPrecio(p: number | null) { return p == null ? '—' : '$' + p.toLocaleString('es-MX') }
function caract(p: Prop) {
  const parts: string[] = []
  if (p.recamaras != null) parts.push(`${p.recamaras} rec`)
  if (p.banos != null) parts.push(`${p.banos}${p.medios_banos ? '.' + p.medios_banos : ''} baños`)
  return parts.join(' · ') || '—'
}
const tipoLabel = (t: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—')

export default function InventarioTabla() {
  const [props, setProps] = useState<Prop[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())  // zonas abiertas (colapsadas por defecto)
  const [editEntrega, setEditEntrega] = useState<{ id: string; val: string } | null>(null)

  // Filtros (por columna)
  const [busqueda, setBusqueda] = useState('')
  const [tipoF, setTipoF] = useState<string | null>(null)
  const [recF, setRecF] = useState<number | null>(null)
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [filtrosOpen, setFiltrosOpen] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('propiedades')
        .select('id, codigo, titulo, precio, tipo, recamaras, banos, medios_banos, nombre_constructora, zona, direccion, entrega_aprox')
        .eq('es_constructora', true).eq('es_inventario', false)
        .order('precio', { ascending: true, nullsFirst: false })
      setProps((data ?? []) as Prop[])
    } finally { setLoading(false) }
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function guardarEntrega(id: string, val: string) {
    setEditEntrega(null)
    setProps(prev => prev.map(p => p.id === id ? { ...p, entrega_aprox: val.trim() || null } : p))
    await supabase.from('propiedades').update({ entrega_aprox: val.trim() || null }).eq('id', id)
  }

  const zonas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const nMin = Number(precioMin.replace(/\D/g, '')) || 0
    const nMax = Number(precioMax.replace(/\D/g, '')) || Infinity

    const zonaDe = (p: Prop) => zonaOverride(p.nombre_constructora ?? '') ?? zonaDetallada(`${p.direccion ?? ''} ${p.titulo ?? ''}`) ?? 'Otras zonas'

    const filtradas = props.filter(p => {
      if (tipoF && p.tipo !== tipoF) return false
      if (recF != null && (p.recamaras ?? 0) < recF) return false
      if (p.precio != null && (p.precio < nMin || p.precio > nMax)) return false
      if (q) {
        const hay = normalizar(`${p.nombre_constructora ?? ''} ${p.titulo ?? ''} ${p.codigo ?? ''} ${zonaDe(p)}`)
        if (!hay.includes(q)) return false
      }
      return true
    })

    const porZona = new Map<string, Prop[]>()
    for (const p of filtradas) {
      const z = zonaDe(p)
      if (!porZona.has(z)) porZona.set(z, [])
      porZona.get(z)!.push(p)
    }
    return Array.from(porZona.entries())
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
        const desarrollos = Array.from(porDes.entries())
          .map(([nombre, modelos]) => ({ nombre, modelos }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        return { zona, ciudad, total: ps.length, desde: isFinite(desde) ? desde : null, color: colorZona(zona), desarrollos }
      })
  }, [props, busqueda, tipoF, recF, precioMin, precioMax])

  const toggle = (z: string) => setExpandidas(prev => { const n = new Set(prev); n.has(z) ? n.delete(z) : n.add(z); return n })
  const expandirTodo = () => setExpandidas(new Set(zonas.map(z => z.zona)))
  const colapsarTodo = () => setExpandidas(new Set())
  const nFiltros = (tipoF ? 1 : 0) + (recF != null ? 1 : 0) + (precioMin ? 1 : 0) + (precioMax ? 1 : 0)
  const isWeb = Platform.OS === 'web'

  return (
    <View style={s.page}>
      <View style={s.head}>
        <Text style={s.title}>🏷️ Tabla de precios</Text>
        <Text style={s.sub}>Precios en vivo de la app ({props.length} modelos) · toca una zona para expandir</Text>
      </View>

      {/* Buscador + filtros + expandir/colapsar */}
      <View style={s.toolbar}>
        <TextInput style={s.search} value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar zona, desarrollo, modelo…" placeholderTextColor={MUTE} />
        <TouchableOpacity style={[s.toolBtn, nFiltros > 0 && s.toolBtnOn]} onPress={() => setFiltrosOpen(v => !v)}>
          <Text style={[s.toolBtnTxt, nFiltros > 0 && { color: '#fff' }]}>⚙ Filtros{nFiltros ? ` (${nFiltros})` : ''}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.expandRow}>
        <TouchableOpacity onPress={expandirTodo}><Text style={s.expandLink}>▼ Expandir todo</Text></TouchableOpacity>
        <TouchableOpacity onPress={colapsarTodo}><Text style={s.expandLink}>▶ Colapsar todo</Text></TouchableOpacity>
      </View>

      {filtrosOpen && (
        <View style={s.filtros}>
          <Text style={s.filtroLbl}>Tipo</Text>
          <View style={s.chips}>
            {[null, 'casa', 'departamento', 'terreno'].map(t => (
              <TouchableOpacity key={t ?? 'all'} style={[s.chip, tipoF === t && s.chipOn]} onPress={() => setTipoF(t)}>
                <Text style={[s.chipTxt, tipoF === t && s.chipTxtOn]}>{t ? tipoLabel(t) : 'Todos'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.filtroLbl}>Recámaras (mínimo)</Text>
          <View style={s.chips}>
            {[null, 1, 2, 3, 4].map(r => (
              <TouchableOpacity key={r ?? 'all'} style={[s.chip, recF === r && s.chipOn]} onPress={() => setRecF(r)}>
                <Text style={[s.chipTxt, recF === r && s.chipTxtOn]}>{r == null ? 'Todas' : `${r}+`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.filtroLbl}>Precio</Text>
          <View style={s.precioRow}>
            <TextInput style={s.precioInput} value={precioMin} onChangeText={setPrecioMin} placeholder="Mínimo" placeholderTextColor={MUTE} keyboardType="numeric" />
            <Text style={{ color: MUTE }}>—</Text>
            <TextInput style={s.precioInput} value={precioMax} onChangeText={setPrecioMax} placeholder="Máximo" placeholderTextColor={MUTE} keyboardType="numeric" />
          </View>
        </View>
      )}

      {loading ? <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 10 }}>
          {zonas.map(z => {
            const abierta = expandidas.has(z.zona)
            return (
              <View key={z.zona} style={[s.zonaCard, { borderColor: z.color }]}>
                <TouchableOpacity style={[s.zonaHead, { backgroundColor: z.color }]} onPress={() => toggle(z.zona)} activeOpacity={0.85}>
                  <Text style={s.zonaChevron}>{abierta ? '▼' : '▶'}</Text>
                  <Text style={s.zonaTxt} numberOfLines={1}>{z.zona}{z.ciudad ? ` · ${z.ciudad}` : ''}</Text>
                  {z.desde != null ? <Text style={s.zonaDesde}>desde {fmtPrecio(z.desde)}</Text> : null}
                  <Text style={s.zonaMeta}>{z.total}</Text>
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
                        {d.modelos.map(p => (
                          <View key={p.id} style={s.row}>
                            <TouchableOpacity style={s.cModelo} onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: p.id } })}>
                              <Text style={s.modeloTxt} numberOfLines={2}>{p.titulo}</Text>
                              {p.codigo ? <Text style={s.codigoTxt}>{p.codigo}</Text> : null}
                            </TouchableOpacity>
                            <TouchableOpacity style={s.cPrecio} onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: p.id } })}>
                              <Text style={s.precioTxt}>{fmtPrecio(p.precio)}</Text>
                            </TouchableOpacity>
                            <Text style={[s.cCaract, s.cellTxt]} numberOfLines={2}>{caract(p)}</Text>
                            <Text style={[s.cTipo, s.cellTxt]} numberOfLines={1}>{tipoLabel(p.tipo)}</Text>
                            {editEntrega?.id === p.id ? (
                              <View style={s.cEntrega}>
                                {isWeb
                                  ? createElement('input', {
                                      autoFocus: true, value: editEntrega.val,
                                      onChange: (e: any) => setEditEntrega({ id: p.id, val: e.target.value }),
                                      onBlur: () => guardarEntrega(p.id, editEntrega.val),
                                      onKeyDown: (e: any) => { if (e.key === 'Enter') guardarEntrega(p.id, editEntrega.val); if (e.key === 'Escape') setEditEntrega(null) },
                                      style: { width: '100%', padding: '4px 6px', borderRadius: 6, border: `1px solid ${GOLD}`, background: BG, color: TEXT, fontSize: 12 },
                                    })
                                  : <TextInput autoFocus value={editEntrega.val} onChangeText={v => setEditEntrega({ id: p.id, val: v })}
                                      onBlur={() => guardarEntrega(p.id, editEntrega.val)} style={s.entregaInput} />}
                              </View>
                            ) : (
                              <TouchableOpacity style={s.cEntrega} onPress={() => setEditEntrega({ id: p.id, val: p.entrega_aprox ?? '' })}>
                                <Text style={[s.entregaTxt, !p.entrega_aprox && { color: MUTE }]} numberOfLines={1}>{p.entrega_aprox || '+ agregar'}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
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
  toolBtn: { justifyContent: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14 },
  toolBtnOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  toolBtnTxt: { color: SUB, fontSize: 13, fontWeight: '800' },
  expandRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 14, paddingVertical: 8 },
  expandLink: { color: GOLD, fontSize: 12.5, fontWeight: '800' },
  filtros: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, marginHorizontal: 12, padding: 12, marginBottom: 4 },
  filtroLbl: { color: SUB, fontSize: 12, fontWeight: '800', marginTop: 8, marginBottom: 6 },
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
  modeloTxt: { color: TEXT, fontSize: 12.5, fontWeight: '700' },
  codigoTxt: { color: MUTE, fontSize: 10, marginTop: 1 },
  precioTxt: { color: '#4ade80', fontSize: 13, fontWeight: '900' },
  entregaTxt: { color: TEXT, fontSize: 12, fontWeight: '600' },
  entregaInput: { borderWidth: 1, borderColor: GOLD, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, color: TEXT, fontSize: 12 },
  vacio: { color: MUTE, textAlign: 'center', padding: 30 },
})
