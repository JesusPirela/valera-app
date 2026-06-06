import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'

export type ZonaPin = {
  key: string
  label: string
  coords: [number, number]
  count: number
  color: string
  propiedades?: { direccion: string; lat?: number | null; lng?: number | null }[]
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

type PropiedadCoord = {
  lat: number
  lng: number
  direccion: string
  zona: string | null
}

type Props = {
  zonas: ZonaPin[]
  onZonaPress: (key: string) => void
  propiedadesConCoords?: PropiedadCoord[]
}

export default function MiniMapa({ zonas, onZonaPress, propiedadesConCoords = [] }: Props) {
  const containerRef  = useRef<any>(null)
  const mapRef           = useRef<any>(null)
  const markersRef       = useRef<any[]>([])
  const indivMarkersRef  = useRef<any[]>([])
  const backCtrlRef      = useRef<any>(null)
  const drillRef         = useRef<string | null>(null)
  const onPressRef       = useRef(onZonaPress)
  const zonasRef         = useRef(zonas)
  const coordsRef        = useRef(propiedadesConCoords)
  onPressRef.current     = onZonaPress
  zonasRef.current       = zonas
  coordsRef.current      = propiedadesConCoords

  function clearMarkers() {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }

  function renderIndivPins(L: any, map: any, props: PropiedadCoord[]) {
    indivMarkersRef.current.forEach(m => m.remove())
    indivMarkersRef.current = []
    props.forEach(p => {
      const zonaConf = CITY_VIEW[p.zona ?? '']
      const color = zonas.find(z => z.key === p.zona)?.color ?? '#1976D2'
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      })
      const m = L.marker([p.lat, p.lng], { icon })
        .addTo(map)
        .bindTooltip(p.direccion, { direction: 'top', offset: [0, -8] })
      indivMarkersRef.current.push(m)
    })
  }

  function pinHTML(count: number, color: string, size: number) {
    const fs = size >= 50 ? 15 : 13
    return `<div style="background:${color};color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fs}px;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:3px solid #fff;cursor:pointer">${count}</div>`
  }

  function showMexico(L: any, map: any) {
    drillRef.current = null
    if (backCtrlRef.current) { backCtrlRef.current.remove(); backCtrlRef.current = null }
    clearMarkers()
    map.flyTo([22.5, -102.55], 5, { duration: 0.8 })
    renderCityPins(L, map, zonasRef.current)
    renderIndivPins(L, map, coordsRef.current)
  }

  function renderCityPins(L: any, map: any, data: ZonaPin[]) {
    clearMarkers()
    data.forEach(z => {
      const icon = L.divIcon({ className: '', html: pinHTML(z.count, z.color, 52), iconSize: [52, 52], iconAnchor: [26, 26] })
      const m = L.marker(z.coords, { icon })
        .addTo(map)
        .bindTooltip(`<b>${z.label}</b><br/>${z.count} propiedad${z.count !== 1 ? 'es' : ''}`, { direction: 'top', offset: [0, -30] })
        .on('click', () => {
          onPressRef.current(z.key)
          if (CITY_VIEW[z.key] && SUBZONAS[z.key]) drillIntoCity(L, map, z)
        })
      markersRef.current.push(m)
    })
  }

  function drillIntoCity(L: any, map: any, zona: ZonaPin) {
    drillRef.current = zona.key
    const view = CITY_VIEW[zona.key]
    map.flyTo(view.center, view.zoom, { duration: 0.8 })
    clearMarkers()

    if (!backCtrlRef.current) {
      const Ctrl = L.Control.extend({
        onAdd() {
          const btn = L.DomUtil.create('button', '')
          btn.innerHTML = '← Volver'
          btn.style.cssText = 'background:#1976D2;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.25);margin:8px'
          L.DomEvent.on(btn, 'click', (e: Event) => { L.DomEvent.stopPropagation(e); showMexico(L, map) })
          return btn
        },
        onRemove() {},
      })
      backCtrlRef.current = new Ctrl({ position: 'topleft' })
      backCtrlRef.current.addTo(map)
    }

    const props = zona.propiedades ?? []
    const propsConCoords = props.filter(p => p.lat && p.lng)
    const propsSinCoords = props.filter(p => !p.lat || !p.lng)

    // Propiedades con coordenadas exactas → pin individual
    propsConCoords.forEach(p => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${zona.color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const m = L.marker([p.lat!, p.lng!], { icon })
        .addTo(map)
        .bindTooltip(p.direccion, { direction: 'top', offset: [0, -10] })
      markersRef.current.push(m)
    })

    // Propiedades sin coordenadas → agrupar por sub-zona con keywords
    if (propsSinCoords.length > 0) {
      const subZonas = SUBZONAS[zona.key] ?? []
      const matched = new Set<number>()
      const subZonasConConteo = subZonas.map(sz => {
        const indices: number[] = []
        propsSinCoords.forEach((p, i) => {
          if (sz.keywords.some(kw => p.direccion.toLowerCase().includes(kw.toLowerCase()))) {
            indices.push(i); matched.add(i)
          }
        })
        return { ...sz, count: indices.length }
      }).filter(sz => sz.count > 0)

      const otrasCount = propsSinCoords.filter((_, i) => !matched.has(i)).length
      const toRender = [...subZonasConConteo]
      if (otrasCount > 0) toRender.push({ label: 'Sin ubicación exacta', coords: view.center, keywords: [], count: otrasCount })
      if (toRender.length === 0 && propsConCoords.length === 0)
        toRender.push({ label: zona.label, coords: view.center, keywords: [], count: zona.count })

      toRender.forEach(sz => {
        const icon = L.divIcon({ className: '', html: pinHTML(sz.count, zona.color, 44), iconSize: [44, 44], iconAnchor: [22, 22] })
        const m = L.marker(sz.coords, { icon })
          .addTo(map)
          .bindTooltip(`<b>${sz.label}</b><br/>${sz.count} propiedad${sz.count !== 1 ? 'es' : ''}`, { direction: 'top', offset: [0, -26] })
        markersRef.current.push(m)
      })
    }
  }

  function initMap(L: any) {
    const el = containerRef.current as unknown as HTMLElement
    if (!el || mapRef.current) return
    const map = L.map(el, { center: [22.5, -102.55], zoom: 5, attributionControl: false })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
    renderCityPins(L, map, zonasRef.current)
    renderIndivPins(L, map, coordsRef.current)
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

    tryInit()

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markersRef.current = []; backCtrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const L = (window as any).L
    if (!L || !mapRef.current || drillRef.current) return
    renderCityPins(L, mapRef.current, zonas)
  }, [zonas])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const L = (window as any).L
    if (!L || !mapRef.current || drillRef.current) return
    renderIndivPins(L, mapRef.current, propiedadesConCoords)
  }, [propiedadesConCoords])

  if (Platform.OS !== 'web') return null

  return (
    <View
      ref={containerRef}
      style={{ height: 450, borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#dde8ee' }}
    />
  )
}
