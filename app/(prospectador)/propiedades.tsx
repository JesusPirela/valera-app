import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
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
  exclusiva: boolean
  recamaras: number | null
  banos: number | null
  m2: number | null
  estacionamientos: number | null
  descripcion: string | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | 'terreno' | null
type OrdenPrecio = 'asc' | 'desc' | null

function FiltroChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

export default function ProspectadorPropiedades() {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null)
  const [publicadas, setPublicadas] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  const [filtroOperacion, setFiltroOperacion] = useState<FiltroOperacion>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>(null)
  const [ordenPrecio, setOrdenPrecio] = useState<OrdenPrecio>(null)

  async function cargarPropiedades() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, nombre')
      .eq('id', user!.id)
      .single()
    const rolActual = profile?.role ?? null
    setRol(rolActual)
    setNombreUsuario(profile?.nombre ?? null)

    let query = supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, exclusiva, recamaras, banos, m2, estacionamientos, descripcion, propiedad_imagenes(url, orden)')
      .eq('estado', 'disponible')
      .order('created_at', { ascending: false })

    if (rolActual !== 'prospectador_plus') {
      query = query.eq('exclusiva', false)
    }

    const { data, error } = await query

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar las propiedades.')
    } else {
      setPropiedades(data ?? [])
    }

    // Cargar cuáles ya publicó el usuario
    if (user) {
      const { data: pub } = await supabase
        .from('propiedad_publicada')
        .select('propiedad_id')
        .eq('user_id', user.id)
      setPublicadas(new Set((pub ?? []).map((r: { propiedad_id: string }) => r.propiedad_id)))
    }

    setLoading(false)
  }

  async function togglePublicada(propiedadId: string) {
    if (toggling.has(propiedadId)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setToggling((prev) => new Set(prev).add(propiedadId))

    const yaPublicada = publicadas.has(propiedadId)
    if (yaPublicada) {
      await supabase
        .from('propiedad_publicada')
        .delete()
        .eq('user_id', user.id)
        .eq('propiedad_id', propiedadId)
      setPublicadas((prev) => { const s = new Set(prev); s.delete(propiedadId); return s })
    } else {
      await supabase
        .from('propiedad_publicada')
        .insert({ user_id: user.id, propiedad_id: propiedadId })
      setPublicadas((prev) => new Set(prev).add(propiedadId))
    }

    setToggling((prev) => { const s = new Set(prev); s.delete(propiedadId); return s })
  }

  useFocusEffect(useCallback(() => { cargarPropiedades() }, []))

  const filtrosActivos = [filtroOperacion, filtroTipo, ordenPrecio].filter(Boolean).length

  let propiedadesFiltradas = propiedades

  if (busqueda.trim()) {
    const q = busqueda.trim().toLowerCase()
    propiedadesFiltradas = propiedadesFiltradas.filter((p) =>
      p.codigo?.toLowerCase().includes(q) ||
      p.direccion?.toLowerCase().includes(q) ||
      p.titulo?.toLowerCase().includes(q)
    )
  }
  if (filtroOperacion) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.operacion === filtroOperacion)
  if (filtroTipo) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.tipo === filtroTipo)
  if (ordenPrecio) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      ordenPrecio === 'asc'
        ? (a.precio ?? Infinity) - (b.precio ?? Infinity)
        : (b.precio ?? -Infinity) - (a.precio ?? -Infinity)
    )
  }

  function limpiarFiltros() {
    setFiltroOperacion(null)
    setFiltroTipo(null)
    setOrdenPrecio(null)
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por título, código o dirección..."
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
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : propiedadesFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {busqueda.trim() || filtrosActivos > 0
              ? 'Sin resultados para tu búsqueda.'
              : 'No hay propiedades disponibles.'}
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
              <TouchableOpacity
                style={[styles.card, item.exclusiva && styles.cardExclusiva, item.destacada && !item.exclusiva && styles.cardDestacada]}
                activeOpacity={0.85}
                onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${item.id}`)}
              >
                {primera?.url && (
                  <Image source={{ uri: primera.url }} style={styles.cardImagen} resizeMode="cover" />
                )}
                {item.exclusiva && (
                  <View style={styles.exclusivaBanner}>
                    <Text style={styles.exclusivaBannerText}>★ Propiedad exclusiva</Text>
                  </View>
                )}
                {item.destacada && !item.exclusiva && (
                  <View style={styles.destacadaBanner}>
                    <Text style={styles.destacadaBannerText}>★ Propiedad destacada</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  {item.destacada && item.destacada_mensaje ? (
                    <Text style={styles.destacadaMensaje}>{item.destacada_mensaje}</Text>
                  ) : null}
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.codigo}>{item.codigo ?? '—'}</Text>
                    {item.tipo && (
                      <Text style={styles.tipoBadge}>
                        {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
                        {item.operacion ? ` · ${item.operacion}` : ''}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.cardTitulo}>{item.titulo}</Text>
                  <Text style={styles.cardDireccion} numberOfLines={1}>{item.direccion}</Text>

                  {item.descripcion ? (
                    <Text style={styles.cardDescripcion} numberOfLines={2}>{item.descripcion}</Text>
                  ) : null}

                  {tieneMeta && (
                    <View style={styles.metaRow}>
                      {item.recamaras != null && <Text style={styles.metaItem}>Rec {item.recamaras}</Text>}
                      {item.banos != null && <Text style={styles.metaItem}>Ba {item.banos}</Text>}
                      {item.m2 != null && <Text style={styles.metaItem}>{item.m2}m²</Text>}
                      {item.estacionamientos != null && <Text style={styles.metaItem}>Est {item.estacionamientos}</Text>}
                    </View>
                  )}

                  <View style={styles.cardFooter}>
                    <Text style={styles.precio}>{formatPrecio(item.precio)}</Text>
                    <TouchableOpacity
                      style={[styles.publicadaBtn, publicadas.has(item.id) && styles.publicadaBtnActive]}
                      onPress={(e) => { e.stopPropagation(); togglePublicada(item.id) }}
                      disabled={toggling.has(item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {toggling.has(item.id) ? (
                        <ActivityIndicator size="small" color={publicadas.has(item.id) ? '#fff' : '#1a6470'} />
                      ) : (
                        <Text style={[styles.publicadaBtnText, publicadas.has(item.id) && styles.publicadaBtnTextActive]}>
                          {publicadas.has(item.id) ? '✓ Publicada' : 'Publicar'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 8,
    color: '#1a6470',
  },
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
  chipActive: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  limpiarBtn: { marginTop: 10, alignSelf: 'flex-end' },
  limpiarText: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDestacada: {
    borderColor: '#f5c518',
    borderWidth: 2,
  },
  cardExclusiva: {
    borderColor: '#c0392b',
    borderWidth: 2,
  },
  destacadaBanner: {
    backgroundColor: '#fff3c4',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  destacadaBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7a5500',
  },
  exclusivaBanner: {
    backgroundColor: '#c0392b',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  exclusivaBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
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
  cardImagen: { width: '100%', height: 180 },
  cardBody: { padding: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  codigo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#1a6470',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tipoBadge: {
    fontSize: 11,
    color: '#555',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'capitalize',
  },
  cardTitulo: { fontSize: 16, fontWeight: '700', color: '#1a6470', marginBottom: 3 },
  cardDireccion: { fontSize: 13, color: '#888', marginBottom: 6 },
  cardDescripcion: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  metaItem: {
    fontSize: 12,
    color: '#555',
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  precio: { fontSize: 16, fontWeight: '700', color: '#1a6470' },
  publicadaBtn: {
    borderWidth: 1.5,
    borderColor: '#1a6470',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 80,
    alignItems: 'center',
  },
  publicadaBtnActive: {
    backgroundColor: '#1a6470',
    borderColor: '#1a6470',
  },
  publicadaBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a6470',
  },
  publicadaBtnTextActive: {
    color: '#fff',
  },
})
