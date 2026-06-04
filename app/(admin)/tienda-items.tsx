import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Switch, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

type StoreItem = {
  id: string
  nombre: string
  descripcion: string | null
  costo_coins: number
  tipo: string
  disponible: boolean
  stock: number | null
  icono: string
  orden: number
}

const TIPOS = [
  { value: 'lead_premium',       label: 'Lead Premium' },
  { value: 'lead_meta',          label: 'Lead Meta' },
  { value: 'boost',              label: 'Boost' },
  { value: 'plantilla',          label: 'Plantilla' },
  { value: 'acceso_prioritario', label: 'Acceso prioritario' },
  { value: 'sorteo',             label: 'Sorteo' },
  { value: 'comision_extra',     label: 'Comisión extra' },
  { value: 'curso_premium',      label: 'Curso premium' },
  { value: 'merch',              label: 'Merch' },
  { value: 'campana',            label: 'Campaña personalizada' },
  { value: 'libro',              label: 'Libro' },
  { value: 'otro',               label: 'Otro' },
]

const ITEM_VACIO: Omit<StoreItem, 'id'> = {
  nombre: '', descripcion: '', costo_coins: 100, tipo: 'otro',
  disponible: true, stock: null, icono: '🎁', orden: 99,
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Tienda', msg)
}

function confirmar(msg: string, onOk: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(msg)) onOk() }
  else Alert.alert('Confirmar', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: onOk },
  ])
}

type PremioConfig = {
  id: string; nombre: string; icono: string; tipo: string
  prob_cofre: number; prob_milestone: number
}
type RuletaCfg = { costo: number; premios: PremioConfig[] }

