import { View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

type Props = { lat: number; lng: number; titulo?: string; height?: number }

// Mapa interactivo (nativo) con react-native-maps: acercar/alejar y arrastrar
// dentro de la app. Mismo proveedor (Google) que MiniMapa.native.
export default function PropMapa({ lat, lng, titulo, height = 300 }: Props) {
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        provider="google"
        style={{ flex: 1 }}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        zoomEnabled
        scrollEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} title={titulo} />
      </MapView>
    </View>
  )
}
