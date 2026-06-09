import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { supabase } from '../../lib/supabase'

export type InmobiliariaOpcion = {
  id: string
  nombre: string
  asesor_referencia: string | null
  telefono: string | null
}

type Props = {
  value: string | null
  onChange: (inmobiliariaId: string | null) => void
}

export default function InmobiliariaPicker({ value, onChange }: Props) {
  const [inmobiliarias, setInmobiliarias] = useState<InmobiliariaOpcion[]>([])
  const [open, setOpen] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [nombre, setNombre] = useState('')
  const [asesorReferencia, setAsesorReferencia] = useState('')
  const [telefono, setTelefono] = useState('')
  const [creando, setCreando] = useState(false)
  const [cargando, setCargando] = useState(false)

  const seleccionada = inmobiliarias.find((i) => i.id === value) ?? null

  useEffect(() => {
    cargarInmobiliarias()
  }, [])

  async function cargarInmobiliarias() {
    setCargando(true)
    const { data } = await supabase
      .from('inmobiliarias')
      .select('id, nombre, asesor_referencia, telefono')
      .order('nombre')
    setInmobiliarias(data ?? [])
    setCargando(false)
  }

  function abrirModal() {
    setMostrarNueva(false)
    setNombre('')
    setAsesorReferencia('')
    setTelefono('')
    setOpen(true)
  }

  function seleccionar(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  async function crearInmobiliaria() {
    if (!nombre.trim()) return
    setCreando(true)
    try {
      const { data, error } = await supabase
        .from('inmobiliarias')
        .insert({
          nombre: nombre.trim(),
          asesor_referencia: asesorReferencia.trim() || null,
          telefono: telefono.trim() || null,
        })
        .select('id, nombre, asesor_referencia, telefono')
        .single()
      if (error) throw error
      setInmobiliarias((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      onChange(data.id)
      setOpen(false)
    } catch (err: any) {
      Alert.alert('Error al crear inmobiliaria', err?.message || 'No se pudo guardar la inmobiliaria. Intenta de nuevo.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={abrirModal}>
        {seleccionada ? (
          <View>
            <Text style={styles.selectorNombre}>{seleccionada.nombre}</Text>
            {(seleccionada.asesor_referencia || seleccionada.telefono) && (
              <Text style={styles.selectorSub}>
                {[seleccionada.asesor_referencia, seleccionada.telefono].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.selectorPlaceholder}>Sin inmobiliaria asignada</Text>
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
            <Text style={styles.modalTitle}>Inmobiliaria de la propiedad</Text>

            {cargando ? (
              <ActivityIndicator color="#1a6470" style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                {/* Opción sin inmobiliaria */}
                <TouchableOpacity style={styles.opcion} onPress={() => seleccionar(null)}>
                  <View style={[styles.radio, !value && styles.radioActivo]} />
                  <Text style={[styles.opcionTexto, !value && styles.opcionTextoActivo]}>Sin inmobiliaria</Text>
                </TouchableOpacity>

                {inmobiliarias.map((i) => (
                  <TouchableOpacity key={i.id} style={styles.opcion} onPress={() => seleccionar(i.id)}>
                    <View style={[styles.radio, value === i.id && styles.radioActivo]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.opcionTexto, value === i.id && styles.opcionTextoActivo]}>{i.nombre}</Text>
                      {(i.asesor_referencia || i.telefono) && (
                        <Text style={styles.opcionSub}>
                          {[i.asesor_referencia, i.telefono].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Nueva inmobiliaria */}
                {!mostrarNueva ? (
                  <TouchableOpacity style={styles.btnNuevo} onPress={() => setMostrarNueva(true)}>
                    <Text style={styles.btnNuevoTexto}>+ Nueva inmobiliaria</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.nuevoForm}>
                    <Text style={styles.nuevoTitle}>Nueva inmobiliaria</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Nombre de la inmobiliaria *"
                      value={nombre}
                      onChangeText={setNombre}
                      autoCapitalize="words"
                      autoFocus
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Asesor de referencia (opcional)"
                      value={asesorReferencia}
                      onChangeText={setAsesorReferencia}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Contacto / teléfono (opcional)"
                      value={telefono}
                      onChangeText={setTelefono}
                      keyboardType="phone-pad"
                    />
                    <View style={styles.nuevoAcciones}>
                      <TouchableOpacity onPress={() => setMostrarNueva(false)} style={styles.btnCancelar}>
                        <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={crearInmobiliaria}
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
