import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
  StatusBar,
  ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { actualizarNombreRole } from '../../lib/cuentas'
import { conTimeout } from '../../lib/redIntentos'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/logo-recortado.png')

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      if (Platform.OS === 'web') window.alert('Por favor ingresa tu correo y contraseña')
      else Alert.alert('Error', 'Por favor ingresa tu correo y contraseña')
      return
    }

    setLoading(true)
    try {
      // Timeout para que el botón nunca se quede girando indefinidamente si la
      // red (o el lock de auth) se cuelga.
      const { data, error } = await conTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        15_000,
      )

      if (error) {
        if (Platform.OS === 'web') window.alert(error.message)
        else Alert.alert('Error al iniciar sesión', error.message)
        return
      }
      if (!data?.session || !data.user) {
        const msg = 'No se pudo iniciar sesión. Intenta de nuevo.'
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg)
        return
      }

      const uid = data.user.id
      // Rol: la sesión YA está establecida. Si la consulta de perfil falla o
      // tarda, no bloqueamos el ingreso: usamos el rol de user_metadata o, en
      // último caso, entramos como prospectador. Antes, un .single() que fallara
      // (perfil faltante, RLS, o cuelgue) dejaba al usuario atorado en el login
      // aunque ya estuviera autenticado.
      let role: string | null = (data.user.user_metadata as any)?.role ?? null
      let nombre: string | null = null
      try {
        const { data: profile } = await conTimeout(
          supabase.from('profiles').select('role, nombre').eq('id', uid).maybeSingle(),
          8_000,
        )
        if (profile) { role = profile.role ?? role; nombre = profile.nombre ?? null }
      } catch { /* usar role de metadata / default */ }

      supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid).then(() => {}, () => {})
      actualizarNombreRole(uid, { nombre, role }).catch(() => {})

      if (role === 'admin' || role === 'supervisor') {
        router.replace('/(admin)/propiedades')
      } else {
        // Fire-and-forget: no debe bloquear la navegación.
        supabase.rpc('notificar_admins_login_prospectador', {
          p_prospectador_nombre: nombre ?? 'Un prospectador',
        }).then(() => {}, () => {})
        router.replace('/(prospectador)/propiedades')
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Error de conexión. Verifica tu internet e intenta de nuevo.')
      else Alert.alert('Error de conexión', 'Verifica tu internet e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1a6470" />

      {/* Top section – branding */}
      <View style={styles.topSection}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Deja que nos preocupemos por ti</Text>
      </View>

      {/* Login card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Iniciar sesión</Text>
        <Text style={styles.cardSubtitle}>Accede a tu cuenta Valera</Text>

        {/* Email input */}
        <View style={styles.inputWrapper}>
          <Ionicons
            name="mail-outline"
            size={18}
            color="#bbb"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor="#bbb"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            nativeID="email"
            autoComplete="email"
          />
        </View>

        {/* Password input */}
        <View style={styles.inputWrapper}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color="#bbb"
            style={styles.inputIcon}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Contraseña"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            nativeID="password"
            autoComplete="current-password"
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color="#bbb"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Plataforma exclusiva para asesores Valera Real Estate
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a6470',
  },
  scrollContent: {
    flexGrow: 1,
  },
  topSection: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  // Proporción del logo recortado (1.53). Antes era una caja cuadrada de
  // 160x160 y, como el PNG traía un margen enorme, el logo visible quedaba en
  // ~94x62. Sin borderRadius: ahora la imagen llega al borde de la caja y
  // redondear recortaría las esquinas del marco del logo.
  logo: {
    width: 220,
    height: 144,
    marginBottom: 12,
  },
  tagline: {
    color: '#c9a84c',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 60,
    flex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 16,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#9eafb2',
    marginBottom: 28,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f8f8',
    borderWidth: 1.5,
    borderColor: '#e0eaec',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 15,
    color: '#1a2e30',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 6,
  },
  button: {
    backgroundColor: '#c9a84c',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#c9a84c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  footerNote: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 12,
    marginTop: 20,
    lineHeight: 16,
  },
})
