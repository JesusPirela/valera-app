import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Modal,
  TextInput,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'
import ToggleSwitch from '../../components/ToggleSwitch'

type InvProp = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  direccion: string
  tipo: string | null
  operacion: string | null
  inventario_seccion: string | null
  inv_asesor_contactado: boolean
  inv_asesor_respondio: boolean
  inv_autorizado_publicar: boolean
  inv_notas: string | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const SIN_SECCION = 'Sin sección'

export default function Inventario() {
  useSupervisorBlock()
  const c = useColors()
  const [items, setItems] = useState<InvProp[]>([])
  const [loading, setLoading] = useState(true)
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>({})

  // Modal para editar sección / notas de una opción.
  const [modalProp, setModalProp] = useState<InvProp | null>(null)
  const [editSeccion, setEditSeccion] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [guardandoModal, setGuardandoModal] = useState(false)

  async function cargar() {
    const { data, error } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, tipo, operacion, inventario_seccion, inv_asesor_contactado, inv_asesor_respondio, inv_autorizado_publicar, inv_notas, propiedad_imagenes(url, orden)')
      .eq('es_inventario', true)
      .order('inventario_seccion', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      Alert.alert('Error', 'No se pudo cargar el inventario.')
    } else {
      setItems((data ?? []) as any)
    }
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  // Agrupa por sección preservando orden de aparición.
  const grupos: { seccion: string; props: InvProp[] }[] = []
  for (const p of items) {
    const sec = p.inventario_seccion?.trim() || SIN_SECCION
    let g = grupos.find((x) => x.seccion === sec)
    if (!g) { g = { seccion: sec, props: [] }; grupos.push(g) }
    g.props.push(p)
  }

  async function toggleCampo(p: InvProp, campo: 'inv_asesor_contactado' | 'inv_asesor_respondio' | 'inv_autorizado_publicar', valor: boolean) {
    // Si se desmarca "respondió", no puede seguir autorizado; encadenamos lógica suave.
    const cambios: Partial<InvProp> = { [campo]: valor } as any
    setItems((prev) => prev.map((x) => x.id === p.id ? { ...x, ...cambios } : x))
    const { error } = await supabase.from('propiedades').update(cambios).eq('id', p.id)
    if (error) {
      Alert.alert('Error', 'No se pudo guardar el cambio.')
      setItems((prev) => prev.map((x) => x.id === p.id ? { ...x, [campo]: !valor } as any : x))
    }
  }

  function publicar(p: InvProp) {
    const run = async () => {
      const { error } = await supabase
        .from('propiedades')
        .update({ es_inventario: false, inventario_seccion: null })
        .eq('id', p.id)
      if (error) { Alert.alert('Error', `No se pudo publicar: ${error.message}`); return }
      setItems((prev) => prev.filter((x) => x.id !== p.id))
    }
    const msg = `"${p.titulo}" pasará al catálogo y será visible para los prospectadores. ¿Continuar?`
    if (Platform.OS === 'web') { if (window.confirm(msg)) run() }
    else Alert.alert('Publicar al catálogo', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Publicar', onPress: run },
    ])
  }

  function borrar(p: InvProp) {
    const run = async () => {
      await supabase.from('propiedad_imagenes').delete().eq('propiedad_id', p.id)
      const { error } = await supabase.from('propiedades').delete().eq('id', p.id)
      if (error) { Alert.alert('Error', `No se pudo borrar: ${error.message}`); return }
      setItems((prev) => prev.filter((x) => x.id !== p.id))
    }
    const msg = `¿Eliminar "${p.titulo}" del inventario? Esta acción no se puede deshacer.`
    if (Platform.OS === 'web') { if (window.confirm(msg)) run() }
    else Alert.alert('Borrar del inventario', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: run },
    ])
  }

  function abrirModal(p: InvProp) {
    setModalProp(p)
    setEditSeccion(p.inventario_seccion ?? '')
    setEditNotas(p.inv_notas ?? '')
  }

  async function guardarModal() {
    if (!modalProp) return
    setGuardandoModal(true)
    const cambios = {
      inventario_seccion: editSeccion.trim() || null,
      inv_notas: editNotas.trim() || null,
    }
    const { error } = await supabase.from('propiedades').update(cambios).eq('id', modalProp.id)
    setGuardandoModal(false)
    if (error) { Alert.alert('Error', 'No se pudo guardar.'); return }
    setItems((prev) => prev.map((x) => x.id === modalProp.id ? { ...x, ...cambios } : x))
    setModalProp(null)
  }

  function Check({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.checkBox, value && styles.checkBoxOn]}>
          {value && <Text style={styles.checkMark}>✓</Text>}
        </View>
        <Text style={[styles.checkLabel, value && styles.checkLabelOn]}>{label}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Text style={styles.backBtnText}>‹  Volver</Text>
      </TouchableOpacity>

      <View style={styles.intro}>
        <Text style={styles.introTitle}>📦 Inventario</Text>
        <Text style={styles.introSub}>
          Opciones de terceros en seguimiento. No se publican al catálogo hasta que el asesor autorice.
          Agrupadas por sección.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : grupos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>📭</Text>
          <Text style={styles.emptyText}>
            No hay propiedades en inventario.{'\n'}Al crear una propiedad activa “Guardar en Inventario”.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {grupos.map((g) => {
            const colapsada = colapsadas[g.seccion]
            const autorizadas = g.props.filter((p) => p.inv_autorizado_publicar).length
            return (
              <View key={g.seccion} style={styles.grupo}>
                <TouchableOpacity
                  style={styles.grupoHeader}
                  onPress={() => setColapsadas((s) => ({ ...s, [g.seccion]: !s[g.seccion] }))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.grupoTitulo}>{colapsada ? '▶' : '▼'}  {g.seccion}</Text>
                  <Text style={styles.grupoMeta}>{autorizadas}/{g.props.length} autorizadas</Text>
                </TouchableOpacity>

                {!colapsada && g.props.map((p) => {
                  const img = [...(p.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
                  return (
                    <View key={p.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                      <View style={styles.cardTop}>
                        {img?.url ? (
                          <Image source={{ uri: img.url }} style={styles.cardImg} />
                        ) : (
                          <View style={[styles.cardImg, styles.cardImgPh]}><Text style={{ fontSize: 26 }}>🏠</Text></View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitulo, { color: c.text }]} numberOfLines={2}>{p.titulo}</Text>
                          <Text style={styles.cardDir} numberOfLines={1}>📍 {p.direccion}</Text>
                          <Text style={styles.cardPrecio}>
                            {p.precio != null ? `$${p.precio.toLocaleString('es-MX')} MXN` : 'Sin precio'}
                          </Text>
                          {p.codigo ? <Text style={styles.cardCodigo}>{p.codigo}</Text> : null}
                        </View>
                      </View>

                      <View style={styles.checklist}>
                        <Check label="Contacté al asesor"      value={p.inv_asesor_contactado}   onPress={() => toggleCampo(p, 'inv_asesor_contactado', !p.inv_asesor_contactado)} />
                        <Check label="El asesor me respondió"   value={p.inv_asesor_respondio}    onPress={() => toggleCampo(p, 'inv_asesor_respondio', !p.inv_asesor_respondio)} />
                        <Check label="Autorizó publicar"        value={p.inv_autorizado_publicar} onPress={() => toggleCampo(p, 'inv_autorizado_publicar', !p.inv_autorizado_publicar)} />
                      </View>

                      {p.inv_notas ? <Text style={styles.notas}>📝 {p.inv_notas}</Text> : null}

                      <View style={styles.acciones}>
                        <TouchableOpacity style={styles.btnSeccion} onPress={() => abrirModal(p)}>
                          <Text style={styles.btnSeccionTxt}>✎ Sección / notas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnEditar} onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: p.id } })}>
                          <Text style={styles.btnEditarTxt}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btnPublicar, !p.inv_autorizado_publicar && styles.btnDisabled]}
                          onPress={() => p.inv_autorizado_publicar ? publicar(p) : Alert.alert('Falta autorización', 'Marca “Autorizó publicar” antes de pasar esta opción al catálogo.')}
                        >
                          <Text style={styles.btnPublicarTxt}>Publicar →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnBorrar} onPress={() => borrar(p)}>
                          <Text style={{ fontSize: 16 }}>🗑</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      )}

      <Modal visible={modalProp !== null} transparent animationType="fade" onRequestClose={() => setModalProp(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Sección y notas</Text>
            <Text style={styles.modalSub} numberOfLines={1}>{modalProp?.titulo}</Text>
            <Text style={styles.modalLabel}>Sección</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej. Lonas Taray Club"
              value={editSeccion}
              onChangeText={setEditSeccion}
              autoCapitalize="words"
            />
            <Text style={styles.modalLabel}>Notas de seguimiento</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 70 }]}
              placeholder="Ej. Esperando respuesta del asesor Juan…"
              value={editNotas}
              onChangeText={setEditNotas}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalAcciones}>
              <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalProp(null)}>
                <Text style={styles.modalCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalGuardar} onPress={guardarModal} disabled={guardandoModal}>
                {guardandoModal ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalGuardarTxt}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12, marginBottom: 2 },
  backBtnText: { fontSize: 16, fontWeight: '700', color: '#1a6470' },
  intro: { marginBottom: 12 },
  introTitle: { fontSize: 20, fontWeight: '800', color: '#8a6d1a' },
  introSub: { fontSize: 12, color: '#a8893f', marginTop: 3, lineHeight: 17 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50, paddingHorizontal: 20 },
  emptyText: { color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 21 },

  grupo: { marginBottom: 16 },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f3ecd8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  grupoTitulo: { fontSize: 15, fontWeight: '800', color: '#6f5712' },
  grupoMeta: { fontSize: 12, fontWeight: '700', color: '#a8893f' },

  card: {
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  cardImg: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#e8f0f0' },
  cardImgPh: { alignItems: 'center', justifyContent: 'center' },
  cardTitulo: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardDir: { fontSize: 12, color: '#888', marginBottom: 3 },
  cardPrecio: { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  cardCodigo: { fontSize: 11, color: '#aaa', marginTop: 2, fontWeight: '600' },

  checklist: { marginTop: 12, gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#c9a84c',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkBoxOn: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkLabel: { fontSize: 13, color: '#666' },
  checkLabelOn: { color: '#1a1a2e', fontWeight: '700' },

  notas: { fontSize: 12, color: '#7a5500', backgroundColor: '#fffbe6', borderRadius: 8, padding: 8, marginTop: 10 },

  acciones: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  btnSeccion: { borderWidth: 1, borderColor: '#c9a84c', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 8 },
  btnSeccionTxt: { color: '#8a6d1a', fontSize: 12, fontWeight: '700' },
  btnEditar: { borderWidth: 1, borderColor: '#1a6470', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
  btnEditarTxt: { color: '#1a6470', fontSize: 12, fontWeight: '700' },
  btnPublicar: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  btnPublicarTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  btnDisabled: { backgroundColor: '#b9c7ba' },
  btnBorrar: { borderWidth: 1, borderColor: '#c0392b', borderRadius: 9, paddingVertical: 7, paddingHorizontal: 9 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 460 },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: '#1a6470' },
  modalSub: { fontSize: 12, color: '#888', marginBottom: 14, marginTop: 2 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6, marginTop: 8 },
  modalInput: { borderWidth: 1, borderColor: '#dde8e9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalAcciones: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelar: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelarTxt: { color: '#888', fontSize: 14, fontWeight: '600' },
  modalGuardar: { flex: 2, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalGuardarTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
