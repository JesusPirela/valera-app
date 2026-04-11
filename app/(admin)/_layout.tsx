import { useEffect, useState, useRef } from 'react'
import { Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

export default function AdminLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    cargarNoLeidas()

    const channel = supabase
      .channel('admin-notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [])

  async function cargarNoLeidas() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return
    const { count } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('leida', false)
    if (mountedRef.current) setNoLeidas(count ?? 0)
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a6470' },
        headerTintColor: '#c9a84c',
        headerTitleStyle: { fontWeight: 'bold' },
        headerTitle: () => (
          <Image
            source={{ uri: LOGO_URI }}
            style={{ width: 80, height: 40 }}
            resizeMode="contain"
          />
        ),
        headerRight: () => (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => router.push('/(admin)/notificaciones')}
              style={styles.bellBtn}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {noLeidas > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{noLeidas > 9 ? '9+' : noLeidas}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => supabase.auth.signOut()}>
              <Text style={styles.salirText}>Salir</Text>
            </TouchableOpacity>
          </View>
        ),
      }}
    />
  )
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 12,
  },
  bellBtn: {
    position: 'relative',
    padding: 2,
  },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#c0392b',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  salirText: { color: '#c9a84c', fontSize: 14, fontWeight: '600' },
})
