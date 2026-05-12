import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Switch, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Mision = {
  id: string
  tipo: 'diaria' | 'base'
  categoria: string
  titulo: string
  descripcion: string | null
  meta: number
  recompensa_xp: number
  recompensa_coins: number
  orden: number
  activa: boolean
  icono: string
}

const CATEGORIAS = ['propiedad', 'crm', 'curso', 'streak', 'seguimiento', 'interaccion']
const CAT_LABEL: Record<string, string> = {
  propiedad: '🏠 Propiedad', crm: '👤 CRM', curso: '📚 Curso',
  streak: '🔥 Racha', seguimiento: '✅ Seguimiento', interaccion: '💬 Interacción',
}

const TIPO_COLOR: Record<string, string> = { diaria: '#0277bd', base: '#6a1b9a' }

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Misiones', msg)
}

function confirmar(msg: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(msg)) onOk()
  } else {
    Alert.alert('Confirmar', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onOk },
    ])
  }
}

const MISION_VACIA: Omit<Mision, 'id'> = {
  tipo: 'diaria',
  categoria: 'propiedad',
  titulo: '',
  descripcion: '',
  meta: 1,
  recompensa_xp: 20,
  recompensa_coins: 5,
  orden: 99,
  activa: true,
  icono: '🎯',
}

