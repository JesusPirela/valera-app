import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput,
} from 'react-native'
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { useVistaComo } from '../../lib/VistaComo'
import { normalizar } from '../../lib/texto'
import { zonaDetallada } from '../../lib/zonas-interes'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type ConstructoraInfo = {
  nombre: string
  empresa_matriz: string | null
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

const ROLES_STAFF = ['admin', 'supervisor', 'asesor']

export default function Constructoras() {
  const c = useColors()
  const { vistaComo } = useVistaComo()
  const { q } = useLocalSearchParams<{ q?: string }>()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [constructorasInfo, setConstructorasInfo] = useState<ConstructoraInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const [rol, setRol] = useState<string | null>(null)
  const [rolReal, setRolReal] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState(q ?? '')
  const [zonaSel, setZonaSel] = useState<string | null>(null)

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
    setRolReal(perfilRol)
    setRol(rolActual)

    // Cargar empresa_matriz para staff (usa rol real, no el vistaComo)
    if (perfilRol && ROLES_STAFF.includes(perfilRol)) {
      const { data: cData } = await supabase
        .from('constructoras')
        .select('nombre, empresa_matriz')
      setConstructorasInfo((cData ?? []) as ConstructoraInfo[])
    }

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

    if (rolActual !== 'prospectador_plus' && rolActual !== 'admin' && rolActual !== 'supervisor') {
      lista = lista.filter((p) => !p.exclusiva && !p.inmobiliarias?.exclusiva)
    }

    setModelos(lista)
    setLoading(false)
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
          .map(([nombre, ms]) => ({ nombre, modelos: ms }))
          .sort((a, b) => {
            const aPop = esPopularMercado(a.nombre) ? 1 : 0
            const bPop = esPopularMercado(b.nombre) ? 1 : 0
            if (aPop !== bPop) return bPop - aPop
            return b.modelos.length - a.modelos.length
          })
        return { zona, ciudad, total: mods.length, grupos }
      })
  }, [filtrados, zonasDisponibles])

  const hayResultados = zonaGrupos.length > 0

  // ── Vista staff: empresa_matriz → desarrollo → modelos ─────────────────────
  // Usa el rol real del perfil (no el vistaComo) para mostrar la vista staff.
  // VistaComo afecta el filtrado de contenido, no la jerarquía de UI de gestión.
  const esStaff = rolReal && ROLES_STAFF.includes(rolReal)

  const empresaMap = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const ci of constructorasInfo) m.set(ci.nombre, ci.empresa_matriz)
    return m
  }, [constructorasInfo])

  const empresaGrupos = useMemo(() => {
    if (!esStaff) return []
    const q = normalizar(busqueda.trim())
    const lista = enriquecidos.filter(m => {
      if (!q) return true
      return (
        normalizar(m.nombre_constructora ?? '').includes(q) ||
        normalizar(m.titulo ?? '').includes(q) ||
        normalizar(m.codigo ?? '').includes(q) ||
        normalizar(m.zonaDet).includes(q) ||
        normalizar(m.direccion ?? '').includes(q) ||
        normalizar(empresaMap.get(m.nombre_constructora?.trim() ?? '') ?? '').includes(q)
      )
    })

    const porEmpresa = new Map<string, Map<string, ModeloZona[]>>()
    const SIN_MATRIZ = 'Otros'
    for (const m of lista) {
      const constructora = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
      const empresa = empresaMap.get(constructora) ?? SIN_MATRIZ
      if (!porEmpresa.has(empresa)) porEmpresa.set(empresa, new Map())
      const porDesarrollo = porEmpresa.get(empresa)!
      if (!porDesarrollo.has(constructora)) porDesarrollo.set(constructora, [])
      porDesarrollo.get(constructora)!.push(m)
    }

    return Array.from(porEmpresa.entries())
      .map(([empresa, desarrollosMap]) => ({
        empresa,
        desarrollos: Array.from(desarrollosMap.entries())
          .map(([nombre, mods]) => ({ nombre, modelos: mods }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        total: Array.from(desarrollosMap.values()).reduce((s, ms) => s + ms.length, 0),
      }))
      .sort((a, b) => {
        if (a.empresa === SIN_MATRIZ) return 1
        if (b.empresa === SIN_MATRIZ) return -1
        return b.total - a.total
      })
  }, [esStaff, enriquecidos, busqueda, empresaMap])

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.intro}>
        <View style={styles.introRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
            <Text style={[styles.introSub, { color: c.textMute }]}>
              {esStaff ? 'Vista por empresa matriz → desarrollo → modelos.' : 'Filtra por fraccionamiento o busca una constructora.'}
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

      {/* Chips de fraccionamiento — solo vista prospectador */}
      {!loading && !esStaff && zonasDisponibles.length > 0 && (
        <View style={styles.chipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
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
      ) : esStaff ? (
        /* ── Vista staff: empresa_matriz → desarrollo → modelos ── */
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          {empresaGrupos.map(eg => {
            const empKey = `emp_${eg.empresa}`
            const empAbierta = abiertas[empKey] ?? busqueda.trim().length > 0
            return (
              <View key={eg.empresa} style={{ marginBottom: 6 }}>
                {/* Empresa matriz — nivel 1 */}
                <TouchableOpacity
                  style={[styles.empresaHeader, { backgroundColor: '#1a6470', borderColor: '#1a6470' }]}
                  onPress={() => setAbiertas(s => ({ ...s, [empKey]: !empAbierta }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.empresaChevron}>{empAbierta ? '▼' : '▶'}</Text>
                  <Text style={styles.empresaTitulo} numberOfLines={1}>{eg.empresa}</Text>
                  <Text style={styles.empresaMeta}>
                    {eg.desarrollos.length} {eg.desarrollos.length === 1 ? 'desarrollo' : 'desarrollos'} · {eg.total} {eg.total === 1 ? 'modelo' : 'modelos'}
                  </Text>
                </TouchableOpacity>

                {empAbierta && eg.desarrollos.map(d => {
                  const devKey = `dev_${eg.empresa}_${d.nombre}`
                  const devAbierta = abiertas[devKey] ?? busqueda.trim().length > 0
                  return (
                    <View key={devKey} style={styles.desarrolloWrap}>
                      {/* Desarrollo — nivel 2 */}
                      <TouchableOpacity
                        style={[styles.grupoHeader, { backgroundColor: c.card, borderColor: '#c9a84c', borderWidth: 1.4 }]}
                        onPress={() => setAbiertas(s => ({ ...s, [devKey]: !devAbierta }))}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.grupoTitulo, { color: c.text }]}>{devAbierta ? '▼' : '▶'}  {d.nombre}</Text>
                        <Text style={[styles.grupoMeta, { color: '#c9a84c' }]}>
                          {d.modelos.length} {d.modelos.length === 1 ? 'modelo' : 'modelos'}
                        </Text>
                      </TouchableOpacity>

                      {devAbierta && d.modelos.map(m => {
                        const img = (m.propiedad_imagenes ?? [])[0]
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.modeloCard, styles.modeloCardIndent, { backgroundColor: c.card, borderColor: c.border }]}
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
                              <Text style={[styles.modeloCodigo, { color: c.textMute }]}>{m.zonaDet}</Text>
                            </View>
                            <Text style={styles.modeloChevron}>›</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      ) : (
        /* ── Vista prospectador: cards visuales por desarrollo ── */
        <ScrollView
          contentContainerStyle={styles.cardsGrid}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {zonaGrupos.flatMap(zg =>
            zg.grupos.map(g => {
              const aKey = `${zg.zona}_${g.nombre}`
              const abierta = abiertas[aKey] ?? busqueda.trim().length > 0
              const popular = esPopularMercado(g.nombre)
              const imgPortada = g.modelos[0]?.propiedad_imagenes?.[0]
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
                      {imgPortada?.url ? (
                        <ThumbImage
                          url={imgPortada.thumb_url ?? imgPortada.url}
                          style={styles.desarrolloImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.desarrolloImg, styles.desarrolloImgPh]}>
                          <Text style={{ fontSize: 44 }}>🏗️</Text>
                        </View>
                      )}
                      <View style={styles.desarrolloOverlay} />
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
  chipsRow: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  // ── Cards de desarrollo (vista prospectador) ──────────────────────────────
  cardsGrid: {
    paddingBottom: 40,
    gap: 16,
  },
  desarrolloCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  desarrolloImgWrap: {
    height: 190,
    position: 'relative',
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
    bottom: 0, left: 0, right: 0,
    height: '65%',
    backgroundColor: 'rgba(0,0,0,0.58)',
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

  // Vista staff — empresa matriz (nivel 1)
  empresaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
    marginBottom: 6, marginTop: 10,
  },
  empresaChevron: { fontSize: 12, color: '#fff', fontWeight: '800' },
  empresaTitulo: { flex: 1, fontSize: 15, fontWeight: '900', color: '#fff' },
  empresaMeta: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  desarrolloWrap: { paddingLeft: 12, marginBottom: 4 },

  // Staff: nivel 2 desarrollo header (reutilizado)
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  grupoTitulo: { flex: 1, fontSize: 15, fontWeight: '800' },
  grupoMeta: { fontSize: 12, fontWeight: '700' },

  modeloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8,
  },
  modeloCardIndent: { marginLeft: 4 },
  modeloImg: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#e8f0f0' },
  modeloImgPh: { alignItems: 'center', justifyContent: 'center' },
  modeloTitulo: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  modeloPrecio: { fontSize: 14, fontWeight: '800', color: '#1a6470' },
  modeloCodigo: { fontSize: 11, color: '#aaa', marginTop: 2, fontWeight: '600' },
  modeloChevron: { fontSize: 26, color: '#c9a84c', fontWeight: '700' },
})
