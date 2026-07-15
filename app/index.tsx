import { useEffect } from 'react'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { VISTA_COMO_KEY } from '../lib/VistaComo'
import { listarCuentas } from '../lib/cuentas'

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

      // El rol está cacheado en AsyncStorage por actualizarNombreRole (evita red).
      // Fallback a red solo si no hay entrada (primera instalación o cache limpiado).
      let role: string | null = null
      try {
        const cuentas = await listarCuentas()
        role = cuentas.find(c => c.user_id === session.user.id)?.role ?? null
      } catch {}

      if (!role) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
        role = profile?.role ?? null
      }

      if (role === 'admin') {
        let vistaComo: string | null = null
        try { vistaComo = await AsyncStorage.getItem(VISTA_COMO_KEY) } catch {}
        router.replace(vistaComo ? '/(prospectador)/propiedades' : '/(admin)/propiedades')
      } else {
        router.replace('/(prospectador)/propiedades')
      }
    }

    redirect()
  }, [])

  return null
}
