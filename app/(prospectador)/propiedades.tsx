import { useState, useCallback, useEffect, useRef, useMemo, memo, createElement } from 'react'
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
  Share,
  ToastAndroid,
  RefreshControl,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { esPlusOMejor } from '../../lib/permisos'
import { listarCuentas } from '../../lib/cuentas'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import { conReintentoData, generarIdemKey, conTimeout } from '../../lib/redIntentos'
import { enqueuePublicacion } from '../../lib/offline-queue'

const LOGO = require('../../assets/logo.png')
import { useTheme, useColors } from '../../lib/ThemeContext'
import { AccentBackground } from '../../lib/patrones'
import { actualizarMisionesPorCategoria } from '../../lib/gamification'
import { track } from '../../lib/monitor'
import { SkeletonListaPropiedades } from '../../components/Skeleton'
import { thumb, type ThumbOpts } from '../../lib/img'
import { ThumbImage } from '../../components/ThumbImage'
import { useCargaDatos, opcionesImagenTarjeta, tarjetasIniciales, tarjetasPorTanda } from '../../lib/CargaDatos'
import RachaHeader from '../../components/RachaHeader'
import { useVistaComo } from '../../lib/VistaComo'
import { normalizar, parsearPrecioBusqueda } from '../../lib/texto'
import MiniMapa from '../../components/MiniMapa'

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
  lat: number | null
  lng: number | null
  destacada: boolean
  destacada_mensaje: string | null
  destacada_hasta: string | null
  exclusiva: boolean
  es_constructora: boolean | null
  nombre_constructora: string | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  m2: number | null
  m2_terreno: number | null
  estacionamientos: number | null
  descripcion: string | null
  created_at: string
  inmobiliaria_id: string | null
  inmobiliarias: { nombre: string; logo_url: string | null; exclusiva: boolean } | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number }[]
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
  telefono: string | null
  propiedades: Propiedad[]
}

type PublicacionesData = {
  publicacionesMap: Record<string, number>
  publicacionFechasMap: Record<string, string>
}

const ZONAS_CONFIG = [
  { key: 'queretaro' as const, label: 'Querétaro', coords: [20.5888, -100.3899] as [number, number], color: '#1976D2' },
  { key: 'monterrey' as const, label: 'Monterrey', coords: [25.6866, -100.3161] as [number, number], color: '#D84315' },
  { key: 'puebla'    as const, label: 'Puebla',    coords: [19.0414, -98.2063]  as [number, number], color: '#2E7D32' },
]

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


function formatearInputPrecio(texto: string): string {
  const digitos = texto.replace(/\D/g, '')
  if (!digitos) return ''
  return parseInt(digitos, 10).toLocaleString('es-MX')
}

function mezclar<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}


