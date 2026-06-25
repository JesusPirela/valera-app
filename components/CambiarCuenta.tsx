import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert, StyleSheet, TextInput } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  listarCuentas, cambiarACuenta, cambiarACuentaConPassword,
  olvidarCuenta, guardarPasswordCuenta, obtenerPasswordCuenta,
  accountSwitch,
  type CuentaGuardada,
} from '../lib/cuentas'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', supervisor: 'Supervisor',
  prospectador: 'Prospectador', prospectador_plus: 'Prospectador Plus', nuevo: 'Nuevo',
}

export default function CambiarCuenta() {
  const c = useColors()
  const qc = useQueryClient()
  const [cuentas, setCuentas] = useState<CuentaGuardada[]>([])
  const [actualId, setActualId] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [cambiando, setCambiando] = useState<string | null>(null)
  const [necesitaPass, setNecesitaPass] = useState<CuentaGuardada | null>(null)
  const [password, setPassword] = useState('')

  // Agregar nueva cuenta
  const [agregando, setAgregando] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoPass, setNuevoPass] = useState('')
  const [agregandoLoad, setAgregandoLoad] = useState(false)

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

  async function irAHome(role: string | null | undefined) {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const cacheKeys = keys.filter(k => k.startsWith('VALERA_CACHE'))
      if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys)
    } catch {}
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
    const passGuardada = await obtenerPasswordCuenta(cuenta.user_id)
    if (passGuardada) {
      const res = await cambiarACuentaConPassword(cuenta, passGuardada)
      setCambiando(null)
      if (res.ok) { await irAHome(cuenta.role); return }
      setNecesitaPass(cuenta)
      return
    }
    const res = await cambiarACuenta(cuenta)
    setCambiando(null)
    if (!res.ok) {
      accountSwitch.pending = true
      setNecesitaPass(cuenta)
      return
    }
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
    guardarPasswordCuenta(cuenta.user_id, pass).catch(() => {})
    setNecesitaPass(null)
    setPassword('')
    await irAHome(cuenta.role)
  }

  function cancelarPassword() {
    accountSwitch.pending = false
    setNecesitaPass(null)
    setPassword('')
  }

  async function eliminarCuenta(cuenta: CuentaGuardada) {
    const confirmar = Platform.OS === 'web'
      ? window.confirm(`¿Eliminar la cuenta de ${cuenta.nombre || cuenta.email}?`)
      : await new Promise<boolean>(resolve =>
          Alert.alert(
            'Eliminar cuenta',
            `¿Quitar la cuenta de ${cuenta.nombre || cuenta.email} de este dispositivo?`,
            [{ text: 'Cancelar', onPress: () => resolve(false), style: 'cancel' },
             { text: 'Eliminar', onPress: () => resolve(true), style: 'destructive' }],
          ))
    if (!confirmar) return
    await olvidarCuenta(cuenta.user_id)
    setCuentas(prev => prev.filter(c => c.user_id !== cuenta.user_id))
    if (necesitaPass?.user_id === cuenta.user_id) cancelarPassword()
  }

  async function agregarCuenta() {
    const email = nuevoEmail.trim()
    const pass = nuevoPass.trim()
    if (!email || !pass) return
    setAgregandoLoad(true)
    accountSwitch.pending = true
    let data: any, error: any
    try {
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password: pass }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado. Verifica tu conexión.')), 10_000)
        ),
      ]) as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>
      data = result.data; error = result.error
    } catch (e: any) {
      setAgregandoLoad(false)
      accountSwitch.pending = false
      Platform.OS === 'web' ? window.alert(e.message) : Alert.alert('Error', e.message)
      return
    }
    setAgregandoLoad(false)
    if (error || !data.session) {
      accountSwitch.pending = false
      const msg = error?.message?.includes('Invalid') ? 'Email o contraseña incorrectos.' : (error?.message ?? 'No se pudo iniciar sesión.')
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg)
      return
    }
    guardarPasswordCuenta(data.session.user.id, pass).catch(() => {})
    setNuevoEmail('')
    setNuevoPass('')
    setAgregando(false)
    await irAHome(data.session.user.user_metadata?.role ?? null)
  }

  const otras = cuentas.filter(x => x.user_id !== actualId)

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
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            autoFocus
            onSubmitEditing={confirmarPassword}
            returnKeyType="go"
          />
          <View style={s.passRow}>
            <TouchableOpacity style={[s.passBtnSecondary, { borderColor: c.border }]} onPress={cancelarPassword}>
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

      {/* Cuentas guardadas */}
      {otras.map(cuenta => {
        const inicial = (cuenta.nombre || cuenta.email || '?')[0].toUpperCase()
        const estaEsperandoPass = necesitaPass?.user_id === cuenta.user_id
        return (
          <View key={cuenta.user_id} style={[s.fila, { backgroundColor: c.card, borderColor: estaEsperandoPass ? '#c9a84c' : c.border }]}>
            <TouchableOpacity
              style={s.filaMain}
              onPress={() => {
                if (estaEsperandoPass) return
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
            <TouchableOpacity
              style={s.eliminarBtn}
              onPress={() => eliminarCuenta(cuenta)}
              disabled={!!cambiando}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.eliminarIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        )
      })}

      {/* Agregar nueva cuenta */}
      {agregando ? (
        <View style={[s.passPanel, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.passLabel, { color: c.text }]}>Iniciar sesión en otra cuenta</Text>
          <TextInput
            style={[s.passInput, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
            placeholder="Correo electrónico"
            placeholderTextColor={c.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={nuevoEmail}
            onChangeText={setNuevoEmail}
            autoFocus
            returnKeyType="next"
          />
          <TextInput
            style={[s.passInput, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
            placeholder="Contraseña"
            placeholderTextColor={c.placeholder}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={nuevoPass}
            onChangeText={setNuevoPass}
            onSubmitEditing={agregarCuenta}
            returnKeyType="go"
          />
          <View style={s.passRow}>
            <TouchableOpacity
              style={[s.passBtnSecondary, { borderColor: c.border }]}
              onPress={() => { setAgregando(false); setNuevoEmail(''); setNuevoPass('') }}
            >
              <Text style={[s.passBtnSecondaryText, { color: c.textMute }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.passBtn, { backgroundColor: '#1a6470', opacity: agregandoLoad || !nuevoEmail.trim() || !nuevoPass.trim() ? 0.6 : 1 }]}
              onPress={agregarCuenta}
              disabled={agregandoLoad || !nuevoEmail.trim() || !nuevoPass.trim()}
            >
              {agregandoLoad
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.passBtnText}>Entrar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.agregarBtn, { borderColor: c.border }]}
          onPress={() => setAgregando(true)}
          disabled={!!cambiando}
        >
          <Text style={[s.agregarTxt, { color: c.textMute }]}>＋ Agregar otra cuenta</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  titulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  fila: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, marginBottom: 8, overflow: 'hidden',
  },
  filaMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
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
  eliminarBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: '#eee',
  },
  eliminarIcon: { fontSize: 14, color: '#aaa', fontWeight: '700' },
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
  agregarBtn: {
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center', marginBottom: 4,
  },
  agregarTxt: { fontSize: 14, fontWeight: '600' },
})
