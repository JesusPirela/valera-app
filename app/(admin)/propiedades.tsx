import { useState, useCallback, useRef, useEffect } from 'react'
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
  useWindowDimensions,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import { normalizar } from '../../lib/texto'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

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
  destacada_hasta: string | null
  es_constructora: boolean | null
  nombre_constructora: string | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  m2: number | null
  m2_terreno: number | null
  estacionamientos: number | null
  inmobiliaria_id: string | null
  es_inventario: boolean | null
  inmobiliarias: { nombre: string; logo_url: string | null; exclusiva: boolean } | null
  asesores: { nombre: string; inmobiliaria: string | null } | null
  propiedad_imagenes: { url: string; orden: number }[]
}

function contactoLabel(p: { asesores?: { nombre: string; inmobiliaria: string | null } | null; inmobiliarias?: { nombre: string } | null }): string | null {
  const asesor = p.asesores?.nombre?.trim() || null
  const empresa = p.inmobiliarias?.nombre?.trim() || p.asesores?.inmobiliaria?.trim() || null
  if (asesor && empresa) return `${asesor} — ${empresa}`
  return asesor ?? empresa ?? null
}

type FiltroOperacion = 'venta' | 'renta' | null
type FiltroEstado = 'disponible' | 'vendida' | null
type FiltroTipo = 'casa' | 'departamento' | 'local' | 'terreno' | null
type OrdenPrecio = 'asc' | 'desc' | null
type OrdenPublicaciones = 'desc' | 'asc' | null

const NAV_ITEMS = [
  { label: 'Nueva', icon: '＋', route: '/(admin)/nueva-propiedad', color: '#1976D2', grupo: 'Propiedades' },
  { label: 'Constructoras', icon: '🏗️', route: '/(admin)/constructoras', color: '#455A64', grupo: 'Propiedades' },
  { label: 'Bloques', icon: '🧩', route: '/(admin)/bloques', color: '#5e35b1', grupo: 'Propiedades' },
  { label: 'Colores ficha', icon: '🎨', route: '/(admin)/colores-ficha', color: '#6A1B9A', grupo: 'Propiedades' },
  { label: 'CRM', icon: '📒', route: '/(admin)/crm', color: '#D84315', grupo: 'Gestión' },
  { label: 'Citas', icon: '📅', route: '/(admin)/coordinacion-citas', color: '#2E7D32', grupo: 'Gestión' },
  { label: 'Proyectos', icon: '💼', route: '/(admin)/proyectos', color: '#c9a84c', grupo: 'Gestión' },
  { label: 'Usuarios', icon: '👥', route: '/(admin)/prospectadores', color: '#C62828', grupo: 'Gestión' },
  { label: 'Estadísticas', icon: '📊', route: '/(admin)/estadisticas', color: '#00838F', grupo: 'Gestión' },
  { label: 'Actividad', icon: '📋', route: '/(admin)/actividad', color: '#7B1FA2', grupo: 'Gestión' },
  { label: 'Universidad', icon: '🎓', route: '/(admin)/university', color: '#F57F17', grupo: 'Crecimiento' },
  { label: 'Tienda', icon: '🛒', route: '/(admin)/tienda-compras', color: '#558B2F', grupo: 'Crecimiento' },
  { label: 'Pool Leads', icon: '🔥', route: '/(admin)/leads-pool', color: '#B71C1C', grupo: 'Crecimiento' },
  { label: 'Misiones', icon: '🎯', route: '/(admin)/misiones', color: '#AD1457', grupo: 'Crecimiento' },
  { label: 'Cofres', icon: '🎁', route: '/(admin)/gestion-cofres', color: '#2e7d32', grupo: 'Crecimiento' },
  { label: 'Cuenta', icon: '👤', route: '/(admin)/cuenta', color: '#37474F', grupo: 'Gestión' },
]

const NAV_GRUPOS = ['Propiedades', 'Gestión', 'Crecimiento']

