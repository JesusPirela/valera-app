import { useState, useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Linking,
  Platform,
  useWindowDimensions,
  StatusBar,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'

const LOGO = require('../../assets/logo.png')
import { useTheme } from '../../lib/ThemeContext'
import { registrarAccion } from '../../lib/gamification'
import { computePhash, hammingDistance } from '../../lib/phash'

type Propiedad = {
  id: string
  codigo: string
  titulo: string
  precio: number | null
  direccion: string
  operacion: string | null
  tipo: string | null
  estado: string | null
  zona: 'queretaro' | 'monterrey' | 'puebla' | null
  destacada: boolean
  destacada_mensaje: string | null
  exclusiva: boolean
  es_constructora: boolean | null
  nombre_constructora: string | null
  recamaras: number | null
  banos: number | null
  m2: number | null
  estacionamientos: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | 'terreno' | null
type OrdenPrecio = 'asc' | 'desc' | null
type FiltroPublicadas = 'publicadas' | 'sin_publicar' | null

type PropiedadesData = {
  rol: string | null
  nombreUsuario: string | null
  userId: string
  propiedades: Propiedad[]
  publicadasIds: string[]
}

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro' },
  { key: 'monterrey', label: 'Monterrey' },
  { key: 'puebla', label: 'Puebla' },
] as const

function FiltroChip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

function agruparPorZona(propiedades: Propiedad[]): [string, Propiedad[]][] {
  const result: [string, Propiedad[]][] = []
  for (const z of ZONAS_CONFIG) {
    const group = propiedades.filter(p => p.zona === z.key)
    if (group.length > 0) result.push([z.label, group])
  }
  const sinZona = propiedades.filter(p => !p.zona)
  if (sinZona.length > 0) result.push(['Otras', sinZona])
  return result
}

export default function ProspectadorPropiedades() {
  const queryClient = useQueryClient()
  const isOnline = useNetworkStatus()
  const { primaryColor } = useTheme()

  const [busqueda, setBusqueda] = useState('')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const togglingRef = useRef<Set<string>>(new Set())
  togglingRef.current = toggling
  const [filtroOperacion, setFiltroOperacion] = useState<FiltroOperacion>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>(null)
  const [ordenPrecio, setOrdenPrecio] = useState<OrdenPrecio>(null)
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [filtroPublicadas, setFiltroPublicadas] = useState<FiltroPublicadas>(null)
  const [vistaZonas, setVistaZonas] = useState(false)
  const [zonasExpandidas, setZonasExpandidas] = useState<Set<string>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  const [mensajeAyuda, setMensajeAyuda] = useState('')
  const [buscandoImagen, setBuscandoImagen] = useState(false)
  const [resultadoImagenId, setResultadoImagenId] = useState<string | null>(null)
  const [resultadosImagen, setResultadosImagen] = useState<{ propiedad: Propiedad; distancia: number }[]>([])
  const [showResultadosImagen, setShowResultadosImagen] = useState(false)

  const { data: queryData, isLoading, refetch } = useQuery<PropiedadesData>({
    queryKey: ['prospectador-propiedades'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('No user')

      const [profileRes, propsRes, pubRes] = await Promise.all([
        supabase.from('profiles').select('role, nombre').eq('id', userId).single(),
        supabase
          .from('propiedades')
          .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, zona, destacada, destacada_mensaje, exclusiva, es_constructora, nombre_constructora, recamaras, banos, m2, estacionamientos, propiedad_imagenes(url, orden)')
          .eq('estado', 'disponible')
          .order('created_at', { ascending: false })
          .order('orden', { referencedTable: 'propiedad_imagenes', ascending: true }),
        supabase.from('propiedad_publicada').select('propiedad_id').eq('user_id', userId),
      ])

      if (propsRes.error) throw propsRes.error

      const rol = profileRes.data?.role ?? null
      let propiedades = (propsRes.data ?? []) as Propiedad[]
      if (rol !== 'prospectador_plus') {
        propiedades = propiedades.filter(p => !p.exclusiva)
      }

      return {
        rol,
        nombreUsuario: profileRes.data?.nombre ?? null,
        userId,
        propiedades,
        publicadasIds: (pubRes.data ?? []).map((r: { propiedad_id: string }) => r.propiedad_id),
      }
    },
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  useFocusEffect(useCallback(() => {
    if (togglingRef.current.size === 0) {
      const state = queryClient.getQueryState(['prospectador-propiedades'])
      const isStale = !state?.dataUpdatedAt || Date.now() - state.dataUpdatedAt > 1000 * 60 * 5
      if (isStale) refetch()
    }
  }, [refetch, queryClient]))

  useEffect(() => {
    if (!queryData?.propiedades) return
    for (const p of queryData.propiedades) {
      queryClient.setQueryData(
        ['detalle-propiedad', p.id],
        (old: unknown) => old ?? { propiedad: p, subidoPor: null, nombreUsuario: queryData.nombreUsuario }
      )
    }
  }, [queryData?.propiedades])

  const propiedades = queryData?.propiedades ?? []
  const publicadas = new Set(queryData?.publicadasIds ?? [])

  async function togglePublicada(propiedadId: string) {
    if (togglingRef.current.has(propiedadId)) return
    const userId = queryData?.userId
    if (!userId) return

    const yaPublicada = publicadas.has(propiedadId)

    // Actualizar ref inmediatamente (antes del re-render) para que useFocusEffect
    // no dispare un refetch() entre el click y el primer render con el nuevo state
    const newTogglingSet = new Set(togglingRef.current)
    newTogglingSet.add(propiedadId)
    togglingRef.current = newTogglingSet
    setToggling(newTogglingSet)

    queryClient.setQueryData<PropiedadesData>(['prospectador-propiedades'], old => {
      if (!old) return old
      return {
        ...old,
        publicadasIds: yaPublicada
          ? old.publicadasIds.filter(id => id !== propiedadId)
          : [...old.publicadasIds, propiedadId],
      }
    })

    let error: any = null
    if (yaPublicada) {
      const res = await supabase.from('propiedad_publicada').delete().eq('user_id', userId).eq('propiedad_id', propiedadId)
      error = res.error
    } else {
      const res = await supabase.from('propiedad_publicada')
        .upsert({ user_id: userId, propiedad_id: propiedadId }, { onConflict: 'user_id,propiedad_id', ignoreDuplicates: true })
      error = res.error
    }

    if (error) {
      queryClient.setQueryData<PropiedadesData>(['prospectador-propiedades'], old => {
        if (!old) return old
        return {
          ...old,
          publicadasIds: yaPublicada
            ? [...old.publicadasIds, propiedadId]
            : old.publicadasIds.filter(id => id !== propiedadId),
        }
      })
    } else if (!yaPublicada) {
      registrarAccion(userId, 'publicar_propiedad').catch(() => {})
    }

    const finalTogglingSet = new Set(togglingRef.current)
    finalTogglingSet.delete(propiedadId)
    togglingRef.current = finalTogglingSet
    setToggling(finalTogglingSet)
  }

  function toggleZona(zona: string) {
    setZonasExpandidas(prev => {
      const s = new Set(prev)
      if (s.has(zona)) s.delete(zona)
      else s.add(zona)
      return s
    })
  }

  function enviarAyuda() {
    const msg = mensajeAyuda.trim()
    if (!msg) return
    const nombre = queryData?.nombreUsuario ?? 'Un prospectador'
    const texto = `Hola, soy ${nombre} (prospectador Valera). ${msg}`
    Linking.openURL(`https://wa.me/527821954946?text=${encodeURIComponent(texto)}`)
    setShowHelp(false)
    setMensajeAyuda('')
  }

  const precioMinNum = precioMin ? parseFloat(precioMin.replace(/,/g, '')) : null
  const precioMaxNum = precioMax ? parseFloat(precioMax.replace(/,/g, '')) : null

  const filtrosActivos = [
    filtroOperacion,
    filtroTipo,
    ordenPrecio,
    (precioMinNum != null || precioMaxNum != null) ? 'precio' : null,
    filtroPublicadas,
  ].filter(Boolean).length

  let propiedadesFiltradas = propiedades

  if (busqueda.trim()) {
    const q = busqueda.trim().toLowerCase()
    propiedadesFiltradas = propiedadesFiltradas.filter((p) =>
      p.codigo?.toLowerCase().includes(q) ||
      p.direccion?.toLowerCase().includes(q) ||
      p.titulo?.toLowerCase().includes(q)
    )
  }
  if (filtroPublicadas === 'publicadas') propiedadesFiltradas = propiedadesFiltradas.filter(p => publicadas.has(p.id))
  if (filtroPublicadas === 'sin_publicar') propiedadesFiltradas = propiedadesFiltradas.filter(p => !publicadas.has(p.id))
  if (filtroOperacion) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.operacion === filtroOperacion)
  if (filtroTipo) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.tipo === filtroTipo)
  if (precioMinNum != null) propiedadesFiltradas = propiedadesFiltradas.filter(p => p.precio != null && p.precio >= precioMinNum)
  if (precioMaxNum != null) propiedadesFiltradas = propiedadesFiltradas.filter(p => p.precio != null && p.precio <= precioMaxNum)
  if (ordenPrecio) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      ordenPrecio === 'asc'
        ? (a.precio ?? Infinity) - (b.precio ?? Infinity)
        : (b.precio ?? -Infinity) - (a.precio ?? -Infinity)
    )
  }

  const propiedadesPorZona = vistaZonas ? agruparPorZona(propiedadesFiltradas) : []

  async function buscarPorImagen() {
    if (Platform.OS !== 'web') {
      Alert.alert('Solo disponible en web', 'La búsqueda por imagen funciona en la versión web de la app.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })
    if (result.canceled || !result.assets[0]) return

    setBuscandoImagen(true)
    setResultadoImagenId(null)
    try {
      const queryPhash = await computePhash(result.assets[0].uri)
      if (!queryPhash) throw new Error('No se pudo procesar la imagen')

      const { data: rows, error } = await supabase
        .from('propiedad_imagenes')
        .select('propiedad_id, phash')
        .not('phash', 'is', null)
      if (error) throw error
      if (!rows || rows.length === 0) {
        Alert.alert('Sin datos', 'Aún no hay imágenes indexadas.')
        return
      }

      // Calcular distancia mínima por propiedad (puede tener varias fotos)
      const distPorPropiedad = new Map<string, number>()
      for (const row of rows) {
        if (!row.phash) continue
        const dist = hammingDistance(queryPhash, row.phash)
        const prev = distPorPropiedad.get(row.propiedad_id)
        if (prev === undefined || dist < prev) distPorPropiedad.set(row.propiedad_id, dist)
      }

      // Top 3 más cercanas
      const top3 = [...distPorPropiedad.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([id, distancia]) => ({ propiedad: propiedades.find(p => p.id === id), distancia }))
        .filter(r => r.propiedad != null) as { propiedad: Propiedad; distancia: number }[]

      if (top3.length === 0) {
        Alert.alert('Sin resultado', 'No se encontraron propiedades.')
        return
      }

      setResultadosImagen(top3)
      setShowResultadosImagen(true)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo buscar por imagen.')
    } finally {
      setBuscandoImagen(false)
    }
  }

  function limpiarFiltros() {
    setFiltroOperacion(null)
    setFiltroTipo(null)
    setOrdenPrecio(null)
    setFiltroPublicadas(null)
    setPrecioMin('')
    setPrecioMax('')
  }

  function renderPropiedad(item: Propiedad, width?: number) {
    const primera = item.propiedad_imagenes?.[0]
    const tieneMeta = item.recamaras != null || item.banos != null || item.m2 != null || item.estacionamientos != null
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          item.exclusiva && styles.cardExclusiva,
          item.destacada && !item.exclusiva && styles.cardDestacada,
          width != null && { width },
        ]}
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
            <Text style={[styles.codigo, { backgroundColor: primaryColor }]}>{item.codigo ?? '—'}</Text>
            {item.tipo && (
              <Text style={styles.tipoBadge}>
                {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
                {item.operacion ? ` · ${item.operacion}` : ''}
              </Text>
            )}
          </View>
          {item.es_constructora && (
            <Text style={styles.constructoraBadge}>
              🏗️ {item.nombre_constructora ? item.nombre_constructora : 'Constructora'}
            </Text>
          )}
          <Text style={[styles.cardTitulo, { color: primaryColor }]}>{item.titulo}</Text>
          <Text style={styles.cardDireccion} numberOfLines={1}>{item.direccion}</Text>
          {tieneMeta && (
            <View style={styles.metaRow}>
              {item.recamaras != null && <Text style={styles.metaItem}>Rec {item.recamaras}</Text>}
              {item.banos != null && <Text style={styles.metaItem}>Ba {item.banos}</Text>}
              {item.m2 != null && <Text style={styles.metaItem}>{item.m2}m²</Text>}
              {item.estacionamientos != null && <Text style={styles.metaItem}>Est {item.estacionamientos}</Text>}
            </View>
          )}
          <View style={styles.cardFooter}>
            <Text style={[styles.precio, { color: primaryColor }]}>{formatPrecio(item.precio)}</Text>
            <TouchableOpacity
              style={[
                styles.publicadaBtn,
                { borderColor: primaryColor },
                publicadas.has(item.id) && { backgroundColor: primaryColor, borderColor: primaryColor },
                !isOnline && styles.publicadaBtnDisabled,
              ]}
              onPress={(e) => { e.stopPropagation(); if (isOnline) togglePublicada(item.id) }}
              disabled={toggling.has(item.id) || !isOnline}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {toggling.has(item.id) ? (
                <ActivityIndicator size="small" color={publicadas.has(item.id) ? '#fff' : primaryColor} />
              ) : (
                <Text style={[styles.publicadaBtnText, { color: publicadas.has(item.id) ? '#fff' : primaryColor }]}>
                  {publicadas.has(item.id) ? '✓ Publicada' : 'Publicar'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const nombreCorto = queryData?.nombreUsuario?.split(' ')[0] ?? null
  const { width: screenWidth } = useWindowDimensions()
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44
  const isWeb = Platform.OS === 'web'
  const numCols = isWeb ? 4 : 1
  const CARD_GAP = 16
  const contentWidth = screenWidth - 64
  const cardWidth = isWeb ? (contentWidth - CARD_GAP * (numCols - 1)) / numCols : undefined

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {!isWeb && <StatusBar backgroundColor={primaryColor} barStyle="light-content" />}
      <View style={styles.container}>

        {/* Header unificado con búsqueda */}
        <View style={[styles.header, { backgroundColor: primaryColor, paddingTop: isWeb ? 12 : statusBarHeight + 2, paddingBottom: 6 }]}>
          <View style={isWeb ? styles.webHeaderInner : { flex: 1 }}>
            {!isWeb ? (
              <View style={styles.headerTopRow}>
                <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.headerSaludo}>
                    {nombreCorto ? `Hola, ${nombreCorto} 👋` : 'Bienvenido 👋'}
                  </Text>
                  <Text style={styles.headerSubtitulo}>
                    {propiedades.length > 0 ? `${propiedades.length} propiedades disponibles` : 'Cargando...'}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.headerSaludo}>
                  {nombreCorto ? `Hola, ${nombreCorto} 👋` : 'Bienvenido 👋'}
                </Text>
                <Text style={styles.headerSubtitulo}>
                  {propiedades.length > 0 ? `${propiedades.length} propiedades disponibles` : 'Cargando...'}
                </Text>
              </>
            )}
            <View style={styles.searchWrapper}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: '#333' }]}
                placeholder="Buscar por título, código o dirección..."
                placeholderTextColor="#aaa"
                value={busqueda}
                onChangeText={setBusqueda}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              <TouchableOpacity
                style={styles.searchCamBtn}
                onPress={buscarPorImagen}
                disabled={buscandoImagen}
              >
                {buscandoImagen
                  ? <ActivityIndicator size="small" color="#888" />
                  : <Text style={styles.searchCamIcon}>📷</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Contenido centrado en web */}
        <View style={isWeb ? styles.webBody : undefined}>

        {/* Botones rápidos Venta / Renta */}
        <View style={styles.quickFiltersRow}>
          <TouchableOpacity
            style={[
              styles.quickFilterBtn,
              { borderColor: primaryColor },
              filtroOperacion === 'venta' && { backgroundColor: primaryColor },
            ]}
            onPress={() => setFiltroOperacion(filtroOperacion === 'venta' ? null : 'venta')}
          >
            <Ionicons name="home" size={14} color={filtroOperacion === 'venta' ? '#fff' : primaryColor} />
            <Text style={[styles.quickFilterText, { color: filtroOperacion === 'venta' ? '#fff' : primaryColor }]}>
              Venta
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.quickFilterBtn,
              { borderColor: primaryColor },
              filtroOperacion === 'renta' && { backgroundColor: primaryColor },
            ]}
            onPress={() => setFiltroOperacion(filtroOperacion === 'renta' ? null : 'renta')}
          >
            <Ionicons name="key" size={14} color={filtroOperacion === 'renta' ? '#fff' : primaryColor} />
            <Text style={[styles.quickFilterText, { color: filtroOperacion === 'renta' ? '#fff' : primaryColor }]}>
              Renta
            </Text>
          </TouchableOpacity>
        </View>

        {/* Fila de controles: Filtros + Ver zonas */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.filtrosToggle} onPress={() => setMostrarFiltros((v) => !v)}>
            <Text style={[styles.filtrosToggleText, { color: primaryColor }]}>
              {filtrosActivos > 0 ? `Filtros (${filtrosActivos})` : 'Filtros'} {mostrarFiltros ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zonasToggle, { borderColor: primaryColor }, vistaZonas && { backgroundColor: primaryColor }]}
            onPress={() => setVistaZonas(v => !v)}
          >
            <Ionicons name="map-outline" size={14} color={vistaZonas ? '#fff' : primaryColor} />
            <Text style={[styles.zonasToggleText, { color: vistaZonas ? '#fff' : primaryColor }]}>
              Ver zonas
            </Text>
          </TouchableOpacity>
        </View>

        {mostrarFiltros && (
          <View style={styles.filtrosPanel}>
            <Text style={styles.filtroLabel}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <FiltroChip label="Todos" active={filtroTipo === null} onPress={() => setFiltroTipo(null)} color={primaryColor} />
              <FiltroChip label="Casa" active={filtroTipo === 'casa'} onPress={() => setFiltroTipo(filtroTipo === 'casa' ? null : 'casa')} color={primaryColor} />
              <FiltroChip label="Departamento" active={filtroTipo === 'departamento'} onPress={() => setFiltroTipo(filtroTipo === 'departamento' ? null : 'departamento')} color={primaryColor} />
              <FiltroChip label="Local" active={filtroTipo === 'local'} onPress={() => setFiltroTipo(filtroTipo === 'local' ? null : 'local')} color={primaryColor} />
              <FiltroChip label="Terreno" active={filtroTipo === 'terreno'} onPress={() => setFiltroTipo(filtroTipo === 'terreno' ? null : 'terreno')} color={primaryColor} />
            </ScrollView>

            <Text style={styles.filtroLabel}>Precio — ordenar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <FiltroChip label="Sin orden" active={ordenPrecio === null} onPress={() => setOrdenPrecio(null)} color={primaryColor} />
              <FiltroChip label="Menor precio" active={ordenPrecio === 'asc'} onPress={() => setOrdenPrecio(ordenPrecio === 'asc' ? null : 'asc')} color={primaryColor} />
              <FiltroChip label="Mayor precio" active={ordenPrecio === 'desc'} onPress={() => setOrdenPrecio(ordenPrecio === 'desc' ? null : 'desc')} color={primaryColor} />
            </ScrollView>

            <Text style={styles.filtroLabel}>Rango de precio (MXN)</Text>
            <View style={styles.precioRangoRow}>
              <View style={styles.precioRangoInput}>
                <Text style={styles.precioRangoLabel}>Mínimo</Text>
                <TextInput
                  style={[styles.precioInput, { borderColor: primaryColor + '44' }]}
                  placeholder="Ej. 500,000"
                  placeholderTextColor="#bbb"
                  value={precioMin}
                  onChangeText={setPrecioMin}
                  keyboardType="numeric"
                  maxLength={12}
                />
              </View>
              <Text style={styles.precioRangoSep}>—</Text>
              <View style={styles.precioRangoInput}>
                <Text style={styles.precioRangoLabel}>Máximo</Text>
                <TextInput
                  style={[styles.precioInput, { borderColor: primaryColor + '44' }]}
                  placeholder="Ej. 3,000,000"
                  placeholderTextColor="#bbb"
                  value={precioMax}
                  onChangeText={setPrecioMax}
                  keyboardType="numeric"
                  maxLength={12}
                />
              </View>
            </View>

            <Text style={styles.filtroLabel}>Mis propiedades</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <FiltroChip label="Todas" active={filtroPublicadas === null} onPress={() => setFiltroPublicadas(null)} color={primaryColor} />
              <FiltroChip label="Publicadas" active={filtroPublicadas === 'publicadas'} onPress={() => setFiltroPublicadas(filtroPublicadas === 'publicadas' ? null : 'publicadas')} color={primaryColor} />
              <FiltroChip label="Sin publicar" active={filtroPublicadas === 'sin_publicar'} onPress={() => setFiltroPublicadas(filtroPublicadas === 'sin_publicar' ? null : 'sin_publicar')} color={primaryColor} />
            </ScrollView>

            {filtrosActivos > 0 && (
              <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarFiltros}>
                <Text style={styles.limpiarText}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
        ) : propiedadesFiltradas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {busqueda.trim() || filtrosActivos > 0
                ? 'Sin resultados para tu búsqueda.'
                : 'No hay propiedades disponibles.'}
            </Text>
          </View>
        ) : vistaZonas ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}>
            {propiedadesPorZona.map(([zona, props]) => {
              const expandida = zonasExpandidas.has(zona)
              return (
                <View key={zona} style={styles.zonaSection}>
                  <TouchableOpacity style={styles.zonaHeader} onPress={() => toggleZona(zona)} activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.zonaNombre, { color: primaryColor }]}>{zona}</Text>
                      <Text style={styles.zonaCount}>{props.length} propiedad{props.length !== 1 ? 'es' : ''}</Text>
                    </View>
                    <Ionicons
                      name={expandida ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={20}
                      color={primaryColor}
                    />
                  </TouchableOpacity>
                  {expandida && (
                    <View style={isWeb ? styles.webGrid : styles.zonaContent}>
                      {props.map(p => renderPropiedad(p, cardWidth))}
                    </View>
                  )}
                </View>
              )
            })}
          </ScrollView>
        ) : isWeb ? (
          <ScrollView contentContainerStyle={styles.webGridScroll}>
            <View style={styles.webGrid}>
              {propiedadesFiltradas.map(item => renderPropiedad(item, cardWidth))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={propiedadesFiltradas}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
            renderItem={({ item }) => renderPropiedad(item)}
          />
        )}

        </View>{/* fin webBody */}
      </View>

      {/* Botón de ayuda flotante */}
      <TouchableOpacity style={styles.helpFab} onPress={() => setShowHelp(true)} activeOpacity={0.85}>
        <Ionicons name="help" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Modal top 3 resultados por imagen */}
      <Modal visible={showResultadosImagen} transparent animationType="slide" onRequestClose={() => setShowResultadosImagen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 16, maxWidth: 480 }]}>
            <Text style={styles.modalTitle}>Propiedades similares</Text>
            <Text style={styles.modalSubtitle}>Top 3 por parecido visual</Text>
            {resultadosImagen.map(({ propiedad: p, distancia }, idx) => {
              const primera = [...(p.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
              const similitud = Math.round((1 - distancia / 64) * 100)
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.imagenResultRow}
                  activeOpacity={0.8}
                  onPress={() => { setShowResultadosImagen(false); router.push(`/(prospectador)/detalle-propiedad?id=${p.id}`) }}
                >
                  {primera?.url
                    ? <Image source={{ uri: primera.url }} style={styles.imagenResultThumb} resizeMode="cover" />
                    : <View style={[styles.imagenResultThumb, { backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 22 }}>🏠</Text></View>
                  }
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={[styles.imagenResultRank, { backgroundColor: primaryColor }]}>#{idx + 1}</Text>
                      <Text style={[styles.imagenResultSimilitud, { color: similitud >= 80 ? '#27ae60' : similitud >= 60 ? '#e67e22' : '#888' }]}>
                        {similitud}% similar
                      </Text>
                    </View>
                    <Text style={styles.imagenResultTitulo} numberOfLines={2}>{p.titulo}</Text>
                    <Text style={styles.imagenResultPrecio}>{formatPrecio(p.precio)}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={[styles.modalCancelBtn, { marginTop: 12 }]} onPress={() => setShowResultadosImagen(false)}>
              <Text style={styles.modalCancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de ayuda */}
      <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Necesitas ayuda?</Text>
            <Text style={styles.modalSubtitle}>Escribe tu problema y lo enviaremos por WhatsApp al soporte.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Describe tu problema o consulta..."
              placeholderTextColor="#aaa"
              value={mensajeAyuda}
              onChangeText={setMensajeAyuda}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowHelp(false); setMensajeAyuda('') }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendBtn, !mensajeAyuda.trim() && { opacity: 0.45 }]}
                onPress={enviarAyuda}
                disabled={!mensajeAyuda.trim()}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.modalSendText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  webBody: {
    flex: 1,
    maxWidth: 1920,
    width: '100%',
    alignSelf: 'center',
  },
  webHeaderInner: {
    flex: 1,
    maxWidth: 1920,
    width: '100%',
    alignSelf: 'center' as const,
  },
  webGridScroll: {
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  webGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? '10%' : 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerSaludo: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 0,
  },
  headerSubtitulo: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
  },
  headerIcono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconoText: { fontSize: 18 },
  headerLogo: { width: 75, height: 26 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    marginBottom: 0,
  },
  searchIcon: { fontSize: 15, marginRight: 8, color: '#aaa' },
  searchCamBtn: { padding: 6, marginLeft: 4 },
  searchCamIcon: { fontSize: 18 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  // Botones rápidos Venta / Renta
  quickFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  quickFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 6,
  },
  quickFilterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filtrosToggle: {
    paddingVertical: 6,
  },
  filtrosToggleText: { fontSize: 14, fontWeight: '600' },
  zonasToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  zonasToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filtrosPanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    marginHorizontal: 16,
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
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  // Rango de precio
  precioRangoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  precioRangoInput: { flex: 1 },
  precioRangoLabel: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  precioRangoSep: { fontSize: 16, color: '#bbb', marginTop: 16 },
  precioInput: {
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#333',
  },
  limpiarBtn: { marginTop: 10, alignSelf: 'flex-end' },
  limpiarText: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 60, paddingHorizontal: 16 },
  emptyText: { color: '#aaa', fontSize: 15, textAlign: 'center' },
  // Zona view
  zonaSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  zonaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  zonaNombre: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  zonaCount: {
    fontSize: 12,
    color: '#888',
  },
  zonaContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  // Cards
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
  cardImagen: { width: '100%', height: Platform.OS === 'web' ? 200 : 180 },
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
  cardTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
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
  precio: { fontSize: 16, fontWeight: '700' },
  publicadaBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 80,
    alignItems: 'center',
  },
  publicadaBtnDisabled: {
    opacity: 0.4,
  },
  publicadaBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Help FAB
  helpFab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 100,
  },
  // Help Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#f4f8f8',
    borderWidth: 1.5,
    borderColor: '#e0eaec',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1a2e30',
    minHeight: 110,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 15,
  },
  modalSendBtn: {
    flex: 1,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalSendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Imagen search results modal
  imagenResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  imagenResultThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
  },
  imagenResultRank: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  imagenResultSimilitud: {
    fontSize: 12,
    fontWeight: '700',
  },
  imagenResultTitulo: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 3,
  },
  imagenResultPrecio: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
  },
})
