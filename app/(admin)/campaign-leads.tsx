import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, TextInput,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type Lead = {
  id: string
  nombre: string
  telefono: string
  presupuesto: string | null
  zona_busqueda: string | null
  fuente_lead: string | null
  fecha_lead: string | null
  estado: 'sin_asignar' | 'asignado'
  responsable_id: string | null
}

type Usuario = { id: string; nombre: string }

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Leads', msg)
}

function formatFecha(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPresupuesto(p: string | null) {
  if (!p) return ''
  return p.replace(/_/g, ' ').replace(/\$/g, '$').replace(/m_/g, 'M ')
}

export default function CampaignLeads() {
  useSupervisorBlock()
  const [leads, setLeads]           = useState<Lead[]>([])
  const [usuarios, setUsuarios]     = useState<Usuario[]>([])
  const [loading, setLoading]       = useState(true)
  const [asignando, setAsignando]   = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [usuarioId, setUsuarioId]   = useState<string>('')
  const [filtro, setFiltro]         = useState<'sin_asignar' | 'asignado' | 'todos'>('sin_asignar')
  const [busqueda, setBusqueda]     = useState('')
  const [filtroCampana, setFiltroCampana] = useState<string>('todas')

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const [leadsRes, usersRes] = await Promise.all([
      supabase.from('campaign_leads').select('*').order('fecha_lead', { ascending: false }),
      supabase.from('profiles').select('id, nombre').neq('role', 'admin').order('nombre'),
    ])
    setLeads((leadsRes.data ?? []) as Lead[])
    setUsuarios((usersRes.data ?? []) as Usuario[])
    if (!usuarioId && usersRes.data?.length) setUsuarioId(usersRes.data[0].id)
    setSeleccionados(new Set())
    setLoading(false)
  }

  const campanas = ['todas', ...Array.from(new Set(leads.map(l => l.fuente_lead ?? 'Sin campaña')))]

  const leadsFiltrados = leads.filter(l => {
    if (filtro !== 'todos' && l.estado !== filtro) return false
    if (filtroCampana !== 'todas' && l.fuente_lead !== filtroCampana) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return l.nombre.toLowerCase().includes(b) || l.telefono.includes(b)
    }
    return true
  })

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function seleccionarTodos() {
    if (seleccionados.size === leadsFiltrados.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(leadsFiltrados.map(l => l.id)))
    }
  }

  async function asignarSeleccionados() {
    if (!usuarioId) { alerta('Selecciona un usuario.'); return }
    if (seleccionados.size === 0) { alerta('Selecciona al menos un lead.'); return }
    setAsignando(true)

    const ids = Array.from(seleccionados)
    const usuario = usuarios.find(u => u.id === usuarioId)

    // 1. Obtener los leads seleccionados
    const leadsAAsignar = leads.filter(l => ids.includes(l.id))

    // 2. Insertar en clientes para cada lead
    const clientes = leadsAAsignar.map(l => ({
      nombre: l.nombre,
      telefono: l.telefono,
      fuente_lead: l.fuente_lead ?? 'Meta Ads',
      estado: 'por_perfilar',
      responsable_id: usuarioId,
      zona_busqueda: l.zona_busqueda,
      presupuesto: l.presupuesto,
      notas: l.fecha_lead ? `Lead Meta Ads - ${formatFecha(l.fecha_lead)}` : 'Lead Meta Ads',
    }))

    const { error: insertError } = await supabase.from('clientes').insert(clientes)
    if (insertError) { alerta('Error al insertar clientes: ' + insertError.message); setAsignando(false); return }

    // 3. Marcar los leads como asignados
    const { error: updateError } = await supabase
      .from('campaign_leads')
      .update({ estado: 'asignado', responsable_id: usuarioId })
      .in('id', ids)
    if (updateError) { alerta('Error al actualizar leads: ' + updateError.message); setAsignando(false); return }

    // 4. Notificar al usuario
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('notificaciones').insert({
        user_id: usuarioId,
        titulo: `📋 ${seleccionados.size} nuevo${seleccionados.size > 1 ? 's' : ''} lead${seleccionados.size > 1 ? 's' : ''} asignado${seleccionados.size > 1 ? 's' : ''}`,
        mensaje: `Se te asignaron ${seleccionados.size} leads de campaña Meta Ads. Revisa tu CRM.`,
        tipo: 'nuevo_cliente',
      })
    }

    setAsignando(false)
    alerta(`✅ ${seleccionados.size} leads asignados a ${usuario?.nombre ?? 'usuario'}`)
    cargar()
  }

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f5' }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )

  const sinAsignar = leads.filter(l => l.estado === 'sin_asignar').length
  const asignados  = leads.filter(l => l.estado === 'asignado').length

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f5' }}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Leads de Campaña 📣</Text>
          <Text style={s.headerSub}>
            {sinAsignar} sin asignar · {asignados} asignados · {leads.length} total
          </Text>
        </View>
      </View>

      {/* Panel de asignación */}
      {seleccionados.size > 0 && (
        <View style={s.asignPanel}>
          <Text style={s.asignTxt}>
            {seleccionados.size} lead{seleccionados.size > 1 ? 's' : ''} seleccionado{seleccionados.size > 1 ? 's' : ''}
          </Text>
          <View style={s.asignRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {usuarios.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[s.userChip, usuarioId === u.id && s.userChipSel]}
                    onPress={() => setUsuarioId(u.id)}
                  >
                    <Text style={[s.userChipTxt, usuarioId === u.id && { color: '#fff' }]}>
                      {u.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[s.btnAsignar, asignando && { opacity: 0.6 }]}
              onPress={asignarSeleccionados}
              disabled={asignando}
            >
              {asignando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnAsignarTxt}>Asignar →</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Filtros */}
      <View style={s.filtrosWrap}>
        <TextInput
          style={s.buscador}
          placeholder="Buscar nombre o teléfono..."
          value={busqueda}
          onChangeText={setBusqueda}
          placeholderTextColor="#aaa"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['sin_asignar', 'asignado', 'todos'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filtroChip, filtro === f && s.filtroChipSel]}
                onPress={() => setFiltro(f)}
              >
                <Text style={[s.filtroChipTxt, filtro === f && { color: '#fff' }]}>
                  {f === 'sin_asignar' ? `⏳ Sin asignar (${sinAsignar})` : f === 'asignado' ? `✅ Asignados (${asignados})` : `Todos (${leads.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {campanas.map(c => (
              <TouchableOpacity
                key={c}
                style={[s.campanaChip, filtroCampana === c && s.campanaChipSel]}
                onPress={() => setFiltroCampana(c)}
              >
                <Text style={[s.campanaChipTxt, filtroCampana === c && { color: '#1a6470', fontWeight: '800' }]}>
                  {c === 'todas' ? '📣 Todas' : c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Seleccionar todos */}
      {leadsFiltrados.length > 0 && (
        <TouchableOpacity style={s.selTodosBtn} onPress={seleccionarTodos}>
          <View style={[s.checkbox, seleccionados.size === leadsFiltrados.length && seleccionados.size > 0 && s.checkboxSel]}>
            {seleccionados.size === leadsFiltrados.length && seleccionados.size > 0 && (
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>
            )}
          </View>
          <Text style={s.selTodosTxt}>
            {seleccionados.size === leadsFiltrados.length && seleccionados.size > 0
              ? 'Deseleccionar todos'
              : `Seleccionar todos (${leadsFiltrados.length})`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Lista */}
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {leadsFiltrados.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={{ color: '#aaa', marginTop: 12, fontSize: 15 }}>Sin leads en esta vista</Text>
          </View>
        ) : leadsFiltrados.map(lead => {
          const sel = seleccionados.has(lead.id)
          return (
            <TouchableOpacity
              key={lead.id}
              style={[s.card, sel && s.cardSel]}
              onPress={() => toggleSeleccion(lead.id)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, sel && s.checkboxSel]}>
                {sel && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={s.nombre}>{lead.nombre}</Text>
                  {lead.estado === 'asignado' && (
                    <View style={s.badgeAsignado}>
                      <Text style={s.badgeAsignadoTxt}>✅ Asignado</Text>
                    </View>
                  )}
                </View>
                <Text style={s.telefono}>📞 {lead.telefono}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {lead.fuente_lead && (
                    <View style={s.tag}>
                      <Text style={s.tagTxt}>📣 {lead.fuente_lead}</Text>
                    </View>
                  )}
                  {lead.zona_busqueda && (
                    <View style={s.tag}>
                      <Text style={s.tagTxt}>📍 {lead.zona_busqueda}</Text>
                    </View>
                  )}
                  {lead.presupuesto && (
                    <View style={s.tag}>
                      <Text style={s.tagTxt}>💰 {formatPresupuesto(lead.presupuesto)}</Text>
                    </View>
                  )}
                </View>
                {lead.fecha_lead && (
                  <Text style={s.fecha}>{formatFecha(lead.fecha_lead)}</Text>
                )}
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  asignPanel: {
    backgroundColor: '#1a1500', padding: 12, borderBottomWidth: 1, borderBottomColor: '#c9a84c44',
  },
  asignTxt: { fontSize: 13, fontWeight: '700', color: '#c9a84c', marginBottom: 8 },
  asignRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userChip: { borderWidth: 1, borderColor: '#c9a84c88', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  userChipSel: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  userChipTxt: { fontSize: 13, color: '#c9a84c', fontWeight: '600' },
  btnAsignar: { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnAsignarTxt: { color: '#1a1000', fontWeight: '800', fontSize: 14 },

  filtrosWrap: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e8eef0' },
  buscador: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1a1a2e',
  },
  filtroChip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  filtroChipSel: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  filtroChipTxt: { fontSize: 12, fontWeight: '600', color: '#666' },
  campanaChip: { borderWidth: 1, borderColor: '#dde8e9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f5f8f9' },
  campanaChipSel: { backgroundColor: '#e8f4f5', borderColor: '#1a6470' },
  campanaChipTxt: { fontSize: 11, color: '#888' },

  selTodosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8eef0',
  },
  selTodosTxt: { fontSize: 13, color: '#1a6470', fontWeight: '700' },

  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#ddd', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxSel: { backgroundColor: '#1a6470', borderColor: '#1a6470' },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#e0eaec',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  cardSel: { borderColor: '#1a6470', backgroundColor: '#f0f9fa' },

  nombre:  { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  telefono:{ fontSize: 13, color: '#555', marginTop: 2 },
  fecha:   { fontSize: 11, color: '#aaa', marginTop: 4 },

  tag: { backgroundColor: '#f0f4f5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt: { fontSize: 11, color: '#555' },

  badgeAsignado: { backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeAsignadoTxt: { fontSize: 10, color: '#2e7d32', fontWeight: '700' },
})
