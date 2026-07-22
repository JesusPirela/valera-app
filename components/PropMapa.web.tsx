import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

type Props = { lat: number; lng: number; titulo?: string; height?: number }

// Mapa interactivo (web) con Leaflet + OpenStreetMap.
// IMPORTANTE: arranca BLOQUEADO (sin arrastre ni zoom con la rueda) para que, al
// scrollear la página y pasar el mouse por encima, NO se mueva el mapa por error
// ni se robe el scroll. Se activa al hacer CLIC y se vuelve a bloquear cuando el
// mouse sale del mapa (mismo patrón que los mapas de Google embebidos).
export default function PropMapa({ lat, lng, titulo, height = 300 }: Props) {
  const containerRef = useRef<any>(null)
  const wrapperRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const [activo, setActivo] = useState(false)

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
      // Bloqueado de inicio: sin scrollWheelZoom ni dragging.
      const map = L.map(el, { center: [lat, lng], zoom: 15, scrollWheelZoom: false, dragging: false, attributionControl: false })
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

      // Activar al hacer clic EN el mapa; bloquear al hacer clic FUERA de él.
      // (Antes se bloqueaba con mouseleave, pero si arrastrabas de más y salías
      // del mapa se bloqueaba a media interacción — molesto.)
      const activar = () => {
        map.scrollWheelZoom.enable()
        map.dragging.enable()
        setActivo(true)
      }
      const bloquear = () => {
        map.scrollWheelZoom.disable()
        map.dragging.disable()
        setActivo(false)
      }
      el.addEventListener('click', activar)
      const onDocClick = (e: MouseEvent) => {
        const wrap = wrapperRef.current as unknown as HTMLElement | null
        // Clic fuera del recuadro del mapa → bloquear.
        if (wrap && !wrap.contains(e.target as Node)) bloquear()
      }
      document.addEventListener('click', onDocClick, true)
      ;(map as any).__cleanupInteract = () => {
        el.removeEventListener('click', activar)
        document.removeEventListener('click', onDocClick, true)
      }
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
      if (mapRef.current) {
        mapRef.current.__cleanupInteract?.()
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [lat, lng])

  function recentrar() {
    mapRef.current?.flyTo([lat, lng], 15, { duration: 0.6 })
  }

  return (
    <View ref={wrapperRef} style={{ position: 'relative', width: '100%', height } as any}>
      <View
        ref={containerRef}
        style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#dde8ee' } as any}
      />

      {/* Aviso mientras está bloqueado: "haz clic para mover el mapa". No captura
          eventos (pointerEvents none) para que el clic llegue al mapa y lo active. */}
      {!activo && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 12,
          } as any}
        >
          <View style={{ backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 } as any}>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' } as any}>🖱️ Haz clic para mover el mapa</Text>
          </View>
        </View>
      )}

      {/* Botón para volver a centrar el mapa en la propiedad tras moverlo. */}
      <TouchableOpacity
        onPress={recentrar}
        activeOpacity={0.85}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)', cursor: 'pointer',
        } as any}
      >
        <Ionicons name="locate" size={20} color="#1a6470" />
      </TouchableOpacity>
    </View>
  )
}
