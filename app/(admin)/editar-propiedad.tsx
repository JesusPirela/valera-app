import { useState, useEffect } from 'react'
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
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'
import PillSelector from '../../components/ui/PillSelector'
import DropdownModal from '../../components/ui/DropdownModal'
import AsesorPicker from '../../components/ui/AsesorPicker'
import InmobiliariaPicker from '../../components/ui/InmobiliariaPicker'
import { COLONIAS } from '../../lib/colonias'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type ImagenExistente = { id: string; url: string; orden: number }

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

export default function EditarPropiedad() {
  useSupervisorBlock()
  const c = useColors()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [direccion, setDireccion] = useState('')
  const [operacion, setOperacion] = useState<'venta' | 'renta'>('venta')
  const [tipo, setTipo] = useState<'casa' | 'departamento' | 'local' | 'terreno'>('casa')
  const [estado, setEstado] = useState<'disponible' | 'vendida'>('disponible')
  const [recamaras, setRecamaras] = useState<number | null>(null)
  const [banos, setBanos] = useState<number | null>(null)
  const [m2, setM2] = useState('')
  const [m2Terreno, setM2Terreno] = useState('')
  const [estacionamientos, setEstacionamientos] = useState<number | null>(null)
  const [zona, setZona] = useState<'queretaro' | 'monterrey' | 'puebla' | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<any[]>([])
  const [geoLoading, setGeoLoading] = useState(false)
  const [asesorId, setAsesorId] = useState<string | null>(null)
  const [inmobiliariaId, setInmobiliariaId] = useState<string | null>(null)
  const [exclusiva, setExclusiva] = useState(false)
  const [esConstructora, setEsConstructora] = useState(false)
  const [nombreConstructora, setNombreConstructora] = useState('')
  const [imagenesExistentes, setImagenesExistentes] = useState<ImagenExistente[]>([])
  const [imagenesEliminar, setImagenesEliminar] = useState<string[]>([])
  const [imagenesNuevas, setImagenesNuevas] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [mejorando, setMejorando] = useState(false)

  useEffect(() => { cargarPropiedad() }, [id])

  async function cargarPropiedad() {
    setLoading(true)
    const { data, error } = await supabase
      .from('propiedades')
      .select('titulo, descripcion, precio, direccion, operacion, tipo, estado, zona, lat, lng, recamaras, banos, m2, m2_terreno, estacionamientos, asesor_id, inmobiliaria_id, exclusiva, es_constructora, nombre_constructora, propiedad_imagenes(id, url, orden)')
      .eq('id', id)
      .single()

    if (error || !data) {
      Alert.alert('Error', 'No se pudo cargar la propiedad.')
      router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')
      return
    }

    setTitulo(data.titulo ?? '')
    setDescripcion(data.descripcion ?? '')
    setPrecio(data.precio != null ? String(data.precio) : '')
    setDireccion(data.direccion ?? '')
    setGeoQuery(data.direccion ?? '')
    setLat((data as any).lat ?? null)
    setLng((data as any).lng ?? null)
    setOperacion((data.operacion as 'venta' | 'renta') ?? 'venta')
    setTipo((data.tipo as 'casa' | 'departamento' | 'local') ?? 'casa')
    setEstado((data.estado as 'disponible' | 'vendida') ?? 'disponible')
    setZona((data.zona as 'queretaro' | 'monterrey' | 'puebla') ?? null)
    setRecamaras(data.recamaras ?? null)
    setBanos(data.banos ?? null)
    setM2(data.m2 != null ? String(data.m2) : '')
    setM2Terreno(data.m2_terreno != null ? String(data.m2_terreno) : '')
    setEstacionamientos(data.estacionamientos ?? null)
    setAsesorId(data.asesor_id ?? null)
    setInmobiliariaId(data.inmobiliaria_id ?? null)
    setExclusiva(data.exclusiva ?? false)
    setEsConstructora(data.es_constructora ?? false)
    setNombreConstructora(data.nombre_constructora ?? '')
    setImagenesExistentes(
      ((data.propiedad_imagenes as ImagenExistente[]) ?? []).sort((a, b) => a.orden - b.orden)
    )
    setLoading(false)
  }

  function quitarImagenExistente(imagenId: string) {
    setImagenesExistentes((prev) => prev.filter((img) => img.id !== imagenId))
    setImagenesEliminar((prev) => [...prev, imagenId])
  }

  function quitarImagenNueva(uri: string) {
    setImagenesNuevas((prev) => prev.filter((u) => u !== uri))
  }

  const coloniasSugeridas = geoQuery.length >= 2
    ? COLONIAS.filter(c => c.label.toLowerCase().includes(geoQuery.toLowerCase()))
    : []

  useEffect(() => {
    if (!geoQuery.trim() || geoQuery.length < 3) { setGeoResults([]); return }
    const cityHint = zona === 'queretaro' ? 'Querétaro' : zona === 'monterrey' ? 'Monterrey' : zona === 'puebla' ? 'Puebla' : ''
    const q = `${geoQuery}${cityHint ? ' ' + cityHint : ''} Mexico`
    const t = setTimeout(async () => {
      setGeoLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=mx`
        )
        const data = await res.json()
        setGeoResults(Array.isArray(data) ? data : [])
      } catch { setGeoResults([]) }
      finally { setGeoLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [geoQuery, zona])

  function seleccionarColoniaPredefinida(col: typeof COLONIAS[0]) {
    const texto = `${col.label}, ${col.ciudad}, México`
    setDireccion(texto); setGeoQuery(texto)
    setLat(col.lat); setLng(col.lng)
    setZona(col.zona); setGeoResults([])
  }

  function seleccionarUbicacion(r: any) {
    const partes = r.display_name.split(',').slice(0, 4).join(', ').trim()
    setDireccion(partes); setGeoQuery(partes)
    setLat(parseFloat(r.lat)); setLng(parseFloat(r.lon))
    setGeoResults([])
    const dn = r.display_name.toLowerCase()
    if (dn.includes('querétaro') || dn.includes('queretaro')) setZona('queretaro')
    else if (dn.includes('monterrey') || dn.includes('nuevo león') || dn.includes('nuevo leon')) setZona('monterrey')
    else if (dn.includes('puebla')) setZona('puebla')
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return
    let cleanup: (() => void) | undefined

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? []) as File[]
      const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f))
      if (urls.length > 0) setImagenesNuevas(prev => [...prev, ...urls])
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
    const onDragLeave = () => setIsDragging(false)

    function tryAttach() {
      const el = document.getElementById('dropzone-editar')
      if (!el) { setTimeout(tryAttach, 100); return }
      el.addEventListener('drop', onDrop)
      el.addEventListener('dragover', onDragOver)
      el.addEventListener('dragleave', onDragLeave)
      cleanup = () => {
        el.removeEventListener('drop', onDrop)
        el.removeEventListener('dragover', onDragOver)
        el.removeEventListener('dragleave', onDragLeave)
      }
    }
    tryAttach()
    return () => cleanup?.()
  }, [])

  function handleFileInput(e: any) {
    const files: File[] = Array.from(e.target?.files ?? [])
    const urls = files.filter((f: File) => f.type.startsWith('image/')).map((f: File) => URL.createObjectURL(f))
    if (urls.length > 0) setImagenesNuevas(prev => [...prev, ...urls])
  }

  async function seleccionarImagenes() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.')
        return
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    })
    if (!result.canceled) {
      setImagenesNuevas((prev) => [...prev, ...result.assets.map((a) => a.uri)])
    }
  }

  async function handleMejorarDescripcion() {
    setMejorando(true)
    try {
      const { data, error } = await supabase.functions.invoke('mejorar-descripcion', {
        body: { titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, m2 },
      })
      if (error) {
        const body = await (error as any).context?.json?.().catch(() => null)
        throw new Error(body?.error || error.message)
      }
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
    const filePath = `${propiedadId}/${Date.now()}_${orden}.${ext}`
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
    const m2TerrenoNum = m2Terreno ? parseFloat(m2Terreno) : null
    if (m2Terreno && isNaN(m2TerrenoNum!)) {
      Alert.alert('Error', 'Los m² de terreno deben ser un número válido.')
      return
    }

    setGuardando(true)
    try {
      const { data: filaActualizada, error: errorUpdate } = await supabase
        .from('propiedades')
        .update({
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          precio: precioNum,
          direccion: direccion.trim(),
          operacion,
          tipo,
          estado,
          zona: zona ?? null,
          recamaras,
          banos,
          m2: m2Num,
          m2_terreno: m2TerrenoNum,
          estacionamientos,
          asesor_id: asesorId,
          inmobiliaria_id: inmobiliariaId,
          exclusiva,
          es_constructora: esConstructora,
          nombre_constructora: esConstructora ? nombreConstructora.trim() || null : null,
          lat: lat ?? null,
          lng: lng ?? null,
        })
        .eq('id', id)
        .select('id')
      if (errorUpdate) throw errorUpdate
      // Si Supabase silencia el UPDATE por RLS, devuelve array vacío en lugar de error
      if (!filaActualizada || filaActualizada.length === 0) {
        throw new Error('No se guardó la propiedad. Verifica los permisos de edición en Supabase (RLS UPDATE en tabla propiedades).')
      }

      if (imagenesEliminar.length > 0) {
        const { data: borradas, error } = await supabase
          .from('propiedad_imagenes')
          .delete()
          .in('id', imagenesEliminar)
          .select('id')
        if (error) throw error
        // RLS puede filtrar el DELETE sin dar error: verificar que sí borró
        if ((borradas?.length ?? 0) < imagenesEliminar.length) {
          throw new Error('No se pudieron eliminar las imágenes. Verifica los permisos (RLS DELETE en propiedad_imagenes).')
        }
      }

      if (imagenesNuevas.length > 0) {
        // Continuar después del orden más alto restante (evita colisiones si se borraron imágenes intermedias)
        const ordenBase = imagenesExistentes.length > 0
          ? Math.max(...imagenesExistentes.map((i) => i.orden)) + 1
          : 0
        const registros = await Promise.all(
          imagenesNuevas.map(async (uri, index) => {
            const url = await subirImagen(uri, id, ordenBase + index)
            return { propiedad_id: id, url, orden: ordenBase + index }
          })
        )
        const { error } = await supabase.from('propiedad_imagenes').insert(registros)
        if (error) throw error
      }

      setGuardadoOk(true)
      setTimeout(() => {
        router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')
      }, 1500)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar la propiedad.')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  const todasImagenes = [
    ...imagenesExistentes.map((img) => ({ key: img.id, uri: img.url, esExistente: true as const, id: img.id })),
    ...imagenesNuevas.map((uri) => ({ key: uri, uri, esExistente: false as const, id: '' })),
  ]

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, { backgroundColor: c.bg }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(admin)/propiedades')}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>Editar propiedad</Text>

        <Text style={styles.label}>Imágenes</Text>
        {todasImagenes.length > 0 && (
          <FlatList
            data={todasImagenes}
            horizontal
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 10 }}
            renderItem={({ item }) => (
              <View style={styles.miniatura}>
                <Image source={{ uri: item.uri }} style={styles.miniaturaImg} />
                <TouchableOpacity
                  style={styles.miniaturaQuitar}
                  onPress={() => item.esExistente ? quitarImagenExistente(item.id) : quitarImagenNueva(item.uri)}
                >
                  <Text style={styles.miniaturaQuitarText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
        {Platform.OS === 'web' ? (
          <View nativeID="dropzone-editar" style={[styles.imagenPicker, isDragging && styles.imagenPickerDragging]}>
            {/* @ts-ignore */}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
            <Text style={styles.imagenPickerText}>
              {isDragging ? '📂 Suelta las fotos aquí' : '📁 Arrastra fotos aquí o haz clic para seleccionar'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.imagenPicker} onPress={seleccionarImagenes}>
            <Text style={styles.imagenPickerText}>+ Agregar fotos</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Título *</Text>
        <TextInput style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]} value={titulo} onChangeText={setTitulo} maxLength={100} />

        <Text style={styles.label}>Dirección *</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: c.input, borderColor: lat ? '#22a35e' : c.inputBorder, color: c.inputText }]}
            placeholder="Ej. Corregidora, Querétaro"
            value={geoQuery}
            onChangeText={v => { setGeoQuery(v); setDireccion(v); setLat(null); setLng(null) }}
            maxLength={200}
          />
          {geoLoading && <ActivityIndicator size="small" color="#1976D2" style={{ marginLeft: 8 }} />}
        </View>
        {geoLoading && <Text style={{ fontSize: 11, color: '#1976D2', marginBottom: 4 }}>🔍 Buscando...</Text>}
        {lat !== null && <Text style={{ fontSize: 11, color: '#22a35e', marginBottom: 8 }}>✓ Ubicación confirmada en el mapa</Text>}

        {coloniasSugeridas.length > 0 && (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: '#22a35e', marginBottom: 8, overflow: 'hidden' }}>
            <Text style={{ fontSize: 11, color: '#22a35e', fontWeight: '700', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
              📌 Colonias conocidas:
            </Text>
            {coloniasSugeridas.slice(0, 5).map((col, i) => (
              <TouchableOpacity
                key={col.label}
                style={{ padding: 10, backgroundColor: i % 2 === 0 ? c.input : c.bg, borderTopWidth: 1, borderTopColor: c.inputBorder }}
                onPress={() => seleccionarColoniaPredefinida(col)}
              >
                <Text style={{ fontSize: 13, color: c.inputText }}>📌 {col.label} — {col.ciudad}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {geoResults.length > 0 && (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: '#1976D2', marginBottom: 12, overflow: 'hidden' }}>
            <Text style={{ fontSize: 11, color: '#1976D2', fontWeight: '700', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
              🔍 Resultados de búsqueda:
            </Text>
            {geoResults.map((r: any, i: number) => (
              <TouchableOpacity
                key={i}
                style={{ padding: 10, backgroundColor: i % 2 === 0 ? c.input : c.bg, borderTopWidth: 1, borderTopColor: c.inputBorder }}
                onPress={() => seleccionarUbicacion(r)}
              >
                <Text style={{ fontSize: 13, color: c.inputText }} numberOfLines={2}>📍 {r.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
            { value: 'terreno', label: 'Terreno' },
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

        <Text style={styles.label}>Zona</Text>
        <PillSelector
          options={[
            { value: 'queretaro', label: 'Querétaro' },
            { value: 'monterrey', label: 'Monterrey' },
            { value: 'puebla', label: 'Puebla' },
          ]}
          value={zona}
          onChange={(v) => setZona(zona === v ? null : v)}
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
            <Text style={styles.label}>M² construcción</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              placeholder="Ej. 120"
              value={m2}
              onChangeText={setM2}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>M² terreno</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              placeholder="Ej. 200"
              value={m2Terreno}
              onChangeText={setM2Terreno}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
        </View>
        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Estacionamientos</Text>
            <DropdownModal options={ESTACIONAMIENTOS_OPTIONS} value={estacionamientos} onChange={setEstacionamientos} />
          </View>
          <View style={{ flex: 1 }} />
        </View>

        <Text style={styles.label}>Precio (MXN)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
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
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          numberOfLines={4}
          maxLength={1000}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Asesor de contacto</Text>
        <AsesorPicker value={asesorId} onChange={setAsesorId} />

        <Text style={styles.label}>Inmobiliaria</Text>
        <InmobiliariaPicker value={inmobiliariaId} onChange={setInmobiliariaId} />

        <View style={styles.exclusivaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.exclusivaLabel}>Propiedad exclusiva</Text>
            <Text style={styles.exclusivaDesc}>Solo visible para Prospectadores Plus</Text>
          </View>
          <TouchableOpacity onPress={() => setExclusiva(v => !v)} activeOpacity={0.8}
            style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: exclusiva ? '#c0392b' : '#555', padding: 3, justifyContent: 'center', overflow: 'hidden' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: exclusiva ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>

        <View style={styles.exclusivaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.exclusivaLabel}>Propiedad de constructora</Text>
            <Text style={styles.exclusivaDesc}>Desarrollo en construcción o con unidades nuevas</Text>
          </View>
          <TouchableOpacity onPress={() => setEsConstructora(v => !v)} activeOpacity={0.8}
            style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: esConstructora ? '#1a6470' : '#555', padding: 3, justifyContent: 'center', overflow: 'hidden' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: esConstructora ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
        {esConstructora && (
          <TextInput
            style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
            placeholder="Nombre de la constructora"
            value={nombreConstructora}
            onChangeText={setNombreConstructora}
            autoCapitalize="words"
          />
        )}

        {guardadoOk && (
          <View style={{ backgroundColor: '#22a35e', borderRadius: 10, padding: 14, marginBottom: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✓ Cambios guardados correctamente</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, (guardando || guardadoOk) && styles.buttonDisabled]}
          onPress={handleGuardar}
          disabled={guardando || guardadoOk}
        >
          {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar cambios</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}
          disabled={guardando}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' as const },
  screenTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a6470', marginTop: 16, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#1a6470', marginBottom: 6, marginTop: 16 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { height: 100, paddingTop: 12 },
  imagenPicker: {
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    paddingVertical: 40,
    alignItems: 'center',
    marginBottom: 4,
  },
  imagenPickerText: { color: '#888', fontSize: 15 },
  imagenPickerDragging: { borderColor: '#1a6470', backgroundColor: '#e8f4f5', borderStyle: 'solid' },
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
