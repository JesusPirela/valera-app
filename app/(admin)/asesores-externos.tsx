// Asesores externos: agenda de asesores que nos apoyan por zona. Guarda
// nombre, teléfono y la zona por la que apoyan. CRUD simple (admin/gerencia).
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
  Modal, Alert, Platform, Linking, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { normalizar } from '../../lib/texto'
import { useColors } from '../../lib/ThemeContext'

type Asesor = { id: string; nombre: string; telefono: string | null; zona: string | null }
const TEAL = '#1a6470'
function soloTel(t: string | null | undefined) { return (t ?? '').replace(/[^\d+]/g, '') }

export default function AsesoresExternos() {
  const c = useColors()
  const [lista, setLista] = useState<Asesor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Partial<Asesor> | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await supabase.from('asesores_externos')
        .select('id, nombre, telefono, zona').order('nombre')
      setLista((data ?? []) as Asesor[])
    } catch { /* red */ } finally { setLoading(false); setRefreshing(false) }
  }, [])
  useFocusEffect(useCallback(() => { cargar(true) }, [cargar]))

  async function guardar() {
    if (!editando || !editando.nombre?.trim()) { Alert.alert('Falta el nombre', 'Escribe al menos el nombre del asesor.'); return }
    setGuardando(true)
    const payload = {
      nombre: editando.nombre.trim(),
      telefono: editando.telefono?.trim() || null,
      zona: editando.zona?.trim() || null,
    }
    if (editando.id) {
      await supabase.from('asesores_externos').update(payload).eq('id', editando.id)
    } else {
      const { data: { user } } = await getUsuarioActual()
      await supabase.from('asesores_externos').insert({ ...payload, created_by: user?.id ?? null })
    }
    setGuardando(false); setEditando(null); cargar(true)
  }

  function borrar(a: Asesor) {
    const go = async () => { setLista(prev => prev.filter(x => x.id !== a.id)); await supabase.from('asesores_externos').delete().eq('id', a.id) }
    if (Platform.OS === 'web') { if (window.confirm(`¿Borrar a ${a.nombre}?`)) go() }
    else Alert.alert('Borrar asesor', `¿Borrar a ${a.nombre}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  const q = normalizar(busca)
  const qDig = busca.replace(/\D/g, '')
  const filtrados = lista.filter(a =>
    (!q || normalizar(a.nombre).includes(q) || normalizar(a.zona).includes(q)) &&
    (qDig.length === 0 || soloTel(a.telefono).includes(qDig))
  )

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(true) }} tintColor={TEAL} />}
      >
        <Text style={[st.h1, { color: c.text }]}>Asesores externos</Text>
        <Text style={[st.sub, { color: c.textMute }]}>Asesores que nos apoyan por zona. {lista.length} registrado{lista.length !== 1 ? 's' : ''}.</Text>

        <View style={[st.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
          <Ionicons name="search-outline" size={16} color={c.textMute} />
          <TextInput style={[st.buscaInp, { color: c.text }]} value={busca} onChangeText={setBusca}
            placeholder="Buscar por nombre, zona o teléfono…" placeholderTextColor={c.placeholder} />
        </View>

        {filtrados.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>
            {lista.length === 0 ? 'Aún no hay asesores externos. Toca "＋ Agregar" para registrar el primero.' : 'Sin resultados.'}
          </Text>
        ) : filtrados.map(a => (
          <View key={a.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[st.avatar, { backgroundColor: c.bg }]}>
              <Text style={st.avatarTxt}>{a.nombre.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[st.nombre, { color: c.text }]} numberOfLines={1}>{a.nombre}</Text>
              {a.zona ? <View style={st.zonaRow}><Ionicons name="location-outline" size={12} color={TEAL} /><Text style={[st.zona, { color: c.textSub }]} numberOfLines={1}>{a.zona}</Text></View> : null}
              {a.telefono ? <Text style={[st.tel, { color: c.textMute }]}>{a.telefono}</Text> : null}
            </View>
            <View style={st.acciones}>
              {a.telefono ? (
                <>
                  <TouchableOpacity style={[st.accBtn, { backgroundColor: '#25D36622' }]} onPress={() => Linking.openURL(`https://wa.me/${soloTel(a.telefono).replace(/^\+/, '')}`)}>
                    <Ionicons name="logo-whatsapp" size={16} color="#128C7E" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.accBtn, { backgroundColor: TEAL + '22' }]} onPress={() => Linking.openURL(`tel:${soloTel(a.telefono)}`)}>
                    <Ionicons name="call" size={15} color={TEAL} />
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity style={[st.accBtn, { backgroundColor: c.bg }]} onPress={() => setEditando(a)}>
                <Ionicons name="create-outline" size={16} color={c.textSub} />
              </TouchableOpacity>
              <TouchableOpacity style={[st.accBtn, { backgroundColor: '#fee2e2' }]} onPress={() => borrar(a)}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={st.fab} onPress={() => setEditando({ nombre: '', telefono: '', zona: '' })} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={st.fabTxt}>Agregar</Text>
      </TouchableOpacity>

      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: c.card }]}>
            <View style={st.handle} />
            <Text style={[st.mTit, { color: c.text }]}>{editando?.id ? 'Editar asesor' : 'Nuevo asesor externo'}</Text>

            <Text style={[st.lbl, { color: c.textSub }]}>Nombre</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.nombre ?? ''} onChangeText={v => setEditando(e => ({ ...e, nombre: v }))}
              placeholder="Nombre del asesor" placeholderTextColor={c.placeholder} autoCapitalize="words" />

            <Text style={[st.lbl, { color: c.textSub }]}>Teléfono</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.telefono ?? ''} onChangeText={v => setEditando(e => ({ ...e, telefono: v }))}
              placeholder="Ej. 442 123 4567" placeholderTextColor={c.placeholder} keyboardType="phone-pad" />

            <Text style={[st.lbl, { color: c.textSub }]}>Zona por la que nos apoya</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.zona ?? ''} onChangeText={v => setEditando(e => ({ ...e, zona: v }))}
              placeholder="Ej. Juriquilla, El Refugio…" placeholderTextColor={c.placeholder} autoCapitalize="words" />

            <TouchableOpacity style={[st.guardarBtn, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={st.guardarTxt}>{editando?.id ? 'Guardar cambios' : 'Agregar asesor'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={st.cancelar} onPress={() => setEditando(null)}><Text style={[st.cancelarTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 14 },
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginTop: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 17, fontWeight: '800', color: TEAL },
  nombre: { fontSize: 15, fontWeight: '800' },
  zonaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  zona: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  tel: { fontSize: 12, marginTop: 2 },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 18, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL, borderRadius: 26, paddingHorizontal: 18, paddingVertical: 13, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  mTit: { fontSize: 19, fontWeight: '900', marginBottom: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  inp: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  guardarBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelar: { alignItems: 'center', paddingVertical: 12 },
  cancelarTxt: { fontSize: 14, fontWeight: '700' },
})
