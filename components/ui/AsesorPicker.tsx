import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { supabase } from '../../lib/supabase'

export type Asesor = {
  id: string
  nombre: string
  inmobiliaria: string | null
  telefono: string | null
}

type Props = {
  value: string | null
  onChange: (asesorId: string | null) => void
}

export default function AsesorPicker({ value, onChange }: Props) {
  const [asesores, setAsesores] = useState<Asesor[]>([])
  const [open, setOpen] = useState(false)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [inmobiliaria, setInmobiliaria] = useState('')
  const [telefono, setTelefono] = useState('')
  const [creando, setCreando] = useState(false)
  const [cargando, setCargando] = useState(false)

  const asesorSeleccionado = asesores.find((a) => a.id === value) ?? null

  useEffect(() => {
    cargarAsesores()
  }, [])

  async function cargarAsesores() {
    setCargando(true)
    const { data } = await supabase
      .from('asesores')
      .select('id, nombre, inmobiliaria, telefono')
      .order('nombre')
    setAsesores(data ?? [])
    setCargando(false)
  }

  function abrirModal() {
    setMostrarNuevo(false)
    setNombre('')
    setInmobiliaria('')
    setTelefono('')
    setOpen(true)
  }

  function seleccionar(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  async function crearAsesor() {
    if (!nombre.trim()) return
    setCreando(true)
    try {
      const { data, error } = await supabase
        .from('asesores')
        .insert({ nombre: nombre.trim(), inmobiliaria: inmobiliaria.trim() || null, telefono: telefono.trim() || null })
        .select('id, nombre, inmobiliaria, telefono')
        .single()
      if (error) throw error
      setAsesores((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      onChange(data.id)
      setOpen(false)
    } catch {
      // silenciar — el usuario verá que no se cerró el modal
    } finally {
      setCreando(false)
    }
  }

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={abrirModal}>
        {asesorSeleccionado ? (
          <View>
            <Text style={styles.selectorNombre}>{asesorSeleccionado.nombre}</Text>
            {(asesorSeleccionado.inmobiliaria || asesorSeleccionado.telefono) && (
              <Text style={styles.selectorSub}>
                {[asesorSeleccionado.inmobiliaria, asesorSeleccionado.telefono].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.selectorPlaceholder}>Sin asesor asignado</Text>
        )}
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Asesor de la propiedad</Text>

            {cargando ? (
              <ActivityIndicator color="#1a6470" style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                {/* Opción sin asesor */}
                <TouchableOpacity style={styles.opcion} onPress={() => seleccionar(null)}>
                  <View style={[styles.radio, !value && styles.radioActivo]} />
                  <Text style={[styles.opcionTexto, !value && styles.opcionTextoActivo]}>Sin asesor</Text>
                </TouchableOpacity>

                {asesores.map((a) => (
                  <TouchableOpacity key={a.id} style={styles.opcion} onPress={() => seleccionar(a.id)}>
                    <View style={[styles.radio, value === a.id && styles.radioActivo]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.opcionTexto, value === a.id && styles.opcionTextoActivo]}>{a.nombre}</Text>
                      {(a.inmobiliaria || a.telefono) && (
                        <Text style={styles.opcionSub}>
                          {[a.inmobiliaria, a.telefono].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Nuevo asesor */}
                {!mostrarNuevo ? (
                  <TouchableOpacity style={styles.btnNuevo} onPress={() => setMostrarNuevo(true)}>
                    <Text style={styles.btnNuevoTexto}>+ Nuevo asesor</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.nuevoForm}>
                    <Text style={styles.nuevoTitle}>Nuevo asesor</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Nombre *"
                      value={nombre}
                      onChangeText={setNombre}
                      autoCapitalize="words"
                      autoFocus
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Inmobiliaria (opcional)"
                      value={inmobiliaria}
                      onChangeText={setInmobiliaria}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Teléfono (opcional)"
                      value={telefono}
                      onChangeText={setTelefono}
                      keyboardType="phone-pad"
                    />
                    <View style={styles.nuevoAcciones}>
                      <TouchableOpacity onPress={() => setMostrarNuevo(false)} style={styles.btnCancelar}>
                        <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={crearAsesor}
                        style={[styles.btnAgregar, (!nombre.trim() || creando) && styles.btnDeshabilitado]}
                        disabled={!nombre.trim() || creando}
                      >
                        {creando
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.btnAgregarTexto}>Agregar</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.cerrar} onPress={() => setOpen(false)}>
              <Text style={styles.cerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  selector: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorNombre: { fontSize: 15, color: '#1a6470', fontWeight: '600' },
  selectorSub: { fontSize: 12, color: '#888', marginTop: 2 },
  selectorPlaceholder: { fontSize: 15, color: '#aaa' },
  chevron: { fontSize: 16, color: '#888' },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalWrapper: { flex: 1, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1a6470', marginBottom: 12 },

  opcion: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  radioActivo: { borderColor: '#1a6470', backgroundColor: '#1a6470' },
  opcionTexto: { fontSize: 15, color: '#333' },
  opcionTextoActivo: { color: '#1a6470', fontWeight: '600' },
  opcionSub: { fontSize: 12, color: '#888', marginTop: 1 },

  btnNuevo: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  btnNuevoTexto: { color: '#1a6470', fontWeight: '600', fontSize: 15 },

  nuevoForm: {
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: '#eee',
    paddingTop: 12,
    gap: 8,
  },
  nuevoTitle: { fontSize: 14, fontWeight: '700', color: '#1a6470', marginBottom: 4 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  nuevoAcciones: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnCancelarTexto: { color: '#666', fontSize: 14 },
  btnAgregar: {
    flex: 1,
    backgroundColor: '#1a6470',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnDeshabilitado: { opacity: 0.5 },
  btnAgregarTexto: { color: '#fff', fontWeight: '600', fontSize: 14 },

  cerrar: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  cerrarTexto: { color: '#888', fontSize: 15 },
})
