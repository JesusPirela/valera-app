import { useState, useEffect, useRef } from 'react'
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  View,
  FlatList,
  Modal,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'
import PillSelector from '../../components/ui/PillSelector'
import DropdownModal from '../../components/ui/DropdownModal'
import AsesorPicker from '../../components/ui/AsesorPicker'
import { COLONIAS } from '../../lib/colonias'
import ToggleSwitch from '../../components/ToggleSwitch'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'
import CensorEditorModal from '../../components/CensorEditorModal'

function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const RECAMARAS_OPTIONS = [
  { value: null, label: '—' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5+' },
]
const BANOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
]
const ESTACIONAMIENTOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]
const MEDIOS_BANOS_OPTIONS = [
  { value: null, label: '—' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
]

function parsearFicha(texto: string) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Título: primera línea completa (sin emojis/símbolos al inicio)
  // Dirección: si hay "|" se toma lo que está después; si no, se extrae "en <Lugar>" del título
  let titulo = ''
  let direccion = ''
  if (lineas.length > 0) {
    const primera = lineas[0].replace(/^[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9$]+/, '').trim()
    if (primera.includes('|')) {
      const partes = primera.split('|')
      titulo = partes[0].trim()
      direccion = partes[1].trim()
    } else {
      titulo = primera
      // Extrae la ubicación tomando todo lo que sigue al último " en ",
      // ignorando si el resultado es solo "Venta" o "Renta"
      const enIdx = primera.toLowerCase().lastIndexOf(' en ')
      if (enIdx !== -1) {
        const candidato = primera.slice(enIdx + 4).trim()
        if (!/^(venta|renta)$/i.test(candidato)) direccion = candidato
      }
    }
  }

  // Precio: $X,XXX,XXX MXN
  let precio = ''
  const mPrecio = texto.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:MXN)?/i)
  if (mPrecio) precio = mPrecio[1].replace(/,/g, '')

  // M2 construcción y terreno
  let m2 = ''
  let m2Terreno = ''
  const mConst = texto.match(/construcci[oó]n\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
  const mTerr = texto.match(/terreno\s*[:.]?\s*([\d,.]+)\s*m[²2]/i)
  if (mTerr) m2Terreno = mTerr[1].replace(/,/g, '')
  if (mConst) {
    m2 = mConst[1].replace(/,/g, '')
  } else if (mTerr) {
    m2 = mTerr[1].replace(/,/g, '')
  }

  // Recámaras
  let recamaras: number | null = null
  const mRec = texto.match(/(\d+)\s*rec[aá]maras?/i)
  if (mRec) recamaras = Math.min(parseInt(mRec[1]), 5)

  // Baños completos (evitar capturar "medio baño")
  let banos: number | null = null
  const mBanos = texto.match(/(\d+)\s*ba[ñn]os?\s*(?:completos?)?(?!\s*\w*medio)/i)
  if (mBanos) banos = Math.min(parseInt(mBanos[1]), 4)

  // Medios baños
  let mediosBanos: number | null = null
  const mMedios = texto.match(/(\d+)\s*medio\s*ba[ñn]o/i)
  if (mMedios) mediosBanos = Math.min(parseInt(mMedios[1]), 2)

  // Estacionamientos
  let estacionamientos: number | null = null
  const mCochera = texto.match(/cochera\s+para\s+(\d+)/i)
  if (mCochera) {
    estacionamientos = Math.min(parseInt(mCochera[1]), 3)
  } else {
    const mEst = texto.match(/(\d+)\s*(?:autos?|estacionamientos?|lugares?)/i)
    if (mEst) estacionamientos = Math.min(parseInt(mEst[1]), 3)
  }

  // Tipo
  let tipo: 'casa' | 'departamento' | 'local' | 'terreno' | null = null
  if (/departamento/i.test(titulo)) tipo = 'departamento'
  else if (/\bcasa\b/i.test(titulo)) tipo = 'casa'
  else if (/local/i.test(titulo)) tipo = 'local'
  else if (/terreno/i.test(titulo)) tipo = 'terreno'

  // Operación
  let operacion: 'venta' | 'renta' | null = null
  const inicio = texto.slice(0, 120)
  if (/\brenta\b/i.test(inicio)) operacion = 'renta'
  else if (/\bventa\b/i.test(inicio)) operacion = 'venta'

  return { titulo, direccion, precio, m2, m2Terreno, recamaras, banos, mediosBanos, estacionamientos, tipo, operacion }
}

