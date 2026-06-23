import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert, StyleSheet, TextInput } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  listarCuentas, cambiarACuenta, cambiarACuentaConPassword,
  olvidarCuenta, guardarPasswordCuenta, obtenerPasswordCuenta,
  type CuentaGuardada,
} from '../lib/cuentas'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', supervisor: 'Supervisor',
  prospectador: 'Prospectador', prospectador_plus: 'Prospectador Plus', nuevo: 'Nuevo',
}

// Botón/sección "Cambiar de cuenta". Solo se muestra si en este dispositivo se
// ha iniciado sesión en 2 o más cuentas. El cambio es inmediato (sin contraseña)
// usando la sesión guardada de cada cuenta. Si los tokens caducaron se pide la
// contraseña directamente en este componente, sin obligar al usuario a salir.
export default function CambiarCuenta() {
  const c = useColors()
  const qc = useQueryClient()
  const [cuentas, setCuentas] = useState<CuentaGuardada[]>([])
  const [actualId, setActualId] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [cambiando, setCambiando] = useState<string | null>(null)
  // Cuando los tokens de una cuenta caducaron: pedimos la contraseña inline
  const [necesitaPass, setNecesitaPass] = useState<CuentaGuardada | null>(null)
  const [password, setPassword] = useState('')

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

  async function irAHome(role: string | null | undefined) {
    // Borramos el caché persistido para que el nuevo usuario no vea datos del anterior
    try { await AsyncStorage.removeItem('VALERA_CACHE') } catch {}
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Reload completo en web: garantiza que React Query y todos los contextos
      // reinicien desde cero con la sesión del nuevo usuario ya en localStorage.
      window.location.replace('/')
      return
    }
    qc.clear()
    const destino = (role === 'admin' || role === 'supervisor')
      ? '/(admin)/propiedades'
      : '/(prospectador)/propiedades'
    router.replace(destino as any)
  }

  async function switchTo(cuenta: CuentaGuardada) {
    setCambiando(cuenta.user_id)
    const res = await cambiarACuenta(cuenta)
    if (!res.ok) {
      if (res.tokenVencido) {
        // Tokens inválidos: intentar con contraseña guardada primero.
        const passGuardada = await obtenerPasswordCuenta(cuenta.user_id)
        if (passGuardada) {
          const res2 = await cambiarACuentaConPassword(cuenta, passGuardada)
          setCambiando(null)
          if (res2.ok) {
            await irAHome(cuenta.role)
            return
          }
          // La contraseña guardada ya no es válida: pedir de nuevo.
        } else {
          setCambiando(null)
        }
        // Mostrar campo de contraseña inline.
        setNecesitaPass(cuenta)
      } else {
        setCambiando(null)
        const msg = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error de conexión', msg)
      }
      return
    }
    setCambiando(null)
    await irAHome(res.role)
  }

  async function confirmarPassword() {
    if (!necesitaPass || !password.trim()) return
    const cuenta = necesitaPass
    const pass = password.trim()
    setCambiando(cuenta.user_id)
    const res = await cambiarACuentaConPassword(cuenta, pass)
    setCambiando(null)
    if (!res.ok) {
      const msg = res.error?.includes('Invalid login') || res.error?.includes('invalid')
        ? 'Contraseña incorrecta. Intenta de nuevo.'
        : `No se pudo iniciar sesión: ${res.error}`
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg)
      return
    }
    // Guardar la contraseña para futuros cambios de cuenta sin pedirla de nuevo.
    guardarPasswordCuenta(cuenta.user_id, pass).catch(() => {})
    setNecesitaPass(null)
    setPassword('')
    await irAHome(cuenta.role)
  }

  function cancelarPassword() {
    setNecesitaPass(null)
    setPassword('')
  }

  return (
    <View style={s.wrap}>
      <Text style={[s.titulo, { color: c.textMute }]}>CAMBIAR DE CUENTA</Text>

      {/* Panel de contraseña inline cuando los tokens caducaron */}
      {necesitaPass && (
        <View style={[s.passPanel, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.passLabel, { color: c.text }]}>
            Ingresa la contraseña de {necesitaPass.nombre || necesitaPass.email}
          </Text>
          <TextInput
            style={[s.passInput, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
            placeholder="Contraseña"
            placeholderTextColor={c.placeholder}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoFocus
            onSubmitEditing={confirmarPassword}
            returnKeyType="go"
          />
          <View style={s.passRow}>
            <TouchableOpacity
              style={[s.passBtnSecondary, { borderColor: c.border }]}
              onPress={cancelarPassword}
            >
              <Text style={[s.passBtnSecondaryText, { color: c.textMute }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.passBtn, { backgroundColor: '#1a6470', opacity: cambiando ? 0.6 : 1 }]}
              onPress={confirmarPassword}
              disabled={!!cambiando || !password.trim()}
            >
              {cambiando === necesitaPass.user_id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.passBtnText}>Entrar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {otras.map(cuenta => {
        const inicial = (cuenta.nombre || cuenta.email || '?')[0].toUpperCase()
        const estaEsperandoPass = necesitaPass?.user_id === cuenta.user_id
        return (
          <TouchableOpacity
            key={cuenta.user_id}
            style={[
              s.fila,
              { backgroundColor: c.card, borderColor: estaEsperandoPass ? '#c9a84c' : c.border },
            ]}
            onPress={() => {
              if (estaEsperandoPass) return  // ya tiene el panel abierto
              switchTo(cuenta)
            }}
            disabled={!!cambiando}
            activeOpacity={0.8}
          >
            <View style={s.avatar}><Text style={s.avatarTxt}>{inicial}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{cuenta.nombre || cuenta.email}</Text>
              <Text style={[s.meta, { color: c.textMute }]} numberOfLines={1}>
                {cuenta.email}{cuenta.role ? ` · ${ROLE_LABEL[cuenta.role] ?? cuenta.role}` : ''}
              </Text>
              {estaEsperandoPass && (
                <Text style={[s.passHint, { color: '#c9a84c' }]}>Requiere contraseña ↑</Text>
              )}
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
  passHint: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  passPanel: {
    borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 10,
  },
  passLabel: { fontSize: 14, fontWeight: '600' },
  passInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15,
  },
  passRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  passBtnSecondary: {
    borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 16,
  },
  passBtnSecondaryText: { fontSize: 14, fontWeight: '600' },
  passBtn: {
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center', minWidth: 80,
  },
  passBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
