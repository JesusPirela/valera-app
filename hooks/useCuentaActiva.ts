import { useEffect, useRef } from 'react'
import { AppState, Platform, Alert } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'

// Cierra la sesión del usuario si un admin inhabilita su cuenta (o si se
// auto-inhabilitó por inactividad).
//
// · INSTANTÁNEO: se suscribe por Realtime a su propia fila de profiles; en cuanto
//   `activo` pasa a false, cierra sesión de inmediato.
// · RESPALDO: además revisa verificar_acceso al montar, al volver a primer plano
//   y cada 60 s (por si Realtime no estuviera disponible).
//
// SOLO desloguea ante una señal explícita del servidor (activo=false o
// verificar_acceso=false), nunca ante errores de red → respeta el
// anti-deslogueo-falso.
export function useCuentaActiva(enabled: boolean): void {
  const yendo = useRef(false)
  useEffect(() => {
    if (!enabled) return
    let vivo = true

    async function forzarLogout() {
      if (yendo.current) return
      yendo.current = true
      try { await supabase.auth.signOut() } catch { /* no-op */ }
      const msg = 'Tu cuenta está inhabilitada temporalmente. Contacta a un administrador para reactivarla.'
      if (Platform.OS === 'web') { try { window.alert(msg) } catch { /* no-op */ } }
      else Alert.alert('Cuenta inhabilitada', msg)
      router.replace('/(auth)/login')
    }

    async function revisar() {
      if (yendo.current) return
      try {
        const { data, error } = await supabase.rpc('verificar_acceso')
        if (!vivo || error) return
        if (data === false) forzarLogout()
      } catch { /* sin red: no desloguear */ }
    }

    // Suscripción Realtime a la propia fila de profiles (deslogueo instantáneo).
    let canal: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (!vivo || !uid) return
      canal = supabase
        .channel(`cuenta-activa-${uid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
          (payload: any) => { if (payload?.new?.activo === false) forzarLogout() })
        .subscribe()
    }, () => {})

    revisar()
    const id = setInterval(revisar, 60_000)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') revisar() })
    let removeWeb: (() => void) | null = null
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => revisar()
      window.addEventListener('focus', onFocus)
      removeWeb = () => window.removeEventListener('focus', onFocus)
    }
    return () => {
      vivo = false
      clearInterval(id)
      sub.remove()
      removeWeb?.()
      if (canal) supabase.removeChannel(canal)
    }
  }, [enabled])
}
