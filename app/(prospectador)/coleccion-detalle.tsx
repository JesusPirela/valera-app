import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, StyleSheet, Platform, Linking, Alert, FlatList,
} from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { thumb } from '../../lib/img'
import { useColors } from '../../lib/ThemeContext'
import CompartirFormulario from '../../components/CompartirFormulario'
import { FiltrosBusquedaPropiedad, FiltrosPropiedad, FILTROS_VACIOS, hayFiltrosActivos, aplicarFiltrosPropiedad } from '../../components/FiltrosBusquedaPropiedad'

const BASE_LINK = 'https://valeraapp.valerarealestate.com/coleccion/'

type Item = {
  propiedad_id: string; codigo: string; titulo: string; precio: number | null
  direccion: string; imagen: string | null; favorito: boolean
  visto_at: string | null; vistas: number
}
type Detalle = {
  id: string; token: string; titulo: string | null; cliente_nombre: string | null
  cliente_telefono: string | null
  mensaje: string | null; vistas: number; items: Item[]
}

// Normaliza un teléfono mexicano para el enlace directo de WhatsApp (52 + 10).
// Devuelve null si no hay número usable → se cae al selector de contactos.
function waNumero(tel: string | null | undefined): string | null {
  if (!tel) return null
  let p = tel.replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  if (p.length === 10) p = '52' + p
  return p.length >= 12 ? p : null
}
type PropBusca = { id: string; codigo: string; titulo: string; precio: number | null; direccion: string; imagen: string | null }

function fmt(p: number | null) {
  if (p == null) return 'Precio a consultar'
  return '$' + p.toLocaleString('es-MX')
}

