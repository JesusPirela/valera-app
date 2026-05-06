import { useEffect } from 'react'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'

// Este componente solo renderiza DESPUÉS de que _layout.tsx resuelve la sesión
// (el spinner de _layout.tsx bloquea hasta que INITIAL_SESSION dispara),
// por lo que getSession() aquí ya tiene la sesión en memoria: sin race condition.
export default function Index() {
  useEffect(() => {
    async function redirect() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/(auth)/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role === 'admin') {
        router.replace('/(admin)/propiedades')
      } else {
        router.replace('/(prospectador)/propiedades')
      }
    }

    redirect()
  }, [])

  return null
}
