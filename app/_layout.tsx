import { useEffect, useState } from 'react'
import { View, ActivityIndicator, AppState, Platform, Modal, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister } from '../lib/queryClient'
import { ThemeProvider, useColors } from '../lib/ThemeContext'
import * as Updates from 'expo-updates'
import { useFonts } from 'expo-font'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function registrarPushToken(userId: string) {
  if (Platform.OS === 'web') return
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') return
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 'c8a64954-8c24-4d51-829d-55ede1f5fb6d'
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId)
  } catch (e) {
    console.warn('[Push] Error registrando token:', e)
  }
}

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.valerarealestate.app'
const STORE_URL_IOS = 'https://apps.apple.com/app/id6769195695'

function compareVersions(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number)
  const b = minimum.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0
    if (x < y) return false
    if (x > y) return true
  }
  return true
}

async function checkForUpdate() {
  if (Platform.OS === 'web' || __DEV__) return
  try {
    const result = await Updates.checkForUpdateAsync()
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync()
      await Updates.reloadAsync()
    }
  } catch { /* ignorar errores de red al verificar actualizaciones */ }
}

function WebThemeCSS() {
  const c = useColors()
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const id = 'valera-theme-css'
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = `
      input, textarea, select {
        color: ${c.inputText} !important;
        background-color: ${c.input} !important;
        caret-color: ${c.inputText} !important;
      }
      input::placeholder, textarea::placeholder {
        color: ${c.placeholder} !important;
      }
    `
  }, [c.inputText, c.input, c.placeholder])
  return null
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [updateRequerido, setUpdateRequerido] = useState(false)
  const [fontsLoaded] = useFonts(Platform.OS === 'web' ? {} : Ionicons.font)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const id = 'ionicons-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = "@font-face{font-family:'Ionicons';src:url('/fonts/Ionicons.ttf') format('truetype');font-weight:normal;font-style:normal;}"
    document.head.appendChild(style)
  }, [])

  useEffect(() => {
    checkForUpdate()
  }, [])

  // Verifica si la versión instalada cumple el mínimo requerido en Supabase
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0'
    const key = Platform.OS === 'android' ? 'min_version_android' : 'min_version_ios'
    supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && !compareVersions(currentVersion, data.value)) {
          setUpdateRequerido(true)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let sessionId: string | null = null
    let iniciando = false  // guard contra llamadas concurrentes

    async function iniciarSesion() {
      if (sessionId || iniciando) return  // ya hay sesión activa o está creándose
      iniciando = true
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('user_sessions')
          .insert({ user_id: user.id })
          .select('id')
          .single()
        sessionId = data?.id ?? null
      } finally {
        iniciando = false
      }
    }

    async function cerrarSesion() {
      if (!sessionId) return
      const id = sessionId
      sessionId = null  // limpiar antes del await para evitar doble cierre
      await supabase.from('user_sessions').update({ fin: new Date().toISOString() }).eq('id', id)
    }

    // En web: visibilitychange es más fiable que AppState para detectar
    // cuando el usuario minimiza o cierra la pestaña
    let removeWebListeners: (() => void) | null = null
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.hidden) cerrarSesion()
        else iniciarSesion()
      }
      const onUnload = () => cerrarSesion()
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('beforeunload', onUnload)
      removeWebListeners = () => {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('beforeunload', onUnload)
      }
    }

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
        iniciarSesion()  // el guard evita duplicados
      } else if (state === 'background' || state === 'inactive') {
        supabase.auth.stopAutoRefresh()
        cerrarSesion()
      }
    })

    const fallbackTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null)).catch(() => {})
          return false
        }
        return prev
      })
    }, 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        clearTimeout(fallbackTimer)
        setSession(session)
        setLoading(false)
        if (session) {
          iniciarSesion()
          registrarPushToken(session.user.id)
        }
      } else if (event === 'SIGNED_IN') {
        setSession(session)
        iniciarSesion()
        if (session?.user?.id) registrarPushToken(session.user.id)
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(session)
      } else if (event === 'SIGNED_OUT') {
        cerrarSesion()
        setSession(null)
        queryClient.clear()
        router.replace('/(auth)/login')
      }
    })

    return () => {
      clearTimeout(fallbackTimer)
      appStateSub.remove()
      subscription.unsubscribe()
      removeWebListeners?.()
      cerrarSesion()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/(auth)/login')
      return
    }
    // Al recargar la página, verificar el rol y redirigir al home correcto
    // Esto evita que un usuario normal acceda a rutas de admin por URL
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.role === 'admin') {
          router.replace('/(admin)/propiedades')
        } else {
          router.replace('/(prospectador)/propiedades')
        }
      })
      .catch(() => {})
  }, [loading])

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a6470' }}>
        <ActivityIndicator size="large" color="#c9a84c" />
      </View>
    )
  }

  return (
    <ThemeProvider>
      <WebThemeCSS />
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(prospectador)" />
        </Stack>

        <Modal visible={updateRequerido} transparent animationType="fade" statusBarTranslucent>
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.emoji}>🚀</Text>
              <Text style={styles.titulo}>Actualización requerida</Text>
              <Text style={styles.mensaje}>
                Hay una nueva versión de Valera disponible.{'\n'}
                Actualiza la app para seguir usándola.
              </Text>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => Linking.openURL(Platform.OS === 'ios' ? STORE_URL_IOS : STORE_URL_ANDROID)}
              >
                <Text style={styles.btnText}>Actualizar ahora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </PersistQueryClientProvider>
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  titulo: { fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginBottom: 12, textAlign: 'center' },
  mensaje: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  btn: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
