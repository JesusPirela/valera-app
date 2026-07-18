import { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  TextInput,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, router } from 'expo-router'
import { Asset } from 'expo-asset'
import { supabase } from '../../lib/supabase'
import { esPlusOMejor, esStaffSupervision } from '../../lib/permisos'
import { esAdminPrincipal, NOMBRE_MARCA } from '../../lib/adminsPrincipales'
import { thumb } from '../../lib/img'
import { enqueuePublicacion } from '../../lib/offline-queue'
import { ThumbImage } from '../../components/ThumbImage'
import { useVistaComo } from '../../lib/VistaComo'
import * as MediaLibrary from 'expo-media-library'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import { conReintentoData, generarIdemKey, conTimeout } from '../../lib/redIntentos'
import PropMapa from '../../components/PropMapa'
import { actualizarMisionesPorCategoria, registrarAccion } from '../../lib/gamification'


type Propiedad = {
  id: string
  codigo: string
  titulo: string
  precio: number | null
  direccion: string
  operacion: string | null
  tipo: string | null
  estado: string | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  m2: number | null
  m2_terreno: number | null
  estacionamientos: number | null
  descripcion: string | null
  created_by: string | null
  asesor_id: string | null
  exclusiva: boolean | null
  es_constructora: boolean | null
  nombre_constructora: string | null
  inmobiliaria_id: string | null
  inmobiliarias: { nombre: string; logo_url: string | null; exclusiva: boolean } | null
  asesores: { nombre: string; inmobiliaria: string | null; telefono: string | null } | null
  lat: number | null
  lng: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type SubidoPor = { nombre: string; telefono: string | null; colorFicha: string | null }

type SimilarProp = {
  id: string; codigo: string; titulo: string; precio: number | null
  operacion: string | null; tipo: string | null
  recamaras: number | null; banos: number | null; m2: number | null
  direccion: string | null; imagen: string | null
}

type ClienteCRM = {
  id: string
  nombre: string
  telefono: string
  estado: string
  tipo_operacion?: 'venta' | 'renta' | null
  nivel_interes?: 'alto' | 'medio' | 'bajo' | null
  email?: string | null
  tipo_credito?: string | null
  presupuesto?: string | null
  zona_busqueda?: string | null
  num_personas?: string | null
  tiene_mascotas?: boolean | null
  detalle_mascotas?: string | null
  fecha_mudanza?: string | null
  problemas_poliza?: boolean | null
}

const TIPOS_CREDITO_LABEL: Record<string, string> = {
  infonavit: 'Infonavit',
  fovisste: 'Fovisste',
  bancario: 'Bancario',
  contado: 'Contado',
  otro: 'Otro',
}

function construirInfoCliente(cliente: ClienteCRM): string {
  const datos: string[] = []
  if (cliente.nivel_interes) {
    const label = { alto: '🔥 Alto', medio: '🌡️ Medio', bajo: '❄️ Bajo' }[cliente.nivel_interes]
    datos.push(`• Nivel de interés: ${label}`)
  }
  if (cliente.tipo_operacion === 'venta') {
    if (cliente.email) datos.push(`• Email: ${cliente.email}`)
    if (cliente.tipo_credito) datos.push(`• Tipo de crédito: ${TIPOS_CREDITO_LABEL[cliente.tipo_credito] ?? cliente.tipo_credito}`)
    if (cliente.presupuesto) datos.push(`• Presupuesto: ${cliente.presupuesto}`)
    if (cliente.zona_busqueda) datos.push(`• Zona de búsqueda: ${cliente.zona_busqueda}`)
  } else if (cliente.tipo_operacion === 'renta') {
    if (cliente.num_personas) datos.push(`• Personas: ${cliente.num_personas}`)
    if (cliente.tiene_mascotas != null) {
      datos.push(`• Mascotas: ${cliente.tiene_mascotas ? `Sí${cliente.detalle_mascotas ? ` (${cliente.detalle_mascotas})` : ''}` : 'No'}`)
    }
    if (cliente.fecha_mudanza) datos.push(`• Mudanza: ${cliente.fecha_mudanza}`)
    if (cliente.presupuesto) datos.push(`• Presupuesto: ${cliente.presupuesto}`)
    if (cliente.zona_busqueda) datos.push(`• Zonas de interés: ${cliente.zona_busqueda}`)
    if (cliente.problemas_poliza != null) datos.push(`• Problemas con póliza: ${cliente.problemas_poliza ? 'Sí' : 'No'}`)
  }
  return datos.length > 0 ? `\n${datos.join('\n')}` : ''
}

const GMAPS_KEY = 'AIzaSyCPML-wonbnHif1HswVfTk-ypInP1u94sE'

const ESTADOS_LABEL: Record<string, string> = {
  por_perfilar: 'Por perfilar',
  no_contesta: 'No contesta',
  cita_por_agendar: 'Cita por agendar',
  cita_agendada: 'Cita agendada',
  seguimiento_cierre: 'Seg. de cierre',
  compro: 'Apartó / Compró',
  descartado: 'Descartado',
}


function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

// Hace cuánto se publicó la propiedad en la página (a partir de created_at).
function publicadaHace(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const min = Math.floor(ms / 60000)
  if (min < 60) return min <= 1 ? 'hace un momento' : `hace ${min} minutos`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`
  const d = Math.floor(h / 24)
  if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`
  if (d < 30) { const s = Math.floor(d / 7); return s === 1 ? 'hace 1 semana' : `hace ${s} semanas` }
  if (d < 365) { const m = Math.floor(d / 30); return m === 1 ? 'hace 1 mes' : `hace ${m} meses` }
  const a = Math.floor(d / 365); return a === 1 ? 'hace 1 año' : `hace ${a} años`
}

function capitalize(s: string | null) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}


