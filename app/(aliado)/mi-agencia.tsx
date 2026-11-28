// Solo para el TITULAR (aliado_admin). Dos cosas que un agente no puede
// hacer: tocar el logo/sitio de su agencia, e invitar a su propia gente.
// Todo lo demás de `inmobiliarias` (nombre, teléfono, correo) sigue siendo
// solo de un admin de Valera — la base lo exige con un trigger, no esta
// pantalla, así que aunque alguien se saltara esto no lograría nada.
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Platform, Alert, Modal,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { calcularCrmMetricas, type CrmMetricas } from '../../lib/crmMetricas'
import CrmMetricasPanel from '../../components/CrmMetricasPanel'

type Miembro = { id: string; nombre: string | null; role: string; created_at: string }
type Estadisticas = { disponibles: number; vendidas: number; rentadas: number; publicaciones: number; vistas: number }

function generarPassword(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#%'
  const todos = mayus + minus + nums + esp
  let pwd =
    mayus[Math.floor(Math.random() * mayus.length)] +
    minus[Math.floor(Math.random() * minus.length)] +
    nums[Math.floor(Math.random() * nums.length)] +
    esp[Math.floor(Math.random() * esp.length)]
  for (let i = 4; i < 12; i++) pwd += todos[Math.floor(Math.random() * todos.length)]
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function MiAgencia() {
  const c = useColors()
  const [inmobiliariaId, setInmobiliariaId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [sitioWeb, setSitioWeb] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  const [equipo, setEquipo] = useState<Miembro[]>([])
  const [limite, setLimite] = useState(3)
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string } | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const [crm, setCrm] = useState<CrmMetricas | null>(null)

  const [modalInvitar, setModalInvitar] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invitando, setInvitando] = useState(false)
  const [credenciales, setCredenciales] = useState<{ email: string; password: string } | null>(null)

  const cargar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/(auth)/login'); return }
    const { data: perfil } = await supabase
      .from('profiles').select('role, inmobiliaria_id').eq('id', session.user.id).single()
    if (perfil?.role !== 'aliado_admin') { router.replace('/(aliado)/mis-propiedades'); return }
    if (!perfil.inmobiliaria_id) { setCargando(false); return }
    setInmobiliariaId(perfil.inmobiliaria_id)

    const [{ data: inm }, { data: eq }, { data: est }] = await Promise.all([
      supabase.from('inmobiliarias').select('logo_url, sitio_web').eq('id', perfil.inmobiliaria_id).single(),
      supabase.rpc('mi_equipo_aliado'),
      supabase.rpc('estadisticas_aliado'),
    ])
    setLogoUrl(inm?.logo_url ?? '')
    setSitioWeb(inm?.sitio_web ?? '')
    setEquipo((eq?.equipo ?? []) as Miembro[])
    setLimite(eq?.limite ?? 3)
    setStats((est ?? null) as Estadisticas | null)
    // RLS (clientes_select_aliado_titular) acota esto a los clientes de
    // responsables de SU inmobiliaria — nunca a los nuestros.
    calcularCrmMetricas(null, 'Toda la agencia').then(setCrm).catch(() => {})
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function guardarPerfil() {
    if (!inmobiliariaId) return
    setGuardando(true)
    try {
      const { error } = await supabase.from('inmobiliarias')
        .update({ logo_url: logoUrl.trim() || null, sitio_web: sitioWeb.trim() || null })
        .eq('id', inmobiliariaId)
      if (error) throw error
      alerta('✓ Guardado')
    } catch (e: any) {
      alerta('Error: ' + (e?.message ?? 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarRenombrar() {
    if (!renombrando || !renombrando.nombre.trim()) return
    const { id, nombre } = renombrando
    setEquipo(prev => prev.map(m => m.id === id ? { ...m, nombre } : m))
    setRenombrando(null)
    const { error } = await supabase.rpc('renombrar_miembro_aliado', { p_id: id, p_nombre: nombre.trim() })
    if (error) { alerta('Error: ' + error.message); cargar() }
  }

  function eliminarMiembro(m: Miembro) {
    const confirmar = async () => {
      setEliminandoId(m.id)
      const { data, error } = await supabase.functions.invoke('eliminar-aliado-agente', { body: { userId: m.id } })
      setEliminandoId(null)
      if (error || data?.error) { alerta('Error: ' + (data?.error ?? error?.message ?? 'No se pudo eliminar.')); return }
      setEquipo(prev => prev.filter(x => x.id !== m.id))
    }
    const msg = `¿Eliminar a ${m.nombre ?? 'este usuario'}? Esta acción no se puede deshacer.`
    if (Platform.OS === 'web') { if (window.confirm(msg)) confirmar() }
    else Alert.alert('Eliminar', msg, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: confirmar }])
  }

  function abrirInvitar() {
    setNombre('')
    setEmail('')
    setPassword(generarPassword())
    setCredenciales(null)
    setModalInvitar(true)
  }

  async function invitar() {
    if (!nombre.trim() || !email.trim()) { alerta('Falta el nombre o el correo.'); return }
    setInvitando(true)
    try {
      const { data, error } = await supabase.functions.invoke('crear-aliado-agente', {
        body: { email: email.trim(), password, nombre: nombre.trim() },
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'No se pudo invitar.')
      setCredenciales({ email: email.trim(), password })
      cargar()
    } catch (e: any) {
      alerta('Error: ' + (e?.message ?? 'No se pudo invitar.'))
    } finally {
      setInvitando(false)
    }
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color={c.text} /></View>
  }

  const cupoLleno = equipo.length >= limite

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={[s.titulo, { color: c.text }]}>Mi agencia</Text>

      {stats && (
        <View style={s.statsGrid}>
          {[
            { icono: 'home' as const, color: '#1a6470', num: stats.disponibles + stats.vendidas + stats.rentadas, lbl: 'Han publicado' },
            { icono: 'checkmark-done' as const, color: '#2e7d32', num: stats.vendidas + stats.rentadas, lbl: 'Vendidas/rentadas' },
            { icono: 'people' as const, color: '#5e35b1', num: crm?.totalLeads ?? 0, lbl: 'Clientes agregados' },
            { icono: 'eye' as const, color: '#c9a84c', num: stats.vistas, lbl: 'Vistas de tu catálogo' },
          ].map((b, i) => (
            <View key={i} style={[s.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[s.statIcono, { backgroundColor: b.color + '22' }]}>
                <Ionicons name={b.icono} size={16} color={b.color} />
              </View>
              <Text style={[s.statNum, { color: c.text }]}>{b.num}</Text>
              <Text style={[s.statLbl, { color: c.textSub }]}>{b.lbl}</Text>
            </View>
          ))}
        </View>
      )}

      {crm && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitulo, { color: c.text }]}>Estado de seguimiento</Text>
          <Text style={[s.cardSub, { color: c.textSub, marginBottom: 10 }]}>
            En qué etapa va cada cliente, de toda tu agencia.
          </Text>
          <CrmMetricasPanel metricas={crm} c={c} />
        </View>
      )}

      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.cardTitulo, { color: c.text }]}>Marca</Text>
        <Text style={[s.cardSub, { color: c.textSub }]}>
          Lo que ven tus agentes en la cabecera de su app.
        </Text>
        <Text style={[s.label, { color: c.textSub }]}>URL del logo</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          value={logoUrl} onChangeText={setLogoUrl}
          placeholder="https://…" placeholderTextColor={c.placeholder} autoCapitalize="none"
        />
        <Text style={[s.label, { color: c.textSub }]}>Sitio web</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          value={sitioWeb} onChangeText={setSitioWeb}
          placeholder="https://…" placeholderTextColor={c.placeholder} autoCapitalize="none"
        />
        <TouchableOpacity style={[s.btn, guardando && { opacity: 0.6 }]} onPress={guardarPerfil} disabled={guardando}>
          {guardando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnTxt}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardTitulo, { color: c.text }]}>Tu equipo</Text>
            <Text style={[s.cardSub, { color: c.textSub }]}>{equipo.length} de {limite} cuentas</Text>
          </View>
          <TouchableOpacity
            style={[s.btnChico, cupoLleno && { opacity: 0.4 }]}
            onPress={abrirInvitar}
            disabled={cupoLleno}
          >
            <Ionicons name="person-add-outline" size={14} color="#fff" />
            <Text style={s.btnChicoTxt}>Invitar</Text>
          </TouchableOpacity>
        </View>
        {cupoLleno && (
          <Text style={[s.cardSub, { color: '#c0392b', marginTop: 2 }]}>
            Alcanzaste el límite de tu plan. Pide a Valera que lo amplíe.
          </Text>
        )}
        {equipo.map(m => (
          <View key={m.id} style={[s.fila, { borderColor: c.border }]}>
            {renombrando?.id === m.id ? (
              <TextInput
                style={[s.renombrarInput, { color: c.text, borderColor: c.border }]}
                value={renombrando.nombre}
                onChangeText={v => setRenombrando({ id: m.id, nombre: v })}
                autoFocus
                onSubmitEditing={confirmarRenombrar}
              />
            ) : (
              <Text style={[s.filaNombre, { color: c.text }]}>{m.nombre ?? 'Sin nombre'}</Text>
            )}
            <Text style={[s.filaRol, { color: c.textSub }]}>
              {m.role === 'aliado_admin' ? 'Titular' : 'Agente'}
            </Text>
            {m.role !== 'aliado_admin' && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {renombrando?.id === m.id ? (
                  <TouchableOpacity onPress={confirmarRenombrar} style={s.filaBtn}>
                    <Ionicons name="checkmark" size={16} color="#2e7d32" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setRenombrando({ id: m.id, nombre: m.nombre ?? '' })} style={s.filaBtn}>
                    <Ionicons name="pencil-outline" size={15} color={c.textSub} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => eliminarMiembro(m)} style={s.filaBtn}>
                  <Ionicons name="trash-outline" size={15} color="#c0392b" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      <Modal visible={modalInvitar} transparent animationType="fade" onRequestClose={() => setModalInvitar(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: c.card }]}>
            {credenciales ? (
              <>
                <Text style={[s.modalTitulo, { color: c.text }]}>✓ Cuenta creada</Text>
                <Text style={[s.cardSub, { color: c.textSub, marginBottom: 10 }]}>
                  Dale estos datos a tu agente — no se vuelven a mostrar.
                </Text>
                <Text style={[s.credLinea, { color: c.text }]}>📧 {credenciales.email}</Text>
                <Text style={[s.credLinea, { color: c.text }]}>🔑 {credenciales.password}</Text>
                <TouchableOpacity style={s.btn} onPress={() => setModalInvitar(false)}>
                  <Text style={s.btnTxt}>Listo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[s.modalTitulo, { color: c.text }]}>Invitar agente</Text>
                <TextInput
                  style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                  value={nombre} onChangeText={setNombre} placeholder="Nombre" placeholderTextColor={c.placeholder}
                />
                <TextInput
                  style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                  value={email} onChangeText={setEmail} placeholder="Correo" placeholderTextColor={c.placeholder}
                  autoCapitalize="none" keyboardType="email-address"
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.credLinea, { color: c.textSub, flex: 1 }]}>🔑 {password}</Text>
                  <TouchableOpacity onPress={() => setPassword(generarPassword())}>
                    <Ionicons name="refresh" size={18} color={c.textSub} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[s.btn, invitando && { opacity: 0.6 }]} onPress={invitar} disabled={invitando}>
                  {invitando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnTxt}>Crear cuenta</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setModalInvitar(false)}>
                  <Text style={[s.cancelar, { color: c.textSub }]}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 21, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  statCard: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 },
  statIcono: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 19, fontWeight: '900' },
  statLbl: { fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardTitulo: { fontSize: 15, fontWeight: '800' },
  cardSub: { fontSize: 12.5 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btn: { backgroundColor: '#5e35b1', borderRadius: 9, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnChico: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#5e35b1', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7,
  },
  btnChicoTxt: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  filaNombre: { fontSize: 13.5, fontWeight: '700', flex: 1 },
  filaRol: { fontSize: 12 },
  filaBtn: { padding: 4 },
  renombrarInput: {
    flex: 1, fontSize: 13.5, fontWeight: '700', borderWidth: 1, borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 20, gap: 8 },
  modalTitulo: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  credLinea: { fontSize: 14, fontWeight: '700', paddingVertical: 4 },
  cancelar: { textAlign: 'center', fontSize: 13, paddingVertical: 6 },
})
