import { useRef } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'

type Props = { lat: number; lng: number; titulo?: string; height?: number }

// Mapa interactivo (nativo) con react-native-maps: acercar/alejar y arrastrar
// dentro de la app. Mismo proveedor (Google) que MiniMapa.native.
export default function PropMapa({ lat, lng, titulo, height = 300 }: Props) {
  const mapRef = useRef<MapView>(null)
  const region = { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        provider="google"
        style={{ flex: 1 }}
        initialRegion={region}
        zoomEnabled
        scrollEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} title={titulo} />
      </MapView>

      {/* Botón para volver a centrar el mapa en la propiedad tras moverlo. */}
      <TouchableOpacity
        style={s.recentrarBtn}
        onPress={() => mapRef.current?.animateToRegion(region, 500)}
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={20} color="#1a6470" />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  recentrarBtn: {
    position: 'absolute', bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
})