// Tarjeta de propiedad memoizada: solo se re-renderiza si cambian SUS datos
// (veces publicada, estado de toggle, etc.), no en cada tecla de búsqueda.
const PropiedadCard = memo(function PropiedadCard({
  item, width, veces, isToggling, destacada, esAdmin, primaryColor,
  cardBg, cardBorder, isOnline, imgOpts, onOpen, onShare, onPublish, onZoom,
}: {
  item: Propiedad; width?: number; veces: number; isToggling: boolean
  destacada: boolean; esAdmin: boolean; primaryColor: string
  cardBg: string; cardBorder: string; isOnline: boolean; imgOpts: ThumbOpts
  onOpen: (id: string) => void; onShare: (codigo: string) => void
  onPublish: (id: string) => void; onZoom: (url: string | null) => void
}) {
  const primera = (item.propiedad_imagenes ?? [])[0]
  const tieneMeta = item.recamaras != null || item.banos != null || item.medios_banos != null || item.m2 != null || item.estacionamientos != null

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
        item.exclusiva && styles.cardExclusiva,
        destacada && styles.cardDestacada,
        width != null && { width },
      ]}
      activeOpacity={0.85}
      onPress={() => onOpen(item.id)}
    >
      {primera?.url && (
        // Móvil (una columna): la foto adopta su PROPORCIÓN REAL (autoAspect), así
        // se ve COMPLETA llenando el ancho, sin barras ni recorte —vertical alta,
        // horizontal ancha—. Web (rejilla): proporción fija 4:3 para alturas
        // parejas, con la foto completa (contain) sobre el fondo de la tarjeta.
        <View style={[Platform.OS === 'web' ? styles.cardImagenWrap : styles.cardImagenWrapMovil, { backgroundColor: cardBg }]}>
          {Platform.OS === 'web' ? (
            <ThumbImage
              url={primera.thumb_url ?? primera.url}
              style={styles.cardImagen}
              resizeMode="cover"
            />
          ) : (
            <ThumbImage
              url={primera.thumb_url ?? primera.url}
              style={styles.cardImagenMovil}
              resizeMode="cover"
            />
          )}
          <TouchableOpacity
            style={styles.lupitaBtn}
            onPress={(e) => { e.stopPropagation(); onZoom(thumb(primera.url, { width: 1080, quality: 72 }) ?? null) }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.lupitaText}>🔍</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.exclusiva && (
        <View style={styles.exclusivaBanner}>
          <Text style={styles.exclusivaBannerText}>★ Propiedad exclusiva</Text>
        </View>
      )}
      {destacada && (
        <View style={styles.destacadaBanner}>
          <Text style={styles.destacadaBannerText}>
            ★ Propiedad destacada
            {esAdmin && item.destacada_hasta
              ? `  ·  hasta el ${new Date(item.destacada_hasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
              : ''}
          </Text>
        </View>
      )}
      <View style={styles.cardBody}>
        {esAdmin && destacada && item.destacada_mensaje ? (
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
            {item.medios_banos != null && item.medios_banos > 0 && <Text style={styles.metaItem}>{item.medios_banos} 1/2 Ba</Text>}
            {item.m2 != null && <Text style={styles.metaItem}>{item.m2}m² const.</Text>}
            {item.m2_terreno != null && <Text style={styles.metaItem}>{item.m2_terreno}m² terr.</Text>}
            {item.estacionamientos != null && <Text style={styles.metaItem}>Est {item.estacionamientos}</Text>}
          </View>
        )}
        <View style={styles.cardFooter}>
          <Text style={[styles.precio, { color: primaryColor }]} maxFontSizeMultiplier={1.2}>{formatPrecio(item.precio)}</Text>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={(e) => { e.stopPropagation(); onShare(item.codigo) }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.shareBtnText} maxFontSizeMultiplier={1.2} numberOfLines={1}>🔗 Copiar ficha</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.publicadaBtn,
              { borderColor: primaryColor },
              veces > 0 && { backgroundColor: primaryColor, borderColor: primaryColor },
              (isToggling || veces >= 10) && styles.publicadaBtnDisabled,
            ]}
            // Offline el botón SIGUE activo: la publicación se encola y se envía
            // sola al reconectar (antes quedaba deshabilitado/mudo sin conexión).
            onPress={(e) => { e.stopPropagation(); onPublish(item.id) }}
            disabled={isToggling || veces >= 10}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isToggling ? (
              <ActivityIndicator size="small" color={veces > 0 ? '#fff' : primaryColor} />
            ) : (
              <Text style={[styles.publicadaBtnText, { color: veces > 0 ? '#fff' : primaryColor }]} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {veces === 0 ? 'Publicar' : veces >= 10 ? '10/10 ✅' : `${veces}/10`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
})

export default function ProspectadorPropiedades() {
  const queryClient = useQueryClient()
  const isOnline = useNetworkStatus()
  const { primaryColor, acentoId, darkMode } = useTheme()
  const c = useColors()
  const { ahorroActivo } = useCargaDatos()
  const imgOpts = opcionesImagenTarjeta(ahorroActivo)
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
  // IDs publicados en esta sesión: se quedan visibles en el filtro "sin publicar"
  // hasta que el usuario quite el filtro, evitando que desaparezcan al instante.
  const recienPublicadosRef = useRef<Set<string>>(new Set())
  const [filtroNueva, setFiltroNueva] = useState(false)
  const [filtroExclusiva, setFiltroExclusiva] = useState(false)
  const [filtroDestacada, setFiltroDestacada] = useState(false)
  const [filtroFechaPreset, setFiltroFechaPreset] = useState<7 | 30 | 90 | 180 | null>(null)
  const [fechaDesdeCustom, setFechaDesdeCustom] = useState('')
  const [fechaHastaCustom, setFechaHastaCustom] = useState('')
  const [vistaZonas, setVistaZonas] = useState(false)
  // Orden aleatorio estable por sesión para usuarios no-admin
  const shuffleMapRef = useRef<Map<string, number>>(new Map())
  const [shuffleTick, setShuffleTick] = useState(0)
  const [, setZonasExpandidas] = useState<Set<string>>(new Set())
  // Web: renderizado incremental para no montar 1000+ tarjetas/imágenes de golpe
  const PAGE_WEB = 24
  const [visibleCount, setVisibleCount] = useState(PAGE_WEB)
  const [showHelp, setShowHelp] = useState(false)
  const [mensajeAyuda, setMensajeAyuda] = useState('')
  const [imagenModal, setImagenModal] = useState<string | null>(null)
  const { vistaComo } = useVistaComo()
  const { data: queryData, isLoading, refetch } = useQuery<PropiedadesData>({
    queryKey: ['prospectador-propiedades', vistaComo],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('No user')

      const [profileRes] = await Promise.all([
        supabase.from('profiles').select('role, nombre, telefono').eq('id', userId).single(),
      ])

      // Rol efectivo: si un admin está "viendo como" otro rol, se usa ese.
      const rol = vistaComo ?? profileRes.data?.role ?? null

      // Arma el objeto de datos a partir de las filas crudas (mapeo + filtro por
      // rol + mezcla). Se usa tanto para la publicación PARCIAL (primera tanda)
      // como para la final, así ambas tienen exactamente la misma forma.
      const construir = (rows: any[]): PropiedadesData => {
        let propiedades = rows.map((p: any) => ({
          ...p,
          // La tarjeta usa `descripcion` para el preview; el listado trae solo la
          // versión corta (descripcion_corta), se mapea al mismo campo.
          descripcion: p.descripcion_corta ?? null,
          inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
        })) as unknown as Propiedad[]
        if (!esPlusOMejor(rol)) {
          propiedades = propiedades.filter(p => !p.exclusiva && !p.inmobiliarias?.exclusiva)
        }
        propiedades = mezclar(propiedades)
        return {
          rol,
          nombreUsuario: profileRes.data?.nombre ?? null,
          userId,
          telefono: profileRes.data?.telefono ?? null,
          propiedades,
        }
      }

      // Carga en dos fases (clave en Android / red lenta): antes se bajaban las
      // ~1500 propiedades de golpe (~4.5 MB) y la pantalla se quedaba en skeleton
      // hasta terminar TODO. Ahora se trae una primera tanda chica y se PUBLICA
      // de inmediato (setQueryData) para que el usuario vea y use propiedades ya;
      // el resto sigue cargando en segundo plano y se agrega al terminar. La
      // búsqueda y el mapa quedan completos una vez que llega todo.
      // Solo pintar la tanda parcial en arranque EN FRÍO (sin datos previos). En
      // un refetch tibio ya hay lista completa en pantalla; publicar 200 la
      // encogería un instante (y el mapa perdería puntos) hasta que llegue el
      // resto. En ese caso no publicamos parcial: se reemplaza todo al final.
      const habiaDatosPrevios = ((queryClient.getQueryData(['prospectador-propiedades', vistaComo]) as PropiedadesData | undefined)?.propiedades?.length ?? 0) > 0

      const PRIMERA = 200   // primera tanda: paint casi instantáneo
      const PAGE = 1000     // PostgREST corta en 1000 filas/petición
      let propsData: any[] = []
      let from = 0
      let parcialPublicada = false
      for (let i = 0; ; i++) {
        const size = i === 0 ? PRIMERA : PAGE
        const { data, error } = await supabase
          .from('propiedades')
          .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, zona, lat, lng, destacada, destacada_mensaje, destacada_hasta, exclusiva, es_constructora, nombre_constructora, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, descripcion_corta, created_at, inmobiliaria_id, inmobiliarias(nombre, logo_url, exclusiva), propiedad_imagenes(url, thumb_url, orden)')
          .eq('estado', 'disponible')
          .eq('es_inventario', false)
          .order('created_at', { ascending: false })
          .order('orden', { referencedTable: 'propiedad_imagenes', ascending: true })
          .limit(1, { referencedTable: 'propiedad_imagenes' })
          .range(from, from + size - 1)
        if (error) throw error
        propsData = propsData.concat(data ?? [])
        from += size
        // Publicar la primera tanda ya (solo si aún faltan más; si todo cupo en
        // la primera, la publicación final basta y evitamos un doble render).
        if (!parcialPublicada && !habiaDatosPrevios && (data?.length ?? 0) >= size) {
          parcialPublicada = true
          queryClient.setQueryData(['prospectador-propiedades', vistaComo], construir(propsData))
        }
        if (!data || data.length < size) break
      }

      return construir(propsData)
    },
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  })

  // Query separado para publicaciones: staleTime=0 y gcTime=0 garantizan que
  // (a) nunca se persiste al disco (no puede quedar un update optimista "pegado"
  // entre sesiones tras un crash), y (b) siempre se trae fresco del servidor
  // al montar el componente o al regresar a esta pantalla.
  const { data: pubData, refetch: refetchPub } = useQuery<PublicacionesData>({
    queryKey: ['publicaciones-usuario', queryData?.userId ?? null],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('No user')
      const { data } = await supabase
        .from('propiedad_publicacion')
        .select('propiedad_id, veces_publicada, fecha_publicacion')
        .eq('user_id', uid)
        .gt('veces_publicada', 0)
      return {
        publicacionesMap: Object.fromEntries(
          (data ?? []).map((r: { propiedad_id: string; veces_publicada: number }) => [r.propiedad_id, r.veces_publicada ?? 0])
        ),
        publicacionFechasMap: Object.fromEntries(
          (data ?? [])
            .filter((r: { fecha_publicacion: string | null }) => r.fecha_publicacion)
            .map((r: { propiedad_id: string; fecha_publicacion: string }) => [r.propiedad_id, r.fecha_publicacion])
        ),
      }
    },
    enabled: !!queryData?.userId,
    staleTime: 0,
    gcTime: 0,
    networkMode: 'offlineFirst',
    refetchOnWindowFocus: false,
  })

  // Jalar para actualizar: fuerza traer propiedades y publicaciones frescas.
  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await Promise.all([refetch(), refetchPub()]) } catch {}
    finally { setRefreshing(false) }
  }, [refetch, refetchPub])

  useFocusEffect(useCallback(() => {
    // Solo rebotar al admin a su app si NO está "viendo como" otro rol.
    // Leemos el rol de AsyncStorage (instantáneo) para no hacer 2 llamadas de red
    // en cada focus; fallback a red si no hay entrada cacheada.
    if (!vistaComo) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session?.user?.id) return
        let role: string | null = null
        try {
          const cuentas = await listarCuentas()
          role = cuentas.find(c => c.user_id === session.user.id)?.role ?? null
        } catch {}
        if (!role) {
          const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
          role = data?.role ?? null
        }
        if (role === 'admin') router.replace('/(admin)/propiedades')
      })
    }
    if (togglingRef.current.size === 0) {
      const state = queryClient.getQueryState(['prospectador-propiedades', vistaComo])
      const isStale = !state?.dataUpdatedAt || Date.now() - state.dataUpdatedAt > 1000 * 60 * 30
      if (isStale) refetch()
      // Las publicaciones siempre se refresca en focus: el query tiene gcTime=0
      // (nunca persiste) y staleTime=0, así cualquier estado optimista perdido
      // tras un crash o cambio de pantalla se corrige al volver aquí.
      refetchPub()
    }
  }, [refetch, refetchPub, queryClient, vistaComo]))

  // Orden aleatorio estable por sesión. Se asigna un valor a cada propiedad la
  // primera vez que aparece y NO se cambia después, así el orden se mantiene
  // entre refetch. Con la carga en dos fases van llegando propiedades nuevas: a
  // esas se les asigna su valor aquí (antes solo se hacía una vez, y las que
  // llegaban en la segunda tanda quedaban sin posición → amontonadas arriba).
  useEffect(() => {
    if (!queryData?.propiedades || queryData.propiedades.length === 0) return
    let agrego = false
    for (const p of queryData.propiedades) {
      if (!shuffleMapRef.current.has(p.id)) {
        shuffleMapRef.current.set(p.id, Math.random())
        agrego = true
      }
    }
    // Bump para que el orden aleatorio se aplique en el memo (el ref no dispara
    // re-render por sí solo).
    if (agrego) setShuffleTick(t => t + 1)
  }, [queryData?.propiedades])

  useEffect(() => {
    if (!queryData?.propiedades) return
    for (const p of queryData.propiedades.slice(0, 20)) {
      queryClient.setQueryData(
        ['detalle-propiedad', p.id],
        (old: unknown) => {
          // No pisar un detalle ya cacheado (tiene igual o más imágenes que la portada).
          const existing = old as any
          if ((existing?.propiedad?.propiedad_imagenes?.length ?? 0) > 0) return old
          // Sembrar con la PORTADA que el listado ya trae, para que el detalle
          // muestre algo al instante. El detalle hace refetch (staleTime:0) y
          // completa el resto de fotos; si ese refetch falla por mala red, el
          // usuario sigue viendo la portada en vez de quedarse en "Sin imágenes".
          //
          // `descripcion` se siembra en null a propósito: en el listado ese campo
          // es descripcion_corta (180 chars) y el detalle la mostraba cortada a
          // media palabra hasta que llegaba el refetch — y para siempre si fallaba,
          // porque este cache se persiste. Mejor sin descripción que con media.
          return {
            propiedad: { ...p, descripcion: null },
            subidoPor: null,
            nombreUsuario: queryData.nombreUsuario,
            rol: queryData.rol,
          }
        }
      )
    }
  }, [queryData?.propiedades])

  const propiedades = queryData?.propiedades ?? []
  const publicaciones = pubData?.publicacionesMap ?? {}
  const esAdmin = queryData?.rol === 'admin'
  const esAsesorOMas = ['asesor', 'supervisor', 'admin'].includes(queryData?.rol ?? '')

  // ── Publicar (reescrito desde cero) ─────────────────────────────────────────
  // Diseño: la publicación NUNCA se pierde y el botón NUNCA queda colgado.
  //  · La RPC es idempotente por idem_key → reintentar jamás duplica el conteo.
  //  · Sesión se verifica/refresca ANTES de llamar (raíz de los errores en
  //    Android al volver del background: token expirado colgaba el refresh
  //    interno de supabase-js a mitad de la llamada).
  //  · Si la red falla de todas formas, la publicación SE ENCOLA y se envía
  //    sola al reconectar (mismo mecanismo que el guardado del CRM). El único
  //    error visible que queda es el de negocio (límite 10/10).
  //  · try/finally: el spinner siempre se limpia.

  function avisar(titulo: string, msg: string) {
    if (Platform.OS === 'web') window.alert(`${titulo}: ${msg}`)
    else Alert.alert(titulo, msg)
  }

  async function publicarPropiedad(propiedadId: string) {
    if (togglingRef.current.has(propiedadId)) return
    const userId = queryData?.userId
    if (!userId) return

    const vecesActual = publicaciones[propiedadId] ?? 0
    if (vecesActual >= 10) {
      avisar('Límite alcanzado', 'Esta propiedad alcanzó el límite de 10 publicaciones.')
      return
    }

    // Spinner + optimista (+1 visible de inmediato)
    const newTogglingSet = new Set(togglingRef.current)
    newTogglingSet.add(propiedadId)
    togglingRef.current = newTogglingSet
    setToggling(newTogglingSet)
    const setVeces = (n: number) => {
      queryClient.setQueryData<PublicacionesData>(['publicaciones-usuario', userId], old =>
        old ? { ...old, publicacionesMap: { ...old.publicacionesMap, [propiedadId]: n } } : old)
    }
    setVeces(vecesActual + 1)
    recienPublicadosRef.current = new Set([...recienPublicadosRef.current, propiedadId])

    const idemKey = generarIdemKey()
    const exito = (vecesReal: number) => {
      setVeces(vecesReal)
      recienPublicadosRef.current = new Set([...recienPublicadosRef.current, propiedadId])
      track('publicar_propiedad', { veces: vecesReal })
      actualizarMisionesPorCategoria(userId, 'propiedad').catch(() => {})
    }
    const encolar = async () => {
      await enqueuePublicacion(propiedadId, idemKey).catch(() => {})
      avisar('Publicación pendiente', 'La conexión está inestable. Tu publicación quedó guardada y se registrará sola en cuanto haya señal — no necesitas volver a intentar.')
    }

    try {
      // 0) Sin red conocida → encolar directo, sin intentos que tardan.
      if (!isOnline) { await encolar(); return }

      // 1) Sesión fresca ANTES de llamar. Si el access token expiró en el
      //    background, la RPC colgaría mientras supabase-js intenta refrescar
      //    por dentro; aquí lo hacemos nosotros, acotado con timeout.
      try {
        const { data: { session } } = await conTimeout(supabase.auth.getSession(), 5000)
        const expMs = (session?.expires_at ?? 0) * 1000
        if (!session || expMs - Date.now() < 60_000) {
          await conTimeout(supabase.auth.refreshSession(), 8000).catch(() => {})
        }
      } catch { /* no bloquear: la RPC decide */ }

      // 2) RPC idempotente (mismo idemKey en todos los intentos), 2 × 12s.
      const llamar = () => conReintentoData<{ ok: boolean; error?: string; veces_publicada?: number }>(
        (signal) => supabase.rpc('publicar_propiedad_atomico', { p_propiedad_id: propiedadId, p_idem_key: idemKey }).abortSignal(signal),
        { intentos: 2, timeoutMs: 12_000 },
      )
      let { ok, data, errorMsg } = await llamar()

      // 3) Error de auth pese a todo → refrescar y reintentar UNA vez.
      if (!ok && errorMsg && /jwt|token|expir|unauthor|not authenticated|no autenticado|401|403/i.test(errorMsg)) {
        try { await conTimeout(supabase.auth.refreshSession(), 8000) } catch { /* el reintento decide */ }
        ;({ ok, data, errorMsg } = await llamar())
      }

      // 4) Timeout sin respuesta: la escritura pudo llegar igual. Verificar.
      if (!ok && !errorMsg) {
        try {
          const { data: chk } = await conTimeout(
            supabase.from('propiedad_publicacion')
              .select('veces_publicada')
              .eq('propiedad_id', propiedadId).eq('user_id', userId).maybeSingle(),
            8000,
          )
          if (chk && (chk.veces_publicada ?? 0) > vecesActual) { exito(chk.veces_publicada!); return }
        } catch { /* la verificación también falló: sigue el flujo */ }
      }

      // 5) Resolución final.
      if (ok && data?.ok) {
        exito(data.veces_publicada ?? vecesActual + 1)
      } else if (data?.error === 'limite') {
        setVeces(vecesActual)
        avisar('Límite alcanzado', 'Esta propiedad alcanzó el límite de 10 publicaciones.')
      } else if (ok && data && data.ok === false) {
        // Error de negocio del servidor distinto de límite: reintentar no ayuda.
        setVeces(vecesActual)
        avisar('No se pudo publicar', String(data.error ?? 'Error del servidor'))
      } else {
        // Red/timeout/error transitorio → ENCOLAR. Se mantiene el +1 optimista
        // y la cola lo hace real al reconectar (idempotente, sin duplicar).
        await encolar()
      }
    } finally {
      const finalTogglingSet = new Set(togglingRef.current)
      finalTogglingSet.delete(propiedadId)
      togglingRef.current = finalTogglingSet
      setToggling(finalTogglingSet)
    }
  }

  async function compartirLink(codigo: string) {
    const tel = queryData?.telefono ?? ''
    // En móvil no existe window.location; usamos el dominio real de la app web
    // (valerarealestate.com es el sitio de marketing y NO sirve /ficha → 404).
    const base = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://valeraapp.valerarealestate.com'
    const url = tel ? `${base}/ficha/${codigo}?t=${encodeURIComponent(tel)}` : `${base}/ficha/${codigo}`

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url)
      if (typeof document !== 'undefined') {
        const el = document.createElement('div')
        el.textContent = '✓ Ficha copiada — pégala en WhatsApp o donde quieras'
        Object.assign(el.style, {
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          background: '#1a6470', color: '#fff', padding: '10px 20px', borderRadius: '20px',
          fontSize: '14px', zIndex: '9999', fontFamily: 'sans-serif', fontWeight: '600',
          pointerEvents: 'none',
        })
        document.body.appendChild(el)
        setTimeout(() => el.remove(), 2500)
      }
      return
    }

    // App (Android/iOS): copiar al portapapeles y ofrecer compartir directo
    try { await Clipboard.setStringAsync(url) } catch { /* continuar aunque falle el copiado */ }

    // Notificación visual de copiado (toast nativo en Android)
    if (Platform.OS === 'android') {
      ToastAndroid.show('✓ Link de la ficha copiado', ToastAndroid.LONG)
    }

    Alert.alert(
      '✓ Ficha copiada',
      'El link de la ficha ya está copiado.\n\nPégalo en WhatsApp o donde quieras compartirlo, o usa "Compartir ahora".',
      [
        { text: 'Compartir ahora', onPress: () => { Share.share({ message: url }).catch(() => {}) } },
        { text: 'Listo', style: 'cancel' },
      ],
    )
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
    filtroExclusiva ? 'exclusiva' : null,
    filtroDestacada ? 'destacada' : null,
    (filtroFechaPreset || fechaDesdeCustom || fechaHastaCustom) ? 'fecha' : null,
  ].filter(Boolean).length

  const _ahora = Date.now()
  const _estaDestacada = (p: Propiedad) =>
    p.destacada && !p.exclusiva && (!p.destacada_hasta || new Date(p.destacada_hasta).getTime() > _ahora)

  const propiedadesFiltradas = useMemo(() => {
  let propiedadesFiltradas = propiedades

  if (busqueda.trim()) {
    // Con coma ("2,5", "2,500,000") se busca por precio; sin coma, como siempre.
    const matchPrecio = parsearPrecioBusqueda(busqueda)
    if (matchPrecio) {
      propiedadesFiltradas = propiedadesFiltradas.filter(p => matchPrecio(p.precio))
    } else {
      const q = normalizar(busqueda.trim())
      const qDigits = q.replace(/\D/g, '')
      propiedadesFiltradas = propiedadesFiltradas.filter((p) => {
        const cod = normalizar(p.codigo)
        // Código tolerante a ceros: "4", "004" y "vr-004" encuentran VR-004
        const codMatch = cod.includes(q) || (qDigits !== '' && cod.replace(/\D/g, '').includes(qDigits))
        return codMatch ||
          normalizar(p.direccion).includes(q) ||
          normalizar(p.titulo).includes(q) ||
          // Por desarrollo/constructora: escribir "balkan" trae sus modelos.
          normalizar(p.nombre_constructora).includes(q)
      })
    }
  }
  if (filtroPublicadas === 'publicadas') propiedadesFiltradas = propiedadesFiltradas.filter(p => (publicaciones[p.id] ?? 0) > 0)
  if (filtroPublicadas === 'sin_publicar') propiedadesFiltradas = propiedadesFiltradas.filter(p => (publicaciones[p.id] ?? 0) === 0 || recienPublicadosRef.current.has(p.id))
  if (filtroNueva) {
    const haceUnaS = Date.now() - 7 * 24 * 60 * 60 * 1000
    propiedadesFiltradas = propiedadesFiltradas.filter(p => new Date(p.created_at).getTime() > haceUnaS)
  }
  if (filtroDestacada) {
    propiedadesFiltradas = propiedadesFiltradas.filter(p => _estaDestacada(p))
  }
  if (filtroExclusiva) {
    propiedadesFiltradas = propiedadesFiltradas.filter(p => p.exclusiva || p.inmobiliarias?.exclusiva)
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
  } else if (filtroNueva) {
    // El botón "Nuevas" sí debe ordenar por más reciente primero — el orden
    // aleatorio es solo el default, no aplica cuando este filtro está activo.
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  // Las destacadas van ARRIBA para empujar al usuario a publicarlas, PERO solo
  // mientras ESE usuario no las haya publicado. En cuanto le da "Publicar"
  // (veces > 0), la destacada se revuelve con las demás: ya cumplió su función
  // de recordatorio. Siguen con su banner dorado y se ven todas con el filtro
  // "Destacadas".
  const destacadaPendiente = (p: Propiedad) =>
    _estaDestacada(p) && (publicaciones[p.id] ?? 0) === 0

  if (esAdmin) {
    // Admin: destacadas pendientes primero, resto en orden del servidor (fecha desc).
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      (destacadaPendiente(b) ? 1 : 0) - (destacadaPendiente(a) ? 1 : 0)
    )
  } else if (!ordenPrecio && !filtroNueva) {
    // Usuarios: destacadas pendientes primero, resto en orden aleatorio por sesión.
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) => {
      const aD = destacadaPendiente(a) ? 1 : 0
      const bD = destacadaPendiente(b) ? 1 : 0
      if (aD !== bD) return bD - aD
      return (shuffleMapRef.current.get(a.id) ?? 0) - (shuffleMapRef.current.get(b.id) ?? 0)
    })
  }

  return propiedadesFiltradas
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    propiedades, busqueda, filtroPublicadas, publicaciones, filtroNueva,
    filtroExclusiva, filtroDestacada, filtroOperacion, filtroTipo, precioMinNum, precioMaxNum,
    filtroFechaPreset, fechaDesdeCustom, fechaHastaCustom, ordenPrecio, esAdmin,
    shuffleTick,
  ])

  // Al cambiar cualquier filtro/búsqueda, volver al primer bloque visible
  useEffect(() => { setVisibleCount(PAGE_WEB) }, [
    busqueda, filtroOperacion, filtroTipo, ordenPrecio, precioMin, precioMax,
    filtroPublicadas, filtroNueva, filtroExclusiva, filtroFechaPreset,
    fechaDesdeCustom, fechaHastaCustom,
  ])


  const zonasParaMapa = useMemo(() => ZONAS_CONFIG.map(z => {
    const propsZona = propiedades.filter(p => p.zona === z.key)
    return {
      key: z.key,
      label: z.label,
      coords: z.coords,
      color: z.color,
      count: propsZona.length,
      propiedades: propsZona.map(p => ({
        id: p.id, titulo: p.titulo, precio: p.precio, tipo: p.tipo,
        direccion: p.direccion, lat: p.lat, lng: p.lng,
        imagen: (p.propiedad_imagenes ?? [])[0]?.thumb_url ?? (p.propiedad_imagenes ?? [])[0]?.url ?? null,
      })),
    }
  }).filter(z => z.count > 0), [propiedades])

  function handleZonaMapPress(key: string) {
    const config = ZONAS_CONFIG.find(z => z.key === key)
    if (!config) return
    setZonasExpandidas(prev => { const s = new Set(prev); s.add(config.label); return s })
  }

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

  // Callbacks estables: evitan que PropiedadCard (memo) se re-renderice al
  // teclear/filtrar. Los refs apuntan siempre a la última versión de la lógica.
  const publicarRef = useRef(publicarPropiedad); publicarRef.current = publicarPropiedad
  const compartirRef = useRef(compartirLink); compartirRef.current = compartirLink
  const onOpenCard = useCallback((id: string) => router.push(`/(prospectador)/detalle-propiedad?id=${id}`), [])
  const onShareCard = useCallback((codigo: string) => compartirRef.current(codigo), [])
  const onPublishCard = useCallback((id: string) => publicarRef.current(id), [])
  const onZoomCard = useCallback((url: string | null) => setImagenModal(url), [])

  const renderCard = (item: Propiedad, width?: number) => (
    <PropiedadCard
      key={item.id}
      item={item}
      width={width}
      veces={publicaciones[item.id] ?? 0}
      isToggling={toggling.has(item.id)}
      destacada={!!_estaDestacada(item)}
      esAdmin={esAdmin}
      primaryColor={primaryColor}
      cardBg={c.card}
      cardBorder={c.border}
      isOnline={isOnline}
      imgOpts={imgOpts}
      onOpen={onOpenCard}
      onShare={onShareCard}
      onPublish={onPublishCard}
      onZoom={onZoomCard}
    />
  )

  const nombreCorto = queryData?.nombreUsuario?.split(' ')[0] ?? null
  const { width: screenWidth, height: windowHeight } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const FiltrosPanelWrapper: any = isWeb ? View : ScrollView
  const numCols = isWeb ? 4 : 1
  const CARD_GAP = 16
  const contentWidth = screenWidth - 64
  const cardWidth = isWeb ? (contentWidth - CARD_GAP * (numCols - 1)) / numCols : undefined

  const filtrosHeader = (
    <View>
      <View style={[styles.quickFiltersRow, { backgroundColor: darkMode ? '#0f1e2d' : '#eef2f4' }]}>
        {([
          { key: 'venta',      label: 'Venta',      icon: 'home'      as const, activo: filtroOperacion === 'venta', onPress: () => setFiltroOperacion(filtroOperacion === 'venta' ? null : 'venta') },
          { key: 'renta',      label: 'Renta',      icon: 'key'       as const, activo: filtroOperacion === 'renta', onPress: () => setFiltroOperacion(filtroOperacion === 'renta' ? null : 'renta') },
          { key: 'nuevas',     label: 'Nuevas',     icon: 'sparkles'  as const, activo: filtroNueva,                 onPress: () => setFiltroNueva(v => !v) },
          { key: 'exclusivas', label: 'Exclusivas', icon: 'star'      as const, activo: filtroExclusiva,             onPress: () => setFiltroExclusiva(v => !v) },
          { key: 'destacadas', label: 'Destacadas', icon: 'megaphone-outline' as const, activo: filtroDestacada,    onPress: () => setFiltroDestacada(v => !v) },
          // Acceso rápido a "Sin publicar" (antes solo estaba escondido en el
          // panel de filtros avanzados, bajo "Mis propiedades").
          { key: 'sin_publicar', label: 'Sin publicar', icon: 'cloud-upload-outline' as const, activo: filtroPublicadas === 'sin_publicar', onPress: () => setFiltroPublicadas(filtroPublicadas === 'sin_publicar' ? null : 'sin_publicar') },
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
            <Text
              style={[styles.quickFilterText, { color: btn.activo ? '#fff' : primaryColor }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.filtrosToggle} onPress={() => setMostrarFiltros((v) => !v)}>
          <Text style={[styles.filtrosToggleText, { color: primaryColor }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {filtrosActivos > 0 ? `Filtros (${filtrosActivos})` : 'Filtros'} {mostrarFiltros ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', flexGrow: 1 }}>
          <TouchableOpacity
            style={[styles.constructorasBtn, { borderColor: primaryColor }]}
            onPress={() => router.push('/(prospectador)/constructoras')}
            activeOpacity={0.85}
          >
            <Text style={styles.constructorasIcon}>🏗️</Text>
            <Text style={[styles.constructorasTxt, { color: primaryColor }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>Constructoras</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zonasToggle, { borderColor: primaryColor }, vistaZonas && { backgroundColor: primaryColor }]}
            onPress={() => setVistaZonas(v => !v)}
          >
            <Ionicons name="map-outline" size={14} color={vistaZonas ? '#fff' : primaryColor} />
            <Text style={[styles.zonasToggleText, { color: vistaZonas ? '#fff' : primaryColor }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              Mapa
            </Text>
          </TouchableOpacity>
          {esAsesorOMas && (
            <TouchableOpacity
              style={[styles.zonasToggle, { borderColor: '#22a35e' }]}
              onPress={() => router.push('/(prospectador)/mapa')}
              activeOpacity={0.85}
            >
              <Ionicons name="location-outline" size={14} color="#22a35e" />
              <Text style={[styles.zonasToggleText, { color: '#22a35e' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>Mapa lonas</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.zonasToggle, { borderColor: '#7b5ea7', paddingHorizontal: 9 }]}
            onPress={() => router.push('/(prospectador)/historial-publicaciones')}
            activeOpacity={0.85}
          >
            <Ionicons name="time-outline" size={16} color="#7b5ea7" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zonasToggle, { borderColor: '#1976D2' }]}
            onPress={() => router.push('/(prospectador)/zonas')}
            activeOpacity={0.85}
          >
            <Ionicons name="locate-outline" size={14} color="#1976D2" />
            <Text style={[styles.zonasToggleText, { color: '#1976D2' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>Zonas</Text>
          </TouchableOpacity>
        </View>
      </View>
      {mostrarFiltros && (
        <FiltrosPanelWrapper
          style={isWeb ? styles.filtrosPanel : [styles.filtrosPanel, { maxHeight: windowHeight * 0.55 }]}
          {...(isWeb ? {} : { nestedScrollEnabled: true, showsVerticalScrollIndicator: true })}
        >
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
                onChangeText={(t) => setPrecioMin(formatearInputPrecio(t))}
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
                onChangeText={(t) => setPrecioMax(formatearInputPrecio(t))}
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
        </FiltrosPanelWrapper>
      )}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: primaryColor }}>
      <OfflineBanner />
      {!isWeb && <StatusBar backgroundColor={primaryColor} barStyle="light-content" />}
      <View style={[styles.container, { backgroundColor: c.bg }]}>

        {/* Header unificado con búsqueda */}
        <AccentBackground acentoId={acentoId} style={[styles.header, { paddingTop: isWeb ? 10 : statusBarHeight + 8, paddingBottom: 12 }]}>
          <View style={isWeb ? styles.webHeaderInner : { flex: 1 }}>
            {/* Logo + saludo en la misma fila */}
            <View style={[styles.headerTopRow, { marginBottom: 8 }]}>
              <Image source={LOGO} style={styles.headerLogo} resizeMode="contain" />
              <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
                <Text style={styles.headerSaludo} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {nombreCorto ? `Hola, ${nombreCorto} 👋` : 'Bienvenido 👋'}
                </Text>
                <Text style={styles.headerSubtitulo} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {propiedades.length > 0 ? `${propiedades.length} propiedades disponibles` : 'Cargando...'}
                </Text>
              </View>
              {/* Racha siempre a la vista (y celebración al llegar a un hito) */}
              <TouchableOpacity
                style={styles.miDiaBtn}
                onPress={() => router.push('/(prospectador)/mi-dia')}
                activeOpacity={0.8}
              >
                <Text style={styles.miDiaBtnTxt}>☀️ Mi día</Text>
              </TouchableOpacity>
              <RachaHeader />
            </View>
            <View style={[styles.searchWrapper, { backgroundColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)' }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: darkMode ? '#fff' : '#1a1a2e' }]}
                placeholder="Buscar o precio (ej. 2,5)"
                placeholderTextColor={darkMode ? 'rgba(255,255,255,0.6)' : '#666'}
                value={busqueda}
                onChangeText={setBusqueda}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              />
            </View>
          </View>
        </AccentBackground>

        {/* Contenido centrado en web */}
        <View style={isWeb ? styles.webBody : { flex: 1 }}>

        {/* Filtros visibles encima del estado de carga / vacío / mapa;
            en la lista normal van dentro de ListHeaderComponent para que scrolleen */}
        {(isLoading || vistaZonas || propiedadesFiltradas.length === 0) && filtrosHeader}

        {isLoading ? (
          <SkeletonListaPropiedades n={4} />
        ) : propiedadesFiltradas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>
              {busqueda.trim() || filtrosActivos > 0
                ? 'Sin opciones disponibles'
                : 'Sin propiedades por el momento'}
            </Text>
            <Text style={styles.emptyText}>
              {busqueda.trim() || filtrosActivos > 0
                ? 'En este momento no hay opciones que coincidan con tus filtros de búsqueda. Intenta con otros criterios.'
                : 'No hay propiedades disponibles en este momento.'}
            </Text>
          </View>
        ) : vistaZonas ? (
          <View style={{ flex: 1 }}>
            <MiniMapa
              zonas={zonasParaMapa}
              onZonaPress={handleZonaMapPress}
              propiedadesConCoords={propiedades.filter(p => p.lat && p.lng).map(p => ({
                id: p.id,
                lat: p.lat!,
                lng: p.lng!,
                direccion: p.direccion,
                zona: p.zona,
                titulo: p.titulo,
                precio: p.precio,
                tipo: p.tipo,
              }))}
              onPropiedadPress={(id: string) => router.push(`/(prospectador)/detalle-propiedad?id=${id}` as any)}
            />
          </View>
        ) : isWeb ? (
          <ScrollView
            contentContainerStyle={styles.webGridScroll}
            scrollEventThrottle={200}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
              // Cargar el siguiente bloque al acercarse al final (umbral 600px)
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
                setVisibleCount(v => v < propiedadesFiltradas.length ? v + PAGE_WEB : v)
              }
            }}
          >
            {filtrosHeader}
            <View style={styles.webGrid}>
              {propiedadesFiltradas.slice(0, visibleCount).map(item => renderCard(item, cardWidth))}
            </View>
            {visibleCount < propiedadesFiltradas.length && (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={primaryColor} />
                <Text style={{ color: c.textMute, fontSize: 12, marginTop: 6 }}>
                  Mostrando {visibleCount} de {propiedadesFiltradas.length}
                </Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            data={propiedadesFiltradas}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
            renderItem={({ item }) => renderCard(item)}
            extraData={publicaciones}
            removeClippedSubviews
            initialNumToRender={tarjetasIniciales(ahorroActivo)}
            maxToRenderPerBatch={tarjetasPorTanda(ahorroActivo)}
            windowSize={ahorroActivo ? 5 : 11}
            ListHeaderComponent={filtrosHeader}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPull}
                tintColor={primaryColor}
                colors={[primaryColor]}
              />
            }
          />
        )}

        </View>{/* fin webBody */}
      </View>

      {/* Botón de ayuda flotante — oculto en la vista de mapa para no tapar
          las flechas del panel de propiedades por ubicación. */}
      {!vistaZonas && (
        <TouchableOpacity style={styles.helpFab} onPress={() => setShowHelp(true)} activeOpacity={0.85}>
          <Ionicons name="help" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Modal imagen completa */}
      <Modal visible={imagenModal != null} transparent animationType="fade" onRequestClose={() => setImagenModal(null)}>
        <TouchableOpacity style={styles.imgModalOverlay} onPress={() => setImagenModal(null)} activeOpacity={1}>
          {imagenModal && (
            <ThumbImage url={imagenModal} opts={{ width: 1200, quality: 85 }} style={styles.imgModalImg} resizeMode="contain" />
          )}
          <View style={styles.imgModalCerrar}>
            <Text style={styles.imgModalCerrarText}>✕</Text>
          </View>
        </TouchableOpacity>
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
  headerLogo: { width: 110, height: 38 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  miDiaBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    marginRight: 6,
  },
  miDiaBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 0,
    height: 44,
    overflow: 'hidden',
  },
  searchIcon: { fontSize: 15, marginRight: 8, color: '#aaa' },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 14,
  },
  // Botón Constructoras — compacto y resaltado, junto a "Ver zonas"
  constructorasBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  constructorasIcon: { fontSize: 14 },
  constructorasTxt: { fontSize: 13, fontWeight: '700' },
  // Los chips se reparten el ancho, pero saltan de línea cuando no caben: con
  // `flex: 1` fijo, "Sin publicar" (mucho más largo que "Venta") se salía de la
  // pantalla en móvil. `flexGrow` reparte el sobrante sin forzar anchos iguales.
  quickFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 0,
  },
  quickFilterBtn: {
    flexGrow: 1,
    flexBasis: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  quickFilterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 8,
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
  emptyContainer: { flex: 1, alignItems: 'center', marginTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#555', textAlign: 'center' },
  emptyText: { color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 20 },
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
  // Proporción fija 4:3 → todas las tarjetas con la misma altura de imagen.
  cardImagenWrap: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden' },
  cardImagen: { width: '100%', height: '100%' },
  cardImagenWrapMovil: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden' },
  cardImagenMovil: { width: '100%', height: '100%' },
  lupitaBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 18,
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },
  lupitaText: { fontSize: 17 },
  imgModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' },
  imgModalImg: { width: '100%', height: '85%' },
  imgModalCerrar: {
    position: 'absolute', top: 44, right: 18,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  imgModalCerrarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
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
  // El pie envuelve: con la letra del sistema en grande, precio + "Copiar ficha"
  // + "Publicar" no caben en una línea y el botón de publicar se salía por el
  // borde derecho de la tarjeta. Al envolver, baja a la siguiente línea y se ve
  // completo. Los botones no se encogen; el que cede espacio es el precio.
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  precio: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  shareBtn: {
    minHeight: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(26,100,112,0.12)',
    flexShrink: 0,
  },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  publicadaBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 80,
    flexShrink: 0,
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
