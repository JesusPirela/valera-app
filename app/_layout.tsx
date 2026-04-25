import { useEffect, useState } from 'react'
import { View, ActivityIndicator, AppState } from 'react-native'
import { Stack, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister } from '../lib/queryClient'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Reiniciar el auto-refresh del token cuando la app vuelve al frente
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    })

    // Restore persisted session from AsyncStorage on app open
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // Only redirect to login on an explicit sign-out, not on token refresh or initial load
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        router.replace('/(auth)/login')
      }
    })

    return () => {
      appStateSub.remove()
      subscription.unsubscribe()
    }
  }, [])

  // Single redirect check once the initial session restore completes
  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/(auth)/login')
    }
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
