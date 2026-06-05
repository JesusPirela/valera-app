import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'

export type ZonaPin = {
  key: string
  label: string
  coords: [number, number]
  count: number
  color: string
}

type Props = {
  zonas: ZonaPin[]
  onZonaPress: (key: string) => void
}

export default function MiniMapa({ zonas, onZonaPress }: Props) {
  const mapId = useRef(`mapa-${Math.random().toString(36).slice(2, 8)}`)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const onZonaPressRef = useRef(onZonaPress)
  onZonaPressRef.current = onZonaPress

  const renderMarkers = (L: any, map: any, data: ZonaPin[]) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    data.forEach(z => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${z.color};color:#fff;border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:3px solid #fff;cursor:pointer;flex-direction:column;gap:1px"><span>${z.count}</span></div>`,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      })
      const marker = L.marker(z.coords, { icon })
        .addTo(map)
        .bindTooltip(`<b>${z.label}</b><br/>${z.count} propiedad${z.count !== 1 ? 'es' : ''}`, { direction: 'top', offset: [0, -30] })
        .on('click', () => onZonaPressRef.current(z.key))
      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return

    const init = () => {
      const container = document.getElementById(mapId.current)
      if (!container || mapInstanceRef.current) return
      const L = (window as any).L
      if (!L) return

      const map = L.map(container, {
        center: [22.5, -102.5528],
        zoom: 5,
        attributionControl: false,
        zoomControl: true,
      })
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map)

      renderMarkers(L, map, zonas)
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    if ((window as any).L) {
      setTimeout(init, 50)
    } else if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = () => setTimeout(init, 50)
      document.head.appendChild(script)
    } else {
      const waitForL = setInterval(() => {
        if ((window as any).L) { clearInterval(waitForL); setTimeout(init, 50) }
      }, 100)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      markersRef.current = []
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const L = (window as any).L
    if (!L || !mapInstanceRef.current) return
    renderMarkers(L, mapInstanceRef.current, zonas)
  }, [zonas])

  if (Platform.OS !== 'web') return null

  return (
    <View
      // @ts-ignore nativeID works as id on web
      nativeID={mapId.current}
      style={{ height: 280, borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#dde8ee' }}
    />
  )
}
