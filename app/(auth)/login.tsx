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
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'

const LOGO_URI = 'https://valerarealestate.com/images/logo.png'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
      // Notificar a los admins que el prospectador inició sesión
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
      {/* Sección superior — teal con logo */}
      <View style={styles.topSection}>
        <Image
          source={{ uri: LOGO_URI }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Deja que nos preocupemos por ti</Text>
      </View>

      {/* Tarjeta de login */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Iniciar sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#1a6470" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
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
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 16,
    marginBottom: 16,
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
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 48,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a6470',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: '#f4f8f8',
    borderWidth: 1,
    borderColor: '#dde8e9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
    color: '#1a2e30',
  },
  button: {
    backgroundColor: '#c9a84c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
