import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { useVistaComo } from '../../lib/VistaComo'

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
  inmobiliarias: { exclusiva: boolean } | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro', color: '#1976D2', emoji: '🏙️' },
  { key: 'monterrey', label: 'Monterrey', color: '#D84315', emoji: '⛰️' },
  { key: 'puebla',    label: 'Puebla',    color: '#2E7D32', emoji: '🌿' },
]

// Colonias / subzonas por ciudad — orden importa: más específico primero
const SUBZONAS: Record<string, { label: string; keywords: string[] }[]> = {
  queretaro: [
    { label: 'Juriquilla',       keywords: ['juriquilla'] },
    { label: 'Zibatá',           keywords: ['zibatá', 'zibata'] },
    { label: 'El Refugio',       keywords: ['el refugio', 'refugio'] },
    { label: 'Interlomas',       keywords: ['interlomas'] },
    { label: 'Corregidora',      keywords: ['corregidora'] },
    { label: 'El Marqués',       keywords: ['marqués', 'marques', 'el marqués', 'el marques'] },
    { label: 'Candiles',         keywords: ['candiles'] },
    { label: 'Cumbres',          keywords: ['cumbres'] },
    { label: 'Santa Fe',         keywords: ['santa fe'] },
    { label: 'Pedregal',         keywords: ['pedregal'] },
    { label: 'Milenio',          keywords: ['milenio'] },
    { label: 'Constituyentes',   keywords: ['constituyentes'] },
    { label: 'Centro Sur',       keywords: ['centro sur'] },
    { label: 'San Juan del Río', keywords: ['san juan del río', 'san juan del rio', 'san juan'] },
    { label: 'Tequisquiapan',    keywords: ['tequisquiapan', 'tequis'] },
    { label: 'Centro',           keywords: ['centro histórico', 'centro historico', 'centro'] },
  ],
  monterrey: [
    { label: 'San Pedro G.G.',   keywords: ['san pedro', 'garza garcia', 'garza garcía'] },
    { label: 'Santa Catarina',   keywords: ['santa catarina'] },
    { label: 'Guadalupe',        keywords: ['guadalupe'] },
    { label: 'Apodaca',          keywords: ['apodaca'] },
    { label: 'San Nicolás',      keywords: ['san nicolás', 'san nicolas'] },
    { label: 'Escobedo',         keywords: ['escobedo'] },
    { label: 'Centro MTY',       keywords: ['centro'] },
  ],
  puebla: [
    { label: 'Cholula',          keywords: ['cholula', 'san andrés', 'san andres'] },
    { label: 'Angelópolis',      keywords: ['angelópolis', 'angelopolis'] },
    { label: 'Atlixco',          keywords: ['atlixco'] },
    { label: 'Tehuacán',         keywords: ['tehuacán', 'tehuacan'] },
    { label: 'Centro Puebla',    keywords: ['centro'] },
  ],
}

function detectarSubzona(direccion: string, zona: string): string {
  const dir = (direccion ?? '').toLowerCase()
  for (const sz of (SUBZONAS[zona] ?? [])) {
    if (sz.keywords.some(kw => dir.includes(kw))) return sz.label
  }
  return 'Otras'
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

    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, tipo, direccion, zona, nombre_constructora, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .not('zona', 'is', null)
      .order('precio', { ascending: true, nullsFirst: false })

    let lista = ((data ?? []) as any[]).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Propiedad[]

    if (rolActual !== 'prospectador_plus' && rolActual !== 'admin' && rolActual !== 'supervisor' && rolActual !== 'asesor') {
      lista = lista.filter(p => !p.exclusiva && !p.inmobiliarias?.exclusiva)
    }

    setPropiedades(lista)
    setLoading(false)
  }

  // Agrupar: zona → subzona → propiedades
  const arbol: Record<string, Record<string, Propiedad[]>> = {}
  for (const p of propiedades) {
    const zona = p.zona ?? 'sin_zona'
    const sub = detectarSubzona(p.direccion, zona)
    if (!arbol[zona]) arbol[zona] = {}
    if (!arbol[zona][sub]) arbol[zona][sub] = []
    arbol[zona][sub].push(p)
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.intro}>
        <Text style={[s.introTitle, { color: c.text }]}>📍 Zonas</Text>
        <Text style={[s.introSub, { color: c.textMute }]}>Explora las propiedades por colonia y ciudad.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1976D2" style={{ marginTop: 40 }} />
      ) : propiedades.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>📍</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>No hay propiedades con zona asignada.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {ZONAS_CONFIG.filter(z => arbol[z.key]).map(zConf => {
            const subzonaData = arbol[zConf.key]
            const totalZona = Object.values(subzonaData).reduce((a, b) => a + b.length, 0)
            const zonaAbierta = zonasAbiertas[zConf.key] ?? false

            // Ordenar subzonas por cantidad de propiedades desc
            const subzonas = Object.entries(subzonaData).sort((a, b) => b[1].length - a[1].length)

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

                      {subAbierta && props.map(p => {
                        const img = [...(p.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[s.propCard, { backgroundColor: c.card, borderColor: c.border }]}
                            onPress={() => (rol === 'admin' || rol === 'supervisor')
                              ? router.push({ pathname: '/(admin)/editar-propiedad', params: { id: p.id } })
                              : router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: p.id } })
                            }
                            activeOpacity={0.85}
                          >
                            {img?.url ? (
                              <ThumbImage url={img.url} opts={{ width: 160, quality: 60 }} style={s.propImg} />
                            ) : (
                              <View style={[s.propImg, s.propImgPh]}><Text style={{ fontSize: 20 }}>🏠</Text></View>
                            )}
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
                        )
                      })}
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
  propImg: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e8f0f0' },
  propImgPh: { alignItems: 'center', justifyContent: 'center' },
  propConstr: { fontSize: 10, fontWeight: '700', marginBottom: 1 },
  propTitulo: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginBottom: 2 },
  propPrecio: { fontSize: 13, fontWeight: '800' },
  propTipo: { fontSize: 11, marginTop: 1 },
  propChevron: { fontSize: 24, fontWeight: '700' },
})
