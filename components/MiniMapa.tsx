import { useEffect, useRef, useState } from 'react'
import { Platform, View, Text, TouchableOpacity, StyleSheet, Image, TextInput, ScrollView } from 'react-native'
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

// Pseudo-aleatorio determinista por índice (se ve natural, no geométrico)
function seeded(n: number) { const x = Math.sin(n + 1) * 10000; return x - Math.floor(x) }

function naturalSpread(center: [number, number], count: number, R = 0.007): [number, number][] {
  if (count <= 1) return [center]
  const lngFactor = 1 / Math.cos(center[0] * Math.PI / 180)
  return Array.from({ length: count }, (_, i) => {
    const r = R * (0.25 + 0.75 * seeded(i * 3))
    const angle = 2 * Math.PI * seeded(i * 3 + 1)
    return [
      center[0] + Math.cos(angle) * r,
      center[1] + Math.sin(angle) * r * lngFactor,
    ] as [number, number]
  })
}

// Espiral Fibonacci — para expandir cluster al hacer click
function uniformSpread(center: [number, number], count: number): [number, number][] {
  if (count <= 1) return [center]
  const PHI = (1 + Math.sqrt(5)) / 2
  const R = 0.0015
  const lngFactor = 1 / Math.cos(center[0] * Math.PI / 180)
  return Array.from({ length: count }, (_, i) => {
    const angle = 2 * Math.PI * PHI * i
    const r = R * Math.sqrt((i + 1) / count)
    return [
      center[0] + Math.cos(angle) * r,
      center[1] + Math.sin(angle) * r * lngFactor,
    ] as [number, number]
  })
}


