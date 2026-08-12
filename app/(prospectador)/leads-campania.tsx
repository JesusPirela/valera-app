import React, { useState, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  Linking, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { registrarContacto } from '../../lib/gamification'
import { abrirWhatsApp } from './crm'

// Marca de "ya vistos" para el popup que molesta: al abrir esta tabla se
// registran todos los ids actuales como vistos, así el popup deja de insistir.
const SEEN_KEY = 'lc_seen_v1'
const META = 5 // meta de contactos (cadencia de 5 toques)

type Lead = {
  id: string
  nombre: string
  telefono: string
  zona_busqueda: string | null
  presupuesto: string | null
  estado: string | null
  notas: string | null
  wa_count: number | null
  call_count: number | null
  created_at: string
}

type SortCol = 'nombre' | 'telefono' | 'zona' | 'presupuesto'
type Sort = { col: SortCol; dir: 'asc' | 'desc' }

// Parseo heurístico del presupuesto en texto libre → número, para ordenar.
function parsePresu(txt: string | null): number {
  if (!txt) return -1
  const limpio = txt.replace(/[,$]/g, ' ').toLowerCase()
  const m = limpio.match(/(\d+(?:\.\d+)?)\s*(m|k)?/)
  if (!m) return -1
  let n = parseFloat(m[1])
  if (m[2] === 'm' || n < 100) n *= 1_000_000
  else if (m[2] === 'k') n *= 1_000
  return n
}

// Las respuestas de la campaña vienen con guiones bajos y prefijos; se limpian
// para mostrarlas legibles ("zona_zona_sur_(milenio,...)" → "Zona sur (milenio,...)").
function prettyZona(z: string | null): string {
  if (!z) return '—'
  return z.split('|').map(part =>
    part.replace(/^zona_/, '').replace(/_/g, ' ').trim()
  ).filter(Boolean).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
}
function prettyPresu(p: string | null): string {
  if (!p) return '—'
  return p.replace(/_/g, ' ').trim()
}

function llamar(tel: string) { Linking.openURL(`tel:${tel}`) }

export default function LeadsCampania() {
  const c = useColors()
  const qc = useQueryClient()
  const [sort, setSort] = useState<Sort>({ col: 'nombre', dir: 'asc' })
  const [notaModal, setNotaModal] = useState<{ id: string; nombre: string; value: string } | null>(null)
  const [guardandoNota, setGuardandoNota] = useState(false)

  const { data: leads = [], isLoading, refetch } = useQuery<Lead[]>({
    queryKey: ['leads-campania'],
    queryFn: async () => {
      const { data: { user } } = await getUsuarioActual()
      if (!user) return []
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, zona_busqueda, presupuesto, estado, notas, wa_count, call_count, created_at')
        .eq('es_lead_campania', true)
        .eq('responsable_id', user.id)
        .is('eliminado_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 1000 * 60 * 2,
  })

  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } catch {} finally { setRefreshing(false) }
  }, [refetch])

  // Al entrar, marca todos los leads actuales como "vistos" para el popup.
  useFocusEffect(useCallback(() => {
    if (!leads.length) return
    AsyncStorage.getItem(SEEN_KEY).then(raw => {
      const seen: string[] = raw ? JSON.parse(raw) : []
      const merged = Array.from(new Set([...seen, ...leads.map(l => l.id)]))
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(merged)).catch(() => {})
    }).catch(() => {})
  }, [leads]))

  const ordenados = useMemo(() => {
    const arr = [...leads]
    arr.sort((a, b) => {
      let cmp = 0
      if (sort.col === 'nombre') cmp = a.nombre.localeCompare(b.nombre, 'es')
      else if (sort.col === 'telefono') cmp = (a.telefono || '').localeCompare(b.telefono || '')
      else if (sort.col === 'zona') cmp = prettyZona(a.zona_busqueda).localeCompare(prettyZona(b.zona_busqueda), 'es')
      else if (sort.col === 'presupuesto') cmp = parsePresu(a.presupuesto) - parsePresu(b.presupuesto)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [leads, sort])

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' })
  }

  // Actualiza un campo del lead en el caché (optimista) y en la BD.
  function patchLead(id: string, patch: Partial<Lead>) {
    qc.setQueryData<Lead[]>(['leads-campania'], old =>
      (old ?? []).map(l => l.id === id ? { ...l, ...patch } : l))
    supabase.from('clientes').update(patch).eq('id', id).then(undefined, () => {})
  }

  function contactarWhatsApp(l: Lead) {
    patchLead(l.id, { wa_count: (l.wa_count ?? 0) + 1 })
    abrirWhatsApp(l.telefono, l.nombre)
    getUsuarioActual().then(({ data: { user } }) => {
      if (user) registrarContacto(user.id, l.id, 'whatsapp').catch(() => {})
    })
  }
  function contactarLlamada(l: Lead) {
    patchLead(l.id, { call_count: (l.call_count ?? 0) + 1 })
    llamar(l.telefono)
    getUsuarioActual().then(({ data: { user } }) => {
      if (user) registrarContacto(user.id, l.id, 'llamada').catch(() => {})
    })
  }

  async function guardarNota() {
    if (!notaModal) return
    setGuardandoNota(true)
    const { id, value } = notaModal
    patchLead(id, { notas: value })
    setGuardandoNota(false)
    setNotaModal(null)
  }

  const HeaderCell = ({ col, label, w }: { col: SortCol; label: string; w: number }) => (
    <TouchableOpacity style={[styles.th, { width: w }]} onPress={() => toggleSort(col)} activeOpacity={0.7}>
      <Text style={[styles.thTxt, { color: '#fff' }]} numberOfLines={1}>{label}</Text>
      {sort.col === col && (
        <Ionicons name={sort.dir === 'asc' ? 'caret-up' : 'caret-down'} size={11} color="#fff" style={{ marginLeft: 2 }} />
      )}
    </TouchableOpacity>
  )

  // Botón de acción con contador n/5.
  const AccionBtn = ({ icon, color, count, onPress }: {
    icon: any; color: string; count: number; onPress: () => void
  }) => {
    const done = count >= META
    return (
      <TouchableOpacity style={styles.actBtn} onPress={onPress} activeOpacity={0.7}>
        <Ionicons name={icon} size={24} color={color} />
        <View style={[styles.contador, done && styles.contadorDone]}>
          <Text style={[styles.contadorTxt, done && { color: '#fff' }]}>{count}/{META}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.headerBar}>
        <Text style={[styles.title, { color: c.text }]}>📣 Leads de campaña</Text>
        <View style={styles.subRow}>
          <Text style={[styles.sub, { color: c.textMute }]}>
            {leads.length} {leads.length === 1 ? 'cliente' : 'clientes'} · toca un encabezado para ordenar
          </Text>
          {!(sort.col === 'nombre' && sort.dir === 'asc') && (
            <TouchableOpacity style={styles.limpiarBtn} onPress={() => setSort({ col: 'nombre', dir: 'asc' })} activeOpacity={0.8}>
              <Ionicons name="refresh" size={13} color="#7c3aed" />
              <Text style={styles.limpiarTxt}>Limpiar orden</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 40 }} />
      ) : leads.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 34 }}>📭</Text>
          <Text style={[styles.emptyTxt, { color: c.textMute }]}>Aún no tienes leads de campaña asignados.</Text>
        </View>
      ) : (
        // Scroll VERTICAL por fuera y HORIZONTAL por dentro. Antes estaba al
        // revés (vertical anidado dentro del horizontal), y los gestos se
        // peleaban: la tabla no subía ni bajaba.
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.vScrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hScrollContent}>
            <View style={[styles.tableCard, { borderColor: c.border, backgroundColor: c.card }]}>
              {/* Encabezado — orden: Nombre · Teléfono · Zona · Presupuesto */}
              <View style={styles.headRow}>
                <HeaderCell col="nombre" label="Nombre" w={200} />
                <HeaderCell col="telefono" label="Teléfono" w={150} />
                <HeaderCell col="zona" label="Zona" w={190} />
                <HeaderCell col="presupuesto" label="Presupuesto" w={150} />
                <View style={[styles.th, { width: 92 }]}><Text style={[styles.thTxt, { color: '#fff' }]}>WhatsApp</Text></View>
                <View style={[styles.th, { width: 88 }]}><Text style={[styles.thTxt, { color: '#fff' }]}>Llamar</Text></View>
                <View style={[styles.th, { width: 150 }]}><Text style={[styles.thTxt, { color: '#fff' }]}>Notas</Text></View>
              </View>

              {/* Filas */}
              {ordenados.map((l, i) => (
                <View key={l.id} style={[styles.tr, { backgroundColor: i % 2 === 0 ? c.card : c.bg2, borderColor: c.border }]}>
                  <TouchableOpacity style={[styles.td, { width: 200 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.text, fontWeight: '700' }]} numberOfLines={2}>{l.nombre}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 150 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={1}>{l.telefono}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 190 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={2}>{prettyZona(l.zona_busqueda)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 150 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={2}>{prettyPresu(l.presupuesto)}</Text>
                  </TouchableOpacity>
                  <View style={[styles.td, { width: 92, alignItems: 'center' }]}>
                    <AccionBtn icon="logo-whatsapp" color="#16a34a" count={l.wa_count ?? 0} onPress={() => contactarWhatsApp(l)} />
                  </View>
                  <View style={[styles.td, { width: 88, alignItems: 'center' }]}>
                    <AccionBtn icon="call" color="#2563eb" count={l.call_count ?? 0} onPress={() => contactarLlamada(l)} />
                  </View>
                  <View style={[styles.td, { width: 150 }]}>
                    <TouchableOpacity
                      style={[styles.notaBtn, { borderColor: c.border, backgroundColor: c.bg }]}
                      onPress={() => setNotaModal({ id: l.id, nombre: l.nombre, value: l.notas ?? '' })}
                      activeOpacity={0.7}
                    >
                      {l.notas ? (
                        <Text style={[styles.notaTxt, { color: c.textSub }]} numberOfLines={2}>{l.notas}</Text>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="create-outline" size={15} color="#7c3aed" />
                          <Text style={styles.notaAdd}>Agregar nota</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Modal de notas */}
      <Modal visible={!!notaModal} transparent animationType="fade" onRequestClose={() => setNotaModal(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTit, { color: c.text }]}>Nota — {notaModal?.nombre}</Text>
            <TextInput
              style={[styles.modalInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={notaModal?.value ?? ''}
              onChangeText={t => setNotaModal(m => m ? { ...m, value: t } : m)}
              placeholder="Escribe una nota sobre este lead…"
              placeholderTextColor={c.textMute}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.border, flex: 1 }]} onPress={() => setNotaModal(null)}>
                <Text style={[styles.modalBtnTxt, { color: c.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#7c3aed', flex: 1 }]} onPress={guardarNota} disabled={guardandoNota}>
                {guardandoNota ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnTxt, { color: '#fff' }]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, width: '100%', maxWidth: 1052, alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 10, flexWrap: 'wrap' },
  sub: { fontSize: 12, flex: 1 },
  limpiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3e8ff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  limpiarTxt: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  vScrollContent: { paddingBottom: 40 },
  hScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  tableCard: {
    alignSelf: 'center', marginTop: 4, borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    ...Platform.select({ web: { boxShadow: '0 4px 18px rgba(0,0,0,0.10)' } as any, default: { elevation: 3 } }),
  },
  headRow: { flexDirection: 'row', backgroundColor: '#7c3aed' },
  th: { paddingVertical: 15, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' },
  thTxt: { fontSize: 13.5, fontWeight: '800' },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch', minHeight: 64 },
  td: { paddingVertical: 14, paddingHorizontal: 11, justifyContent: 'center' },
  tdTxt: { fontSize: 15, lineHeight: 20 },
  actBtn: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  contador: { backgroundColor: '#ede9fe', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2, minWidth: 34, alignItems: 'center' },
  contadorDone: { backgroundColor: '#16a34a' },
  contadorTxt: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  notaBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  notaTxt: { fontSize: 13, lineHeight: 17 },
  notaAdd: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 20 },
  modalTit: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 110, textAlignVertical: 'top' },
  modalBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalBtnTxt: { fontSize: 15, fontWeight: '800' },
})
