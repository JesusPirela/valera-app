import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, FlatList,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type LeadDisponible = {
  id: string
  nombre: string | null
  telefono: string
  zona_interes: string | null
  nota: string | null
  created_at: string
}

type LeadHistorial = {
  id: string
  nombre: string | null
  telefono: string
  zona_interes: string | null
  fuente_asignacion: string | null
  asignado_at: string
  usuario_nombre: string
  usuario_id: string
  cliente_id: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Pool de Leads', msg)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function labelFuente(fuente: string | null) {
  if (!fuente) return 'Desconocido'
  if (fuente.startsWith('cofre')) return '🎰 Cofre'
  if (fuente.startsWith('tienda')) return '🛒 Tienda'
  return fuente
}

function labelTipoLead(fuente: string | null) {
  if (!fuente) return ''
  if (fuente.includes('lead_premium')) return 'Lead Premium ⭐'
  if (fuente.includes('lead_meta')) return 'Lead Meta Ads 📱'
  return ''
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

export default function LeadsPool() {
  const c = useColors()
  const [tab, setTab] = useState<'pool' | 'historial'>('pool')

  // Pool disponible
  const [disponibles, setDisponibles] = useState<LeadDisponible[]>([])
  const [loadingPool, setLoadingPool] = useState(true)

  // Historial asignados
  const [historial, setHistorial] = useState<LeadHistorial[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(true)

  // Formulario agregar
  const [fNombre, setFNombre]   = useState('')
  const [fTelefono, setFTelefono] = useState('')
  const [fZona, setFZona]       = useState('')
  const [fNota, setFNota]       = useState('')
  const [guardando, setGuardando] = useState(false)

  // Eliminando
  const [eliminando, setEliminando] = useState<string | null>(null)

  // Asignación retroactiva
  const [asignandoRetro, setAsignandoRetro] = useState(false)

  async function asignarPendientes() {
    setAsignandoRetro(true)
    const { data, error } = await supabase.rpc('admin_asignar_leads_pendientes')
    setAsignandoRetro(false)
    if (error) { alerta('Error: ' + error.message); return }
    const r = data as any
    if (r?.asignados === 0) {
      alerta(r?.sin_lead_en_pool > 0
        ? 'No hay leads disponibles en el pool. Agrega más y vuelve a intentarlo.'
        : 'No hay compras pendientes de leads sin asignar.')
    } else {
      alerta(`✅ ${r.asignados} lead(s) asignados exitosamente.${r.sin_lead_en_pool > 0 ? `\n⚠️ ${r.sin_lead_en_pool} compra(s) quedaron sin lead por pool vacío.` : ''}`)
    }
    cargarPool()
    cargarHistorial()
  }

  async function cargarPool() {
    setLoadingPool(true)
    const { data } = await supabase.rpc('get_leads_pool_disponibles')
    setDisponibles((data as LeadDisponible[]) ?? [])
    setLoadingPool(false)
  }

  async function cargarHistorial() {
    setLoadingHistorial(true)
    const { data } = await supabase.rpc('get_leads_pool_historial')
    setHistorial((data as LeadHistorial[]) ?? [])
    setLoadingHistorial(false)
  }

  useFocusEffect(useCallback(() => {
    cargarPool()
    cargarHistorial()
  }, []))
  const { refreshControl } = usePullRefresh(async () => { await Promise.all([cargarPool(), cargarHistorial()]) })

  async function agregar() {
    if (!fTelefono.trim()) { alerta('El teléfono es obligatorio.'); return }
    setGuardando(true)
    const { error } = await supabase.rpc('admin_agregar_lead_pool', {
      p_nombre:       fNombre.trim() || null,
      p_telefono:     fTelefono.trim(),
      p_zona_interes: fZona.trim()   || null,
      p_nota:         fNota.trim()   || null,
    })
    setGuardando(false)
    if (error) { alerta('Error al agregar: ' + error.message); return }
    setFNombre(''); setFTelefono(''); setFZona(''); setFNota('')
    cargarPool()
  }

  async function eliminar(id: string) {
    const ok = Platform.OS === 'web'
      ? window.confirm('¿Eliminar este lead del pool?')
      : await new Promise<boolean>(res =>
          Alert.alert('Eliminar lead', '¿Seguro?', [
            { text: 'Cancelar', onPress: () => res(false) },
            { text: 'Eliminar', style: 'destructive', onPress: () => res(true) },
          ])
        )
    if (!ok) return
    setEliminando(id)
    await supabase.rpc('admin_eliminar_lead_pool', { p_lead_id: id })
    setEliminando(null)
    cargarPool()
  }

  const s = makeStyles(c)

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={[s.headerTitle, { color: c.text }]}>Pool de Leads</Text>
        <View style={s.counts}>
          <View style={[s.countChip, { backgroundColor: '#1a647022' }]}>
            <Text style={[s.countNum, { color: '#1a6470' }]}>{disponibles.length}</Text>
            <Text style={[s.countLabel, { color: '#1a6470' }]}>Disponibles</Text>
          </View>
          <View style={[s.countChip, { backgroundColor: '#2e7d3222' }]}>
            <Text style={[s.countNum, { color: '#2e7d32' }]}>{historial.length}</Text>
            <Text style={[s.countLabel, { color: '#2e7d32' }]}>Asignados</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {(['pool', 'historial'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && { borderBottomColor: '#1a6470', borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? '#1a6470' : c.textMute }]}>
              {t === 'pool' ? `Pool disponible (${disponibles.length})` : `Historial (${historial.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'pool' ? (
        <ScrollView contentContainerStyle={s.scroll} refreshControl={refreshControl}>

          {/* Formulario agregar */}
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.seccion, { color: c.text }]}>Agregar lead al pool</Text>

            <TextInput
              style={[s.input, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
              placeholder="Teléfono *"
              placeholderTextColor={c.placeholder}
              value={fTelefono}
              onChangeText={setFTelefono}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[s.input, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
              placeholder="Nombre (opcional)"
              placeholderTextColor={c.placeholder}
              value={fNombre}
              onChangeText={setFNombre}
            />
            <TextInput
              style={[s.input, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
              placeholder="Zona de interés (opcional)"
              placeholderTextColor={c.placeholder}
              value={fZona}
              onChangeText={setFZona}
            />
            <TextInput
              style={[s.input, s.textarea, { color: c.inputText, backgroundColor: c.input, borderColor: c.border }]}
              placeholder="Nota (opcional)"
              placeholderTextColor={c.placeholder}
              value={fNota}
              onChangeText={setFNota}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[s.btnAgregar, guardando && { opacity: 0.6 }]}
              onPress={agregar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnAgregarText}>+ Agregar al pool</Text>}
            </TouchableOpacity>
          </View>

          {/* Asignar compras pendientes retroactivas */}
          <View style={[s.card, { backgroundColor: '#fff3e0', borderColor: '#ffe0b2' }]}>
            <Text style={[s.seccion, { color: '#e65100' }]}>Compras sin asignar (antes de auto-asignación)</Text>
            <Text style={{ color: '#bf360c', fontSize: 13, lineHeight: 18 }}>
              Si alguien compró Lead Premium o Lead Meta Ads antes de implementar la asignación automática,
              su compra quedó pendiente. Toca el botón para asignarles un lead del pool ahora.
            </Text>
            <TouchableOpacity
              style={[s.btnAgregar, { backgroundColor: '#e65100' }, asignandoRetro && { opacity: 0.6 }]}
              onPress={asignarPendientes}
              disabled={asignandoRetro}
            >
              {asignandoRetro
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnAgregarText}>🔄 Asignar compras pendientes</Text>}
            </TouchableOpacity>
          </View>

          {/* Lista pool */}
          <Text style={[s.seccion, { color: c.text, marginTop: 8, marginHorizontal: 16 }]}>
            En espera de asignación
          </Text>

          {loadingPool
            ? <ActivityIndicator style={{ marginTop: 24 }} color="#1a6470" />
            : disponibles.length === 0
              ? <View style={s.empty}>
                  <Text style={s.emptyIcon}>📭</Text>
                  <Text style={[s.emptyText, { color: c.textMute }]}>El pool está vacío</Text>
                  <Text style={[s.emptySubtext, { color: c.textMute }]}>
                    Agrega leads para que se asignen automáticamente cuando un usuario compre o gane uno en el cofre.
                  </Text>
                </View>
              : disponibles.map(lead => (
                  <View key={lead.id} style={[s.leadCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={s.leadAvatar}>
                      <Text style={s.leadAvatarText}>
                        {lead.nombre ? lead.nombre[0].toUpperCase() : '#'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.leadNombre, { color: c.text }]}>
                        {lead.nombre ?? 'Sin nombre'}
                      </Text>
                      <Text style={[s.leadTel, { color: c.textMute }]}>{lead.telefono}</Text>
                      {lead.zona_interes
                        ? <Text style={[s.leadMeta, { color: c.textMute }]}>📍 {lead.zona_interes}</Text>
                        : null}
                      {lead.nota
                        ? <Text style={[s.leadMeta, { color: c.textMute }]}>📝 {lead.nota}</Text>
                        : null}
                      <Text style={[s.leadFecha, { color: c.textMute }]}>
                        Agregado: {formatFecha(lead.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.btnEliminar}
                      onPress={() => eliminar(lead.id)}
                      disabled={eliminando === lead.id}
                    >
                      {eliminando === lead.id
                        ? <ActivityIndicator size="small" color="#c62828" />
                        : <Text style={s.btnEliminarText}>✕</Text>}
                    </TouchableOpacity>
                  </View>
                ))
          }
        </ScrollView>
      ) : (
        /* ── Historial ── */
        <FlatList
          refreshControl={refreshControl}
          data={historial}
          keyExtractor={i => i.id}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={15}
          contentContainerStyle={s.scroll}
          ListEmptyComponent={
            loadingHistorial
              ? <ActivityIndicator style={{ marginTop: 40 }} color="#1a6470" />
              : <View style={s.empty}>
                  <Text style={s.emptyIcon}>📋</Text>
                  <Text style={[s.emptyText, { color: c.textMute }]}>Sin historial aún</Text>
                </View>
          }
          renderItem={({ item }) => (
            <View style={[s.histCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.histHeader}>
                <View style={s.histChips}>
                  <View style={[s.chip, { backgroundColor: '#1a647018' }]}>
                    <Text style={[s.chipText, { color: '#1a6470' }]}>
                      {labelFuente(item.fuente_asignacion)}
                    </Text>
                  </View>
                  {labelTipoLead(item.fuente_asignacion) ? (
                    <View style={[s.chip, { backgroundColor: '#c9a84c18' }]}>
                      <Text style={[s.chipText, { color: '#c9a84c' }]}>
                        {labelTipoLead(item.fuente_asignacion)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[s.histFecha, { color: c.textMute }]}>
                  {formatFecha(item.asignado_at)}
                </Text>
              </View>

              <View style={s.histBody}>
                {/* Lead info */}
                <View style={[s.histCol, { borderRightColor: c.border, borderRightWidth: 1 }]}>
                  <Text style={[s.histLabel, { color: c.textMute }]}>LEAD</Text>
                  <Text style={[s.histVal, { color: c.text }]}>
                    {item.nombre ?? 'Sin nombre'}
                  </Text>
                  <Text style={[s.histTel, { color: c.textMute }]}>{item.telefono}</Text>
                  {item.zona_interes
                    ? <Text style={[s.histMeta, { color: c.textMute }]}>📍 {item.zona_interes}</Text>
                    : null}
                </View>
                {/* Asignado a */}
                <View style={s.histCol}>
                  <Text style={[s.histLabel, { color: c.textMute }]}>ASIGNADO A</Text>
                  <View style={s.histUserRow}>
                    <View style={s.histAvatar}>
                      <Text style={s.histAvatarText}>
                        {item.usuario_nombre[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text style={[s.histVal, { color: c.text, flexShrink: 1 }]}>
                      {item.usuario_nombre}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root:         { flex: 1 },
    header:       { padding: 16, borderBottomWidth: 1 },
    headerTitle:  { fontSize: 22, fontWeight: '800', marginBottom: 12 },
    counts:       { flexDirection: 'row', gap: 10 },
    countChip:    { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
    countNum:     { fontSize: 28, fontWeight: '900' },
    countLabel:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
    tabs:         { flexDirection: 'row', borderBottomWidth: 1 },
    tab:          { flex: 1, paddingVertical: 14, alignItems: 'center' },
    tabText:      { fontSize: 14, fontWeight: '700' },
    scroll:       { padding: 16, gap: 12, paddingBottom: 40 },

    // Formulario
    card:         { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10, marginBottom: 4 },
    seccion:      { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
    input:        { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    textarea:     { minHeight: 72, textAlignVertical: 'top' },
    btnAgregar:   { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    btnAgregarText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // Pool disponible
    leadCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
    leadAvatar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center' },
    leadAvatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    leadNombre:   { fontSize: 15, fontWeight: '700' },
    leadTel:      { fontSize: 13, marginTop: 2 },
    leadMeta:     { fontSize: 12, marginTop: 3 },
    leadFecha:    { fontSize: 11, marginTop: 4 },
    btnEliminar:  { padding: 8, borderRadius: 8, backgroundColor: '#c6282810', alignItems: 'center', justifyContent: 'center' },
    btnEliminarText: { color: '#c62828', fontSize: 16, fontWeight: '700' },

    // Empty
    empty:        { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 8 },
    emptyIcon:    { fontSize: 48 },
    emptyText:    { fontSize: 16, fontWeight: '700', textAlign: 'center' },
    emptySubtext: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 4 },

    // Historial
    histCard:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    histHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#00000010' },
    histChips:    { flexDirection: 'row', gap: 6 },
    chip:         { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    chipText:     { fontSize: 12, fontWeight: '700' },
    histFecha:    { fontSize: 11 },
    histBody:     { flexDirection: 'row' },
    histCol:      { flex: 1, padding: 12, gap: 4 },
    histLabel:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
    histVal:      { fontSize: 14, fontWeight: '700' },
    histTel:      { fontSize: 13 },
    histMeta:     { fontSize: 12 },
    histUserRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    histAvatar:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center' },
    histAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  })
}
