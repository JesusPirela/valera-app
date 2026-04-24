import { useEffect, useState, useRef } from 'react'
import { Text, TouchableOpacity, Image, View, Platform } from 'react-native'
import { Tabs, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

export default function ProspectadorLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const [colorAcento, setColorAcento] = useState('#1a6470')
  const pathname = usePathname()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  async function cargarPerfil() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return
    const { data } = await supabase
      .from('profiles')
      .select('color_acento')
      .eq('id', user.id)
      .single()
    if (data?.color_acento && mountedRef.current) setColorAcento(data.color_acento)
  }

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

  async function verificarRecordatorios() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return

    const { data: pendientes } = await supabase
      .from('recordatorios')
      .select('id, titulo, descripcion, fecha_hora, cliente_id, clientes(nombre)')
      .eq('user_id', user.id)
      .eq('completado', false)
      .eq('notificado', false)
      .lte('fecha_hora', new Date().toISOString())

    if (!pendientes || pendientes.length === 0) return

    let huboNuevas = false
    for (const r of pendientes) {
      if (!mountedRef.current) break
      const cliente = r.clientes as any
      const nombreCliente = cliente?.nombre ?? 'Cliente'
      const fechaHora = new Date(r.fecha_hora).toLocaleString('es-MX', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })

      const { error } = await supabase.from('notificaciones').insert({
        user_id: user.id,
        titulo: `Recordatorio: ${r.titulo}`,
        mensaje: `Tienes un seguimiento pendiente con ${nombreCliente} programado para el ${fechaHora}.${r.descripcion ? ` Nota: ${r.descripcion}` : ''}`,
        tipo: 'recordatorio',
      })

      if (!error) {
        await supabase.from('recordatorios').update({ notificado: true }).eq('id', r.id)
        huboNuevas = true
      }
    }

    if (huboNuevas && mountedRef.current) cargarNoLeidas()
  }

  useEffect(() => { cargarPerfil() }, [pathname])

  useEffect(() => {
    cargarPerfil()
    cargarNoLeidas()
    verificarRecordatorios()

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

  function tabIcon(name: IoniconsName, nameFocused: IoniconsName) {
    return ({ color, focused }: { color: string; focused: boolean }) => (
      <Ionicons name={focused ? nameFocused : name} size={24} color={color} />
    )
  }

  const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 82 : 64

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colorAcento,
        tabBarInactiveTintColor: '#9eafb2',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e8eef0',
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        headerStyle: { backgroundColor: colorAcento },
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
            style={{ marginRight: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="log-out-outline" size={18} color="#c9a84c" />
            <Text style={{ color: '#c9a84c', fontSize: 13, fontWeight: '600' }}>Salir</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="propiedades"
        options={{
          title: 'Propiedades',
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="crm"
        options={{
          title: 'Clientes',
          tabBarIcon: tabIcon('people-outline', 'people'),
        }}
      />
      <Tabs.Screen
        name="university"
        options={{
          title: 'Universidad',
          tabBarIcon: tabIcon('school-outline', 'school'),
        }}
      />
      <Tabs.Screen
        name="notificaciones"
        options={{
          title: 'Avisos',
          tabBarBadge: noLeidas > 0 ? noLeidas : undefined,
          tabBarBadgeStyle: { backgroundColor: '#e53935', fontSize: 10, minWidth: 16, height: 16 },
          tabBarIcon: tabIcon('notifications-outline', 'notifications'),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: tabIcon('person-outline', 'person'),
        }}
      />
      {/* Pantallas de detalle — ocultas del tab bar */}
      <Tabs.Screen name="detalle-propiedad"  options={{ href: null, title: 'Detalle' }} />
      <Tabs.Screen name="cliente-form"       options={{ href: null, title: 'Cliente' }} />
      <Tabs.Screen name="detalle-cliente"    options={{ href: null, title: 'Cliente' }} />
      <Tabs.Screen name="university-curso"   options={{ href: null, title: 'Curso' }} />
      <Tabs.Screen name="university-leccion" options={{ href: null, title: 'Lección' }} />
    </Tabs>
  )
}
