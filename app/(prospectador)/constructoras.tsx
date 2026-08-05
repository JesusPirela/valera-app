import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput,
} from 'react-native'
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { LinearGradient } from 'expo-linear-gradient'
import { useVistaComo } from '../../lib/VistaComo'
import { normalizar } from '../../lib/texto'
import { zonaDetallada } from '../../lib/zonas-interes'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type ConstructoraInfo = {
  nombre: string
  empresa_matriz: string | null
  imagen_portada: string | null
}

type Modelo = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  nombre_constructora: string | null
  zona: string | null
  direccion: string | null
  exclusiva: boolean | null
  inmobiliarias: { exclusiva: boolean } | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number }[]
}

// Modelo + su fraccionamiento/colonia ya calculado (para no recalcular en cada render).
type ModeloZona = Modelo & { zonaDet: string; ciudad: string }

const CIUDAD_LABELS: Record<string, string> = {
  queretaro: 'Querétaro', monterrey: 'Monterrey', puebla: 'Puebla',
}
const SIN_ZONA = 'Otras zonas'
const SIN_CONSTRUCTORA = 'Sin constructora'

// ─── Constructoras reconocidas en el mercado (investigación QRO/MTY/PUE) ─────
const POPULARES_KW = [
  'riscos', 'intercity', 'belena', 'atlas', 'caisa', 'emma', 'amaia', 'alegra',
  'xanadu', 'xanadú', 'pdr', 'mykonos', 'imarhi', 'investti', 'valencia',
  'solare', 'santaluz', 'alleza', 'castello', 'mezquite', 'himalaya', 'privalia',
  'varella', 'tekno', 'gran valle', 'aurea', 'iolita', 'ciudad marques', 'fuerte santiago',
]
function esPopularMercado(nombre: string): boolean {
  const n = normalizar(nombre)
  return POPULARES_KW.some(kw => n.includes(kw))
}

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}



