import { useState, useCallback, useRef, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import MiniMapa from '../../components/MiniMapa'
import type { ZonaPin } from '../../components/MiniMapa'

type InvMapa = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  tipo: string | null
  direccion: string
  zona: string | null
  lat: number | null
  lng: number | null
  lona_contactada: boolean
  inventario_seccion: string | null
  inv_asesor_contactado: boolean
  inv_asesor_respondio: boolean
  inv_autorizado_publicar: boolean
  inv_asesor_no_contesto: boolean
  inv_apartada: boolean
  inv_no_autorizada: boolean
  inv_notas: string | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number }[]
}

type FiltroLona = 'todas' | 'contactadas' | 'no_contactadas'

const TEAL  = '#1a6470'
const VERDE = '#22a35e'
const ROJO  = '#e53935'

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro', coords: [20.5888, -100.3899] as [number, number], color: TEAL },
  { key: 'monterrey', label: 'Monterrey', coords: [25.6866, -100.3161] as [number, number], color: TEAL },
  { key: 'puebla',    label: 'Puebla',    coords: [19.0414, -98.2063]  as [number, number], color: TEAL },
]

// Detecta lat/lng invertidos (Colombia/México: lat~14-34, lng~-120-86) y filtra inválidos
function corregirCoordenadas(lat: number, lng: number): { lat: number; lng: number } | null {
  let la = lat, lo = lng
  if (la < -86 && la > -120 && lo > 14 && lo < 34) { [la, lo] = [lo, la] }
  if (la < 12 || la > 35 || lo < -120 || lo > -84) return null
  return { lat: la, lng: lo }
}

// Cuando zona=null, inferir por proximidad de coordenadas
function inferirZona(lat: number, lng: number): string {
  const CENTROS = [
    { key: 'queretaro', lat: 20.5888, lng: -100.3899 },
    { key: 'monterrey', lat: 25.6866, lng: -100.3161 },
    { key: 'puebla',    lat: 19.0414, lng: -98.2063  },
  ]
  let best = 'queretaro', minD = Infinity
  for (const c of CENTROS) {
    const d = (lat - c.lat) ** 2 + (lng - c.lng) ** 2
    if (d < minD) { minD = d; best = c.key }
  }
  return best
}

