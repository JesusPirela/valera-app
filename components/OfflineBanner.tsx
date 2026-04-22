import { View, Text, StyleSheet } from 'react-native'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export function OfflineBanner() {
  const isOnline = useNetworkStatus()
  if (isOnline) return null
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Sin conexión · Mostrando datos en caché</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#e67e22',
    paddingVertical: 7,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
})
