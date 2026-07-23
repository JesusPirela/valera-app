import { useEffect, useState, useRef } from 'react'
import { Image, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import ToggleSwitch from '../../components/ToggleSwitch'
import { Stack, router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { cerrarSesionUsuario } from '../../lib/cuentas'
import { useTheme } from '../../lib/ThemeContext'
import { useVistaComo } from '../../lib/VistaComo'
import HeaderBack from '../../components/HeaderBack'

const LOGO = require('../../assets/logo-recortado.png')

export default function AdminLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const mountedRef = useRef(false)
  const { darkMode, toggleDarkMode } = useTheme()
  const { vistaComo, listo: vistaComoListo } = useVistaComo()

  // Diez pantallas existen con el mismo nombre en (admin) y en (prospectador)
  // — propiedades, crm, misiones, university… — y en web la URL no lleva el
  // grupo. Al recargar /propiedades el router entra por (admin), así que un
  // admin que estaba "viendo como usuario" aterrizaba en el panel de admin.
  // Aquí lo devolvemos a la app que estaba usando.
  useEffect(() => {
    if (vistaComoListo && vistaComo) router.replace('/(prospectador)/propiedades')
  }, [vistaComoListo, vistaComo])

  // Por la misma colisión de nombres, un usuario sin permisos podía aterrizar en
  // (admin) al recargar. Los datos ya los protege RLS; esto saca de la pantalla.
  useEffect(() => {
    let activo = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !activo) return
      supabase.from('profiles').select('role').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (!activo || !data) return
          if (data.role !== 'admin' && data.role !== 'supervisor') {
            router.replace('/(prospectador)/propiedades')
          }
        })
    })
    return () => { activo = false }
  }, [])

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

    // Deep link al tocar una notificación push (admin)
    let subNotif: Notifications.Subscription | null = null
    if (Platform.OS !== 'web') {
      subNotif = Notifications.addNotificationResponseReceivedListener(async response => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined
        const clienteId = data?.cliente_id as string | undefined
        const propiedadId = data?.propiedad_id as string | undefined
        const tipo = data?.tipo as string | undefined
        const chatbotLeadId = data?.chatbot_lead_id as string | undefined
        if (clienteId) {
          router.push(`/(admin)/detalle-cliente?id=${clienteId}`)
        } else if (chatbotLeadId) {
          const { data: lead } = await supabase
            .from('chatbot_leads').select('telefono, nombre').eq('id', chatbotLeadId).maybeSingle()
          if (lead?.telefono) {
            router.push(`/(admin)/chat-cliente?telefono=${lead.telefono}&nombre=${encodeURIComponent(lead.nombre ?? '')}`)
          } else {
            router.push('/(admin)/notificaciones')
          }
        } else if (propiedadId) {
          router.push(`/(admin)/editar-propiedad?id=${propiedadId}`)
        } else if (tipo === 'tienda' || tipo === 'ruleta' || tipo === 'cofre') {
          router.push('/(admin)/tienda-compras')
        } else {
          router.push('/(admin)/notificaciones')
        }
      })
    }

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
      subNotif?.remove()
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

  // No pintar el panel de admin mientras no sepamos si hay simulación activa,
  // ni cuando la hay: evita el parpadeo del header de admin antes del replace.
  if (!vistaComoListo || vistaComo) return null

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a6470' },
        headerTintColor: '#c9a84c',
        headerTitleStyle: { fontWeight: 'bold' },
        headerLeft: () => <HeaderBack />,
        headerTitle: () => (
          <TouchableOpacity
            onPress={() => router.navigate('/(admin)/propiedades')}
            accessibilityLabel="Ir al inicio"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Image
              source={LOGO}
              style={{ width: 67, height: 44 }}
              resizeMode="contain"
            />
          </TouchableOpacity>
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
            <ToggleSwitch
              value={darkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#2a475e', true: '#c9a84c' }}
              thumbColor="#fff"
            />
            <TouchableOpacity onPress={() => cerrarSesionUsuario()}>
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