export default function AdminMisiones() {
  const [misiones, setMisiones] = useState<Mision[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'diaria' | 'base'>('todas')

  const [modalVisible, setModalVisible] = useState(false)
  const [editando, setEditando] = useState<Mision | null>(null)
  const [form, setForm] = useState<Omit<Mision, 'id'>>(MISION_VACIA)
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('misiones')
      .select('*')
      .order('tipo')
      .order('orden')
    setMisiones((data ?? []) as Mision[])
    setLoading(false)
  }

  function abrirNueva() {
    setEditando(null)
    setForm(MISION_VACIA)
    setModalVisible(true)
  }

  function abrirEditar(m: Mision) {
    setEditando(m)
    setForm({
      tipo: m.tipo,
      categoria: m.categoria,
      titulo: m.titulo,
      descripcion: m.descripcion ?? '',
      meta: m.meta,
      recompensa_xp: m.recompensa_xp,
      recompensa_coins: m.recompensa_coins,
      orden: m.orden,
      activa: m.activa,
      icono: m.icono,
    })
    setModalVisible(true)
  }

  async function guardar() {
    if (!form.titulo.trim()) { alerta('El título es obligatorio.'); return }
    if (form.meta < 1) { alerta('La meta debe ser al menos 1.'); return }
    setGuardando(true)

    const payload = {
      tipo: form.tipo,
      categoria: form.categoria,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion?.trim() || null,
      meta: form.meta,
      recompensa_xp: form.recompensa_xp,
      recompensa_coins: form.recompensa_coins,
      orden: form.orden,
      activa: form.activa,
      icono: form.icono.trim() || '🎯',
    }

    let error: any = null
    if (editando) {
      const res = await supabase.from('misiones').update(payload).eq('id', editando.id)
      error = res.error
    } else {
      const res = await supabase.from('misiones').insert(payload)
      error = res.error
    }

    setGuardando(false)
    if (error) { alerta('Error: ' + error.message); return }
    setModalVisible(false)
    cargar()
  }

  async function toggleActiva(m: Mision) {
    const { error } = await supabase
      .from('misiones')
      .update({ activa: !m.activa })
      .eq('id', m.id)
    if (!error) {
      setMisiones(prev => prev.map(x => x.id === m.id ? { ...x, activa: !x.activa } : x))
    }
  }

  async function eliminar(m: Mision) {
    confirmar(`¿Eliminar la misión "${m.titulo}"? Esta acción no se puede deshacer.`, async () => {
      const { error } = await supabase.from('misiones').delete().eq('id', m.id)
      if (error) alerta('Error: ' + error.message)
      else setMisiones(prev => prev.filter(x => x.id !== m.id))
    })
  }

  const lista = misiones.filter(m =>
    filtroTipo === 'todas' ? true : m.tipo === filtroTipo
  )

  const diarias = lista.filter(m => m.tipo === 'diaria')
  const bases   = lista.filter(m => m.tipo === 'base')

  const grupos: [string, Mision[]][] = filtroTipo === 'diaria'
    ? [['Misiones Diarias', diarias]]
    : filtroTipo === 'base'
      ? [['Misiones Base (progresivas)', bases]]
      : [['Misiones Diarias', diarias], ['Misiones Base (progresivas)', bases]]

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f5' }}>
      {/* Header */}
      <View style={s.pageHeader}>
        <View>
          <Text style={s.pageTitle}>Gestión de Misiones</Text>
          <Text style={s.pageSubtitle}>{misiones.length} misiones · {misiones.filter(m => m.activa).length} activas</Text>
        </View>
        <TouchableOpacity style={s.btnNueva} onPress={abrirNueva}>
          <Text style={s.btnNuevaText}>＋ Nueva</Text>
        </TouchableOpacity>
      </View>

      {/* Filtro tipo */}
      <View style={s.filtroRow}>
        {(['todas', 'diaria', 'base'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.filtroBtn, filtroTipo === t && s.filtroBtnActivo]}
            onPress={() => setFiltroTipo(t)}
          >
            <Text style={[s.filtroTxt, filtroTipo === t && s.filtroTxtActivo]}>
              {t === 'todas' ? 'Todas' : t === 'diaria' ? '⏰ Diarias' : '⭐ Base'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40, padding: 12 }}>
        {grupos.map(([titulo, items]) => items.length === 0 ? null : (
          <View key={titulo}>
            <Text style={s.grupoTitle}>{titulo} ({items.length})</Text>
            {items.map(m => (
              <View key={m.id} style={[s.card, !m.activa && s.cardInactiva]}>
                <View style={s.cardTop}>
                  <Text style={s.cardIcono}>{m.icono}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={s.badgeRow}>
                      <View style={[s.tipoBadge, { backgroundColor: TIPO_COLOR[m.tipo] }]}>
                        <Text style={s.tipoBadgeTxt}>{m.tipo}</Text>
                      </View>
                      <View style={s.catBadge}>
                        <Text style={s.catBadgeTxt}>{CAT_LABEL[m.categoria] ?? m.categoria}</Text>
                      </View>
                    </View>
                    <Text style={[s.cardTitulo, !m.activa && { color: '#aaa' }]}>{m.titulo}</Text>
                    {m.descripcion ? <Text style={s.cardDesc} numberOfLines={2}>{m.descripcion}</Text> : null}
                  </View>
                </View>

                <View style={s.cardStats}>
                  <Text style={s.statItem}>Meta: <Text style={s.statVal}>{m.meta}</Text></Text>
                  <Text style={s.statItem}>XP: <Text style={[s.statVal, { color: '#1a6b3a' }]}>+{m.recompensa_xp}</Text></Text>
                  <Text style={s.statItem}>Coins: <Text style={[s.statVal, { color: '#c9a84c' }]}>+{m.recompensa_coins} 💰</Text></Text>
                  <Text style={s.statItem}>Orden: <Text style={s.statVal}>{m.orden}</Text></Text>
                </View>

                <View style={s.cardFooter}>
                  <View style={s.switchRow}>
                    <Text style={s.switchLabel}>{m.activa ? 'Activa' : 'Inactiva'}</Text>
                    <Switch
                      value={m.activa}
                      onValueChange={() => toggleActiva(m)}
                      trackColor={{ true: '#1a6470', false: '#ccc' }}
                      thumbColor="#fff"
                    />
                  </View>
                  <View style={s.acciones}>
                    <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditar(m)}>
                      <Text style={s.btnEditarTxt}>✏️ Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnEliminar} onPress={() => eliminar(m)}>
                      <Text style={s.btnEliminarTxt}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Modal de edición / nueva misión */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.modalSheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>{editando ? 'Editar misión' : 'Nueva misión'}</Text>

            {/* Tipo */}
            <Text style={s.fieldLabel}>Tipo</Text>
            <View style={s.chipRow}>
              {(['diaria', 'base'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.chip, form.tipo === t && { backgroundColor: TIPO_COLOR[t], borderColor: TIPO_COLOR[t] }]}
                  onPress={() => setForm(f => ({ ...f, tipo: t }))}
                >
                  <Text style={[s.chipTxt, form.tipo === t && { color: '#fff' }]}>
                    {t === 'diaria' ? '⏰ Diaria' : '⭐ Base'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Categoría */}
            <Text style={s.fieldLabel}>Categoría</Text>
            <View style={s.chipRow}>
              {CATEGORIAS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.chip, form.categoria === c && s.chipActivo]}
                  onPress={() => setForm(f => ({ ...f, categoria: c }))}
                >
                  <Text style={[s.chipTxt, form.categoria === c && { color: '#fff' }]}>
                    {CAT_LABEL[c]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Icono */}
            <Text style={s.fieldLabel}>Icono (emoji)</Text>
            <TextInput
              style={s.input}
              value={form.icono}
              onChangeText={v => setForm(f => ({ ...f, icono: v }))}
              placeholder="🎯"
              maxLength={4}
            />

            {/* Título */}
            <Text style={s.fieldLabel}>Título *</Text>
            <TextInput
              style={s.input}
              value={form.titulo}
              onChangeText={v => setForm(f => ({ ...f, titulo: v }))}
              placeholder="Nombre de la misión"
              autoCapitalize="sentences"
            />

            {/* Descripción */}
            <Text style={s.fieldLabel}>Descripción</Text>
            <TextInput
              style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              value={form.descripcion ?? ''}
              onChangeText={v => setForm(f => ({ ...f, descripcion: v }))}
              placeholder="Detalle de lo que debe hacer el usuario"
              multiline
              numberOfLines={3}
            />

            {/* Meta, XP, Coins, Orden */}
            <View style={s.numRow}>
              <View style={s.numField}>
                <Text style={s.fieldLabel}>Meta</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.meta)}
                  onChangeText={v => setForm(f => ({ ...f, meta: parseInt(v) || 1 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={s.numField}>
                <Text style={s.fieldLabel}>XP</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.recompensa_xp)}
                  onChangeText={v => setForm(f => ({ ...f, recompensa_xp: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={s.numField}>
                <Text style={s.fieldLabel}>Coins 💰</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.recompensa_coins)}
                  onChangeText={v => setForm(f => ({ ...f, recompensa_coins: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={s.numField}>
                <Text style={s.fieldLabel}>Orden</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.orden)}
                  onChangeText={v => setForm(f => ({ ...f, orden: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Activa */}
            <View style={s.switchRowModal}>
              <Text style={s.fieldLabel}>Misión activa</Text>
              <Switch
                value={form.activa}
                onValueChange={v => setForm(f => ({ ...f, activa: v }))}
                trackColor={{ true: '#1a6470', false: '#ccc' }}
                thumbColor="#fff"
              />
            </View>

            {/* Botones */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancelar} onPress={() => setModalVisible(false)}>
                <Text style={s.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnGuardarTxt}>{editando ? 'Guardar cambios' : 'Crear misión'}</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14,
  },
  pageTitle:    { fontSize: 18, fontWeight: '800', color: '#fff' },
  pageSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  btnNueva: { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnNuevaText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  filtroRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8eef0' },
  filtroBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  filtroBtnActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  filtroTxt: { fontSize: 13, fontWeight: '600', color: '#666' },
  filtroTxtActivo: { color: '#fff' },

  grupoTitle: { fontSize: 13, fontWeight: '800', color: '#1a6470', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e0eaec',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    padding: 14,
  },
  cardInactiva: { opacity: 0.6, borderColor: '#ddd' },

  cardTop: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  cardIcono: { fontSize: 28, width: 36, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tipoBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tipoBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  catBadge: { backgroundColor: '#f0f4f5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeTxt: { fontSize: 11, color: '#555' },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  cardDesc: { fontSize: 12, color: '#888', lineHeight: 16 },

  cardStats: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  statItem: { fontSize: 12, color: '#666' },
  statVal: { fontWeight: '700', color: '#1a1a2e' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  acciones: { flexDirection: 'row', gap: 8 },
  btnEditar: { backgroundColor: '#e8f4f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnEditarTxt: { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  btnEliminar: { backgroundColor: '#fef0f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  btnEliminarTxt: { fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1a1a2e',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 13, color: '#555' },

  numRow: { flexDirection: 'row', gap: 10 },
  numField: { flex: 1 },
  inputNum: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 15, color: '#1a1a2e', textAlign: 'center',
  },

  switchRowModal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },

  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancelar: { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnCancelarTxt: { color: '#555', fontWeight: '600', fontSize: 15 },
  btnGuardar: { flex: 2, backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGuardarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
