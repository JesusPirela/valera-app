import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput, ScrollView } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

export type ZonaPin = {
  key: string
  label: string
  coords: [number, number]
  count: number
  color: string
  propiedades?: {
    id: string
    titulo: string
    precio: number | null
    tipo: string | null
    direccion: string
    lat?: number | null
    lng?: number | null
    imagen?: string | null
  }[]
}

export type PropiedadCoord = {
  id: string
  lat: number
  lng: number
  direccion: string
  zona: string | null
  titulo: string
  precio: number | null
  tipo: string | null
}

const SUBZONAS: Record<string, { label: string; coords: [number, number]; keywords: string[] }[]> = {
  queretaro: [
    { label: 'Corregidora',      coords: [20.5167, -100.4417], keywords: ['corregidora'] },
    { label: 'Juriquilla',       coords: [20.7050, -100.4550], keywords: ['juriquilla'] },
    { label: 'El Marqués',       coords: [20.6167, -100.2800], keywords: ['marqués', 'marques', 'el marqués', 'el marques'] },
    { label: 'San Juan del Río', coords: [20.3833, -99.9833],  keywords: ['san juan del río', 'san juan del rio', 'san juan'] },
    { label: 'Tequisquiapan',    coords: [20.5167, -99.8833],  keywords: ['tequisquiapan', 'tequis'] },
    { label: 'Centro Sur',       coords: [20.5650, -100.3850], keywords: ['centro sur'] },
    { label: 'Zibatá',           coords: [20.6800, -100.3400], keywords: ['zibatá', 'zibata'] },
    { label: 'El Refugio',       coords: [20.6300, -100.3700], keywords: ['el refugio', 'refugio'] },
    { label: 'Candiles',         coords: [20.6100, -100.4200], keywords: ['candiles'] },
    { label: 'Constituyentes',   coords: [20.5950, -100.4100], keywords: ['constituyentes'] },
    { label: 'Cumbres',          coords: [20.6500, -100.4300], keywords: ['cumbres'] },
    { label: 'Milenio',          coords: [20.5750, -100.4200], keywords: ['milenio'] },
    { label: 'Santa Fe',         coords: [20.5500, -100.4100], keywords: ['santa fe'] },
    { label: 'Interlomas',       coords: [20.6950, -100.4600], keywords: ['interlomas'] },
    { label: 'Pedregal',         coords: [20.5400, -100.4000], keywords: ['pedregal'] },
    { label: 'Centro',           coords: [20.5881, -100.3900], keywords: ['centro histórico', 'centro historico', 'centro'] },
  ],
  monterrey: [
    { label: 'San Pedro G.G.',   coords: [25.6500, -100.4000], keywords: ['san pedro', 'garza garcia', 'garza garcía'] },
    { label: 'Santa Catarina',   coords: [25.6731, -100.4569], keywords: ['santa catarina'] },
    { label: 'Guadalupe',        coords: [25.6739, -100.2533], keywords: ['guadalupe'] },
    { label: 'Apodaca',          coords: [25.7847, -100.1875], keywords: ['apodaca'] },
    { label: 'San Nicolás',      coords: [25.7444, -100.3036], keywords: ['san nicolás', 'san nicolas'] },
    { label: 'Escobedo',         coords: [25.7978, -100.3336], keywords: ['escobedo'] },
    { label: 'Centro MTY',       coords: [25.6866, -100.3161], keywords: ['centro'] },
  ],
  puebla: [
    { label: 'Cholula',          coords: [19.0556, -98.3014],  keywords: ['cholula', 'san andrés', 'san andres'] },
    { label: 'Angelópolis',      coords: [19.0167, -98.2500],  keywords: ['angelópolis', 'angelopolis'] },
    { label: 'Atlixco',          coords: [18.9083, -98.4386],  keywords: ['atlixco'] },
    { label: 'Tehuacán',         coords: [18.4617, -97.3939],  keywords: ['tehuacán', 'tehuacan'] },
    { label: 'Centro Puebla',    coords: [19.0414, -98.2063],  keywords: ['centro'] },
  ],
}

const CITY_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  queretaro: { center: [20.57,  -100.35], zoom: 10 },
  monterrey: { center: [25.72,  -100.35], zoom: 10 },
  puebla:    { center: [19.05,  -98.26],  zoom: 10 },
}

