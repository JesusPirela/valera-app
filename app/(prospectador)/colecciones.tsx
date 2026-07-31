import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, StyleSheet, Platform, Linking, Alert,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'

const BASE_LINK = 'https://valeraapp.valerarealestate.com/coleccion/'

type Col = {
  id: string; token: string; titulo: string | null; cliente_nombre: string | null
  cliente_id: string | null; cliente_telefono: string | null; vistas: number; abierta_at: string | null
  n_props: number; n_favoritos: number; n_vistas_prop: number; created_at: string
}

// Normaliza un teléfono mexicano para el enlace directo de WhatsApp (52 + 10).
function waNumero(tel: string | null | undefined): string | null {
  if (!tel) return null
  let p = tel.replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  if (p.length === 10) p = '52' + p
  return p.length >= 12 ? p : null
}
type ClienteMin = { id: string; nombre: string; telefono: string | null }

export default function Colecciones() {
  const c = useColors()
  const params = useLocalSearchParams<{ nuevoCliente?: string; nuevoClienteNombre?: string }>()
  const [cols, setCols] = useState<Col[]>([])
  const [loading, setLoading] = useState(true)

  // Modal crear
  const [modal, setModal] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cliente, setCliente] = useState<ClienteMin | null>(null)
  const [clientes, setClientes] = useState<ClienteMin[]>([])
  const [busca, setBusca] = useState('')
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('mis_colecciones')
      setCols((data ?? []) as Col[])
    } catch { /* sin red */ } finally { setLoading(false) }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // Si se llegó desde el detalle de un cliente, abrir el modal ya con ese cliente.
  useFocusEffect(useCallback(() => {
    if (params.nuevoCliente || params.nuevoClienteNombre) {
      setCliente(params.nuevoCliente
        ? { id: String(params.nuevoCliente), nombre: String(params.nuevoClienteNombre ?? 'Cliente'), telefono: null }
        : null)
      setTitulo('Propiedades seleccionadas')
      setModal(true)
      router.setParams({ nuevoCliente: '', nuevoClienteNombre: '' })
    }
  }, [params.nuevoCliente, params.nuevoClienteNombre]))

  async function abrirModal() {
    setTitulo(''); setMensaje(''); setCliente(null); setBusca(''); setModal(true)
    try {
      const { data: { user } } = await getUsuarioActual()
      if (!user) return
      const { data } = await supabase.from('clientes')
        .select('id, nombre, telefono').eq('responsable_id', user.id)
        .is('eliminado_at', null).order('nombre')
      setClientes((data ?? []) as ClienteMin[])
    } catch { /* sin red */ }
  }

  async function crear() {
    setCreando(true)
    try {
      const { data, error } = await supabase.rpc('crear_coleccion', {
        p_titulo: titulo, p_cliente_id: cliente?.id ?? null,
        p_cliente_nombre: cliente?.nombre ?? null, p_mensaje: mensaje,
      })
      if (error || !data?.id) { Alert.alert('Error', error?.message ?? 'No se pudo crear.'); return }
      setModal(false)
      router.push(`/(prospectador)/coleccion-detalle?id=${data.id}`)
    } finally { setCreando(false) }
  }

  function compartir(col: Col, wa: boolean) {
    const link = BASE_LINK + col.token
    const msg = `${col.titulo ? col.titulo + '\n\n' : ''}Te preparé una selección de propiedades. Míralas aquí y marca tus favoritas:\n${link}`
    if (wa) {
      const num = waNumero(col.cliente_telefono)
      const url = num
        ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`
      Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url)
    } else {
      Clipboard.setStringAsync(link)
      Platform.OS === 'web' ? window.alert('✓ Link copiado') : Alert.alert('✓ Copiado', 'El link se copió al portapapeles.')
    }
  }

  const clientesFiltrados = clientes.filter(cl =>
    !busca || cl.nombre.toLowerCase().includes(busca.toLowerCase()))

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[st.h1, { color: c.text }]}>Colecciones</Text>
        <Text style={[st.sub, { color: c.textSub }]}>
          Arma un set de propiedades y manda UN link a tu cliente. Ve cuáles abrió y cuáles marcó como favoritas.
        </Text>

        <TouchableOpacity style={st.btnNueva} onPress={abrirModal} activeOpacity={0.9}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={st.btnNuevaTxt}>Nueva colección</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={c.text} style={{ marginTop: 40 }} />
        ) : cols.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>Aún no tienes colecciones. Crea la primera 👆</Text>
        ) : cols.map(col => (
          <TouchableOpacity key={col.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => router.push(`/(prospectador)/coleccion-detalle?id=${col.id}`)} activeOpacity={0.85}>
            <Text style={[st.cardTitulo, { color: c.text }]} numberOfLines={1}>{col.titulo || 'Colección sin título'}</Text>
            {col.cliente_nombre ? <Text style={[st.cardCliente, { color: c.textSub }]}>Para {col.cliente_nombre}</Text> : null}
            <View style={st.stats}>
              <Text style={[st.stat, { color: c.textSub }]}>🏠 {col.n_props}</Text>
              <Text style={[st.stat, { color: col.vistas > 0 ? '#0369a1' : c.textMute }]}>👁 {col.vistas} {col.vistas === 1 ? 'apertura' : 'aperturas'}</Text>
              <Text style={[st.stat, { color: col.n_favoritos > 0 ? '#e11d48' : c.textMute }]}>❤️ {col.n_favoritos}</Text>
            </View>
            <View style={st.cardActions}>
              <TouchableOpacity style={[st.mini, { borderColor: c.border }]} onPress={() => compartir(col, false)}>
                <Ionicons name="link-outline" size={15} color={c.textSub} />
                <Text style={[st.miniTxt, { color: c.textSub }]}>Copiar link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.mini, st.miniWa]} onPress={() => compartir(col, true)}>
                <Ionicons name="logo-whatsapp" size={15} color="#16a34a" />
                <Text style={[st.miniTxt, { color: '#16a34a' }]}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Modal crear */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={st.ov}>
          <View style={[st.box, { backgroundColor: c.card }]}>
            <View style={st.boxHead}>
              <Text style={[st.boxTitulo, { color: c.text }]}>Nueva colección</Text>
              <TouchableOpacity onPress={() => setModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={c.textSub} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[st.label, { color: c.textSub }]}>Título</Text>
              <TextInput style={[st.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={titulo} onChangeText={setTitulo} placeholder="Ej: Casas en Zibatá para Juan" placeholderTextColor={c.textMute} />

              <Text style={[st.label, { color: c.textSub }]}>Cliente (opcional)</Text>
              {cliente ? (
                <View style={[st.clienteSel, { borderColor: c.border }]}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{cliente.nombre}</Text>
                  <TouchableOpacity onPress={() => setCliente(null)}><Text style={{ color: '#ef4444' }}>Quitar</Text></TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput style={[st.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={busca} onChangeText={setBusca} placeholder="Buscar cliente…" placeholderTextColor={c.textMute} />
                  {busca.length > 0 && (
                    <View style={{ maxHeight: 160 }}>
                      {clientesFiltrados.slice(0, 8).map(cl => (
                        <TouchableOpacity key={cl.id} style={[st.clienteRow, { borderColor: c.border }]}
                          onPress={() => { setCliente(cl); setBusca(''); if (!titulo) setTitulo('Propiedades seleccionadas') }}>
                          <Text style={{ color: c.text }}>{cl.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={[st.label, { color: c.textSub }]}>Mensaje para el cliente (opcional)</Text>
              <TextInput style={[st.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, minHeight: 64, textAlignVertical: 'top' }]}
                value={mensaje} onChangeText={setMensaje} multiline placeholder="Ej: Hola, te dejo estas opciones que encajan con lo que buscas ✨" placeholderTextColor={c.textMute} />

              <TouchableOpacity style={[st.btnCrear, creando && { opacity: 0.6 }]} onPress={crear} disabled={creando}>
                {creando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnCrearTxt}>Crear y elegir propiedades →</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1 },
  h1: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  btnNueva: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 13, marginTop: 16 },
  btnNuevaTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  vacio: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  cardTitulo: { fontSize: 16, fontWeight: '800' },
  cardCliente: { fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 10 },
  stat: { fontSize: 13, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  miniWa: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  miniTxt: { fontSize: 13, fontWeight: '700' },
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  box: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  boxTitulo: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  clienteSel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  clienteRow: { borderBottomWidth: 1, paddingVertical: 11, paddingHorizontal: 4 },
  btnCrear: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 22, marginBottom: 8 },
  btnCrearTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