export default function ColeccionDetalle() {
  const c = useColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [det, setDet] = useState<Detalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [registrados, setRegistrados] = useState<{ id: string; nombre: string; telefono: string; created_at: string }[]>([])

  const [addModal, setAddModal] = useState(false)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<PropBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [modalForm, setModalForm] = useState(false)
  // Filtros del buscador de propiedades (componente reutilizable)
  const [filtros, setFiltros] = useState<FiltrosPropiedad>(FILTROS_VACIOS)
  const hayFiltro = hayFiltrosActivos(filtros)

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('coleccion_detalle', { p_id: id })
      setDet(data as Detalle)
      const token = (data as Detalle)?.token
      if (token) {
        // Clientes que se registraron desde el formulario de ESTA colección.
        const { data: regs } = await supabase.from('clientes')
          .select('id, nombre, telefono, created_at')
          .eq('coleccion_token', token)
          .is('eliminado_at', null)
          .order('created_at', { ascending: false })
        setRegistrados(regs ?? [])
      }
    } catch { /* sin red */ } finally { setLoading(false) }
  }, [id])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function buscar() {
    const q = busca.trim()
    // Requiere al menos texto (2+) o algún filtro activo para consultar.
    if (q.length < 2 && !hayFiltro) { setResultados([]); return }
    setBuscando(true)
    try {
      let query = supabase.from('propiedades')
        .select('id, codigo, titulo, precio, direccion, propiedad_imagenes(url, orden, thumb_url)')
        .eq('estado', 'disponible').eq('es_inventario', false)
      if (q.length >= 2) {
        const like = `%${q}%`
        query = query.or(`codigo.ilike.${like},titulo.ilike.${like},direccion.ilike.${like}`)
      }
      query = aplicarFiltrosPropiedad(query, filtros)
      // Tope alto: una zona (ej. Juriquilla) puede tener cientos de propiedades
      // y el usuario quiere verlas TODAS, no solo las primeras.
      const { data } = await query.order('precio', { ascending: true, nullsFirst: false }).limit(500)
      const yaEn = new Set((det?.items ?? []).map(i => i.propiedad_id))
      const rows = (data ?? []).map((p: any) => {
        const imgs = [...(p.propiedad_imagenes ?? [])].sort((a: any, b: any) => a.orden - b.orden)
        return { id: p.id, codigo: p.codigo, titulo: p.titulo, precio: p.precio, direccion: p.direccion,
          imagen: imgs[0]?.thumb_url ?? imgs[0]?.url ?? null }
      }).filter((p: PropBusca) => !yaEn.has(p.id))
      setResultados(rows)
    } catch { /* sin red */ } finally { setBuscando(false) }
  }

  // Re-ejecuta la búsqueda (con debounce) cuando cambia el texto o cualquier
  // filtro, mientras el modal de agregar está abierto.
  useEffect(() => {
    if (!addModal) return
    const t = setTimeout(() => { buscar() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addModal, busca, filtros, det?.items?.length])

  async function agregar(p: PropBusca) {
    setResultados(r => r.filter(x => x.id !== p.id))
    try {
      await supabase.rpc('coleccion_agregar_item', { p_coleccion_id: id, p_propiedad_id: p.id })
      cargar()
    } catch { /* sin red */ }
  }

  async function quitar(item: Item) {
    const run = async () => {
      setDet(d => d ? { ...d, items: d.items.filter(i => i.propiedad_id !== item.propiedad_id) } : d)
      try { await supabase.rpc('coleccion_quitar_item', { p_coleccion_id: id, p_propiedad_id: item.propiedad_id }) } catch {}
    }
    if (Platform.OS === 'web') { if (window.confirm(`¿Quitar ${item.codigo} de la colección?`)) run() }
    else Alert.alert('Quitar propiedad', `¿Quitar ${item.codigo}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: run }])
  }

  function compartir(wa: boolean) {
    if (!det) return
    const link = BASE_LINK + det.token
    if (wa) {
      const msg = `${det.titulo ? det.titulo + '\n\n' : ''}Te preparé una selección de propiedades. Míralas y marca tus favoritas:\n${link}`
      // Con teléfono del cliente → abre DIRECTO su chat; si no, el selector.
      const num = waNumero(det.cliente_telefono)
      const url = num
        ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`
      Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url)
    } else {
      Clipboard.setStringAsync(link)
      Platform.OS === 'web' ? window.alert('✓ Link copiado') : Alert.alert('✓ Copiado', 'El link se copió al portapapeles.')
    }
  }

  async function eliminar() {
    const run = async () => {
      try { await supabase.rpc('eliminar_coleccion', { p_id: id }) } catch {}
      router.replace('/(prospectador)/colecciones')
    }
    if (Platform.OS === 'web') { if (window.confirm('¿Eliminar esta colección? El link dejará de funcionar.')) run() }
    else Alert.alert('Eliminar colección', 'El link dejará de funcionar.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: run }])
  }

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator color={c.text} size="large" /></View>
  if (!det) return <View style={[st.center, { backgroundColor: c.bg }]}><Text style={{ color: c.textSub }}>No se encontró la colección.</Text></View>

  const totalFav = det.items.filter(i => i.favorito).length

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[st.h1, { color: c.text }]}>{det.titulo || 'Colección'}</Text>
        {det.cliente_nombre ? <Text style={[st.cliente, { color: c.textSub }]}>Para {det.cliente_nombre}</Text> : null}

        <View style={[st.resumen, { borderColor: c.border, backgroundColor: c.card }]}>
          <View style={st.rItem}><Text style={st.rNum}>{det.items.length}</Text><Text style={[st.rLbl, { color: c.textSub }]}>propiedades</Text></View>
          <View style={st.rItem}><Text style={[st.rNum, { color: '#0369a1' }]}>{det.vistas}</Text><Text style={[st.rLbl, { color: c.textSub }]}>aperturas</Text></View>
          <View style={st.rItem}><Text style={[st.rNum, { color: '#e11d48' }]}>{totalFav}</Text><Text style={[st.rLbl, { color: c.textSub }]}>favoritas</Text></View>
          <View style={st.rItem}><Text style={[st.rNum, { color: '#16a34a' }]}>{registrados.length}</Text><Text style={[st.rLbl, { color: c.textSub }]}>registrados</Text></View>
        </View>

        {/* Historial: clientes que se registraron desde el formulario de esta colección */}
        {registrados.length > 0 && (
          <View style={[st.histBox, { borderColor: c.border, backgroundColor: c.card }]}>
            <Text style={[st.histTit, { color: c.text }]}>📋 Se registraron aquí ({registrados.length})</Text>
            {registrados.map(r => (
              <TouchableOpacity
                key={r.id}
                style={[st.histRow, { borderColor: c.border }]}
                onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${r.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.histNombre, { color: c.text }]} numberOfLines={1}>{r.nombre}</Text>
                  <Text style={[st.histTel, { color: c.textSub }]} numberOfLines={1}>{r.telefono} · {new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textMute} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={st.share}>
          <TouchableOpacity style={[st.shareBtn, st.shareWa]} onPress={() => compartir(true)}>
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={st.shareWaTxt}>Enviar por WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.shareBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => compartir(false)}>
            <Ionicons name="link-outline" size={18} color={c.textSub} />
            <Text style={[st.shareTxt, { color: c.textSub }]}>Copiar link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.shareBtn, { backgroundColor: '#e0f4f5' }]} onPress={() => setModalForm(true)}>
            <Ionicons name="clipboard-outline" size={18} color="#1a6470" />
            <Text style={[st.shareTxt, { color: '#1a6470' }]}>Con formulario</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={st.btnAdd} onPress={() => { setBusca(''); setResultados([]); setAddModal(true) }}>
          <Ionicons name="add" size={18} color="#1a6470" />
          <Text style={st.btnAddTxt}>Agregar propiedades</Text>
        </TouchableOpacity>

        {det.items.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>Aún no hay propiedades. Agrega 4–5 que le encajen al cliente 👆</Text>
        ) : det.items.map(item => (
          <View key={item.propiedad_id} style={[st.item, { backgroundColor: c.card, borderColor: item.favorito ? '#fbcfe0' : c.border }]}>
            {item.imagen
              ? <Image source={{ uri: thumb(item.imagen, { width: 240, quality: 60 }) ?? item.imagen }} style={st.itemImg} contentFit="cover" />
              : <View style={[st.itemImg, { backgroundColor: c.border }]} />}
            <View style={{ flex: 1 }}>
              <Text style={[st.itemPrecio, { color: c.text }]}>{fmt(item.precio)}</Text>
              <Text style={[st.itemTitulo, { color: c.textSub }]} numberOfLines={1}>{item.codigo} · {item.titulo}</Text>
              <View style={st.itemStats}>
                {item.favorito ? <Text style={st.favTag}>❤️ Favorita del cliente</Text>
                  : item.visto_at ? <Text style={[st.vistoTag]}>👁 La abrió</Text>
                  : <Text style={[st.noVisto, { color: c.textMute }]}>Sin abrir aún</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => quitar(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={st.btnElim} onPress={eliminar}>
          <Text style={st.btnElimTxt}>Eliminar colección</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal agregar propiedades */}
      {modalForm && det && (
        <CompartirFormulario tipo="coleccion" refId={det.token} titulo={det.titulo || 'Selección de propiedades'} onClose={() => setModalForm(false)} />
      )}

      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <View style={st.ov}>
          <View style={[st.box, { backgroundColor: c.card }]}>
            <View style={st.boxHead}>
              <Text style={[st.boxTitulo, { color: c.text }]}>Agregar propiedades</Text>
              <TouchableOpacity onPress={() => setAddModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={c.textSub} />
              </TouchableOpacity>
            </View>
            <TextInput style={[st.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={busca} onChangeText={setBusca} placeholder="Buscar por código, título o zona…" placeholderTextColor={c.textMute} autoFocus />

            <FiltrosBusquedaPropiedad value={filtros} onChange={setFiltros} />

            <FlatList
              style={{ marginTop: 10, flex: 1 }}
              data={resultados}
              keyExtractor={p => p.id}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              windowSize={7}
              ListHeaderComponent={resultados.length > 0
                ? <Text style={[st.buscaHint, { color: c.textMute, textAlign: 'left', marginTop: 0, marginBottom: 6 }]}>{resultados.length} resultado{resultados.length !== 1 ? 's' : ''}</Text>
                : null}
              ListEmptyComponent={
                buscando ? <ActivityIndicator color={c.text} style={{ marginTop: 20 }} />
                  : busca.trim().length < 2 && !hayFiltro ? <Text style={[st.buscaHint, { color: c.textMute }]}>Escribe al menos 2 letras o usa un filtro.</Text>
                  : <Text style={[st.buscaHint, { color: c.textMute }]}>Sin resultados nuevos.</Text>
              }
              renderItem={({ item: p }) => (
                <TouchableOpacity style={[st.resRow, { borderColor: c.border }]} onPress={() => agregar(p)}>
                  {p.imagen ? <Image source={{ uri: thumb(p.imagen, { width: 120, quality: 55 }) ?? p.imagen }} style={st.resImg} contentFit="cover" />
                    : <View style={[st.resImg, { backgroundColor: c.border }]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{fmt(p.precio)}</Text>
                    <Text style={{ color: c.textSub, fontSize: 12 }} numberOfLines={1}>{p.codigo} · {p.titulo}</Text>
                  </View>
                  <Ionicons name="add-circle" size={26} color="#1a6470" />
                </TouchableOpacity>
              )}
              ListFooterComponent={<View style={{ height: 30 }} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  cliente: { fontSize: 14, marginTop: 2 },
  resumen: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 14 },
  rItem: { flex: 1, alignItems: 'center' },
  rNum: { fontSize: 22, fontWeight: '800', color: '#17323a' },
  rLbl: { fontSize: 12, marginTop: 2 },
  histBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  histTit: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  histNombre: { fontSize: 15, fontWeight: '700' },
  histTel: { fontSize: 12.5, marginTop: 1 },
  share: { flexDirection: 'row', gap: 10, marginTop: 14 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, paddingVertical: 12 },
  shareWa: { backgroundColor: '#25D366' },
  shareWaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  shareTxt: { fontWeight: '700', fontSize: 14 },
  btnAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#1a6470', borderStyle: 'dashed', borderRadius: 11, paddingVertical: 12, marginTop: 18 },
  btnAddTxt: { color: '#1a6470', fontWeight: '800', fontSize: 14 },
  vacio: { textAlign: 'center', marginTop: 30, fontSize: 14, lineHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  itemImg: { width: 64, height: 64, borderRadius: 8 },
  itemPrecio: { fontSize: 16, fontWeight: '800' },
  itemTitulo: { fontSize: 12, marginTop: 2 },
  itemStats: { marginTop: 6 },
  favTag: { fontSize: 12, color: '#e11d48', fontWeight: '700' },
  vistoTag: { fontSize: 12, color: '#0369a1', fontWeight: '700' },
  noVisto: { fontSize: 12 },
  btnElim: { alignItems: 'center', marginTop: 28, padding: 10 },
  btnElimTxt: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  box: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: '80%' },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  boxTitulo: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  buscaHint: { textAlign: 'center', marginTop: 24, fontSize: 13 },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 10 },
  resImg: { width: 48, height: 48, borderRadius: 8 },
})