export default function Mapa() {
  const c = useColors()
  const [propiedades, setPropiedades] = useState<InvMapa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroLona>('todas')

  useFocusEffect(useCallback(() => { cargar() }, []))

  const yaCargoRef = useRef(false)
  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    yaCargoRef.current = true
    const { data } = await supabase
      .from('propiedades')
      .select(`
        id, codigo, titulo, precio, tipo, direccion, zona, lat, lng,
        lona_contactada, inventario_seccion,
        inv_asesor_contactado, inv_asesor_respondio, inv_autorizado_publicar,
        inv_asesor_no_contesto, inv_apartada, inv_no_autorizada, inv_notas,
        propiedad_imagenes(url, thumb_url, orden)
      `)
      .eq('es_inventario', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    setPropiedades((data ?? []) as InvMapa[])
    setLoading(false)
  }

  const propsFiltradas = useMemo(() => propiedades.filter(p => {
    if (filtro === 'contactadas')    return p.lona_contactada === true
    if (filtro === 'no_contactadas') return p.lona_contactada === false
    return true
  }), [propiedades, filtro])

  const zonasParaMapa: ZonaPin[] = useMemo(() => ZONAS_CONFIG.map(z => {
    const propsZona = propsFiltradas
      .map(p => ({ p, coords: corregirCoordenadas(p.lat!, p.lng!) }))
      .filter(({ coords }) => coords != null)
      .filter(({ p, coords }) => (p.zona ?? inferirZona(coords!.lat, coords!.lng)) === z.key)
    return {
      key: z.key,
      label: z.label,
      coords: z.coords,
      color: filtro === 'contactadas' ? VERDE : filtro === 'no_contactadas' ? ROJO : z.color,
      count: propsZona.length,
      propiedades: propsZona.map(({ p, coords }) => ({
        id: p.id,
        titulo: p.titulo,
        precio: p.precio,
        tipo: p.tipo,
        direccion: p.direccion,
        lat: coords!.lat,
        lng: coords!.lng,
        imagen: (p.propiedad_imagenes ?? [])[0]?.thumb_url ?? (p.propiedad_imagenes ?? [])[0]?.url ?? null,
        pinColor: filtro === 'todas' ? (p.lona_contactada ? VERDE : ROJO) : undefined,
        codigo: p.codigo,
        inventario_seccion: p.inventario_seccion,
        inv_asesor_contactado: p.inv_asesor_contactado,
        inv_asesor_respondio: p.inv_asesor_respondio,
        inv_autorizado_publicar: p.inv_autorizado_publicar,
        inv_asesor_no_contesto: p.inv_asesor_no_contesto,
        inv_apartada: p.inv_apartada,
        inv_no_autorizada: p.inv_no_autorizada,
        inv_notas: p.inv_notas,
      })),
    }
  }).filter(z => z.count > 0), [propsFiltradas, filtro])

  // Con inferirZona, todas las propiedades con lat/lng tienen zona asignada
  const sinZona: typeof propsFiltradas = []
  const totalContactadas = propsFiltradas.filter(p => p.lona_contactada).length
  const totalNoContactadas = propsFiltradas.filter(p => !p.lona_contactada).length

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Filtros */}
      <View style={[s.filtrosBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {/* Salir del mapa: el MapView captura los gestos (no hay swipe-back) y
            el header del tab queda tapado, así que se necesita un botón propio. */}
        <TouchableOpacity
          style={[s.salirBtn, { borderColor: c.border }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(prospectador)/propiedades')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Salir del mapa"
        >
          <Text style={[s.salirTxt, { color: c.text }]}>‹ Salir</Text>
        </TouchableOpacity>
        {(['todas', 'contactadas', 'no_contactadas'] as FiltroLona[]).map(f => {
          const activo = filtro === f
          const color = f === 'contactadas' ? VERDE : f === 'no_contactadas' ? ROJO : TEAL
          return (
            <TouchableOpacity
              key={f}
              style={[s.filtroBtn, activo && { backgroundColor: color, borderColor: color }]}
              onPress={() => setFiltro(f)}
              activeOpacity={0.8}
            >
              <View style={[s.filtroDot, { backgroundColor: f === 'todas' ? '#888' : color }, activo && { backgroundColor: '#fff' }]} />
              <Text style={[s.filtroTxt, { color: activo ? '#fff' : c.text }]}>
                {f === 'todas' ? 'Todas' : f === 'contactadas' ? 'Contactadas' : 'No contactadas'}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Leyenda */}
      {filtro === 'todas' && (
        <View style={[s.leyenda, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.leyendaItem}>
            <View style={[s.leyendaDot, { backgroundColor: VERDE }]} />
            <Text style={[s.leyendaTxt, { color: c.textSub }]}>Contactada</Text>
          </View>
          <View style={[s.leyendaSep, { backgroundColor: c.border }]} />
          <View style={s.leyendaItem}>
            <View style={[s.leyendaDot, { backgroundColor: ROJO }]} />
            <Text style={[s.leyendaTxt, { color: c.textSub }]}>No contactada</Text>
          </View>
          <View style={[s.leyendaSep, { backgroundColor: c.border }]} />
          <Text style={[s.leyendaTotal, { color: c.textMute }]}>
            {totalContactadas}✓ / {totalNoContactadas}✗
          </Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={[s.loadingTxt, { color: c.textMute }]}>Cargando mapa…</Text>
        </View>
      ) : propsFiltradas.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>🗺️</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>
            {filtro === 'contactadas'
              ? 'No hay lonas contactadas con ubicación.'
              : filtro === 'no_contactadas'
              ? 'No hay lonas sin contactar con ubicación.'
              : 'No hay propiedades de inventario con ubicación registrada.'}
          </Text>
        </View>
      ) : zonasParaMapa.length === 0 && sinZona.length > 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📍</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>
            {sinZona.length} propiedad{sinZona.length > 1 ? 'es' : ''} sin zona asignada.
          </Text>
        </View>
      ) : (
        <MiniMapa
          zonas={zonasParaMapa}
          onZonaPress={() => {}}
          onPropiedadPress={(id) => router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id } })}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },

  filtrosBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, alignItems: 'center',
  },
  salirBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center',
  },
  salirTxt: { fontSize: 13, fontWeight: '800' },
  filtroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
    borderColor: '#d0dde0',
  },
  filtroDot: { width: 8, height: 8, borderRadius: 4 },
  filtroTxt: { fontSize: 12, fontWeight: '700' },

  leyenda: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderTopWidth: 0,
  },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaDot: { width: 10, height: 10, borderRadius: 5 },
  leyendaTxt: { fontSize: 11, fontWeight: '600' },
  leyendaSep: { width: 1, height: 14 },
  leyendaTotal: { fontSize: 11, marginLeft: 'auto' as any },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTxt: { marginTop: 12, fontSize: 13 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
})
