// El catálogo compartido, como lo ve una inmobiliaria aliada.
//
// Ven lo nuestro y lo de las demás agencias, con fotos, precio y ficha. Lo que
// NO ven es a quién llamar: el teléfono y el correo de cada agencia están
// tapados en la base (20261127_aliados_3), así que si una propiedad les
// interesa tienen que contactarnos. Esa regla no vive en esta pantalla —aquí
// solo no se pinta—, vive en los permisos.
//
// La tarjeta es la MISMA de (admin)/propiedades.tsx (mismos badges, mismo
// precio sobre la foto, mismos specs) menos los botones de administración
// (editar/destacar/borrar), que aquí no tienen nada que hacer: es un
// catálogo para mirar, no para administrar.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput,
  Platform, ScrollView, useWindowDimensions,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { normalizar } from '../../lib/texto'
import { esCerrada, etiquetaEstado, colorEstado } from '../../lib/estado-propiedad'

type Prop = {
  id: string; codigo: string | null; titulo: string | null; precio: number | null
  direccion: string | null; operacion: string | null; tipo: string | null
  estado: string | null; destacada: boolean | null; destacada_mensaje: string | null
  destacada_hasta: string | null; directa: boolean | null
  recamaras: number | null; banos: number | null; medios_banos: number | null
  m2: number | null; m2_terreno: number | null; estacionamientos: number | null
  inmobiliaria_id: string | null
  inmobiliarias: { nombre: string } | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number | null }[] | null
}

const money = (n: number | null) =>
  n ? '$' + Math.round(n).toLocaleString('es-MX') : 'Sin precio'