export default function DetallePropiedad() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions()
  // Alto del carrusel principal. Se muestra la foto COMPLETA (contain), no una
  // franja recortada: en móvil el alto crece con el ancho para que una foto
  // horizontal entre entera; en web se acota para que no domine la pantalla.
  const heroH = Platform.OS === 'web'
    ? Math.min(SCREEN_HEIGHT * 0.62, 560)
    : Math.round(SCREEN_WIDTH * 0.82)
  const isOnline = useNetworkStatus()
  const queryClient = useQueryClient()
  const [imagenActual, setImagenActual] = useState(0)
  const [descargando, setDescargando] = useState(false)
  const [modalSeleccion, setModalSeleccion] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [nota, setNota] = useState('')
  const [notaGuardada, setNotaGuardada] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const scrollRef = useRef<FlatList<any>>(null)
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [lightboxIndex, setLightboxIndex]     = useState(0)
  const [lightboxLoading, setLightboxLoading] = useState(false)
  // URLs cuya versión optimizada (thumb/render) falló al cargar: se reintenta
  // con la URL original sin transformar como respaldo.
  const [thumbFallidas, setThumbFallidas] = useState<Set<string>>(new Set())
  // Carrusel de "Opciones similares" (flechas en web).
  const similaresRef = useRef<ScrollView>(null)
  const similaresX = useRef(0)

  const { vistaComo } = useVistaComo()
  const { data: detalle, isLoading, isFetching, refetch } = useQuery({
    queryKey: vistaComo ? ['detalle-propiedad', id, vistaComo] : ['detalle-propiedad', id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      let nombreUsuario: string | null = null
      let rol: string | null = null
      if (userId) {
        const { data: miPerfil } = await supabase
          .from('profiles').select('nombre, role').eq('id', userId).maybeSingle()
        nombreUsuario = miPerfil?.nombre ?? null
        rol = miPerfil?.role ?? null
      }
      rol = vistaComo ?? rol  // rol efectivo (admin "viendo como")

      const { data, error } = await supabase
        .from('propiedades')
        .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, descripcion, created_at, created_by, asesor_id, exclusiva, es_constructora, nombre_constructora, inmobiliaria_id, inmobiliarias(nombre, logo_url, exclusiva), asesores(nombre, inmobiliaria, telefono), lat, lng, propiedad_imagenes(url, orden)')
        .eq('id', id)
        .single()

      if (error) throw error

      const dataNormalizada = {
        ...data,
        inmobiliarias: Array.isArray((data as any).inmobiliarias) ? (data as any).inmobiliarias[0] ?? null : (data as any).inmobiliarias,
        asesores: Array.isArray((data as any).asesores) ? (data as any).asesores[0] ?? null : (data as any).asesores,
      }

      // Restricción: Prospectador/Nuevo no pueden ver propiedades de inmobiliarias exclusivas
      if (!esPlusOMejor(rol)) {
        const propiedadAny = dataNormalizada as unknown as Propiedad
        if (propiedadAny.exclusiva || propiedadAny.inmobiliarias?.exclusiva) {
          return { propiedad: null, subidoPor: null, nombreUsuario, rol, sinAcceso: true as const }
        }
      }

      let subidoPor: SubidoPor | null = null

      // Usar siempre el perfil del admin que creó la propiedad para coordinar citas
      if (dataNormalizada.created_by) {
        const { data: perfil } = await supabase
          .from('profiles').select('nombre, telefono, color_ficha').eq('id', dataNormalizada.created_by).maybeSingle()
        if (perfil) {
          // Ante un usuario normal, solo se nombra a las cuentas de la casa. Si la
          // subió un asesor con rol admin, se muestra la marca en vez de su nombre.
          // El teléfono no se toca: la cita y el WhatsApp siguen yendo a quien
          // corresponde. El staff ve siempre el nombre real.
          const ocultarNombre = !esStaffSupervision(rol) && !esAdminPrincipal(dataNormalizada.created_by)
          subidoPor = {
            nombre: ocultarNombre ? NOMBRE_MARCA : (perfil.nombre ?? 'Admin'),
            telefono: perfil.telefono ?? null,
            colorFicha: (perfil as any).color_ficha ?? null,
          }
        }
      }

      return { propiedad: dataNormalizada as unknown as Propiedad, subidoPor, nombreUsuario, rol, sinAcceso: false as const }
    },
    enabled: !!id,
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  const { data: notaData } = useQuery({
    queryKey: ['nota-propiedad', id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return { contenido: '' }
      const { data } = await supabase
        .from('notas_propiedad').select('contenido')
        .eq('propiedad_id', id).eq('user_id', userId).maybeSingle()
      return { contenido: data?.contenido ?? '' }
    },
    enabled: !!id,
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  const propiedad = detalle?.propiedad ?? null
  const subidoPor = detalle?.subidoPor ?? null
  const nombreUsuario = detalle?.nombreUsuario ?? null
  const rol = detalle?.rol ?? null
  const { refreshControl } = usePullRefresh(refetch)
  const esStaff = esStaffSupervision(rol)

  // Lista COMPLETA de fotos, pedida directo a la base al momento de usarla.
  // El detalle se siembra desde el listado con SOLO la portada (para abrir al
  // instante); si el usuario genera el PDF o descarga fotos antes de que el
  // refetch complete (o si falló por red), propiedad_imagenes trae 1 sola foto
  // y el PDF/la descarga salían con una única imagen. Si esta consulta falla,
  // se usa lo que haya en cache (mejor 1 foto que nada).
  async function obtenerImagenesCompletas(): Promise<{ url: string; orden: number }[]> {
    try {
      const { data } = await conTimeout(
        supabase.from('propiedad_imagenes').select('url, orden').eq('propiedad_id', id).order('orden'),
        10_000,
      )
      if (data && data.length > 0) {
        // Sincronizar el cache del detalle para que la galería/modal también
        // muestren todas las fotos aunque el refetch original haya fallado.
        queryClient.setQueryData(['detalle-propiedad', id], (old: any) =>
          old?.propiedad ? { ...old, propiedad: { ...old.propiedad, propiedad_imagenes: data } } : old)
        return data as { url: string; orden: number }[]
      }
    } catch { /* sin red: usar el cache */ }
    return [...(propiedad?.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)
  }

  // Admin/Supervisor: quiénes publicaron esta propiedad y cuántas veces
  const { data: publicadores } = useQuery({
    queryKey: ['publicadores-propiedad', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_publicadores_propiedad', { p_propiedad_id: id })
      if (error) return [] as { user_id: string; nombre: string; veces: number }[]
      return (data ?? []) as { user_id: string; nombre: string; veces: number }[]
    },
    enabled: !!id && esStaff,
    staleTime: 1000 * 30,
  })

  // Opciones similares: misma zona (proximidad), precio y características.
  const { data: similares } = useQuery({
    queryKey: ['similares', id, esPlusOMejor(rol)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('propiedades_similares', {
        p_id: id, p_incluir_exclusivas: esPlusOMejor(rol), p_limit: 10,
      })
      if (error) return [] as SimilarProp[]
      return (data ?? []) as SimilarProp[]
    },
    enabled: !!id && !!propiedad,
    staleTime: 1000 * 60 * 5,
  })

  // Sin permiso para ver esta propiedad (inmobiliaria exclusiva) → volver al listado
  useEffect(() => {
    if (detalle?.sinAcceso) {
      router.replace('/(prospectador)/propiedades')
    }
  }, [detalle?.sinAcceso])

  // Sincronizar nota desde caché cuando carga
  useEffect(() => {
    if (notaData?.contenido !== undefined) {
      setNota(notaData.contenido)
      setNotaGuardada(notaData.contenido)
    }
  }, [notaData?.contenido])

  // Modal selección de cliente para cita
  const [modalCitaVisible, setModalCitaVisible] = useState(false)
  const [clientesCRM, setClientesCRM] = useState<ClienteCRM[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [solicitandoDiseno, setSolicitandoDiseno] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [descripcionCopiada, setDescripcionCopiada] = useState(false)
  const [, setPublicada] = useState(false)
  const [fechaPublicacion, setFechaPublicacion] = useState<string | null>(null)
  const [togglingPublicacion, setTogglingPublicacion] = useState(false)
  const [vecesPublicada, setVecesPublicada] = useState(0)
  const [deshaciendoPub, setDeshaciendoPub] = useState(false)

  // Modal "Registrar con constructora"
  const [modalConstructoraVisible, setModalConstructoraVisible] = useState(false)
  const [regNombre, setRegNombre] = useState('')
  const [regTelefono, setRegTelefono] = useState('')
  const [regCorreo, setRegCorreo] = useState('')
  const [registrandoConstructora, setRegistrandoConstructora] = useState(false)

  // Paso 2: selección de fecha/hora de la cita
  const [clienteParaCita, setClienteParaCita] = useState<ClienteCRM | null>(null)
  const [pasoCita, setPasoCita] = useState<'seleccion' | 'fecha'>('seleccion')
  const [fechaCita, setFechaCita] = useState<Date>(new Date())

  function cerrarModalCita() {
    setModalCitaVisible(false)
    setPasoCita('seleccion')
  }

  useEffect(() => {
    if (!id || !isOnline) return
    setPublicada(false)
    setVecesPublicada(0)
    setFechaPublicacion(null)
    cargarPublicacion()
    // Registrar vista solo si el usuario permanece ≥30 s en la propiedad.
    const timer = setTimeout(() => registrarActividad('vista'), 30_000)
    return () => clearTimeout(timer)
  }, [id])

  // Resetear estado de carga al cambiar de imagen en el lightbox
  useEffect(() => {
    if (lightboxVisible) setLightboxLoading(true)
  }, [lightboxIndex, lightboxVisible])

  // Teclado para lightbox en web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !lightboxVisible) return
    const len = propiedad?.propiedad_imagenes?.length ?? 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setLightboxVisible(false)
      if (e.key === 'ArrowRight')  setLightboxIndex(i => Math.min(len - 1, i + 1))
      if (e.key === 'ArrowLeft')   setLightboxIndex(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxVisible, propiedad])

  async function cargarPublicacion() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('propiedad_publicacion')
      .select('publicada, fecha_publicacion, veces_publicada')
      .eq('propiedad_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) {
      setPublicada(data.publicada)
      setFechaPublicacion(data.fecha_publicacion)
      setVecesPublicada(data.veces_publicada ?? 0)
    }
  }

  async function togglePublicacion() {
    // getSession() es local (no cuelga sin red); getUser() hace un round-trip.
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    if (vecesPublicada >= 10) {
      if (Platform.OS === 'web') window.alert('Esta propiedad alcanzó el límite de 10 publicaciones.')
      else Alert.alert('Límite alcanzado', 'Esta propiedad alcanzó el límite de 10 publicaciones.')
      return
    }

    setTogglingPublicacion(true)

    // Mismo diseño robusto que el botón del listado: la publicación NUNCA se
    // pierde (si la red falla se ENCOLA con el mismo idem key y se envía sola
    // al reconectar — la RPC es idempotente, no puede duplicar) y el spinner
    // SIEMPRE se limpia (try/finally).
    const idemKey = generarIdemKey()
    const exito = (veces: number, fecha?: string | null) => {
      setPublicada(true)
      setFechaPublicacion(fecha ?? new Date().toISOString())
      setVecesPublicada(veces)
      actualizarMisionesPorCategoria(user.id, 'propiedad').catch(() => {})
      actualizarProgresoTareasPublicar(user.id)
      queryClient.invalidateQueries({ queryKey: ['publicaciones-usuario'] })
    }
    const encolar = async () => {
      await enqueuePublicacion(id as string, idemKey).catch(() => {})
      // Optimista: se refleja ya; la cola lo hace real al reconectar.
      setPublicada(true)
      setVecesPublicada(vecesPublicada + 1)
      const msg = 'La conexión está inestable. Tu publicación quedó guardada y se registrará sola en cuanto haya señal — no necesitas volver a intentar.'
      if (Platform.OS === 'web') window.alert(`Publicación pendiente: ${msg}`)
      else Alert.alert('Publicación pendiente', msg)
    }

    try {
      // Sesión fresca ANTES de llamar (token expirado tras background en
      // Android colgaba el refresh interno de supabase-js a mitad de la RPC).
      try {
        const expMs = (session.expires_at ?? 0) * 1000
        if (expMs - Date.now() < 60_000) {
          await conTimeout(supabase.auth.refreshSession(), 8000).catch(() => {})
        }
      } catch { /* no bloquear */ }

      const llamar = () => conReintentoData<{ ok: boolean; error?: string; veces_publicada?: number; fecha_publicacion?: string }>(
        (signal) => supabase.rpc('publicar_propiedad_atomico', { p_propiedad_id: id, p_idem_key: idemKey }).abortSignal(signal),
        { intentos: 2, timeoutMs: 12_000 },
      )
      let { ok, data, errorMsg } = await llamar()

      // Error de auth → refrescar sesión y reintentar UNA vez (idempotente).
      if (!ok && errorMsg && /jwt|token|expir|unauthor|not authenticated|no autenticado|401|403/i.test(errorMsg)) {
        try { await conTimeout(supabase.auth.refreshSession(), 8000) } catch { /* el reintento decide */ }
        ;({ ok, data, errorMsg } = await llamar())
      }

      // Timeout sin respuesta: la escritura pudo llegar igual. Verificar.
      if (!ok && !errorMsg) {
        try {
          const { data: chk } = await conTimeout(
            supabase.from('propiedad_publicacion')
              .select('veces_publicada, fecha_publicacion')
              .eq('propiedad_id', id).eq('user_id', user.id).maybeSingle(),
            8000,
          )
          if (chk && (chk.veces_publicada ?? 0) > vecesPublicada) {
            exito(chk.veces_publicada!, chk.fecha_publicacion)
            return
          }
        } catch { /* la verificación también falló: sigue el flujo */ }
      }

      if (ok && data?.ok) {
        exito(data.veces_publicada ?? vecesPublicada + 1, data.fecha_publicacion)
        return
      }
      if (data?.error === 'limite') {
        const msg = 'Esta propiedad alcanzó el límite de 10 publicaciones.'
        if (Platform.OS === 'web') window.alert(msg)
        else Alert.alert('Límite alcanzado', msg)
        return
      }
      if (ok && data && data.ok === false) {
        // Error de negocio del servidor: reintentar no ayuda.
        const msg = `No se pudo publicar: ${data.error ?? 'error del servidor'}`
        if (Platform.OS === 'web') window.alert(msg)
        else Alert.alert('No se pudo publicar', msg)
        return
      }
      // Red/timeout/error transitorio → encolar (nunca se pierde).
      await encolar()
      return
    } finally {
      setTogglingPublicacion(false)
    }
  }

  // Actualiza el progreso de tareas "publicar_propiedades" tras una publicación
  // exitosa. En segundo plano y a prueba de fallos: nunca bloquea el botón.
  async function actualizarProgresoTareasPublicar(userId: string) {
    try {
      const { count } = await supabase
        .from('propiedad_publicacion')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('veces_publicada', 0)

      const totalPublicadas = count ?? 0

      const { data: asigs } = await supabase
        .from('tarea_asignaciones')
        .select('id, tarea:tareas!inner(tipo, meta_cantidad)')
        .eq('user_id', userId)
        .eq('completada', false)
        .eq('tareas.tipo', 'publicar_propiedades')

      for (const a of (asigs ?? []) as any[]) {
        const meta = a.tarea?.meta_cantidad ?? 1
        const completada = totalPublicadas >= meta
        await supabase
          .from('tarea_asignaciones')
          .update({
            progreso: Math.min(totalPublicadas, meta),
            completada,
            completada_at: completada ? new Date().toISOString() : null,
          })
          .eq('id', a.id)
      }
    } catch { /* mejor perder el tick de la tarea que romper la publicación */ }
  }

  async function deshacerPublicacion() {
    if (vecesPublicada <= 0 || deshaciendoPub) return

    const msg = `Esto deshará tu ÚLTIMA publicación y el contador quedará en ${vecesPublicada - 1}/10.\n\nÚsalo SOLO si le diste click a "Publicar" por error. También se restarán los puntos ganados por esa publicación (-10 XP, -2 coins).`
    const confirmado = Platform.OS === 'web'
      ? window.confirm(`¿Deshacer última publicación?\n\n${msg}`)
      : await new Promise<boolean>((res) => {
          Alert.alert('¿Deshacer última publicación?', msg, [
            { text: 'Cancelar', style: 'cancel', onPress: () => res(false) },
            { text: 'Sí, fue un error', style: 'destructive', onPress: () => res(true) },
          ])
        })
    if (!confirmado) return

    setDeshaciendoPub(true)
    const { data, error } = await supabase.rpc('despublicar_propiedad', { p_propiedad_id: id })
    const resp = data as { ok: boolean; veces_publicada?: number; fecha_publicacion?: string | null } | null

    if (!error && resp?.ok) {
      const nuevas = resp.veces_publicada ?? 0
      setVecesPublicada(nuevas)
      setPublicada(nuevas > 0)
      setFechaPublicacion(resp.fecha_publicacion ?? null)
      queryClient.invalidateQueries({ queryKey: ['publicaciones-usuario'] })
    } else {
      const errMsg = 'No se pudo deshacer la publicación. Intenta de nuevo.'
      if (Platform.OS === 'web') window.alert(errMsg)
      else Alert.alert('Error', errMsg)
    }
    setDeshaciendoPub(false)
  }

  async function guardarNota() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setGuardandoNota(true)
    const { error } = await supabase
      .from('notas_propiedad')
      .upsert({ propiedad_id: id, user_id: user.id, contenido: nota, updated_at: new Date().toISOString() })
    setGuardandoNota(false)
    if (!error) setNotaGuardada(nota)
  }

  async function registrarActividad(tipo: 'vista' | 'descarga') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('propiedad_actividad').insert({ propiedad_id: id, user_id: user.id, tipo })
  }

  async function copiarDescripcion() {
    if (!propiedad?.descripcion) return
    const texto = `ID: ${propiedad.codigo}\n\n${propiedad.descripcion}`
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(texto) } catch { /* ignorar */ }
    } else {
      await Clipboard.setStringAsync(texto)
    }
    setDescripcionCopiada(true)
    setTimeout(() => setDescripcionCopiada(false), 2000)
  }

  async function getLogoBase64(): Promise<string> {
    try {
      if (Platform.OS === 'web') {
        const logoModule = require('../../assets/logo.png')
        const uri = typeof logoModule === 'string' ? logoModule : (logoModule?.uri ?? '')
        if (!uri) return ''
        try {
          const res = await fetch(uri)
          const blob = await res.blob()
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        } catch {
          return uri
        }
      }
      const asset = Asset.fromModule(require('../../assets/logo.png'))
      await asset.downloadAsync()
      if (!asset.localUri) return ''
      const b64 = await FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 })
      return `data:image/png;base64,${b64}`
    } catch { return '' }
  }

  // Devuelve null si no se pudo descargar/optimizar la imagen — el llamador
  // debe OMITIRLA del PDF. Nunca hay que caer de vuelta a la URL original
  // sin redimensionar: con internet inestable basta que una de varias fotos
  // falle para que el WebView de Android tenga que decodificarla a
  // resolución completa al renderizar el PDF, reproduciendo el mismo
  // OutOfMemoryError que se intenta evitar.
  async function imagenABase64(url: string, _anchoMax = 1100): Promise<string | null> {
    if (Platform.OS === 'web') {
      // Carga la imagen con crossOrigin='anonymous' (CORS: * confirmado en bucket propiedades)
      // y convierte via canvas.toDataURL. Esto evita todo problema de fetch/CORS/supabase client.
      const cargarConCanvas = (): Promise<string | null> =>
        new Promise((resolve) => {
          const img = new window.Image()
          img.crossOrigin = 'anonymous'
          const timer = setTimeout(() => { img.src = ''; resolve(null) }, 20000)
          img.onload = () => {
            clearTimeout(timer)
            try {
              const MAX = 1100
              const ratio = Math.min(1, MAX / (img.naturalWidth || 1), MAX / (img.naturalHeight || 1))
              const canvas = document.createElement('canvas')
              canvas.width  = Math.round((img.naturalWidth  || 1) * ratio)
              canvas.height = Math.round((img.naturalHeight || 1) * ratio)
              const ctx = canvas.getContext('2d')
              if (!ctx) { resolve(null); return }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              const data = canvas.toDataURL('image/jpeg', 0.88)
              resolve(data && data.length > 100 ? data : null)
            } catch (e) {
              console.error('[PDF] canvas error:', url, e)
              resolve(null)
            }
          }
          img.onerror = (e) => {
            clearTimeout(timer)
            console.error('[PDF] img error:', url, e)
            resolve(null)
          }
          // Cache-bust para evitar respuesta sin CORS del caché del navegador
          img.src = url + (url.includes('?') ? '&' : '?') + '_pdf=' + Date.now()
        })

      // Primer intento con canvas
      const r1 = await cargarConCanvas()
      if (r1) return r1

      // Fallback: fetch + FileReader (en caso de que canvas falle)
      try {
        const resp = await fetch(url)
        if (resp.ok) {
          const blob = await resp.blob()
          const b64 = await new Promise<string | null>((res) => {
            const reader = new FileReader()
            reader.onloadend = () => res(typeof reader.result === 'string' && reader.result.length > 100 ? reader.result : null)
            reader.onerror = () => res(null)
            reader.readAsDataURL(blob)
          })
          if (b64) return b64
        }
      } catch (e) {
        console.error('[PDF] fetch fallback error:', url, e)
      }

      return null
    }
    // Nativo: descarga optimizada via thumb() al sistema de archivos (q72, como
    // el original que funcionaba).
    const urlOptimizada = thumb(url, { width: _anchoMax, quality: 72, resize: 'contain' }) ?? url
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const localUri = FileSystem.cacheDirectory + 'ficha_img_' + Math.random().toString(36).slice(2) + '.jpg'
        const { uri } = await conTimeout(FileSystem.downloadAsync(urlOptimizada, localUri), 12000)
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
        if (!base64) throw new Error('descarga vacía')
        return `data:image/jpeg;base64,${base64}`
      } catch {
        if (intento < 3) await new Promise((r) => setTimeout(r, 600 * intento))
      }
    }
    return null
  }

  async function generarFichaPDF() {
    if (!propiedad) return

    setGenerandoPDF(true)
    try {
      // Color de la ficha según quién subió la propiedad (created_by).
      // Configurable por admin; por defecto el teal de Valera.
      const colorFicha = subidoPor?.colorFicha || '#1a6470'
      const colorFichaMap = colorFicha.replace('#', '0x')

      const esc = (s: string | null | undefined) =>
        (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      // Convierte emoji en <img> embebida como data URI para que se vean en el PDF.
      // Android: descarga PNG 72x72 de Twemoji vía FileSystem (mismo mecanismo que
      // las fotos de la propiedad). data:image/png siempre funciona en el renderer
      // de impresión de Android; data:image/svg+xml no renderiza en ese contexto.
      // Web: mantiene SVG vía fetch (mayor calidad vectorial en jsPDF).
      const prepararDescripcionPDF = async (desc: string): Promise<string> => {
        const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{231A}\u{231B}\u{23E9}-\u{23F3}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{2721}\u{2728}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}]/gu
        const uniqueEmoji = [...new Set([...desc.matchAll(EMOJI_RE)].map(m => m[0]))]
        const emojiMap = new Map<string, string>()
        await Promise.all(uniqueEmoji.map(async (emoji) => {
          try {
            const cp = [...emoji]
              .map(c => c.codePointAt(0)!)
              .filter(c => c !== 0xFE0F && c !== 0xFE0E && c !== 0x200D)
              .map(c => c.toString(16))
              .join('-')
            if (!cp) return

            if (Platform.OS !== 'web') {
              // Nativo: PNG descargado a caché temporal y leído como base64.
              // PNG es el formato que el renderer de impresión de Android soporta
              // siempre; SVG data URI no renderiza en ese contexto.
              const localUri = FileSystem.cacheDirectory + `emoji_${cp}.png`
              try {
                const { status } = await conTimeout(
                  FileSystem.downloadAsync(
                    `https://cdn.jsdelivr.net/npm/@twemoji/api@latest/assets/72x72/${cp}.png`,
                    localUri,
                  ),
                  8000,
                )
                if (status !== 200) return
                const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
                FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {})
                if (!b64) return
                emojiMap.set(emoji, `<img src="data:image/png;base64,${b64}" style="height:1.1em;width:1.1em;vertical-align:middle;margin:0 1px;">`)
              } catch {
                FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {})
              }
            } else {
              // Web: SVG vectorial vía fetch
              const resp = await fetch(`https://cdn.jsdelivr.net/npm/@twemoji/api@latest/assets/svg/${cp}.svg`)
              if (!resp.ok) return
              const svgText = await resp.text()
              const b64 = btoa(unescape(encodeURIComponent(svgText)))
              emojiMap.set(emoji, `<img src="data:image/svg+xml;base64,${b64}" style="height:1em;width:1em;vertical-align:middle;margin:0 1px;">`)
            }
          } catch { /* deja el emoji como texto si falla */ }
        }))
        let result = esc(desc)
        for (const [emoji, img] of emojiMap) {
          result = result.split(emoji).join(img)
        }
        // Compactar: quitar espacios sobrantes al final de línea y COLAPSAR las
        // líneas en blanco (el texto suele traer dobles saltos `\n\n` que en el
        // PDF se veían como huecos enormes entre cada renglón). Queda una lista
        // limpia, un renglón por punto.
        return result
          .replace(/[ \t]+\n/g, '\n')
          .replace(/(?:\r?\n){2,}/g, '\n')
          .replace(/^\s+|\s+$/g, '')
          .replace(/\r?\n/g, '<br>')
      }

      const precio = propiedad.precio != null
        ? '$' + propiedad.precio.toLocaleString('es-MX') + ' MXN'
        : 'Precio a consultar'
      const tipo = propiedad.tipo
        ? propiedad.tipo.charAt(0).toUpperCase() + propiedad.tipo.slice(1)
        : ''
      const operacion = propiedad.operacion
        ? propiedad.operacion.charAt(0).toUpperCase() + propiedad.operacion.slice(1)
        : ''

      const imagenes = await obtenerImagenesCompletas()

      // Presupuesto de memoria del PDF: el WebView de impresión en Android tiene
      // poca tolerancia a HTMLs pesados con muchas imágenes base64. Con 14 fotos
      // a 900px el WebView se congela sin crashear (promise que nunca resuelve).
      // Android: lotes de 4 en paralelo — 13 simultáneas saturaban el stack de
      // red y todas fallaban; 1 por 1 tardaba ~40 s. Lotes de 4 ≈ 4 rondas ~12 s.
      const esWeb = Platform.OS === 'web'
      const esAndroid = Platform.OS === 'android'
      const maxFotos = esAndroid ? 13 : 14
      const anchoPrincipal = esWeb ? 1100 : esAndroid ? 600 : 900
      const anchoGaleria = esWeb ? 700 : esAndroid ? 340 : 560

      const descargarEnLotes = async (
        items: { url: string; orden: number }[],
        tamLote: number,
      ): Promise<Array<{ url: string; orden: number; src: string | null }>> => {
        const resultados: Array<{ url: string; orden: number; src: string | null }> = []
        for (let i = 0; i < items.length; i += tamLote) {
          const lote = items.slice(i, i + tamLote)
          const srcs = await Promise.all(
            lote.map((img, j) => imagenABase64(img.url, i + j === 0 ? anchoPrincipal : anchoGaleria))
          )
          lote.forEach((img, j) => {
            if (!srcs[j]) console.error('[PDF] imagen no cargó:', img.url)
            resultados.push({ ...img, src: srcs[j] })
          })
        }
        return resultados
      }

      const batch = imagenes.slice(0, maxFotos)
      const tamLote = esAndroid ? 4 : 6
      const [imagenesConSrcRaw, logoSrc, inmobiliariaLogoSrc] = await Promise.all([
        esWeb
          ? Promise.all(batch.map(async (img, i) => {
              const src = await imagenABase64(img.url, i === 0 ? anchoPrincipal : anchoGaleria)
              if (!src) console.error('[PDF] imagen no cargó:', img.url)
              return { ...img, src }
            }))
          : descargarEnLotes(batch, tamLote),
        getLogoBase64(),
        propiedad.inmobiliarias?.logo_url ? imagenABase64(propiedad.inmobiliarias.logo_url) : Promise.resolve(null),
      ])

      // Omitir las fotos que no se pudieron descargar/optimizar (mejor una
      // ficha con menos fotos que arriesgar un crash por memoria).
      const imagenesConSrc = imagenesConSrcRaw.filter(
        (img): img is typeof img & { src: string } => !!img.src
      )

      console.log(`[PDF] ${imagenesConSrc.length}/${imagenes.length} imágenes cargadas`)
      const imagenPrincipal = imagenesConSrc[0]
      // Galería en UN solo flujo (2 por fila) que arranca justo después de la
      // descripción. Antes se agrupaban de 6 con salto de página forzado por
      // grupo, lo que dejaba un hueco grande antes de las fotos. Ahora cada foto
      // evita cortarse a la mitad (break-inside en .foto-galeria) pero el flujo
      // sigue de una página a la otra, sin huecos.
      const fotosRestantes = imagenesConSrc.slice(1)
      const galeriaHTML = fotosRestantes.length > 0
        ? `<div class="seccion">Galería</div>
           <div class="fotos">${fotosRestantes.map(img => `<img src="${img.src}" class="foto-galeria" />`).join('')}</div>`
        : ''

      const cars: string[] = []
      if (propiedad.recamaras != null) cars.push(`<div class="car"><span class="car-val">${propiedad.recamaras}</span><span class="car-lbl">Recámaras</span></div>`)
      if (propiedad.banos != null) cars.push(`<div class="car"><span class="car-val">${propiedad.banos}</span><span class="car-lbl">Baños</span></div>`)
      if (propiedad.medios_banos != null && propiedad.medios_banos > 0) cars.push(`<div class="car"><span class="car-val">${propiedad.medios_banos}</span><span class="car-lbl">Medio${propiedad.medios_banos === 1 ? '' : 's'} baño${propiedad.medios_banos === 1 ? '' : 's'}</span></div>`)
      if (propiedad.m2 != null) cars.push(`<div class="car"><span class="car-val">${propiedad.m2}</span><span class="car-lbl">m² construcción</span></div>`)
      if (propiedad.m2_terreno != null) cars.push(`<div class="car"><span class="car-val">${propiedad.m2_terreno}</span><span class="car-lbl">m² terreno</span></div>`)
      if (propiedad.estacionamientos != null) cars.push(`<div class="car"><span class="car-val">${propiedad.estacionamientos}</span><span class="car-lbl">Estacionamientos</span></div>`)

      // Mapa estático de Google si hay coordenadas
      let mapaHTML = ''
      if (propiedad.lat && propiedad.lng) {
        const lat = propiedad.lat
        const lng = propiedad.lng
        const staticUrl = esAndroid
          ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&scale=1&markers=color:${colorFichaMap}%7C${lat},${lng}&key=${GMAPS_KEY}`
          : `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=740x340&scale=2&markers=color:${colorFichaMap}%7C${lat},${lng}&key=${GMAPS_KEY}`
        const mapSrc = await imagenABase64(staticUrl)
        mapaHTML = `
          <div class="seccion-grupo">
            <div class="seccion">Ubicación</div>
            <div class="mapa-box">
              ${mapSrc ? `<img src="${mapSrc}" class="mapa-img" />` : ''}
              <div class="mapa-dir">📍 ${esc(propiedad.direccion)}</div>
            </div>
          </div>`
      }

      const descHTML = propiedad.descripcion ? await prepararDescripcionPDF(propiedad.descripcion) : null

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${propiedad.codigo ?? 'ficha'}</title><style>
        * {
          box-sizing: border-box; margin: 0; padding: 0;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact;
        }
        body { font-family: Helvetica, Arial, sans-serif; color: #1a1a2e; background: #fff; }
        .header { background: ${colorFicha}; padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; }
        .header-left { flex: 1; }
        .header-logo { height: 130px; max-width: 280px; object-fit: contain; flex-shrink: 0; margin-left: 16px; }
        .codigo { font-size: 13px; color: #c9a84c; font-weight: 700; margin-bottom: 4px; letter-spacing: 1px; }
        .titulo { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 4px; }
        .tipo-op { font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 10px; }
        .precio { font-size: 30px; font-weight: 800; color: #c9a84c; margin-bottom: 5px; }
        .direccion { font-size: 14px; color: rgba(255,255,255,0.8); }
        .body { padding: 20px 28px; }
        .imagen-principal-wrap { width: 100%; height: 420px; border-radius: 10px; overflow: hidden; margin-bottom: 16px; background: #eef2f3; display: flex; align-items: center; justify-content: center; }
        .imagen-principal { width: 100%; height: 100%; object-fit: contain; display: block; }
        .inmob-logo-wrap { text-align: center; margin-bottom: 16px; }
        .inmob-logo { max-height: 90px; max-width: 240px; object-fit: contain; }
        .inmob-nombre { font-size: 12px; color: #888; font-weight: 600; margin-top: 4px; }
        .fotos { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
        .foto-galeria { width: calc(50% - 7px); height: 330px; object-fit: contain; background: #eef2f3; border-radius: 8px; border: 1px solid #e0e8ea; break-inside: avoid; page-break-inside: avoid; }
        .seccion { font-size: 10px; font-weight: 800; color: #888; letter-spacing: 1.2px; text-transform: uppercase; margin: 20px 0 10px; display: block; clear: both; }
        .cars { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; overflow: hidden; }
        .car-val { display: block; font-size: 20px; font-weight: 800; color: ${colorFicha}; }
        .car-lbl { display: block; font-size: 11px; color: #888; margin-top: 2px; }
        .desc { display: block; clear: both; font-size: 14px; font-weight: 500; line-height: 1.45; color: #222; background: #f7f9fa; border: 1px solid #e0e8ea; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; word-break: break-word; white-space: normal; overflow: visible; break-inside: avoid; page-break-inside: avoid; }
        .mapa-box { border: 1.5px solid #e0e8ea; border-radius: 10px; overflow: hidden; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
        .mapa-img { width: 100%; height: 340px; object-fit: cover; display: block; }
        .mapa-dir { background: #f0f5f5; padding: 10px 14px; font-size: 12px; color: ${colorFicha}; font-weight: 600; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; clear: both; }
        .galeria-grupo { break-inside: avoid; page-break-inside: avoid; }
        .seccion-grupo { break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
        .car { background: #f0f5f5; border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 70px; break-inside: avoid; page-break-inside: avoid; }
      </style></head><body>
      <div class="header">
        <div class="header-left">
          <div class="codigo">${esc(propiedad.codigo)}</div>
          <div class="titulo">${esc(propiedad.titulo)}</div>
          <div class="tipo-op">${[tipo, operacion].filter(Boolean).join(' en ')}</div>
          <div class="precio">${precio}</div>
          <div class="direccion">${esc(propiedad.direccion)}</div>
        </div>
        ${logoSrc ? `<img src="${logoSrc}" class="header-logo" />` : ''}
      </div>
      <div class="body">
        ${imagenPrincipal ? `<div class="imagen-principal-wrap"><img src="${imagenPrincipal.src}" class="imagen-principal" /></div>` : ''}
        ${inmobiliariaLogoSrc ? `<div class="inmob-logo-wrap">
          <img src="${inmobiliariaLogoSrc}" class="inmob-logo" />
          ${propiedad.inmobiliarias?.nombre ? `<div class="inmob-nombre">${esc(propiedad.inmobiliarias.nombre)}</div>` : ''}
        </div>` : ''}
        ${cars.length > 0 ? `<div class="seccion-grupo"><div class="seccion">Características</div><div class="cars">${cars.join('')}</div></div>` : ''}
        ${descHTML !== null && descHTML.trim() !== '' ? `<div class="seccion-grupo"><div class="seccion">Descripción</div><div class="desc">${descHTML}</div></div>` : ''}
        ${galeriaHTML}
        ${mapaHTML}
        <div class="footer">Valera Real Estate · valerarealestate.com</div>
      </div>
      </body></html>`

      const nombreArchivo = `${(propiedad.codigo || 'ficha').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`

      if (Platform.OS === 'web') {
        const { jsPDF } = await import('jspdf')
        const html2canvas = (await import('html2canvas')).default

        const container = document.createElement('div')
        // ABSOLUTE (no fixed): html2canvas tiene un bug conocido con elementos
        // position:fixed cuando la página está scrolleada (aplica el offset del
        // scroll al clon y captura un área vacía → PDF en blanco). El botón de
        // descargar vive abajo del fold, así que la página casi siempre está
        // scrolleada. absolute + top:0 ancla al documento y es inmune al scroll.
        container.style.position = 'absolute'
        container.style.top = '0'
        container.style.left = '-10000px'
        container.style.width = '800px'
        container.innerHTML = html
        document.body.appendChild(container)

        try {
          await new Promise<void>(resolve => {
            const imgs = Array.from(container.querySelectorAll('img'))
            if (imgs.length === 0) return resolve()
            let restantes = imgs.length
            const listo = () => { restantes--; if (restantes <= 0) resolve() }
            imgs.forEach(img => {
              if (img.complete) listo()
              else {
                img.addEventListener('load', listo)
                img.addEventListener('error', listo)
              }
            })
            setTimeout(resolve, 8000)
          })
          const renderizar = () => html2canvas(container, {
            useCORS: false,
            allowTaint: true,
            scale: 2,
            width: 800,
            windowWidth: 800,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff',
          })
          let canvas = await renderizar()

          // Guardia anti-PDF-en-blanco: si el canvas salió completamente blanco
          // (síntoma del bug de scroll de html2canvas), reintentar una vez con la
          // página en el tope y restaurar el scroll del usuario después.
          const canvasEnBlanco = (cv: HTMLCanvasElement): boolean => {
            const cctx = cv.getContext('2d')
            if (!cctx) return false
            const paso = Math.max(1, Math.floor(cv.height / 24))
            for (let y = 0; y < cv.height; y += paso) {
              const { data } = cctx.getImageData(0, y, cv.width, 1)
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false
              }
            }
            return true
          }
          if (canvasEnBlanco(canvas)) {
            const sx = window.scrollX, sy = window.scrollY
            window.scrollTo(0, 0)
            try {
              await new Promise<void>(r => setTimeout(r, 150))
              canvas = await renderizar()
            } finally {
              window.scrollTo(sx, sy)
            }
            if (canvasEnBlanco(canvas)) throw new Error('captura en blanco')
          }

          const doc = new jsPDF('p', 'pt', 'a4')
          const pageWidth = doc.internal.pageSize.getWidth()
          const pageHeight = doc.internal.pageSize.getHeight()
          const pxPerPt = canvas.width / pageWidth
          const pageHeightPx = pageHeight * pxPerPt
          const searchMarginPx = 60 * (canvas.width / 800)

          const ctx = canvas.getContext('2d')
          const isRowBlank = (y: number) => {
            if (!ctx) return false
            const { data } = ctx.getImageData(0, y, canvas.width, 1)
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false
            }
            return true
          }
          const findBreak = (idealY: number) => {
            const minY = Math.max(0, idealY - searchMarginPx)
            for (let y = idealY; y > minY; y--) {
              if (isRowBlank(y)) return y
            }
            return idealY
          }

          // Evita cortar imágenes/tarjetas/mapa a la mitad entre páginas
          const containerRect = container.getBoundingClientRect()
          const scaleFactor = canvas.width / containerRect.width
          const avoidRanges = Array.from(container.querySelectorAll('img, .car, .mapa-box, .footer, .galeria-grupo, .seccion-grupo'))
            .map(el => {
              const r = el.getBoundingClientRect()
              return {
                top: (r.top - containerRect.top) * scaleFactor,
                bottom: (r.bottom - containerRect.top) * scaleFactor,
              }
            })
            .sort((a, b) => a.top - b.top)

          const resolveBreak = (renderedPx: number, idealEnd: number) => {
            if (idealEnd >= canvas.height) return canvas.height
            const conflict = avoidRanges.find(r => idealEnd > r.top + 1 && idealEnd < r.bottom - 1)
            if (conflict) {
              if (conflict.top > renderedPx) return conflict.top
              if (conflict.bottom - renderedPx <= pageHeightPx) return conflict.bottom
            }
            return findBreak(Math.floor(idealEnd))
          }

          // Forzar salto de página entre cada grupo de fotos de la galería (máx. 6 por hoja)
          const forceBreaks = Array.from(container.querySelectorAll('.galeria-grupo'))
            .slice(1)
            .map(el => {
              const r = el.getBoundingClientRect()
              return (r.top - containerRect.top) * scaleFactor
            })
            .sort((a, b) => a - b)

          const sliceCanvas = document.createElement('canvas')
          const sliceCtx = sliceCanvas.getContext('2d')!
          sliceCanvas.width = canvas.width

          let renderedPx = 0
          let firstPage = true
          while (renderedPx < canvas.height) {
            const idealEnd = renderedPx + pageHeightPx
            let end = resolveBreak(renderedPx, idealEnd)
            const nextForceBreak = forceBreaks.find(f => f > renderedPx + 1 && f < end)
            if (nextForceBreak !== undefined) end = nextForceBreak
            const sliceHeightPx = Math.max(1, end - renderedPx)

            sliceCanvas.height = sliceHeightPx
            sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceHeightPx)
            sliceCtx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
            const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92)
            const sliceHeightPt = sliceHeightPx / pxPerPt

            if (!firstPage) doc.addPage()
            doc.addImage(sliceData, 'JPEG', 0, 0, pageWidth, sliceHeightPt)

            renderedPx = end
            firstPage = false
          }

          doc.save(nombreArchivo)
        } finally {
          document.body.removeChild(container)
        }
      } else {
        const Print = await import('expo-print')
        const ShareLib = await import('expo-sharing')
        // Mecanismo original (probado y funcionando): html directo en ambas
        // plataformas. Cambiarlo a { uri: archivo } rompió iOS (WKWebView) y no
        // resolvía nada: el original ya generaba fichas con muchas fotos sin
        // cerrar la app. No reintroducir el archivo temporal ni el split por SO.
        const { uri: pdfUri } = await Promise.race([
          Print.printToFileAsync({ html, width: 595 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('El PDF tardó demasiado. Intenta de nuevo o usa la versión web.')), 90000)
          ),
        ])
        const isAvailable = await ShareLib.isAvailableAsync()
        if (!isAvailable) {
          Alert.alert('Error', 'Compartir no está disponible en este dispositivo.')
          return
        }
        await ShareLib.shareAsync(pdfUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: propiedad.codigo ?? 'ficha' })
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('No se pudo generar el PDF.')
      } else {
        Alert.alert('Error', `No se pudo generar la ficha PDF.\n\n${e?.message ?? ''}`)
      }
    } finally {
      setGenerandoPDF(false)
    }
  }

  async function pedirDiseno() {
    if (!propiedad) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const hoyInicio = new Date()
    hoyInicio.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('propiedad_actividad')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('tipo', 'solicitud_diseno')
      .gte('created_at', hoyInicio.toISOString())

    if ((count ?? 0) > 0) {
      if (Platform.OS === 'web') {
        window.alert('Ya solicitaste un diseño hoy. Solo puedes pedir 1 diseño por día.')
      } else {
        Alert.alert('Límite alcanzado', 'Ya solicitaste un diseño hoy. Solo puedes pedir 1 diseño por día.')
      }
      return
    }

    setSolicitandoDiseno(true)
    await supabase.from('propiedad_actividad').insert({
      propiedad_id: propiedad.id,
      user_id: user.id,
      tipo: 'solicitud_diseno',
    })
    setSolicitandoDiseno(false)

    const nombre = nombreUsuario ?? 'Un prospectador'
    const mensaje = `Hola André, soy *${nombre}* y quisiera solicitar un diseño para la propiedad *${propiedad.codigo}* (ID: ${propiedad.id}). ¿Me puedes ayudar?`
    Linking.openURL(`https://wa.me/524428790740?text=${encodeURIComponent(mensaje)}`)
  }

  function normalizarTelMx(telRaw: string): string {
    let phone = telRaw.replace(/\D/g, '')
    if (phone.startsWith('5252')) phone = phone.slice(2)
    if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
    return phone.length === 10 ? `52${phone}` : phone
  }

  // Registra al cliente en el CRM y abre WhatsApp con el mensaje listo para
  // enviárselo a la constructora — automatiza lo que antes se redactaba a
  // mano cada vez que un cliente se interesaba en un desarrollo.
  async function registrarConConstructora() {
    if (!propiedad) return
    if (!regNombre.trim() || !regTelefono.trim() || !regCorreo.trim()) {
      Alert.alert('Faltan datos', 'Nombre, teléfono y correo son obligatorios para registrar al cliente con la constructora.')
      return
    }
    setRegistrandoConstructora(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const nombreConstructora = propiedad.nombre_constructora?.trim() ?? ''
      const { data: constructora } = nombreConstructora
        ? await supabase.from('constructoras').select('telefono_contacto').eq('nombre', nombreConstructora).maybeSingle()
        : { data: null }

      const { data: clienteCreado, error: errorCliente } = await supabase
        .from('clientes')
        .insert({
          nombre: regNombre.trim(),
          telefono: regTelefono.trim(),
          email: regCorreo.trim(),
          fuente_lead: 'constructora',
          estado: 'por_perfilar',
          notas: `Registrado con constructora "${nombreConstructora || propiedad.nombre_constructora}" — propiedad ${propiedad.codigo}: ${propiedad.titulo}`,
          responsable_id: user.id,
        })
        .select('id')
        .single()
      if (errorCliente) { Alert.alert('Error al registrar', errorCliente.message); return }

      await supabase.from('interacciones').insert({
        cliente_id: clienteCreado.id, user_id: user.id,
        tipo: 'nota', descripcion: `Cliente registrado con constructora "${nombreConstructora}".`,
      })
      await supabase.rpc('notificar_admins_nuevo_cliente', {
        p_cliente_nombre: regNombre.trim(),
        p_cliente_id: clienteCreado.id,
        p_prospectador_nombre: nombreUsuario ?? 'Un prospectador',
      })
      registrarAccion(user.id, 'agregar_cliente').catch(() => {})

      setModalConstructoraVisible(false)
      setRegNombre(''); setRegTelefono(''); setRegCorreo('')

      const telConstructora = constructora?.telefono_contacto?.trim()
      if (!telConstructora) {
        Alert.alert(
          'Cliente registrado',
          `Se guardó el cliente en el CRM, pero "${nombreConstructora}" no tiene teléfono de contacto configurado todavía. Pide a un admin que lo agregue en Constructoras para poder enviar el WhatsApp automáticamente la próxima vez.`,
        )
        return
      }
      if (!propiedad.created_by) {
        Alert.alert(
          'Cliente registrado',
          'Se guardó el cliente en el CRM, pero no se pudo identificar a qué admin avisarle (la propiedad no tiene un creador registrado). Avísale tú mismo al admin correspondiente.',
        )
        return
      }

      // El mensaje NO se manda desde el celular del prospectador — eso lo
      // enviaría desde su propio número. En vez de eso, se le avisa (campanita
      // + push) al admin que subió la propiedad, con el link de WhatsApp ya
      // armado, para que LO ENVÍE ÉL desde su número configurado.
      const mensajeWa = `Hola, quiero registrar un cliente interesado en ${propiedad.titulo} (${propiedad.codigo}):\n\nNombre: ${regNombre.trim()}\nTeléfono: ${regTelefono.trim()}\nCorreo: ${regCorreo.trim()}`
      const accionUrl = `https://wa.me/${normalizarTelMx(telConstructora)}?text=${encodeURIComponent(mensajeWa)}`
      const tituloNotif = `Enviar registro a ${nombreConstructora}`
      const mensajeNotif = `${nombreUsuario ?? 'Un prospectador'} registró a ${regNombre.trim()} para ${propiedad.titulo}. Toca para abrir WhatsApp y enviarlo.`

      await supabase.rpc('notificar_usuario', {
        p_user_id: propiedad.created_by,
        p_titulo: tituloNotif,
        p_mensaje: mensajeNotif,
        p_tipo: 'registro_constructora',
        p_propiedad_id: propiedad.id,
        p_cliente_id: clienteCreado.id,
        p_accion_url: accionUrl,
      })
      // El push lo maneja el cron procesar-pushes al detectar push_enviado=false

      Alert.alert(
        'Cliente registrado',
        `Se le avisó a ${subidoPor?.nombre ?? 'el admin de esta propiedad'} para que envíe el mensaje a ${nombreConstructora} desde su WhatsApp.`,
      )
    } finally {
      setRegistrandoConstructora(false)
    }
  }

  function agendarValera() {
    if (!propiedad) return
    const nombre = nombreUsuario ?? 'Un prospectador'
    const mensaje = `Hola, ${nombre} quiere agendar una cita para la propiedad *${propiedad.codigo}* con Valera Estudios.`
    Linking.openURL(`https://wa.me/524428251381?text=${encodeURIComponent(mensaje)}`)
  }

  async function abrirModalCita() {
    if (!propiedad) return
    setBusquedaCliente('')
    setMostrarFormNuevo(false)
    setNuevoNombre('')
    setNuevoTelefono('')
    setModalCitaVisible(true)
    setLoadingClientes(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, estado, tipo_operacion, nivel_interes, email, tipo_credito, presupuesto, zona_busqueda, num_personas, tiene_mascotas, detalle_mascotas, fecha_mudanza, problemas_poliza')
      .eq('responsable_id', user?.id)
      .order('nombre', { ascending: true })
    setClientesCRM(data ?? [])
    setLoadingClientes(false)
  }

  function seleccionarClienteYCoordinar(cliente: ClienteCRM) {
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    manana.setHours(10, 0, 0, 0)
    setClienteParaCita(cliente)
    setFechaCita(manana)
    setPasoCita('fecha')
  }

  async function guardarNuevoClienteYCoordinar() {
    if (!nuevoNombre.trim()) {
      if (Platform.OS === 'web') window.alert('El nombre es requerido')
      else Alert.alert('Error', 'El nombre es requerido')
      return
    }
    if (!nuevoTelefono.trim()) {
      if (Platform.OS === 'web') window.alert('El teléfono es requerido')
      else Alert.alert('Error', 'El teléfono es requerido')
      return
    }
    setGuardandoCliente(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: nuevoNombre.trim(),
        telefono: nuevoTelefono.trim(),
        fuente_lead: 'otro',
        estado: 'cita_por_agendar',
        responsable_id: user?.id,
      })
      .select('id, nombre, telefono, estado')
      .single()
    setGuardandoCliente(false)
    if (!error && data) {
      seleccionarClienteYCoordinar(data)
    } else {
      if (Platform.OS === 'web') window.alert('No se pudo guardar el cliente')
      else Alert.alert('Error', 'No se pudo guardar el cliente')
    }
  }

  async function confirmarCitaConFecha() {
    if (!propiedad || !clienteParaCita) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('clientes')
      .update({
        estado: 'cita_agendada',
        proximo_contacto: fechaCita.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', clienteParaCita.id)

    const recordatorioFecha = new Date(fechaCita.getTime() - 60 * 60 * 1000)
    const horaStr = fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    await supabase.from('recordatorios').insert({
      cliente_id: clienteParaCita.id,
      user_id: user.id,
      titulo: `Confirmar cita con ${clienteParaCita.nombre}`,
      descripcion: `Cita para ${propiedad.codigo} a las ${horaStr}. ¿Ya la confirmaste?`,
      fecha_hora: recordatorioFecha.toISOString(),
    })

    await supabase.from('citas_coordinacion').insert({
      cliente_id: clienteParaCita.id,
      prospectador_id: user.id,
      propiedad_id: propiedad.id,
      estado: 'coordinada',
      fecha_cita: fechaCita.toISOString(),
    })

    cerrarModalCita()

    const fechaStr = fechaCita.toLocaleString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    const constructoraStr = propiedad.es_constructora && propiedad.nombre_constructora
      ? ` (${propiedad.nombre_constructora})`
      : ''
    const infoCliente = construirInfoCliente(clienteParaCita)
    const mensaje = `Hola, quiero coordinar una cita para *${clienteParaCita.nombre}* (${clienteParaCita.telefono}) para la propiedad *${propiedad.codigo}*${constructoraStr} el *${fechaStr}*.${infoCliente}`
    if (subidoPor?.telefono) {
      let phone = subidoPor.telefono.replace(/\D/g, '')
      if (phone.startsWith('5252')) phone = phone.slice(2)
      if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
      const tel = phone.length === 10 ? `52${phone}` : phone
      Linking.openURL(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`)
    } else {
      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(mensaje)}`)
    }
  }


  async function descargarImagenes(seleccion?: { url: string }[]) {
    if (!propiedad) return
    // "Descargar todas": pedir la lista completa (el cache puede tener solo la
    // portada sembrada desde el listado — bajaba 1 sola foto).
    const imagenes = seleccion ?? await obtenerImagenesCompletas()
    if (imagenes.length === 0) return

    setDescargando(true)
    registrarActividad('descarga')

    if (Platform.OS === 'web') {
      try {
        // Descargas individuales, cada archivo nombrado con el ID de la casa
        // (VAL-123-foto-1.jpg…). El navegador pide permiso para descargas
        // múltiples la primera vez — avisar para que el usuario lo acepte,
        // si no solo le llega la primera foto.
        const idCasa = (propiedad.codigo ?? propiedad.id).replace(/[^a-zA-Z0-9._-]/g, '_')
        if (imagenes.length > 1) {
          window.alert(`Se descargarán ${imagenes.length} fotos. Si tu navegador pregunta "¿Descargar varios archivos?", dale PERMITIR — de lo contrario solo llegará la primera.`)
        }
        for (let i = 0; i < imagenes.length; i++) {
          try {
            const resp = await fetch(imagenes[i].url)
            const blob = await resp.blob()
            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = `${idCasa}-foto-${i + 1}.jpg`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // Defer revoke — el navegador necesita tiempo para leer el blob antes de que se libere
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
          } catch {
            // CORS bloqueó fetch — abrir directamente la URL
            const a = document.createElement('a')
            a.href = imagenes[i].url
            a.download = `${idCasa}-foto-${i + 1}.jpg`
            a.target = '_blank'
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }
          // Pausa entre descargas para que el navegador no bloquee las múltiples descargas
          if (i < imagenes.length - 1) {
            await new Promise<void>(r => setTimeout(r, 500))
          }
        }
      } finally {
        setDescargando(false)
      }
    } else {
      // Pedir permiso completo (no writeOnly) para mayor compatibilidad en iOS
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permiso requerido',
          'Ve a Configuración → Valera → Fotos y selecciona "Todas las fotos" para guardar imágenes.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configuración', onPress: () => Linking.openSettings() },
          ]
        )
        setDescargando(false)
        return
      }

      let guardadas = 0
      const errores: string[] = []
      for (let i = 0; i < imagenes.length; i++) {
        try {
          const url = imagenes[i].url
          const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg'
          const extValida = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg'
          // cacheDirectory (no documentDirectory): es un archivo temporal, ya
          // una vez copiado a la galería no debe quedarse ocupando espacio
          // permanente de la app — antes se acumulaban para siempre y con
          // varias propiedades publicadas llenaban el almacenamiento del
          // teléfono hasta dejarlo sin memoria.
          const dest = `${FileSystem.cacheDirectory}${propiedad.codigo ?? 'prop'}-${i + 1}-${Date.now()}.${extValida}`
          const { uri, status: dlStatus } = await FileSystem.downloadAsync(url, dest)
          if (dlStatus !== 200) { errores.push(`img${i + 1}: HTTP ${dlStatus}`); continue }
          await MediaLibrary.createAssetAsync(uri)
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
          guardadas++
        } catch (e: any) {
          errores.push(`img${i + 1}: ${e?.message ?? e}`)
        }
      }
      setDescargando(false)
      Alert.alert(
        guardadas > 0 ? 'Listo' : 'Error',
        guardadas > 0
          ? `${guardadas} de ${imagenes.length} imágenes guardadas en tu galería.`
          : `No se pudo guardar ninguna imagen.\n\nError: ${errores[0] ?? 'desconocido'}`
      )
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  if (!propiedad) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudo cargar la propiedad.</Text>
      </View>
    )
  }

  const imagenes = [...(propiedad.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)

  function irAImagen(index: number) {
    setImagenActual(index)
    scrollRef.current?.scrollToOffset({ offset: index * SCREEN_WIDTH, animated: true })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
      <OfflineBanner />
      {/* Galería de imágenes */}
      {imagenes.length > 0 ? (
        <View>
          <View style={{ position: 'relative' }}>
            <FlatList
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={imagenes}
              keyExtractor={(_, i) => String(i)}
              initialNumToRender={1}
              maxToRenderPerBatch={2}
              windowSize={3}
              getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                if (index !== imagenActual) setImagenActual(index)
              }}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                setImagenActual(index)
              }}
              renderItem={({ item: img, index: i }) => (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => { setLightboxIndex(i); setLightboxVisible(true) }}
                >
                  <Image
                    source={{ uri: thumbFallidas.has(img.url) ? img.url : thumb(img.url, { width: Math.round(SCREEN_WIDTH * 2), quality: 72 }) }}
                    recyclingKey={img.url}
                    style={[styles.imagen, { width: SCREEN_WIDTH, height: heroH }]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    priority={i === 0 ? 'high' : 'normal'}
                    transition={120}
                    onError={() => setThumbFallidas(prev => prev.has(img.url) ? prev : new Set(prev).add(img.url))}
                  />
                </TouchableOpacity>
              )}
            />

            {/* Flechas para navegar el carrusel (en web no se puede deslizar
                con el mouse; sin esto solo se ve la primera foto). */}
            {Platform.OS === 'web' && imagenes.length > 1 && imagenActual > 0 && (
              <TouchableOpacity style={[styles.galFlecha, { left: 12 }]} onPress={() => irAImagen(imagenActual - 1)}>
                <Text style={styles.galFlechaTxt}>‹</Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'web' && imagenes.length > 1 && imagenActual < imagenes.length - 1 && (
              <TouchableOpacity style={[styles.galFlecha, { right: 12 }]} onPress={() => irAImagen(imagenActual + 1)}>
                <Text style={styles.galFlechaTxt}>›</Text>
              </TouchableOpacity>
            )}
            {imagenes.length > 1 && (
              <View style={styles.galContador}>
                <Text style={styles.galContadorTxt}>{imagenActual + 1} / {imagenes.length}</Text>
              </View>
            )}
          </View>

          {/* Puntos solo cuando son pocos; con muchas fotos el contador basta. */}
          {imagenes.length > 1 && imagenes.length <= 12 && (
            <View style={styles.paginador}>
              {imagenes.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => irAImagen(i)}>
                  <View style={[styles.punto, i === imagenActual && styles.puntoActivo]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : isFetching ? (
        // Caché sembrada sin fotos todavía + refetch en curso: mostrar carga,
        // no "Sin imágenes" (evita el falso "sin fotos" en redes lentas).
        <View style={[styles.sinImagen, { width: SCREEN_WIDTH, height: heroH }]}>
          <ActivityIndicator size="large" color="#1a6470" />
        </View>
      ) : (
        <View style={[styles.sinImagen, { width: SCREEN_WIDTH }]}>
          <Text style={styles.sinImagenText}>Sin imágenes</Text>
        </View>
      )}

      {/* Contenido */}
      <View style={styles.content}>
        {/* Logo de la inmobiliaria — solo staff */}
        {esStaff && propiedad.inmobiliarias?.logo_url && (
          <View style={styles.inmobiliariaLogoWrapper}>
            <Image source={{ uri: propiedad.inmobiliarias.logo_url }} style={styles.inmobiliariaLogo} contentFit="contain" cachePolicy="memory-disk" />
            {propiedad.inmobiliarias.nombre && (
              <Text style={styles.inmobiliariaNombre}>{propiedad.inmobiliarias.nombre}</Text>
            )}
          </View>
        )}

        {/* Badges */}
        <View style={styles.badgeRow}>
          <Text style={styles.codigoBadge}>{propiedad.codigo ?? '—'}</Text>
          {propiedad.tipo && (
            <Text style={styles.tipoBadge}>{capitalize(propiedad.tipo)}</Text>
          )}
          {propiedad.operacion && (
            <Text style={styles.operacionBadge}>{capitalize(propiedad.operacion)}</Text>
          )}
          {propiedad.estado && (
            <Text style={[
              styles.estadoBadge,
              propiedad.estado === 'vendida' && styles.estadoVendida,
            ]}>
              {capitalize(propiedad.estado)}
            </Text>
          )}
          {propiedad.es_constructora && (
            <Text style={styles.constructoraBadge}>
              🏗 {propiedad.nombre_constructora ?? 'Constructora'}
            </Text>
          )}
          {esStaff ? (() => {
            // Staff ve: asesor — empresa (o solo uno si falta el otro)
            const asesorNombre = propiedad.asesores?.nombre?.trim() || null
            const empresa = propiedad.inmobiliarias?.nombre?.trim() || propiedad.asesores?.inmobiliaria?.trim() || null
            const etiqueta = asesorNombre && empresa
              ? `${asesorNombre} — ${empresa}`
              : (asesorNombre ?? empresa ?? subidoPor?.nombre ?? null)
            return etiqueta ? <Text style={styles.asesorBadge}>👤 {etiqueta}</Text> : null
          })() : (
            // Prospectadores solo ven quien la subió
            subidoPor ? <Text style={styles.asesorBadge}>👤 {subidoPor.nombre}</Text> : null
          )}
        </View>

        {/* Título y precio */}
        <Text style={styles.titulo}>{propiedad.titulo}</Text>
        <Text style={styles.precio}>{formatPrecio(propiedad.precio)}</Text>
        <Text style={styles.direccion}>{propiedad.direccion}</Text>
        {publicadaHace((propiedad as any).created_at) && (
          <Text style={styles.publicadaHace}>🗓️ Publicada {publicadaHace((propiedad as any).created_at)}</Text>
        )}

        {/* Contactar asesor */}
        <View style={styles.accionesRapidas}>
          {subidoPor?.telefono && (
            <>
              <TouchableOpacity
                style={[styles.accionBtn, { backgroundColor: '#25d366' }]}
                onPress={() => {
                  let phone = subidoPor.telefono!.replace(/\D/g, '')
                  if (phone.startsWith('5252')) phone = phone.slice(2)
                  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
                  const tel = phone.length === 10 ? `52${phone}` : phone
                  const url = `https://wa.me/${tel}?text=${encodeURIComponent(`Hola, te contacto sobre la propiedad ${propiedad.codigo}: ${propiedad.titulo}`)}`
                  if (Platform.OS === 'web') window.open(url, '_blank')
                  else Linking.openURL(url)
                }}
              >
                <Text style={styles.accionBtnText}>📱 WhatsApp asesor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accionBtn, { backgroundColor: '#1a6470' }]}
                onPress={() => Linking.openURL(`tel:${subidoPor.telefono}`)}
              >
                <Text style={styles.accionBtnText}>📞 Llamar</Text>
              </TouchableOpacity>
            </>
          )}
          {propiedad.es_constructora && (
            <TouchableOpacity
              style={[styles.accionBtn, { backgroundColor: '#c9a84c' }]}
              onPress={() => setModalConstructoraVisible(true)}
            >
              <Text style={styles.accionBtnText}>🏗 Registrar con constructora</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Características */}
        {(propiedad.recamaras != null || propiedad.banos != null || propiedad.medios_banos != null || propiedad.m2 != null || propiedad.m2_terreno != null || propiedad.estacionamientos != null) && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Características</Text>
            <View style={styles.caracteristicasGrid}>
              {propiedad.recamaras != null && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.recamaras}</Text>
                  <Text style={styles.carLabel}>Recámaras</Text>
                </View>
              )}
              {propiedad.banos != null && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.banos}</Text>
                  <Text style={styles.carLabel}>Baño{propiedad.banos === 1 ? '' : 's'} completo{propiedad.banos === 1 ? '' : 's'}</Text>
                </View>
              )}
              {propiedad.medios_banos != null && propiedad.medios_banos > 0 && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.medios_banos}</Text>
                  <Text style={styles.carLabel}>Medio{propiedad.medios_banos === 1 ? '' : 's'} baño{propiedad.medios_banos === 1 ? '' : 's'}</Text>
                </View>
              )}
              {propiedad.m2 != null && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.m2}</Text>
                  <Text style={styles.carLabel}>m² construcción</Text>
                </View>
              )}
              {propiedad.m2_terreno != null && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.m2_terreno}</Text>
                  <Text style={styles.carLabel}>m² terreno</Text>
                </View>
              )}
              {propiedad.estacionamientos != null && (
                <View style={styles.caracteristica}>
                  <Text style={styles.carValor}>{propiedad.estacionamientos}</Text>
                  <Text style={styles.carLabel}>Estacionamientos</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Descripción */}
        {propiedad.descripcion ? (
          <View style={styles.seccion}>
            <View style={styles.seccionHeader}>
              <Text style={styles.seccionTitulo}>Descripción</Text>
              <TouchableOpacity
                style={[styles.copiarBtn, descripcionCopiada && styles.copiarBtnActivo]}
                onPress={copiarDescripcion}
              >
                <Text style={[styles.copiarBtnText, descripcionCopiada && styles.copiarBtnTextActivo]}>
                  {descripcionCopiada ? '✓ Copiado' : '📋 Copiar'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.descripcion}>{propiedad.descripcion}</Text>
          </View>
        ) : null}

        {/* Ubicación — mapa interactivo (acercar/alejar/mover) + abrir en Google Maps */}
        {propiedad.lat != null && propiedad.lng != null && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Ubicación</Text>
            <View style={styles.mapaWrapper}>
              <PropMapa key={propiedad.id} lat={propiedad.lat} lng={propiedad.lng} titulo={propiedad.titulo} height={340} />
              <TouchableOpacity
                style={styles.mapaOverlayBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const url = `https://www.google.com/maps/search/?api=1&query=${propiedad.lat},${propiedad.lng}`
                  if (Platform.OS === 'web') window.open(url, '_blank')
                  else Linking.openURL(url)
                }}
              >
                <Text style={styles.mapaOverlayBtnText}>🗺️ Abrir en Maps</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.mapaDireccion}>📍 {propiedad.direccion}</Text>
          </View>
        )}

        {/* Quiénes la publicaron — solo admin/supervisor */}
        {esStaff && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Quiénes la publicaron</Text>
            {(publicadores?.length ?? 0) === 0 ? (
              <Text style={styles.publicadoresVacio}>Nadie la ha publicado aún.</Text>
            ) : (
              <View style={styles.publicadoresLista}>
                {publicadores!.map((p) => (
                  <View key={p.user_id} style={styles.publicadorRow}>
                    <Text style={styles.publicadorNombre} numberOfLines={1}>👤 {p.nombre}</Text>
                    <Text style={styles.publicadorVeces}>×{p.veces} {p.veces === 1 ? 'vez' : 'veces'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Mis notas privadas */}
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Mis notas privadas</Text>
          <TextInput
            style={styles.notaInput}
            placeholder="Escribe tus notas sobre esta propiedad... (solo tú las ves)"
            value={nota}
            onChangeText={setNota}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {nota !== notaGuardada && (
            <TouchableOpacity
              style={[styles.notaGuardarBtn, guardandoNota && styles.btnDisabled]}
              onPress={guardarNota}
              disabled={guardandoNota}
            >
              {guardandoNota
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.notaGuardarText}>Guardar nota</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Estado de publicación */}
        <View style={styles.seccion}>
          <View style={styles.seccionHeader}>
            <Text style={styles.seccionTitulo}>Estado de publicación</Text>
            <Text style={[styles.pubContador, vecesPublicada >= 10 && styles.pubContadorLimite]}>
              {vecesPublicada}/10
            </Text>
          </View>
          <View style={styles.pubRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pubEstado}>
                {vecesPublicada >= 10 ? '🚫 Límite alcanzado' : vecesPublicada > 0 ? '✅ Publicada' : '⏳ Pendiente de publicar'}
              </Text>
              {vecesPublicada > 0 && fechaPublicacion && (
                <Text style={styles.pubFecha}>
                  Última vez: {new Date(fechaPublicacion).toLocaleDateString('es-MX', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </Text>
              )}
              {vecesPublicada > 0 && vecesPublicada < 10 && (
                <Text style={styles.pubFecha}>Te quedan {10 - vecesPublicada} publicaciones</Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.pubBtn,
                vecesPublicada > 0 ? styles.pubBtnActiva : styles.pubBtnPendiente,
                (togglingPublicacion || vecesPublicada >= 10) && styles.btnDisabled,
              ]}
              onPress={togglePublicacion}
              disabled={togglingPublicacion || vecesPublicada >= 10}
            >
              {togglingPublicacion
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.pubBtnText}>
                    {vecesPublicada === 0 ? 'Publicar' : vecesPublicada >= 10 ? '10/10 ✅' : `${vecesPublicada}/10`}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Deshacer publicación (solo para clicks por error) */}
          {vecesPublicada > 0 && (
            <View style={styles.deshacerRow}>
              <Text style={styles.deshacerHint}>¿Le diste click a "Publicar" por error?</Text>
              <TouchableOpacity
                style={[styles.deshacerBtn, deshaciendoPub && styles.btnDisabled]}
                onPress={deshacerPublicacion}
                disabled={deshaciendoPub}
              >
                {deshaciendoPub
                  ? <ActivityIndicator color="#c0392b" size="small" />
                  : <Text style={styles.deshacerBtnText}>↩️ Deshacer última publicación</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Botones descargar imágenes */}
        {imagenes.length > 0 && (
          <View style={styles.descargarRow}>
            {/* Descargar todas directamente */}
            <TouchableOpacity
              style={[styles.descargarBtn, styles.descargarBtnTodas, descargando && styles.btnDisabled]}
              onPress={() => descargarImagenes()}
              disabled={descargando}
            >
              {descargando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.descargarText}>
                  {Platform.OS === 'web' ? '⬇ Todas' : '⬇ Guardar todas'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Elegir cuáles descargar */}
            <TouchableOpacity
              style={[styles.descargarBtn, styles.descargarBtnElegir, descargando && styles.btnDisabled]}
              onPress={() => {
                setSeleccionadas(new Set())
                setModalSeleccion(true)
                // Completar las fotos en segundo plano por si el cache solo
                // tiene la portada (el sync actualiza el grid del modal).
                obtenerImagenesCompletas().catch(() => {})
              }}
              disabled={descargando}
            >
              <Text style={styles.descargarText}>☑ Elegir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Botón generar ficha PDF */}
        <TouchableOpacity
          style={[styles.btnPDF, generandoPDF && styles.btnDisabled]}
          onPress={generarFichaPDF}
          disabled={generandoPDF}
        >
          {generandoPDF
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.btnPDFText}>📄 Generar ficha PDF</Text>
          }
        </TouchableOpacity>

        {/* Botón coordinar cita */}
        <TouchableOpacity
          style={[styles.btnCita, !propiedad && styles.btnDisabled]}
          onPress={abrirModalCita}
          disabled={!propiedad}
        >
          <Text style={styles.btnCitaText}>
            📅 Coordinar cita{subidoPor ? ` con ${subidoPor.nombre}` : ''}
          </Text>
        </TouchableOpacity>

        {/* Botón solicitar diseño con André */}
        <TouchableOpacity
          style={[styles.btnDiseno, (!propiedad || solicitandoDiseno) && styles.btnDisabled]}
          onPress={pedirDiseno}
          disabled={!propiedad || solicitandoDiseno}
        >
          {solicitandoDiseno
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.btnDisenoText}>🎨 Solicitar diseño con André</Text>
          }
        </TouchableOpacity>
        <Text style={styles.btnDisenoHint}>Puedes solicitar 1 diseño por día</Text>

        {/* Botón agendar con Valera */}
        <TouchableOpacity
          style={[styles.btnValera, !propiedad && styles.btnDisabled]}
          onPress={agendarValera}
          disabled={!propiedad}
        >
          <Text style={styles.btnValeraText}>📣 Impulsar la promoción de la propiedad mediante una campaña</Text>
        </TouchableOpacity>


        {/* ── Opciones similares (misma zona, precio y características) ── */}
        {similares && similares.length > 0 && (
          <View style={styles.similaresSection}>
            <Text style={styles.similaresTitulo}>Opciones similares</Text>
            <Text style={styles.similaresSub}>En la misma zona y rango de precio</Text>
            <View style={{ position: 'relative' }}>
              <ScrollView
                ref={similaresRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => { similaresX.current = e.nativeEvent.contentOffset.x }}
                contentContainerStyle={{ gap: 10, paddingRight: 12 }}
              >
                {similares.map(sp => (
                  <TouchableOpacity
                    key={sp.id}
                    style={styles.simCard}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${sp.id}` as any)}
                  >
                    {sp.imagen
                      ? <Image source={{ uri: thumb(sp.imagen) }} style={styles.simImg} contentFit="cover" cachePolicy="memory-disk" />
                      : <View style={[styles.simImg, styles.simImgPlaceholder]}><Text style={{ fontSize: 26 }}>🏠</Text></View>
                    }
                    <View style={styles.simInfo}>
                      <Text style={styles.simTitulo} numberOfLines={2}>{sp.titulo}</Text>
                      <Text style={styles.simPrecio}>{formatPrecio(sp.precio)}</Text>
                      <Text style={styles.simSpecs} numberOfLines={1}>
                        {[
                          sp.recamaras != null ? `${sp.recamaras} rec` : null,
                          sp.banos != null ? `${sp.banos} baños` : null,
                          sp.m2 != null ? `${sp.m2} m²` : null,
                        ].filter(Boolean).join('  ·  ') || (sp.tipo ? capitalize(sp.tipo) : '')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {Platform.OS === 'web' && similares.length > 2 && (
                <>
                  <TouchableOpacity
                    style={[styles.simArrow, { left: 2 }]}
                    onPress={() => similaresRef.current?.scrollTo({ x: Math.max(0, similaresX.current - 600), animated: true })}
                  >
                    <Text style={styles.simArrowTxt}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.simArrow, { right: 2 }]}
                    onPress={() => similaresRef.current?.scrollTo({ x: similaresX.current + 600, animated: true })}
                  >
                    <Text style={styles.simArrowTxt}>›</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* Botón volver */}
        <TouchableOpacity
          style={styles.volverBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace('/(prospectador)/propiedades')
            }
          }}
        >
          <Text style={styles.volverText}>← Volver a propiedades</Text>
        </TouchableOpacity>
      </View>

      {/* ── Lightbox de imágenes ── */}
      <Modal
        visible={lightboxVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.lbOverlay}>
          {/* Cerrar */}
          <TouchableOpacity style={styles.lbClose} onPress={() => setLightboxVisible(false)}>
            <Text style={styles.lbCloseTxt}>✕</Text>
          </TouchableOpacity>

          {/* Contador */}
          {imagenes.length > 1 && (
            <Text style={styles.lbCounter}>{lightboxIndex + 1} / {imagenes.length}</Text>
          )}

          {/* Imagen principal — click fuera cierra */}
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setLightboxVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72, justifyContent: 'center', alignItems: 'center' }}>
                {lightboxLoading && (
                  <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" style={{ position: 'absolute', zIndex: 1 }} />
                )}
                <Image
                  source={{ uri: imagenes[lightboxIndex]?.url }}
                  style={{ position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  onLoad={() => setLightboxLoading(false)}
                />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Flechas */}
          {imagenes.length > 1 && lightboxIndex > 0 && (
            <TouchableOpacity style={[styles.lbArrow, styles.lbArrowLeft]} onPress={() => setLightboxIndex(i => i - 1)}>
              <Text style={styles.lbArrowTxt}>‹</Text>
            </TouchableOpacity>
          )}
          {imagenes.length > 1 && lightboxIndex < imagenes.length - 1 && (
            <TouchableOpacity style={[styles.lbArrow, styles.lbArrowRight]} onPress={() => setLightboxIndex(i => i + 1)}>
              <Text style={styles.lbArrowTxt}>›</Text>
            </TouchableOpacity>
          )}

          {/* Miniaturas */}
          {imagenes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.lbThumbs}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}
            >
              {imagenes.map((img, i) => (
                <TouchableOpacity key={i} onPress={() => setLightboxIndex(i)}>
                  <ThumbImage
                    url={img.url}
                    opts={{ width: 160, quality: 55 }}
                    style={[styles.lbThumb, i === lightboxIndex && styles.lbThumbActive]}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Modal selección de fotos a descargar */}
      <Modal
        visible={modalSeleccion}
        animationType="slide"
        transparent
        onRequestClose={() => setModalSeleccion(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSeleccionCard, { maxHeight: SCREEN_HEIGHT * 0.85 }]}>
            <View style={styles.modalSeleccionHeader}>
              <Text style={styles.modalSeleccionTitle}>Selecciona las fotos</Text>
              <Text style={styles.modalSeleccionSub}>{seleccionadas.size} de {imagenes.length} seleccionadas</Text>
            </View>

            <TouchableOpacity
              style={styles.seleccionarTodasBtn}
              onPress={() => {
                if (seleccionadas.size === imagenes.length) setSeleccionadas(new Set())
                else setSeleccionadas(new Set(imagenes.map((_, i) => i)))
              }}
            >
              <Text style={styles.seleccionarTodasText}>
                {seleccionadas.size === imagenes.length ? 'Quitar todas' : 'Seleccionar todas'}
              </Text>
            </TouchableOpacity>

            <FlatList
              data={imagenes}
              keyExtractor={(_, i) => String(i)}
              numColumns={3}
              contentContainerStyle={{ padding: 8 }}
              renderItem={({ item, index }) => {
                const elegida = seleccionadas.has(index)
                return (
                  <TouchableOpacity
                    style={styles.miniaturaSeleccion}
                    onPress={() => {
                      setSeleccionadas(prev => {
                        const next = new Set(prev)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }}
                  >
                    <ThumbImage url={item.url} opts={{ width: 200, quality: 55 }} style={styles.miniaturaSeleccionImg} />
                    <View style={[styles.miniaturaCheck, elegida && styles.miniaturaCheckActivo]}>
                      {elegida && <Text style={styles.miniaturaCheckText}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />

            <View style={styles.modalSeleccionFooter}>
              <TouchableOpacity style={styles.modalSeleccionCancelar} onPress={() => setModalSeleccion(false)}>
                <Text style={styles.modalSeleccionCancelarText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSeleccionDescargar, seleccionadas.size === 0 && styles.btnDisabled]}
                disabled={seleccionadas.size === 0}
                onPress={() => {
                  const elegidas = imagenes.filter((_, i) => seleccionadas.has(i))
                  setModalSeleccion(false)
                  descargarImagenes(elegidas)
                }}
              >
                <Text style={styles.modalSeleccionDescargarText}>
                  {Platform.OS === 'web' ? `Descargar (${seleccionadas.size})` : `Guardar en galería (${seleccionadas.size})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal selección de cliente / fecha de cita */}
      <Modal
        visible={modalCitaVisible}
        animationType="slide"
        transparent
        onRequestClose={cerrarModalCita}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>
                {pasoCita === 'seleccion' ? 'Seleccionar cliente' : '¿Cuándo es la cita?'}
              </Text>
              <TouchableOpacity onPress={cerrarModalCita}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>

            {pasoCita === 'seleccion' && (
              <>
                <TextInput
                  style={styles.modalBusqueda}
                  placeholder="Buscar por nombre o teléfono..."
                  value={busquedaCliente}
                  onChangeText={setBusquedaCliente}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {loadingClientes ? (
                  <ActivityIndicator color="#1a6470" style={{ marginVertical: 24 }} />
                ) : (
                  <FlatList
                    data={clientesCRM.filter((c) => {
                      const q = busquedaCliente.trim().toLowerCase()
                      if (!q) return true
                      return c.nombre.toLowerCase().includes(q) || c.telefono.includes(q)
                    })}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 320 }}
                    ListEmptyComponent={
                      <Text style={styles.modalVacio}>
                        {busquedaCliente.trim() ? 'Sin resultados.' : 'No hay clientes en el CRM.'}
                      </Text>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.clienteRow}
                        onPress={() => seleccionarClienteYCoordinar(item)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.clienteNombre}>{item.nombre}</Text>
                          <Text style={styles.clienteTelefono}>{item.telefono}</Text>
                        </View>
                        <Text style={styles.clienteEstado}>
                          {ESTADOS_LABEL[item.estado] ?? item.estado}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}

                {/* Formulario nuevo cliente */}
                {mostrarFormNuevo ? (
                  <View style={styles.formNuevo}>
                    <Text style={styles.formNuevoTitulo}>Nuevo cliente</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Nombre *"
                      value={nuevoNombre}
                      onChangeText={setNuevoNombre}
                      autoCapitalize="words"
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Teléfono *"
                      value={nuevoTelefono}
                      onChangeText={setNuevoTelefono}
                      keyboardType="phone-pad"
                    />
                    <View style={styles.formNuevoBtns}>
                      <TouchableOpacity
                        style={styles.formBtnCancelar}
                        onPress={() => setMostrarFormNuevo(false)}
                      >
                        <Text style={styles.formBtnCancelarText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.formBtnGuardar, guardandoCliente && styles.btnDisabled]}
                        onPress={guardarNuevoClienteYCoordinar}
                        disabled={guardandoCliente}
                      >
                        {guardandoCliente
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.formBtnGuardarText}>Guardar y agendar</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.btnNuevoCliente}
                    onPress={() => setMostrarFormNuevo(true)}
                  >
                    <Text style={styles.btnNuevoClienteText}>+ Agregar nuevo cliente</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {pasoCita === 'fecha' && clienteParaCita && (
              <View style={styles.pickerFechaContainer}>
                <Text style={styles.pickerSubtitulo}>{clienteParaCita.nombre}</Text>

                <View style={styles.pickerRow}>
                  <TouchableOpacity
                    style={styles.pickerArrow}
                    onPress={() => {
                      const d = new Date(fechaCita)
                      d.setDate(d.getDate() - 1)
                      setFechaCita(d)
                    }}
                  >
                    <Text style={styles.pickerArrowText}>◀</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerValor}>
                    {fechaCita.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.pickerArrow}
                    onPress={() => {
                      const d = new Date(fechaCita)
                      d.setDate(d.getDate() + 1)
                      setFechaCita(d)
                    }}
                  >
                    <Text style={styles.pickerArrowText}>▶</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.pickerRow}>
                  <TouchableOpacity
                    style={styles.pickerArrow}
                    onPress={() => {
                      const d = new Date(fechaCita)
                      d.setMinutes(d.getMinutes() - 30)
                      setFechaCita(d)
                    }}
                  >
                    <Text style={styles.pickerArrowText}>◀</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerValor}>
                    {fechaCita.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <TouchableOpacity
                    style={styles.pickerArrow}
                    onPress={() => {
                      const d = new Date(fechaCita)
                      d.setMinutes(d.getMinutes() + 30)
                      setFechaCita(d)
                    }}
                  >
                    <Text style={styles.pickerArrowText}>▶</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.pickerHint}>
                  Recibirás un recordatorio 1 hora antes de la cita.
                </Text>

                <TouchableOpacity style={styles.btnConfirmarCita} onPress={confirmarCitaConFecha}>
                  <Text style={styles.btnConfirmarCitaText}>Coordinar por WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnVolverPaso} onPress={() => setPasoCita('seleccion')}>
                  <Text style={styles.btnVolverPasoText}>← Cambiar cliente</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Registrar con constructora */}
      <Modal visible={modalConstructoraVisible} transparent animationType="slide" onRequestClose={() => setModalConstructoraVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Registrar con constructora</Text>
              <TouchableOpacity onPress={() => setModalConstructoraVisible(false)}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.pickerHint, { marginBottom: 12 }]}>
              Estos datos se guardan en el CRM y se preparan en un mensaje de WhatsApp listo para enviárselo a {propiedad?.nombre_constructora ?? 'la constructora'}.
            </Text>

            <TextInput
              style={styles.formInput}
              placeholder="Nombre del cliente *"
              value={regNombre}
              onChangeText={setRegNombre}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.formInput}
              placeholder="Teléfono del cliente *"
              value={regTelefono}
              onChangeText={setRegTelefono}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.formInput}
              placeholder="Correo del cliente *"
              value={regCorreo}
              onChangeText={setRegCorreo}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.btnConfirmarCita, registrandoConstructora && { opacity: 0.6 }]}
              onPress={registrarConConstructora}
              disabled={registrandoConstructora}
            >
              {registrandoConstructora
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnConfirmarCitaText}>Registrar y abrir WhatsApp</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnVolverPaso} onPress={() => setModalConstructoraVisible(false)}>
              <Text style={styles.btnVolverPasoText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#aaa', fontSize: 15 },

  // El alto real se pasa inline (heroH). El fondo claro hace que las barras de
  // una foto vertical se fundan en vez de verse como un marco gris oscuro.
  imagen: { height: 340, backgroundColor: '#eef2f3' },

  // Opciones similares
  similaresSection: { marginTop: 26, marginBottom: 6 },
  similaresTitulo: { fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  similaresSub: { fontSize: 12, color: '#8aa0ab', marginBottom: 12 },
  simCard: {
    width: 190, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e8eef0', overflow: 'hidden',
  },
  simImg: { width: 190, height: 120 },
  simImgPlaceholder: { backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center' },
  simInfo: { padding: 10 },
  simTitulo: { fontSize: 12, fontWeight: '700', color: '#1a1a2e', marginBottom: 4, minHeight: 32 },
  simPrecio: { fontSize: 14, fontWeight: '800', color: '#1a6470', marginBottom: 3 },
  simSpecs: { fontSize: 11, color: '#8aa0ab' },
  simArrow: {
    position: 'absolute', top: 42,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
    // @ts-ignore — cursor solo aplica en web
    cursor: 'pointer',
  },
  simArrowTxt: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26, marginTop: -2 },
  sinImagen: {
    height: 180,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinImagenText: { color: '#aaa', fontSize: 14 },

  galFlecha: {
    position: 'absolute', top: 150,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
    // @ts-ignore — cursor solo aplica en web
    cursor: 'pointer',
  },
  galFlechaTxt: { color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 30, marginTop: -3 },
  galContador: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4, zIndex: 5,
  },
  galContadorTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  paginador: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#1a6470',
  },
  punto: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  puntoActivo: {
    backgroundColor: '#fff',
    width: 9,
    height: 9,
  },

  content: { padding: 20 },

  inmobiliariaLogoWrapper: { alignItems: 'center', marginBottom: 14 },
  inmobiliariaLogo: { width: 180, height: 70 },
  inmobiliariaNombre: { fontSize: 13, color: '#888', fontWeight: '600', marginTop: 4 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  codigoBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#1a6470',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tipoBadge: {
    fontSize: 12,
    color: '#555',
    backgroundColor: '#e8e8e8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  operacionBadge: {
    fontSize: 12,
    color: '#1a6b3a',
    backgroundColor: '#d4f0e0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600',
  },
  estadoBadge: {
    fontSize: 12,
    color: '#1a6470',
    backgroundColor: '#d4e8f5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600',
  },
  estadoVendida: {
    color: '#8b2a2a',
    backgroundColor: '#f5d4d4',
  },

  titulo: { fontSize: 22, fontWeight: '800', color: '#1a6470', marginBottom: 6 },
  precio: { fontSize: 20, fontWeight: '700', color: '#1a6470', marginBottom: 6 },
  direccion: { fontSize: 14, color: '#888', marginBottom: 4 },
  publicadaHace: { fontSize: 12.5, color: '#9aa5ab', marginBottom: 20 },

  seccion: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  seccionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copiarBtn: {
    borderWidth: 1,
    borderColor: '#1a6470',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  copiarBtnActivo: {
    backgroundColor: '#1a6470',
    borderColor: '#1a6470',
  },
  copiarBtnText: {
    fontSize: 12,
    color: '#1a6470',
    fontWeight: '600',
  },
  copiarBtnTextActivo: {
    color: '#fff',
  },

  caracteristicasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  caracteristica: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 80,
  },
  carValor: { fontSize: 22, fontWeight: '800', color: '#1a6470' },
  carLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  descripcion: { fontSize: 15, color: '#444', lineHeight: 23 },

  mapaImagen: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  mapaDireccion: { fontSize: 13, color: '#666', marginTop: 8 },
  mapaWrapper: { position: 'relative' },
  mapaOverlayBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  mapaOverlayBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  btnWhatsapp: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnWhatsappText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnCompartirFotos: {
    borderWidth: 1.5,
    borderColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnCompartirFotosText: {
    color: '#128C7E',
    fontSize: 14,
    fontWeight: '700',
  },

  btnDisabled: { opacity: 0.6 },

  descargarRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  descargarBtn: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  descargarBtnTodas: { flex: 3 },
  descargarBtnElegir: { flex: 2, backgroundColor: '#1e3a4a' },
  descargarText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  modalSeleccionCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
  },
  modalSeleccionHeader: { paddingHorizontal: 16, marginBottom: 10 },
  modalSeleccionTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a2e' },
  modalSeleccionSub: { fontSize: 13, color: '#888', marginTop: 2 },
  seleccionarTodasBtn: { alignSelf: 'flex-end', marginRight: 16, marginBottom: 6 },
  seleccionarTodasText: { color: '#1a6470', fontWeight: '700', fontSize: 13 },
  miniaturaSeleccion: {
    width: '32%',
    aspectRatio: 1,
    margin: '0.65%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  miniaturaSeleccionImg: { width: '100%', height: '100%' },
  miniaturaCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaCheckActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  miniaturaCheckText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  modalSeleccionFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalSeleccionCancelar: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  modalSeleccionCancelarText: { color: '#555', fontWeight: '700', fontSize: 14 },
  modalSeleccionDescargar: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1a6470',
  },
  modalSeleccionDescargarText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  volverBtn: { marginTop: 8 },
  volverText: { fontSize: 14, color: '#1a6470', fontWeight: '600' },

  notaInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a6470',
    minHeight: 90,
    backgroundColor: '#fafafa',
  },
  publicadoresVacio: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  publicadoresLista: { gap: 8 },
  publicadorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f0f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  publicadorNombre: { fontSize: 14, fontWeight: '600', color: '#1a1a2e', flex: 1, marginRight: 8 },
  publicadorVeces: { fontSize: 13, fontWeight: '800', color: '#1a6470' },
  notaGuardarBtn: {
    backgroundColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  notaGuardarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnValera: {
    backgroundColor: '#4a4a8a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnValeraText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnPDF: {
    backgroundColor: '#2c3e50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPDFText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnCita: {
    backgroundColor: '#1a6b3a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnCitaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  asesorBadge: {
    fontSize: 12,
    color: '#5a3e00',
    backgroundColor: '#fff3cd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600',
  },
  accionesRapidas: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 12 },
  accionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  accionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal selección de cliente
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a6470',
  },
  modalCerrar: {
    fontSize: 18,
    color: '#888',
    paddingHorizontal: 6,
  },
  modalBusqueda: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1a6470',
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  modalVacio: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 14,
    paddingVertical: 20,
  },
  clienteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  clienteNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a6470',
  },
  clienteTelefono: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  clienteEstado: {
    fontSize: 11,
    color: '#555',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  btnNuevoCliente: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#1a6470',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnNuevoClienteText: {
    color: '#1a6470',
    fontWeight: '700',
    fontSize: 14,
  },
  formNuevo: {
    marginTop: 14,
    backgroundColor: '#f8fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dde8ea',
  },
  formNuevoTitulo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a6470',
    marginBottom: 10,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1a6470',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  formNuevoBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  formBtnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  formBtnCancelarText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  formBtnGuardar: {
    flex: 2,
    backgroundColor: '#1a6470',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  formBtnGuardarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Picker fecha/hora cita
  pickerFechaContainer: {
    paddingTop: 8,
  },
  pickerSubtitulo: {
    textAlign: 'center',
    fontSize: 14,
    color: '#555',
    marginBottom: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f9fa',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  pickerArrow: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  pickerArrowText: {
    fontSize: 18,
    color: '#1a6470',
  },
  pickerValor: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#1a6470',
  },
  pickerHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 20,
  },
  btnConfirmarCita: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnConfirmarCitaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnVolverPaso: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnVolverPasoText: {
    color: '#1a6470',
    fontSize: 14,
    fontWeight: '600',
  },

  btnDiseno: {
    backgroundColor: '#c9a84c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  btnDisenoText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisenoHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  pubRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pubEstado: { fontSize: 15, fontWeight: '700', color: '#1a2e30' },
  pubFecha: { fontSize: 12, color: '#888', marginTop: 3 },
  pubContador: { fontSize: 13, fontWeight: '700', color: '#1a6470' },
  pubContadorLimite: { color: '#c0392b' },
  pubBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  pubBtnPendiente: { backgroundColor: '#1a6470' },
  pubBtnActiva: { backgroundColor: '#888' },
  deshacerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0e8e8', gap: 10,
  },
  deshacerHint: { flex: 1, fontSize: 12, color: '#999', fontStyle: 'italic' },
  deshacerBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e4bcbc', backgroundColor: '#fdf6f6',
  },
  deshacerBtnText: { fontSize: 12, fontWeight: '600', color: '#c0392b' },
  pubBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  constructoraBadge: {
    fontSize: 12,
    color: '#1a4a6b',
    backgroundColor: '#d4e8f5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '600' as const,
  },

  // ── Lightbox ──────────────────────────────────────────────────
  lbOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lbClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lbCloseTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lbCounter: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    zIndex: 10,
  },
  lbArrow: {
    position: 'absolute',
    top: '42%' as any,
    width: 48,
    height: 60,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lbArrowLeft:  { left: 10 },
  lbArrowRight: { right: 10 },
  lbArrowTxt:   { color: '#fff', fontSize: 36, fontWeight: '300', lineHeight: 42 },
  lbThumbs: {
    position: 'absolute',
    bottom: 36,
    width: '100%',
    maxHeight: 72,
  },
  lbThumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    opacity: 0.45,
  },
  lbThumbActive: {
    opacity: 1,
    borderWidth: 2.5,
    borderColor: '#fff',
    borderRadius: 8,
  },
})
