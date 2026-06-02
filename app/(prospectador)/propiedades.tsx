import { useState, useCallback, useEffect, useRef, createElement } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'

const LOGO = require('../../assets/logo.png')
import { useTheme, useColors } from '../../lib/ThemeContext'
import { registrarAccion } from '../../lib/gamification'

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
  descripcion: string | null
  created_at: string
  propiedad_imagenes: { url: string; orden: number }[]
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | 'terreno' | null
type OrdenPrecio = 'asc' | 'desc' | null
type FiltroPublicadas = 'publicadas' | 'sin_publicar' | null
type FiltroNueva = boolean

type PropiedadesData = {
  rol: string | null
  nombreUsuario: string | null
  userId: string
  propiedades: Propiedad[]
  publicacionesMap: Record<string, number>
  publicacionFechasMap: Record<string, string>
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
  const { primaryColor, darkMode } = useTheme()
  const c = useColors()
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) : 44

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
  const [filtroNueva, setFiltroNueva] = useState(false)
  const [filtroFechaPreset, setFiltroFechaPreset] = useState<7 | 30 | 90 | 180 | null>(null)
  const [fechaDesdeCustom, setFechaDesdeCustom] = useState('')
  const [fechaHastaCustom, setFechaHastaCustom] = useState('')
  const [vistaZonas, setVistaZonas] = useState(false)
  const [zonasExpandidas, setZonasExpandidas] = useState<Set<string>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  const [mensajeAyuda, setMensajeAyuda] = useState('')
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
          .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, zona, destacada, destacada_mensaje, exclusiva, es_constructora, nombre_constructora, recamaras, banos, m2, estacionamientos, descripcion, created_at, propiedad_imagenes(url, orden)')
          .eq('estado', 'disponible')
          .order('created_at', { ascending: false }),
        supabase.from('propiedad_publicacion').select('propiedad_id, veces_publicada, fecha_publicacion').eq('user_id', userId),
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
        publicacionesMap: Object.fromEntries(
          (pubRes.data ?? []).map((r: { propiedad_id: string; veces_publicada: number; fecha_publicacion: string | null }) => [r.propiedad_id, r.veces_publicada ?? 0])
        ),
        publicacionFechasMap: Object.fromEntries(
          (pubRes.data ?? [])
            .filter((r: { propiedad_id: string; fecha_publicacion: string | null }) => r.fecha_publicacion)
            .map((r: { propiedad_id: string; fecha_publicacion: string }) => [r.propiedad_id, r.fecha_publicacion])
        ),
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
  const publicaciones = queryData?.publicacionesMap ?? {}
  const publicacionFechas = queryData?.publicacionFechasMap ?? {}

  async function publicarPropiedad(propiedadId: string) {
    if (togglingRef.current.has(propiedadId)) return
    const userId = queryData?.userId
    if (!userId) return

    const vecesActual = publicaciones[propiedadId] ?? 0
    if (vecesActual >= 10) {
      if (Platform.OS === 'web') window.alert('Esta propiedad alcanzó el límite de 10 publicaciones.')
      else Alert.alert('Límite alcanzado', 'Esta propiedad alcanzó el límite de 10 publicaciones.')
      return
    }

    const newTogglingSet = new Set(togglingRef.current)
    newTogglingSet.add(propiedadId)
    togglingRef.current = newTogglingSet
    setToggling(newTogglingSet)

    const nuevasVeces = vecesActual + 1

    queryClient.setQueryData<PropiedadesData>(['prospectador-propiedades'], old => {
      if (!old) return old
      return { ...old, publicacionesMap: { ...old.publicacionesMap, [propiedadId]: nuevasVeces } }
    })

    const { error } = await supabase
      .from('propiedad_publicacion')
      .upsert({
        propiedad_id: propiedadId,
        user_id: userId,
        publicada: true,
        fecha_publicacion: new Date().toISOString(),
        veces_publicada: nuevasVeces,
      }, { onConflict: 'propiedad_id,user_id' })

    if (error) {
      queryClient.setQueryData<PropiedadesData>(['prospectador-propiedades'], old => {
        if (!old) return old
        return { ...old, publicacionesMap: { ...old.publicacionesMap, [propiedadId]: vecesActual } }
      })
    } else {
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
    filtroNueva ? 'nueva' : null,
    (filtroFechaPreset || fechaDesdeCustom || fechaHastaCustom) ? 'fecha' : null,
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
  if (filtroPublicadas === 'publicadas') propiedadesFiltradas = propiedadesFiltradas.filter(p => (publicaciones[p.id] ?? 0) > 0)
  if (filtroPublicadas === 'sin_publicar') propiedadesFiltradas = propiedadesFiltradas.filter(p => (publicaciones[p.id] ?? 0) === 0)
  if (filtroNueva) {
    const haceUnaS = Date.now() - 7 * 24 * 60 * 60 * 1000
    propiedadesFiltradas = propiedadesFiltradas.filter(p => new Date(p.created_at).getTime() > haceUnaS)
  }
  if (filtroOperacion) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.operacion === filtroOperacion)
  if (filtroTipo) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.tipo === filtroTipo)
  if (precioMinNum != null) propiedadesFiltradas = propiedadesFiltradas.filter(p => p.precio != null && p.precio >= precioMinNum)
  if (precioMaxNum != null) propiedadesFiltradas = propiedadesFiltradas.filter(p => p.precio != null && p.precio <= precioMaxNum)
  if (filtroFechaPreset) {
    // Rangos exclusivos por fecha de creación de la propiedad en el catálogo
    // 7d = últimos 7 días, 30d = hace 7-30 días, 90d = hace 30-90 días, 180d = hace 90-180 días
    const BOUNDS: Record<number, [number, number]> = {
      7:   [7,   0  ],
      30:  [30,  7  ],
      90:  [90,  30 ],
      180: [180, 90 ],
    }
    const [minDays, maxDays] = BOUNDS[filtroFechaPreset] ?? [filtroFechaPreset, 0]
    const now = Date.now()
    const olderEdge = now - minDays * 86400000
    const newerEdge = maxDays === 0 ? now + 1000 : now - maxDays * 86400000
    propiedadesFiltradas = propiedadesFiltradas.filter(p => {
      const t = new Date(p.created_at).getTime()
      if (isNaN(t)) return false
      return t >= olderEdge && t <= newerEdge
    })
  } else if (fechaDesdeCustom || fechaHastaCustom) {
    propiedadesFiltradas = propiedadesFiltradas.filter(p => {
      const t = new Date(p.created_at).getTime()
      if (isNaN(t)) return true
      if (fechaDesdeCustom) {
        const desde = new Date(fechaDesdeCustom).getTime()
        if (!isNaN(desde) && t < desde) return false
      }
      if (fechaHastaCustom) {
        const hasta = new Date(fechaHastaCustom + 'T23:59:59').getTime()
        if (!isNaN(hasta) && t > hasta) return false
      }
      return true
    })
  }
  if (ordenPrecio) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      ordenPrecio === 'asc'
        ? (a.precio ?? Infinity) - (b.precio ?? Infinity)
        : (b.precio ?? -Infinity) - (a.precio ?? -Infinity)
    )
  }

  const propiedadesPorZona = vistaZonas ? agruparPorZona(propiedadesFiltradas) : []

  function limpiarFiltros() {
    setFiltroOperacion(null)
    setFiltroTipo(null)
    setOrdenPrecio(null)
    setFiltroPublicadas(null)
    setFiltroNueva(false)
    setPrecioMin('')
    setPrecioMax('')
    setFiltroFechaPreset(null)
    setFechaDesdeCustom('')
    setFechaHastaCustom('')
  }

  function renderPropiedad(item: Propiedad, width?: number) {
    const primera = [...(item.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
    const tieneMeta = item.recamaras != null || item.banos != null || item.m2 != null || item.estacionamientos != null
    const veces = publicaciones[item.id] ?? 0
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          { backgroundColor: c.card, borderColor: c.border },
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
            <Text style={[styles.precio, { color: primaryColor }]}>{formatPrecio(item.precio)}</Text>
            <TouchableOpacity
              style={[
                styles.publicadaBtn,
                { borderColor: primaryColor },
                veces > 0 && { backgroundColor: primaryColor, borderColor: primaryColor },
                (toggling.has(item.id) || !isOnline || veces >= 10) && styles.publicadaBtnDisabled,
              ]}
              onPress={(e) => { e.stopPropagation(); if (isOnline) publicarPropiedad(item.id) }}
              disabled={toggling.has(item.id) || !isOnline || veces >= 10}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {toggling.has(item.id) ? (
                <ActivityIndicator size="small" color={veces > 0 ? '#fff' : primaryColor} />
              ) : (
                <Text style={[styles.publicadaBtnText, { color: veces > 0 ? '#fff' : primaryColor }]}>
                  {veces === 0 ? 'Publicar' : veces >= 10 ? '10/10 ✅' : `${veces}/10`}
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
  const isWeb = Platform.OS === 'web'
  const numCols = isWeb ? 4 : 1
  const CARD_GAP = 16
  const contentWidth = screenWidth - 64
  const cardWidth = isWeb ? (contentWidth - CARD_GAP * (numCols - 1)) / numCols : undefined

  return (
    <View style={{ flex: 1, backgroundColor: primaryColor }}>
      <OfflineBanner />
      {!isWeb && <StatusBar backgroundColor={primaryColor} barStyle="light-content" />}
      <View style={[styles.container, { backgroundColor: c.bg }]}>

        {/* Header unificado con búsqueda */}
        <View style={[styles.header, { backgroundColor: primaryColor, paddingTop: isWeb ? 24 : statusBarHeight + 12, paddingBottom: 18 }]}>
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
            <View style={[styles.searchWrapper, { backgroundColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)' }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: darkMode ? '#fff' : '#1a1a2e' }]}
                placeholder="Buscar por título, código o dirección..."
                placeholderTextColor={darkMode ? 'rgba(255,255,255,0.6)' : '#666'}
                value={busqueda}
                onChangeText={setBusqueda}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          </View>
        </View>

        {/* Contenido centrado en web */}
        <View style={isWeb ? styles.webBody : undefined}>

        {/* Botones rápidos Venta / Renta / Nuevas */}
        <View style={[styles.quickFiltersRow, { backgroundColor: darkMode ? '#0f1e2d' : '#eef2f4' }]}>
          {([
            { key: 'venta',  label: 'Venta',  icon: 'home'     as const, activo: filtroOperacion === 'venta', onPress: () => setFiltroOperacion(filtroOperacion === 'venta' ? null : 'venta') },
            { key: 'renta',  label: 'Renta',  icon: 'key'      as const, activo: filtroOperacion === 'renta', onPress: () => setFiltroOperacion(filtroOperacion === 'renta' ? null : 'renta') },
            { key: 'nuevas', label: 'Nuevas', icon: 'sparkles' as const, activo: filtroNueva,                 onPress: () => setFiltroNueva(v => !v) },
          ]).map(btn => (
            <TouchableOpacity
              key={btn.key}
              style={[
                styles.quickFilterBtn,
                { borderColor: primaryColor, backgroundColor: btn.activo ? primaryColor : (darkMode ? 'rgba(255,255,255,0.07)' : '#fff') },
              ]}
              onPress={btn.onPress}
            >
              <Ionicons name={btn.icon} size={14} color={btn.activo ? '#fff' : primaryColor} />
              <Text style={[styles.quickFilterText, { color: btn.activo ? '#fff' : primaryColor }]}>
                {btn.label}
              </Text>
            </TouchableOpacity>
          ))}
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

            <Text style={styles.filtroLabel}>Fecha de publicación</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <FiltroChip
                label="Todo"
                active={!filtroFechaPreset && !fechaDesdeCustom && !fechaHastaCustom}
                onPress={() => { setFiltroFechaPreset(null); setFechaDesdeCustom(''); setFechaHastaCustom('') }}
                color={primaryColor}
              />
              {([7, 30, 90, 180] as const).map(d => (
                <FiltroChip
                  key={d}
                  label={d === 7 ? 'Esta semana' : d === 30 ? 'Hace ~1 mes' : d === 90 ? 'Hace ~3 meses' : 'Hace ~6 meses'}
                  active={filtroFechaPreset === d}
                  onPress={() => { setFiltroFechaPreset(filtroFechaPreset === d ? null : d); setFechaDesdeCustom(''); setFechaHastaCustom('') }}
                  color={primaryColor}
                />
              ))}
            </ScrollView>
            {isWeb && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Text style={styles.precioRangoLabel}>Desde</Text>
                {createElement('input', {
                  type: 'date',
                  value: fechaDesdeCustom,
                  onChange: (e: any) => { setFechaDesdeCustom(e.target.value); setFiltroFechaPreset(null) },
                  style: { flex: 1, minWidth: 130, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, color: '#333', fontFamily: 'inherit' }
                })}
                <Text style={styles.precioRangoSep}>—</Text>
                <Text style={styles.precioRangoLabel}>Hasta</Text>
                {createElement('input', {
                  type: 'date',
                  value: fechaHastaCustom,
                  onChange: (e: any) => { setFechaHastaCustom(e.target.value); setFiltroFechaPreset(null) },
                  style: { flex: 1, minWidth: 130, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, color: '#333', fontFamily: 'inherit' }
                })}
              </View>
            )}

            <View style={styles.filtrosBtnRow}>
              {filtrosActivos > 0 && (
                <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarFiltros}>
                  <Text style={styles.limpiarText}>Limpiar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.aplicarBtn, { backgroundColor: primaryColor }]}
                onPress={() => setMostrarFiltros(false)}
              >
                <Text style={styles.aplicarBtnText}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>
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
            extraData={publicaciones}
          />
        )}

        </View>{/* fin webBody */}
      </View>

      {/* Botón de ayuda flotante */}
      <TouchableOpacity style={styles.helpFab} onPress={() => setShowHelp(true)} activeOpacity={0.85}>
        <Ionicons name="help" size={20} color="#fff" />
      </TouchableOpacity>

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
    paddingBottom: 100,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitulo: {
    fontSize: 12,
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
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 0,
  },
  searchIcon: { fontSize: 15, marginRight: 8, color: '#aaa' },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  // Botones rápidos Venta / Renta
  quickFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 0,
  },
  quickFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 8,
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
  filtrosBtnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, marginTop: 14,
  },
  limpiarBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  limpiarText: { fontSize: 13, color: '#c0392b', fontWeight: '600' },
  aplicarBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  aplicarBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
})