// En web, las filas de chips horizontales no se pueden arrastrar con el mouse
// (sin scrollbar visible) y la rueda del mouse solo hace scroll vertical. Este
// hook traduce el scroll vertical de la rueda en scroll horizontal de la fila.
// Se usa un listener nativo (no el prop onWheel de React) con passive:false,
// porque React adjunta "wheel" como passive por defecto y ahí preventDefault()
// no funciona — por eso el scroll seguía "filtrando" hacia la página completa.
function useScrollHorizontalConRueda() {
  const ref = useRef<any>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = ref.current?.getScrollableNode?.() ?? ref.current
    if (!node) return
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      node.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
  }, [])
  return ref
}

function FiltroChip({ label, active, onPress, textSubColor }: { label: string; active: boolean; onPress: () => void; textSubColor: string }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, { color: textSubColor }, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function AdminPropiedades() {
  useSupervisorBlock()
  const c = useColors()
  const scrollOperacionRef = useScrollHorizontalConRueda()
  const scrollEstadoRef = useScrollHorizontalConRueda()
  const scrollTipoRef = useScrollHorizontalConRueda()
  const scrollPrecioRef = useScrollHorizontalConRueda()
  const scrollPublicacionesRef = useScrollHorizontalConRueda()
  const scrollContactoRef = useScrollHorizontalConRueda()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const yaCargoRef = useRef(false)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const [filtroOperacion, setFiltroOperacion] = useState<FiltroOperacion>(null)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(null)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>(null)
  const [ordenPrecio, setOrdenPrecio] = useState<OrdenPrecio>(null)
  const [ordenPublicaciones, setOrdenPublicaciones] = useState<OrdenPublicaciones>(null)
  const [publicacionesMap, setPublicacionesMap] = useState<Record<string, number>>({})
  const [comprasPendientes, setComprasPendientes] = useState(0)
  const [busquedaContacto, setBusquedaContacto] = useState('')

  const [modalVisible, setModalVisible] = useState(false)
  const [propSeleccionada, setPropSeleccionada] = useState<Propiedad | null>(null)
  const [mensajeDestacado, setMensajeDestacado] = useState('')
  const [diasDestacado, setDiasDestacado] = useState<7 | 15 | 30 | 60 | null>(null)
  const [guardandoDestacado, setGuardandoDestacado] = useState(false)

  const [role, setRole] = useState<string | null>(null)
  const esSupervisor = role === 'supervisor'

  // Web: renderizado incremental para no montar 1000+ tarjetas/imágenes de golpe
  const PAGE_WEB = 24
  const [visibleCount, setVisibleCount] = useState(PAGE_WEB)

  async function cargarPropiedades() {
    if (yaCargoRef.current === false) setLoading(true)
    // Paginar: PostgREST corta en 1000 filas/petición. Sin esto, las
    // propiedades más viejas (códigos VR bajos) no se cargan ni se pueden buscar.
    const PAGE = 1000
    let todas: any[] = []
    let huboError = false
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('propiedades')
        .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, destacada_hasta, es_constructora, nombre_constructora, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, inmobiliaria_id, es_inventario, inmobiliarias(nombre, logo_url, exclusiva), asesores(nombre, inmobiliaria), propiedad_imagenes(url, orden)')
        .order('created_at', { ascending: false })
        .order('orden', { referencedTable: 'propiedad_imagenes', ascending: true })
        .limit(1, { referencedTable: 'propiedad_imagenes' })
        .range(from, from + PAGE - 1)
      if (error) { huboError = true; break }
      todas = todas.concat(data ?? [])
      if (!data || data.length < PAGE) break
    }
    if (huboError) Alert.alert('Error', 'No se pudieron cargar las propiedades.')
    else {
      const normalizadas = todas.map((p: any) => ({
        ...p,
        inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
        asesores: Array.isArray(p.asesores) ? p.asesores[0] ?? null : p.asesores,
      }))
      setPropiedades(normalizadas)
      yaCargoRef.current = true
    }
    setLoading(false)
  }

  async function cargarRolEInmobiliarias() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null
    const [perfilRes, conteoRes, pendRes] = await Promise.all([
      uid ? supabase.from('profiles').select('role').eq('id', uid).maybeSingle() : Promise.resolve({ data: null }),
      supabase.rpc('get_publicaciones_conteo'),
      supabase.rpc('get_compras_pendientes_count'),
    ])
    setRole((perfilRes as any).data?.role ?? null)
    const conteo = (conteoRes as any).data
    if (conteo) {
      setPublicacionesMap(Object.fromEntries(
        (conteo as { propiedad_id: string; total: number }[]).map((r) => [r.propiedad_id, r.total])
      ))
    }
    setComprasPendientes(typeof (pendRes as any).data === 'number' ? (pendRes as any).data : 0)
  }

  useFocusEffect(useCallback(() => { cargarPropiedades(); cargarRolEInmobiliarias() }, []))

  const navItems = esSupervisor
    ? NAV_ITEMS.filter((item) => ![
        '/(admin)/nueva-propiedad',
        '/(admin)/university',
        '/(admin)/tienda-compras',
        '/(admin)/misiones',
        '/(admin)/gestion-cofres',
        '/(admin)/prospectadores',
        '/(admin)/bloques',
        '/(admin)/colores-ficha',
        '/(admin)/cuenta',
      ].includes(item.route))
    : NAV_ITEMS

  const filtrosActivos = [filtroOperacion, filtroEstado, filtroTipo, ordenPrecio, ordenPublicaciones, busquedaContacto].filter(Boolean).length

  const inventarioCount = propiedades.filter((p) => p.es_inventario).length
  let propiedadesFiltradas = propiedades.filter((p) => !p.es_inventario)
  if (busqueda.trim()) {
    const q = normalizar(busqueda.trim())
    const qDigits = q.replace(/\D/g, '')
    propiedadesFiltradas = propiedadesFiltradas.filter((p) => {
      const cod = normalizar(p.codigo)
      const codMatch = cod.includes(q) || (qDigits !== '' && cod.replace(/\D/g, '').includes(qDigits))
      return codMatch || normalizar(p.direccion).includes(q) || normalizar(p.titulo).includes(q)
    })
  }
  if (filtroOperacion) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.operacion === filtroOperacion)
  if (filtroEstado) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.estado === filtroEstado)
  if (filtroTipo) propiedadesFiltradas = propiedadesFiltradas.filter((p) => p.tipo === filtroTipo)
  // Base para las sugerencias de "Contacto responsable": antes de aplicar el
  // propio filtro de contacto, pero después de los demás filtros activos. Así
  // un chip sugerido siempre tiene al menos 1 resultado al hacer clic — antes
  // se construían desde TODAS las propiedades sin filtrar, así que un chip
  // podía no tener ninguna coincidencia dentro de lo que ya estaba filtrado.
  const propiedadesParaSugerenciasContacto = propiedadesFiltradas
  if (busquedaContacto.trim()) {
    const qc = normalizar(busquedaContacto.trim())
    propiedadesFiltradas = propiedadesFiltradas.filter((p) => {
      const label = contactoLabel(p)
      return label ? normalizar(label).includes(qc) : false
    })
  }
  if (ordenPrecio) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) =>
      ordenPrecio === 'asc'
        ? (a.precio ?? Infinity) - (b.precio ?? Infinity)
        : (b.precio ?? -Infinity) - (a.precio ?? -Infinity)
    )
  }
  if (ordenPublicaciones) {
    propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) => {
      const pa = publicacionesMap[a.id] ?? 0
      const pb = publicacionesMap[b.id] ?? 0
      return ordenPublicaciones === 'desc' ? pb - pa : pa - pb
    })
  }

  // Destacadas siempre al tope (dentro de lo que queda tras filtros y sort)
  const ahora = Date.now()
  const estaDestacada = (p: Propiedad) =>
    p.destacada && (!p.destacada_hasta || new Date(p.destacada_hasta).getTime() > ahora)
  propiedadesFiltradas = [...propiedadesFiltradas].sort((a, b) => {
    const aD = estaDestacada(a) ? 1 : 0
    const bD = estaDestacada(b) ? 1 : 0
    return bD - aD
  })

  // Al cambiar cualquier filtro/búsqueda, volver al primer bloque visible
  useEffect(() => { setVisibleCount(PAGE_WEB) }, [
    busqueda, filtroOperacion, filtroEstado, filtroTipo, ordenPrecio,
    ordenPublicaciones, busquedaContacto,
  ])

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
    setDiasDestacado(null)
    setModalVisible(true)
  }

  async function confirmarDestacar() {
    if (!propSeleccionada) return
    setGuardandoDestacado(true)
    const { error } = await supabase.rpc('destacar_propiedad_manual', {
      p_id: propSeleccionada.id,
      p_mensaje: mensajeDestacado.trim() || null,
      p_dias: diasDestacado,
    })
    setGuardandoDestacado(false)
    setModalVisible(false)
    if (error) {
      Alert.alert('Error', 'No se pudo destacar la propiedad.')
    } else {
      const hasta = diasDestacado
        ? new Date(Date.now() + diasDestacado * 86400_000).toISOString()
        : null
      setPropiedades((prev) =>
        prev.map((p) =>
          p.id === propSeleccionada.id
            ? {
                ...p,
                destacada: true,
                destacada_mensaje: mensajeDestacado.trim() || 'El administrador ha destacado esta propiedad como una oportunidad especial.',
                destacada_hasta: hasta,
              }
            : p
        )
      )
    }
  }

  async function quitarDestacada(id: string) {
    const { error } = await supabase.rpc('quitar_destacada', { p_id: id })
    if (!error) setPropiedades((prev) => prev.map((p) => p.id === id ? { ...p, destacada: false, destacada_mensaje: null, destacada_hasta: null } : p))
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
    setOrdenPublicaciones(null)
    setBusquedaContacto('')
  }

  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const numCols = isWeb ? 4 : 1
  const contentWidth = screenWidth - 32
  const cardWidth = isWeb ? (contentWidth - 16 * (numCols - 1)) / numCols : undefined

  // Shared header: navGrid + search + inventario + filtros
  const pageHeader = (
    <>
      {NAV_GRUPOS.map((grupo) => {
        const items = navItems.filter((item) => item.grupo === grupo)
        if (items.length === 0) return null
        return (
          <View key={grupo} style={styles.navGroup}>
            <Text style={[styles.navGroupTitle, { color: c.textMute }]}>{grupo.toUpperCase()}</Text>
            <View style={styles.navGrid}>
              {items.map((item) => {
                const badge = item.route === '/(admin)/tienda-compras' ? comprasPendientes : 0
                return (
                  <TouchableOpacity
                    key={item.route}
                    style={[styles.navCard, { backgroundColor: item.color }]}
                    onPress={() => router.push(item.route as any)}
                  >
                    <Text style={styles.navIcon}>{item.icon}</Text>
                    <Text style={styles.navLabel}>{item.label}</Text>
                    {badge > 0 && (
                      <View style={styles.navBadge}>
                        <Text style={styles.navBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )
      })}

      <View style={[styles.searchRow, { backgroundColor: c.card, borderColor: c.inputBorder }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: c.inputText }]}
          placeholder="Buscar por código, título o dirección..."
          placeholderTextColor={c.placeholder}
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

      {!esSupervisor && (
        <TouchableOpacity style={styles.inventarioBtn} onPress={() => router.push('/(admin)/inventario')}>
          <Text style={styles.inventarioBtnIcon}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.inventarioBtnTitle}>Inventario</Text>
          </View>
          {inventarioCount > 0 && (
            <View style={styles.inventarioBadge}>
              <Text style={styles.inventarioBadgeText}>{inventarioCount}</Text>
            </View>
          )}
          <Text style={styles.inventarioChevron}>›</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.filtrosToggle} onPress={() => setMostrarFiltros((v) => !v)}>
        <Text style={styles.filtrosToggleText}>
          {filtrosActivos > 0 ? `Filtros (${filtrosActivos}) ` : 'Filtros '}
          {mostrarFiltros ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {mostrarFiltros && (
        <View style={[styles.filtrosPanel, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.filtroLabel, { color: c.textMute }]}>Operación</Text>
          <ScrollView ref={scrollOperacionRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todas" active={filtroOperacion === null} onPress={() => setFiltroOperacion(null)} textSubColor={c.textSub}  textSubColor={c.textSub}/>
            <FiltroChip label="Venta" active={filtroOperacion === 'venta'} onPress={() => setFiltroOperacion(filtroOperacion === 'venta' ? null : 'venta')} textSubColor={c.textSub}  textSubColor={c.textSub}/>
            <FiltroChip label="Renta" active={filtroOperacion === 'renta'} onPress={() => setFiltroOperacion(filtroOperacion === 'renta' ? null : 'renta')} textSubColor={c.textSub}  textSubColor={c.textSub}/>
          </ScrollView>
          <Text style={[styles.filtroLabel, { color: c.textMute }]}>Estado</Text>
          <ScrollView ref={scrollEstadoRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todos" active={filtroEstado === null} onPress={() => setFiltroEstado(null)}  textSubColor={c.textSub}/>
            <FiltroChip label="Disponible" active={filtroEstado === 'disponible'} onPress={() => setFiltroEstado(filtroEstado === 'disponible' ? null : 'disponible')}  textSubColor={c.textSub}/>
            <FiltroChip label="Vendida" active={filtroEstado === 'vendida'} onPress={() => setFiltroEstado(filtroEstado === 'vendida' ? null : 'vendida')}  textSubColor={c.textSub}/>
          </ScrollView>
          <Text style={[styles.filtroLabel, { color: c.textMute }]}>Tipo</Text>
          <ScrollView ref={scrollTipoRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Todos" active={filtroTipo === null} onPress={() => setFiltroTipo(null)}  textSubColor={c.textSub}/>
            <FiltroChip label="Casa" active={filtroTipo === 'casa'} onPress={() => setFiltroTipo(filtroTipo === 'casa' ? null : 'casa')}  textSubColor={c.textSub}/>
            <FiltroChip label="Departamento" active={filtroTipo === 'departamento'} onPress={() => setFiltroTipo(filtroTipo === 'departamento' ? null : 'departamento')}  textSubColor={c.textSub}/>
            <FiltroChip label="Local" active={filtroTipo === 'local'} onPress={() => setFiltroTipo(filtroTipo === 'local' ? null : 'local')}  textSubColor={c.textSub}/>
            <FiltroChip label="Terreno" active={filtroTipo === 'terreno'} onPress={() => setFiltroTipo(filtroTipo === 'terreno' ? null : 'terreno')}  textSubColor={c.textSub}/>
          </ScrollView>
          <Text style={[styles.filtroLabel, { color: c.textMute }]}>Precio</Text>
          <ScrollView ref={scrollPrecioRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Sin orden" active={ordenPrecio === null} onPress={() => setOrdenPrecio(null)}  textSubColor={c.textSub}/>
            <FiltroChip label="↑ Menor" active={ordenPrecio === 'asc'} onPress={() => setOrdenPrecio(ordenPrecio === 'asc' ? null : 'asc')}  textSubColor={c.textSub}/>
            <FiltroChip label="↓ Mayor" active={ordenPrecio === 'desc'} onPress={() => setOrdenPrecio(ordenPrecio === 'desc' ? null : 'desc')}  textSubColor={c.textSub}/>
          </ScrollView>
          <Text style={[styles.filtroLabel, { color: c.textMute }]}>Publicaciones</Text>
          <ScrollView ref={scrollPublicacionesRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <FiltroChip label="Sin orden" active={ordenPublicaciones === null} onPress={() => setOrdenPublicaciones(null)}  textSubColor={c.textSub}/>
            <FiltroChip label="🔥 Más publicadas" active={ordenPublicaciones === 'desc'} onPress={() => setOrdenPublicaciones(ordenPublicaciones === 'desc' ? null : 'desc')}  textSubColor={c.textSub}/>
            <FiltroChip label="Menos publicadas" active={ordenPublicaciones === 'asc'} onPress={() => setOrdenPublicaciones(ordenPublicaciones === 'asc' ? null : 'asc')}  textSubColor={c.textSub}/>
          </ScrollView>
          {(() => {
            // Sugerencias: etiquetas únicas que coinciden con el texto escrito
            const qc = normalizar(busquedaContacto.trim())
            const labels = new Set<string>()
            propiedadesParaSugerenciasContacto.forEach(p => {
              const l = contactoLabel(p)
              if (l) labels.add(l)
            })
            const sugerencias = Array.from(labels)
              .filter(l => !qc || normalizar(l).includes(qc))
              .sort()
            return (
              <>
                <Text style={[styles.filtroLabel, { color: c.textMute }]}>Contacto responsable</Text>
                <View style={styles.contactoInputRow}>
                  <TextInput
                    style={[styles.contactoInput, { color: c.inputText, borderColor: busquedaContacto ? '#1a6470' : c.border }]}
                    placeholder="Buscar asesor o inmobiliaria..."
                    placeholderTextColor={c.placeholder}
                    value={busquedaContacto}
                    onChangeText={setBusquedaContacto}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {busquedaContacto.length > 0 && (
                    <TouchableOpacity onPress={() => setBusquedaContacto('')} style={styles.contactoLimpiar}>
                      <Text style={{ color: '#888', fontSize: 13 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {sugerencias.length > 0 && (
                  <ScrollView ref={scrollContactoRef} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                    {sugerencias.map(label => (
                      <FiltroChip
                        key={label}
                        label={label}
                        active={normalizar(busquedaContacto.trim()) === normalizar(label)}
                        onPress={() => setBusquedaContacto(busquedaContacto.trim() === label ? '' : label)}
                        textSubColor={c.textSub}
                      />
                    ))}
                  </ScrollView>
                )}
              </>
            )
          })()}
          {filtrosActivos > 0 && (
            <TouchableOpacity style={styles.limpiarBtn} onPress={limpiarFiltros}>
              <Text style={styles.limpiarText}>Limpiar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  )

  function renderCardContent(item: Propiedad, width?: number) {
    const primera = [...(item.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
    const tieneMeta = item.recamaras != null || item.banos != null || item.medios_banos != null || item.m2 != null || item.m2_terreno != null || item.estacionamientos != null
    const CardWrapper: any = esSupervisor ? TouchableOpacity : View
    return (
      <CardWrapper
        key={item.id}
        style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, item.destacada && styles.cardDestacada, width ? { width } : undefined]}
        {...(esSupervisor ? {
          activeOpacity: 0.85,
          onPress: () => router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: item.id } }),
        } : {})}
      >
        <View style={styles.imagenWrapper}>
          {primera?.url ? (
            <Image source={{ uri: thumb(primera.url, { width: 640, quality: 65 }) }} style={styles.cardImagen} />
          ) : (
            <View style={styles.cardImagenPlaceholder}>
              <Text style={styles.cardImagenPlaceholderText}>🏠</Text>
            </View>
          )}
          <View style={styles.imagenOverlay} />
          <View style={styles.badgesTop}>
            <Text style={styles.codigoBadge}>{item.codigo ?? '—'}</Text>
            {item.destacada && <Text style={styles.destacadaBadge}>★ Destacada</Text>}
            <View style={[styles.estadoBadge, item.estado === 'vendida' && styles.estadoVendida]}>
              <Text style={[styles.estadoText, item.estado === 'vendida' && styles.estadoTextVendida]}>
                {item.estado === 'vendida' ? 'Vendida' : 'Disponible'}
              </Text>
            </View>
          </View>
          <View style={styles.precioBadge}>
            <Text style={styles.precioText}>{formatPrecio(item.precio)}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          {item.destacada && item.destacada_mensaje ? (
            <Text style={styles.destacadaMensaje}>{item.destacada_mensaje}</Text>
          ) : null}
          {item.destacada && item.destacada_hasta ? (
            <Text style={styles.destacadaHasta}>
              ⏱ Destacada hasta {new Date(item.destacada_hasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
          {item.tipo && (
            <Text style={[styles.cardTipo, { color: c.textMute }]}>
              {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
              {item.operacion ? ` · ${item.operacion}` : ''}
            </Text>
          )}
          {item.es_constructora && (
            <Text style={styles.constructoraBadge}>
              🏗️ {item.nombre_constructora ? item.nombre_constructora : 'Constructora'}
            </Text>
          )}
          <Text style={[styles.cardTitulo, { color: c.text }]}>{item.titulo}</Text>
          <Text style={[styles.cardDireccion, { color: c.textMute }]} numberOfLines={1}>📍 {item.direccion}</Text>
          {contactoLabel(item) && (
            <Text style={[styles.contactoBadge, { color: c.textMute }]} numberOfLines={1}>👤 {contactoLabel(item)}</Text>
          )}
          <Text style={styles.pubBadge}>📤 {publicacionesMap[item.id] ?? 0} publicaciones</Text>
          {tieneMeta && (
            <View style={styles.metaRow}>
              {item.recamaras != null && <Text style={styles.metaItem}>🛏 {item.recamaras}</Text>}
              {item.banos != null && <Text style={styles.metaItem}>🚿 {item.banos}</Text>}
              {item.medios_banos != null && item.medios_banos > 0 && <Text style={styles.metaItem}>🚿 ½ {item.medios_banos}</Text>}
              {item.m2 != null && <Text style={styles.metaItem}>📐 {item.m2}m² const.</Text>}
              {item.m2_terreno != null && <Text style={styles.metaItem}>🌳 {item.m2_terreno}m² terr.</Text>}
              {item.estacionamientos != null && <Text style={styles.metaItem}>🚗 {item.estacionamientos}</Text>}
            </View>
          )}
          {!esSupervisor && (
            <>
              <TouchableOpacity
                style={styles.btnVerComoUsuario}
                onPress={() => router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: item.id } })}
              >
                <Text style={styles.btnVerComoUsuarioText}>👁 Ver como usuario</Text>
              </TouchableOpacity>
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
            </>
          )}
        </View>
      </CardWrapper>
    )
  }

  const emptyView = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🏠</Text>
      <Text style={styles.emptyText}>
        {busqueda.trim() || filtrosActivos > 0 ? 'Sin resultados para esa búsqueda.' : 'No hay propiedades aún.'}
      </Text>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {isWeb ? (
        // Web: un solo ScrollView que abarca toda la página (navGrid → filtros → tarjetas)
        // Así el scrollbar aparece desde el inicio y los filtros no bloquean el scroll.
        <ScrollView
          contentContainerStyle={styles.webOuterContent}
          showsVerticalScrollIndicator
          scrollEventThrottle={200}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) {
              setVisibleCount(v => v < propiedadesFiltradas.length ? v + PAGE_WEB : v)
            }
          }}
        >
          {pageHeader}
          {loading ? (
            <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
          ) : propiedadesFiltradas.length === 0 ? emptyView : (
            <>
              <View style={styles.webGrid}>
                {propiedadesFiltradas.slice(0, visibleCount).map((item) => renderCardContent(item, cardWidth))}
              </View>
              {visibleCount < propiedadesFiltradas.length && (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1a6470" />
                  <Text style={{ color: c.textMute, fontSize: 12, marginTop: 6 }}>
                    Mostrando {visibleCount} de {propiedadesFiltradas.length}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        // Mobile: navGrid + filtros fijos arriba, FlatList para las tarjetas
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
          {pageHeader}
          {loading ? (
            <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
          ) : propiedadesFiltradas.length === 0 ? emptyView : (
            <FlatList
              data={propiedadesFiltradas}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => renderCardContent(item)}
            />
          )}
        </View>
      )}

      {/* Modal destacar */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Destacar propiedad</Text>
            <Text style={styles.modalSubtitulo}>
              {propSeleccionada?.codigo} – {propSeleccionada?.titulo}
            </Text>
            <Text style={[styles.modalLabel, { color: c.textSub }]}>Duración del destacado (opcional)</Text>
            <View style={styles.duracionRow}>
              {([null, 7, 15, 30, 60] as const).map((d) => {
                const label = d === null ? 'Sin límite' : d === 60 ? '2 meses' : `${d} días`
                const activo = diasDestacado === d
                return (
                  <TouchableOpacity
                    key={String(d)}
                    style={[styles.duracionChip, activo && styles.duracionChipActivo]}
                    onPress={() => setDiasDestacado(d)}
                  >
                    <Text style={[styles.duracionChipText, activo && styles.duracionChipTextActivo]}>{label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={[styles.modalLabel, { color: c.textSub, marginTop: 12 }]}>Mensaje para los prospectadores (opcional)</Text>
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
  // Web: el contentContainer del ScrollView global
  webOuterContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  webGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16, marginTop: 8 },

  // Grid de navegación agrupado por categoría, 4 columnas
  navGroup: { marginBottom: 14 },
  navGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navCard: {
    width: '23%',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  navIcon: { fontSize: 16 },
  navLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  navBadge: {
    position: 'absolute', top: -5, right: -5,
    backgroundColor: '#e53935', borderRadius: 11, minWidth: 22, height: 22,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    borderWidth: 2, borderColor: '#fff',
  },
  navBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

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
  },
  clearBtn: { padding: 4 },
  clearBtnText: { color: '#aaa', fontSize: 16 },

  // Inventario
  inventarioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fffbf0',
    borderColor: '#c9a84c',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  inventarioBtnIcon: { fontSize: 20 },
  inventarioBtnTitle: { fontSize: 15, fontWeight: '800', color: '#8a6d1a' },
  inventarioBtnSub: { fontSize: 11, color: '#a8893f', marginTop: 1 },
  inventarioBadge: {
    backgroundColor: '#c9a84c',
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  inventarioBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  inventarioChevron: { fontSize: 22, color: '#c9a84c', fontWeight: '700' },

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
  filtroLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  chipText: { fontSize: 12 },
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
  destacadaHasta: {
    fontSize: 11,
    color: '#9e7a00',
    marginBottom: 6,
    fontWeight: '600',
  },
  cardTipo: { fontSize: 11, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
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
  cardTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardDireccion: { fontSize: 13, marginBottom: 4 },
  pubBadge: { fontSize: 12, fontWeight: '700', color: '#7B1FA2', marginBottom: 10 },
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
  btnVerComoUsuario: {
    borderWidth: 1.5,
    borderColor: '#7B1FA2',
    backgroundColor: '#f6eefb',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnVerComoUsuarioText: { color: '#7B1FA2', fontSize: 13, fontWeight: '700' },
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
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dde8e9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 8,
  },
  contactoInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  contactoInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
  },
  contactoLimpiar: { paddingHorizontal: 10, paddingVertical: 8 },
  contactoBadge: { fontSize: 12, marginBottom: 4 },
  duracionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  duracionChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#ccc', backgroundColor: '#f5f5f5',
  },
  duracionChipActivo: { borderColor: '#1a6470', backgroundColor: '#e8f4f5' },
  duracionChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  duracionChipTextActivo: { color: '#1a6470' },
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
