import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'

type ModeloZona = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  nombre_constructora: string | null
  zona: string | null
  exclusiva: boolean | null
  inmobiliarias: { exclusiva: boolean } | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const ZONAS_CONFIG = [
  { key: 'queretaro', label: 'Querétaro', color: '#1976D2', emoji: '🏙️' },
  { key: 'monterrey', label: 'Monterrey', color: '#D84315', emoji: '⛰️' },
  { key: 'puebla',    label: 'Puebla',    color: '#2E7D32', emoji: '🌿' },
]

const SIN_ZONA = 'Sin zona'

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

export default function Zonas() {
  const c = useColors()
  const [modelos, setModelos] = useState<ModeloZona[]>([])
  const [loading, setLoading] = useState(true)
  const [zonasAbiertas, setZonasAbiertas] = useState<Record<string, boolean>>({})
  const [constructorasAbiertas, setConstructorasAbiertas] = useState<Record<string, boolean>>({})
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
    setRol(rolActual)

    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, zona, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })

    let lista = ((data ?? []) as any[]).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as ModeloZona[]

    // Ocultar exclusivas a roles básicos
    const esPrivilegiado = ['prospectador_plus', 'asesor', 'admin', 'supervisor'].includes(rolActual ?? '')
    if (!esPrivilegiado) {
      lista = lista.filter((p) => !p.exclusiva && !p.inmobiliarias?.exclusiva)
    }

    setModelos(lista)
    setLoading(false)
  }

  function toggleZona(zona: string) {
    setZonasAbiertas(s => ({ ...s, [zona]: !s[zona] }))
  }

  function toggleConstructora(key: string) {
    setConstructorasAbiertas(s => ({ ...s, [key]: !s[key] }))
  }

  // Agrupar por zona → constructora (sin duplicados)
  const zonaData: Record<string, Record<string, ModeloZona[]>> = {}
  for (const m of modelos) {
    const zona = m.zona ?? SIN_ZONA
    const constructora = m.nombre_constructora?.trim() || 'Sin constructora'
    if (!zonaData[zona]) zonaData[zona] = {}
    if (!zonaData[zona][constructora]) zonaData[zona][constructora] = []
    zonaData[zona][constructora].push(m)
  }

  // Ordenar zonas: primero las configuradas, luego el resto
  const zonaOrdenadas = [
    ...ZONAS_CONFIG.map(z => z.key).filter(k => zonaData[k]),
    ...Object.keys(zonaData).filter(k => !ZONAS_CONFIG.find(z => z.key === k)),
  ]

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.header}>
        <Text style={[s.titulo, { color: c.text }]}>📍 Zonas</Text>
        <Text style={[s.subtitulo, { color: c.textMute }]}>Constructoras organizadas por ciudad</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : zonaOrdenadas.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>📍</Text>
          <Text style={[s.emptyText, { color: c.textMute }]}>No hay propiedades de constructora con zona asignada.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {zonaOrdenadas.map(zonaKey => {
            const cfg = ZONAS_CONFIG.find(z => z.key === zonaKey)
            const label = cfg?.label ?? zonaKey.charAt(0).toUpperCase() + zonaKey.slice(1)
            const emoji = cfg?.emoji ?? '📍'
            const color = cfg?.color ?? '#1a6470'
            const abierta = zonasAbiertas[zonaKey] ?? false
            const constructoras = zonaData[zonaKey]
            const totalModelos = Object.values(constructoras).reduce((acc, arr) => acc + arr.length, 0)
            const numConstructoras = Object.keys(constructoras).length

            return (
              <View key={zonaKey} style={s.zonaBloque}>
                <TouchableOpacity
                  style={[s.zonaHeader, { backgroundColor: color }]}
                  onPress={() => toggleZona(zonaKey)}
                  activeOpacity={0.85}
                >
                  <View style={s.zonaHeaderLeft}>
                    <Text style={s.zonaEmoji}>{emoji}</Text>
                    <View>
                      <Text style={s.zonaLabel}>{label}</Text>
                      <Text style={s.zonaMeta}>{numConstructoras} {numConstructoras === 1 ? 'constructora' : 'constructoras'} · {totalModelos} {totalModelos === 1 ? 'modelo' : 'modelos'}</Text>
                    </View>
                  </View>
                  <Text style={s.zonaChevron}>{abierta ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {abierta && Object.entries(constructoras)
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([nombreConstructora, modelos]) => {
                    const ck = `${zonaKey}::${nombreConstructora}`
                    const cAbierta = constructorasAbiertas[ck] ?? false
                    return (
                      <View key={ck} style={[s.constructoraBloque, { borderLeftColor: color }]}>
                        <TouchableOpacity
                          style={[s.constructoraHeader, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => toggleConstructora(ck)}
                          activeOpacity={0.8}
                        >
                          <View style={[s.constructoraDot, { backgroundColor: color }]} />
                          <Text style={[s.constructoraNombre, { color: c.text }]} numberOfLines={1}>{nombreConstructora}</Text>
                          <Text style={[s.constructoraMeta, { color }]}>{modelos.length} {modelos.length === 1 ? 'modelo' : 'modelos'}</Text>
                          <Text style={[s.constructoraChevron, { color: c.textMute }]}>{cAbierta ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        {cAbierta && modelos.map(m => {
                          const img = [...(m.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[s.modeloCard, { backgroundColor: c.card, borderColor: c.border }]}
                              onPress={() => (rol === 'admin' || rol === 'supervisor')
                                ? router.push({ pathname: '/(admin)/editar-propiedad', params: { id: m.id } })
                                : router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: m.id } })
                              }
                              activeOpacity={0.85}
                            >
                              {img?.url ? (
                                <ThumbImage url={img.url} opts={{ width: 180, quality: 60 }} style={s.modeloImg} />
                              ) : (
                                <View style={[s.modeloImg, s.modeloImgPh]}><Text style={{ fontSize: 20 }}>🏠</Text></View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={[s.modeloTitulo, { color: c.text }]} numberOfLines={2}>{m.titulo}</Text>
                                <Text style={[s.modeloPrecio, { color }]}>{formatPrecio(m.precio)}</Text>
                                {m.codigo ? <Text style={s.modeloCodigo}>{m.codigo}</Text> : null}
                              </View>
                              <Text style={[s.modeloChevron, { color }]}>›</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )
                  })
                }
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  titulo: { fontSize: 22, fontWeight: '900' },
  subtitulo: { fontSize: 12, marginTop: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  zonaBloque: { marginBottom: 14, marginHorizontal: 16 },
  zonaHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  zonaHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  zonaEmoji: { fontSize: 26 },
  zonaLabel: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
  zonaMeta: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  zonaChevron: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },

  constructoraBloque: { borderLeftWidth: 3, marginLeft: 8, marginTop: 6 },
  constructoraHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 4, marginLeft: 4,
  },
  constructoraDot: { width: 8, height: 8, borderRadius: 4 },
  constructoraNombre: { flex: 1, fontSize: 14, fontWeight: '700' },
  constructoraMeta: { fontSize: 11, fontWeight: '700' },
  constructoraChevron: { fontSize: 14, fontWeight: '700' },

  modeloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 8,
    marginBottom: 6, marginLeft: 20,
  },
  modeloImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#e8f0f0' },
  modeloImgPh: { alignItems: 'center', justifyContent: 'center' },
  modeloTitulo: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  modeloPrecio: { fontSize: 13, fontWeight: '800' },
  modeloCodigo: { fontSize: 10, color: '#aaa', marginTop: 2, fontWeight: '600' },
  modeloChevron: { fontSize: 22, fontWeight: '700' },
})
