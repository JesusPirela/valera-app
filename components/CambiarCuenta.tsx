import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { listarCuentas, cambiarACuenta, olvidarCuenta, type CuentaGuardada } from '../lib/cuentas'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', supervisor: 'Supervisor',
  prospectador: 'Prospectador', prospectador_plus: 'Prospectador Plus', nuevo: 'Nuevo',
}

// Botón/sección "Cambiar de cuenta". Solo se muestra si en este dispositivo se
// ha iniciado sesión en 2 o más cuentas. El cambio es inmediato (sin contraseña)
// usando la sesión guardada de cada cuenta.
export default function CambiarCuenta() {
  const c = useColors()
  const qc = useQueryClient()
  const [cuentas, setCuentas] = useState<CuentaGuardada[]>([])
  const [actualId, setActualId] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [cambiando, setCambiando] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const [lista, { data }] = await Promise.all([
        listarCuentas(),
        supabase.auth.getSession(),
      ])
      setCuentas(lista)
      setActualId(data.session?.user?.id ?? null)
      setListo(true)
    }
    init()
  }, [])

  if (!listo) return null
  const otras = cuentas.filter(x => x.user_id !== actualId)
  if (otras.length === 0) return null

  async function switchTo(cuenta: CuentaGuardada) {
    setCambiando(cuenta.user_id)
    const res = await cambiarACuenta(cuenta)
    setCambiando(null)
    if (!res.ok) {
      // Quitar la cuenta caducada de la lista para que no bloquee futuros intentos
      await olvidarCuenta(cuenta.user_id)
      setCuentas(prev => prev.filter(c => c.user_id !== cuenta.user_id))
      const msg = 'La sesión de esa cuenta caducó. Para volver a cambiar a ella, inicia sesión con su correo y contraseña.'
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Sesión caducada', msg)
      return
    }
    // En este punto setSession ya completó y la nueva sesión está activa.
    // Limpiar cache y navegar al home del nuevo usuario según su rol.
    qc.clear()
    const destino = (cuenta.role === 'admin' || cuenta.role === 'supervisor')
      ? '/(admin)/propiedades'
      : '/(prospectador)/propiedades'
    router.replace(destino as any)
  }

  return (
    <View style={s.wrap}>
      <Text style={[s.titulo, { color: c.textMute }]}>CAMBIAR DE CUENTA</Text>
      {otras.map(cuenta => {
        const inicial = (cuenta.nombre || cuenta.email || '?')[0].toUpperCase()
        return (
          <TouchableOpacity
            key={cuenta.user_id}
            style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => switchTo(cuenta)}
            disabled={!!cambiando}
            activeOpacity={0.8}
          >
            <View style={s.avatar}><Text style={s.avatarTxt}>{inicial}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{cuenta.nombre || cuenta.email}</Text>
              <Text style={[s.meta, { color: c.textMute }]} numberOfLines={1}>
                {cuenta.email}{cuenta.role ? ` · ${ROLE_LABEL[cuenta.role] ?? cuenta.role}` : ''}
              </Text>
            </View>
            {cambiando === cuenta.user_id
              ? <ActivityIndicator size="small" color="#1a6470" />
              : <Text style={[s.chevron, { color: c.textMute }]}>⇄</Text>}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  titulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a6470',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  nombre: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 1 },
  chevron: { fontSize: 20, fontWeight: '700' },
})
