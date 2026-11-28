// Las cuentas de inmobiliaria aliada, aparte de Equipo → Usuarios.
//
// get_prospectadores() (la que alimenta esa pantalla) filtra explícitamente
// los roles de casa — un aliado_admin o aliado_agente nunca aparece ahí. Una
// vez convertida, una cuenta desaparecía del todo de la vista del admin: no
// había dónde encontrarla para cambiarla de agencia o devolverla al equipo.
// Esta pantalla es justo eso: solo aliados, agrupados por SU inmobiliaria.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator,
  Platform, Alert, Modal,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import InmobiliariaPicker from '../../components/ui/InmobiliariaPicker'

type Aliado = {
  id: string; email: string; nombre: string | null; role: 'aliado_admin' | 'aliado_agente'
  created_at: string; last_seen: string | null; inmobiliaria_id: string; inmobiliaria_nombre: string
}

const ROLES_VALERA = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'prospectador', label: 'Prospectador' },
  { value: 'prospectador_plus', label: 'Prospectador Plus' },
  { value: 'asesor', label: 'Asesor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'gerente', label: 'Gerente' },
] as const

export default function UsuariosAliados() {
  const c = useColors()
  const [lista, setLista] = useState<Aliado[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  const [modalReasignar, setModalReasignar] = useState<Aliado | null>(null)
  const [nuevaInmob, setNuevaInmob] = useState<string | null>(null)

  const [modalConvertir, setModalConvertir] = useState<Aliado | null>(null)

  function alerta(msg: string) {
    if (Platform.OS === 'web') window.alert(msg)
    else Alert.alert('Aviso', msg)
  }

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_usuarios_aliados')
    if (!error) setLista((data ?? []) as Aliado[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  async function invocarCambioRol(userId: string, role: string, inmobiliariaId?: string | null) {
    setProcesandoId(userId)
    const { data, error } = await supabase.functions.invoke('cambiar-rol', {
      body: { userId, role, inmobiliariaId },
    })
    setProcesandoId(null)
    if (error || data?.error) { alerta(data?.error ?? error?.message ?? 'No se pudo hacer el cambio.'); return false }
    return true
  }

  async function confirmarReasignar() {
    if (!modalReasignar || !nuevaInmob) return
    const ok = await invocarCambioRol(modalReasignar.id, modalReasignar.role, nuevaInmob)
    if (ok) { setModalReasignar(null); cargar() }
  }

  async function confirmarConvertir(nuevoRol: string) {
    if (!modalConvertir) return
    const ok = await invocarCambioRol(modalConvertir.id, nuevoRol)
    if (ok) { setModalConvertir(null); cargar() }
  }

  async function alternarTitularAgente(item: Aliado) {
    const nuevoRol = item.role === 'aliado_admin' ? 'aliado_agente' : 'aliado_admin'
    const ok = await invocarCambioRol(item.id, nuevoRol, item.inmobiliaria_id)
    if (ok) cargar()
  }

  const secciones = Object.entries(
    lista.reduce<Record<string, Aliado[]>>((acc, a) => {
      (acc[a.inmobiliaria_nombre] ??= []).push(a)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b)).map(([title, data]) => ({ title, data }))

  return (
    <View style={[s.container, { backgroundColor: c.bg2 }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/prospectadores')}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.titulo, { color: c.text }]}>Usuarios aliados</Text>
          <Text style={[s.sub, { color: c.textSub }]}>{lista.length} cuenta{lista.length === 1 ? '' : 's'} de inmobiliarias aliadas</Text>
        </View>
      </View>

      {cargando ? (
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
      ) : lista.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="business-outline" size={30} color={c.textMute} />
          <Text style={[s.emptyText, { color: c.textSub }]}>Todavía no hay ninguna cuenta aliada.</Text>
        </View>
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={refreshControl}
          renderSectionHeader={({ section }) => (
            <Text style={[s.seccionTitulo, { color: c.text, backgroundColor: c.bg2 }]}>🏢 {section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.nombreRow}>
                  <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{item.nombre ?? item.email}</Text>
                  <View style={[s.rolBadge, item.role === 'aliado_admin' ? s.rolTitular : s.rolAgente]}>
                    <Text style={s.rolBadgeTxt}>{item.role === 'aliado_admin' ? 'Titular' : 'Agente'}</Text>
                  </View>
                </View>
                <Text style={[s.email, { color: c.textSub }]} numberOfLines={1}>{item.email}</Text>
              </View>
              <View style={s.acciones}>
                {procesandoId === item.id ? (
                  <ActivityIndicator size="small" color="#5e35b1" />
                ) : (
                  <>
                    <TouchableOpacity style={s.btnChico} onPress={() => alternarTitularAgente(item)}>
                      <Text style={s.btnChicoTxt}>{item.role === 'aliado_admin' ? '↓ A agente' : '↑ A titular'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnChico} onPress={() => { setNuevaInmob(null); setModalReasignar(item) }}>
                      <Text style={s.btnChicoTxt}>Cambiar agencia</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btnChico, s.btnRojo]} onPress={() => setModalConvertir(item)}>
                      <Text style={[s.btnChicoTxt, s.btnRojoTxt]}>A equipo Valera</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Reasignar de inmobiliaria */}
      <Modal visible={!!modalReasignar} transparent animationType="slide" onRequestClose={() => setModalReasignar(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>
              Cambiar de agencia a {modalReasignar?.nombre ?? modalReasignar?.email}
            </Text>
            <InmobiliariaPicker value={nuevaInmob} onChange={setNuevaInmob} />
            <TouchableOpacity
              style={[s.btnGuardar, !nuevaInmob && { opacity: 0.5 }]}
              onPress={confirmarReasignar}
              disabled={!nuevaInmob}
            >
              <Text style={s.btnGuardarText}>Confirmar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalReasignar(null)}>
              <Text style={[s.btnCancelarText, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Convertir a equipo Valera */}
      <Modal visible={!!modalConvertir} transparent animationType="slide" onRequestClose={() => setModalConvertir(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitulo, { color: c.text }]}>
              Devolver a {modalConvertir?.nombre ?? modalConvertir?.email} al equipo Valera
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: c.textMute, marginBottom: 10 }}>
              Deja de ver el catálogo y los clientes de {modalConvertir?.inmobiliaria_nombre}. Elige su nuevo rol:
            </Text>
            {ROLES_VALERA.map(r => (
              <TouchableOpacity key={r.value} style={s.opcionRol} onPress={() => confirmarConvertir(r.value)}>
                <Text style={[s.opcionRolTxt, { color: c.text }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalConvertir(null)}>
              <Text style={[s.btnCancelarText, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  titulo: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 12.5, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14 },
  seccionTitulo: { fontSize: 13, fontWeight: '800', paddingVertical: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 13 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 14.5, fontWeight: '800', flexShrink: 1 },
  email: { fontSize: 12, marginTop: 2 },
  rolBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  rolTitular: { backgroundColor: '#ece6f8' },
  rolAgente: { backgroundColor: '#f3eefb' },
  rolBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#5e35b1' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 230 },
  btnChico: { borderWidth: 1, borderColor: '#5e35b1', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 },
  btnChicoTxt: { color: '#5e35b1', fontSize: 11, fontWeight: '700' },
  btnRojo: { borderColor: '#c0392b' },
  btnRojoTxt: { color: '#c0392b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 4 },
  modalTitulo: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  opcionRol: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#80808022' },
  opcionRolTxt: { fontSize: 14.5, fontWeight: '600' },
  btnGuardar: { backgroundColor: '#5e35b1', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  btnGuardarText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  btnCancelar: { paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { fontSize: 14 },
})