export default function TiendaItems() {
  const [items, setItems]         = useState<StoreItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editando, setEditando]   = useState<StoreItem | null>(null)
  const [form, setForm]           = useState<Omit<StoreItem, 'id'>>(ITEM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  // Configuración de ruleta
  const [ruletaCfg, setRuletaCfg]       = useState<RuletaCfg | null>(null)
  const [ruletaModal, setRuletaModal]   = useState(false)
  const [guardandoRuleta, setGuardandoRuleta] = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const [itemsRes, cfgRes] = await Promise.all([
      supabase.from('store_items').select('*').order('orden'),
      supabase.from('app_config').select('value').eq('key', 'ruleta_config').maybeSingle(),
    ])
    setItems((itemsRes.data ?? []) as StoreItem[])
    if (cfgRes.data?.value) {
      try { setRuletaCfg(JSON.parse(cfgRes.data.value)) } catch {}
    }
    setLoading(false)
  }

  async function guardarRuleta() {
    if (!ruletaCfg) return
    // Validar que las probs sumen ~100 para cada tipo
    const sumCofre     = ruletaCfg.premios.reduce((a, p) => a + p.prob_cofre, 0)
    const sumMilestone = ruletaCfg.premios.reduce((a, p) => a + p.prob_milestone, 0)
    if (Math.abs(sumCofre - 100) > 1 || Math.abs(sumMilestone - 100) > 1) {
      alerta(`Las probabilidades deben sumar 100%.\nCofre: ${sumCofre.toFixed(1)}%\nMilestone: ${sumMilestone.toFixed(1)}%`)
      return
    }
    setGuardandoRuleta(true)
    const { error } = await supabase.from('app_config')
      .upsert({ key: 'ruleta_config', value: JSON.stringify(ruletaCfg) }, { onConflict: 'key' })
    setGuardandoRuleta(false)
    if (error) { alerta('Error: ' + error.message); return }
    setRuletaModal(false)
    alerta('✅ Configuración de ruleta guardada')
  }

  function abrirNuevo() {
    setEditando(null)
    setForm(ITEM_VACIO)
    setModal(true)
  }

  function abrirEditar(item: StoreItem) {
    setEditando(item)
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion ?? '',
      costo_coins: item.costo_coins,
      tipo: item.tipo,
      disponible: item.disponible,
      stock: item.stock,
      icono: item.icono,
      orden: item.orden,
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { alerta('El nombre es obligatorio.'); return }
    if (form.costo_coins < 1) { alerta('El costo debe ser al menos 1 coin.'); return }
    setGuardando(true)

    const payload = {
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion?.trim() || null,
      costo_coins: form.costo_coins,
      tipo:        form.tipo,
      disponible:  form.disponible,
      stock:       form.stock,
      icono:       form.icono.trim() || '🎁',
      orden:       form.orden,
    }

    const { error } = editando
      ? await supabase.from('store_items').update(payload).eq('id', editando.id)
      : await supabase.from('store_items').insert(payload)

    setGuardando(false)
    if (error) { alerta('Error: ' + error.message); return }
    setModal(false)
    cargar()
  }

  async function toggleDisponible(item: StoreItem) {
    const { error } = await supabase
      .from('store_items').update({ disponible: !item.disponible }).eq('id', item.id)
    if (!error) setItems(prev => prev.map(x => x.id === item.id ? { ...x, disponible: !x.disponible } : x))
  }

  async function aplicarConfigBase() {
    confirmar(
      '¿Aplicar configuración estándar de la tienda?\n\n• Ocultar: Boost, Sorteo, Merch\n• Actualizar: Comisión extra → 5%\n• Agregar: Campaña 7 días y Libro',
      async () => {
        setAplicando(true)
        try {
          // 1. Ocultar ítems que ya no se ofrecen
          await supabase.from('store_items')
            .update({ disponible: false })
            .in('tipo', ['boost', 'sorteo', 'merch'])

          // 2. Actualizar comisión extra
          await supabase.from('store_items')
            .update({
              descripcion: 'Bono de comisión adicional del 5% sobre tu comisión en los próximos 14 días',
              icono: '💸',
            })
            .eq('tipo', 'comision_extra')

          // 3. Agregar campaña si no existe
          const existeCampana = items.some(i => i.tipo === 'campana')
          if (!existeCampana) {
            await supabase.from('store_items').insert({
              nombre: 'Campaña personalizada 7 días',
              descripcion: 'Activa una campaña de marketing personalizada con tus clientes pagados durante 7 días',
              costo_coins: 5000, tipo: 'campana', icono: '📣', orden: 8, disponible: true,
            })
          }

          // 4. Agregar libro si no existe
          const existeLibro = items.some(i => i.tipo === 'libro')
          if (!existeLibro) {
            await supabase.from('store_items').insert({
              nombre: 'Libro a tu elección',
              descripcion: 'Elige un libro de ventas, desarrollo personal o bienes raíces — nosotros te lo conseguimos',
              costo_coins: 5000, tipo: 'libro', icono: '📖', orden: 9, disponible: true,
            })
          }

          await cargar()
          alerta('¡Configuración aplicada correctamente!')
        } catch (e: any) {
          alerta('Error: ' + e.message)
        } finally {
          setAplicando(false)
        }
      }
    )
  }

  async function eliminar(item: StoreItem) {
    confirmar(`¿Eliminar "${item.nombre}"? Esta acción no se puede deshacer.`, async () => {
      const { error } = await supabase.from('store_items').delete().eq('id', item.id)
      if (error) alerta('Error: ' + error.message)
      else setItems(prev => prev.filter(x => x.id !== item.id))
    })
  }

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f5' }}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Artículos de la Tienda</Text>
          <Text style={s.headerSub}>{items.length} artículos · {items.filter(i => i.disponible).length} disponibles</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[s.btnBase, aplicando && { opacity: 0.6 }]}
            onPress={aplicarConfigBase}
            disabled={aplicando}
          >
            {aplicando
              ? <ActivityIndicator color="#1a6470" size="small" />
              : <Text style={s.btnBaseTxt}>⚙️ Config</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.btnRuleta} onPress={() => ruletaCfg && setRuletaModal(true)}>
            <Text style={s.btnRuletaTxt}>🎰 Ruleta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnNuevo} onPress={abrirNuevo}>
            <Text style={s.btnNuevoTxt}>＋ Nuevo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {items.map(item => (
          <View key={item.id} style={[s.card, !item.disponible && s.cardInactiva]}>
            <View style={s.cardTop}>
              <Text style={s.icono}>{item.icono}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.nombre, !item.disponible && { color: '#aaa' }]}>{item.nombre}</Text>
                {item.descripcion ? <Text style={s.desc} numberOfLines={2}>{item.descripcion}</Text> : null}
                <Text style={s.tipo}>{TIPOS.find(t => t.value === item.tipo)?.label ?? item.tipo}</Text>
              </View>
              <View style={s.costoBox}>
                <Text style={s.costoVal}>{item.costo_coins.toLocaleString()}</Text>
                <Text style={s.costoLbl}>💰 coins</Text>
              </View>
            </View>

            <View style={s.cardFooter}>
              <View style={s.switchRow}>
                <Text style={s.switchLbl}>{item.disponible ? 'Disponible' : 'Oculto'}</Text>
                <Switch
                  value={item.disponible}
                  onValueChange={() => toggleDisponible(item)}
                  trackColor={{ true: '#1a6470', false: '#ccc' }}
                  thumbColor="#fff"
                />
              </View>
              {item.stock != null && (
                <Text style={s.stockTxt}>Stock: {item.stock}</Text>
              )}
              <View style={s.acciones}>
                <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditar(item)}>
                  <Text style={s.btnEditarTxt}>✏️ Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnEliminar} onPress={() => eliminar(item)}>
                  <Text style={s.btnEliminarTxt}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Modal configuración ruleta */}
      <Modal visible={ruletaModal} animationType="slide" transparent onRequestClose={() => setRuletaModal(false)}>
        <View style={s.overlay}>
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>🎰 Configuración de Ruleta</Text>

            <Text style={s.lbl}>Costo del Cofre (coins)</Text>
            <TextInput
              style={s.inputNum}
              value={String(ruletaCfg?.costo ?? 100)}
              onChangeText={v => setRuletaCfg(c => c ? { ...c, costo: parseInt(v) || 0 } : c)}
              keyboardType="numeric"
            />

            <Text style={[s.lbl, { marginTop: 16 }]}>Premios y probabilidades</Text>
            <Text style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
              Prob. Cofre y Milestone deben sumar 100% cada una.
            </Text>

            {ruletaCfg?.premios.map((p, i) => (
              <View key={p.id} style={s.ruletaRow}>
                {/* Cabecera fila con botón eliminar */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[s.lbl, { marginTop: 0, marginBottom: 0 }]}>Premio {i + 1}</Text>
                  <TouchableOpacity
                    onPress={() => confirmar(`¿Eliminar el premio "${p.nombre}"?`, () =>
                      setRuletaCfg(c => c ? { ...c, premios: c.premios.filter((_, idx) => idx !== i) } : c)
                    )}
                    style={s.btnEliminarPremio}
                  >
                    <Text style={s.btnEliminarPremioTxt}>🗑️ Eliminar</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {items.map(item => {
                      const sel = p.tipo === item.tipo && p.nombre === item.nombre
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[s.itemChip, sel && s.itemChipSel]}
                          onPress={() => setRuletaCfg(c => {
                            if (!c) return c
                            const premios = [...c.premios]
                            premios[i] = { ...premios[i], nombre: item.nombre, icono: item.icono, tipo: item.tipo }
                            return { ...c, premios }
                          })}
                        >
                          <Text style={s.itemChipIcn}>{item.icono}</Text>
                          <Text style={[s.itemChipTxt, sel && { color: '#fff' }]} numberOfLines={1}>{item.nombre}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </ScrollView>
                <View style={s.ruletaRowLeft}>
                  <Text style={[s.ruletaSeleccionado]}>{p.icono} {p.nombre}</Text>
                </View>
                <View style={s.ruletaRowProbs}>
                  <View style={s.ruletaProb}>
                    <Text style={s.ruletaProbLbl}>Cofre %</Text>
                    <TextInput
                      style={s.inputNum}
                      value={String(p.prob_cofre)}
                      onChangeText={v => setRuletaCfg(c => {
                        if (!c) return c
                        const premios = [...c.premios]
                        premios[i] = { ...premios[i], prob_cofre: parseFloat(v) || 0 }
                        return { ...c, premios }
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={s.ruletaProb}>
                    <Text style={s.ruletaProbLbl}>Nivel %</Text>
                    <TextInput
                      style={s.inputNum}
                      value={String(p.prob_milestone)}
                      onChangeText={v => setRuletaCfg(c => {
                        if (!c) return c
                        const premios = [...c.premios]
                        premios[i] = { ...premios[i], prob_milestone: parseFloat(v) || 0 }
                        return { ...c, premios }
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            ))}

            {ruletaCfg && (
              <TouchableOpacity
                style={s.btnAgregarPremio}
                onPress={() => setRuletaCfg(c => c ? {
                  ...c,
                  premios: [...c.premios, {
                    id: `nuevo_${Date.now()}`,
                    nombre: items[0]?.nombre ?? 'Nuevo premio',
                    icono: items[0]?.icono ?? '🎁',
                    tipo: items[0]?.tipo ?? 'otro',
                    prob_cofre: 0,
                    prob_milestone: 0,
                  }],
                } : c)}
              >
                <Text style={s.btnAgregarPremioTxt}>＋ Agregar premio</Text>
              </TouchableOpacity>
            )}

            {ruletaCfg && (
              <View style={s.ruletaSumas}>
                <Text style={s.ruletaSumasTxt}>
                  Suma Cofre: {ruletaCfg.premios.reduce((a, p) => a + p.prob_cofre, 0).toFixed(1)}%
                  {'   '}
                  Suma Nivel: {ruletaCfg.premios.reduce((a, p) => a + p.prob_milestone, 0).toFixed(1)}%
                </Text>
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancelar} onPress={() => setRuletaModal(false)}>
                <Text style={s.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnGuardar, guardandoRuleta && { opacity: 0.6 }]} onPress={guardarRuleta} disabled={guardandoRuleta}>
                {guardandoRuleta
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnGuardarTxt}>Guardar ruleta</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal edición / nuevo */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.overlay}>
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>{editando ? 'Editar artículo' : 'Nuevo artículo'}</Text>

            <Text style={s.lbl}>Icono (emoji)</Text>
            <TextInput style={s.input} value={form.icono} onChangeText={v => setForm(f => ({ ...f, icono: v }))} maxLength={4} />

            <Text style={s.lbl}>Nombre *</Text>
            <TextInput style={s.input} value={form.nombre} onChangeText={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Nombre del artículo" autoCapitalize="sentences" />

            <Text style={s.lbl}>Descripción</Text>
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top' }]}
              value={form.descripcion ?? ''}
              onChangeText={v => setForm(f => ({ ...f, descripcion: v }))}
              placeholder="¿Qué incluye este artículo?"
              multiline numberOfLines={3}
            />

            <Text style={s.lbl}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {TIPOS.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.chip, form.tipo === t.value && s.chipActivo]}
                    onPress={() => setForm(f => ({ ...f, tipo: t.value }))}
                  >
                    <Text style={[s.chipTxt, form.tipo === t.value && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.numRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.lbl}>Costo (coins) *</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.costo_coins)}
                  onChangeText={v => setForm(f => ({ ...f, costo_coins: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.lbl}>Stock (vacío = ilimitado)</Text>
                <TextInput
                  style={s.inputNum}
                  value={form.stock != null ? String(form.stock) : ''}
                  onChangeText={v => setForm(f => ({ ...f, stock: v === '' ? null : parseInt(v) || null }))}
                  keyboardType="numeric"
                  placeholder="∞"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.lbl}>Orden</Text>
                <TextInput
                  style={s.inputNum}
                  value={String(form.orden)}
                  onChangeText={v => setForm(f => ({ ...f, orden: parseInt(v) || 0 }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={s.switchRowModal}>
              <Text style={s.lbl}>Disponible en la tienda</Text>
              <Switch
                value={form.disponible}
                onValueChange={v => setForm(f => ({ ...f, disponible: v }))}
                trackColor={{ true: '#1a6470', false: '#ccc' }}
                thumbColor="#fff"
              />
            </View>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}>
                <Text style={s.btnCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
                {guardando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnGuardarTxt}>{editando ? 'Guardar cambios' : 'Crear artículo'}</Text>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  btnBase:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', minWidth: 72, alignItems: 'center' },
  btnBaseTxt:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnRuleta:   { backgroundColor: 'rgba(201,168,76,0.25)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#c9a84c', alignItems: 'center' },
  btnRuletaTxt:{ color: '#c9a84c', fontWeight: '700', fontSize: 13 },
  btnNuevo:    { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnNuevoTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  ruletaRow: { marginBottom: 12, backgroundColor: '#f5f8f9', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#dde8e9' },
  btnEliminarPremio: { backgroundColor: '#fef0f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#fca5a5' },
  btnEliminarPremioTxt: { fontSize: 12, color: '#dc2626', fontWeight: '700' },
  btnAgregarPremio: { borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 10, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  btnAgregarPremioTxt: { fontSize: 14, color: '#1a6470', fontWeight: '700' },
  ruletaRowLeft: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  ruletaSeleccionado: { fontSize: 13, fontWeight: '700', color: '#1a6470', marginBottom: 4 },
  itemChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff' },
  itemChipSel: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  itemChipIcn: { fontSize: 14 },
  itemChipTxt: { fontSize: 12, color: '#555', maxWidth: 90 },
  ruletaRowProbs: { flexDirection: 'row', gap: 8 },
  ruletaProb: { flex: 1, alignItems: 'center' },
  ruletaProbLbl: { fontSize: 10, color: '#888', fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  ruletaSumas: { backgroundColor: '#e8f5e9', borderRadius: 8, padding: 10, marginTop: 8 },
  ruletaSumasTxt: { fontSize: 13, fontWeight: '700', color: '#2e7d32', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e0eaec', padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardInactiva: { opacity: 0.55, borderColor: '#ddd' },

  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  icono:    { fontSize: 30 },
  nombre:   { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  desc:     { fontSize: 12, color: '#888', lineHeight: 16, marginBottom: 3 },
  tipo:     { fontSize: 11, color: '#1a6470', fontWeight: '600' },

  costoBox: { alignItems: 'center', backgroundColor: '#fff8e1', borderRadius: 10, padding: 8, minWidth: 64 },
  costoVal: { fontSize: 16, fontWeight: '900', color: '#c9a84c' },
  costoLbl: { fontSize: 10, color: '#999', marginTop: 1 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  switchRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  switchLbl:  { fontSize: 13, color: '#555', fontWeight: '600' },
  stockTxt:   { fontSize: 12, color: '#888' },
  acciones:   { flexDirection: 'row', gap: 8 },
  btnEditar:  { backgroundColor: '#e8f4f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnEditarTxt:  { fontSize: 13, color: '#1a6470', fontWeight: '600' },
  btnEliminar:   { backgroundColor: '#fef0f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  btnEliminarTxt:{ fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 16 },

  lbl: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 5, marginTop: 12, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e',
  },
  numRow:   { flexDirection: 'row', gap: 10 },
  inputNum: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#1a1a2e', textAlign: 'center',
  },

  chip:      { borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipActivo:{ backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt:   { fontSize: 13, color: '#555' },

  switchRowModal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },

  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancelar:  { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnCancelarTxt:{ color: '#555', fontWeight: '600', fontSize: 15 },
  btnGuardar:   { flex: 2, backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGuardarTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
})
