import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Campania = { id: string; nombre: string; estado: string | null; asignado_a: string | null; leads: number; asignadoNombre: string | null }
type Lead = { id: string; nombre: string | null; telefono: string | null; email: string | null; ad_set: string | null; extra: Record<string, string> | null; cliente_id: string | null; lead_created_at: string | null }
type Asesor = { id: string; nombre: string }

function alerta(m: string) { if (Platform.OS === 'web') window.alert(m); else Alert.alert('', m) }
function fmtFecha(iso: string | null) { return iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }

export default function LeadsCampanias() {
  const c = useColors()
  const [camps, setCamps] = useState<Campania[]>([])
  const [asesores, setAsesores] = useState<Asesor[]>([])
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [leadsPorCamp, setLeadsPorCamp] = useState<Record<string, Lead[]>>({})
  const [asignando, setAsignando] = useState<Campania | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: cData }, { data: pData }] = await Promise.all([
      supabase.from('campanias').select('id, nombre, estado, asignado_a, leads_campania(count)'),
      supabase.from('profiles').select('id, nombre').neq('role', 'admin').order('nombre', { ascending: true }),
    ])
    const perfiles = (pData ?? []).filter((p: any) => p.nombre?.trim())
    const nombreDe: Record<string, string> = Object.fromEntries(perfiles.map((p: any) => [p.id, p.nombre]))
    const list: Campania[] = (cData ?? []).map((x: any) => ({
      id: x.id, nombre: x.nombre, estado: x.estado, asignado_a: x.asignado_a,
      leads: x.leads_campania?.[0]?.count ?? 0,
      asignadoNombre: x.asignado_a ? (nombreDe[x.asignado_a] ?? '—') : null,
    }))
      .filter((x: Campania) => x.leads > 0 || x.estado === 'ACTIVE' || x.asignado_a)
      .sort((a: Campania, b: Campania) => b.leads - a.leads)
    setCamps(list)
    setAsesores(perfiles.map((p: any) => ({ id: p.id, nombre: p.nombre })))
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  async function toggle(id: string) {
    if (expandida === id) { setExpandida(null); return }
    setExpandida(id)
    if (!leadsPorCamp[id]) {
      const { data } = await supabase.from('leads_campania').select('*').eq('campania_id', id).order('lead_created_at', { ascending: false })
      setLeadsPorCamp(prev => ({ ...prev, [id]: (data ?? []) as Lead[] }))
    }
  }

  async function sincronizar() {
    setSincronizando(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-leads-facebook', { body: {} })
      if (error) alerta('No se pudo sincronizar: ' + error.message)
      else if (data?.ok === false) alerta('Error: ' + data.error)
      else alerta(`Sincronizado ✅  ${data?.nuevos ?? 0} lead(s) nuevo(s).`)
      setLeadsPorCamp({}); await cargar()
    } finally { setSincronizando(false) }
  }

  async function confirmarAsignar(asesor: Asesor) {
    const camp = asignando
    setAsignando(null)
    if (!camp) return
    const { data, error } = await supabase.rpc('asignar_campania', { p_campania_id: camp.id, p_user_id: asesor.id })
    if (error) { alerta('Error al asignar: ' + error.message); return }
    alerta(`Campaña asignada a ${asesor.nombre}.\n${data ?? 0} lead(s) pasaron a su CRM.`)
    cargar()
  }

  return (
    <View style={[s.page, { backgroundColor: c.bg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>📢 Leads de campañas</Text>
          <Text style={s.headerSub}>Facebook · asigna una campaña a un asesor</Text>
        </View>
        <TouchableOpacity style={s.syncBtn} onPress={sincronizar} disabled={sincronizando}>
          {sincronizando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.syncBtnTxt}>⟳ Sincronizar</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 48 }} refreshControl={refreshControl}>
          {camps.length === 0 && <Text style={[s.vacio, { color: c.textMute }]}>Sin campañas con leads todavía. Toca "Sincronizar".</Text>}
          {camps.map(camp => {
            const abierta = expandida === camp.id
            const leads = leadsPorCamp[camp.id] ?? []
            return (
              <View key={camp.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <TouchableOpacity style={s.cardHead} onPress={() => toggle(camp.id)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.campNombre, { color: c.text }]} numberOfLines={1}>{camp.nombre}</Text>
                    <View style={s.badges}>
                      <View style={[s.badge, { backgroundColor: camp.estado === 'ACTIVE' ? '#dcfce7' : '#f1f5f9' }]}>
                        <Text style={[s.badgeTxt, { color: camp.estado === 'ACTIVE' ? '#15803d' : '#64748b' }]}>{camp.estado === 'ACTIVE' ? 'Activa' : 'Pausada'}</Text>
                      </View>
                      <Text style={[s.leadsCount, { color: c.textSub }]}>{camp.leads} lead{camp.leads === 1 ? '' : 's'}</Text>
                      {camp.asignadoNombre && <Text style={s.asignada}>→ {camp.asignadoNombre}</Text>}
                    </View>
                  </View>
                  <Text style={{ color: c.textMute, fontSize: 16 }}>{abierta ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.asignarBtn} onPress={() => setAsignando(camp)}>
                  <Text style={s.asignarBtnTxt}>{camp.asignadoNombre ? '🔁 Reasignar a otro asesor' : '👤 Asignar a un asesor'}</Text>
                </TouchableOpacity>

                {abierta && (
                  <View style={s.leadsWrap}>
                    {leads.length === 0 ? (
                      <Text style={[s.vacioLead, { color: c.textMute }]}>Cargando / sin leads.</Text>
                    ) : leads.map(l => (
                      <View key={l.id} style={[s.leadRow, { borderTopColor: c.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.leadNombre, { color: c.text }]}>{l.nombre || 'Sin nombre'}{l.cliente_id ? '  ✓ en CRM' : ''}</Text>
                          <Text style={[s.leadTel, { color: c.textSub }]}>{l.telefono || 's/n'}{l.email ? ` · ${l.email}` : ''}</Text>
                          {l.extra && Object.entries(l.extra).slice(0, 3).map(([k, v]) => (
                            <Text key={k} style={[s.leadExtra, { color: c.textMute }]} numberOfLines={1}>{k.replace(/[¿?_]/g, ' ').trim()}: {String(v).replace(/_/g, ' ')}</Text>
                          ))}
                        </View>
                        <Text style={[s.leadFecha, { color: c.textMute }]}>{fmtFecha(l.lead_created_at)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* Modal asignar a asesor */}
      <Modal visible={!!asignando} transparent animationType="fade" onRequestClose={() => setAsignando(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setAsignando(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation()}>
            <Text style={[s.modalTitulo, { color: c.text }]}>Asignar "{asignando?.nombre}" a:</Text>
            <Text style={[s.modalSub, { color: c.textMute }]}>Sus leads pasarán al CRM de ese asesor.</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
              {asesores.map(a => (
                <TouchableOpacity key={a.id} style={[s.asesorRow, { borderBottomColor: c.border }]} onPress={() => confirmarAsignar(a)}>
                  <Text style={[s.asesorNombre, { color: c.text }]}>{a.nombre}</Text>
                  <Text style={{ color: '#1a6470', fontWeight: '800' }}>Asignar →</Text>
                </TouchableOpacity>
              ))}
              {asesores.length === 0 && <Text style={[s.vacioLead, { color: c.textMute }]}>No hay asesores disponibles.</Text>}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const TEAL = '#1a6470'
const s = StyleSheet.create({
  page: { flex: 1 },
  header: { backgroundColor: TEAL, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  syncBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 44, alignItems: 'center' },
  syncBtnTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  vacio: { textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 30, lineHeight: 20 },

  card: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  campNombre: { fontSize: 15, fontWeight: '800' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  leadsCount: { fontSize: 12.5, fontWeight: '700' },
  asignada: { fontSize: 12, fontWeight: '800', color: '#1a6470' },
  asignarBtn: { backgroundColor: 'rgba(26,100,112,0.08)', paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(26,100,112,0.15)' },
  asignarBtnTxt: { color: TEAL, fontSize: 13, fontWeight: '800' },
  leadsWrap: { paddingHorizontal: 14, paddingBottom: 6 },
  vacioLead: { fontSize: 12.5, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center' },
  leadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, paddingVertical: 9 },
  leadNombre: { fontSize: 13.5, fontWeight: '700' },
  leadTel: { fontSize: 12.5, marginTop: 1 },
  leadExtra: { fontSize: 11, marginTop: 1 },
  leadFecha: { fontSize: 10.5 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 18 },
  modalTitulo: { fontSize: 16, fontWeight: '800' },
  modalSub: { fontSize: 12.5, marginTop: 3 },
  asesorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1 },
  asesorNombre: { fontSize: 14.5, fontWeight: '600' },
})
