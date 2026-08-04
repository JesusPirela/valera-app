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
function tipoLabel(t: string | null) {
  if (!t) return '—'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function InventarioTabla() {
  const [props, setProps] = useState<Prop[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [editEntrega, setEditEntrega] = useState<{ id: string; val: string } | null>(null)

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

  // Agrupar: zona (fraccionamiento) → desarrollo (constructora) → modelos
  const zonas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const filtradas = props.filter(p => !q ||
      normalizar(p.nombre_constructora ?? '').includes(q) ||
      normalizar(p.titulo ?? '').includes(q) ||
      normalizar(p.codigo ?? '').includes(q) ||
      normalizar(zonaDetallada(`${p.direccion ?? ''} ${p.titulo ?? ''}`) ?? '').includes(q))

    const porZona = new Map<string, Prop[]>()
    for (const p of filtradas) {
      const z = zonaDetallada(`${p.direccion ?? ''} ${p.titulo ?? ''}`) ?? 'Otras zonas'
      if (!porZona.has(z)) porZona.set(z, [])
      porZona.get(z)!.push(p)
    }
    return Array.from(porZona.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([zona, ps]) => {
        const ciudad = CIUDAD[ps[0]?.zona ?? ''] ?? ''
        const porDes = new Map<string, Prop[]>()
        for (const p of ps) {
          const d = p.nombre_constructora?.trim() || 'Sin desarrollo'
          if (!porDes.has(d)) porDes.set(d, [])
          porDes.get(d)!.push(p)
        }
        const desarrollos = Array.from(porDes.entries())
          .map(([nombre, modelos]) => ({ nombre, modelos }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        return { zona, ciudad, total: ps.length, desarrollos }
      })
  }, [props, busqueda])

  const totalModelos = props.length
  const isWeb = Platform.OS === 'web'

  return (
    <View style={s.page}>
      <View style={s.head}>
        <Text style={s.title}>📋 Inventario en vivo</Text>
        <Text style={s.sub}>Precios ACTUALES de la app ({totalModelos} modelos) · toca un modelo para editar · toca la entrega para cambiarla</Text>
      </View>
      <View style={s.searchWrap}>
        <TextInput style={s.search} value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar zona, desarrollo o modelo…" placeholderTextColor={MUTE} />
      </View>

      {loading ? <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {zonas.map(z => (
            <View key={z.zona} style={{ marginBottom: 6 }}>
              <View style={s.zonaHead}>
                <Text style={s.zonaTxt}>📍 {z.zona}{z.ciudad ? ` · ${z.ciudad}` : ''}</Text>
                <Text style={s.zonaMeta}>{z.total} modelos</Text>
              </View>
              {z.desarrollos.map(d => (
                <View key={d.nombre}>
                  <View style={s.desHead}>
                    <Text style={s.desTxt}>{d.nombre}</Text>
                    <Text style={s.desMeta}>{d.modelos.length}</Text>
                  </View>
                  {/* encabezado de columnas */}
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
                                onBlur={() => guardarEntrega(p.id, editEntrega.val)} style={s.entregaInput} placeholderTextColor={MUTE} />}
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
          ))}
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
  searchWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  search: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: TEXT, fontSize: 14 },
  zonaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a6470', paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  zonaTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  zonaMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  desHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD, borderLeftWidth: 3, borderLeftColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  desTxt: { color: GOLD, fontSize: 14, fontWeight: '800' },
  desMeta: { color: MUTE, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  colHead: { backgroundColor: '#0f2233', paddingVertical: 5 },
  colHeadTxt: { color: SUB, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cModelo: { flex: 2.4 },
  cPrecio: { flex: 1.3 },
  cCaract: { flex: 1.6 },
  cTipo: { flex: 1 },
  cEntrega: { flex: 1.5 },
  cellTxt: { color: SUB, fontSize: 12 },
  modeloTxt: { color: TEXT, fontSize: 12.5, fontWeight: '700' },
  codigoTxt: { color: MUTE, fontSize: 10, marginTop: 1 },
  precioTxt: { color: '#22c55e', fontSize: 13, fontWeight: '900' },
  entregaTxt: { color: TEXT, fontSize: 12, fontWeight: '600' },
  entregaInput: { borderWidth: 1, borderColor: GOLD, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, color: TEXT, fontSize: 12 },
  vacio: { color: MUTE, textAlign: 'center', padding: 30 },
})
