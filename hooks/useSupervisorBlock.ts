import { useCallback } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'

// Bloquea pantallas de configuración global / Super Admin para el rol Supervisor
export function useSupervisorBlock() {
  useFocusEffect(
    useCallback(() => {
      let activo = true
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session || !activo) return
        supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            if (activo && data?.role === 'supervisor') {
              router.replace('/(admin)/propiedades')
            }
          })
      })
      return () => { activo = false }
    }, [])
  )
}
