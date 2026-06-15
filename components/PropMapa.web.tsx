import { useEffect, useRef } from 'react'
import { View } from 'react-native'

type Props = { lat: number; lng: number; titulo?: string; height?: number }

// Mapa interactivo (web) con Leaflet + OpenStreetMap: permite acercar, alejar
// y arrastrar dentro de la app sin salir a Google Maps. Mismo enfoque que MiniMapa.web.
export default function PropMapa({ lat, lng, titulo, height = 300 }: Props) {
  const containerRef = useRef<any>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const l = document.createElement('link')
      l.id = 'leaflet-css'
      l.rel = 'stylesheet'
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(l)
    }

    const init = () => {
      const L = (window as any).L
      const el = containerRef.current as unknown as HTMLElement
      if (!L || !el || mapRef.current) return
      const map = L.map(el, { center: [lat, lng], zoom: 15, scrollWheelZoom: true, attributionControl: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#1a6470;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 20],
      })
      const m = L.marker([lat, lng], { icon }).addTo(map)
      if (titulo) m.bindPopup(`<b style="font-family:sans-serif">${titulo}</b>`)
      setTimeout(() => map.invalidateSize(), 200)
    }

    const tryInit = () => {
      if ((window as any).L) { setTimeout(init, 60); return }
      if (!document.getElementById('leaflet-js')) {
        const s = document.createElement('script')
        s.id = 'leaflet-js'
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        s.onload = () => setTimeout(init, 60)
        document.head.appendChild(s)
      } else {
        const t = setInterval(() => { if ((window as any).L) { clearInterval(t); init() } }, 100)
      }
    }

    tryInit()
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [lat, lng])

  return (
    <View
      ref={containerRef}
      style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#dde8ee' } as any}
    />
  )
}
