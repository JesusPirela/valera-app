import { useEffect, useState, useRef } from 'react'
import { Text, TouchableOpacity, Image } from 'react-native'
import { Tabs } from 'expo-router'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

export default function ProspectadorLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
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

  // Revisa recordatorios vencidos y los convierte en notificaciones
  async function verificarRecordatorios() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return

    const { data: pendientes } = await supabase
      .from('recordatorios')
      .select('id, titulo, descripcion, cliente_id, clientes(nombre)')
      .eq('user_id', user.id)
      .eq('completado', false)
      .eq('notificado', false)
      .lte('fecha_hora', new Date().toISOString())

    if (!pendientes || pendientes.length === 0) return

    for (const r of pendientes) {
      if (!mountedRef.current) break
      const cliente = r.clientes as any
      const nombreCliente = cliente?.nombre ?? 'Cliente'

      await supabase.from('notificaciones').insert({
        user_id: user.id,
        titulo: `Recordatorio: ${r.titulo}`,
        mensaje: `Seguimiento pendiente con ${nombreCliente}${r.descripcion ? `. ${r.descripcion}` : ''}`,
        tipo: 'recordatorio',
      })

      await supabase.from('recordatorios').update({ notificado: true }).eq('id', r.id)
    }
  }

  useEffect(() => {
    cargarNoLeidas()
    verificarRecordatorios()

    // Polling cada 60 segundos para recordatorios
    pollingRef.current = setInterval(() => {
      verificarRecordatorios()
    }, 60_000)

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones' }, () => {
        cargarNoLeidas()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1a6470',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#dde8e9' },
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
          <TouchableOpacity
            onPress={() => supabase.auth.signOut()}
            style={{ marginRight: 16 }}
          >
            <Text style={{ color: '#c9a84c', fontSize: 14, fontWeight: '600' }}>Salir</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen name="propiedades" options={{ title: 'Propiedades' }} />
      <Tabs.Screen name="crm" options={{ title: 'Clientes' }} />
      <Tabs.Screen
        name="notificaciones"
        options={{
          title: 'Notificaciones',
          tabBarBadge: noLeidas > 0 ? noLeidas : undefined,
        }}
      />
      {/* Pantallas de detalle — ocultas del tab bar */}
      <Tabs.Screen name="detalle-propiedad"  options={{ href: null, title: 'Detalle' }} />
      <Tabs.Screen name="cliente-form"       options={{ href: null, title: 'Cliente' }} />
      <Tabs.Screen name="detalle-cliente"    options={{ href: null, title: 'Cliente' }} />
    </Tabs>
  )
}
