import { useEffect, useState } from 'react'
import { Text, TouchableOpacity } from 'react-native'
import { Tabs } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function ProspectadorLayout() {
  const [noLeidas, setNoLeidas] = useState(0)

  async function cargarNoLeidas() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { count } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('leida', false)
    setNoLeidas(count ?? 0)
  }

  useEffect(() => {
    cargarNoLeidas()

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1a1a2e',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#eee' },
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => supabase.auth.signOut()}
            style={{ marginRight: 16 }}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>Salir</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="propiedades"
        options={{ title: 'Propiedades' }}
      />
      <Tabs.Screen
        name="detalle-propiedad"
        options={{ href: null, title: 'Detalle' }}
      />
      <Tabs.Screen
        name="notificaciones"
        options={{
          title: 'Notificaciones',
          tabBarBadge: noLeidas > 0 ? noLeidas : undefined,
        }}
      />
    </Tabs>
  )
}
