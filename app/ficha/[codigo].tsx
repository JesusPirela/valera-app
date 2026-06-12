import { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Propiedad = {
  id: string
  codigo: string
  titulo: string
  precio: number | null
  direccion: string
  operacion: string | null
  tipo: string | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  m2: number | null
  m2_terreno: number | null
  estacionamientos: number | null
  descripcion: string | null
  propiedad_imagenes: { url: string; orden: number }[]
}

const TEAL = '#1a6470'

function formatPrecio(precio: number | null) {
  if (!precio) return 'Consultar precio'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

function capitalize(s: string | null) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function FichaPublica() {
  const { codigo } = useLocalSearchParams<{ codigo: string }>()
  const [propiedad, setPropiedad] = useState<Propiedad | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [imgIdx, setImgIdx]     = useState(0)
  const { width } = useWindowDimensions()
  const imgW = Math.min(width, 600)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => { if (codigo) cargar() }, [codigo])

  async function cargar() {
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, descripcion, propiedad_imagenes(url, orden)')
      .eq('codigo', codigo)
      .eq('estado', 'disponible')
      .maybeSingle()

    if (!data) { setNotFound(true); setLoading(false); return }
    setPropiedad({
      ...data,
      propiedad_imagenes: [...(data.propiedad_imagenes ?? [])].sort((a: any, b: any) => a.orden - b.orden),
    } as Propiedad)
    setLoading(false)
  }

  function onScrollImg(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / imgW)
    setImgIdx(idx)
  }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={TEAL} />
    </View>
  )

  if (notFound || !propiedad) return (
    <View style={s.center}>
      <Text style={s.notFoundIcon}>🏚️</Text>
      <Text style={s.notFoundTitle}>Propiedad no encontrada</Text>
      <Text style={s.notFoundSub}>Es posible que ya no esté disponible.</Text>
    </View>
  )

  const imagenes = propiedad.propiedad_imagenes
  const tipoLabel = capitalize(propiedad.tipo)
  const opLabel   = propiedad.operacion === 'renta' ? 'en Renta' : 'en Venta'

  const chips: { icon: string; val: string }[] = []
  if (propiedad.recamaras != null)    chips.push({ icon: '🛏️', val: `${propiedad.recamaras} Rec.` })
  if (propiedad.banos != null) {
    const bStr = `${propiedad.banos}${propiedad.medios_banos ? ` + ${propiedad.medios_banos}½` : ''} Baños`
    chips.push({ icon: '🚿', val: bStr })
  }
  if (propiedad.m2 != null)           chips.push({ icon: '📐', val: `${propiedad.m2} m² const.` })
  if (propiedad.m2_terreno != null)   chips.push({ icon: '🌳', val: `${propiedad.m2_terreno} m² terr.` })
  if (propiedad.estacionamientos != null) chips.push({ icon: '🚗', val: `${propiedad.estacionamientos} Est.` })

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Carrusel de imágenes */}
        {imagenes.length > 0 ? (
          <View style={[s.carouselWrap, { width: imgW }]}>
            <ScrollView
              ref={scrollRef}
              horizontal pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollImg}
              style={{ width: imgW }}
            >
              {imagenes.map((img, i) => (
                <Image
                  key={i}
                  source={{ uri: img.url }}
                  style={{ width: imgW, height: imgW * 0.65 }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
            {imagenes.length > 1 && (
              <View style={s.dots}>
                {imagenes.map((_, i) => (
                  <View key={i} style={[s.dot, i === imgIdx && s.dotActive]} />
                ))}
              </View>
            )}
            {imagenes.length > 1 && (
              <View style={s.imgCounter}>
                <Text style={s.imgCounterTxt}>{imgIdx + 1} / {imagenes.length}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[s.noImg, { height: imgW * 0.55 }]}>
            <Text style={{ fontSize: 48 }}>🏠</Text>
          </View>
        )}

        {/* Contenido */}
        <View style={s.content}>

          {/* Código y tipo */}
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: TEAL }]}>
              <Text style={s.badgeTxt}>{propiedad.codigo}</Text>
            </View>
            {tipoLabel ? (
              <View style={s.badgeOutline}>
                <Text style={s.badgeOutlineTxt}>{tipoLabel} {opLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* Título */}
          <Text style={s.titulo}>{propiedad.titulo}</Text>

          {/* Dirección */}
          <Text style={s.direccion}>📍 {propiedad.direccion}</Text>

          {/* Precio */}
          <View style={s.precioBox}>
            <Text style={s.precioLabel}>Precio</Text>
            <Text style={s.precioVal}>{formatPrecio(propiedad.precio)}</Text>
          </View>

          {/* Características */}
          {chips.length > 0 && (
            <View style={s.chipsWrap}>
              {chips.map((c, i) => (
                <View key={i} style={s.chip}>
                  <Text style={s.chipIcon}>{c.icon}</Text>
                  <Text style={s.chipTxt}>{c.val}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Descripción */}
          {propiedad.descripcion ? (
            <View style={s.descBox}>
              <Text style={s.descTitle}>Descripción</Text>
              <Text style={s.descTxt}>{propiedad.descripcion}</Text>
            </View>
          ) : null}

        </View>
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerTxt}>Valera Real Estate · {propiedad.codigo}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 32 },

  carouselWrap: { backgroundColor: '#1e3448', alignSelf: 'center' },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  imgCounter: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  imgCounterTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  noImg: { backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },

  content: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%' as any },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 10, marginTop: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  badgeOutline: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#cbd5e1' },
  badgeOutlineTxt: { color: '#64748b', fontSize: 12, fontWeight: '600' },

  titulo: { fontSize: 20, fontWeight: '900', color: '#1e293b', marginBottom: 6, lineHeight: 26 },
  direccion: { fontSize: 13, color: '#64748b', marginBottom: 14 },

  precioBox: {
    backgroundColor: TEAL + '15', borderRadius: 12, padding: 14,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: TEAL,
  },
  precioLabel: { fontSize: 11, color: TEAL, fontWeight: '700', marginBottom: 2, textTransform: 'uppercase' },
  precioVal: { fontSize: 22, fontWeight: '900', color: TEAL },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e2e8f0',
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any }),
  },
  chipIcon: { fontSize: 14 },
  chipTxt: { fontSize: 13, color: '#334155', fontWeight: '600' },

  descBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  descTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  descTxt: { fontSize: 14, color: '#475569', lineHeight: 22 },

  footer: { backgroundColor: TEAL, paddingVertical: 12, alignItems: 'center' },
  footerTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  notFoundIcon:  { fontSize: 52, marginBottom: 16 },
  notFoundTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  notFoundSub:   { fontSize: 14, color: '#64748b', textAlign: 'center' },
})
