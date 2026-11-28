// Alta de propiedad para una inmobiliaria aliada. Versión recortada del
// formulario de admin: sin asesor interno, sin inventario, sin destacado, sin
// EasyBroker — solo lo que a ellos les toca llenar. La base ya exige que
// quede con SU inmobiliaria_id (ver propiedades_insert_aliado en
// 20261127_aliados_4_rol.sql); aquí solo se arma ese dato.
import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Platform, Image, FlatList,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import PillSelector from '../../components/ui/PillSelector'
import DropdownModal from '../../components/ui/DropdownModal'
import { opcionesConteo } from '../../lib/conteos'
import { extraerLinkMaps } from '../../lib/maps-link'
import { ubicacionDesdeLink } from '../../lib/maps-resolver'

const RECAMARAS_RANGO = [0, 10] as const
const BANOS_RANGO = [0, 10] as const
const ESTACIONAMIENTOS_RANGO = [0, 10] as const

function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const TIPOS = [
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Depa' },
  { value: 'local', label: 'Local' },
  { value: 'terreno', label: 'Terreno' },
] as const

export default function AliadoNuevaPropiedad() {
  const c = useColors()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [direccion, setDireccion] = useState('')
  const [zona, setZona] = useState('')
  const [operacion, setOperacion] = useState<'venta' | 'renta'>('venta')
  const [tipo, setTipo] = useState<typeof TIPOS[number]['value']>('casa')
  const [recamaras, setRecamaras] = useState<number | null>(null)
  const [banos, setBanos] = useState<number | null>(null)
  const [m2, setM2] = useState('')
  const [m2Terreno, setM2Terreno] = useState('')
  const [estacionamientos, setEstacionamientos] = useState<number | null>(null)
  const [imagenes, setImagenes] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  // Pegar un link de Google Maps en "Dirección" fija el punto exacto sin
  // depender de que el buscador encuentre la calle — mismo mecanismo que ya
  // usa nueva-propiedad.tsx de admin (lib/maps-link.ts).
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [maps, setMaps] = useState<{ estado: 'no' | 'leyendo' | 'ok' | 'error'; msg: string }>({ estado: 'no', msg: '' })

  useEffect(() => {
    const hallado = extraerLinkMaps(direccion)
    if (!hallado) return
    let vivo = true
    setMaps({ estado: 'leyendo', msg: 'Leyendo el link de Maps…' })
    ;(async () => {
      const r = await ubicacionDesdeLink(hallado.link)
      if (!vivo) return
      if (!r.ok) { setMaps({ estado: 'error', msg: r.motivo }); return }
      setLat(r.ubicacion.lat); setLng(r.ubicacion.lng)
      const nombre = hallado.resto || r.ubicacion.nombre || ''
      setDireccion(nombre)
      setMaps({
        estado: 'ok',
        msg: nombre ? 'Ubicación fijada con el link. Puedes corregir el nombre.' : 'Ubicación fijada con el link. Escribe el nombre que quieres que se vea.',
      })
    })()
    return () => { vivo = false }
  }, [direccion])

  function alerta(msg: string) {
    if (Platform.OS === 'web') window.alert(msg)
    else Alert.alert('Aviso', msg)
  }

  async function seleccionarImagenes() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { alerta('Necesitamos acceso a tu galería.'); return }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7,
    })
    if (!result.canceled) setImagenes(prev => [...prev, ...result.assets.map(a => a.uri)])
  }

  function quitarImagen(uri: string) {
    setImagenes(prev => prev.filter(u => u !== uri))
  }

  async function subirImagen(uri: string, propiedadId: string, orden: number): Promise<string> {
    const response = await fetch(uri)
    const blob = await response.blob()
    const mimeType = blob.type || 'image/jpeg'
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
    const filePath = `${propiedadId}/${orden}.${ext}`
    const { error } = await supabase.storage.from('propiedades').upload(filePath, blob, { contentType: mimeType, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('propiedades').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function guardar() {
    if (!titulo.trim() || !direccion.trim()) { alerta('El título y la dirección son obligatorios.'); return }
    const precioNum = precio ? parseFloat(precio) : null
    if (precio && isNaN(precioNum!)) { alerta('El precio debe ser un número válido.'); return }

    setGuardando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
      const { data: perfil } = await supabase
        .from('profiles').select('inmobiliaria_id').eq('id', session.user.id).single()
      if (!perfil?.inmobiliaria_id) throw new Error('Tu cuenta no tiene una inmobiliaria asignada.')

      let siguienteNum = 0
      const { data: rpcNum } = await supabase.rpc('siguiente_codigo_propiedad')
      if (typeof rpcNum === 'number') siguienteNum = rpcNum

      const propiedadId = generarUUID()
      const datos = {
        id: propiedadId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        precio: precioNum,
        direccion: direccion.trim(),
        zona: zona.trim() || null,
        operacion,
        tipo,
        estado: 'disponible',
        recamaras,
        banos,
        m2: m2 ? parseFloat(m2) : null,
        m2_terreno: m2Terreno ? parseFloat(m2Terreno) : null,
        estacionamientos,
        lat, lng,
        inmobiliaria_id: perfil.inmobiliaria_id,
        es_inventario: false,
        created_by: session.user.id,
      }

      let errorPropiedad: any = null
      for (let intento = 0; intento < 10; intento++) {
        const codigo = `VR-${String(siguienteNum).padStart(3, '0')}`
        const { error } = await supabase.from('propiedades').insert({ ...datos, codigo })
        if (!error) { errorPropiedad = null; break }
        errorPropiedad = error
        if (error.code === '23505') { siguienteNum++; continue }
        break
      }
      if (errorPropiedad) throw new Error(errorPropiedad.message)

      if (imagenes.length > 0) {
        const registros = await Promise.all(
          imagenes.map(async (uri, index) => ({
            propiedad_id: propiedadId, url: await subirImagen(uri, propiedadId, index), orden: index,
          }))
        )
        await supabase.from('propiedad_imagenes').insert(registros)
      }

      alerta('✓ Propiedad publicada')
      router.replace('/(aliado)/mis-propiedades')
    } catch (e: any) {
      alerta('Error: ' + (e?.message ?? 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(aliado)/mis-propiedades')}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitulo, { color: c.text }]}>Nueva propiedad</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>

      <Text style={[s.label, { color: c.textSub }]}>Título *</Text>
      <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={titulo} onChangeText={setTitulo} placeholder="Ej. Casa en privada, 3 recámaras" placeholderTextColor={c.placeholder} />

      <Text style={[s.label, { color: c.textSub }]}>Descripción</Text>
      <TextInput style={[s.input, s.textArea, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={descripcion} onChangeText={setDescripcion} placeholder="Detalles de la propiedad…" placeholderTextColor={c.placeholder}
        multiline numberOfLines={4} textAlignVertical="top" />

      <Text style={[s.label, { color: c.textSub }]}>Dirección *</Text>
      <TextInput
        style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={direccion}
        onChangeText={v => {
          setDireccion(v)
          // Si se borró el link, el punto deja de ser confiable — se
          // reinicia para no dejar un lat/lng de una dirección anterior.
          if (maps.estado !== 'ok' && !extraerLinkMaps(v)) { setLat(null); setLng(null) }
          if (!v.trim()) { setLat(null); setLng(null); setMaps({ estado: 'no', msg: '' }) }
          else if (maps.estado === 'error' && !extraerLinkMaps(v)) setMaps({ estado: 'no', msg: '' })
        }}
        placeholder="Calle, colonia, ciudad — o pega un link de Google Maps"
        placeholderTextColor={c.placeholder}
      />
      {maps.estado !== 'no' && (
        <Text style={{
          fontSize: 11.5, lineHeight: 16, marginTop: -4, marginBottom: 2, fontWeight: '700',
          color: maps.estado === 'ok' ? '#22a35e' : maps.estado === 'error' ? '#e5a50a' : c.textMute,
        }}>
          {maps.estado === 'leyendo' ? '📍 ' : maps.estado === 'ok' ? '✓ ' : '⚠ '}{maps.msg}
        </Text>
      )}

      <Text style={[s.label, { color: c.textSub }]}>Zona</Text>
      <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={zona} onChangeText={setZona} placeholder="Ej. Juriquilla" placeholderTextColor={c.placeholder} />

      <Text style={[s.label, { color: c.textSub }]}>Precio</Text>
      <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={precio} onChangeText={setPrecio} placeholder="0" placeholderTextColor={c.placeholder} keyboardType="numeric" />

      <Text style={[s.label, { color: c.textSub }]}>Operación</Text>
      <PillSelector options={[{ value: 'venta', label: 'Venta' }, { value: 'renta', label: 'Renta' }]} value={operacion} onChange={setOperacion} />

      <Text style={[s.label, { color: c.textSub }]}>Tipo</Text>
      <PillSelector options={TIPOS as any} value={tipo} onChange={setTipo as any} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: c.textSub }]}>Recámaras</Text>
          <DropdownModal options={opcionesConteo(RECAMARAS_RANGO[0], RECAMARAS_RANGO[1], recamaras)} value={recamaras} onChange={setRecamaras} placeholder="—" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: c.textSub }]}>Baños</Text>
          <DropdownModal options={opcionesConteo(BANOS_RANGO[0], BANOS_RANGO[1], banos)} value={banos} onChange={setBanos} placeholder="—" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: c.textSub }]}>Estac.</Text>
          <DropdownModal options={opcionesConteo(ESTACIONAMIENTOS_RANGO[0], ESTACIONAMIENTOS_RANGO[1], estacionamientos)} value={estacionamientos} onChange={setEstacionamientos} placeholder="—" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: c.textSub }]}>m² construcción</Text>
          <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
            value={m2} onChangeText={setM2} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: c.textSub }]}>m² terreno</Text>
          <TextInput style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
            value={m2Terreno} onChangeText={setM2Terreno} keyboardType="numeric" />
        </View>
      </View>

      <Text style={[s.label, { color: c.textSub }]}>Fotos</Text>
      <TouchableOpacity style={[s.btnFotos, { borderColor: c.border }]} onPress={seleccionarImagenes}>
        <Text style={{ color: c.textSub }}>+ Agregar fotos</Text>
      </TouchableOpacity>
      {imagenes.length > 0 && (
        <FlatList
          data={imagenes} horizontal keyExtractor={u => u}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <View>
              <Image source={{ uri: item }} style={s.foto} />
              <TouchableOpacity style={s.fotoX} onPress={() => quitarImagen(item)}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnGuardarTxt}>Publicar propiedad</Text>}
      </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 50, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitulo: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { minHeight: 90 },
  btnFotos: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  foto: { width: 90, height: 72, borderRadius: 9 },
  fotoX: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center',
  },
  btnGuardar: { backgroundColor: '#5e35b1', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnGuardarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