export default function MiniMapa({ zonas, onZonaPress, propiedadesConCoords = [], onPropiedadPress }: Props) {
  const containerRef     = useRef<any>(null)
  const mapRef           = useRef<any>(null)
  const markersRef       = useRef<any[]>([])
  const backCtrlRef      = useRef<any>(null)
  const expandedGroupRef = useRef<{ clusterMarker: any; indivMarkers: any[] }[]>([])
  // view levels: 'mexico' | 'city' | 'subzona'
  const viewRef          = useRef<'mexico' | 'city' | 'subzona'>('mexico')
  const cityRef          = useRef<string | null>(null)
  const onPressRef       = useRef(onZonaPress)
  const zonasRef         = useRef(zonas)
  const coordsRef        = useRef(propiedadesConCoords)
  const onPropiedadRef   = useRef(onPropiedadPress)
  onPressRef.current     = onZonaPress
  zonasRef.current       = zonas
  coordsRef.current      = propiedadesConCoords
  onPropiedadRef.current = onPropiedadPress

  // ── helpers ─────────────────────────────────────────────────────────────────

  function clearMarkers() {
    expandedGroupRef.current.forEach(({ indivMarkers }) =>
      indivMarkers.forEach(m => { try { m.remove() } catch {} })
    )
    expandedGroupRef.current = []
    markersRef.current.forEach(m => { try { m.remove() } catch {} })
    markersRef.current = []
    if (mapRef.current) {
      const extras: any[] = []
      mapRef.current.eachLayer((layer: any) => {
        if (layer._latlng !== undefined) extras.push(layer)
      })
      extras.forEach(m => { try { m.remove() } catch {} })
    }
  }

  function clusterHTML(count: number, color: string, size = 52) {
    const fs = size >= 50 ? 15 : 13
    return `<div style="background:${color};color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fs}px;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:3px solid #fff;cursor:pointer">${count}</div>`
  }

  function propiedadPopup(L: any, p: {id:string;titulo:string;tipo:string|null;precio:number|null;direccion:string}, color: string) {
    const tipoLabel: Record<string, string> = { casa: '🏠 Casa', departamento: '🏢 Depto', local: '🏪 Local', terreno: '🏗 Terreno' }
    const precio = p.precio ? `$${p.precio.toLocaleString('es-MX')} MXN` : 'Precio a consultar'
    return L.popup({ maxWidth: 220 }).setContent(
      `<div style="font-family:sans-serif;padding:4px">
        <div style="font-weight:700;font-size:13px;color:#1a1a1a;margin-bottom:4px;line-height:1.3">${p.titulo}</div>
        <div style="font-size:12px;color:#555;margin-bottom:2px">${tipoLabel[p.tipo ?? ''] ?? ''}</div>
        <div style="font-size:13px;font-weight:600;color:${color};margin-bottom:6px">${precio}</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px">📍 ${p.direccion}</div>
        <button onclick="window.__mapaVerPropiedad&&window.__mapaVerPropiedad('${p.id}')"
          style="background:${color};color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;width:100%">
          Ver propiedad →
        </button>
      </div>`
    )
  }

  function addIndivPin(L: any, map: any, coords: [number,number], p: {id:string;titulo:string;tipo:string|null;precio:number|null;direccion:string}, color: string): any {
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    const m = L.marker(coords, { icon }).addTo(map).bindPopup(propiedadPopup(L, p, color))
    markersRef.current.push(m)
    return m
  }

  function expandCluster(L: any, map: any, clusterMarker: any, group: {coords:[number,number]; p: any}[], color: string) {
    // Quitar el cluster del mapa (los individuales quedan hasta volver a México)
    try { clusterMarker.remove() } catch {}

    const center = group[0].coords
    const coords = uniformSpread(center, group.length)
    const indivMarkers: any[] = []

    group.forEach((item, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const m = L.marker(coords[i], { icon }).addTo(map).bindPopup(propiedadPopup(L, item.p, color))
      indivMarkers.push(m)
    })

    expandedGroupRef.current.push({ clusterMarker, indivMarkers })
  }

  // Renderiza pins individuales agrupando los que comparten coordenada exacta
  function renderGroupedPins(L: any, map: any, items: {coords:[number,number]; p: any}[], color: string) {
    const groups = new Map<string, {coords:[number,number]; p: any}[]>()
    items.forEach(item => {
      const key = `${item.coords[0].toFixed(5)},${item.coords[1].toFixed(5)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    })

    groups.forEach((group) => {
      const center = group[0].coords
      if (group.length === 1) {
        addIndivPin(L, map, center, group[0].p, color)
      } else {
        // Pin cluster numerado
        const icon = L.divIcon({
          className: '',
          html: clusterHTML(group.length, color, 44),
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        })
        const m = L.marker(center, { icon }).addTo(map)
        markersRef.current.push(m)
        m.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e)
          expandCluster(L, map, m, group, color)
        })
      }
    })
  }

  function setBackBtn(L: any, map: any, label: string, onClick: () => void) {
    if (backCtrlRef.current) { backCtrlRef.current.remove(); backCtrlRef.current = null }
    const Ctrl = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('button', '')
        btn.innerHTML = `&#8592; Volver a ${label}`
        btn.style.cssText = [
          'background:#1976D2',
          'color:#fff',
          'border:none',
          'padding:10px 18px',
          'border-radius:10px',
          'font-weight:800',
          'font-size:14px',
          'cursor:pointer',
          'box-shadow:0 3px 10px rgba(0,0,0,0.35)',
          'margin:10px',
          'letter-spacing:0.3px',
          'white-space:nowrap',
        ].join(';')
        L.DomEvent.on(btn, 'click', (e: Event) => { L.DomEvent.stopPropagation(e); onClick() })
        return btn
      },
      onRemove() {},
    })
    backCtrlRef.current = new Ctrl({ position: 'topleft' })
    backCtrlRef.current.addTo(map)
  }

  // ── Level 1: Mexico overview ─────────────────────────────────────────────────

  function showMexico(L: any, map: any) {
    viewRef.current = 'mexico'
    cityRef.current = null
    if (backCtrlRef.current) { backCtrlRef.current.remove(); backCtrlRef.current = null }
    clearMarkers()
    map.flyTo([22.5, -102.55], 5, { duration: 0.8 })
    renderCityPins(L, map, zonasRef.current)
  }

  function renderCityPins(L: any, map: any, data: ZonaPin[]) {
    clearMarkers()
    data.forEach(z => {
      const icon = L.divIcon({ className: '', html: clusterHTML(z.count, z.color, 52), iconSize: [52, 52], iconAnchor: [26, 26] })
      const m = L.marker(z.coords, { icon })
        .addTo(map)
        .bindTooltip(`<b>${z.label}</b><br/>${z.count} propiedades`, { direction: 'top', offset: [0, -30] })
        .on('click', () => {
          onPressRef.current(z.key)
          if (CITY_VIEW[z.key]) showCity(L, map, z)
        })
      markersRef.current.push(m)
    })
  }

  // ── Level 2: City — solo pins con coordenadas reales ───────────────────────

  function showCity(L: any, map: any, zona: ZonaPin) {
    viewRef.current = 'city'
    cityRef.current = zona.key
    const view = CITY_VIEW[zona.key]
    map.flyTo(view.center, view.zoom, { duration: 0.8 })
    clearMarkers()
    setBackBtn(L, map, 'México', () => showMexico(L, map))

    const props = zona.propiedades ?? []
    const color = zona.color

    const spread = naturalSpread(view.center, props.length)
    const items = props.map((p, i) => ({
      coords: (p.lat && p.lng) ? [p.lat, p.lng] as [number, number] : spread[i],
      p,
    }))

    renderGroupedPins(L, map, items, color)
  }

  // ── Mount ────────────────────────────────────────────────────────────────────

  function initMap(L: any) {
    const el = containerRef.current as unknown as HTMLElement
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [22.5, -102.55], zoom: 5, attributionControl: false })
    mapRef.current = map
    L._currentMap = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
    renderCityPins(L, map, zonasRef.current)
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return

    if (!document.getElementById('leaflet-css')) {
      const l = document.createElement('link')
      l.id = 'leaflet-css'; l.rel = 'stylesheet'
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(l)
    }

    const tryInit = () => {
      const L = (window as any).L
      if (L) { setTimeout(() => initMap(L), 80); return }
      if (!document.getElementById('leaflet-js')) {
        const s = document.createElement('script')
        s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        s.onload = () => setTimeout(() => initMap((window as any).L), 80)
        document.head.appendChild(s)
      } else {
        const t = setInterval(() => { if ((window as any).L) { clearInterval(t); setTimeout(() => initMap((window as any).L), 80) } }, 100)
      }
    }

    tryInit();

    ;(window as any).__mapaVerPropiedad = (id: string) => onPropiedadRef.current?.(id)

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markersRef.current = []; backCtrlRef.current = null; expandedGroupRef.current = []
      delete (window as any).__mapaVerPropiedad
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const L = (window as any).L
    if (!L || !mapRef.current || viewRef.current !== 'mexico') return
    renderCityPins(L, mapRef.current, zonas)
  }, [zonas])

  // ── Render nativo (iOS / Android) ───────────────────────────────────────────
  type PinData = { id: string; titulo: string; precio: number | null; tipo: string | null; direccion: string; imagen?: string | null; lat: number; lng: number; color: string }
  type PinGroup = { key: string; lat: number; lng: number; color: string; pins: PinData[] }

  const nativeMapRef = useRef<InstanceType<typeof MapView>>(null)
  const [selectedZona, setSelectedZona] = useState<string | null>(null)
  const [latDelta, setLatDelta] = useState(18)
  const [searchText, setSearchText] = useState('')
  const [pinsReady, setPinsReady] = useState(false)
  const [selectedPin, setSelectedPin] = useState<PinData | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<PinGroup | null>(null)

  // pins solo visibles cuando el zoom es de nivel colonia (~600m de vista)
  const PINS_VISIBLE_THRESHOLD = 0.12

  // tracksViewChanges: true al montar → Views renderizan bitmap correcto → false a los 350ms
  // Resetea a false cuando los pins desaparecen para el próximo ciclo
  const pinsCurrentlyVisible = latDelta < PINS_VISIBLE_THRESHOLD || searchText.trim().length > 0
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (pinsCurrentlyVisible) {
      setPinsReady(false)
      const t = setTimeout(() => setPinsReady(true), 350)
      return () => clearTimeout(t)
    } else {
      setPinsReady(false)
    }
  }, [pinsCurrentlyVisible, selectedZona, searchText])

  // Búsqueda con debounce: navega a subzona o al centroide de propiedades que coincidan
  useEffect(() => {
    if (Platform.OS === 'web' || !selectedZona || !searchText.trim()) return
    const term = searchText.toLowerCase().trim()
    const timer = setTimeout(() => {
      // 1. Buscar en SUBZONAS por nombre o keyword
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
      // 2. Buscar por direccion/titulo de propiedades con coords reales
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

  if (Platform.OS !== 'web') {
    const MEXICO_REGION = { latitude: 22.5, longitude: -102.55, latitudeDelta: 18, longitudeDelta: 18 }
    const zonaActual = selectedZona ? zonas.find(z => z.key === selectedZona) : null
    // con búsqueda activa, mostrar pins aunque el zoom no sea suficiente (la animación ya los acerca)
    const pinsVisible = latDelta < PINS_VISIBLE_THRESHOLD || searchText.trim().length > 0

    const term = searchText.toLowerCase().trim()
    const pinsEnMapa = zonaActual
      ? (zonaActual.propiedades ?? [])
          .filter(p => {
            if (p.lat == null || p.lng == null) return false
            if (!term) return true
            return (p.direccion ?? '').toLowerCase().includes(term) ||
                   (p.titulo ?? '').toLowerCase().includes(term)
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
          onRegionChangeComplete={r => setLatDelta(r.latitudeDelta)}
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
            // Agrupar pins por coordenada aproximada (4 decimales ≈ 10m)
            const groupMap = new Map<string, PinGroup>()
            pinsEnMapa.slice(0, 80).forEach(p => {
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

  return (
    <View
      ref={containerRef}
      style={{ height: 'calc(100vh - 160px)' as any, width: '100%', borderRadius: 0, overflow: 'hidden', marginBottom: 0, backgroundColor: '#dde8ee' }}
    />
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
