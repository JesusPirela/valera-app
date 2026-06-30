import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import MiniMapa from '../../components/MiniMapa'
import type { ZonaPin } from '../../components/MiniMapa'

type PropMapa = {
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
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroLona = 'todas' | 'contactadas' | 'no_contactadas'

const TEAL  = '#1a6470'
const VERDE = '#22a35e'  // lonas contactadas
const ROJO  = '#e53935'  // lonas no contactadas

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro', coords: [20.5888, -100.3899] as [number, number], color: TEAL },
  { key: 'monterrey', label: 'Monterrey', coords: [25.6866, -100.3161] as [number, number], color: TEAL },
  { key: 'puebla',    label: 'Puebla',    coords: [19.0414, -98.2063]  as [number, number], color: TEAL },
]

export default function Mapa() {
  const c = useColors()
  const [propiedades, setPropiedades] = useState<PropMapa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroLona>('todas')

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, tipo, direccion, zona, lat, lng, lona_contactada, propiedad_imagenes(url, orden)')
      .eq('estado', 'disponible')
      .eq('es_inventario', false)
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    setPropiedades((data ?? []) as PropMapa[])
    setLoading(false)
  }

  const propsFiltradas = propiedades.filter(p => {
    if (filtro === 'contactadas')    return p.lona_contactada === true
    if (filtro === 'no_contactadas') return p.lona_contactada === false
    return true
  })

  const zonasParaMapa: ZonaPin[] = ZONAS_CONFIG.map(z => {
    const propsZona = propsFiltradas.filter(p => p.zona === z.key)
    // Color del pin depende del filtro y de lona_contactada
    return {
      key: z.key,
      label: z.label,
      coords: z.coords,
      color: filtro === 'contactadas' ? VERDE : filtro === 'no_contactadas' ? ROJO : z.color,
      count: propsZona.length,
      propiedades: propsZona.map(p => ({
        id: p.id,
        titulo: p.titulo,
        precio: p.precio,
        tipo: p.tipo,
        direccion: p.direccion,
        lat: p.lat,
        lng: p.lng,
        imagen: thumb(
          [...(p.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]?.url,
          { width: 320, quality: 60 }
        ) ?? null,
        // pinColor solo cuando se muestra "todas" para distinguir visualmente
        pinColor: filtro === 'todas'
          ? (p.lona_contactada ? VERDE : ROJO)
          : undefined,
      })),
    }
  }).filter(z => z.count > 0)

  // Propiedades sin zona asignada
  const sinZona = propsFiltradas.filter(p => !p.zona)

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Filtros */}
      <View style={[s.filtrosBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
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
            {propsFiltradas.filter(p => p.lona_contactada).length}✓ / {propsFiltradas.filter(p => !p.lona_contactada).length}✗
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
              : 'No hay propiedades con ubicación registrada.'}
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
    borderBottomWidth: 1,
  },
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
