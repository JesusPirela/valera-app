import { useEffect, useState, useRef } from 'react'
import { Image, View, Platform, StyleSheet, TouchableOpacity } from 'react-native'
import { Tabs, usePathname, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../lib/ThemeContext'
import { AccentBackground } from '../../lib/patrones'
import { trackLoginDiario } from '../../lib/gamification'
import { programarRecordatorios, solicitarPermisoWeb, notificarWeb } from '../../lib/notificaciones-locales'
import HeaderBack from '../../components/HeaderBack'
import ClienteFormBack from '../../components/ClienteFormBack'
import { useVistaComo } from '../../lib/VistaComo'
import VistaComoBanner from '../../components/VistaComoBanner'

const LOGO = require('../../assets/logo.png')

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function HoverTabIcon({ name, nameFocused, focused, color }: {
  name: IoniconsName; nameFocused: IoniconsName; focused: boolean; color: string
}) {
  const [hovered, setHovered] = useState(false)
  const isWeb = Platform.OS === 'web'
  return (
    <View
      style={{
        alignItems: 'center', justifyContent: 'center',
        transform: [{ scale: hovered && isWeb ? 1.28 : 1 }],
        // @ts-ignore – CSS transitions en React Native Web
        transitionDuration: isWeb ? '140ms' : undefined,
        transitionProperty: isWeb ? 'transform' : undefined,
        transitionTimingFunction: isWeb ? 'ease-out' : undefined,
      }}
      // @ts-ignore – eventos de mouse solo en web
      onMouseEnter={isWeb ? () => setHovered(true) : undefined}
      onMouseLeave={isWeb ? () => setHovered(false) : undefined}
    >
      <Ionicons name={focused ? nameFocused : name} size={focused ? 26 : 24} color={color} />
    </View>
  )
}

export default function ProspectadorLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  const { vistaComo } = useVistaComo()
  const { primaryColor: colorAcento, acentoId, darkMode } = useTheme()
  const pathname = usePathname()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return
      supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
        if (mountedRef.current) setRole(data?.role ?? null)
      })
    })
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
        cliente_id: r.cliente_id ?? null,
        titulo: `Recordatorio: ${r.titulo}`,
        mensaje: `Tienes un seguimiento pendiente con ${nombreCliente} programado para el ${fechaHora}.${r.descripcion ? ` Nota: ${r.descripcion}` : ''}`,
        tipo: 'recordatorio',
      })

      if (!error) {
        await supabase.from('recordatorios').update({ notificado: true }).eq('id', r.id)
        huboNuevas = true
        // Web: aviso del navegador (en móvil ya hay notificación local programada)
        notificarWeb(
          `⏰ ${r.titulo}`,
          `Seguimiento pendiente con ${nombreCliente}.${r.descripcion ? ` ${r.descripcion}` : ''}`,
          () => { if (r.cliente_id) router.push(`/(prospectador)/detalle-cliente?id=${r.cliente_id}`) },
        )
      }
    }

    if (huboNuevas && mountedRef.current) cargarNoLeidas()
  }

  useEffect(() => { cargarNoLeidas() }, [pathname])

  useEffect(() => {
    // Tracking de login diario y streak
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) trackLoginDiario(user.id).catch(() => {})
    })

    // Programar alarmas de recordatorios (móvil) y pedir permiso de avisos (web)
    programarRecordatorios().catch(() => {})
    solicitarPermisoWeb().catch(() => {})

    // Deep link al tocar una notificación push: navegar a la pantalla correcta
    const subNotif = Notifications.addNotificationResponseReceivedListener(async response => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined
      const tipo = data?.tipo as string | undefined
      const clienteId = data?.cliente_id as string | undefined
      const propiedadId = data?.propiedad_id as string | undefined
      const chatbotLeadId = data?.chatbot_lead_id as string | undefined
      if (clienteId) {
        router.push(`/(prospectador)/detalle-cliente?id=${clienteId}`)
      } else if (chatbotLeadId) {
        const { data: lead } = await supabase
          .from('chatbot_leads').select('telefono, nombre').eq('id', chatbotLeadId).maybeSingle()
        if (lead?.telefono) {
          router.push(`/(prospectador)/chat-cliente?telefono=${lead.telefono}&nombre=${encodeURIComponent(lead.nombre ?? '')}`)
        } else {
          router.push('/(prospectador)/notificaciones')
        }
      } else if (tipo === 'nueva_propiedad' && propiedadId) {
        router.push(`/(prospectador)/detalle-propiedad?id=${propiedadId}`)
      } else if (propiedadId) {
        router.push(`/(prospectador)/detalle-propiedad?id=${propiedadId}`)
      } else {
        router.push('/(prospectador)/notificaciones')
      }
    })

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
      subNotif.remove()
    }
  }, [])

  function tabIcon(name: IoniconsName, nameFocused: IoniconsName) {
    return ({ color, focused }: { color: string; focused: boolean }) => (
      <HoverTabIcon name={name} nameFocused={nameFocused} focused={focused} color={color} />
    )
  }

  const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 82 : Platform.OS === 'web' ? 72 : 64
  // Rol efectivo: si un admin está "viendo como" otro rol, manda el simulado.
  const rolEf = vistaComo ?? role
  const esAdminGlobal = rolEf === 'admin'
  const ocultarTabBar = esAdminGlobal && pathname.includes('detalle-propiedad')
  const esSupervisor = rolEf === 'supervisor'
  const esAsesor = rolEf === 'asesor'

  return (
    <>
    <VistaComoBanner />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colorAcento,
        tabBarInactiveTintColor: darkMode ? '#556a7a' : '#9eafb2',
        tabBarStyle: ocultarTabBar ? { display: 'none' } : {
          backgroundColor: darkMode ? '#1b3045' : '#fff',
          borderTopColor: darkMode ? '#2a4560' : '#e8eef0',
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT,
          paddingBottom: Platform.OS === 'ios' ? 24 : Platform.OS === 'web' ? 12 : 8,
          paddingTop: Platform.OS === 'web' ? 8 : 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 12,
        },
        // sceneStyle es la prop real de bottom-tabs para el fondo detrás de las
        // pantallas; "contentStyle" no existe en Tabs y se ignoraba en silencio.
        sceneStyle: { backgroundColor: darkMode ? '#0d1b2a' : '#f0f4f5' },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          marginTop: 2,
        },
        headerBackground: () => (
          <AccentBackground acentoId={acentoId} style={StyleSheet.absoluteFillObject} />
        ),
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: '#c9a84c',
        headerTitleStyle: { fontWeight: 'bold' },
        headerTitle: () => (
          <TouchableOpacity
            onPress={() => router.navigate('/(prospectador)/propiedades')}
            accessibilityLabel="Ir al inicio"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Image
              source={LOGO}
              style={{ width: 130, height: 54 }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ),
        headerLeft: () => <HeaderBack />,
        headerRight: () => null,
      }}
    >
      <Tabs.Screen
        name="propiedades"
        options={{
          title: 'Propiedades',
          tabBarIcon: tabIcon('home-outline', 'home'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="mi-dia"
        options={{ href: null, title: 'Mi Día' }}
      />
      <Tabs.Screen
        name="crm"
        options={{
          title: 'Clientes',
          tabBarIcon: tabIcon('people-outline', 'people'),
        }}
      />
      <Tabs.Screen
        name="misiones"
        options={{
          title: 'Misiones',
          tabBarIcon: tabIcon('flash-outline', 'flash'),
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
        name="supervision"
        options={{
          title: 'Supervisión',
          tabBarIcon: tabIcon('shield-checkmark-outline', 'shield-checkmark'),
          href: esSupervisor ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="asesor"
        options={{
          title: 'Asesor',
          tabBarIcon: tabIcon('briefcase-outline', 'briefcase'),
          href: (esAsesor || rolEf === 'admin') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="asesor-estadisticas"
        options={{ href: null, headerLeft: () => <HeaderBack to="/(prospectador)/asesor" /> }}
      />
      <Tabs.Screen
        name="tareas"
        options={{ href: null }}
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
      <Tabs.Screen name="detalle-propiedad"  options={{ href: null, title: 'Detalle', headerLeft: () => <HeaderBack to="/(prospectador)/propiedades" /> }} />
      <Tabs.Screen name="constructoras"          options={{ href: null, title: 'Constructoras',    headerLeft: () => <HeaderBack to="/(prospectador)/propiedades" /> }} />
      <Tabs.Screen name="zonas"                 options={{ href: null, title: 'Zonas',            headerLeft: () => <HeaderBack to="/(prospectador)/constructoras" /> }} />
      <Tabs.Screen name="tabla-equipo"          options={{ href: null, title: 'Tabla equipo',     headerLeft: () => <HeaderBack to="/(prospectador)/constructoras" /> }} />
      <Tabs.Screen name="mapa"                  options={{ href: null, title: 'Mapa de lonas',    headerLeft: () => <HeaderBack to="/(prospectador)/propiedades" /> }} />
      <Tabs.Screen name="historial-publicaciones" options={{ href: null, title: 'Historial publicaciones', headerLeft: () => <HeaderBack to="/(prospectador)/propiedades" /> }} />
      <Tabs.Screen name="cliente-form"       options={{ href: null, title: 'Cliente', headerLeft: () => <ClienteFormBack /> }} />
      <Tabs.Screen name="detalle-cliente"    options={{ href: null, title: 'Cliente', headerLeft: () => <HeaderBack to="/(prospectador)/crm" /> }} />
      <Tabs.Screen name="university-curso"   options={{ href: null, title: 'Curso', headerLeft: () => <HeaderBack to="/(prospectador)/university" /> }} />
      <Tabs.Screen name="university-leccion" options={{ href: null, title: 'Lección' }} />
      <Tabs.Screen name="tienda"             options={{ href: null, title: 'Tienda' }} />
      <Tabs.Screen name="ranking"            options={{ href: null, title: 'Ranking' }} />
      <Tabs.Screen name="mi-actividad"       options={{ href: null, title: 'Mi Actividad' }} />
      <Tabs.Screen name="mi-historial"       options={{ href: null, title: 'Mi Historial' }} />
      <Tabs.Screen name="mi-publicaciones"   options={{ href: null, title: 'Mis Publicaciones' }} />
      <Tabs.Screen name="chats"              options={{ href: null, title: 'Chats' }} />
      <Tabs.Screen name="chat-cliente"       options={{ href: null, title: 'Chat' }} />
    </Tabs>
    </>
  )
}