export default function AliadoCatalogo() {
  const c = useColors()
  const [lista, setLista] = useState<Prop[]>([])
  const [busca, setBusca] = useState('')
  const [cargando, setCargando] = useState(true)
  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const numCols = isWeb ? 4 : 1
  const cardWidth = isWeb ? (screenWidth - 32 - 16 * (numCols - 1)) / numCols : undefined

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, destacada_hasta, directa, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, inmobiliaria_id, inmobiliarias(nombre), propiedad_imagenes(url, thumb_url, orden)')
      .eq('es_inventario', false)
      .eq('estado', 'disponible')
      .order('created_at', { ascending: false })
      .limit(120)
    setLista((data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Prop[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const q = normalizar(busca)
  const vistas = q
    ? lista.filter(p =>
        normalizar(p.titulo).includes(q) ||
        normalizar(p.direccion).includes(q) ||
        normalizar(p.codigo).includes(q))
    : lista

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  function Card({ item, width }: { item: Prop; width?: number }) {
    const primera = (item.propiedad_imagenes ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0]
    const tieneMeta = item.recamaras != null || item.banos != null || item.medios_banos != null
      || item.m2 != null || item.m2_terreno != null || item.estacionamientos != null
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: c.card, borderColor: c.border }, item.destacada && s.cardDestacada, width ? { width } : undefined]}
        activeOpacity={0.9}
        onPress={() => item.codigo && router.push(`/ficha/${item.codigo}` as any)}
      >
        <View style={s.imagenWrapper}>
          {primera?.url
            ? <ThumbImage url={primera.thumb_url ?? primera.url} style={[s.cardImagen, esCerrada(item.estado) && s.fotoCerrada]} />
            : <View style={s.cardImagenPlaceholder}><Text style={{ fontSize: 28 }}>🏠</Text></View>}
          <View style={s.imagenOverlay} />
          <View style={s.badgesTop}>
            <Text style={s.codigoBadge}>{item.codigo ?? '—'}</Text>
            {item.destacada && <Text style={s.destacadaBadge}>★ Destacada</Text>}
            {item.directa && <Text style={s.directaBadge}>🎯 Directa</Text>}
            <View style={[s.estadoBadge, { backgroundColor: colorEstado(item.estado) }]}>
              <Text style={s.estadoText}>{etiquetaEstado(item.estado)}</Text>
            </View>
          </View>
          <View style={s.precioBadge}>
            <Text style={s.precioText}>{money(item.precio)}</Text>
          </View>
        </View>

        <View style={s.cardBody}>
          {item.destacada && item.destacada_mensaje ? (
            <Text style={s.destacadaMensaje}>{item.destacada_mensaje}</Text>
          ) : null}
          {item.tipo && (
            <Text style={[s.cardTipo, { color: c.textMute }]}>
              {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)}
              {item.operacion ? ` · ${item.operacion}` : ''}
            </Text>
          )}
          <Text style={[s.cardTitulo, { color: c.text }]} numberOfLines={2}>{item.titulo}</Text>
          <Text style={[s.cardDireccion, { color: c.textMute }]} numberOfLines={1}>📍 {item.direccion}</Text>
          {item.inmobiliarias?.nombre && (
            <Text style={[s.contactoBadge, { color: c.textMute }]} numberOfLines={1}>🏢 {item.inmobiliarias.nombre}</Text>
          )}
          {tieneMeta && (
            <View style={s.metaRow}>
              {item.recamaras != null && <Text style={s.metaItem}>🛏 {item.recamaras}</Text>}
              {item.banos != null && <Text style={s.metaItem}>🚿 {item.banos}</Text>}
              {item.medios_banos != null && item.medios_banos > 0 && <Text style={s.metaItem}>🚿 ½ {item.medios_banos}</Text>}
              {item.m2 != null && <Text style={s.metaItem}>📐 {item.m2}m² const.</Text>}
              {item.m2_terreno != null && <Text style={s.metaItem}>🌳 {item.m2_terreno}m² terr.</Text>}
              {item.estacionamientos != null && <Text style={s.metaItem}>🚗 {item.estacionamientos}</Text>}
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const encabezado = (
    <View style={{ paddingHorizontal: isWeb ? 0 : 16, paddingTop: isWeb ? 0 : 14 }}>
      <Text style={[s.titulo, { color: c.text }]}>Catálogo compartido</Text>
      <Text style={[s.sub, { color: c.textSub }]}>
        Lo último publicado por todas las inmobiliarias. ¿Te interesa alguna? Escríbenos.
      </Text>
      <View style={[s.busca, { borderColor: c.border, backgroundColor: c.card }]}>
        <Ionicons name="search-outline" size={16} color={c.textSub} />
        <TextInput
          style={[s.buscaInp, { color: c.text }]}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por título, dirección o código…"
          placeholderTextColor={c.placeholder}
        />
      </View>
    </View>
  )

  if (isWeb) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {encabezado}
        {vistas.length === 0 ? (
          <Text style={[s.meta, { color: c.textSub, textAlign: 'center', marginTop: 40 }]}>Sin resultados.</Text>
        ) : (
          <View style={s.webGrid}>
            {vistas.map(item => <Card key={item.id} item={item} width={cardWidth} />)}
          </View>
        )}
      </ScrollView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={vistas}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        ListHeaderComponent={encabezado}
        renderItem={({ item }) => <Card item={item} />}
        ListEmptyComponent={
          <Text style={[s.meta, { color: c.textSub, textAlign: 'center', marginTop: 40 }]}>Sin resultados.</Text>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 10 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 6 },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  meta: { fontSize: 12 },

  webGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },

  card: {
    borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 2px 10px rgba(0,0,0,0.06)' } as any, default: { elevation: 2 } }),
  },
  cardDestacada: { borderWidth: 2, borderColor: '#c9a84c' },
  imagenWrapper: { position: 'relative' },
  cardImagen: { width: '100%', height: 180 },
  fotoCerrada: { opacity: 0.38 },
  cardImagenPlaceholder: { width: '100%', height: 120, backgroundColor: '#e8f0f0', alignItems: 'center', justifyContent: 'center' },
  imagenOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, backgroundColor: 'rgba(0,0,0,0.25)' },
  badgesTop: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6, right: 10 },
  codigoBadge: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: '#1a6470', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  destacadaBadge: { fontSize: 11, fontWeight: '700', color: '#1a2e00', backgroundColor: '#c9a84c', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  directaBadge: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#1a6470', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  estadoBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  estadoText: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.6 },
  precioBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  precioText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  cardBody: { padding: 14 },
  destacadaMensaje: { fontSize: 12, color: '#7a5500', backgroundColor: '#fffbe6', borderRadius: 6, padding: 8, marginBottom: 8 },
  cardTipo: { fontSize: 11, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  cardTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardDireccion: { fontSize: 13, marginBottom: 4 },
  contactoBadge: { fontSize: 12, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaItem: { fontSize: 12, color: '#1a6470', backgroundColor: '#e8f4f4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
})