export default function Constructoras() {
  const c = useColors()
  const { vistaComo } = useVistaComo()
  const { q } = useLocalSearchParams<{ q?: string }>()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [constructorasInfo, setConstructorasInfo] = useState<ConstructoraInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const [busqueda, setBusqueda] = useState(q ?? '')
  const [zonaSel, setZonaSel] = useState<string | null>(null)
  const [viewsMap, setViewsMap] = useState<Map<string, { count: number; lastViewed: number }>>(new Map())

  useFocusEffect(useCallback(() => { cargar() }, []))
  const { refreshControl } = usePullRefresh(cargar)

  async function consultarModelos() {
    return supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, zona, direccion, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, thumb_url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })
      .order('precio', { ascending: true, nullsFirst: false })
  }

  async function cargar() {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    let rolActual: string | null = null
    let perfilRol: string | null = null
    if (userId) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      perfilRol = data?.role ?? null
      rolActual = data?.role ?? null
    }
    rolActual = vistaComo ?? rolActual  // rol efectivo (admin "viendo como")

    // Cargar info de constructoras (imagen_portada siempre; empresa_matriz para staff)
    const { data: cData } = await supabase
      .from('constructoras')
      .select('nombre, empresa_matriz, imagen_portada')
    setConstructorasInfo((cData ?? []) as ConstructoraInfo[])

    let { data, error } = await consultarModelos()
    // En web la sesión puede tardar unos ms en adjuntarse; reintentar una vez.
    if ((error || !data || data.length === 0) && userId) {
      await new Promise((r) => setTimeout(r, 500))
      const retry = await consultarModelos()
      data = retry.data
    }

    let lista = (data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Modelo[]

    if (rolActual !== 'prospectador_plus' && rolActual !== 'admin' && rolActual !== 'supervisor' && rolActual !== 'asesor') {
      lista = lista.filter((p) => !p.exclusiva && !p.inmobiliarias?.exclusiva)
    }

    setModelos(lista)
    setLoading(false)

    // Cargar historial de vistas del usuario para el orden personalizado.
    if (userId) {
      supabase
        .from('property_views')
        .select('propiedad_id, view_count, last_viewed_at')
        .eq('user_id', userId)
        .then(({ data: vData }) => {
          const m = new Map<string, { count: number; lastViewed: number }>()
          for (const r of vData ?? []) {
            m.set(r.propiedad_id, {
              count: r.view_count,
              lastViewed: new Date(r.last_viewed_at).getTime(),
            })
          }
          setViewsMap(m)
        })
    }
  }

  // Cada modelo con su fraccionamiento/colonia (derivado de dirección + título).
  const enriquecidos: ModeloZona[] = useMemo(() => modelos.map(m => ({
    ...m,
    zonaDet: zonaDetallada(`${m.direccion ?? ''} ${m.titulo ?? ''}`) ?? SIN_ZONA,
    ciudad: m.zona ? (CIUDAD_LABELS[m.zona] ?? m.zona) : '',
  })), [modelos])

  // Fraccionamientos disponibles + conteo, ordenados por cantidad de modelos.
  const zonasDisponibles = useMemo(() => {
    const cont = new Map<string, number>()
    for (const m of enriquecidos) cont.set(m.zonaDet, (cont.get(m.zonaDet) ?? 0) + 1)
    return Array.from(cont.entries())
      .sort((a, b) => {
        if (a[0] === SIN_ZONA) return 1       // "Otras zonas" siempre al final
        if (b[0] === SIN_ZONA) return -1
        return b[1] - a[1]
      })
      .map(([nombre, n]) => ({ nombre, n }))
  }, [enriquecidos])

  // Aplicar búsqueda de texto + fraccionamiento seleccionado.
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return enriquecidos.filter(m => {
      if (zonaSel && m.zonaDet !== zonaSel) return false
      if (!q) return true
      return (
        normalizar(m.nombre_constructora ?? '').includes(q) ||
        normalizar(m.titulo ?? '').includes(q) ||
        normalizar(m.codigo ?? '').includes(q) ||
        normalizar(m.zonaDet).includes(q) ||
        normalizar(m.direccion ?? '').includes(q)
      )
    })
  }, [enriquecidos, busqueda, zonaSel])

  // Agrupar: fraccionamiento → constructora.
  const zonaGrupos = useMemo(() => {
    const porZona = new Map<string, ModeloZona[]>()
    for (const m of filtrados) {
      if (!porZona.has(m.zonaDet)) porZona.set(m.zonaDet, [])
      porZona.get(m.zonaDet)!.push(m)
    }
    // Ordenar zonas como en las chips (por cantidad, "Otras" al final).
    const orden = new Map(zonasDisponibles.map((z, i) => [z.nombre, i]))
    return Array.from(porZona.entries())
      .sort((a, b) => (orden.get(a[0]) ?? 999) - (orden.get(b[0]) ?? 999))
      .map(([zona, mods]) => {
        const ciudad = mods[0]?.ciudad ?? ''
        const constMap = new Map<string, ModeloZona[]>()
        for (const m of mods) {
          const nombre = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
          if (!constMap.has(nombre)) constMap.set(nombre, [])
          constMap.get(nombre)!.push(m)
        }
        const grupos = Array.from(constMap.entries())
          .map(([nombre, ms]) => ({
            nombre,
            modelos: [...ms].sort((a, b) => {
              const va = viewsMap.get(a.id)
              const vb = viewsMap.get(b.id)
              if (!va && !vb) return 0
              if (!va) return -1
              if (!vb) return 1
              if (va.count !== vb.count) return va.count - vb.count
              return va.lastViewed - vb.lastViewed
            }),
          }))
          .sort((a, b) => {
            const aPop = esPopularMercado(a.nombre) ? 1 : 0
            const bPop = esPopularMercado(b.nombre) ? 1 : 0
            if (aPop !== bPop) return bPop - aPop
            return b.modelos.length - a.modelos.length
          })
        return { zona, ciudad, total: mods.length, grupos }
      })
  }, [filtrados, zonasDisponibles, viewsMap])

  const hayResultados = zonaGrupos.length > 0

  const portadaMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ci of constructorasInfo) {
      if (ci.imagen_portada) m.set(ci.nombre, ci.imagen_portada)
    }
    return m
  }, [constructorasInfo])


  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.intro}>
        <View style={styles.introRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
            <Text style={[styles.introSub, { color: c.textMute }]}>
              Filtra por fraccionamiento o busca una constructora.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.accionBtn, { borderColor: '#c9a84c' }]}
            onPress={() => router.push('/(prospectador)/tabla-equipo')}
            activeOpacity={0.8}
          >
            <Text style={[styles.accionBtnTxt, { color: '#c9a84c' }]}>📊 Ver tabla</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Buscador */}
      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Buscar constructora, modelo o zona…"
          placeholderTextColor={c.textMute}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Text style={[styles.clearBtn, { color: c.textMute }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Chips de fraccionamiento */}
      {!loading && zonasDisponibles.length > 0 && (
        <View style={styles.chipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              style={[styles.chip, { borderColor: c.border }, zonaSel === null && styles.chipActivo]}
              onPress={() => setZonaSel(null)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipTxt, { color: zonaSel === null ? '#fff' : c.textSub }]}>
                Todas ({enriquecidos.length})
              </Text>
            </TouchableOpacity>
            {zonasDisponibles.map(z => {
              const activo = zonaSel === z.nombre
              return (
                <TouchableOpacity
                  key={z.nombre}
                  style={[styles.chip, { borderColor: c.border }, activo && styles.chipActivo]}
                  onPress={() => setZonaSel(activo ? null : z.nombre)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipTxt, { color: activo ? '#fff' : c.textSub }]}>
                    {z.nombre} ({z.n})
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : !hayResultados ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>🏗️</Text>
          <Text style={[styles.emptyText, { color: c.textMute }]}>
            {busqueda || zonaSel ? 'Sin resultados para ese filtro.' : 'No hay propiedades de constructora aún.'}
          </Text>
        </View>
      ) : (
        /* ── Vista prospectador: cards visuales por desarrollo ── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={styles.cardsScroll}
        >
          <View style={styles.cardsGrid}>
          {zonaGrupos.flatMap(zg =>
            zg.grupos.map(g => {
              const aKey = `${zg.zona}_${g.nombre}`
              const abierta = abiertas[aKey] ?? busqueda.trim().length > 0
              const popular = esPopularMercado(g.nombre)
              const portadaUrl = portadaMap.get(g.nombre)
              const imgPortadaFallback = g.modelos[0]?.propiedad_imagenes?.[0]
              const imgSrc = portadaUrl ?? imgPortadaFallback?.thumb_url ?? imgPortadaFallback?.url ?? null
              const precios = g.modelos.map(m => m.precio).filter((p): p is number => p != null)
              const precioDesde = precios.length > 0 ? Math.min(...precios) : null
              return (
                <View
                  key={aKey}
                  style={[
                    styles.desarrolloCard,
                    { backgroundColor: c.card, borderColor: popular ? '#e65100' : c.border },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => setAbiertas(s => ({ ...s, [aKey]: !abierta }))}
                    activeOpacity={0.9}
                  >
                    {/* Imagen portada con overlay */}
                    <View style={styles.desarrolloImgWrap}>
                      {imgSrc ? (
                        <ThumbImage
                          url={imgSrc}
                          style={styles.desarrolloImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.desarrolloImg, styles.desarrolloImgPh]}>
                          <Text style={{ fontSize: 44 }}>🏗️</Text>
                        </View>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)']}
                        locations={[0, 0.45, 1]}
                        style={styles.desarrolloOverlay}
                      />
                      {popular && (
                        <View style={styles.popularPill}>
                          <Text style={styles.popularPillTxt}>🔥 Popular</Text>
                        </View>
                      )}
                      <View style={styles.desarrolloNombreWrap}>
                        <Text style={styles.desarrolloNombre} numberOfLines={2}>{g.nombre}</Text>
                      </View>
                    </View>

                    {/* Info: zona, precio, conteo */}
                    <View style={styles.desarrolloInfo}>
                      <View style={styles.desarrolloInfoRow}>
                        <View style={[styles.zonaChip, { backgroundColor: '#1a647015' }]}>
                          <Text style={[styles.zonaChipTxt, { color: '#1a6470' }]}>📍 {zg.zona}</Text>
                        </View>
                        <Text style={[styles.desarrolloConteo, { color: c.textMute }]}>
                          {g.modelos.length} {g.modelos.length === 1 ? 'modelo' : 'modelos'}
                        </Text>
                      </View>
                      <View style={styles.desarrolloFooter}>
                        <Text style={styles.desarrolloPrecio}>
                          {precioDesde != null
                            ? `desde $${precioDesde.toLocaleString('es-MX')}`
                            : 'Precio a consultar'}
                        </Text>
                        <Text style={[styles.desarrolloToggle, { color: '#c9a84c' }]}>
                          {abierta ? '▲ Ocultar' : '▼ Ver modelos'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Modelos expandidos */}
                  {abierta && (
                    <View style={[styles.modelosWrap, { borderTopColor: c.border }]}>
                      {g.modelos.map(m => {
                        const img = (m.propiedad_imagenes ?? [])[0]
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.modeloCard, { backgroundColor: c.bg, borderColor: c.border }]}
                            onPress={() => router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: m.id } })}
                            activeOpacity={0.85}
                          >
                            {img?.url ? (
                              <ThumbImage url={img.thumb_url ?? img.url} style={styles.modeloImg} />
                            ) : (
                              <View style={[styles.modeloImg, styles.modeloImgPh]}><Text style={{ fontSize: 24 }}>🏠</Text></View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.modeloTitulo, { color: c.text }]} numberOfLines={2}>{m.titulo}</Text>
                              <Text style={styles.modeloPrecio}>{formatPrecio(m.precio)}</Text>
                              {m.codigo ? <Text style={styles.modeloCodigo}>{m.codigo}</Text> : null}
                            </View>
                            <Text style={styles.modeloChevron}>›</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })
          )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  intro: { marginBottom: 10 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },
  accionBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  accionBtnTxt: { fontSize: 12, fontWeight: '800' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 42, marginBottom: 10,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14 },
  clearBtn: { fontSize: 16, paddingHorizontal: 4 },

  chipsWrap: { marginBottom: 10 },
  chipsRow: { gap: 8, paddingRight: 8, paddingBottom: 6 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  // ── Cards de desarrollo (vista prospectador) ──────────────────────────────
  cardsScroll: {
    paddingBottom: 40,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  desarrolloCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 280,
  },
  desarrolloImgWrap: {
    height: 200,
    position: 'relative',
    backgroundColor: '#0d1520',
  },
  desarrolloImg: {
    width: '100%',
    height: '100%',
  },
  desarrolloImgPh: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a647020',
  },
  desarrolloOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
  },
  popularPill: {
    position: 'absolute',
    top: 10, left: 10,
    backgroundColor: 'rgba(230,81,0,0.92)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  popularPillTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  desarrolloNombreWrap: {
    position: 'absolute',
    bottom: 12, left: 14, right: 14,
  },
  desarrolloNombre: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  desarrolloInfo: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  desarrolloInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zonaChip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zonaChipTxt: { fontSize: 12, fontWeight: '700' },
  desarrolloConteo: { fontSize: 12, fontWeight: '600' },
  desarrolloFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desarrolloPrecio: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a6470',
  },
  desarrolloToggle: {
    fontSize: 12,
    fontWeight: '700',
  },
  modelosWrap: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },

  modeloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8,
  },

  modeloImg: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#e8f0f0' },
  modeloImgPh: { alignItems: 'center', justifyContent: 'center' },
  modeloTitulo: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  modeloPrecio: { fontSize: 14, fontWeight: '800', color: '#1a6470' },
  modeloCodigo: { fontSize: 11, color: '#aaa', marginTop: 2, fontWeight: '600' },
  modeloChevron: { fontSize: 26, color: '#c9a84c', fontWeight: '700' },
})
