import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { useVistaComo } from '../../lib/VistaComo'
import { normalizar } from '../../lib/texto'

type Propiedad = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  tipo: string | null
  direccion: string
  zona: string | null
  nombre_constructora: string | null
  exclusiva: boolean | null
}

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro', color: '#1976D2', emoji: '🏙️' },
  { key: 'monterrey', label: 'Monterrey', color: '#D84315', emoji: '⛰️' },
  { key: 'puebla',    label: 'Puebla',    color: '#2E7D32', emoji: '🌿' },
]

// Fraccionamientos/colonias por ciudad — ORDEN IMPORTA: más específico primero
const SUBZONAS: Record<string, { label: string; keywords: string[] }[]> = {
  queretaro: [
    // Juriquilla y alrededores
    { label: 'Juriquilla',              keywords: ['juriquilla', 'real de juriquilla', 'lomas de juriquilla', 'villas juriquilla', 'privadas juriquilla'] },
    { label: 'Zibatá',                  keywords: ['zibatá', 'zibata', 'zibata norte'] },
    // El Marqués — fraccionamientos específicos (antes del genérico)
    { label: 'El Mirador',              keywords: ['el mirador', 'fraccionamiento el mirador', 'fracc. el mirador'] },
    { label: 'Real Solare',             keywords: ['real solare', 'solare'] },
    { label: 'Rincones del Marqués',    keywords: ['rincones del marqués', 'rincones del marques', 'rincones del marqués'] },
    { label: 'Zakia',                   keywords: ['zakia'] },
    { label: 'Cañadas del Lago',        keywords: ['cañadas del lago', 'cañadas de lago'] },
    { label: 'El Paraíso',              keywords: ['el paraíso', 'el paraiso', 'paraíso residencial', 'paraiso residencial'] },
    { label: 'La Cañada',               keywords: ['la cañada', 'fracc. la cañada', 'fraccionamiento la cañada'] },
    { label: 'El Campanario',           keywords: ['el campanario', 'campanario'] },
    { label: 'Hacienda Galindo',        keywords: ['hacienda galindo', 'galindo'] },
    { label: 'El Rosal',                keywords: ['el rosal', 'fracc. el rosal'] },
    { label: 'Privanzas',               keywords: ['privanzas'] },
    { label: 'Puerta Real',             keywords: ['puerta real'] },
    { label: 'Villas del Mesón',        keywords: ['villas del mesón', 'villas del meson'] },
    // Resto de colonias y fraccionamientos de Querétaro
    { label: 'El Refugio',              keywords: ['el refugio', 'refugio'] },
    { label: 'Interlomas',              keywords: ['interlomas'] },
    { label: 'Corregidora',             keywords: ['el pueblito', 'corregidora', 'loma dorada'] },
    { label: 'Candiles',                keywords: ['candiles', 'fracc. candiles'] },
    { label: 'Cumbres',                 keywords: ['cumbres', 'cumbres del lago'] },
    { label: 'Santa Fe',                keywords: ['santa fe'] },
    { label: 'Pedregal',                keywords: ['pedregal'] },
    { label: 'Milenio',                 keywords: ['milenio'] },
    { label: 'Constituyentes',          keywords: ['constituyentes'] },
    { label: 'Centro Sur',              keywords: ['centro sur'] },
    { label: 'Punta Juriquilla',        keywords: ['punta juriquilla'] },
    { label: 'El Salitre',              keywords: ['el salitre', 'salitre'] },
    { label: 'Jurica',                  keywords: ['jurica'] },
    { label: 'El Marqués',              keywords: ['el marqués', 'el marques', 'marqués', 'marques'] }, // fallback genérico
    { label: 'San Juan del Río',        keywords: ['san juan del río', 'san juan del rio', 'san juan'] },
    { label: 'Tequisquiapan',           keywords: ['tequisquiapan', 'tequis'] },
    { label: 'Centro',                  keywords: ['centro histórico', 'centro historico', 'centro'] },
  ],
  monterrey: [
    { label: 'San Pedro G.G.',          keywords: ['san pedro', 'garza garcia', 'garza garcía', 'valle oriente', 'del valle'] },
    { label: 'Carretera Nacional',      keywords: ['carretera nacional', 'lomas de valle verde', 'sierra madre'] },
    { label: 'Santa Catarina',          keywords: ['santa catarina'] },
    { label: 'Guadalupe',               keywords: ['guadalupe'] },
    { label: 'Apodaca',                 keywords: ['apodaca', 'cumbres de apodaca'] },
    { label: 'San Nicolás',             keywords: ['san nicolás', 'san nicolas'] },
    { label: 'Escobedo',                keywords: ['escobedo'] },
    { label: 'Centro MTY',              keywords: ['centro', 'monterrey centro'] },
  ],
  puebla: [
    { label: 'Cholula',                 keywords: ['cholula', 'san andrés', 'san andres', 'santa clara', 'ex-hacienda'] },
    { label: 'Angelópolis',             keywords: ['angelópolis', 'angelopolis', 'lomas de angelópolis', 'lomas de angelopolis'] },
    { label: 'Atlixco',                 keywords: ['atlixco'] },
    { label: 'Tehuacán',                keywords: ['tehuacán', 'tehuacan'] },
    { label: 'Reserva Territorial',     keywords: ['reserva territorial', 'atlixcáyotl', 'atlixcayotl'] },
    { label: 'Centro Puebla',           keywords: ['centro histórico puebla', 'centro puebla', 'centro'] },
  ],
}

