import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useOfflineSync } from '../hooks/useOfflineSync'

// Banner superior: sin conexión, cambios pendientes, sincronizando, error.
export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, syncError, syncNow } = useOfflineSync()

  if (isSyncing) {
    return (
      <View style={[s.banner, s.syncing]}>
        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.text}>Sincronizando cambios…</Text>
      </View>
    )
  }

  if (syncError) {
    return (
      <TouchableOpacity style={[s.banner, s.error]} onPress={syncNow} activeOpacity={0.8}>
        <Text style={s.text}>⚠ {syncError} · Toca para reintentar</Text>
      </TouchableOpacity>
    )
  }

  if (!isOnline && pendingCount > 0) {
    return (
      <View style={[s.banner, s.offline]}>
        <Text style={s.text}>
          Sin conexión · {pendingCount} cambio{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}
        </Text>
      </View>
    )
  }

  if (!isOnline) {
    return (
      <View style={[s.banner, s.offline]}>
        <Text style={s.text}>Sin conexión · Mostrando datos en caché</Text>
      </View>
    )
  }

  if (pendingCount > 0) {
    return (
      <TouchableOpacity style={[s.banner, s.pending]} onPress={syncNow} activeOpacity={0.8}>
        <Text style={s.text}>
          ↑ {pendingCount} cambio{pendingCount > 1 ? 's' : ''} por enviar · Toca para sincronizar
        </Text>
      </TouchableOpacity>
    )
  }

  return null
}

const s = StyleSheet.create({
  banner:  { paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 16 },
  offline: { backgroundColor: '#e67e22' },
  syncing: { backgroundColor: '#1a9aaa' },
  error:   { backgroundColor: '#c0392b' },
  pending: { backgroundColor: '#7c3aed' },
  text:    { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
})
