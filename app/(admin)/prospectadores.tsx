import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Prospectador = {
  id: string
  email: string
  created_at: string
}

type Credenciales = {
  email: string
  password: string
}

function tiempoRelativo(fechaISO: string): string {
  const ahora = new Date()
  const fecha = new Date(fechaISO)
  const diffDias = Math.floor((ahora.getTime() - fecha.getTime()) / 86400000)
  if (diffDias === 0) return 'Hoy'
  if (diffDias === 1) return 'Ayer'
  if (diffDias < 30) return `Hace ${diffDias} días`
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function generarPassword(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#%'
  const todos = mayus + minus + nums + esp
  // Garantizar al menos uno de cada tipo
  let pwd =
    mayus[Math.floor(Math.random() * mayus.length)] +
    minus[Math.floor(Math.random() * minus.length)] +
    nums[Math.floor(Math.random() * nums.length)] +
    esp[Math.floor(Math.random() * esp.length)]
  for (let i = 4; i < 12; i++) {
    pwd += todos[Math.floor(Math.random() * todos.length)]
  }
  // Mezclar
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function copiarAlPortapapeles(texto: string) {
  if (Platform.OS === 'web') {
    navigator.clipboard?.writeText(texto)
  }
}

export default function Prospectadores() {
  const [lista, setLista] = useState<Prospectador[]>([])
  const [loading, setLoading] = useState(true)

  // Modal crear
  const [modalVisible, setModalVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [creando, setCreando] = useState(false)

  // Panel de credenciales tras crear
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_prospectadores')
    if (!error) setLista(data ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  function abrirModal() {
    setEmail('')
    setPassword(generarPassword())
    setVerPassword(false)
    setCredenciales(null)
    setModalVisible(true)
  }

  async function crearProspectador() {
    if (!email.trim()) { Alert.alert('Error', 'Ingresa un email.'); return }
    if (!password.trim()) { Alert.alert('Error', 'Ingresa una contraseña.'); return }

    setCreando(true)
    const { data, error } = await supabase.functions.invoke('crear-prospectador', {
      body: { email: email.trim().toLowerCase(), password },
    })
    setCreando(false)

    if (error || data?.error) {
      Alert.alert('Error', data?.error ?? 'No se pudo crear el usuario.')
      return
    }

    // Mostrar credenciales y actualizar lista
    setCredenciales({ email: email.trim().toLowerCase(), password })
    await cargar()
  }

  function cerrarModal() {
    setModalVisible(false)
    setCredenciales(null)
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btnNuevo} onPress={abrirModal}>
        <Text style={styles.btnNuevoText}>+ Nuevo prospectador</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#1a1a2e" style={{ marginTop: 40 }} />
      ) : lista.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin prospectadores</Text>
          <Text style={styles.emptySubtitle}>Crea el primero con el botón de arriba.</Text>
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardIcon}>
                <Text style={styles.cardIconText}>{item.email[0].toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardEmail}>{item.email}</Text>
                <Text style={styles.cardFecha}>Alta: {tiempoRelativo(item.created_at)}</Text>
              </View>
              <View style={styles.rolBadge}>
                <Text style={styles.rolText}>Prospectador</Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* Modal crear prospectador */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>

            {credenciales ? (
              /* ── Panel de credenciales creadas ── */
              <>
                <Text style={styles.modalTitulo}>Usuario creado</Text>
                <Text style={styles.modalSubtitulo}>
                  Comparte estas credenciales con el prospectador.
                </Text>

                <View style={styles.credCard}>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Email</Text>
                    <Text style={styles.credValor} selectable>{credenciales.email}</Text>
                    <TouchableOpacity onPress={() => copiarAlPortapapeles(credenciales.email)}>
                      <Text style={styles.copiarBtn}>Copiar</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.credSeparator} />
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Contraseña</Text>
                    <Text style={styles.credValor} selectable>{credenciales.password}</Text>
                    <TouchableOpacity onPress={() => copiarAlPortapapeles(credenciales.password)}>
                      <Text style={styles.copiarBtn}>Copiar</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.credHint}>
                  El prospectador ya puede iniciar sesión con estas credenciales.
                </Text>

                <TouchableOpacity style={styles.btnCerrar} onPress={cerrarModal}>
                  <Text style={styles.btnCerrarText}>Listo</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Formulario de creación ── */
              <>
                <Text style={styles.modalTitulo}>Nuevo prospectador</Text>
                <Text style={styles.modalSubtitulo}>
                  Se creará la cuenta y podrás darle las credenciales.
                </Text>

                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Contraseña</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Contraseña"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!verPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.verBtn}
                    onPress={() => setVerPassword(v => !v)}
                  >
                    <Text style={styles.verBtnText}>{verPassword ? 'Ocultar' : 'Ver'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.generarBtn}
                  onPress={() => setPassword(generarPassword())}
                >
                  <Text style={styles.generarText}>Generar contraseña segura</Text>
                </TouchableOpacity>

                <View style={styles.modalAcciones}>
                  <TouchableOpacity style={styles.btnCancelar} onPress={cerrarModal}>
                    <Text style={styles.btnCancelarText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnCrear, creando && { opacity: 0.6 }]}
                    onPress={crearProspectador}
                    disabled={creando}
                  >
                    {creando
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.btnCrearText}>Crear cuenta</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },

  btnNuevo: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnNuevoText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#aaa' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardEmail: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  cardFecha: { fontSize: 11, color: '#aaa', marginTop: 2 },
  rolBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rolText: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  modalSubtitulo: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18 },

  inputLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1a2e',
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  verBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  verBtnText: { fontSize: 13, color: '#555' },
  generarBtn: { alignSelf: 'flex-start', marginBottom: 20 },
  generarText: { fontSize: 12, color: '#1a6b9e', fontWeight: '600' },

  modalAcciones: { flexDirection: 'row', gap: 10 },
  btnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCancelarText: { color: '#888', fontSize: 14, fontWeight: '600' },
  btnCrear: {
    flex: 2,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCrearText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Panel credenciales
  credCard: {
    backgroundColor: '#f5f8ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0deff',
    padding: 16,
    marginBottom: 12,
  },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credLabel: { fontSize: 11, fontWeight: '700', color: '#888', width: 80 },
  credValor: { flex: 1, fontSize: 13, color: '#1a1a2e', fontWeight: '600' },
  copiarBtn: { fontSize: 12, color: '#1a6b9e', fontWeight: '700' },
  credSeparator: { height: 1, backgroundColor: '#e0e8ff', marginVertical: 10 },
  credHint: { fontSize: 12, color: '#aaa', marginBottom: 20, lineHeight: 17 },
  btnCerrar: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCerrarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