// Prefijos que indican el comienzo del nombre de un fraccionamiento/colonia
const RE_FRACC = /(?:fraccionamiento|fracc\.?|colonia|col\.?|residencial|privadas?\s+de|hacienda|conjunto\s+habitacional|ex[\s-]hacienda|parque\s+industrial|villa(?:s)?)\s+(.+)/i

function extraerNombreFracc(direccion: string): string | null {
  // Buscar en cada segmento separado por coma
  const segmentos = (direccion ?? '').split(',')
  for (const seg of segmentos) {
    const m = seg.trim().match(RE_FRACC)
    if (m?.[1]) {
      const nombre = m[1].trim().split(/,/)[0].trim()
      if (nombre.length > 2 && nombre.length < 55) return nombre
    }
  }
  // Si no hay prefijo, usar el primer segmento si es razonablemente corto
  const primero = segmentos[0]?.trim()
  if (primero && primero.length > 2 && primero.length < 45) return primero
  return null
}

function detectarSubzona(direccion: string, zona: string): string {
  const dir = normalizar(direccion)
  for (const sz of (SUBZONAS[zona] ?? [])) {
    if (sz.keywords.some(kw => dir.includes(normalizar(kw)))) return sz.label
  }
  // No está en la lista → extraer nombre real de la dirección
  return extraerNombreFracc(direccion) ?? 'Sin clasificar'
}

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

