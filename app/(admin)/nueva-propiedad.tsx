import { useState, useEffect, useRef } from 'react'
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
import AsesorPicker from '../../components/ui/AsesorPicker'

function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

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
const MEDIOS_BANOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
]

function parsearFicha(texto: string) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Título: primera línea completa (sin emojis/símbolos al inicio)
  // Dirección: si hay "|" se toma lo que está después; si no, se extrae "en <Lugar>" del título
  let titulo = ''
  let direccion = ''
  if (lineas.length > 0) {
    const primera = lineas[0].replace(/^[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9$]+/, '').trim()
    if (primera.includes('|')) {
      const partes = primera.split('|')
      titulo = partes[0].trim()
      direccion = partes[1].trim()
    } else {
      titulo = primera
      // Extrae "Juriquilla" de "Venta de Casa en Juriquilla"
      const mLoc = primera.match(/\ben\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:(?:[,\s]+(?:de\s+)?)[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)*)$/i)
      if (mLoc) direccion = mLoc[1].trim()
    }
  }

  // Precio: $X,XXX,XXX MXN
  let precio = ''
  const mPrecio = texto.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:MXN)?/i)
  if (mPrecio) precio = mPrecio[1].replace(/,/g, '')

  // M2: construcción tiene prioridad sobre terreno
  let m2 = ''
  const mConst = texto.match(/construcci[oó]n\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
  if (mConst) {
    m2 = mConst[1].replace(/,/g, '')
  } else {
    const mTerr = texto.match(/terreno\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
    if (mTerr) m2 = mTerr[1].replace(/,/g, '')
  }

  // Recámaras
  let recamaras: number | null = null
  const mRec = texto.match(/(\d+)\s*rec[aá]maras?/i)
  if (mRec) recamaras = Math.min(parseInt(mRec[1]), 5)

  // Baños completos (evitar capturar "medio baño")
  let banos: number | null = null
  const mBanos = texto.match(/(\d+)\s*ba[ñn]os?\s*(?:completos?)?(?!\s*\w*medio)/i)
  if (mBanos) banos = Math.min(parseInt(mBanos[1]), 4)

  // Medios baños
  let mediosBanos: number | null = null
  const mMedios = texto.match(/(\d+)\s*medio\s*ba[ñn]o/i)
  if (mMedios) mediosBanos = Math.min(parseInt(mMedios[1]), 2)

  // Estacionamientos
  let estacionamientos: number | null = null
  const mCochera = texto.match(/cochera\s+para\s+(\d+)/i)
  if (mCochera) {
    estacionamientos = Math.min(parseInt(mCochera[1]), 3)
  } else {
    const mEst = texto.match(/(\d+)\s*(?:autos?|estacionamientos?|lugares?)/i)
    if (mEst) estacionamientos = Math.min(parseInt(mEst[1]), 3)
  }

  // Tipo
  let tipo: 'casa' | 'departamento' | 'local' | 'terreno' | null = null
  if (/departamento/i.test(titulo)) tipo = 'departamento'
  else if (/\bcasa\b/i.test(titulo)) tipo = 'casa'
  else if (/local/i.test(titulo)) tipo = 'local'
  else if (/terreno/i.test(titulo)) tipo = 'terreno'

  // Operación
  let operacion: 'venta' | 'renta' | null = null
  const inicio = texto.slice(0, 120)
  if (/\brenta\b/i.test(inicio)) operacion = 'renta'
  else if (/\bventa\b/i.test(inicio)) operacion = 'venta'

  return { titulo, direccion, precio, m2, recamaras, banos, mediosBanos, estacionamientos, tipo, operacion }
}

export default function NuevaPropiedad() {
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
  const [estacionamientos, setEstacionamientos] = useState<number | null>(null)
  const [zona, setZona] = useState<'queretaro' | 'monterrey' | 'puebla' | null>(null)
  const [asesorId, setAsesorId] = useState<string | null>(null)
  const [exclusiva, setExclusiva] = useState(false)
  const [esConstructora, setEsConstructora] = useState(false)
  const [nombreConstructora, setNombreConstructora] = useState('')
  const [imagenes, setImagenes] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const imagenesRef = useRef<string[]>([])
  const [mediosBanos, setMediosBanos] = useState<number | null>(null)
  const [ficha, setFicha] = useState('')
  const [mostrarFicha, setMostrarFicha] = useState(true)
  const [fichaMsg, setFichaMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [mejorando, setMejorando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  function aplicarFicha() {
    if (!ficha.trim()) return
    const r = parsearFicha(ficha)
    if (r.titulo) setTitulo(r.titulo)
    if (r.direccion) setDireccion(r.direccion)
    if (r.precio) setPrecio(r.precio)
    if (r.m2) setM2(r.m2)
    if (r.recamaras !== null) setRecamaras(r.recamaras)
    if (r.banos !== null) setBanos(r.banos)
    if (r.mediosBanos !== null) setMediosBanos(r.mediosBanos)
    if (r.estacionamientos !== null) setEstacionamientos(r.estacionamientos)
    if (r.tipo) setTipo(r.tipo)
    if (r.operacion) setOperacion(r.operacion)
    setDescripcion(ficha)

    const partes: string[] = []
    if (r.titulo) partes.push(r.titulo)
    if (r.precio) partes.push(`$${parseInt(r.precio).toLocaleString('es-MX')}`)
    if (r.recamaras) partes.push(`${r.recamaras} rec.`)
    if (r.banos) partes.push(`${r.banos} baños`)
    if (r.mediosBanos) partes.push(`${r.mediosBanos} medio baño`)
    if (r.estacionamientos != null) partes.push(`${r.estacionamientos} est.`)
    setFichaMsg(partes.length > 0 ? `✓ Detectado: ${partes.join(' · ')}` : '⚠ No se detectaron campos. Revisa el formato.')
    setMostrarFicha(false)
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
      setImagenes((prev) => [...prev, ...result.assets.map((a) => a.uri)])
    }
  }

  function quitarImagen(uri: string) {
    setImagenes((prev) => prev.filter((u) => u !== uri))
  }

  // Mantener ref sincronizado para evitar closures estancadas
  useEffect(() => { imagenesRef.current = imagenes }, [imagenes])

  // Marcar imágenes como draggable via DOM usando nativeID
  useEffect(() => {
    if (Platform.OS !== 'web') return
    setTimeout(() => {
      imagenes.forEach((_, index) => {
        const el = document.getElementById(`drag-img-nueva-${index}`)
        if (el) {
          el.draggable = true
          el.setAttribute('data-idx', String(index))
        }
      })
    }, 100)
  }, [imagenes])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    let cleanup: (() => void) | undefined

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? []) as File[]
      const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f))
      if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
    const onDragLeave = () => setIsDragging(false)

    function tryAttach() {
      const el = document.getElementById('dropzone-nueva')
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

  // Reordenamiento por arrastre — se re-adjunta cuando cambian las imágenes
  useEffect(() => {
    if (Platform.OS !== 'web') return

    const onDragStart = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (target) dragIdxRef.current = parseInt(target.dataset.idx ?? '-1')
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (target) setDragOverIdx(parseInt(target.dataset.idx ?? '-1'))
    }
    const onDragEnd = () => { dragIdxRef.current = null; setDragOverIdx(null) }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[]
        const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f))
        if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
        dragIdxRef.current = null; setDragOverIdx(null)
        return
      }
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (!target) return
      const toIdx = parseInt(target.dataset.idx ?? '-1')
      const fromIdx = dragIdxRef.current
      if (fromIdx === null || fromIdx === toIdx || toIdx < 0) return
      const arr = [...imagenesRef.current]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      setImagenes(arr)
      dragIdxRef.current = null; setDragOverIdx(null)
    }

    let container: HTMLElement | null = null
    function tryAttachGrid() {
      container = document.getElementById('drag-grid-nueva')
      if (!container) { setTimeout(tryAttachGrid, 100); return }
      container.addEventListener('dragstart', onDragStart)
      container.addEventListener('dragover', onDragOver)
      container.addEventListener('dragend', onDragEnd)
      container.addEventListener('drop', onDrop)
    }
    tryAttachGrid()

    return () => {
      if (container) {
        container.removeEventListener('dragstart', onDragStart)
        container.removeEventListener('dragover', onDragOver)
        container.removeEventListener('dragend', onDragEnd)
        container.removeEventListener('drop', onDrop)
      }
    }
  }, [imagenes.length])

  function handleFileInput(e: any) {
    const files: File[] = Array.from(e.target?.files ?? [])
    const urls = files.filter((f: File) => f.type.startsWith('image/')).map((f: File) => URL.createObjectURL(f))
    if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
  }

  async function handleMejorarDescripcion() {
    setMejorando(true)
    try {
      const { data, error } = await supabase.functions.invoke('mejorar-descripcion', {
        body: { titulo, direccion, precio, descripcion, tipo, operacion, recamaras, banos, mediosBanos, m2, estacionamientos },
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
      if (!user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')

      const { data: codigos, error: errorCodigos } = await supabase.from('propiedades').select('codigo')
      if (errorCodigos) throw new Error(`Error leyendo códigos: ${errorCodigos.message}`)

      let maxNum = 0
      for (const p of codigos ?? []) {
        const match = p.codigo?.match(/VR-(\d+)/)
        if (match) {
          const n = parseInt(match[1], 10)
          if (n > maxNum) maxNum = n
        }
      }
      const codigo = `VR-${String(maxNum + 1).padStart(3, '0')}`
      const propiedadId = generarUUID()

      console.log('[nueva-propiedad] insertando con asesor_id:', asesorId)

      const { error: errorPropiedad } = await supabase
        .from('propiedades')
        .insert({
          id: propiedadId,
          codigo,
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
          medios_banos: mediosBanos ?? 0,
          m2: m2Num,
          estacionamientos,
          asesor_id: asesorId,
          exclusiva,
          es_constructora: esConstructora,
          nombre_constructora: esConstructora ? nombreConstructora.trim() || null : null,
          created_by: user.id,
        })

      console.log('[nueva-propiedad] resultado insert — error:', errorPropiedad)

      if (errorPropiedad) throw new Error(`${errorPropiedad.message} (code: ${errorPropiedad.code}, details: ${errorPropiedad.details}, hint: ${errorPropiedad.hint})`)

      if (imagenes.length > 0) {
        const registros = await Promise.all(
          imagenes.map(async (uri, index) => {
            const url = await subirImagen(uri, propiedadId, index)
            let phash: string | null = null
            try {
              const { data: hashData } = await supabase.functions.invoke('calcular-phash', { body: { url } })
              phash = hashData?.phash ?? null
            } catch {}
            return { propiedad_id: propiedadId, url, orden: index, phash }
          })
        )
        const { error: errorImagenes } = await supabase.from('propiedad_imagenes').insert(registros)
        if (errorImagenes) throw errorImagenes
      }

      setGuardado(true)
      setTimeout(() => router.replace('/(admin)/propiedades'), 1500)
    } catch (err: any) {
      console.error('[nueva-propiedad] error completo:', err)
      if (Platform.OS === 'web') window.alert(`Error al guardar: ${err.message}`)
      else Alert.alert('Error al guardar', err.message || 'No se pudo guardar la propiedad.')
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

        {/* Importar desde ficha */}
        <View style={styles.fichaBox}>
          <TouchableOpacity style={styles.fichaToggle} onPress={() => setMostrarFicha(v => !v)}>
            <Text style={styles.fichaToggleText}>📋 Importar desde ficha</Text>
            <Text style={styles.fichaChevron}>{mostrarFicha ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {fichaMsg ? <Text style={styles.fichaMsg}>{fichaMsg}</Text> : null}
          {mostrarFicha && (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={[styles.input, { height: 130, paddingTop: 10 }]}
                placeholder={'Pega aquí la ficha completa de la propiedad y detectaremos automáticamente:\ntítulo, precio, m², recámaras, baños, estacionamientos...'}
                value={ficha}
                onChangeText={setFicha}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={[styles.btnIA, { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8 }]} onPress={aplicarFicha}>
                <Text style={styles.btnIAText}>✦ Detectar y rellenar campos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.label}>Imágenes {Platform.OS === 'web' && imagenes.length > 1 ? <Text style={{ fontSize: 11, color: '#aaa', fontWeight: '400' }}> · arrastra para reordenar</Text> : null}</Text>
        {imagenes.length > 0 && (
          Platform.OS === 'web' ? (
            <View nativeID="drag-grid-nueva" style={styles.miniaturasGrid}>
              {imagenes.map((uri, index) => (
                <View
                  key={uri}
                  nativeID={`drag-img-nueva-${index}`}
                  style={[styles.miniatura, dragOverIdx === index && { opacity: 0.5, borderWidth: 2, borderColor: '#1a6470', borderRadius: 10 }]}
                >
                  <Image source={{ uri }} style={{ width: 100, height: 100, borderRadius: 10 }} />
                  <TouchableOpacity style={styles.miniaturaQuitar} onPress={() => quitarImagen(uri)}>
                    <Text style={styles.miniaturaQuitarText}>✕</Text>
                  </TouchableOpacity>
                  <View style={styles.miniaturaDragHandle}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>⠿</Text>
                  </View>
                  <View style={styles.miniaturaNro}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
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
          )
        )}
        {Platform.OS === 'web' ? (
          <View nativeID="dropzone-nueva" style={[styles.imagenPicker, isDragging && styles.imagenPickerDragging]}>
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
        <TextInput
          style={styles.input}
          placeholder="Ej. Casa en la colonia Roma"
          value={titulo}
          onChangeText={setTitulo}
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
            <Text style={styles.label}>Baños completos</Text>
            <DropdownModal options={BANOS_OPTIONS} value={banos} onChange={setBanos} />
          </View>
        </View>
        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Medios baños</Text>
            <DropdownModal options={MEDIOS_BANOS_OPTIONS} value={mediosBanos} onChange={setMediosBanos} />
          </View>
          <View style={{ flex: 1 }} />
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
          textAlignVertical="top"
        />

        <Text style={styles.label}>Asesor de contacto</Text>
        <AsesorPicker value={asesorId} onChange={setAsesorId} />

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

        <View style={styles.exclusivaRow}>
          <View>
            <Text style={styles.exclusivaLabel}>Propiedad de constructora</Text>
            <Text style={styles.exclusivaDesc}>Desarrollo en construcción o con unidades nuevas</Text>
          </View>
          <Switch
            value={esConstructora}
            onValueChange={setEsConstructora}
            trackColor={{ false: '#ddd', true: '#1a6470' }}
            thumbColor={esConstructora ? '#fff' : '#f4f3f4'}
          />
        </View>
        {esConstructora && (
          <TextInput
            style={styles.input}
            placeholder="Nombre de la constructora"
            value={nombreConstructora}
            onChangeText={setNombreConstructora}
            autoCapitalize="words"
          />
        )}


        {guardado && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>✓ Propiedad guardada correctamente</Text>
          </View>
        )}

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
  miniaturasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  miniaturaDragHandle: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  miniaturaNro: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(26,100,112,0.85)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
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
  successBanner: {
    backgroundColor: '#e8f5e9', borderRadius: 10, borderWidth: 1,
    borderColor: '#a5d6a7', paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'center', marginTop: 24,
  },
  successText: { color: '#2e7d32', fontSize: 15, fontWeight: '700' },
  fichaBox: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#d4e8ea', padding: 14, marginBottom: 8,
  },
  fichaToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fichaToggleText: { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  fichaChevron: { fontSize: 12, color: '#1a6470' },
  fichaMsg: { fontSize: 12, color: '#2e7d32', marginTop: 6, fontWeight: '600' },
})
