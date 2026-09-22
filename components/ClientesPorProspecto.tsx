// Mini panel para el tablero de citas (admin/gerencia): elige un prospecto y
// ve TODOS sus clientes registrados (desde la tabla clientes, no solo los que
// tienen cita en el tablero). Autocontenido; no modifica nada del tablero.
import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { normalizar } from '../lib/texto'
import { useColors } from '../lib/ThemeContext'

type Prosp = { id: string; nombre: string | null; role: string }
type Cli = { id: string; nombre: string | null; telefono: string | null; estado: string | null }

const ROLES = ['prospectador', 'prospectador_plus', 'nuevo', 'asesor']
const ESTADO_LBL: Record<string, string> = {
  primer_contacto: 'Primer contacto', por_perfilar: 'Por perfilar', no_contesta: 'No contesta',
  cita_por_agendar: 'Cita x agendar', cita_a_futuro: 'Cita a futuro', cita_agendada: 'Cita agendada',
  seguimiento_cierre: 'Seg. cierre', compro: 'Compró', descartado: 'Descartado',
}

export default function ClientesPorProspecto() {
  const c = useColors()
  const [abierto, setAbierto] = useState(false)
  const [prospectadores, setProspectadores] = useState<Prosp[]>([])
  const [sel, setSel] = useState<Prosp | null>(null)
  const [clientes, setClientes] = useState<Cli[]>([])
  const [cargandoProsp, setCargandoProsp] = useState(false)
  const [cargandoCli, setCargandoCli] = useState(false)
  const [buscaProsp, setBuscaProsp] = useState('')
  const [buscaCli, setBuscaCli] = useState('')

  const abrir = useCallback(async () => {
    setAbierto(true); setSel(null); setClientes([]); setBuscaProsp(''); setBuscaCli('')
    if (prospectadores.length === 0) {
      setCargandoProsp(true)
      const { data } = await supabase.from('profiles').select('id, nombre, role')
        .in('role', ROLES).order('nombre')
      setProspectadores(((data ?? []) as Prosp[]).filter(p => p.nombre?.trim()))
      setCargandoProsp(false)
    }
  }, [prospectadores.length])

  const elegir = useCallback(async (p: Prosp) => {
    setSel(p); setBuscaCli(''); setCargandoCli(true)
    const { data } = await supabase.from('clientes')
      .select('id, nombre, telefono, estado').eq('responsable_id', p.id).order('nombre')
    setClientes((data ?? []) as Cli[])
    setCargandoCli(false)
  }, [])

  const cerrar = () => setAbierto(false)

  const qP = normalizar(buscaProsp)
  const prospFiltrados = qP ? prospectadores.filter(p => normalizar(p.nombre).includes(qP)) : prospectadores
  const qC = normalizar(buscaCli)
  const qCDig = buscaCli.replace(/\D/g, '')
  const cliFiltrados = clientes.filter(cl =>
    (!qC || normalizar(cl.nombre).includes(qC)) &&
    (qCDig.length === 0 || (cl.telefono ?? '').replace(/\D/g, '').includes(qCDig))
  )

  return (
    <>
      <TouchableOpacity style={s.trigger} onPress={abrir} accessibilityLabel="Clientes por prospecto">
        <Ionicons name="person-circle-outline" size={18} color="#1a6470" />
        {Platform.OS === 'web' && <Text style={s.triggerTxt}>Prospecto</Text>}
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={cerrar} statusBarTranslucent>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: c.card }]}>
            <View style={s.handle} />
            {/* Encabezado */}
            <View style={s.head}>
              {sel && (
                <TouchableOpacity onPress={() => { setSel(null); setClientes([]) }} style={{ paddingRight: 8 }}>
                  <Ionicons name="arrow-back" size={22} color={c.text} />
                </TouchableOpacity>
              )}
              <Text style={[s.titulo, { color: c.text }]} numberOfLines={1}>
                {sel ? sel.nombre : 'Clientes por prospecto'}
              </Text>
              <TouchableOpacity onPress={cerrar}><Ionicons name="close" size={22} color={c.textMute} /></TouchableOpacity>
            </View>

            {!sel ? (
              <>
                <View style={[s.buscaRow, { borderColor: c.border, backgroundColor: c.bg }]}>
                  <Ionicons name="search-outline" size={15} color={c.textMute} />
                  <TextInput style={[s.buscaInp, { color: c.text }]} value={buscaProsp} onChangeText={setBuscaProsp}
                    placeholder="Buscar prospecto…" placeholderTextColor={c.placeholder} />
                </View>
                {cargandoProsp ? <ActivityIndicator color="#1a6470" style={{ marginTop: 20 }} /> : (
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {prospFiltrados.length === 0 ? <Text style={[s.vacio, { color: c.textMute }]}>Sin prospectos.</Text> :
                      prospFiltrados.map(p => (
                        <TouchableOpacity key={p.id} style={[s.row, { borderColor: c.border }]} onPress={() => elegir(p)} activeOpacity={0.7}>
                          <View style={[s.avatar, { backgroundColor: c.bg }]}><Text style={s.avatarTxt}>{(p.nombre ?? '?').trim().charAt(0).toUpperCase()}</Text></View>
                          <Text style={[s.rowNombre, { color: c.text }]} numberOfLines={1}>{p.nombre}</Text>
                          <Ionicons name="chevron-forward" size={16} color={c.textMute} />
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                )}
              </>
            ) : (
              <>
                <View style={[s.buscaRow, { borderColor: c.border, backgroundColor: c.bg }]}>
                  <Ionicons name="search-outline" size={15} color={c.textMute} />
                  <TextInput style={[s.buscaInp, { color: c.text }]} value={buscaCli} onChangeText={setBuscaCli}
                    placeholder="Buscar cliente por nombre o teléfono…" placeholderTextColor={c.placeholder} />
                </View>
                {cargandoCli ? <ActivityIndicator color="#1a6470" style={{ marginTop: 20 }} /> : (
                  <>
                    <Text style={[s.conteo, { color: c.textMute }]}>{cliFiltrados.length} cliente{cliFiltrados.length !== 1 ? 's' : ''}</Text>
                    <ScrollView keyboardShouldPersistTaps="handled">
                      {cliFiltrados.length === 0 ? <Text style={[s.vacio, { color: c.textMute }]}>Sin clientes registrados para este prospecto.</Text> :
                        cliFiltrados.map(cl => (
                          <TouchableOpacity key={cl.id} style={[s.row, { borderColor: c.border }]}
                            onPress={() => { cerrar(); router.push(`/(admin)/detalle-cliente?id=${cl.id}` as any) }} activeOpacity={0.7}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[s.rowNombre, { color: c.text }]} numberOfLines={1}>{cl.nombre ?? 'Sin nombre'}</Text>
                              <Text style={[s.rowSub, { color: c.textMute }]} numberOfLines={1}>
                                {cl.telefono ?? 'Sin teléfono'}{cl.estado ? ` · ${ESTADO_LBL[cl.estado] ?? cl.estado}` : ''}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={c.textMute} />
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1a6470', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  triggerTxt: { color: '#1a6470', fontWeight: '700', fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24, height: '82%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  titulo: { flex: 1, fontSize: 17, fontWeight: '900' },
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8 },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  conteo: { fontSize: 11.5, fontWeight: '700', marginBottom: 6, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '800', color: '#1a6470' },
  rowNombre: { flex: 1, fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  vacio: { fontSize: 13.5, textAlign: 'center', paddingVertical: 24 },
})
