import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Image, TextInput, Platform, Alert, Modal,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router'
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

type Contacto = {
  id: string
  nombre: string
  telefono_contacto: string | null
}

const SIN_CONSTRUCTORA = 'Sin constructora'
const EMPTY_CONTACTO: Omit<Contacto, 'id'> = { nombre: '', telefono_contacto: null }

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function AdminConstructoras() {
  const c = useColors()
  const params = useLocalSearchParams<{ vista?: string }>()
  const [vista, setVista] = useState<'catalogo' | 'contactos'>(params.vista === 'contactos' ? 'contactos' : 'catalogo')
  const [rol, setRol] = useState<string | null>(null)

  // ── Catálogo (igual al que ve el prospectador) ──────────────────────────
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})

  // ── Contactos (teléfono por constructora — solo admin) ──────────────────
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [loadingContactos, setLoadingContactos] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Contacto | null>(null)
  const [form, setForm] = useState<Omit<Contacto, 'id'>>(EMPTY_CONTACTO)
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => {
    cargarRol()
    cargarCatalogo()
    cargarContactos()
  }, []))

  async function cargarRol() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    setRol(data?.role ?? null)
  }

  async function cargarCatalogo() {
    setLoadingCatalogo(true)
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })
      .order('precio', { ascending: true, nullsFirst: false })

    const lista = (data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Modelo[]

    setModelos(lista)
    setLoadingCatalogo(false)
  }

  async function cargarContactos() {
    setLoadingContactos(true)
    const { data } = await supabase.from('constructoras').select('*').order('nombre')
    setContactos(data ?? [])
    setLoadingContactos(false)
  }

  // Agrupar por constructora, preservando orden de aparición
  const grupos: { nombre: string; modelos: Modelo[] }[] = []
  for (const m of modelos) {
    const nombre = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
    let g = grupos.find((x) => x.nombre === nombre)
    if (!g) { g = { nombre, modelos: [] }; grupos.push(g) }
    g.modelos.push(m)
  }

  function abrirNuevoContacto() {
    setEditando(null)
    setForm(EMPTY_CONTACTO)
    setModal(true)
  }

  function abrirEditarContacto(item: Contacto) {
    setEditando(item)
    setForm({ nombre: item.nombre, telefono_contacto: item.telefono_contacto })
    setModal(true)
  }

  async function guardarContacto() {
    if (!form.nombre.trim()) { alerta('El nombre es obligatorio'); return }
    setGuardando(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        telefono_contacto: form.telefono_contacto?.trim() || null,
      }
      if (editando) {
        const { error } = await supabase.from('constructoras').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('constructoras').insert(payload)
        if (error) throw error
      }
      setModal(false)
      cargarContactos()
    } catch (e: any) {
      alerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarContacto(item: Contacto) {
    const confirmar = async () => {
      const { error } = await supabase.from('constructoras').delete().eq('id', item.id)
      if (error) alerta('Error: ' + error.message)
      else cargarContactos()
    }
    const msg = `¿Eliminar "${item.nombre}"? Las propiedades que la usan no se borran, solo deja de poder generarse el mensaje de WhatsApp para ella.`
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) confirmar()
    } else {
      Alert.alert('Eliminar', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmar },
      ])
    }
  }

  const esAdmin = rol === 'admin'

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Text style={styles.backTxt}>← Volver</Text>
        </TouchableOpacity>
        {esAdmin && (
          <TouchableOpacity
            style={[styles.toggleBtn, vista === 'contactos' && styles.toggleBtnActivo]}
            onPress={() => setVista(vista === 'catalogo' ? 'contactos' : 'catalogo')}
          >
            <Text style={[styles.toggleBtnTxt, vista === 'contactos' && styles.toggleBtnTxtActivo]}>
              {vista === 'catalogo' ? '📞 Ver contactos de constructoras' : '🏗️ Ver catálogo'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {vista === 'catalogo' || !esAdmin ? (
        <>
          <View style={styles.intro}>
            <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
            <Text style={[styles.introSub, { color: c.textMute }]}>Explora los modelos disponibles por constructora.</Text>
          </View>

          {loadingCatalogo ? (
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
                          onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: m.id } })}
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
        </>
      ) : (
        <>
          <Text style={[styles.introSub, { color: c.textMute, marginBottom: 8 }]}>
            El teléfono de contacto se usa para generar el mensaje de WhatsApp al registrar un cliente con esta constructora.
          </Text>

          {loadingContactos ? (
            <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
          ) : contactos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: c.textMute }]}>No hay constructoras registradas aún.</Text>
              <TouchableOpacity style={styles.btnAdd} onPress={abrirNuevoContacto}>
                <Text style={styles.btnAddText}>+ Agregar primera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.btnNuevoContacto} onPress={abrirNuevoContacto}>
                <Text style={styles.btnNuevoContactoTxt}>+ Nueva constructora</Text>
              </TouchableOpacity>
              {contactos.map(item => (
                <View key={item.id} style={[styles.contactoCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[styles.contactoIcon, { backgroundColor: c.bg }]}>
                    <Text style={{ fontSize: 22 }}>🏗️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modeloTitulo, { color: c.text }]}>{item.nombre}</Text>
                    {item.telefono_contacto ? (
                      <Text style={[styles.modeloCodigo, { color: c.textMute }]}>📞 {item.telefono_contacto}</Text>
                    ) : (
                      <Text style={styles.contactoFalta}>⚠ Falta teléfono de contacto</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={{ padding: 8 }} onPress={() => abrirEditarContacto(item)}>
                      <Text style={{ fontSize: 18 }}>✏</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ padding: 8 }} onPress={() => eliminarContacto(item)}>
                      <Text style={{ fontSize: 18 }}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* Modal agregar/editar contacto */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitulo, { color: c.text }]}>{editando ? 'Editar constructora' : 'Nueva constructora'}</Text>

            <Text style={[styles.fieldLabel, { color: c.textSub }]}>Nombre *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.nombre}
              onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej. Spacio Vitale"
              placeholderTextColor={c.placeholder}
              autoCapitalize="words"
            />

            <Text style={[styles.fieldLabel, { color: c.textSub }]}>Teléfono de contacto (WhatsApp)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={form.telefono_contacto ?? ''}
              onChangeText={v => setForm(f => ({ ...f, telefono_contacto: v }))}
              placeholder="Ej. 7821234567"
              placeholderTextColor={c.placeholder}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[styles.btnGuardar, guardando && { opacity: 0.5 }]}
              onPress={guardarContacto}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.btnGuardarText}>💾 Guardar</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setModal(false)}>
              <Text style={[styles.btnCancelarText, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingRight: 12 },
  backTxt: { color: '#1a6470', fontSize: 15, fontWeight: '600' },
  toggleBtn: { backgroundColor: '#eef2f2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  toggleBtnActivo: { backgroundColor: '#1a6470' },
  toggleBtnTxt: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  toggleBtnTxtActivo: { color: '#fff' },

  intro: { marginBottom: 12 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20, gap: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  btnAdd: { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  btnAddText: { color: '#000', fontWeight: '700' },

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

  btnNuevoContacto: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 4 },
  btnNuevoContactoTxt: { color: '#000', fontWeight: '700', fontSize: 13 },
  contactoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  contactoIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  contactoFalta: { fontSize: 12, marginTop: 4, color: '#c0392b', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 4 },
  modalTitulo: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderRadius: 8, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 10 },
  btnGuardar: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 15 },
  btnCancelar: { paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { fontSize: 14 },
})
