import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  StatusBar,
  ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      if (Platform.OS === 'web') window.alert('Por favor ingresa tu correo y contraseña')
      else Alert.alert('Error', 'Por favor ingresa tu correo y contraseña')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      if (Platform.OS === 'web') window.alert(error.message)
      else Alert.alert('Error al iniciar sesión', error.message)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, nombre')
      .eq('id', data.user.id)
      .single()

    if (profile?.role === 'admin') {
      router.replace('/(admin)/propiedades')
    } else {
      await supabase.rpc('notificar_admins_login_prospectador', {
        p_prospectador_nombre: profile?.nombre ?? 'Un prospectador',
      })
      router.replace('/(prospectador)/propiedades')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1a6470" />

      {/* Top section – branding */}
      <View style={styles.topSection}>
        <Image
          source={{ uri: LOGO_URI }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Deja que nos preocupemos por ti</Text>
      </View>

      {/* Login card */}
      <ScrollView
        contentContainerStyle={styles.cardScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>
          <Text style={styles.cardSubtitle}>Accede a tu cuenta Valera</Text>

          {/* Email input */}
          <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={emailFocused ? '#1a6470' : '#bbb'}
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
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
          </View>

          {/* Password input */}
          <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={passwordFocused ? '#1a6470' : '#bbb'}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Contraseña"
              placeholderTextColor="#bbb"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a6470',
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
    minHeight: 220,
  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: 20,
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
  cardScroll: {
    flexGrow: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 48,
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
  inputWrapperFocused: {
    borderColor: '#1a6470',
    backgroundColor: '#fff',
    shadowColor: '#1a6470',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
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
