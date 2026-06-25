import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert, Platform, FlatList,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Usuario = {
  id: string
  nombre: string | null
  email: string
  cofres_pendientes: number
}

type Entrega = {
  id: string
  admin_nombre: string | null
  target_nombre: string | null
  cantidad: number
  nota: string | null
  created_at: string
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Gestión de Cofres', msg)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Ayer'
  return `${d}d`
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function GestionCofres() {
  const c = useColors()
  const [tab, setTab]             = useState<'regalar' | 'historial'>('regalar')
  const [usuarios, setUsuarios]   = useState<Usuario[]>([])
  const [entregas, setEntregas]   = useState<Entrega[]>([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)
  const [loadingHistorial, setLoadingHistorial] = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [busquedaHist, setBusquedaHist] = useState('')

  // Modal de regalo
  const [modalRegalar, setModalRegalar]   = useState(false)
  const [usuarioSelec, setUsuarioSelec]   = useState<Usuario | null>(null)
  const [cantidadStr, setCantidadStr]     = useState('1')
  const [nota, setNota]                   = useState('')
  const [regalando, setRegalando]         = useState(false)

  useFocusEffect(useCallback(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return
      supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
        if (data?.role === 'supervisor') router.replace('/(prospectador)/propiedades')
      })
    })
    cargarUsuarios()
    cargarHistorial()
  }, []))

  async function cargarUsuarios() {
    setLoadingUsuarios(true)
    const { data: perfs } = await supabase
      .from('profiles')
      .select('id, nombre, user_stats(cofres_pendientes)')
      .neq('role', 'admin')
      .order('nombre')
    if (!perfs) { setLoadingUsuarios(false); return }

    setUsuarios(perfs.map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      email: '',
      cofres_pendientes: (Array.isArray(p.user_stats) ? p.user_stats[0] : p.user_stats)?.cofres_pendientes ?? 0,
    })))
    setLoadingUsuarios(false)
  }

  async function cargarHistorial() {
    setLoadingHistorial(true)
    const { data, error } = await supabase
      .from('cofres_entregas')
      .select('id, admin_nombre, target_nombre, cantidad, nota, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) setEntregas(data as Entrega[])
    setLoadingHistorial(false)
  }

  async function regalarCofres() {
    if (!usuarioSelec) return
    const cantidad = parseInt(cantidadStr.trim(), 10)
    if (isNaN(cantidad) || cantidad <= 0) {
      alerta('Ingresa una cantidad válida mayor a 0')
      return
    }
    if (cantidad > 999) {
      alerta('La cantidad máxima es 999')
      return
    }

    setRegalando(true)
    const mensajeFinal = nota.trim() ||
      `El equipo Valera te regala ${cantidad} cofre${cantidad > 1 ? 's' : ''} misterioso${cantidad > 1 ? 's' : ''} 🎁`

    const { data, error } = await supabase.rpc('admin_regalar_cofre', {
      p_target_user_id: usuarioSelec.id,
      p_cantidad: cantidad,
      p_nota: mensajeFinal,
    })
    setRegalando(false)

    if (error) {
      alerta('Error: ' + error.message)
      return
    }
    if (!data) {
      alerta('La operación falló. Verifica que el usuario exista.')
      return
    }

    // Actualizar lista optimistamente
    setUsuarios(prev => prev.map(u =>
      u.id === usuarioSelec.id
        ? { ...u, cofres_pendientes: u.cofres_pendientes + cantidad }
        : u
    ))

    // Recargar historial
    cargarHistorial()

    alerta(`✅ ${cantidad} cofre${cantidad > 1 ? 's regalados' : ' regalado'} a ${usuarioSelec.nombre ?? usuarioSelec.email}`)
    cerrarModal()
  }

  function abrirModal(u: Usuario) {
    setUsuarioSelec(u)
    setCantidadStr('1')
    setNota('')
    setModalRegalar(true)
  }

  function cerrarModal() {
    setModalRegalar(false)
    setUsuarioSelec(null)
    setCantidadStr('1')
    setNota('')
  }

  const usuariosFiltrados = usuarios.filter(u =>
    !busqueda.trim() ||
    (u.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const entregasFiltradas = entregas.filter(e =>
    !busquedaHist.trim() ||
    (e.target_nombre ?? '').toLowerCase().includes(busquedaHist.toLowerCase())
  )

  const totalPendientes = usuarios.reduce((s, u) => s + u.cofres_pendientes, 0)
  const totalEntregados = entregas.reduce((s, e) => s + e.cantidad, 0)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>

      {/* Header */}
      <View style={[st.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <Text style={[st.headerTitle, { color: c.text }]}>🎁 Gestión de Cofres</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* KPI strip */}
      <View style={[st.kpiStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <View style={st.kpiItem}>
          <Text style={[st.kpiN, { color: '#1a6470' }]}>{usuarios.length}</Text>
          <Text style={st.kpiL}>USUARIOS</Text>
        </View>
        <View style={st.kpiDiv} />
        <View style={st.kpiItem}>
          <Text style={[st.kpiN, { color: '#c9a84c' }]}>{totalPendientes}</Text>
          <Text style={st.kpiL}>PENDIENTES</Text>
        </View>
        <View style={st.kpiDiv} />
        <View style={st.kpiItem}>
          <Text style={[st.kpiN, { color: '#2e7d32' }]}>{totalEntregados}</Text>
          <Text style={st.kpiL}>ENTREGADOS</Text>
        </View>
        <View style={st.kpiDiv} />
        <View style={st.kpiItem}>
          <Text style={[st.kpiN, { color: '#7c3aed' }]}>{entregas.length}</Text>
          <Text style={st.kpiL}>REGALOS</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[st.tabRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {([['regalar', '🎁 Regalar cofres'], ['historial', '📋 Historial']] as const).map(([k, lbl]) => (
          <TouchableOpacity
            key={k}
            style={[st.tabBtn, tab === k && st.tabBtnActivo]}
            onPress={() => setTab(k)}
          >
            <Text style={[st.tabTxt, { color: tab === k ? '#1a6470' : c.textMute }, tab === k && st.tabTxtActivo]}>
              {lbl}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'regalar' ? (
        <View style={{ flex: 1 }}>
          {/* Búsqueda */}
          <View style={[st.searchBar, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 15 }}>🔍</Text>
            <TextInput
              style={[st.searchInput, { color: c.text }]}
              placeholder="Buscar usuario por nombre o email..."
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
            />
            {busqueda ? (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={{ color: c.textMute, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {loadingUsuarios ? (
            <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={usuariosFiltrados}
              keyExtractor={u => u.id}
              contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
              ListEmptyComponent={
                <View style={st.empty}>
                  <Text style={st.emptyTxt}>{busqueda ? 'Sin resultados' : 'Sin usuarios'}</Text>
                </View>
              }
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={[st.userCard, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => abrirModal(u)}
                  activeOpacity={0.8}
                >
                  <View style={st.userAvatar}>
                    <Text style={st.userAvatarTxt}>
                      {(u.nombre ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[st.userNombre, { color: c.text }]} numberOfLines={1}>
                      {u.nombre ?? '(sin nombre)'}
                    </Text>
                  </View>
                  <View style={st.cofresInfo}>
                    <Text style={st.cofresN}>{u.cofres_pendientes}</Text>
                    <Text style={st.cofresL}>pendientes</Text>
                  </View>
                  <View style={st.regalarBtn}>
                    <Text style={st.regalarBtnTxt}>🎁 Regalar</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        // ── Historial ──
        <View style={{ flex: 1 }}>
          {/* Filtro por usuario */}
          <View style={[st.searchBar, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 15 }}>🔍</Text>
            <TextInput
              style={[st.searchInput, { color: c.text }]}
              placeholder="Filtrar historial por usuario..."
              placeholderTextColor={c.textMute}
              value={busquedaHist}
              onChangeText={setBusquedaHist}
              autoCapitalize="none"
            />
            {busquedaHist ? (
              <TouchableOpacity onPress={() => setBusquedaHist('')}>
                <Text style={{ color: c.textMute, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 0, paddingBottom: 60 }}>
          {loadingHistorial ? (
            <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
          ) : entregasFiltradas.length === 0 ? (
            <View style={st.empty}>
              <Text style={st.emptyTxt}>{busquedaHist.trim() ? 'Sin entregas para ese usuario' : 'Sin entregas registradas'}</Text>
            </View>
          ) : (
            entregasFiltradas.map(e => (
              <View key={e.id} style={[st.historialCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={st.historialTop}>
                  <View style={st.historialIconWrap}>
                    <Text style={{ fontSize: 20 }}>🎁</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[st.historialDestinatario, { color: c.text }]} numberOfLines={1}>
                      {e.target_nombre ?? '—'}
                    </Text>
                    <Text style={[st.historialAdmin, { color: c.textMute }]} numberOfLines={1}>
                      Entregado por: {e.admin_nombre ?? 'admin'}
                    </Text>
                  </View>
                  <View style={st.cantidadBadge}>
                    <Text style={st.cantidadBadgeTxt}>+{e.cantidad} 📦</Text>
                  </View>
                </View>

                {e.nota && (
                  <View style={[st.notaWrap, { backgroundColor: c.bg }]}>
                    <Text style={[st.notaTxt, { color: c.textSub }]}>💬 {e.nota}</Text>
                  </View>
                )}

                <View style={st.historialMeta}>
                  <Text style={[st.historialFecha, { color: c.textMute }]}>
                    🕐 {formatFecha(e.created_at)} · {tiempoRelativo(e.created_at)}
                  </Text>
                </View>
              </View>
            ))
          )}
          </ScrollView>
        </View>
      )}

      {/* ── Modal regalar ── */}
      <Modal visible={modalRegalar} transparent animationType="slide" onRequestClose={cerrarModal}>
        <View style={st.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={cerrarModal} />
          <View style={[st.modalSheet, { backgroundColor: c.card }]}>
            <View style={st.sheetHandle} />

            <Text style={[st.modalTitulo, { color: '#2e7d32' }]}>🎁 Regalar cofres</Text>

            {usuarioSelec && (
              <View style={[st.modalUsuario, { backgroundColor: c.bg }]}>
                <View style={st.userAvatar}>
                  <Text style={st.userAvatarTxt}>
                    {(usuarioSelec.nombre ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.userNombre, { color: c.text }]} numberOfLines={1}>
                    {usuarioSelec.nombre ?? '(sin nombre)'}
                  </Text>
                  <Text style={[st.userEmail, { color: c.textMute }]}>
                    Tiene {usuarioSelec.cofres_pendientes} cofres pendientes
                  </Text>
                </View>
              </View>
            )}

            {/* Cantidad */}
            <Text style={[st.fieldLabel, { color: c.textSub }]}>Cantidad de cofres</Text>
            {/* Botones rápidos */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {[1, 2, 3, 5, 10, 20, 50].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[st.cantBtn, cantidadStr === String(n) && st.cantBtnActivo]}
                  onPress={() => setCantidadStr(String(n))}
                >
                  <Text style={[st.cantBtnTxt, cantidadStr === String(n) && { color: '#fff', fontWeight: '800' }]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Input manual */}
            <TextInput
              style={[st.cantInput, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={cantidadStr}
              onChangeText={v => setCantidadStr(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="O escribe la cantidad"
              placeholderTextColor={c.textMute}
            />

            {/* Mensaje */}
            <Text style={[st.fieldLabel, { color: c.textSub, marginTop: 12 }]}>Mensaje (opcional)</Text>
            <TextInput
              style={[st.notaInput, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={nota}
              onChangeText={setNota}
              multiline
              placeholder={`Ej: ¡Premio por tu excelente desempeño! 🏆`}
              placeholderTextColor={c.textMute}
            />

            <TouchableOpacity
              style={[st.btnRegalar, regalando && { opacity: 0.6 }]}
              onPress={regalarCofres}
              disabled={regalando}
            >
              {regalando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={st.btnRegalarTxt}>
                  🎁 Regalar {parseInt(cantidadStr) > 0 ? parseInt(cantidadStr) : '?'} cofre{parseInt(cantidadStr) !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={st.btnCancelar} onPress={cerrarModal}>
              <Text style={{ color: c.textMute, fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },

  kpiStrip:  { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
  kpiItem:   { flex: 1, alignItems: 'center', gap: 2 },
  kpiN:      { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  kpiL:      { fontSize: 8, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.5 },
  kpiDiv:    { width: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabBtnActivo: { borderBottomWidth: 2.5, borderBottomColor: '#1a6470' },
  tabTxt: { fontSize: 14, fontWeight: '500' },
  tabTxtActivo: { fontWeight: '800' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  userAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#0369a1' },
  userNombre:    { fontSize: 14, fontWeight: '700', marginBottom: 1 },
  userEmail:     { fontSize: 11 },
  cofresInfo:    { alignItems: 'center', minWidth: 44 },
  cofresN:       { fontSize: 18, fontWeight: '900', color: '#c9a84c' },
  cofresL:       { fontSize: 9, color: '#94a3b8', fontWeight: '600' },
  regalarBtn:    { backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  regalarBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

  historialCard: {
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10,
  },
  historialTop:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  historialIconWrap:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  historialDestinatario: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  historialAdmin:        { fontSize: 11 },
  cantidadBadge:         { backgroundColor: '#1a3d1f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  cantidadBadgeTxt:      { fontSize: 13, fontWeight: '900', color: '#4ade80' },
  notaWrap:              { borderRadius: 8, padding: 8, marginBottom: 8 },
  notaTxt:               { fontSize: 12, lineHeight: 17 },
  historialMeta:         {},
  historialFecha:        { fontSize: 11 },

  empty:    { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { fontSize: 15, color: '#94a3b8' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '90%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitulo:  { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  modalUsuario: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 10, marginBottom: 16 },
  fieldLabel:   { fontSize: 13, fontWeight: '700', marginBottom: 8 },

  cantBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  cantBtnActivo: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  cantBtnTxt:    { fontSize: 13, color: '#374151', fontWeight: '600' },
  cantInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 4,
  },
  notaInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, height: 80, textAlignVertical: 'top',
  },
  btnRegalar: {
    backgroundColor: '#2e7d32', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  btnRegalarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnCancelar:   { alignItems: 'center', paddingVertical: 14 },
})
