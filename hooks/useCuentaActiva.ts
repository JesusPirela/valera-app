import { useEffect, useRef } from 'react'
import { AppState, Platform, Alert } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'

// Cierra la sesión del usuario si un admin inhabilitó su cuenta (o si se
// auto-inhabilitó por inactividad). Revisa al montar, al volver a primer plano y
// cada 60 s. SOLO desloguea cuando el servidor responde explícitamente que la
// cuenta NO está activa (data === false); ante errores de red NO hace nada, para
// respetar el anti-deslogueo-falso. La revocación de sesiones (en el servidor)
// impide además que el token se refresque y reviva la sesión.
export function useCuentaActiva(enabled: boolean): void {
  const yendo = useRef(false)
  useEffect(() => {
    if (!enabled) return
    let vivo = true

    async function revisar() {
      if (yendo.current) return
      try {
        const { data, error } = await supabase.rpc('verificar_acceso')
        if (!vivo || error) return
        if (data === false) {
          yendo.current = true
          try { await supabase.auth.signOut() } catch { /* no-op */ }
          const msg = 'Tu cuenta está inhabilitada temporalmente. Contacta a un administrador para reactivarla.'
          if (Platform.OS === 'web') { try { window.alert(msg) } catch { /* no-op */ } }
          else Alert.alert('Cuenta inhabilitada', msg)
          router.replace('/(auth)/login')
        }
      } catch { /* sin red: no desloguear */ }
    }

    revisar()
    const id = setInterval(revisar, 60_000)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') revisar() })
    let removeWeb: (() => void) | null = null
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => revisar()
      window.addEventListener('focus', onFocus)
      removeWeb = () => window.removeEventListener('focus', onFocus)
    }
    return () => { vivo = false; clearInterval(id); sub.remove(); removeWeb?.() }
  }, [enabled])
}
