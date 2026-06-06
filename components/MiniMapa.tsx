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

// ── Spread non-geocoded props around a center using golden-ratio spiral ──────
function spreadCoords(center: [number, number], count: number): [number, number][] {
  const PHI = (1 + Math.sqrt(5)) / 2
  const baseR = 0.007
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

  function renderGroupedPins(L: any, map: any, items: {coords:[number,number]; p:{id:string;titulo:string;tipo:string|null;precio:number|null;direccion:string}}[], color: string) {
    const groups = new Map<string, typeof items>()
    items.forEach(item => {
      const key = `${item.coords[0]},${item.coords[1]}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    })

    groups.forEach(group => {
      if (group.length === 1) {
        addIndivPin(L, map, group[0].coords, group[0].p, color)
        return
      }

      // Múltiples en el mismo punto → pin numerado, al click se despliegan
      const c = group[0].coords
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer">${group.length}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      })
      const cluster = L.marker(c, { icon }).addTo(map)
        .bindTooltip(`${group.length} propiedades — toca para ver`, { direction: 'top', offset: [0, -18] })
      markersRef.current.push(cluster)

      cluster.on('click', () => {
        // Quitar el cluster
        cluster.remove()
        const idx = markersRef.current.indexOf(cluster)
        if (idx > -1) markersRef.current.splice(idx, 1)
        // Desplegar individuales en pequeño círculo
        const R = 0.0004
        const lngF = 1 / Math.cos(c[0] * Math.PI / 180)
        group.forEach((item, i) => {
          const angle = (2 * Math.PI / group.length) * i - Math.PI / 2
          addIndivPin(L, map, [c[0] + Math.cos(angle) * R, c[1] + Math.sin(angle) * R * lngF], item.p, color)
        })
      })
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

  function addFullscreenBtn(L: any) {
    const fsCtrl = L.Control.extend({
      onAdd(map: any) {
        const btn = L.DomUtil.create('button', '')
        btn.innerHTML = '⛶'
        btn.title = 'Pantalla completa'
        btn.style.cssText = 'background:#fff;color:#333;border:2px solid #ccc;width:34px;height:34px;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);line-height:1'
        L.DomEvent.on(btn, 'click', (e: Event) => {
          L.DomEvent.stopPropagation(e)
          const el = containerRef.current as unknown as HTMLElement
          if (!el) return
          if (!document.fullscreenElement) {
            el.requestFullscreen?.()
            btn.innerHTML = '✕'
          } else {
            document.exitFullscreen?.()
            btn.innerHTML = '⛶'
          }
        })
        document.addEventListener('fullscreenchange', () => {
          btn.innerHTML = document.fullscreenElement ? '✕' : '⛶'
          if (mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 100)
        })
        return btn
      },
      onRemove() {},
    })
    new fsCtrl({ position: 'topright' }).addTo(L._currentMap || mapRef.current)
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

  // ── Level 2: City — todos los pins individuales directamente ────────────────

  function showCity(L: any, map: any, zona: ZonaPin) {
    viewRef.current = 'city'
    cityRef.current = zona.key
    const view = CITY_VIEW[zona.key]
    map.flyTo(view.center, view.zoom, { duration: 0.8 })
    clearMarkers()
    setBackBtn(L, map, 'México', () => showMexico(L, map))

    const props = zona.propiedades ?? []
    const color = zona.color
    const spread = spreadCoords(view.center, props.length)

    const items = props.map((p, i) => ({
      coords: (p.lat && p.lng) ? [p.lat, p.lng] as [number,number] : spread[i],
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
    addFullscreenBtn(L)
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
      style={Platform.OS === 'web'
        ? ({ height: 'calc(100vh - 160px)', width: '100%', borderRadius: 0, overflow: 'hidden', marginBottom: 0, backgroundColor: '#dde8ee' } as any)
        : { height: 520, borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#dde8ee' }
      }
    />
  )
}
