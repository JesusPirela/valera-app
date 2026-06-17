import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Image,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'

type Modelo = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  nombre_constructora: string | null
  exclusiva: boolean | null
  inmobiliarias: { exclusiva: boolean } | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const SIN_CONSTRUCTORA = 'Sin constructora'

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

export default function Constructoras() {
  const c = useColors()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [loading, setLoading] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const [rol, setRol] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    let rol: string | null = null
    if (userId) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      rol = data?.role ?? null
    }
    setRol(rol)

    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })
      .order('precio', { ascending: true, nullsFirst: false })

    let lista = (data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Modelo[]

    // Mismo criterio que el catálogo: ocultar exclusivas a roles no autorizados
    if (rol !== 'prospectador_plus' && rol !== 'admin' && rol !== 'supervisor') {
      lista = lista.filter((p) => !p.exclusiva && !p.inmobiliarias?.exclusiva)
    }

    setModelos(lista)
    setLoading(false)
  }

  // Agrupar por constructora, preservando orden de aparición
  const grupos: { nombre: string; modelos: Modelo[] }[] = []
  for (const m of modelos) {
    const nombre = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
    let g = grupos.find((x) => x.nombre === nombre)
    if (!g) { g = { nombre, modelos: [] }; grupos.push(g) }
    g.modelos.push(m)
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(prospectador)/propiedades')}>
        <Text style={styles.backTxt}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
        <Text style={[styles.introSub, { color: c.textMute }]}>Explora los modelos disponibles por constructora.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : grupos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>🏗️</Text>
          <Text style={[styles.emptyText, { color: c.textMute }]}>No hay propiedades de constructora aún.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {grupos.map((g) => {
            const abierta = abiertas[g.nombre] ?? false
            return (
              <View key={g.nombre} style={styles.grupo}>
                <TouchableOpacity
                  style={[styles.grupoHeader, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => setAbiertas((s) => ({ ...s, [g.nombre]: !abierta }))}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.grupoTitulo, { color: c.text }]}>{abierta ? '▼' : '▶'}  {g.nombre}</Text>
                  <Text style={styles.grupoMeta}>{g.modelos.length} {g.modelos.length === 1 ? 'modelo' : 'modelos'}</Text>
                </TouchableOpacity>

                {abierta && g.modelos.map((m) => {
                  const img = [...(m.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modeloCard, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => (rol === 'admin' || rol === 'supervisor')
                        ? router.push({ pathname: '/(admin)/editar-propiedad', params: { id: m.id } })
                        : router.push({ pathname: '/(prospectador)/detalle-propiedad', params: { id: m.id } })
                      }
                      activeOpacity={0.85}
                    >
                      {img?.url ? (
                        <Image source={{ uri: thumb(img.url, { width: 200, quality: 60 }) }} style={styles.modeloImg} />
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
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 12 },
  backTxt: { color: '#1a6470', fontSize: 15, fontWeight: '600' },

  intro: { marginBottom: 12 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  grupo: { marginBottom: 14 },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  grupoTitulo: { fontSize: 15, fontWeight: '800' },
  grupoMeta: { fontSize: 12, fontWeight: '700', color: '#1a6470' },

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
