import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Alert, Modal,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Inmobiliaria = {
  id: string
  nombre: string
  logo_url: string | null
  telefono: string | null
  email: string | null
  sitio_web: string | null
}

const EMPTY: Omit<Inmobiliaria, 'id'> = {
  nombre: '', logo_url: null, telefono: null, email: null, sitio_web: null,
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function AdminInmobiliarias() {
  const [lista, setLista] = useState<Inmobiliaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Inmobiliaria | null>(null)
  const [form, setForm] = useState<Omit<Inmobiliaria, 'id'>>(EMPTY)
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('inmobiliarias')
      .select('*')
      .order('nombre')
    setLista(data ?? [])
    setLoading(false)
  }

  function abrirNueva() {
    setEditando(null)
    setForm(EMPTY)
    setModal(true)
  }

  function abrirEditar(inm: Inmobiliaria) {
    setEditando(inm)
    setForm({ nombre: inm.nombre, logo_url: inm.logo_url, telefono: inm.telefono, email: inm.email, sitio_web: inm.sitio_web })
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { alerta('El nombre es obligatorio'); return }
    setGuardando(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        logo_url: form.logo_url?.trim() || null,
        telefono: form.telefono?.trim() || null,
        email: form.email?.trim() || null,
        sitio_web: form.sitio_web?.trim() || null,
      }
      if (editando) {
        const { error } = await supabase.from('inmobiliarias').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('inmobiliarias').insert(payload)
        if (error) throw error
      }
      setModal(false)
      cargar()
    } catch (e: any) {
      alerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(inm: Inmobiliaria) {
    const confirmar = async () => {
      const { error } = await supabase.from('inmobiliarias').delete().eq('id', inm.id)
      if (error) alerta('Error: ' + error.message)
      else cargar()
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar "${inm.nombre}"?`)) confirmar()
    } else {
      Alert.alert('Eliminar', `¿Eliminar "${inm.nombre}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmar },
      ])
    }
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.titulo}>Inmobiliarias</Text>
        <TouchableOpacity style={s.btnNuevo} onPress={abrirNueva}>
          <Text style={s.btnNuevoText}>+ Nueva</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
      ) : lista.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No hay inmobiliarias registradas aún.</Text>
          <TouchableOpacity style={s.btnAdd} onPress={abrirNueva}>
            <Text style={s.btnAddText}>+ Agregar primera empresa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.lista}>
          {lista.map(inm => (
            <View key={inm.id} style={s.card}>
              <View style={s.cardIcon}>
                <Text style={s.cardIconText}>🏢</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardNombre}>{inm.nombre}</Text>
                {inm.telefono && <Text style={s.cardMeta}>📞 {inm.telefono}</Text>}
                {inm.email && <Text style={s.cardMeta}>✉ {inm.email}</Text>}
                {inm.sitio_web && <Text style={s.cardMeta}>🌐 {inm.sitio_web}</Text>}
              </View>
              <View style={s.cardAcciones}>
                <TouchableOpacity style={s.btnEdit} onPress={() => abrirEditar(inm)}>
                  <Text style={s.btnEditText}>✏</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnDel} onPress={() => eliminar(inm)}>
                  <Text style={s.btnDelText}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Modal agregar/editar */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>{editando ? 'Editar empresa' : 'Nueva empresa'}</Text>

            <Text style={s.fieldLabel}>Nombre *</Text>
            <TextInput
              style={s.input}
              value={form.nombre}
              onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej. Spacio Vitale"
              placeholderTextColor="#aaa"
            />

            <Text style={s.fieldLabel}>Teléfono</Text>
            <TextInput
              style={s.input}
              value={form.telefono ?? ''}
              onChangeText={v => setForm(f => ({ ...f, telefono: v }))}
              placeholder="+52 000 000 0000"
              placeholderTextColor="#aaa"
              keyboardType="phone-pad"
            />

            <Text style={s.fieldLabel}>Email</Text>
            <TextInput
              style={s.input}
              value={form.email ?? ''}
              onChangeText={v => setForm(f => ({ ...f, email: v }))}
              placeholder="contacto@empresa.com"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.fieldLabel}>Sitio web</Text>
            <TextInput
              style={s.input}
              value={form.sitio_web ?? ''}
              onChangeText={v => setForm(f => ({ ...f, sitio_web: v }))}
              placeholder="https://empresa.com"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />

            <Text style={s.fieldLabel}>URL del logo</Text>
            <TextInput
              style={s.input}
              value={form.logo_url ?? ''}
              onChangeText={v => setForm(f => ({ ...f, logo_url: v }))}
              placeholder="https://..."
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.5 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnGuardarText}>💾 Guardar</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}>
              <Text style={s.btnCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  backText: { color: '#c9a84c', fontSize: 14 },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  btnNuevo: { backgroundColor: '#c9a84c', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnNuevoText: { color: '#000', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { color: '#666', fontSize: 15 },
  btnAdd: { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  btnAddText: { color: '#000', fontWeight: '700' },
  lista: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#222',
  },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  cardIconText: { fontSize: 22 },
  cardNombre: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  cardAcciones: { flexDirection: 'row', gap: 8 },
  btnEdit: { padding: 8 },
  btnEditText: { fontSize: 18 },
  btnDel: { padding: 8 },
  btnDelText: { fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 4 },
  modalTitulo: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: '#111', color: '#fff', borderRadius: 8,
    borderWidth: 1, borderColor: '#333', padding: 12, fontSize: 14, marginBottom: 10,
  },
  btnGuardar: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 15 },
  btnCancelar: { paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { color: '#666', fontSize: 14 },
})
