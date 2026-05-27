import { useEffect, useState } from 'react'
import { View, ActivityIndicator, AppState, Platform, Modal, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister } from '../lib/queryClient'
import { ThemeProvider } from '../lib/ThemeContext'
import * as Updates from 'expo-updates'
import { useFonts } from 'expo-font'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'

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
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
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
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(session)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        queryClient.clear()
        router.replace('/(auth)/login')
      }
    })

    return () => {
      clearTimeout(fallbackTimer)
      appStateSub.remove()
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!session) router.replace('/(auth)/login')
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
