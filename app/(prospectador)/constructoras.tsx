import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Image,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'
import { ThumbImage } from '../../components/ThumbImage'
import { useVistaComo } from '../../lib/VistaComo'
import { normalizar } from '../../lib/texto'

type Modelo = {
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

const ZONA_ORDER: Array<string | null> = ['queretaro', 'monterrey', 'puebla', null]
const ZONA_LABELS: Record<string, string> = {
  queretaro: '📍 Querétaro',
  monterrey: '📍 Monterrey',
  puebla: '📍 Puebla',
}

type ZonaGrupo = {
  key: string | null
  label: string
  grupos: { nombre: string; modelos: Modelo[] }[]
}

const SIN_CONSTRUCTORA = 'Sin constructora'

// ─── Constructoras reconocidas en el mercado (investigación QRO/MTY/PUE) ─────
// Casas Riscos: 15+ condominios, 3000+ casas en QRO (Intercity, Zaru, Mirador…)
// Atlas Desarrollos: desarrolladora de BELENA Residencial en Zibatá
// Grupo CAISA: EMMA, AMAIA, Alegra Towers en Zibatá/Juriquilla
// Xanadú Residencial: Xanadu Zibatá, reconocida dentro de Zibatá
// PDR: PDR Casa Zibatá + PDR Apodaca, activa en QRO y MTY
// Mykonos: desarrollo icónico en Juriquilla
// IMARHI: developer local activo con varios modelos en QRO
// Investti: una de las 3 grandes de QRO junto a Atlas y Supraterra
const POPULARES_KW = [
  'riscos', 'intercity',
  'belena', 'atlas',
  'caisa', 'emma', 'amaia', 'alegra',
  'xanadu', 'xanadú',
  'pdr',
  'mykonos',
  'imarhi',
  'investti',
  'valencia',
  'solare',
  'santaluz',
  'alleza',
  'castello',
  'mezquite',
  'himalaya',
  'privalia',
  'varella',
  'tekno',
  'gran valle',
  'aurea', 'iolita',
  'ciudad marques',
  'fuerte santiago',
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
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [loading, setLoading] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const [rol, setRol] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function consultarModelos() {
    return supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, zona, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })
      .order('precio', { ascending: true, nullsFirst: false })
  }

  async function cargar() {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    let rol: string | null = null
    if (userId) {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      rol = data?.role ?? null
    }
    rol = vistaComo ?? rol  // rol efectivo (admin "viendo como")
    setRol(rol)

    let { data, error } = await consultarModelos()
    // En web, justo al entrar/recargar la pantalla, la sesión puede tardar unos
    // milisegundos en adjuntarse a las peticiones (el cliente de Supabase aún
    // está restaurándola desde localStorage). Eso hace que la consulta viaje
    // como anónima y la RLS de "propiedades" la devuelva vacía sin error.
    // Reintentamos una vez tras una breve espera para esos casos.
    if ((error || !data || data.length === 0) && userId) {
      await new Promise((r) => setTimeout(r, 500))
      const retry = await consultarModelos()
      data = retry.data
    }

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

  // Agrupar primero por zona, luego por constructora dentro de cada zona
  const zonaGrupos: ZonaGrupo[] = ZONA_ORDER
    .map(zona => {
      const modelosZona = modelos.filter(m => (m.zona ?? null) === zona)
      if (modelosZona.length === 0) return null
      const constMap = new Map<string, Modelo[]>()
      for (const m of modelosZona) {
        const nombre = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
        if (!constMap.has(nombre)) constMap.set(nombre, [])
        constMap.get(nombre)!.push(m)
      }
      const gruposZona = Array.from(constMap.entries())
        .map(([nombre, mods]) => ({ nombre, modelos: mods }))
        .sort((a, b) => {
          const aPop = esPopularMercado(a.nombre) ? 1 : 0
          const bPop = esPopularMercado(b.nombre) ? 1 : 0
          if (aPop !== bPop) return bPop - aPop
          return b.modelos.length - a.modelos.length
        })
      return { key: zona, label: zona ? (ZONA_LABELS[zona] ?? zona) : '📍 Sin zona', grupos: gruposZona }
    })
    .filter((z): z is ZonaGrupo => z != null)

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.intro}>
        <View style={styles.introRow}>
          <View>
            <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
            <Text style={[styles.introSub, { color: c.textMute }]}>Explora los modelos disponibles por constructora.</Text>
          </View>
          <View style={styles.introActions}>
            <TouchableOpacity
              style={[styles.accionBtn, { borderColor: '#c9a84c' }]}
              onPress={() => router.push('/(prospectador)/tabla-equipo')}
              activeOpacity={0.8}
            >
              <Text style={[styles.accionBtnTxt, { color: '#c9a84c' }]}>📊 Ver tabla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : zonaGrupos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 46, marginBottom: 10 }}>🏗️</Text>
          <Text style={[styles.emptyText, { color: c.textMute }]}>No hay propiedades de constructora aún.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {zonaGrupos.map(zg => (
            <View key={zg.key ?? '_sin_zona'}>
              <Text style={[styles.zonaSectionHeader, { color: c.textMute, borderBottomColor: c.border }]}>{zg.label}</Text>
              {zg.grupos.map((g) => {
                const aKey = `${zg.key ?? 'sin'}_${g.nombre}`
                const abierta = abiertas[aKey] ?? false
                const popular = esPopularMercado(g.nombre)
                const borderColor = popular ? '#e65100' : c.border
                return (
                  <View key={aKey} style={styles.grupo}>
                    <TouchableOpacity
                      style={[
                        styles.grupoHeader,
                        { backgroundColor: c.card, borderColor },
                        popular && { borderWidth: 1.8, backgroundColor: '#e6510008' },
                      ]}
                      onPress={() => setAbiertas((s) => ({ ...s, [aKey]: !abierta }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.grupoTitulo, { color: c.text }]}>{abierta ? '▼' : '▶'}  {g.nombre}</Text>
                      {popular && (
                        <Text style={[styles.popularBadge, { backgroundColor: '#e6510018', color: '#e65100' }]}>
                          🔥 Popular
                        </Text>
                      )}
                      <Text style={[styles.grupoMeta, { color: popular ? '#e65100' : '#1a6470' }]}>
                        {g.modelos.length} {g.modelos.length === 1 ? 'modelo' : 'modelos'}
                      </Text>
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
                            <ThumbImage url={img.url} opts={{ width: 200, quality: 60 }} style={styles.modeloImg} />
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
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  intro: { marginBottom: 12 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },
  introActions: { gap: 6, alignItems: 'flex-end', paddingTop: 2 },
  accionBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  accionBtnTxt: { fontSize: 12, fontWeight: '800' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  zonaSectionHeader: {
    fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8,
    paddingVertical: 8, marginTop: 6, marginBottom: 4,
    borderBottomWidth: 1,
  },

  grupo: { marginBottom: 14 },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  grupoTitulo: { flex: 1, fontSize: 15, fontWeight: '800' },
  grupoMeta: { fontSize: 12, fontWeight: '700' },
  popularBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginRight: 4 },
  medalBadge: { fontSize: 14, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 2 },

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
