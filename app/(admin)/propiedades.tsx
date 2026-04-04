import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  Modal,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Propiedad = {
  id: string
  codigo: string
  titulo: string
  precio: number | null
  direccion: string
  operacion: string | null
  tipo: string | null
  estado: string | null
  destacada: boolean
  destacada_mensaje: string | null
  recamaras: number | null
  banos: number | null
  m2: number | null
  estacionamientos: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroEstado = 'disponible' | 'vendida' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | null
type OrdenPrecio = 'asc' | 'desc' | null

export default function AdminPropiedades() {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const [filtroOperacion, setFiltroOperacion] = useState<FiltroOperacion>(null)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>(null)
  const [ordenPrecio, setOrdenPrecio] = useState<OrdenPrecio>(null)

  // Modal destacar
  const [modalVisible, setModalVisible] = useState(false)
  const [propSeleccionada, setPropSeleccionada] = useState<Propiedad | null>(null)
  const [mensajeDestacado, setMensajeDestacado] = useState('')
  const [guardandoDestacado, setGuardandoDestacado] = useState(false)

  async function cargarPropiedades() {
    setLoading(true)
    const { data, error } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, recamaras, banos, m2, estacionamientos, propiedad_imagenes(url, orden)')
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar las propiedades.')
    } else {
      setPropiedades(data ?? [])
    }
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarPropiedades() }, []))

  const filtrosActivos = [filtroOperacion, filtroEstado, filtroTipo, ordenPrecio].filter(Boolean).length

  let propiedadesFiltradas = propiedades

  if (busqueda.trim()) {
    const q = busqueda.trim().toLowerCase()
    propiedadesFiltradas = propiedadesFiltradas.filter((p) =>
      p.codigo?.toLowerCase().includes(q) || p.direccion?.toLowerCase().includes(q)
    )
  }
  if (filtroOperacion) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.operacion === filtroOperacion)
  if (filtroEstado) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.estado === filtroEstado)
  if (filtroTipo) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.tipo === filtroTipo)
  if (ordenPrecio) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      ordenPrecio === 'asc'
        ? (a.precio ?? Infinity) - (b.precio ?? Infinity)
        : (b.precio ?? -Infinity) - (a.precio ?? -Infinity)
    )
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function ejecutarBorrado(id: string) {
    const run = async () => {
      const { error: errorImagenes } = await supabase.from('propiedad_imagenes').delete().eq('propiedad_id', id)
      if (errorImagenes) { Alert.alert('Error', `No se pudieron borrar las imágenes: ${errorImagenes.message}`); return }
      const { error } = await supabase.from('propiedades').delete().eq('id', id)
      if (error) { Alert.alert('Error', `No se pudo borrar la propiedad: ${error.message}`) }
      else { setPropiedades((prev) => prev.filter((p) => p.id !== id)) }
    }
    run()
  }

  function handleBorrar(id: string, titulo: string) {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`)) ejecutarBorrado(id)
    } else {
      Alert.alert('Borrar propiedad', `¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => ejecutarBorrado(id) },
      ])
    }
  }

  function abrirModalDestacar(prop: Propiedad) {
    setPropSeleccionada(prop)
    setMensajeDestacado('')
    setModalVisible(true)
  }

  async function confirmarDestacar() {
    if (!propSeleccionada) return
    setGuardandoDestacado(true)
    const { error } = await supabase.rpc('destacar_propiedad_manual', {
      p_id: propSeleccionada.id,
      p_mensaje: mensajeDestacado.trim() || null,
    })
    setGuardandoDestacado(false)
    setModalVisible(false)
    if (error) {
      Alert.alert('Error', 'No se pudo destacar la propiedad.')
    } else {
      setPropiedades((prev) =>
        prev.map((p) =>
          p.id === propSeleccionada.id
            ? { ...p, destacada: true, destacada_mensaje: mensajeDestacado.trim() || 'El administrador ha destacado esta propiedad como una oportunidad especial.' }
            : p
        )
      )
    }
  }

  async function quitarDestacada(id: string) {
    const { error } = await supabase.rpc('quitar_destacada', { p_id: id })
    if (!error) {
      setPropiedades((prev) =>
        prev.map((p) => p.id === id ? { ...p, destacada: false, destacada_mensaje: null } : p)
      )
    }
  }

  function formatPrecio(precio: number | null) {
    if (precio == null) return 'Sin precio'
    return `$${precio.toLocaleString('es-MX')} MXN`
  }

  function limpiarFiltros() {
    setFiltroOperacion(null)
    setFiltroEstado(null)
    setFiltroTipo(null)
    setOrdenPrecio(null)
  }

  function FiltroChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Panel Admin</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.botonesTop}>
        <TouchableOpacity style={styles.buttonNueva} onPress={() => router.push('/(admin)/nueva-propiedad')}>
          <Text style={styles.buttonText}>+ Nueva propiedad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonActividad} onPress={() => router.push('/(admin)/actividad')}>
          <Text style={styles.buttonActividadText}>Actividad</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonActividad} onPress={() => router.push('/(admin)/estadisticas')}>
          <Text style={styles.buttonActividadText}>Estadísticas</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por código o dirección..."
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      <TouchableOpacity style={styles.filtrosToggle} onPress={() => setMostrarFiltros((v) => !v)}>
        <Text style={styles.filtrosToggleText}>
          Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''} {mostrarFiltros ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {mostrarFiltros && (
        <View style={styles.filtrosPanel}>
          <Text style={styles.filtroLabel}>Operación</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todas" active={filtroOperacion === null} onPress={() => setFiltroOperacion(null)} />
            <FiltroChip label="Venta" active={filtroOperacion === 'venta'} onPress={() => setFiltroOperacion(filtroOperacion === 'venta' ? null : 'venta')} />
            <FiltroChip label="Renta" active={filtroOperacion === 'renta'} onPress={() => setFiltroOperacion(filtroOperacion === 'renta' ? null : 'renta')} />
          </ScrollView>

          <Text style={styles.filtroLabel}>Estado</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todos" active={filtroEstado === null} onPress={() => setFiltroEstado(null)} />
            <FiltroChip label="Disponible" active={filtroEstado === 'disponible'} onPress={() => setFiltroEstado(filtroEstado === 'disponible' ? null : 'disponible')} />
            <FiltroChip label="Vendida" active={filtroEstado === 'vendida'} onPress={() => setFiltroEstado(filtroEstado === 'vendida' ? null : 'vendida')} />
          </ScrollView>

          <Text style={styles.filtroLabel}>Tipo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todos" active={filtroTipo === null} onPress={() => setFiltroTipo(null)} />
            <FiltroChip label="Casa" active={filtroTipo === 'casa'} onPress={() => setFiltroTipo(filtroTipo === 'casa' ? null : 'casa')} />
            <FiltroChip label="Departamento" active={filtroTipo === 'departamento'} onPress={() => setFiltroTipo(filtroTipo === 'departamento' ? null : 'departamento')} />
            <FiltroChip label="Local" active={filtroTipo === 'local'} onPress={() => setFiltroTipo(filtroTipo === 'local' ? null : 'local')} />
          </ScrollView>

          <Text style={styles.filtroLabel}>Precio</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Sin orden" active={ordenPrecio === null} onPress={() => setOrdenPrecio(null)} />
            <FiltroChip label="Menor precio" active={ordenPrecio === 'asc'} onPress={() => setOrdenPrecio(ordenPrecio === 'asc' ? null : 'asc')} />
            <FiltroChip label="Mayor precio" active={ordenPrecio === 'desc'} onPress={() => setOrdenPrecio(ordenPrecio === 'desc' ? null : 'desc')} />
          </ScrollView>

          {filtrosActivos > 0 && (
            <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarFiltros}>
              <Text style={styles.limpiarText}>Limpiar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1a1a2e" style={{ marginTop: 40 }} />
      ) : propiedadesFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {busqueda.trim() || filtrosActivos > 0 ? 'Sin resultados.' : 'No hay propiedades aún.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={propiedadesFiltradas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const primera = [...(item.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
            const tieneMeta = item.recamaras != null || item.banos != null || item.m2 != null || item.estacionamientos != null
            return (
              <View style={[styles.card, item.destacada && styles.cardDestacada]}>
                {primera?.url && (
                  <Image source={{ uri: primera.url }} style={styles.cardImagen} />
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.codigo}>{item.codigo ?? '—'}</Text>
                    {item.destacada && (
                      <Text style={styles.destacadaBadge}>★ Destacada</Text>
                    )}
                    <View style={[styles.estadoBadge, item.estado === 'vendida' && styles.estadoVendida]}>
                      <Text style={[styles.estadoText, item.estado === 'vendida' && styles.estadoTextVendida]}>
                        {item.estado === 'vendida' ? 'Vendida' : 'Disponible'}
                      </Text>
                    </View>
                    <Text style={styles.precio}>{formatPrecio(item.precio)}</Text>
                  </View>

                  {item.destacada && item.destacada_mensaje ? (
                    <Text style={styles.destacadaMensaje}>{item.destacada_mensaje}</Text>
                  ) : null}

                  {item.tipo && (
                    <Text style={styles.cardTipo}>
                      {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
                      {item.operacion ? ` · ${item.operacion}` : ''}
                    </Text>
                  )}

                  <Text style={styles.cardTitulo}>{item.titulo}</Text>
                  <Text style={styles.cardDireccion} numberOfLines={1}>{item.direccion}</Text>

                  {tieneMeta && (
                    <View style={styles.metaRow}>
                      {item.recamaras != null && <Text style={styles.metaItem}>Rec {item.recamaras}</Text>}
                      {item.banos != null && <Text style={styles.metaItem}>Ba {item.banos}</Text>}
                      {item.m2 != null && <Text style={styles.metaItem}>{item.m2}m²</Text>}
                      {item.estacionamientos != null && <Text style={styles.metaItem}>Est {item.estacionamientos}</Text>}
                    </View>
                  )}

                  <View style={styles.cardAcciones}>
                    <TouchableOpacity
                      style={styles.btnEditar}
                      onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: item.id } })}
                    >
                      <Text style={styles.btnEditarText}>Editar</Text>
                    </TouchableOpacity>
                    {item.destacada ? (
                      <TouchableOpacity style={styles.btnQuitarDestacada} onPress={() => quitarDestacada(item.id)}>
                        <Text style={styles.btnQuitarDestacadaText}>Quitar destacado</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.btnDestacar} onPress={() => abrirModalDestacar(item)}>
                        <Text style={styles.btnDestacarText}>★ Destacar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.btnBorrar} onPress={() => handleBorrar(item.id, item.titulo)}>
                      <Text style={styles.btnBorrarText}>Borrar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Modal para destacar propiedad */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Destacar propiedad</Text>
            <Text style={styles.modalSubtitulo}>
              {propSeleccionada?.codigo} – {propSeleccionada?.titulo}
            </Text>
            <Text style={styles.modalLabel}>Mensaje para los prospectadores (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Se están agendando muchas citas en esta propiedad..."
              value={mensajeDestacado}
              onChangeText={setMensajeDestacado}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.modalHint}>
              Si lo dejas vacío se usará el mensaje por defecto. Se enviará una notificación a todos los prospectadores.
            </Text>
            <View style={styles.modalAcciones}>
              <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmar, guardandoDestacado && { opacity: 0.6 }]}
                onPress={confirmarDestacar}
                disabled={guardandoDestacado}
              >
                {guardandoDestacado
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmarText}>Destacar y notificar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a1a2e' },
  logoutText: { color: '#999', fontSize: 14 },
  buttonNueva: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  botonesTop: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  buttonActividad: {
    borderWidth: 1,
    borderColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActividadText: { color: '#1a1a2e', fontSize: 15, fontWeight: '600' },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 8,
    color: '#1a1a2e',
  },
  filtrosToggle: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filtrosToggleText: { color: '#1a1a2e', fontSize: 14, fontWeight: '600' },
  filtrosPanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  filtroLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 6, marginTop: 8 },
  chipRow: { flexDirection: 'row', marginBottom: 2 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#1a1a2e', borderColor: '#1a1a2e' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  limpiarBtn: { marginTop: 10, alignSelf: 'flex-end' },
  limpiarText: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#aaa', fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  cardDestacada: {
    borderColor: '#f5c518',
    borderWidth: 2,
  },
  cardImagen: { width: '100%', height: 160 },
  cardBody: { padding: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  codigo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  destacadaBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7a5500',
    backgroundColor: '#fff3c4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  destacadaMensaje: {
    fontSize: 12,
    color: '#7a5500',
    backgroundColor: '#fffbe6',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f5e07a',
  },
  estadoBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  estadoVendida: { backgroundColor: '#fce4ec' },
  estadoText: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  estadoTextVendida: { color: '#c62828' },
  precio: { fontSize: 13, color: '#555', marginLeft: 'auto' },
  cardTipo: { fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'capitalize' },
  cardTitulo: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  cardDireccion: { fontSize: 13, color: '#888', marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  metaItem: {
    fontSize: 12,
    color: '#555',
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardAcciones: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnEditar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnEditarText: { color: '#1a1a2e', fontSize: 14, fontWeight: '600' },
  btnDestacar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8960c',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#fffbe6',
  },
  btnDestacarText: { color: '#7a5500', fontSize: 13, fontWeight: '700' },
  btnQuitarDestacada: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnQuitarDestacadaText: { color: '#888', fontSize: 12, fontWeight: '600' },
  btnBorrar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnBorrarText: { color: '#c0392b', fontSize: 14, fontWeight: '600' },

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
  modalSubtitulo: { fontSize: 13, color: '#888', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a2e',
    minHeight: 80,
    marginBottom: 8,
  },
  modalHint: { fontSize: 12, color: '#aaa', marginBottom: 20, lineHeight: 17 },
  modalAcciones: { flexDirection: 'row', gap: 10 },
  modalCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelarText: { color: '#888', fontSize: 14, fontWeight: '600' },
  modalConfirmar: {
    flex: 2,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
