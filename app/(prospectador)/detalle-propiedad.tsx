import { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
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
import { useLocalSearchParams, router } from 'expo-router'
import { Asset } from 'expo-asset'
import { supabase } from '../../lib/supabase'
import { esPlusOMejor, esStaffSupervision } from '../../lib/permisos'
import { thumb } from '../../lib/img'
import { useVistaComo } from '../../lib/VistaComo'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import PropMapa from '../../components/PropMapa'
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
  lat: number | null
  lng: number | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type SubidoPor = { nombre: string; telefono: string | null }

type ClienteCRM = {
  id: string
  nombre: string
  telefono: string
  estado: string
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

function capitalize(s: string | null) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatearFichaWhatsApp(p: Propiedad): string {
  const tipo = capitalize(p.tipo)
  const operacion = capitalize(p.operacion)

  let msg = `🏠 *${p.codigo ?? ''} – ${p.titulo}*`
  if (tipo || operacion) msg += `\n_${[tipo, operacion].filter(Boolean).join(' en ')}_`
  msg += `\n\n📍 ${p.direccion}`
  msg += `\n💰 ${formatPrecio(p.precio)}`

  const meta: string[] = []
  if (p.recamaras != null) meta.push(`🛏 ${p.recamaras} rec`)
  if (p.banos != null || p.medios_banos != null) {
    const partes: string[] = []
    if (p.banos != null) partes.push(`${p.banos} completo${p.banos === 1 ? '' : 's'}`)
    if (p.medios_banos != null && p.medios_banos > 0) partes.push(`${p.medios_banos} medio${p.medios_banos === 1 ? '' : 's'}`)
    meta.push(`🚿 ${partes.join(' + ')}`)
  }
  if (p.m2 != null) meta.push(`📐 ${p.m2} m² const.`)
  if (p.m2_terreno != null) meta.push(`🌳 ${p.m2_terreno} m² terreno`)
  if (p.estacionamientos != null) meta.push(`🚗 ${p.estacionamientos} est`)
  if (meta.length) msg += '\n\n' + meta.join('   ')

  if (p.descripcion) msg += `\n\n${p.descripcion}`

  msg += '\n\n_Información compartida por tu asesor inmobiliario_'
  return msg
}

export default function DetallePropiedad() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions()
  const isOnline = useNetworkStatus()
  const queryClient = useQueryClient()
  const [imagenActual, setImagenActual] = useState(0)
  const [descargando, setDescargando] = useState(false)
  const [modalSeleccion, setModalSeleccion] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [compartiendoFotos, setCompartiendoFotos] = useState(false)
  const [nota, setNota] = useState('')
  const [notaGuardada, setNotaGuardada] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [lightboxIndex, setLightboxIndex]     = useState(0)
  const [lightboxLoading, setLightboxLoading] = useState(false)

  const { vistaComo } = useVistaComo()
  const { data: detalle, isLoading } = useQuery({
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
        .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, descripcion, created_by, asesor_id, exclusiva, es_constructora, nombre_constructora, inmobiliaria_id, inmobiliarias(nombre, logo_url, exclusiva), lat, lng, propiedad_imagenes(url, orden)')
        .eq('id', id)
        .single()

      if (error) throw error

      const dataNormalizada = {
        ...data,
        inmobiliarias: Array.isArray((data as any).inmobiliarias) ? (data as any).inmobiliarias[0] ?? null : (data as any).inmobiliarias,
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
          .from('profiles').select('nombre, telefono').eq('id', dataNormalizada.created_by).maybeSingle()
        if (perfil) {
          subidoPor = { nombre: perfil.nombre ?? 'Admin', telefono: perfil.telefono ?? null }
        }
      }

      return { propiedad: dataNormalizada as unknown as Propiedad, subidoPor, nombreUsuario, rol, sinAcceso: false as const }
    },
    enabled: !!id,
    networkMode: 'offlineFirst',
    staleTime: 0,
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
  const esStaff = esStaffSupervision(rol)

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
  const [publicada, setPublicada] = useState(false)
  const [fechaPublicacion, setFechaPublicacion] = useState<string | null>(null)
  const [togglingPublicacion, setTogglingPublicacion] = useState(false)
  const [vecesPublicada, setVecesPublicada] = useState(0)
  const [deshaciendoPub, setDeshaciendoPub] = useState(false)

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
    registrarActividad('vista')
    cargarPublicacion()
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (vecesPublicada >= 10) {
      if (Platform.OS === 'web') window.alert('Esta propiedad alcanzó el límite de 10 publicaciones.')
      else Alert.alert('Límite alcanzado', 'Esta propiedad alcanzó el límite de 10 publicaciones.')
      return
    }

    setTogglingPublicacion(true)

    const nuevasVeces = vecesPublicada + 1
    const ahora = new Date().toISOString()

    await supabase
      .from('propiedad_publicacion')
      .upsert({
        propiedad_id: id,
        user_id: user.id,
        publicada: true,
        fecha_publicacion: ahora,
        veces_publicada: nuevasVeces,
      }, { onConflict: 'propiedad_id,user_id' })

    setPublicada(true)
    setFechaPublicacion(ahora)
    setVecesPublicada(nuevasVeces)

    registrarAccion(user.id, 'publicar_propiedad').catch(() => {})
    queryClient.setQueryData<any>(['prospectador-propiedades'], (old: any) => {
      if (!old) return old
      return { ...old, publicacionesMap: { ...old.publicacionesMap, [id]: nuevasVeces } }
    })

    // Actualizar progreso en tarea de tipo publicar_propiedades
    const { count } = await supabase
      .from('propiedad_publicacion')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('publicada', true)

    const totalPublicadas = count ?? 0

    const { data: asigs } = await supabase
      .from('tarea_asignaciones')
      .select('id, tarea:tareas!inner(tipo, meta_cantidad)')
      .eq('user_id', user.id)
      .eq('completada', false)
      .eq('tarea.tipo', 'publicar_propiedades')

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

    setTogglingPublicacion(false)
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
      queryClient.setQueryData<any>(['prospectador-propiedades'], (old: any) => {
        if (!old) return old
        return { ...old, publicacionesMap: { ...old.publicacionesMap, [id]: nuevas } }
      })
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

  async function imagenABase64(url: string): Promise<string> {
    try {
      if (Platform.OS === 'web') {
        // Evita usar una versión en caché sin cabeceras CORS, que html2canvas
        // no puede leer y renderiza como un recuadro en blanco.
        const sep = url.includes('?') ? '&' : '?'
        return `${url}${sep}_cb=${Date.now()}`
      }
      const localUri = FileSystem.cacheDirectory + 'ficha_img_' + Math.random().toString(36).slice(2) + '.jpg'
      const { uri } = await FileSystem.downloadAsync(url, localUri)
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      return `data:image/jpeg;base64,${base64}`
    } catch {
      return url
    }
  }

  async function generarFichaPDF() {
    if (!propiedad) return

    setGenerandoPDF(true)
    try {
      const esc = (s: string | null | undefined) =>
        (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const precio = propiedad.precio != null
        ? '$' + propiedad.precio.toLocaleString('es-MX') + ' MXN'
        : 'Precio a consultar'
      const tipo = propiedad.tipo
        ? propiedad.tipo.charAt(0).toUpperCase() + propiedad.tipo.slice(1)
        : ''
      const operacion = propiedad.operacion
        ? propiedad.operacion.charAt(0).toUpperCase() + propiedad.operacion.slice(1)
        : ''

      const imagenes = [...(propiedad.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)

      const [imagenesConSrc, logoSrc, inmobiliariaLogoSrc] = await Promise.all([
        Promise.all(
          imagenes.slice(0, 13).map(async img => ({
            ...img,
            src: await imagenABase64(img.url),
          }))
        ),
        getLogoBase64(),
        propiedad.inmobiliarias?.logo_url ? imagenABase64(propiedad.inmobiliarias.logo_url) : Promise.resolve(''),
      ])

      const imagenPrincipal = imagenesConSrc[0]
      // Agrupar el resto de imágenes en bloques de máximo 6 por hoja
      const fotosRestantes = imagenesConSrc.slice(1)
      const gruposFotos: typeof fotosRestantes[] = []
      for (let i = 0; i < fotosRestantes.length; i += 6) {
        gruposFotos.push(fotosRestantes.slice(i, i + 6))
      }
      const galeriaHTML = gruposFotos.map((grupo, i) => `
        <div class="galeria-grupo">
          ${i === 0 ? '<div class="seccion">Galería</div>' : ''}
          <div class="fotos">${grupo.map(img => `<img src="${img.src}" class="foto-galeria" />`).join('')}</div>
        </div>
      `).join('')

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
        const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=740x340&scale=2&markers=color:0x1a6470%7C${lat},${lng}&key=${GMAPS_KEY}`
        const mapSrc = await imagenABase64(staticUrl)
        mapaHTML = `
          <div class="seccion-grupo">
            <div class="seccion">Ubicación</div>
            <div class="mapa-box">
              <img src="${mapSrc}" class="mapa-img" />
              <div class="mapa-dir">📍 ${esc(propiedad.direccion)}</div>
            </div>
          </div>`
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${propiedad.codigo ?? 'ficha'}</title><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Helvetica, Arial, sans-serif; color: #1a1a2e; background: #fff; }
        .header { background: #1a6470; padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; }
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
        .fotos { display: block; }
        .fotos::after { content: ""; display: table; clear: both; }
        .foto-galeria { width: calc(50% - 7px); height: 330px; object-fit: contain; background: #eef2f3; border-radius: 8px; border: 1px solid #e0e8ea; float: left; margin: 0 14px 14px 0; break-inside: avoid; page-break-inside: avoid; }
        .foto-galeria:nth-child(2n) { margin-right: 0; }
        .seccion { font-size: 10px; font-weight: 800; color: #888; letter-spacing: 1.2px; text-transform: uppercase; margin: 20px 0 10px; }
        .cars { display: block; }
        .cars::after { content: ""; display: table; clear: both; }
        .car-val { display: block; font-size: 20px; font-weight: 800; color: #1a6470; }
        .car-lbl { display: block; font-size: 11px; color: #888; margin-top: 2px; }
        .desc { font-size: 13px; line-height: 1.7; color: #444; white-space: pre-wrap; }
        .mapa-box { border: 1.5px solid #e0e8ea; border-radius: 10px; overflow: hidden; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
        .mapa-img { width: 100%; height: 340px; object-fit: cover; display: block; }
        .mapa-dir { background: #f0f5f5; padding: 10px 14px; font-size: 12px; color: #1a6470; font-weight: 600; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; break-inside: avoid; page-break-inside: avoid; }
        .galeria-grupo { break-inside: avoid; page-break-inside: avoid; }
        .seccion-grupo { break-inside: avoid; page-break-inside: avoid; }
        .car { background: #f0f5f5; border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 70px; float: left; margin: 0 12px 12px 0; break-inside: avoid; page-break-inside: avoid; }
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
        ${propiedad.inmobiliarias?.logo_url ? `<div class="inmob-logo-wrap">
          <img src="${inmobiliariaLogoSrc}" class="inmob-logo" />
          ${propiedad.inmobiliarias.nombre ? `<div class="inmob-nombre">${esc(propiedad.inmobiliarias.nombre)}</div>` : ''}
        </div>` : ''}
        ${cars.length > 0 ? `<div class="seccion-grupo"><div class="seccion">Características</div><div class="cars">${cars.join('')}</div></div>` : ''}
        ${propiedad.descripcion ? `<div class="seccion">Descripción</div><p class="desc">${esc(propiedad.descripcion)}</p>` : ''}
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
        container.style.position = 'fixed'
        container.style.top = '0'
        container.style.left = '-9999px'
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
          const canvas = await html2canvas(container, {
            useCORS: true,
            scale: 2,
            width: 800,
            windowWidth: 800,
          })

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
        const { uri } = await Print.printToFileAsync({ html, width: 595 })
        const isAvailable = await ShareLib.isAvailableAsync()
        if (!isAvailable) {
          Alert.alert('Error', 'Compartir no está disponible en este dispositivo.')
          return
        }
        await ShareLib.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: propiedad.codigo ?? 'ficha' })
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
      .select('id, nombre, telefono, estado')
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
    const mensaje = `Hola, quiero coordinar una cita para *${clienteParaCita.nombre}* (${clienteParaCita.telefono}) para la propiedad *${propiedad.codigo}*${constructoraStr} el *${fechaStr}*.`
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

  async function compartirEnWhatsApp() {
    if (!propiedad) return
    const texto = formatearFichaWhatsApp(propiedad)
    const imagenes = [...(propiedad.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)

    setCompartiendoFotos(true)
    registrarActividad('descarga')

    try {
      if (Platform.OS === 'web') {
        // Abrir WhatsApp PRIMERO (gesto directo del usuario, sin ningún await previo)
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
        try { await navigator.clipboard.writeText(texto) } catch { /* ignorar */ }

        for (let i = 0; i < imagenes.length; i++) {
          try {
            const resp = await fetch(imagenes[i].url)
            const blob = await resp.blob()
            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = `${propiedad.codigo ?? 'propiedad'}-foto-${i + 1}.jpg`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
          } catch {
            const a = document.createElement('a')
            a.href = imagenes[i].url
            a.download = `${propiedad.codigo ?? 'propiedad'}-foto-${i + 1}.jpg`
            a.target = '_blank'
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }
          if (i < imagenes.length - 1) {
            await new Promise<void>(r => setTimeout(r, 500))
          }
        }
        setCompartiendoFotos(false)
        return
      }

      // Nativo: copiar texto al portapapeles automáticamente
      await Clipboard.setStringAsync(texto)

      const encoded = encodeURIComponent(texto)
      const abrirWhatsApp = () =>
        Linking.openURL(`https://wa.me/?text=${encoded}`)

      if (imagenes.length === 0) {
        await abrirWhatsApp()
        setCompartiendoFotos(false)
        return
      }

      // Descargar imágenes con la API estable de expo-file-system
      const uris: string[] = []
      for (let i = 0; i < imagenes.length; i++) {
        try {
          const dest = `${FileSystem.cacheDirectory}${propiedad.codigo ?? 'prop'}-wa-${i}.jpg`
          const { uri } = await FileSystem.downloadAsync(imagenes[i].url, dest)
          uris.push(uri)
        } catch { /* continuar con las demás */ }
      }

      // Guardar en galería para adjuntar desde WhatsApp
      let guardadas = 0
      if (uris.length > 0) {
        const { status } = await MediaLibrary.requestPermissionsAsync(true)
        if (status === 'granted') {
          for (const uri of uris) {
            try { await MediaLibrary.saveToLibraryAsync(uri); guardadas++ } catch { /* skip */ }
          }
        }
      }

      Alert.alert(
        'Listo para enviar',
        guardadas > 0
          ? `Texto copiado al portapapeles.\n${guardadas} foto${guardadas > 1 ? 's guardadas' : ' guardada'} en tu galería.\n\nAbre WhatsApp, pega el texto (manteniendo presionado) y adjunta las fotos con el clip (📎).`
          : 'Texto copiado al portapapeles.\n\nAbre WhatsApp y pega el texto (manteniendo presionado).',
        [{ text: 'Abrir WhatsApp', onPress: abrirWhatsApp }]
      )
    } catch {
      Alert.alert('Error', 'No se pudo compartir la propiedad.')
    }

    setCompartiendoFotos(false)
  }

  async function descargarImagenes(seleccion?: { url: string }[]) {
    if (!propiedad) return
    const imagenes = seleccion ?? [...(propiedad.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)
    if (imagenes.length === 0) return

    setDescargando(true)
    registrarActividad('descarga')

    if (Platform.OS === 'web') {
      try {
        for (let i = 0; i < imagenes.length; i++) {
          try {
            const resp = await fetch(imagenes[i].url)
            const blob = await resp.blob()
            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = `${propiedad.codigo ?? 'propiedad'}-foto-${i + 1}.jpg`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // Defer revoke — el navegador necesita tiempo para leer el blob antes de que se libere
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
          } catch {
            // CORS bloqueó fetch — abrir directamente la URL
            const a = document.createElement('a')
            a.href = imagenes[i].url
            a.download = `${propiedad.codigo ?? 'propiedad'}-foto-${i + 1}.jpg`
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
          const dest = `${FileSystem.documentDirectory}${propiedad.codigo ?? 'prop'}-${i + 1}.${extValida}`
          const { uri, status: dlStatus } = await FileSystem.downloadAsync(url, dest)
          if (dlStatus !== 200) { errores.push(`img${i + 1}: HTTP ${dlStatus}`); continue }
          await MediaLibrary.createAssetAsync(uri)
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
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <OfflineBanner />
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(prospectador)/propiedades')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>
      {/* Galería de imágenes */}
      {imagenes.length > 0 ? (
        <View>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
              setImagenActual(index)
            }}
          >
            {imagenes.map((img, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.92}
                onPress={() => { setLightboxIndex(i); setLightboxVisible(true) }}
              >
                <Image
                  source={{ uri: thumb(img.url, { width: 1080, quality: 72 }) }}
                  style={[styles.imagen, { width: SCREEN_WIDTH }]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {imagenes.length > 1 && (
            <View style={styles.paginador}>
              {imagenes.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => irAImagen(i)}>
                  <View style={[styles.punto, i === imagenActual && styles.puntoActivo]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.sinImagen, { width: SCREEN_WIDTH }]}>
          <Text style={styles.sinImagenText}>Sin imágenes</Text>
        </View>
      )}

      {/* Contenido */}
      <View style={styles.content}>
        {/* Logo de la inmobiliaria */}
        {propiedad.inmobiliarias?.logo_url && (
          <View style={styles.inmobiliariaLogoWrapper}>
            <Image source={{ uri: propiedad.inmobiliarias.logo_url }} style={styles.inmobiliariaLogo} resizeMode="contain" />
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
          {subidoPor && (
            <Text style={styles.asesorBadge}>👤 {subidoPor.nombre}</Text>
          )}
        </View>

        {/* Título y precio */}
        <Text style={styles.titulo}>{propiedad.titulo}</Text>
        <Text style={styles.precio}>{formatPrecio(propiedad.precio)}</Text>
        <Text style={styles.direccion}>{propiedad.direccion}</Text>

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
              <PropMapa lat={propiedad.lat} lng={propiedad.lng} titulo={propiedad.titulo} height={340} />
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

        {/* Botón descargar imágenes */}
        {imagenes.length > 0 && (
          <TouchableOpacity
            style={[styles.descargarBtn, descargando && styles.btnDisabled]}
            onPress={() => {
              setSeleccionadas(new Set(imagenes.map((_, i) => i)))
              setModalSeleccion(true)
            }}
            disabled={descargando}
          >
            {descargando ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.descargarText}>
                {Platform.OS === 'web'
                  ? `Descargar ${imagenes.length === 1 ? '1 imagen' : `${imagenes.length} imágenes`}`
                  : `Guardar en galería (${imagenes.length})`
                }
              </Text>
            )}
          </TouchableOpacity>
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
                  resizeMode="contain"
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
                  <Image
                    source={{ uri: thumb(img.url, { width: 160, quality: 55 }) }}
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
                    <Image source={{ uri: thumb(item.url, { width: 200, quality: 55 }) }} style={styles.miniaturaSeleccionImg} />
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  backBtn: { alignSelf: 'flex-start', margin: 16, marginBottom: 0, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' as const },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#aaa', fontSize: 15 },

  imagen: { height: 340, backgroundColor: '#d0d0d0' },
  sinImagen: {
    height: 180,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinImagenText: { color: '#aaa', fontSize: 14 },

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
  direccion: { fontSize: 14, color: '#888', marginBottom: 20 },

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

  descargarBtn: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
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