export default function NuevaPropiedad() {
  useSupervisorBlock()
  const c = useColors()
  const [titulo, setTitulo] = useState('')
  const [tituloEditado, setTituloEditado] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [direccion, setDireccion] = useState('')
  const [operacion, setOperacion] = useState<'venta' | 'renta'>('venta')
  const [tipo, setTipo] = useState<'casa' | 'departamento' | 'local' | 'terreno'>('casa')
  const [estado, setEstado] = useState<'disponible' | 'vendida'>('disponible')
  const [recamaras, setRecamaras] = useState<number | null>(null)
  const [banos, setBanos] = useState<number | null>(null)
  const [m2, setM2] = useState('')
  const [m2Terreno, setM2Terreno] = useState('')
  const [estacionamientos, setEstacionamientos] = useState<number | null>(null)
  const [zona, setZona] = useState<'queretaro' | 'monterrey' | 'puebla' | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  // Posibles propiedades duplicadas detectadas al intentar guardar.
  const [duplicados, setDuplicados] = useState<
    { id: string; codigo: string; titulo: string; precio: number | null; direccion: string | null; dist_m: number | null; creado_por: string | null }[] | null
  >(null)
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<any[]>([])
  const [geoLoading, setGeoLoading] = useState(false)
  const [asesorId, setAsesorId] = useState<string | null>(null)
  const [exclusiva, setExclusiva] = useState(false)
  const [esConstructora, setEsConstructora] = useState(false)
  const [nombreConstructora, setNombreConstructora] = useState('')
  const [constructorasExistentes, setConstructorasExistentes] = useState<string[]>([])
  const [modoNuevaConstructora, setModoNuevaConstructora] = useState(false)
  const [esInventario, setEsInventario] = useState(false)
  const [inventarioSeccion, setInventarioSeccion] = useState('')
  const [seccionesExistentes, setSeccionesExistentes] = useState<string[]>([])
  const [imagenes, setImagenes] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const imagenesRef = useRef<string[]>([])
  const [mediosBanos, setMediosBanos] = useState<number | null>(null)
  const [ficha, setFicha] = useState('')
  const [mostrarFicha, setMostrarFicha] = useState(true)
  const [fichaMsg, setFichaMsg] = useState('')
  const [urlImport, setUrlImport] = useState('')
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [mejorando, setMejorando] = useState(false)
  const [mejorandoMsg, setMejorandoMsg] = useState('')
  const [guardado, setGuardado] = useState(false)
  const [verImagen, setVerImagen] = useState<string | null>(null)
  const [censurando, setCensurando] = useState<string | null>(null)

  // Auto-generar título cuando cambian tipo / operación / dirección
  useEffect(() => {
    if (tituloEditado) return
    const tipoLabel: Record<string, string> = {
      casa: 'Casa', departamento: 'Departamento', local: 'Local', terreno: 'Terreno',
    }
    const opLabel: Record<string, string> = { venta: 'Venta', renta: 'Renta' }
    const base = `${tipoLabel[tipo] ?? tipo} en ${opLabel[operacion] ?? operacion}`
    setTitulo(direccion.trim() ? `${base} en ${direccion.trim()}` : base)
  }, [tipo, operacion, direccion, tituloEditado])

  const coloniasSugeridas = geoQuery.length >= 2
    ? COLONIAS.filter(c => c.label.toLowerCase().includes(geoQuery.toLowerCase()))
    : []

  useEffect(() => {
    if (!geoQuery.trim() || geoQuery.length < 3) { setGeoResults([]); return }
    const cityHint = zona === 'queretaro' ? 'Querétaro' : zona === 'monterrey' ? 'Monterrey' : zona === 'puebla' ? 'Puebla' : ''
    const q = `${geoQuery}${cityHint ? ' ' + cityHint : ''} Mexico`
    const t = setTimeout(async () => {
      setGeoLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=mx`
        )
        const data = await res.json()
        setGeoResults(Array.isArray(data) ? data : [])
      } catch { setGeoResults([]) }
      finally { setGeoLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [geoQuery, zona])

  function seleccionarColoniaPredefinida(c: typeof COLONIAS[0]) {
    const texto = `${c.label}, ${c.ciudad}, México`
    setDireccion(texto); setGeoQuery(texto)
    setLat(c.lat); setLng(c.lng)
    setZona(c.zona); setGeoResults([])
  }

  function seleccionarUbicacion(r: any) {
    const partes = r.display_name.split(',').slice(0, 4).join(', ').trim()
    setDireccion(partes); setGeoQuery(partes)
    setLat(parseFloat(r.lat)); setLng(parseFloat(r.lon))
    setGeoResults([])
    const dn = r.display_name.toLowerCase()
    if (dn.includes('querétaro') || dn.includes('queretaro')) setZona('queretaro')
    else if (dn.includes('monterrey') || dn.includes('nuevo león') || dn.includes('nuevo leon')) setZona('monterrey')
    else if (dn.includes('puebla')) setZona('puebla')
  }

  function aplicarFicha() {
    if (!ficha.trim()) return
    const r = parsearFicha(ficha)
    if (r.titulo) setTitulo(r.titulo)
    if (r.direccion) setDireccion(r.direccion)
    if (r.precio) setPrecio(r.precio)
    if (r.m2) setM2(r.m2)
    if (r.m2Terreno) setM2Terreno(r.m2Terreno)
    if (r.recamaras !== null) setRecamaras(r.recamaras)
    if (r.banos !== null) setBanos(r.banos)
    if (r.mediosBanos !== null) setMediosBanos(r.mediosBanos)
    if (r.estacionamientos !== null) setEstacionamientos(r.estacionamientos)
    if (r.tipo) setTipo(r.tipo)
    if (r.operacion) setOperacion(r.operacion)
    setDescripcion(ficha)

    const partes: string[] = []
    if (r.titulo) partes.push(r.titulo)
    if (r.precio) partes.push(`$${parseInt(r.precio).toLocaleString('es-MX')}`)
    if (r.recamaras) partes.push(`${r.recamaras} rec.`)
    if (r.banos) partes.push(`${r.banos} baños`)
    if (r.mediosBanos) partes.push(`${r.mediosBanos} medio baño`)
    if (r.estacionamientos != null) partes.push(`${r.estacionamientos} est.`)
    setFichaMsg(partes.length > 0 ? `✓ Detectado: ${partes.join(' · ')}` : '⚠ No se detectaron campos. Revisa el formato.')
    setMostrarFicha(false)
    setTituloEditado(false)
  }

  // Carga las constructoras ya registradas para poder elegirlas (o crear una nueva).
  // Eager: lista lista antes de activar el toggle.
  useEffect(() => {
    let activo = true
    ;(async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('nombre_constructora')
        .eq('es_constructora', true)
        .not('nombre_constructora', 'is', null)
        .limit(2000)
      if (!activo || error) return
      const nombres = [...new Set(
        (data ?? []).map((p: any) => (p.nombre_constructora as string)?.trim()).filter(Boolean)
      )].sort() as string[]
      setConstructorasExistentes(nombres)
    })()
    return () => { activo = false }
  }, [])

  // Carga las secciones de inventario ya creadas para poder elegirlas.
  // Se carga al montar (eager) para que los chips estén listos en cuanto se
  // active el toggle, sin depender de un fetch posterior que pueda fallar/tardar.
  useEffect(() => {
    let activo = true
    ;(async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('inventario_seccion')
        .eq('es_inventario', true)
        .not('inventario_seccion', 'is', null)
        .limit(2000)
      if (!activo || error) return
      const set = new Map<string, string>()
      for (const r of (data ?? [])) {
        const s = (r as any).inventario_seccion?.trim()
        if (s) set.set(s.toLowerCase(), s)
      }
      setSeccionesExistentes(Array.from(set.values()).sort((a, b) => a.localeCompare(b)))
    })()
    return () => { activo = false }
  }, [])

  async function importarDesdeUrl() {
    const url = urlImport.trim()
    if (!url || !/^https?:\/\//.test(url)) {
      setImportMsg('⚠ Pega un URL válido (empieza con https://)')
      return
    }
    setImportando(true)
    setImportMsg('Descargando información…')
    try {
      const { data, error } = await supabase.functions.invoke('importar-propiedad', {
        body: { url },
      })
      if (error) throw error
      if ((data as any)?.error) throw new Error((data as any).error)

      const d = data as any
      // Título: "Venta de Casa en El Mirador, Querétaro"
      {
        const op = (d.operacion ?? operacion) === 'renta' ? 'Renta' : 'Venta'
        const TIPOS_T: Record<string, string> = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno', local: 'Local' }
        const tp = TIPOS_T[d.tipo ?? tipo] ?? 'Propiedad'
        const addr = ((d.direccion ?? direccion) || '').trim()
        if (addr) {
          const partes = addr.split(',').map((p: string) => p.trim()).filter(Boolean)
          const PREFIJOS = /^(fraccionamiento|fracc\.?|colonia|col\.?|barrio|residencial|privada|priv\.?)\s+/i
          const lugar = partes[0].replace(PREFIJOS, '').trim()
          const estado = partes.length > 1 ? partes[partes.length - 1] : ''
          const ubic = estado && estado.toLowerCase() !== lugar.toLowerCase() ? `${lugar}, ${estado}` : lugar
          setTitulo(`${op} de ${tp} en ${ubic}`)
        } else {
          setTitulo(`${op} de ${tp}`)
        }
        setTituloEditado(true)
      }
      if (d.descripcion)  setDescripcion(d.descripcion)
      if (d.precio)       setPrecio(d.precio)
      if (d.direccion)    { setDireccion(d.direccion); setGeoQuery(d.direccion) }
      if (d.recamaras  != null) setRecamaras(d.recamaras)
      if (d.banos      != null) setBanos(d.banos)
      if (d.mediosBanos != null) setMediosBanos(d.mediosBanos)
      if (d.estacionamientos != null) setEstacionamientos(d.estacionamientos)
      if (d.m2)        setM2(d.m2)
      if (d.m2Terreno) setM2Terreno(d.m2Terreno)
      if (d.tipo)      setTipo(d.tipo)
      if (d.operacion) setOperacion(d.operacion)
      if (d.zona)      setZona(d.zona)
      if (d.imagenes?.length > 0) setImagenes(d.imagenes)

      const partes: string[] = []
      if (d.titulo)    partes.push(d.titulo)
      if (d.precio)    partes.push(`$${parseInt(d.precio).toLocaleString('es-MX')}`)
      if (d.recamaras) partes.push(`${d.recamaras} rec.`)
      if (d.banos)     partes.push(`${d.banos} baños`)
      if (d.m2)        partes.push(`${d.m2} m²`)
      if (d.imagenes?.length) partes.push(`${d.imagenes.length} fotos`)
      setImportMsg(partes.length > 0
        ? `✓ ${partes.join(' · ')}`
        : '⚠ No se detectaron campos. Verifica que el URL sea de una propiedad.')

      if (d.descripcion) {
        setImportMsg(prev => `${prev} · Mejorando con IA…`)
        try {
          await mejorarConDatos(d)
          setImportMsg(prev => prev.replace(' · Mejorando con IA…', ' · Desc. mejorada'))
        } catch {
          setImportMsg(prev => prev.replace(' · Mejorando con IA…', ''))
        }
      }
    } catch (err: any) {
      setImportMsg('✗ Error: ' + (err.message ?? 'No se pudo importar'))
    } finally {
      setImportando(false)
    }
  }

  async function seleccionarImagenes() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.')
        return
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    })
    if (!result.canceled) {
      setImagenes((prev) => [...prev, ...result.assets.map((a) => a.uri)])
    }
  }

  function quitarImagen(uri: string) {
    setImagenes((prev) => prev.filter((u) => u !== uri))
  }

  function aplicarCensura(uriOriginal: string, uriCensurada: string) {
    setImagenes((prev) => prev.map((u) => (u === uriOriginal ? uriCensurada : u)))
    setCensurando(null)
  }

  // Mantener ref sincronizado para evitar closures estancadas
  useEffect(() => { imagenesRef.current = imagenes }, [imagenes])

  // Marcar imágenes como draggable via DOM usando nativeID
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const id = setTimeout(() => {
      imagenes.forEach((_, index) => {
        const el = document.getElementById(`drag-img-nueva-${index}`)
        if (el) {
          el.draggable = true
          el.setAttribute('data-idx', String(index))
          // Evitar que el <img> interno intercepte el drag (especialmente para URLs externas)
          el.querySelectorAll('img').forEach(img => {
            img.draggable = false
            img.style.pointerEvents = 'none'
            img.style.userSelect = 'none'
          })
        }
      })
    }, 300)
    return () => clearTimeout(id)
  }, [imagenes])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    let cleanup: (() => void) | undefined

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? []) as File[]
      const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f))
      if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
    const onDragLeave = () => setIsDragging(false)

    function tryAttach() {
      const el = document.getElementById('dropzone-nueva')
      if (!el) { setTimeout(tryAttach, 100); return }
      el.addEventListener('drop', onDrop)
      el.addEventListener('dragover', onDragOver)
      el.addEventListener('dragleave', onDragLeave)
      cleanup = () => {
        el.removeEventListener('drop', onDrop)
        el.removeEventListener('dragover', onDragOver)
        el.removeEventListener('dragleave', onDragLeave)
      }
    }
    tryAttach()
    return () => cleanup?.()
  }, [])

  // Reordenamiento por arrastre — se re-adjunta cuando cambian las imágenes
  useEffect(() => {
    if (Platform.OS !== 'web') return

    const onDragStart = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (target) dragIdxRef.current = parseInt(target.dataset.idx ?? '-1')
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (target) setDragOverIdx(parseInt(target.dataset.idx ?? '-1'))
    }
    const onDragEnd = () => { dragIdxRef.current = null; setDragOverIdx(null) }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[]
        const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f))
        if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
        dragIdxRef.current = null; setDragOverIdx(null)
        return
      }
      const target = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null
      if (!target) return
      const toIdx = parseInt(target.dataset.idx ?? '-1')
      const fromIdx = dragIdxRef.current
      if (fromIdx === null || fromIdx === toIdx || toIdx < 0) return
      const arr = [...imagenesRef.current]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      setImagenes(arr)
      dragIdxRef.current = null; setDragOverIdx(null)
    }

    let container: HTMLElement | null = null
    let timerId: ReturnType<typeof setTimeout> | null = null
    function tryAttachGrid() {
      container = document.getElementById('drag-grid-nueva')
      if (!container) { timerId = setTimeout(tryAttachGrid, 100); return }
      container.addEventListener('dragstart', onDragStart)
      container.addEventListener('dragover', onDragOver)
      container.addEventListener('dragend', onDragEnd)
      container.addEventListener('drop', onDrop)
    }
    tryAttachGrid()

    return () => {
      if (timerId) clearTimeout(timerId)
      if (container) {
        container.removeEventListener('dragstart', onDragStart)
        container.removeEventListener('dragover', onDragOver)
        container.removeEventListener('dragend', onDragEnd)
        container.removeEventListener('drop', onDrop)
      }
    }
  }, [imagenes.length])

  function handleFileInput(e: any) {
    const files: File[] = Array.from(e.target?.files ?? [])
    const urls = files.filter((f: File) => f.type.startsWith('image/')).map((f: File) => URL.createObjectURL(f))
    if (urls.length > 0) setImagenes(prev => [...prev, ...urls])
  }

  async function mejorarConDatos(d?: {
    titulo?: string; descripcion?: string; precio?: string; direccion?: string
    tipo?: string; operacion?: string; recamaras?: number | null; banos?: number | null
    mediosBanos?: number | null; m2?: string; estacionamientos?: number | null
  }): Promise<void> {
    setMejorando(true)
    setMejorandoMsg('')
    try {
      const body = {
        titulo:           d?.titulo           != null ? d.titulo           : titulo,
        direccion:        d?.direccion        != null ? d.direccion        : direccion,
        precio:           d?.precio           != null ? d.precio           : precio,
        descripcion:      d?.descripcion      != null ? d.descripcion      : descripcion,
        tipo:             d?.tipo             != null ? d.tipo             : tipo,
        operacion:        d?.operacion        != null ? d.operacion        : operacion,
        recamaras:        d?.recamaras        != null ? d.recamaras        : recamaras,
        banos:            d?.banos            != null ? d.banos            : banos,
        mediosBanos:      d?.mediosBanos      != null ? d.mediosBanos      : mediosBanos,
        m2:               d?.m2               != null ? d.m2               : m2,
        estacionamientos: d?.estacionamientos != null ? d.estacionamientos : estacionamientos,
      }
      const { data, error } = await supabase.functions.invoke('mejorar-descripcion', { body })
      if (error) {
        // El SDK devuelve "Edge Function returned a non-2xx status code" como mensaje genérico.
        // El error real está en el cuerpo de la respuesta (error.context es el Response crudo).
        let msg = error.message ?? String(error)
        try {
          const ctx = (error as any).context
          if (ctx?.json) {
            const body = await ctx.json()
            if (body?.error) msg = body.error
          }
        } catch {}
        throw new Error(msg)
      }
      if ((data as any)?.error) throw new Error((data as any).error)
      if (!data?.texto) throw new Error('La IA no devolvió texto. Intenta de nuevo.')
      setDescripcion(data.texto)
      setMejorandoMsg('✓ Descripción mejorada')
    } catch (err: any) {
      const msg: string = err.message || 'Error al mejorar con IA'
      setMejorandoMsg('✗ ' + msg)
      throw err
    } finally {
      setMejorando(false)
    }
  }

  async function handleMejorarDescripcion() {
    try {
      await mejorarConDatos()
    } catch { /* error ya visible en mejorandoMsg */ }
  }

  async function subirImagen(uri: string, propiedadId: string, orden: number): Promise<string> {
    if (/^https?:\/\//.test(uri)) return uri

    const response = await fetch(uri)
    const blob = await response.blob()
    const mimeType = blob.type || 'image/jpeg'
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
    const filePath = `${propiedadId}/${orden}.${ext}`
    const { error } = await supabase.storage
      .from('propiedades')
      .upload(filePath, blob, { contentType: mimeType, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('propiedades').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function handleGuardar(ignorarDup = false) {
    if (!titulo.trim() || !direccion.trim()) {
      Alert.alert('Error', 'El título y la dirección son obligatorios.')
      return
    }
    const precioNum = precio ? parseFloat(precio) : null
    if (precio && isNaN(precioNum!)) {
      Alert.alert('Error', 'El precio debe ser un número válido.')
      return
    }

    // Detector de duplicados: si ya existe una propiedad parecida/igual
    // (misma zona + tipo + precio o recámaras), avisar antes de publicar.
    if (!ignorarDup) {
      try {
        const { data: dups } = await supabase.rpc('detectar_duplicados_propiedad', {
          p_lat: lat, p_lng: lng, p_precio: precioNum, p_tipo: tipo,
          p_recamaras: recamaras, p_direccion: direccion.trim(),
        })
        if (dups && (dups as any[]).length > 0) {
          setDuplicados(dups as any)
          return
        }
      } catch { /* si la verificación falla, no bloquear el guardado */ }
    }
    const m2Num = m2 ? parseFloat(m2) : null
    if (m2 && isNaN(m2Num!)) {
      Alert.alert('Error', 'Los m² deben ser un número válido.')
      return
    }
    const m2TerrenoNum = m2Terreno ? parseFloat(m2Terreno) : null
    if (m2Terreno && isNaN(m2TerrenoNum!)) {
      Alert.alert('Error', 'Los m² de terreno deben ser un número válido.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')

      // Siguiente número de código. Preferimos la función SQL (rápida y sin límite
      // de filas); si no existe aún, calculamos el máximo paginando todos los códigos
      // (supera el límite de ~1000 filas por request).
      let siguienteNum = 0
      const { data: rpcNum, error: rpcErr } = await supabase.rpc('siguiente_codigo_propiedad')
      if (!rpcErr && typeof rpcNum === 'number') {
        siguienteNum = rpcNum
      } else {
        let maxNum = 0
        const PAGE = 1000
        for (let from = 0; ; from += PAGE) {
          const { data: codigos, error: errorCodigos } = await supabase
            .from('propiedades').select('codigo').range(from, from + PAGE - 1)
          if (errorCodigos) throw new Error(`Error leyendo códigos: ${errorCodigos.message}`)
          for (const p of codigos ?? []) {
            const match = p.codigo?.match(/VR-(\d+)/)
            if (match) { const n = parseInt(match[1], 10); if (n > maxNum) maxNum = n }
          }
          if (!codigos || codigos.length < PAGE) break
        }
        siguienteNum = maxNum + 1
      }

      const propiedadId = generarUUID()
      const datosPropiedad = {
        id: propiedadId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        precio: precioNum,
        direccion: direccion.trim(),
        operacion,
        tipo,
        estado,
        zona: zona ?? null,
        recamaras,
        banos,
        medios_banos: mediosBanos ?? 0,
        m2: m2Num,
        m2_terreno: m2TerrenoNum,
        estacionamientos,
        asesor_id: asesorId,
        exclusiva,
        es_constructora: esConstructora,
        nombre_constructora: esConstructora ? nombreConstructora.trim() || null : null,
        es_inventario: esInventario,
        inventario_seccion: esInventario ? (inventarioSeccion.trim() || null) : null,
        created_by: user.id,
        lat: lat ?? null,
        lng: lng ?? null,
      }

      console.log('[nueva-propiedad] insertando con asesor_id:', asesorId)

      // Inserta reintentando si el código ya está ocupado (carrera o hueco).
      let errorPropiedad: any = null
      for (let intento = 0; intento < 25; intento++) {
        const codigo = `VR-${String(siguienteNum).padStart(3, '0')}`
        const { error } = await supabase.from('propiedades').insert({ ...datosPropiedad, codigo })
        if (!error) { errorPropiedad = null; break }
        errorPropiedad = error
        if (error.code === '23505') { siguienteNum++; continue } // código ocupado → siguiente
        break
      }

      console.log('[nueva-propiedad] resultado insert — error:', errorPropiedad)

      if (errorPropiedad) throw new Error(`${errorPropiedad.message} (code: ${errorPropiedad.code}, details: ${errorPropiedad.details}, hint: ${errorPropiedad.hint})`)

      // Si es una constructora nueva (no estaba en el selector), se registra
      // también en la tabla `constructoras` para poder configurarle el
      // teléfono de contacto después — sin esto, solo viviría en el nombre
      // de texto libre de la propiedad y no aparecería en esa pantalla.
      if (esConstructora && nombreConstructora.trim()) {
        await supabase.from('constructoras')
          .upsert({ nombre: nombreConstructora.trim() }, { onConflict: 'nombre', ignoreDuplicates: true })
      }

      if (imagenes.length > 0) {
        const registros = await Promise.all(
          imagenes.map(async (uri, index) => {
            const url = await subirImagen(uri, propiedadId, index)
            return { propiedad_id: propiedadId, url, orden: index }
          })
        )
        const { error: errorImagenes } = await supabase.from('propiedad_imagenes').insert(registros)
        if (errorImagenes) throw errorImagenes
      }

      setGuardado(true)
      setTimeout(() => { router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades') }, 1500)
    } catch (err: any) {
      console.error('[nueva-propiedad] error completo:', err)
      if (Platform.OS === 'web') window.alert(`Error al guardar: ${err.message}`)
      else Alert.alert('Error al guardar', err.message || 'No se pudo guardar la propiedad.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, { backgroundColor: c.bg }]} keyboardShouldPersistTaps="handled">
        {/* Importar desde URL */}
        <View style={[styles.fichaBox, { borderColor: '#c9a84c44', backgroundColor: '#1c1600' }]}>
          <View style={styles.fichaToggle}>
            <Text style={[styles.fichaToggleText, { color: '#c9a84c' }]}>🔗 Importar desde URL</Text>
            <Text style={{ fontSize: 10, color: '#7a5200', fontWeight: '600' }}>EasyBroker · Lamudi · cualquier portal</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              placeholder="https://www.easybroker.com/mx/listing/..."
              placeholderTextColor={c.placeholder}
              value={urlImport}
              onChangeText={v => { setUrlImport(v); setImportMsg('') }}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              style={[styles.btnIA, { marginBottom: 0, paddingHorizontal: 14, opacity: importando ? 0.6 : 1, backgroundColor: '#7a4f00' }]}
              onPress={importarDesdeUrl}
              disabled={importando}
            >
              {importando
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.btnIAText}>Importar</Text>
              }
            </TouchableOpacity>
          </View>
          {importMsg ? (
            <Text style={[styles.fichaMsg, { color: importMsg.startsWith('✓') ? '#c9a84c' : importMsg.startsWith('✗') ? '#e53935' : '#aaa' }]}>
              {importMsg}
            </Text>
          ) : null}
        </View>

        {/* Importar desde ficha */}
        <View style={styles.fichaBox}>
          <TouchableOpacity style={styles.fichaToggle} onPress={() => setMostrarFicha(v => !v)}>
            <Text style={styles.fichaToggleText}>📋 Importar desde ficha</Text>
            <Text style={styles.fichaChevron}>{mostrarFicha ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {fichaMsg ? <Text style={styles.fichaMsg}>{fichaMsg}</Text> : null}
          {mostrarFicha && (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={[styles.input, { height: 130, paddingTop: 10, backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                placeholder={'Pega aquí la ficha completa de la propiedad y detectaremos automáticamente:\ntítulo, precio, m², recámaras, baños, estacionamientos...'}
                placeholderTextColor={c.placeholder}
                value={ficha}
                onChangeText={setFicha}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={[styles.btnIA, { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8 }]} onPress={aplicarFicha}>
                <Text style={styles.btnIAText}>✦ Detectar y rellenar campos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.label}>Imágenes {Platform.OS === 'web' && imagenes.length > 1 ? <Text style={{ fontSize: 11, color: '#aaa', fontWeight: '400' }}> · arrastra para reordenar</Text> : null}</Text>
        {imagenes.length > 0 && (
          Platform.OS === 'web' ? (
            <View nativeID="drag-grid-nueva" style={styles.miniaturasGrid}>
              {imagenes.map((uri, index) => (
                <View
                  key={uri}
                  nativeID={`drag-img-nueva-${index}`}
                  style={[styles.miniatura, dragOverIdx === index && { opacity: 0.5, borderWidth: 2, borderColor: '#1a6470', borderRadius: 10 }]}
                >
                  <Image source={{ uri }} style={{ width: 100, height: 100, borderRadius: 10 }} />
                  <TouchableOpacity style={styles.miniaturaQuitar} onPress={() => quitarImagen(uri)}>
                    <Text style={styles.miniaturaQuitarText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.miniaturaZoom} onPress={() => setVerImagen(uri)}>
                    <Text style={styles.miniaturaZoomText}>🔍</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniaturaCensura, { left: 26 }]} onPress={() => setCensurando(uri)}>
                    <Text style={styles.miniaturaCensuraText}>🔲</Text>
                  </TouchableOpacity>
                  <View style={styles.miniaturaDragHandle}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>⠿</Text>
                  </View>
                  <View style={styles.miniaturaNro}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <FlatList
              data={imagenes}
              horizontal
              keyExtractor={(uri) => uri}
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.miniatura} activeOpacity={0.85} onPress={() => setVerImagen(item)}>
                  <Image source={{ uri: item }} style={styles.miniaturaImg} />
                  <TouchableOpacity style={styles.miniaturaQuitar} onPress={() => quitarImagen(item)}>
                    <Text style={styles.miniaturaQuitarText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.miniaturaCensura} onPress={() => setCensurando(item)}>
                    <Text style={styles.miniaturaCensuraText}>🔲</Text>
                  </TouchableOpacity>
                  <View style={styles.miniaturaZoom}>
                    <Text style={styles.miniaturaZoomText}>🔍</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )
        )}
        {Platform.OS === 'web' ? (
          <View nativeID="dropzone-nueva" style={[styles.imagenPicker, { backgroundColor: c.card, borderColor: isDragging ? '#1a6470' : c.border }, isDragging && styles.imagenPickerDragging]}>
            {/* @ts-ignore */}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
            <Text style={[styles.imagenPickerText, { color: c.textMute }]}>
              {isDragging ? '📂 Suelta las fotos aquí' : '📁 Arrastra fotos aquí o haz clic para seleccionar'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.imagenPicker, { backgroundColor: c.card, borderColor: c.border }]} onPress={seleccionarImagenes}>
            <Text style={[styles.imagenPickerText, { color: c.textMute }]}>+ Agregar fotos</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          placeholder="Ej. Casa en Venta en Juriquilla"
          value={titulo}
          onChangeText={v => { setTitulo(v); setTituloEditado(true) }}
        />

        <Text style={styles.label}>Dirección *</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: c.input, borderColor: lat ? '#22a35e' : c.inputBorder, color: c.inputText }]}
            placeholder="Ej. Corregidora, Querétaro"
            value={geoQuery}
            onChangeText={v => { setGeoQuery(v); setDireccion(v); setTituloEditado(false); setLat(null); setLng(null) }}
            maxLength={200}
          />
          {geoLoading && <ActivityIndicator size="small" color="#1976D2" style={{ marginLeft: 8 }} />}
        </View>
        {geoLoading && <Text style={{ fontSize: 11, color: '#1976D2', marginBottom: 4 }}>🔍 Buscando...</Text>}
        {lat !== null && <Text style={{ fontSize: 11, color: '#22a35e', marginBottom: 8 }}>✓ Ubicación confirmada en el mapa</Text>}

        {coloniasSugeridas.length > 0 && (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: '#22a35e', marginBottom: 8, overflow: 'hidden' }}>
            <Text style={{ fontSize: 11, color: '#22a35e', fontWeight: '700', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
              📌 Colonias conocidas:
            </Text>
            {coloniasSugeridas.slice(0, 5).map((col, i) => (
              <TouchableOpacity
                key={col.label}
                style={{ padding: 10, backgroundColor: i % 2 === 0 ? c.input : c.bg, borderTopWidth: 1, borderTopColor: c.inputBorder }}
                onPress={() => seleccionarColoniaPredefinida(col)}
              >
                <Text style={{ fontSize: 13, color: c.inputText }}>📌 {col.label} — {col.ciudad}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {geoResults.length > 0 && (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: '#1976D2', marginBottom: 12, overflow: 'hidden' }}>
            <Text style={{ fontSize: 11, color: '#1976D2', fontWeight: '700', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}>
              🔍 Resultados de búsqueda:
            </Text>
            {geoResults.map((r: any, i: number) => (
              <TouchableOpacity
                key={i}
                style={{ padding: 10, backgroundColor: i % 2 === 0 ? c.input : c.bg, borderTopWidth: 1, borderTopColor: c.inputBorder }}
                onPress={() => seleccionarUbicacion(r)}
              >
                <Text style={{ fontSize: 13, color: c.inputText }} numberOfLines={2}>📍 {r.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Operación</Text>
        <PillSelector
          options={[{ value: 'venta', label: 'Venta' }, { value: 'renta', label: 'Renta' }]}
          value={operacion}
          onChange={setOperacion}
        />

        <Text style={styles.label}>Tipo</Text>
        <PillSelector
          options={[
            { value: 'casa', label: 'Casa' },
            { value: 'departamento', label: 'Departamento' },
            { value: 'local', label: 'Local' },
            { value: 'terreno', label: 'Terreno' },
          ]}
          value={tipo}
          onChange={setTipo}
        />

        <Text style={styles.label}>Estado</Text>
        <PillSelector
          options={[{ value: 'disponible', label: 'Disponible' }, { value: 'vendida', label: 'Vendida' }]}
          value={estado}
          onChange={setEstado}
        />

        <Text style={styles.label}>Zona</Text>
        <PillSelector
          options={[
            { value: 'queretaro', label: 'Querétaro' },
            { value: 'monterrey', label: 'Monterrey' },
            { value: 'puebla', label: 'Puebla' },
          ]}
          value={zona}
          onChange={(v) => setZona(zona === v ? null : v)}
        />

        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Recámaras</Text>
            <DropdownModal options={RECAMARAS_OPTIONS} value={recamaras} onChange={setRecamaras} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Baños completos</Text>
            <DropdownModal options={BANOS_OPTIONS} value={banos} onChange={setBanos} />
          </View>
        </View>
        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Medios baños</Text>
            <DropdownModal options={MEDIOS_BANOS_OPTIONS} value={mediosBanos} onChange={setMediosBanos} />
          </View>
          <View style={{ flex: 1 }} />
        </View>

        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>M² construcción</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              placeholder="Ej. 120"
              value={m2}
              onChangeText={setM2}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>M² terreno</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              placeholder="Ej. 200"
              value={m2Terreno}
              onChangeText={setM2Terreno}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
        </View>
        <View style={styles.dosColumnas}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Estacionamientos</Text>
            <DropdownModal options={ESTACIONAMIENTOS_OPTIONS} value={estacionamientos} onChange={setEstacionamientos} />
          </View>
          <View style={{ flex: 1 }} />
        </View>

        <Text style={styles.label}>Precio (MXN)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          placeholder="Ej. 2500000"
          value={precio}
          onChangeText={setPrecio}
          keyboardType="numeric"
          maxLength={15}
        />

        <View style={styles.labelRow}>
          <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Descripción</Text>
          <TouchableOpacity style={styles.btnIA} onPress={handleMejorarDescripcion} disabled={mejorando}>
            {mejorando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnIAText}>✦ Mejorar con IA</Text>
            }
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          placeholder="Detalles de la propiedad..."
          placeholderTextColor={c.placeholder}
          value={descripcion}
          onChangeText={v => { setDescripcion(v); setMejorandoMsg('') }}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {mejorandoMsg ? (
          <Text style={{ fontSize: 12, marginTop: 4, marginBottom: 4, color: mejorandoMsg.startsWith('✓') ? '#4caf50' : '#ef5350' }}>
            {mejorandoMsg}
          </Text>
        ) : null}

        <Text style={styles.label}>Asesor de contacto</Text>
        <AsesorPicker value={asesorId} onChange={setAsesorId} />


        <View style={styles.exclusivaRow}>
          <View>
            <Text style={styles.exclusivaLabel}>Propiedad exclusiva</Text>
            <Text style={styles.exclusivaDesc}>Solo visible para Prospectadores Plus</Text>
          </View>
          <ToggleSwitch
            value={exclusiva}
            onValueChange={setExclusiva}
            trackColor={{ false: '#ddd', true: '#c0392b' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.exclusivaRow}>
          <View>
            <Text style={styles.exclusivaLabel}>Propiedad de constructora</Text>
            <Text style={styles.exclusivaDesc}>Desarrollo en construcción o con unidades nuevas</Text>
          </View>
          <ToggleSwitch
            value={esConstructora}
            onValueChange={setEsConstructora}
            trackColor={{ false: '#ddd', true: '#1a6470' }}
            thumbColor="#fff"
          />
        </View>
        {esConstructora && (
          <View style={{ marginTop: 10 }}>
            {constructorasExistentes.length > 0 && (
              <View style={styles.constrChipsRow}>
                {constructorasExistentes.map((nombre) => {
                  const activa = !modoNuevaConstructora && nombreConstructora === nombre
                  return (
                    <TouchableOpacity
                      key={nombre}
                      style={[styles.constrChip, activa && styles.constrChipActive]}
                      onPress={() => { setNombreConstructora(nombre); setModoNuevaConstructora(false) }}
                    >
                      <Text style={[styles.constrChipTxt, activa && styles.constrChipTxtActive]}>{nombre}</Text>
                    </TouchableOpacity>
                  )
                })}
                <TouchableOpacity
                  style={[styles.constrChip, styles.constrChipNueva, modoNuevaConstructora && styles.constrChipActive]}
                  onPress={() => { setModoNuevaConstructora(true); setNombreConstructora('') }}
                >
                  <Text style={[styles.constrChipTxt, modoNuevaConstructora && styles.constrChipTxtActive]}>+ Nueva</Text>
                </TouchableOpacity>
              </View>
            )}
            {(modoNuevaConstructora || constructorasExistentes.length === 0) && (
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText, marginTop: constructorasExistentes.length > 0 ? 8 : 0 }]}
                placeholder="Nombre de la constructora"
                value={nombreConstructora}
                onChangeText={setNombreConstructora}
                autoCapitalize="words"
              />
            )}
            <TouchableOpacity style={{ marginTop: 8 }} onPress={() => router.push({ pathname: '/(admin)/constructoras', params: { vista: 'contactos' } })}>
              <Text style={{ fontSize: 12, color: '#1a6470', fontWeight: '600' }}>📞 Administrar teléfonos de constructoras →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.exclusivaRow, { borderColor: '#c9a84c', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fffbf0' }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.exclusivaLabel}>📦 Guardar en Inventario</Text>
            <Text style={styles.exclusivaDesc}>No se publica al catálogo. Es una opción en seguimiento (no visible para prospectadores).</Text>
          </View>
          <ToggleSwitch
            value={esInventario}
            onValueChange={setEsInventario}
            trackColor={{ false: '#ddd', true: '#c9a84c' }}
            thumbColor="#fff"
          />
        </View>
        {esInventario && (
          <View>
            {seccionesExistentes.length > 0 && (
              <>
                <Text style={[styles.exclusivaDesc, { marginTop: 8, marginBottom: 6 }]}>Elige una sección existente o escribe una nueva abajo:</Text>
                <View style={styles.seccionChips}>
                  {seccionesExistentes.map((sec) => {
                    const activa = inventarioSeccion.trim().toLowerCase() === sec.toLowerCase()
                    return (
                      <TouchableOpacity
                        key={sec}
                        style={[styles.seccionChip, activa && styles.seccionChipActiva]}
                        onPress={() => setInventarioSeccion(activa ? '' : sec)}
                      >
                        <Text style={[styles.seccionChipTxt, activa && styles.seccionChipTxtActiva]}>{sec}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            )}
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText, marginTop: 8 }]}
              placeholder="Sección del inventario (ej. Lonas Taray Club)"
              value={inventarioSeccion}
              onChangeText={setInventarioSeccion}
              autoCapitalize="words"
            />
          </View>
        )}


        {guardado && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>✓ Propiedad guardada correctamente</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => handleGuardar()}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar propiedad</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Visor de imagen ampliada */}
      <Modal visible={verImagen !== null} transparent animationType="fade" onRequestClose={() => setVerImagen(null)}>
        <TouchableOpacity style={imgViewerStyles.overlay} activeOpacity={1} onPress={() => setVerImagen(null)}>
          {verImagen && <Image source={{ uri: verImagen }} style={imgViewerStyles.img} resizeMode="contain" />}
          <View style={imgViewerStyles.cerrar}><Text style={imgViewerStyles.cerrarTxt}>✕  Cerrar</Text></View>
        </TouchableOpacity>
      </Modal>

      <CensorEditorModal
        visible={censurando !== null}
        uri={censurando}
        onCancelar={() => setCensurando(null)}
        onAplicar={(nuevaUri) => censurando && aplicarCensura(censurando, nuevaUri)}
      />

      {/* Aviso de posibles duplicados antes de publicar */}
      <Modal visible={duplicados !== null} transparent animationType="fade" onRequestClose={() => setDuplicados(null)}>
        <View style={dupStyles.overlay}>
          <View style={dupStyles.card}>
            <Text style={dupStyles.titulo}>⚠️ Posible propiedad duplicada</Text>
            <Text style={dupStyles.sub}>
              Encontramos {duplicados?.length === 1 ? 'una propiedad parecida' : `${duplicados?.length} propiedades parecidas`} en la misma zona. Revisa que no sea la misma antes de publicar:
            </Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {(duplicados ?? []).map(d => (
                <View key={d.id} style={dupStyles.item}>
                  <Text style={dupStyles.itemCodigo}>{d.codigo}{d.dist_m != null ? `  ·  a ${d.dist_m} m` : ''}</Text>
                  <Text style={dupStyles.itemTitulo} numberOfLines={2}>{d.titulo}</Text>
                  <Text style={dupStyles.itemMeta}>
                    {d.precio != null ? `$${d.precio.toLocaleString('es-MX')}` : 'Sin precio'}
                    {d.creado_por ? `  ·  Subida por ${d.creado_por}` : ''}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={dupStyles.btnPrimary}
              onPress={() => { setDuplicados(null) }}
            >
              <Text style={dupStyles.btnPrimaryTxt}>Revisar / Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dupStyles.btnSecondary}
              onPress={() => { setDuplicados(null); handleGuardar(true) }}
            >
              <Text style={dupStyles.btnSecondaryTxt}>Publicar de todos modos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const dupStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 420 },
  titulo: { fontSize: 18, fontWeight: '800', color: '#b71c1c', marginBottom: 6 },
  sub: { fontSize: 13, color: '#555', lineHeight: 18, marginBottom: 14 },
  item: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fafafa' },
  itemCodigo: { fontSize: 11, fontWeight: '800', color: '#b71c1c', marginBottom: 2 },
  itemTitulo: { fontSize: 13, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#777' },
  btnPrimary: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  btnPrimaryTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnSecondaryTxt: { color: '#999', fontSize: 13, fontWeight: '600' },
})

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#1a6470', marginBottom: 6, marginTop: 16 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { height: 100, paddingTop: 12 },
  imagenPicker: {
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    paddingVertical: 40,
    alignItems: 'center',
    marginBottom: 4,
  },
  imagenPickerText: { fontSize: 15 },
  imagenPickerDragging: { borderColor: '#1a6470', backgroundColor: '#e8f4f5', borderStyle: 'solid' },
  miniatura: { position: 'relative', marginRight: 10 },
  miniaturaImg: { width: 100, height: 100, borderRadius: 10 },
  miniaturaZoom: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  miniaturaZoomText: { fontSize: 11 },
  miniaturaCensura: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  miniaturaCensuraText: { fontSize: 11 },
  miniaturaQuitar: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaQuitarText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  miniaturasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  miniaturaDragHandle: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  miniaturaNro: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(26,100,112,0.85)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  btnIA: {
    backgroundColor: '#4a4a8a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  btnIAText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: '#1a6470',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 40,
  },
  cancelText: { color: '#666', fontSize: 16 },
  exclusivaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  exclusivaLabel: { fontSize: 14, fontWeight: '600', color: '#1a6470' },
  exclusivaDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  constrChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  constrChip: { borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  constrChipActive: { backgroundColor: '#1a6470' },
  constrChipNueva: { borderStyle: 'dashed' },
  constrChipTxt: { fontSize: 13, fontWeight: '700', color: '#1a6470' },
  constrChipTxtActive: { color: '#fff' },
  seccionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seccionChip: {
    borderWidth: 1, borderColor: '#c9a84c', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fffbf0',
  },
  seccionChipActiva: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  seccionChipTxt: { fontSize: 13, color: '#8a6d1a', fontWeight: '600' },
  seccionChipTxtActiva: { color: '#fff', fontWeight: '800' },
  successBanner: {
    backgroundColor: '#e8f5e9', borderRadius: 10, borderWidth: 1,
    borderColor: '#a5d6a7', paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'center', marginTop: 24,
  },
  successText: { color: '#2e7d32', fontSize: 15, fontWeight: '700' },
  fichaBox: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#d4e8ea', padding: 14, marginBottom: 8,
  },
  fichaToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fichaToggleText: { fontSize: 14, fontWeight: '700', color: '#1a6470' },
  fichaChevron: { fontSize: 12, color: '#1a6470' },
  fichaMsg: { fontSize: 12, color: '#2e7d32', marginTop: 6, fontWeight: '600' },
})

const imgViewerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  img: { width: '100%', height: '82%' },
  cerrar: { position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  cerrarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
