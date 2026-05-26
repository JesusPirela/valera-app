import { useEffect, useState } from 'react'
import { View, ActivityIndicator, AppState, Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister } from '../lib/queryClient'
import { ThemeProvider } from '../lib/ThemeContext'
import * as Updates from 'expo-updates'
import { useFonts } from 'expo-font'
import { Ionicons } from '@expo/vector-icons'

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
  // En web useFonts no funciona en el bundle de producción:
  // se inyecta la fuente vía CSS apuntando a /fonts/Ionicons.ttf
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

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })

    // Fallback: si INITIAL_SESSION no dispara en 5s, forzamos loading=false
    const fallbackTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null)).catch(() => {})
          return false
        }
        return prev
      })
    }, 5000)

    // onAuthStateChange es la fuente de verdad: INITIAL_SESSION se dispara
    // DESPUÉS de que AsyncStorage termina de leer la sesión guardada,
    // evitando la race condition con getSession() en nativo.
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
      </PersistQueryClientProvider>
    </ThemeProvider>
  )
}
