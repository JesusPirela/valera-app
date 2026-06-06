import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'

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

// ── Spread non-geocoded props around a center using golden-ratio spiral ──────
function spreadCoords(center: [number, number], count: number): [number, number][] {
  const PHI = (1 + Math.sqrt(5)) / 2
  const baseR = 0.012
  const lngFactor = 1 / Math.cos(center[0] * Math.PI / 180)
  return Array.from({ length: count }, (_, i) => {
    const angle = 2 * Math.PI * PHI * i
    const r = baseR * Math.sqrt((i + 1) / count)
    return [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r * lngFactor] as [number, number]
  })
}

export default function MiniMapa({ zonas, onZonaPress, propiedadesConCoords = [], onPropiedadPress }: Props) {
  const containerRef     = useRef<any>(null)
  const mapRef           = useRef<any>(null)
  const markersRef       = useRef<any[]>([])
  const backCtrlRef      = useRef<any>(null)
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
    markersRef.current.forEach(m => { try { m.remove() } catch {} })
    markersRef.current = []
    // Eliminar cualquier marker que haya escapado del ref (ej. el que fue clickeado)
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

  function addIndivPin(L: any, map: any, coords: [number,number], p: {id:string;titulo:string;tipo:string|null;precio:number|null;direccion:string}, color: string) {
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    const m = L.marker(coords, { icon }).addTo(map).bindPopup(propiedadPopup(L, p, color))
    markersRef.current.push(m)
  }

  function setBackBtn(L: any, map: any, label: string, onClick: () => void) {
    if (backCtrlRef.current) { backCtrlRef.current.remove(); backCtrlRef.current = null }
    const Ctrl = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('button', '')
        btn.innerHTML = `← ${label}`
        btn.style.cssText = 'background:#1976D2;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.25);margin:8px'
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

  // ── Level 2: City — sub-zone clusters ────────────────────────────────────────

  function showCity(L: any, map: any, zona: ZonaPin) {
    viewRef.current = 'city'
    cityRef.current = zona.key
    const view = CITY_VIEW[zona.key]
    map.flyTo(view.center, view.zoom, { duration: 0.8 })
    clearMarkers()
    setBackBtn(L, map, 'México', () => showMexico(L, map))

    const props = zona.propiedades ?? []
    const subZonas = SUBZONAS[zona.key] ?? []
    const matched = new Set<number>()

    // Build sub-zone clusters
    const clusters = subZonas.map(sz => {
      const matching: typeof props = []
      props.forEach((p, i) => {
        if (sz.keywords.some(kw => p.direccion.toLowerCase().includes(kw.toLowerCase()))) {
          matching.push(p); matched.add(i)
        }
      })
      return { ...sz, matching }
    }).filter(c => c.matching.length > 0)

    const otras = props.filter((_, i) => !matched.has(i))
    if (otras.length > 0) clusters.push({ label: 'Sin zona específica', coords: view.center, keywords: [], matching: otras })

    // Also show geocoded pins directly (they have exact coords)
    const geocodedInCity = coordsRef.current.filter(p => p.zona === zona.key)
    geocodedInCity.forEach(p => addIndivPin(L, map, [p.lat, p.lng], p, zona.color))

    // Show cluster pins
    const color = zona.color
    clusters.forEach(c => {
      const icon = L.divIcon({ className: '', html: clusterHTML(c.matching.length, color, 44), iconSize: [44, 44], iconAnchor: [22, 22] })
      const m = L.marker(c.coords, { icon })
        .addTo(map)
        .bindTooltip(`<b>${c.label}</b><br/>${c.matching.length} propiedades`, { direction: 'top', offset: [0, -26] })
        .on('click', () => showSubZona(L, map, c, color, zona))
      markersRef.current.push(m)
    })

    if (clusters.length === 0 && geocodedInCity.length === 0) {
      // No sub-zones matched — show all as individual spread pins
      const spread = spreadCoords(view.center, props.length)
      props.forEach((p, i) => addIndivPin(L, map, spread[i], { id: '', titulo: p.direccion, tipo: null, precio: null, direccion: p.direccion }, color))
    }
  }

  // ── Level 3: Sub-zone — individual pins ──────────────────────────────────────

  function showSubZona(L: any, map: any, cluster: {label:string;coords:[number,number];matching:ZonaPin['propiedades']}, color: string, zona: ZonaPin) {
    viewRef.current = 'subzona'
    clearMarkers()
    map.flyTo(cluster.coords, 13, { duration: 0.8 })
    setBackBtn(L, map, zona.label, () => showCity(L, map, zona))

    const matching = cluster.matching ?? []
    const spread = spreadCoords(cluster.coords, matching.length)

    matching.forEach((p, i) => {
      const coords: [number, number] = (p.lat && p.lng) ? [p.lat, p.lng] : spread[i]
      addIndivPin(L, map, coords, p, color)
    })
  }

  // ── Mount ────────────────────────────────────────────────────────────────────

  function initMap(L: any) {
    const el = containerRef.current as unknown as HTMLElement
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [22.5, -102.55], zoom: 5, attributionControl: false })
    mapRef.current = map
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
      markersRef.current = []; backCtrlRef.current = null
      delete (window as any).__mapaVerPropiedad
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const L = (window as any).L
    if (!L || !mapRef.current || viewRef.current !== 'mexico') return
    renderCityPins(L, mapRef.current, zonas)
  }, [zonas])

  if (Platform.OS !== 'web') return null

  return (
    <View
      ref={containerRef}
      style={{ height: 450, borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#dde8ee' }}
    />
  )
}
