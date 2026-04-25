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
  es_constructora: boolean | null
  nombre_constructora: string | null
  recamaras: number | null
  banos: number | null
  m2: number | null
  estacionamientos: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroEstado = 'disponible' | 'vendida' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | 'terreno' | null
type OrdenPrecio = 'asc' | 'desc' | null

const NAV_ITEMS = [
  { label: 'Nueva', icon: '＋', route: '/(admin)/nueva-propiedad', color: '#1a6470' },
  { label: 'CRM', icon: '👤', route: '/(admin)/crm', color: '#0f4c5c' },
  { label: 'Actividad', icon: '📋', route: '/(admin)/actividad', color: '#2a8a7a' },
  { label: 'Estadísticas', icon: '📊', route: '/(admin)/estadisticas', color: '#1a7060' },
  { label: 'Usuarios', icon: '👥', route: '/(admin)/prospectadores', color: '#145560' },
  { label: 'Universidad', icon: '🎓', route: '/(admin)/university', color: '#c9a84c' },
]

export default function AdminPropiedades() {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const [filtroOperacion, setFiltroOperacion] = useState<FiltroOperacion>(null)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>(null)
  const [ordenPrecio, setOrdenPrecio] = useState<OrdenPrecio>(null)

  const [modalVisible, setModalVisible] = useState(false)
  const [propSeleccionada, setPropSeleccionada] = useState<Propiedad | null>(null)
  const [mensajeDestacado, setMensajeDestacado] = useState('')
  const [guardandoDestacado, setGuardandoDestacado] = useState(false)

  async function cargarPropiedades() {
    setLoading(true)
    const { data, error } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, es_constructora, nombre_constructora, recamaras, banos, m2, estacionamientos, propiedad_imagenes(url, orden)')
      .order('created_at', { ascending: false })
    if (error) Alert.alert('Error', 'No se pudieron cargar las propiedades.')
    else setPropiedades(data ?? [])
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

  function ejecutarBorrado(id: string) {
    const run = async () => {
      const { error: errorImagenes } = await supabase.from('propiedad_imagenes').delete().eq('propiedad_id', id)
      if (errorImagenes) { Alert.alert('Error', `No se pudieron borrar las imágenes: ${errorImagenes.message}`); return }
      const { error } = await supabase.from('propiedades').delete().eq('id', id)
      if (error) Alert.alert('Error', `No se pudo borrar la propiedad: ${error.message}`)
      else setPropiedades((prev) => prev.filter((p) => p.id !== id))
    }
    run()
  }

  function handleBorrar(id: string, titulo: string) {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`)) ejecutarBorrado(id)
    } else {
      Alert.alert('Borrar propiedad', `¿Eliminar "${titulo}"?`, [
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
    if (!error) setPropiedades((prev) => prev.map((p) => p.id === id ? { ...p, destacada: false, destacada_mensaje: null } : p))
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

      {/* Grid de navegación */}
      <View style={styles.navGrid}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.navCard, { backgroundColor: item.color }]}
            onPress={() => router.push(item.route as any)}
          >
            <Text style={styles.navIcon}>{item.icon}</Text>
            <Text style={styles.navLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Barra de búsqueda con ícono */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código o dirección..."
          placeholderTextColor="#aaa"
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Toggle de filtros */}
      <TouchableOpacity style={styles.filtrosToggle} onPress={() => setMostrarFiltros((v) => !v)}>
        <Text style={styles.filtrosToggleText}>
          {filtrosActivos > 0 ? `Filtros (${filtrosActivos}) ` : 'Filtros '}
          {mostrarFiltros ? '▲' : '▼'}
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
            <FiltroChip label="Terreno" active={filtroTipo === 'terreno'} onPress={() => setFiltroTipo(filtroTipo === 'terreno' ? null : 'terreno')} />
          </ScrollView>
          <Text style={styles.filtroLabel}>Precio</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Sin orden" active={ordenPrecio === null} onPress={() => setOrdenPrecio(null)} />
            <FiltroChip label="↑ Menor" active={ordenPrecio === 'asc'} onPress={() => setOrdenPrecio(ordenPrecio === 'asc' ? null : 'asc')} />
            <FiltroChip label="↓ Mayor" active={ordenPrecio === 'desc'} onPress={() => setOrdenPrecio(ordenPrecio === 'desc' ? null : 'desc')} />
          </ScrollView>
          {filtrosActivos > 0 && (
            <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarFiltros}>
              <Text style={styles.limpiarText}>Limpiar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : propiedadesFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🏠</Text>
          <Text style={styles.emptyText}>
            {busqueda.trim() || filtrosActivos > 0 ? 'Sin resultados para esa búsqueda.' : 'No hay propiedades aún.'}
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
                {/* Imagen con badges superpuestos */}
                <View style={styles.imagenWrapper}>
                  {primera?.url ? (
                    <Image source={{ uri: primera.url }} style={styles.cardImagen} />
                  ) : (
                    <View style={styles.cardImagenPlaceholder}>
                      <Text style={styles.cardImagenPlaceholderText}>🏠</Text>
                    </View>
                  )}
                  {/* Overlay oscuro sutil en la parte inferior */}
                  <View style={styles.imagenOverlay} />

                  {/* Badges flotantes — esquina superior izquierda */}
                  <View style={styles.badgesTop}>
                    <Text style={styles.codigoBadge}>{item.codigo ?? '—'}</Text>
                    {item.destacada && <Text style={styles.destacadaBadge}>★ Destacada</Text>}
                    <View style={[styles.estadoBadge, item.estado === 'vendida' && styles.estadoVendida]}>
                      <Text style={[styles.estadoText, item.estado === 'vendida' && styles.estadoTextVendida]}>
                        {item.estado === 'vendida' ? 'Vendida' : 'Disponible'}
                      </Text>
                    </View>
                  </View>

                  {/* Precio flotante — esquina inferior derecha */}
                  <View style={styles.precioBadge}>
                    <Text style={styles.precioText}>{formatPrecio(item.precio)}</Text>
                  </View>
                </View>

                {/* Cuerpo de la tarjeta */}
                <View style={styles.cardBody}>
                  {item.destacada && item.destacada_mensaje ? (
                    <Text style={styles.destacadaMensaje}>{item.destacada_mensaje}</Text>
                  ) : null}

                  {item.tipo && (
                    <Text style={styles.cardTipo}>
                      {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
                      {item.operacion ? ` · ${item.operacion}` : ''}
                    </Text>
                  )}

                  {item.es_constructora && (
                    <Text style={styles.constructoraBadge}>
                      🏗️ {item.nombre_constructora ? item.nombre_constructora : 'Constructora'}
                    </Text>
                  )}

                  <Text style={styles.cardTitulo}>{item.titulo}</Text>
                  <Text style={styles.cardDireccion} numberOfLines={1}>📍 {item.direccion}</Text>

                  {tieneMeta && (
                    <View style={styles.metaRow}>
                      {item.recamaras != null && <Text style={styles.metaItem}>🛏 {item.recamaras}</Text>}
                      {item.banos != null && <Text style={styles.metaItem}>🚿 {item.banos}</Text>}
                      {item.m2 != null && <Text style={styles.metaItem}>📐 {item.m2}m²</Text>}
                      {item.estacionamientos != null && <Text style={styles.metaItem}>🚗 {item.estacionamientos}</Text>}
                    </View>
                  )}

                  {/* Botones de acción compactos */}
                  <View style={styles.cardAcciones}>
                    <TouchableOpacity
                      style={styles.btnEditar}
                      onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: item.id } })}
                    >
                      <Text style={styles.btnEditarText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    {item.destacada ? (
                      <TouchableOpacity style={styles.btnQuitarDestacada} onPress={() => quitarDestacada(item.id)}>
                        <Text style={styles.btnQuitarDestacadaText}>✕ Destacado</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.btnDestacar} onPress={() => abrirModalDestacar(item)}>
                        <Text style={styles.btnDestacarText}>★ Destacar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.btnBorrar} onPress={() => handleBorrar(item.id, item.titulo)}>
                      <Text style={styles.btnBorrarText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Modal destacar */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
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
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: '#f0f5f5' },

  // Grid de navegación 2x2
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  navCard: {
    width: '47%',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  navIcon: { fontSize: 22 },
  navLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Búsqueda
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde8e9',
    paddingHorizontal: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a2e30',
  },
  clearBtn: { padding: 4 },
  clearBtnText: { color: '#aaa', fontSize: 16 },

  // Filtros
  filtrosToggle: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filtrosToggleText: { color: '#1a6470', fontSize: 14, fontWeight: '600' },
  filtrosPanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dde8e9',
  },
  filtroLabel: { fontSize: 11, fontWeight: '700', color: '#888', marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  limpiarBtn: { marginTop: 10, alignSelf: 'flex-end' },
  limpiarText: { fontSize: 12, color: '#c0392b', fontWeight: '600' },

  // Empty
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardDestacada: {
    borderWidth: 2,
    borderColor: '#c9a84c',
  },

  // Imagen con badges superpuestos
  imagenWrapper: { position: 'relative' },
  cardImagen: { width: '100%', height: 180 },
  cardImagenPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#e8f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagenPlaceholderText: { fontSize: 40 },
  imagenOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  badgesTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  codigoBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#1a6470',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  destacadaBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a2e00',
    backgroundColor: '#c9a84c',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  estadoBadge: {
    backgroundColor: 'rgba(46,125,50,0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  estadoVendida: { backgroundColor: 'rgba(198,40,40,0.85)' },
  estadoText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  estadoTextVendida: { color: '#fff' },
  precioBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  precioText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Cuerpo
  cardBody: { padding: 14 },
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
  cardTipo: { fontSize: 11, color: '#888', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  constructoraBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    fontSize: 12,
    color: '#1a4a6b',
    fontWeight: '600',
    overflow: 'hidden',
  },
  cardTitulo: { fontSize: 16, fontWeight: '700', color: '#1a2e30', marginBottom: 4 },
  cardDireccion: { fontSize: 13, color: '#888', marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  metaItem: {
    fontSize: 12,
    color: '#1a6470',
    backgroundColor: '#e8f4f4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: '600',
  },

  // Botones de acción
  cardAcciones: { flexDirection: 'row', gap: 8 },
  btnEditar: {
    flex: 2,
    borderWidth: 1.5,
    borderColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnEditarText: { color: '#1a6470', fontSize: 13, fontWeight: '700' },
  btnDestacar: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#c9a84c',
  },
  btnDestacarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnQuitarDestacada: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnQuitarDestacadaText: { color: '#888', fontSize: 12, fontWeight: '600' },
  btnBorrar: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#c0392b',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnBorrarText: { fontSize: 16 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 480,
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 4 },
  modalSubtitulo: { fontSize: 13, color: '#888', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dde8e9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a2e30',
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
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelarText: { color: '#888', fontSize: 14, fontWeight: '600' },
  modalConfirmar: {
    flex: 2,
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalConfirmarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