export default function Zonas() {
  const c = useColors()
  const { vistaComo } = useVistaComo()
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [zonasAbiertas, setZonasAbiertas] = useState<Record<string, boolean>>({})
  const [subzonasAbiertas, setSubzonasAbiertas] = useState<Record<string, boolean>>({})
  const [rol, setRol] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))
  const { refreshControl } = usePullRefresh(cargar)

  async function cargar() {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    let rolActual: string | null = null
    if (userId) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      rolActual = data?.role ?? null
    }
    rolActual = vistaComo ?? rolActual
    setRol(rolActual)

    // Solo campos esenciales para agrupar — sin joins pesados de imágenes/inmobiliarias
    const SELECT = 'id, codigo, titulo, precio, tipo, direccion, zona, nombre_constructora, exclusiva'
    const BASE = supabase.from('propiedades').select(SELECT)
      .eq('es_inventario', false)
      .not('zona', 'is', null)
      .order('precio', { ascending: true, nullsFirst: false })

    // Dos rangos en paralelo para superar el límite de 1000 filas de PostgREST
    const [r1, r2] = await Promise.all([
      BASE.range(0, 999),
      BASE.range(1000, 1999),
    ])

    let lista = [...(r1.data ?? []), ...(r2.data ?? [])] as Propiedad[]

    if (rolActual !== 'prospectador_plus' && rolActual !== 'admin' && rolActual !== 'supervisor' && rolActual !== 'asesor') {
      lista = lista.filter(p => !p.exclusiva)
    }

    setPropiedades(lista)
    setLoading(false)
  }

  // Agrupar: zona → subzona → propiedades
  const arbol: Record<string, Record<string, Propiedad[]>> = {}
  for (const p of propiedades) {
    const zona = p.zona ?? 'sin_zona'
    if (zona === 'sin_zona') continue
    const sub = detectarSubzona(p.direccion, zona)
    if (!arbol[zona]) arbol[zona] = {}
    if (!arbol[zona][sub]) arbol[zona][sub] = []
    arbol[zona][sub].push(p)
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.intro}>
        <Text style={[s.introTitle, { color: c.text }]}>📍 Zonas</Text>
        <Text style={[s.introSub, { color: c.textMute }]}>Explora propiedades por colonia y fraccionamiento.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1976D2" style={{ marginTop: 40 }} />
      ) : propiedades.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>📍</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>No hay propiedades con zona asignada.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          {ZONAS_CONFIG.filter(z => arbol[z.key]).map(zConf => {
            const subzonaData = arbol[zConf.key]
            const totalZona = Object.values(subzonaData).reduce((a, b) => a + b.length, 0)
            const zonaAbierta = zonasAbiertas[zConf.key] ?? false

            // Ordenar subzonas: "Sin clasificar" al final, resto por cantidad desc
            const subzonas = Object.entries(subzonaData).sort((a, b) => {
              if (a[0] === 'Sin clasificar') return 1
              if (b[0] === 'Sin clasificar') return -1
              return b[1].length - a[1].length
            })

            return (
              <View key={zConf.key} style={s.zonaWrap}>
                <TouchableOpacity
                  style={[s.zonaHeader, { backgroundColor: zConf.color }]}
                  onPress={() => setZonasAbiertas(v => ({ ...v, [zConf.key]: !zonaAbierta }))}
                  activeOpacity={0.85}
                >
                  <Text style={s.zonaEmoji}>{zConf.emoji}</Text>
                  <Text style={s.zonaLabel}>{zConf.label}</Text>
                  <Text style={s.zonaMeta}>{totalZona} prop.</Text>
                  <Text style={s.zonaChevron}>{zonaAbierta ? '▼' : '▶'}</Text>
                </TouchableOpacity>

                {zonaAbierta && subzonas.map(([subLabel, props]) => {
                  const subKey = `${zConf.key}__${subLabel}`
                  const subAbierta = subzonasAbiertas[subKey] ?? false
                  return (
                    <View key={subKey} style={s.subzonaWrap}>
                      <TouchableOpacity
                        style={[s.subzonaHeader, { backgroundColor: c.card, borderColor: zConf.color + '55' }]}
                        onPress={() => setSubzonasAbiertas(v => ({ ...v, [subKey]: !subAbierta }))}
                        activeOpacity={0.8}
                      >
                        <View style={[s.subzonaDot, { backgroundColor: zConf.color }]} />
                        <Text style={[s.subzonaLabel, { color: c.text }]}>{subLabel}</Text>
                        <Text style={[s.subzonaMeta, { color: zConf.color }]}>{props.length}</Text>
                        <Text style={[s.subzonaChevron, { color: c.textMute }]}>{subAbierta ? '▼' : '▶'}</Text>
                      </TouchableOpacity>

                      {subAbierta && props.map(p => (
                          <TouchableOpacity
                            key={p.id}
                            style={[s.propCard, { backgroundColor: c.card, borderColor: c.border }]}
                            onPress={() => (rol === 'admin' || rol === 'supervisor')
                              ? router.push({ pathname: '/(admin)/editar-propiedad', params: { id: p.id } })
                              : router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: p.id } })
                            }
                            activeOpacity={0.85}
                          >
                            <View style={[s.propIconBox, { backgroundColor: zConf.color + '18' }]}>
                              <Text style={{ fontSize: 18 }}>🏠</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              {p.nombre_constructora && (
                                <Text style={[s.propConstr, { color: zConf.color }]} numberOfLines={1}>
                                  🏗️ {p.nombre_constructora}
                                </Text>
                              )}
                              <Text style={[s.propTitulo, { color: c.text }]} numberOfLines={2}>{p.titulo}</Text>
                              <Text style={[s.propPrecio, { color: zConf.color }]}>{formatPrecio(p.precio)}</Text>
                              {p.tipo && <Text style={[s.propTipo, { color: c.textMute }]}>{p.tipo}</Text>}
                            </View>
                            <Text style={[s.propChevron, { color: zConf.color }]}>›</Text>
                          </TouchableOpacity>
                      ))}
                    </View>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },
  intro: { marginBottom: 14 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },

  zonaWrap: { marginBottom: 16 },
  zonaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  zonaEmoji: { fontSize: 18 },
  zonaLabel: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '900' },
  zonaMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  zonaChevron: { color: '#fff', fontSize: 16, marginLeft: 4 },

  subzonaWrap: { marginTop: 6, marginLeft: 8 },
  subzonaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  subzonaDot: { width: 8, height: 8, borderRadius: 4 },
  subzonaLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  subzonaMeta: { fontSize: 13, fontWeight: '800' },
  subzonaChevron: { fontSize: 13 },

  propCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 6, marginLeft: 4,
  },
  propIconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  propConstr: { fontSize: 10, fontWeight: '700', marginBottom: 1 },
  propTitulo: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginBottom: 2 },
  propPrecio: { fontSize: 13, fontWeight: '800' },
  propTipo: { fontSize: 11, marginTop: 1 },
  propChevron: { fontSize: 24, fontWeight: '700' },
})
