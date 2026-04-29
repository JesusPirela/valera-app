import { useEffect, useState } from 'react'
import { View, ActivityIndicator, AppState, Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister } from '../lib/queryClient'
import * as Updates from 'expo-updates'

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

  useEffect(() => {
    checkForUpdate()
  }, [])

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })

    // onAuthStateChange es la fuente de verdad: INITIAL_SESSION se dispara
    // DESPUÉS de que AsyncStorage termina de leer la sesión guardada,
    // evitando la race condition con getSession() en nativo.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
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
      appStateSub.remove()
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!session) router.replace('/(auth)/login')
  }, [loading])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a6470' }}>
        <ActivityIndicator size="large" color="#c9a84c" />
      </View>
    )
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(prospectador)" />
      </Stack>
    </PersistQueryClientProvider>
  )
}
