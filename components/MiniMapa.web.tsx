import { useEffect, useRef } from 'react'
import { View } from 'react-native'

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

export default function MiniMapa({ zonas, onZonaPress, onPropiedadPress }: Props) {
  const containerRef     = useRef<any>(null)
  const mapRef           = useRef<any>(null)
  const markersRef       = useRef<any[]>([])
  const backCtrlRef      = useRef<any>(null)
  const expandedGroupRef = useRef<{ clusterMarker: any; indivMarkers: any[] }[]>([])
  const viewRef          = useRef<'mexico' | 'city' | 'subzona'>('mexico')
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

  function propiedadPopup(L: any, p: { id: string; titulo: string; tipo: string | null; precio: number | null; direccion: string }, color: string) {
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

  function addIndivPin(L: any, map: any, coords: [number, number], p: any, color: string): any {
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    const m = L.marker(coords, { icon }).addTo(map).bindPopup(propiedadPopup(L, p, color))
    markersRef.current.push(m)
    return m
  }

  function expandCluster(L: any, map: any, clusterMarker: any, group: { coords: [number, number]; p: any }[], color: string) {
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
    <View
      ref={containerRef}
      style={{ height: 'calc(100vh - 160px)' as any, width: '100%', borderRadius: 0, overflow: 'hidden', marginBottom: 0, backgroundColor: '#dde8ee' }}
    />
  )
}