type Props = {
  zonas: ZonaPin[]
  onZonaPress: (key: string) => void
  propiedadesConCoords?: PropiedadCoord[]
  onPropiedadPress?: (id: string) => void
}

type PinData = { id: string; titulo: string; precio: number | null; tipo: string | null; direccion: string; imagen?: string | null; lat: number; lng: number; color: string }
type PinGroup = { key: string; lat: number; lng: number; color: string; pins: PinData[] }
type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

const PINS_VISIBLE_THRESHOLD = 0.12
const MEXICO_REGION = { latitude: 22.5, longitude: -102.55, latitudeDelta: 18, longitudeDelta: 18 }

export default function MiniMapa({ zonas, onZonaPress, onPropiedadPress }: Props) {
  const nativeMapRef = useRef<InstanceType<typeof MapView>>(null)
  const [selectedZona, setSelectedZona] = useState<string | null>(null)
  const [mapRegion, setMapRegion] = useState<MapRegion>(MEXICO_REGION)
  const [searchText, setSearchText] = useState('')
  const [pinsReady, setPinsReady] = useState(false)
  const [selectedPin, setSelectedPin] = useState<PinData | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<PinGroup | null>(null)

  const pinsCurrentlyVisible = mapRegion.latitudeDelta < PINS_VISIBLE_THRESHOLD || searchText.trim().length > 0

  useEffect(() => {
    if (pinsCurrentlyVisible) {
      setPinsReady(false)
      const t = setTimeout(() => setPinsReady(true), 350)
      return () => clearTimeout(t)
    } else {
      setPinsReady(false)
    }
  }, [pinsCurrentlyVisible, selectedZona, searchText])

  useEffect(() => {
    if (!selectedZona || !searchText.trim()) return
    const term = searchText.toLowerCase().trim()
    const timer = setTimeout(() => {
      const subzonas = SUBZONAS[selectedZona] ?? []
      const sub = subzonas.find(s =>
        s.label.toLowerCase().includes(term) ||
        (s.keywords ?? []).some(k => k.includes(term))
      )
      if (sub) {
        nativeMapRef.current?.animateToRegion(
          { latitude: sub.coords[0], longitude: sub.coords[1], latitudeDelta: 0.04, longitudeDelta: 0.04 },
          500
        )
        return
      }
      const zona = zonas.find(z => z.key === selectedZona)
      const matched = (zona?.propiedades ?? []).filter(p =>
        p.lat != null && p.lng != null && (
          (p.direccion ?? '').toLowerCase().includes(term) ||
          (p.titulo ?? '').toLowerCase().includes(term)
        )
      )
      if (matched.length > 0) {
        const avgLat = matched.reduce((s, p) => s + p.lat!, 0) / matched.length
        const avgLng = matched.reduce((s, p) => s + p.lng!, 0) / matched.length
        nativeMapRef.current?.animateToRegion(
          { latitude: avgLat, longitude: avgLng, latitudeDelta: 0.04, longitudeDelta: 0.04 },
          500
        )
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchText, selectedZona])

  const zonaActual = selectedZona ? zonas.find(z => z.key === selectedZona) : null
  const pinsVisible = mapRegion.latitudeDelta < PINS_VISIBLE_THRESHOLD || searchText.trim().length > 0

  const term = searchText.toLowerCase().trim()
  const pad = 0.6
  const minLat = mapRegion.latitude - mapRegion.latitudeDelta * (0.5 + pad)
  const maxLat = mapRegion.latitude + mapRegion.latitudeDelta * (0.5 + pad)
  const minLng = mapRegion.longitude - mapRegion.longitudeDelta * (0.5 + pad)
  const maxLng = mapRegion.longitude + mapRegion.longitudeDelta * (0.5 + pad)

  const pinsEnMapa = zonaActual
    ? (zonaActual.propiedades ?? [])
        .filter(p => {
          if (p.lat == null || p.lng == null) return false
          if (term && !(
            (p.direccion ?? '').toLowerCase().includes(term) ||
            (p.titulo ?? '').toLowerCase().includes(term)
          )) return false
          if (!term && pinsVisible) {
            return p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng
          }
          return true
        })
        .map(p => ({ ...p, lat: p.lat!, lng: p.lng!, color: zonaActual.color }))
    : []

  const totalConCoords = zonaActual
    ? (zonaActual.propiedades ?? []).filter(p => p.lat != null && p.lng != null).length
    : 0
  const sinCoords = zonaActual
    ? (zonaActual.propiedades ?? []).length - totalConCoords
    : 0

  const handleZonaPress = (key: string) => {
    setSelectedZona(key)
    setSelectedPin(null)
    onZonaPress(key)
    const cv = CITY_VIEW[key]
    if (cv) {
      nativeMapRef.current?.animateToRegion(
        { latitude: cv.center[0], longitude: cv.center[1], latitudeDelta: 0.08, longitudeDelta: 0.08 },
        700
      )
    }
  }

  const handleBackToMexico = () => {
    setSelectedZona(null)
    setSelectedPin(null)
    setSearchText('')
    onZonaPress('')
    nativeMapRef.current?.animateToRegion(MEXICO_REGION, 600)
  }

  return (
    <View style={{ flex: 1 }}>
      {selectedZona && (
        <View style={nS.searchBar}>
          <TouchableOpacity onPress={handleBackToMexico} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={nS.searchBackBtn}>
            <Text style={nS.searchBackTxt}>←</Text>
          </TouchableOpacity>
          <TextInput
            style={nS.searchInput}
            placeholder="Buscar colonia o dirección..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {searchText.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={nS.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : (
            <Text style={nS.searchIcon}>🔍</Text>
          )}
        </View>
      )}

      {selectedZona && !pinsVisible && !selectedPin && (
        <View style={nS.zoomHint}>
          <Text style={nS.zoomHintTxt}>Acerca el mapa para ver las propiedades</Text>
        </View>
      )}

      <MapView
        ref={nativeMapRef}
        provider="google"
        style={{ flex: 1 }}
        initialRegion={MEXICO_REGION}
        showsUserLocation={false}
        onPress={() => { setSelectedPin(null); setSelectedCluster(null) }}
        onRegionChangeComplete={r => setMapRegion(r)}
      >
        {!selectedZona && zonas.map(z => (
          <Marker
            key={z.key}
            coordinate={{ latitude: z.coords[0], longitude: z.coords[1] }}
            onPress={() => handleZonaPress(z.key)}
          >
            <View style={[nS.clusterPin, { backgroundColor: z.color }]}>
              <Text style={nS.clusterTxt}>{z.count}</Text>
            </View>
          </Marker>
        ))}
        {selectedZona && pinsVisible && (() => {
          const groupMap = new Map<string, PinGroup>()
          pinsEnMapa.forEach(p => {
            const gKey = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
            if (!groupMap.has(gKey)) groupMap.set(gKey, { key: gKey, lat: p.lat, lng: p.lng, color: zonaActual!.color, pins: [] })
            groupMap.get(gKey)!.pins.push(p)
          })
          return Array.from(groupMap.values()).map(group => (
            <Marker
              key={group.key}
              coordinate={{ latitude: group.lat, longitude: group.lng }}
              tracksViewChanges={!pinsReady}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                setSelectedPin(null)
                setSelectedCluster(null)
                if (group.pins.length === 1) {
                  setSelectedPin(group.pins[0])
                } else {
                  setSelectedCluster(group)
                }
              }}
            >
              {group.pins.length === 1
                ? <View style={[nS.locationDot, { backgroundColor: group.color }]} />
                : <View style={[nS.propCluster, { backgroundColor: group.color }]}>
                    <Text style={nS.propClusterTxt}>{group.pins.length}</Text>
                  </View>
              }
            </Marker>
          ))
        })()}
      </MapView>

      {selectedPin && (
        <TouchableOpacity
          style={nS.previewCard}
          onPress={() => { onPropiedadPress?.(selectedPin.id); setSelectedPin(null) }}
          activeOpacity={0.85}
        >
          {selectedPin.imagen ? (
            <Image
              source={{ uri: selectedPin.imagen }}
              style={nS.previewImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[nS.previewImg, nS.previewImgPlaceholder]}>
              <Text style={{ fontSize: 28 }}>🏠</Text>
            </View>
          )}
          <View style={nS.previewInfo}>
            <Text style={nS.previewTitulo} numberOfLines={2}>{selectedPin.titulo}</Text>
            <Text style={nS.previewPrecio}>
              {selectedPin.precio
                ? `$${selectedPin.precio.toLocaleString('es-MX')} MXN`
                : 'Precio a consultar'}
            </Text>
            {selectedPin.tipo && (
              <Text style={nS.previewTipo}>{selectedPin.tipo}</Text>
            )}
            <Text style={nS.previewVer}>Ver propiedad →</Text>
          </View>
          <TouchableOpacity style={nS.previewClose} onPress={() => setSelectedPin(null)}>
            <Text style={{ color: '#888', fontSize: 16, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {selectedCluster && !selectedPin && (
        <View style={nS.clusterPanel}>
          <View style={nS.clusterPanelHeader}>
            <Text style={nS.clusterPanelTitle}>{selectedCluster.pins.length} propiedades en esta ubicación</Text>
            <TouchableOpacity onPress={() => setSelectedCluster(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: '#888', fontSize: 16, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
            {selectedCluster.pins.map(p => (
              <TouchableOpacity
                key={p.id}
                style={nS.clusterItem}
                onPress={() => { onPropiedadPress?.(p.id); setSelectedCluster(null) }}
                activeOpacity={0.8}
              >
                {p.imagen
                  ? <Image source={{ uri: p.imagen }} style={nS.clusterItemImg} resizeMode="cover" />
                  : <View style={[nS.clusterItemImg, nS.previewImgPlaceholder]}><Text style={{ fontSize: 22 }}>🏠</Text></View>
                }
                <View style={nS.clusterItemInfo}>
                  <Text style={nS.clusterItemTitulo} numberOfLines={2}>{p.titulo}</Text>
                  <Text style={nS.clusterItemPrecio}>
                    {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'A consultar'}
                  </Text>
                  {p.tipo && <Text style={nS.clusterItemTipo}>{p.tipo}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {selectedZona && pinsVisible && !selectedPin && !selectedCluster && sinCoords > 0 && (
        <View style={nS.sinCoordsTag}>
          <Text style={nS.sinCoordsTxt}>
            {pinsEnMapa.length > 0
              ? `${pinsEnMapa.length} ubicadas · ${sinCoords} sin coords`
              : `${sinCoords} propiedades sin ubicación exacta`}
          </Text>
        </View>
      )}
    </View>
  )
}

const nS = StyleSheet.create({
  clusterPin: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, elevation: 6,
  },
  clusterTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  locationDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 3, borderColor: '#fff',
  },
  propCluster: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  propClusterTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  clusterPanel: {
    position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 12, paddingBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 12,
  },
  clusterPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  clusterPanelTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a2e' },
  clusterItem: {
    width: 140, borderRadius: 10, backgroundColor: '#f7f9fa',
    overflow: 'hidden',
    borderWidth: 1, borderColor: '#e8eef0',
  },
  clusterItemImg: { width: 140, height: 90 },
  clusterItemInfo: { padding: 8 },
  clusterItemTitulo: { fontSize: 11, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  clusterItemPrecio: { fontSize: 12, fontWeight: '700', color: '#1a6470', marginBottom: 2 },
  clusterItemTipo: { fontSize: 10, color: '#888' },
  previewCard: {
    position: 'absolute', bottom: 16, left: 12, right: 12, zIndex: 20,
    backgroundColor: '#fff', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 10,
    overflow: 'hidden',
  },
  previewImg: {
    width: 88, height: 88,
  },
  previewImgPlaceholder: {
    backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center',
  },
  previewInfo: {
    flex: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  previewTitulo: { fontSize: 13, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  previewPrecio: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 2 },
  previewTipo: { fontSize: 11, color: '#888', marginBottom: 4 },
  previewVer: { fontSize: 12, color: '#1a6470', fontWeight: '600', textDecorationLine: 'underline' },
  previewClose: {
    position: 'absolute', top: 8, right: 10,
    padding: 4,
  },
  searchBar: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  searchBackBtn: { paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 },
  searchBackTxt: { fontSize: 20, color: '#1a6470', fontWeight: '700', lineHeight: 22 },
  searchIcon: { fontSize: 15, marginLeft: 4 },
  searchInput: {
    flex: 1, fontSize: 14, color: '#1a1a2e', paddingVertical: 0,
  },
  searchClear: { fontSize: 14, color: '#aaa', marginLeft: 6 },
  zoomHint: {
    position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
  },
  zoomHintTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sinCoordsTag: {
    position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center',
  },
  sinCoordsTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
})
