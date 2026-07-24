import { useEffect, useState, useRef, useCallback } from 'react'
import { Image, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import ToggleSwitch from '../../components/ToggleSwitch'
import { Stack, router, usePathname, useGlobalSearchParams } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { cerrarSesionUsuario } from '../../lib/cuentas'
import { useTheme } from '../../lib/ThemeContext'
import { useVistaComo } from '../../lib/VistaComo'
import HeaderBack from '../../components/HeaderBack'

const LOGO = require('../../assets/logo-recortado.png')

// Pantallas que existen con el MISMO nombre en (admin) y en (prospectador). Al
// devolver a un usuario a su app se puede conservar la pantalla solo si está en
// esta lista; si no, no existe del otro lado y habría que ir al inicio.
const COMPARTIDAS = new Set([
  'chat-cliente', 'chats', 'constructoras', 'crm', 'detalle-cliente',
  'misiones', 'notificaciones', 'propiedades', 'tareas', 'university',
])

export default function AdminLayout() {
  const [noLeidas, setNoLeidas] = useState(0)
  const mountedRef = useRef(false)
  const { darkMode, toggleDarkMode } = useTheme()
  const { vistaComo, listo: vistaComoListo } = useVistaComo()
  const pathname = usePathname()
  const paramsUrl = useGlobalSearchParams()

  // Diez pantallas existen con el mismo nombre en (admin) y en (prospectador)
  // — propiedades, crm, misiones, university… — y en web la URL no lleva el
  // grupo. Al abrir /crm el router entra por (admin), así que a un admin que
  // estaba "viendo como usuario" hay que devolverlo a la app que usaba.
  //
  // OJO: antes esto mandaba SIEMPRE a /propiedades, y por eso al guardar un
  // cliente (que deja en /crm) o al abrir el detalle de un cliente te sacaba a
  // la lista de propiedades en vez de dejarte donde ibas. Ahora se conserva la
  // MISMA pantalla y sus parámetros; solo se cae a propiedades si esa pantalla
  // no existe del lado del prospectador.
  const destinoProspectador = useCallback(() => {
    const ruta = (pathname || '').replace(/^\/+/, '')
    if (!COMPARTIDAS.has(ruta)) return '/(prospectador)/propiedades'
    const qs = Object.entries(paramsUrl)
      .filter(([, v]) => typeof v === 'string' && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
      .join('&')
    return `/(prospectador)/${ruta}${qs ? `?${qs}` : ''}`
  }, [pathname, paramsUrl])

  useEffect(() => {
    if (vistaComoListo && vistaComo) router.replace(destinoProspectador() as any)
  }, [vistaComoListo, vistaComo, destinoProspectador])

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
            router.replace(destinoProspectador() as any)
          }
        })
    })
    return () => { activo = false }
  }, [destinoProspectador])

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
    const { data: { user } } = await getUsuarioActual()
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
