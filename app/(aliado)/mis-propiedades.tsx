// SUS propiedades: las de su inmobiliaria y nada más.
//
// El filtro no es cosa de esta pantalla: la base solo les deja escribir las
// que llevan su `inmobiliaria_id` (ver 20261127_aliados_4_rol.sql). Aquí se
// consulta por ese mismo id para que la lista enseñe lo mismo que pueden
// tocar; si alguien cambiara esta consulta a mano, seguiría sin poder editar
// lo ajeno.
//
// La tarjeta es la MISMA que catalogo.tsx (que a su vez es la de
// (admin)/propiedades.tsx menos los botones de administración): mismos
// badges, mismo precio sobre la foto, mismos specs — para que entrar a
// "Nuestras propiedades" o a "Catálogo" se sienta como la misma app.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Platform, ScrollView, useWindowDimensions,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { esCerrada, etiquetaEstado, colorEstado } from '../../lib/estado-propiedad'

type Prop = {
  id: string; codigo: string | null; titulo: string | null; precio: number | null
  direccion: string | null; operacion: string | null; tipo: string | null
  estado: string | null; destacada: boolean | null; destacada_mensaje: string | null
  directa: boolean | null
  recamaras: number | null; banos: number | null; medios_banos: number | null
  m2: number | null; m2_terreno: number | null; estacionamientos: number | null
  propiedad_imagenes: { url: string; thumb_url: string | null; orden: number | null }[] | null
}

type Estadisticas = {
  disponibles: number; vendidas: number; rentadas: number
  publicaciones: number; vistas: number
}

const money = (n: number | null) =>
  n ? '$' + Math.round(n).toLocaleString('es-MX') : 'Sin precio'

const SELECT_PROP = 'id, codigo, titulo, precio, direccion, operacion, tipo, estado, destacada, destacada_mensaje, directa, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, propiedad_imagenes(url, thumb_url, orden)'

export default function AliadoPropiedades() {
  const c = useColors()
  const [lista, setLista] = useState<Prop[]>([])
  const [cargando, setCargando] = useState(true)
  const [agencia, setAgencia] = useState<string | null>(null)
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const numCols = isWeb ? 4 : 1
  const cardWidth = isWeb ? (screenWidth - 32 - 16 * (numCols - 1)) / numCols : undefined

  const cargar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: perfil } = await supabase
      .from('profiles').select('inmobiliaria_id').eq('id', session.user.id).single()
    if (!perfil?.inmobiliaria_id) { setCargando(false); return }
    const [{ data: inm }, { data }, { data: est }] = await Promise.all([
      supabase.from('inmobiliarias').select('nombre').eq('id', perfil.inmobiliaria_id).single(),
      supabase.from('propiedades').select(SELECT_PROP)
        .eq('inmobiliaria_id', perfil.inmobiliaria_id)
        .order('created_at', { ascending: false }),
      supabase.rpc('estadisticas_aliado'),
    ])
    setAgencia(inm?.nombre ?? null)
    setLista((data ?? []) as unknown as Prop[])
    setStats((est ?? null) as Estadisticas | null)
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

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
          <Text style={[s.cardTitulo, { color: c.text }]} numberOfLines={2}>{item.titulo ?? item.codigo ?? 'Sin título'}</Text>
          <Text style={[s.cardDireccion, { color: c.textMute }]} numberOfLines={1}>📍 {item.direccion}</Text>
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
    <>
      <View style={s.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Nuestras propiedades</Text>
          <Text style={[s.sub, { color: c.textSub }]}>
            {lista.length === 0
              ? `Todavía no hay ninguna publicada${agencia ? ` de ${agencia}` : ''}.`
              : `${lista.length} publicada${lista.length === 1 ? '' : 's'}${agencia ? ` · ${agencia}` : ''}`}
          </Text>
        </View>
        <TouchableOpacity style={s.btnAgregar} onPress={() => router.push('/(aliado)/nueva-propiedad')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.btnAgregarTxt}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={s.statsGrid}>
          {[
            { icono: 'home' as const, color: '#1a6470', num: stats.disponibles, lbl: 'Disponibles' },
            { icono: 'checkmark-done' as const, color: '#2e7d32', num: stats.vendidas + stats.rentadas, lbl: 'Vendidas/rentadas' },
            { icono: 'eye' as const, color: '#5e35b1', num: stats.vistas, lbl: 'Vistas de tu catálogo' },
            { icono: 'megaphone' as const, color: '#c9a84c', num: stats.publicaciones, lbl: 'Veces impulsadas' },
          ].map((b, i) => (
            <View key={i} style={[s.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[s.statIcono, { backgroundColor: b.color + '22' }]}>
                <Ionicons name={b.icono} size={16} color={b.color} />
              </View>
              <Text style={[s.statNum, { color: c.text }]}>{b.num}</Text>
              <Text style={[s.statLbl, { color: c.textSub }]}>{b.lbl}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  )

  const vacio = (
    <View style={s.vacio}>
      <Ionicons name="home-outline" size={30} color={c.textMute} />
      <Text style={[s.vacioTxt, { color: c.textSub }]}>
        Aquí van las propiedades de tu inmobiliaria. Las que subas se verán
        también en el catálogo compartido.
      </Text>
    </View>
  )

  if (isWeb) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {encabezado}
        {lista.length === 0 ? vacio : (
          <View style={s.webGrid}>
            {lista.map(item => <Card key={item.id} item={item} width={cardWidth} />)}
          </View>
        )}
      </ScrollView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={lista}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        ListHeaderComponent={<View style={{ marginBottom: 4 }}>{encabezado}</View>}
        ListEmptyComponent={vacio}
        renderItem={({ item }) => <Card item={item} />}
      />
    </View>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  titulo: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 4, marginBottom: 10 },
  statCard: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 },
  statIcono: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 19, fontWeight: '900' },
  statLbl: { fontSize: 11 },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#5e35b1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9,
  },
  btnAgregarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  vacio: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 40 },
  vacioTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },

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
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaItem: { fontSize: 12, color: '#1a6470', backgroundColor: '#e8f4f4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
})
