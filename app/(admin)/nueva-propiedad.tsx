import { useState } from 'react'
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  View,
  FlatList,
  Switch,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import PillSelector from '../../components/ui/PillSelector'
import DropdownModal from '../../components/ui/DropdownModal'

const RECAMARAS_OPTIONS = [
  { value: null, label: '—' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5+' },
]
const BANOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
]
const ESTACIONAMIENTOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]

export default function NuevaPropiedad() {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [direccion, setDireccion] = useState('')
  const [operacion, setOperacion] = useState<'venta' | 'renta'>('venta')
  const [tipo, setTipo] = useState<'casa' | 'departamento' | 'local'>('casa')
  const [estado, setEstado] = useState<'disponible' | 'vendida'>('disponible')
  const [recamaras, setRecamaras] = useState<number | null>(null)
  const [banos, setBanos] = useState<number | null>(null)
  const [m2, setM2] = useState('')
  const [estacionamientos, setEstacionamientos] = useState<number | null>(null)
  const [exclusiva, setExclusiva] = useState(false)
  const [imagenes, setImagenes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [mejorando, setMejorando] = useState(false)

  async function seleccionarImagenes() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    })
    if (!result.canceled) {
      setImagenes((prev) => [...prev, ...result.assets.map((a) => a.uri)])
    }
  }

  function quitarImagen(uri: string) {
    setImagenes((prev) => prev.filter((u) => u !== uri))
  }

  async function handleMejorarDescripcion() {
    setMejorando(true)
    try {
      const { data, error } = await supabase.functions.invoke('mejorar-descripcion', {
        body: { titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, m2 },
      })
      if (error) throw error
      if (data?.texto) setDescripcion(data.texto)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo mejorar la descripción.')
    } finally {
      setMejorando(false)
    }
  }

  async function subirImagen(uri: string, propiedadId: string, orden: number): Promise<string> {
    const response = await fetch(uri)
    const blob = await response.blob()
    const mimeType = blob.type || 'image/jpeg'
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
    const filePath = `${propiedadId}/${orden}.${ext}`
    const { error } = await supabase.storage
      .from('propiedades')
      .upload(filePath, blob, { contentType: mimeType, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('propiedades').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function handleGuardar() {
    if (!titulo.trim() || !direccion.trim()) {
      Alert.alert('Error', 'El título y la dirección son obligatorios.')
      return
    }
    const precioNum = precio ? parseFloat(precio) : null
    if (precio && isNaN(precioNum!)) {
      Alert.alert('Error', 'El precio debe ser un número válido.')
      return
    }
    const m2Num = m2 ? parseFloat(m2) : null
    if (m2 && isNaN(m2Num!)) {
      Alert.alert('Error', 'Los m² deben ser un número válido.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { count } = await supabase.from('propiedades').select('*', { count: 'exact', head: true })
      const num = (count ?? 0) + 1
      const codigo = `VR-${String(num).padStart(3, '0')}`

      const { data: propiedad, error: errorPropiedad } = await supabase
        .from('propiedades')
        .insert({
          codigo,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          precio: precioNum,
          direccion: direccion.trim(),
          operacion,
          tipo,
          estado,
          recamaras,
          banos,
          m2: m2Num,
          estacionamientos,
          exclusiva,
          created_by: user!.id,
        })
        .select('id')
        .single()

      if (errorPropiedad) throw errorPropiedad

      if (imagenes.length > 0) {
        const registros = await Promise.all(
          imagenes.map(async (uri, index) => {
            const url = await subirImagen(uri, propiedad.id, index)
            return { propiedad_id: propiedad.id, url, orden: index }
          })
        )
        const { error: errorImagenes } = await supabase.from('propiedad_imagenes').insert(registros)
        if (errorImagenes) throw errorImagenes
      }

      Alert.alert('Éxito', 'Propiedad agregada correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la propiedad.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(admin)/propiedades')}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Imágenes</Text>
        {imagenes.length > 0 && (
          <FlatList
            data={imagenes}
            horizontal
            keyExtractor={(uri) => uri}
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 10 }}
            renderItem={({ item }) => (
              <View style={styles.miniatura}>
                <Image source={{ uri: item }} style={styles.miniaturaImg} />
                <TouchableOpacity style={styles.miniaturaQuitar} onPress={() => quitarImagen(item)}>
                  <Text style={styles.miniaturaQuitarText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        <TouchableOpacity style={styles.imagenPicker} onPress={seleccionarImagenes}>
          <Text style={styles.imagenPickerText}>+ Agregar fotos</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Casa en la colonia Roma"
          value={titulo}
          onChangeText={setTitulo}
          maxLength={100}
        />

        <Text style={styles.label}>Dirección *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Calle Valera 123, Piso 2"
          value={direccion}
          onChangeText={setDireccion}
          maxLength={200}
        />

        <Text style={styles.label}>Operación</Text>
        <PillSelector
          options={[{ value: 'venta', label: 'Venta' }, { value: 'renta', label: 'Renta' }]}
          value={operacion}
          onChange={setOperacion}
        />

        <Text style={styles.label}>Tipo</Text>
        <PillSelector
          options={[
            { value: 'casa', label: 'Casa' },
            { value: 'departamento', label: 'Departamento' },
            { value: 'local', label: 'Local' },
          ]}
          value={tipo}
          onChange={setTipo}
        />

        <Text style={styles.label}>Estado</Text>
        <PillSelector
          options={[{ value: 'disponible', label: 'Disponible' }, { value: 'vendida', label: 'Vendida' }]}
          value={estado}
          onChange={setEstado}
        />

        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Recámaras</Text>
            <DropdownModal options={RECAMARAS_OPTIONS} value={recamaras} onChange={setRecamaras} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Baños</Text>
            <DropdownModal options={BANOS_OPTIONS} value={banos} onChange={setBanos} />
          </View>
        </View>

        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>M²</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 120"
              value={m2}
              onChangeText={setM2}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Estacionamientos</Text>
            <DropdownModal options={ESTACIONAMIENTOS_OPTIONS} value={estacionamientos} onChange={setEstacionamientos} />
          </View>
        </View>

        <Text style={styles.label}>Precio (MXN)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 2500000"
          value={precio}
          onChangeText={setPrecio}
          keyboardType="numeric"
          maxLength={15}
        />

        <View style={styles.labelRow}>
          <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Descripción</Text>
          <TouchableOpacity style={styles.btnIA} onPress={handleMejorarDescripcion} disabled={mejorando}>
            {mejorando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnIAText}>✦ Mejorar con IA</Text>
            }
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Detalles de la propiedad..."
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          numberOfLines={4}
          maxLength={1000}
          textAlignVertical="top"
        />

        <View style={styles.exclusivaRow}>
          <View>
            <Text style={styles.exclusivaLabel}>Propiedad exclusiva</Text>
            <Text style={styles.exclusivaDesc}>Solo visible para Prospectadores Plus</Text>
          </View>
          <Switch
            value={exclusiva}
            onValueChange={setExclusiva}
            trackColor={{ false: '#ddd', true: '#c0392b' }}
            thumbColor={exclusiva ? '#fff' : '#f4f3f4'}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleGuardar}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar propiedad</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f5f5' },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' as const },
  label: { fontSize: 14, fontWeight: '600', color: '#1a6470', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a6470',
  },
  textArea: { height: 100, paddingTop: 12 },
  imagenPicker: {
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  imagenPickerText: { color: '#888', fontSize: 15 },
  miniatura: { position: 'relative', marginRight: 10 },
  miniaturaImg: { width: 100, height: 100, borderRadius: 10 },
  miniaturaQuitar: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaQuitarText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  btnIA: {
    backgroundColor: '#4a4a8a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  btnIAText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 40,
  },
  cancelText: { color: '#666', fontSize: 16 },
  exclusivaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  exclusivaLabel: { fontSize: 14, fontWeight: '600', color: '#1a6470' },
  exclusivaDesc: { fontSize: 12, color: '#888', marginTop: 2 },
})
