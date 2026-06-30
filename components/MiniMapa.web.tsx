import { useEffect, useRef, useState } from 'react'
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'

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
    pinColor?: string   // sobreescribe el color de zona para este pin específico
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

type SheetPin = { id: string; titulo: string; precio: number | null; tipo: string | null; direccion: string; imagen?: string | null }

export default function MiniMapa({ zonas, onZonaPress, onPropiedadPress }: Props) {
  const containerRef     = useRef<any>(null)
  const mapRef           = useRef<any>(null)
  const markersRef       = useRef<any[]>([])
  const backCtrlRef      = useRef<any>(null)
  const expandedGroupRef = useRef<{ clusterMarker: any; indivMarkers: any[] }[]>([])
  const viewRef          = useRef<'mexico' | 'city' | 'subzona'>('mexico')
  // Panel inferior con las propiedades de un grupo (en vez de dispersar los
  // pines): replica la UX de la app nativa ("N propiedades en esta ubicación").
  const [selectedCluster, setSelectedCluster] = useState<{ color: string; pins: SheetPin[] } | null>(null)
  // Scroll horizontal del panel: en web el mouse no arrastra, así que se navega
  // con flechas. Guardamos el ref, la posición y si el contenido desborda.
  const sheetScrollRef = useRef<any>(null)
  const sheetScrollX   = useRef(0)
  const sheetViewW     = useRef(0)
  const sheetContentW  = useRef(0)
  const [sheetCanScroll, setSheetCanScroll] = useState(false)
  function recalcSheetScroll() {
    setSheetCanScroll(sheetContentW.current > sheetViewW.current + 8)
  }

  function scrollSheet(dir: 1 | -1) {
    const step = 160 * 3 // ~3 tarjetas (150 ancho + 10 gap)
    const next = Math.max(0, sheetScrollX.current + dir * step)
    sheetScrollRef.current?.scrollTo({ x: next, animated: true })
  }
  const cityRef          = useRef<string | null>(null)
  const onPressRef       = useRef(onZonaPress)
  const zonasRef         = useRef(zonas)
  const onPropiedadRef   = useRef(onPropiedadPress)
  onPressRef.current     = onZonaPress
  zonasRef.current       = zonas
  onPropiedadRef.current = onPropiedadPress

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

  function propiedadPopup(L: any, p: { id: string; titulo: string; tipo: string | null; precio: number | null; direccion: string; imagen?: string | null }, color: string) {
    const tipoLabel: Record<string, string> = { casa: '🏠 Casa', departamento: '🏢 Depto', local: '🏪 Local', terreno: '🏗 Terreno' }
    const precio = p.precio ? `$${p.precio.toLocaleString('es-MX')} MXN` : 'Precio a consultar'
    const imagenHTML = p.imagen
      ? `<div style="width:100%;height:110px;border-radius:8px;overflow:hidden;margin-bottom:6px"><img src="${p.imagen}" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`
      : ''
    return L.popup({ maxWidth: 220 }).setContent(
      `<div style="font-family:sans-serif;padding:4px">
        ${imagenHTML}
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

  function addIndivPin(L: any, map: any, coords: [number, number], p: any, color: string): any {
    const c = p.pinColor ?? color
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${c};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    const m = L.marker(coords, { icon }).addTo(map).bindPopup(propiedadPopup(L, p, c))
    markersRef.current.push(m)
    return m
  }

  function renderGroupedPins(L: any, map: any, items: { coords: [number, number]; p: any }[], color: string) {
    const groups = new Map<string, { coords: [number, number]; p: any }[]>()
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
          // En vez de dispersar los pines, mostrar el panel inferior con la
          // lista de propiedades de esta ubicación (igual que en la app nativa).
          setSelectedCluster({ color, pins: group.map(g => g.p as SheetPin) })
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

  function initMap(L: any) {
    const el = containerRef.current as unknown as HTMLElement
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [22.5, -102.55], zoom: 5, attributionControl: false })
    mapRef.current = map
    L._currentMap = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
    // Tocar el mapa (fuera de un cluster) cierra el panel inferior.
    map.on('click', () => setSelectedCluster(null))
    renderCityPins(L, map, zonasRef.current)
  }

  useEffect(() => {
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
    const L = (window as any).L
    if (!L || !mapRef.current || viewRef.current !== 'mexico') return
    renderCityPins(L, mapRef.current, zonas)
  }, [zonas])

  return (
    <View style={{ position: 'relative', height: 'calc(100vh - 160px)' as any, width: '100%' }}>
      <View
        ref={containerRef}
        style={{ height: '100%', width: '100%', overflow: 'hidden', backgroundColor: '#dde8ee' }}
      />

      {selectedCluster && (
        <View style={webS.sheet}>
          <View style={webS.sheetHeader}>
            <Text style={webS.sheetTitle}>{selectedCluster.pins.length} propiedades en esta ubicación</Text>
            <TouchableOpacity onPress={() => setSelectedCluster(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={webS.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ position: 'relative' }}>
            <ScrollView
              ref={sheetScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => { sheetScrollX.current = e.nativeEvent.contentOffset.x }}
              onLayout={(e) => { sheetViewW.current = e.nativeEvent.layout.width; recalcSheetScroll() }}
              onContentSizeChange={(w) => { sheetContentW.current = w; recalcSheetScroll() }}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
            >
              {selectedCluster.pins.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={webS.card}
                  onPress={() => { onPropiedadRef.current?.(p.id); setSelectedCluster(null) }}
                  activeOpacity={0.8}
                >
                  {p.imagen
                    ? <Image source={{ uri: p.imagen }} style={webS.cardImg} resizeMode="cover" />
                    : <View style={[webS.cardImg, webS.cardImgPlaceholder]}><Text style={{ fontSize: 22 }}>🏠</Text></View>
                  }
                  <View style={webS.cardInfo}>
                    <Text style={webS.cardTitle} numberOfLines={2}>{p.titulo}</Text>
                    <Text style={[webS.cardPrice, { color: selectedCluster.color }]}>
                      {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : 'A consultar'}
                    </Text>
                    {p.tipo ? <Text style={webS.cardTipo}>{p.tipo}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Flechas para recorrer las tarjetas (en web el mouse no arrastra
                el scroll horizontal; sin esto no se llega a las de la derecha). */}
            {sheetCanScroll && (
              <>
                <TouchableOpacity style={[webS.sheetArrow, { left: 4 }]} onPress={() => scrollSheet(-1)} activeOpacity={0.85}>
                  <Text style={webS.sheetArrowTxt}>‹</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[webS.sheetArrow, { right: 4 }]} onPress={() => scrollSheet(1)} activeOpacity={0.85}>
                  <Text style={webS.sheetArrowTxt}>›</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

const webS = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 1000,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 12, paddingBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  sheetTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  sheetArrow: {
    position: 'absolute', top: 38,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
    // @ts-ignore — cursor solo aplica en web
    cursor: 'pointer',
  },
  sheetArrowTxt: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26, marginTop: -2 },
  sheetClose: { color: '#888', fontSize: 16, fontWeight: '700' },
  card: {
    width: 150, borderRadius: 10, backgroundColor: '#f7f9fa',
    overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef0',
    cursor: 'pointer' as any,
  },
  cardImg: { width: 150, height: 96 },
  cardImgPlaceholder: { backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center' },
  cardInfo: { padding: 8 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  cardPrice: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  cardTipo: { fontSize: 10, color: '#888' },
})
