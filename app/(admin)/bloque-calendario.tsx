import { useCallback, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Modal, Switch,
} from 'react-native'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

// Paleta oscura para empatar con el detalle del bloque.
const BG = '#0d1b2a', CARD = '#12283b', BORDER = '#1e3448'
const TEXT = '#e8f0f4', SUB = '#7a9ab5', MUTE = '#556a7a', GOLD = '#c9a84c'

type Metricas = { reunion: boolean | null; cita: boolean; cliente: boolean; uso: boolean; publico: boolean }
type Persona = { user_id: string; nombre: string | null; role: string; dias: Record<string, Metricas> }

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pad = (n: number) => String(n).padStart(2, '0')
const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Lunes de la semana (offset en semanas desde la actual).
function lunesDeSemana(offset: number): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow + offset * 7)
  return d
}

// Emojis de lo que pasó ese día (vacío = nada).
function emojisDe(m: Metricas | undefined): string[] {
  if (!m) return []
  const out: string[] = []
  if (m.reunion === true) out.push('🤝')
  else if (m.reunion === false) out.push('❌')
  if (m.cita) out.push('📅')
  if (m.cliente) out.push('👥')
  if (m.uso || m.publico) out.push('📱')
  return out
}

export default function BloqueCalendario() {
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const [data, setData] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [semana, setSemana] = useState(0)              // offset de semana
  const [personaSel, setPersonaSel] = useState<Persona | null>(null)  // vista mensual
  const [mesData, setMesData] = useState<Persona | null>(null)
  const [mes, setMes] = useState(0)                    // offset de mes
  // Pasar lista
  const [listaOpen, setListaOpen] = useState(false)
  const [listaFecha, setListaFecha] = useState<Date>(new Date())
  const [huboReunion, setHuboReunion] = useState(false)
  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const dias = useMemo(() => {
    const lun = lunesDeSemana(semana)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(lun); d.setDate(lun.getDate() + i); return d })
  }, [semana])

  const cargarSemana = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const desde = fmtISO(dias[0]), hasta = fmtISO(dias[6])
      const { data: d } = await supabase.rpc('bloque_calendario', { p_bloque_id: id, p_desde: desde, p_hasta: hasta })
      setData((d ?? []) as Persona[])
    } finally { setLoading(false) }
  }, [id, dias])

  useFocusEffect(useCallback(() => { cargarSemana() }, [cargarSemana]))

  // ── Vista mensual de una persona ──────────────────────────────
  const rangoMes = useMemo(() => {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + mes)
    const ini = new Date(base.getFullYear(), base.getMonth(), 1)
    const fin = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return { ini, fin }
  }, [mes])

  const abrirPersona = useCallback(async (p: Persona, offsetMes = 0) => {
    setPersonaSel(p); setMes(offsetMes); setMesData(null)
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + offsetMes)
    const ini = fmtISO(new Date(base.getFullYear(), base.getMonth(), 1))
    const fin = fmtISO(new Date(base.getFullYear(), base.getMonth() + 1, 0))
    const { data: d } = await supabase.rpc('bloque_calendario', { p_bloque_id: id, p_desde: ini, p_hasta: fin, p_user_id: p.user_id })
    setMesData(((d ?? [])[0] ?? null) as Persona | null)
  }, [id])

  const cambiarMes = useCallback(async (delta: number) => {
    if (!personaSel) return
    await abrirPersona(personaSel, mes + delta)
  }, [personaSel, mes, abrirPersona])

  // ── Pasar lista ───────────────────────────────────────────────
  async function abrirLista(fecha: Date) {
    setListaFecha(fecha); setListaOpen(true)
    const iso = fmtISO(fecha)
    // ¿hubo reunión ese día? + quiénes están presentes (según la data ya cargada si aplica)
    const { data: reu } = await supabase.rpc('reuniones_bloque', { p_bloque_id: id, p_desde: iso, p_hasta: iso })
    const hubo = Array.isArray(reu) && reu.includes(iso)
    setHuboReunion(hubo)
    // Presentes: recargar el día puntual para reflejar lo guardado
    const { data: dd } = await supabase.rpc('bloque_calendario', { p_bloque_id: id, p_desde: iso, p_hasta: iso })
    const pres = new Set<string>()
    for (const p of (dd ?? []) as Persona[]) if (p.dias?.[iso]?.reunion === true) pres.add(p.user_id)
    setPresentes(pres)
  }

  async function toggleHubo(v: boolean) {
    setHuboReunion(v)
    setGuardando(true)
    try {
      await supabase.rpc('marcar_reunion_bloque', { p_bloque_id: id, p_fecha: fmtISO(listaFecha), p_hubo: v })
      if (!v) setPresentes(new Set())
    } finally { setGuardando(false) }
  }

  async function togglePresente(userId: string) {
    const iso = fmtISO(listaFecha)
    const nuevo = new Set(presentes)
    const presente = !nuevo.has(userId)
    presente ? nuevo.add(userId) : nuevo.delete(userId)
    setPresentes(nuevo)
    if (presente && !huboReunion) setHuboReunion(true)
    await supabase.rpc('marcar_asistencia_bloque', { p_user_id: userId, p_fecha: iso, p_asistio: presente })
  }

  async function marcarTodos() {
    const iso = fmtISO(listaFecha)
    setGuardando(true)
    try {
      await supabase.rpc('marcar_reunion_bloque', { p_bloque_id: id, p_fecha: iso, p_hubo: true })
      setHuboReunion(true)
      for (const p of data) await supabase.rpc('marcar_asistencia_bloque', { p_user_id: p.user_id, p_fecha: iso, p_asistio: true })
      setPresentes(new Set(data.map(p => p.user_id)))
    } finally { setGuardando(false) }
  }

  function cerrarLista() { setListaOpen(false); cargarSemana() }

  // ── Render ────────────────────────────────────────────────────
  const rangoTxt = `${dias[0].getDate()} ${dias[0].toLocaleDateString('es-MX', { month: 'short' })} – ${dias[6].getDate()} ${dias[6].toLocaleDateString('es-MX', { month: 'short' })}`

  return (
    <View style={st.page}>
      <View style={st.head}>
        <Text style={st.title} numberOfLines={1}>📅 {nombre ?? 'Bloque'}</Text>
        <Text style={st.leyenda}>🤝 asistió · ❌ faltó · 📅 cita · 👥 cliente · 📱 usó/publicó</Text>
      </View>

      {/* Navegación de semana + pasar lista */}
      <View style={st.nav}>
        <TouchableOpacity onPress={() => setSemana(s => s - 1)} style={st.navBtn}><Text style={st.navBtnTxt}>‹</Text></TouchableOpacity>
        <Text style={st.navTxt}>{semana === 0 ? 'Esta semana' : rangoTxt}</Text>
        <TouchableOpacity onPress={() => setSemana(s => s + 1)} style={st.navBtn}><Text style={st.navBtnTxt}>›</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={st.listaBtn} onPress={() => abrirLista(new Date())}>
        <Text style={st.listaBtnTxt}>🤝 Pasar lista de reunión</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 8 }}>
          <View>
            {/* Encabezado de días */}
            <View style={st.row}>
              <View style={[st.nameCell, st.headCell]}><Text style={st.headTxt}>Persona</Text></View>
              {dias.map((d, i) => (
                <View key={i} style={[st.dayCell, st.headCell]}>
                  <Text style={st.headTxt}>{DIAS_CORTOS[i]}</Text>
                  <Text style={st.headSub}>{d.getDate()}</Text>
                </View>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator>
              {data.map(p => (
                <View key={p.user_id} style={st.row}>
                  <TouchableOpacity style={st.nameCell} onPress={() => abrirPersona(p)}>
                    <Text style={st.nameTxt} numberOfLines={1}>{p.nombre ?? 'Usuario'}</Text>
                    <Text style={st.verMes}>ver mes ›</Text>
                  </TouchableOpacity>
                  {dias.map((d, i) => {
                    const em = emojisDe(p.dias?.[fmtISO(d)])
                    return (
                      <View key={i} style={st.dayCell}>
                        <Text style={st.cellEmojis}>{em.join('')}</Text>
                      </View>
                    )
                  })}
                </View>
              ))}
              {data.length === 0 && <Text style={st.vacio}>Este bloque no tiene miembros.</Text>}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {/* ── Modal: vista mensual por persona ── */}
      <Modal visible={!!personaSel} transparent animationType="slide" onRequestClose={() => setPersonaSel(null)}>
        <View style={st.ov}>
          <View style={st.box}>
            <View style={st.boxHead}>
              <Text style={st.boxTitle} numberOfLines={1}>{personaSel?.nombre ?? ''}</Text>
              <TouchableOpacity onPress={() => setPersonaSel(null)}><Text style={st.cerrar}>✕</Text></TouchableOpacity>
            </View>
            <View style={st.nav}>
              <TouchableOpacity onPress={() => cambiarMes(-1)} style={st.navBtn}><Text style={st.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={st.navTxt}>{rangoMes.ini.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => cambiarMes(1)} style={st.navBtn}><Text style={st.navBtnTxt}>›</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440 }}>
              {!mesData ? <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} /> : (() => {
                const diasMes: Date[] = []
                for (let d = new Date(rangoMes.ini); d <= rangoMes.fin; d.setDate(d.getDate() + 1)) diasMes.push(new Date(d))
                return diasMes.map(d => {
                  const em = emojisDe(mesData.dias?.[fmtISO(d)])
                  return (
                    <View key={fmtISO(d)} style={st.mesRow}>
                      <Text style={st.mesDia}>{DIAS_CORTOS[(d.getDay() + 6) % 7]} {d.getDate()}</Text>
                      <Text style={st.mesEmojis}>{em.length ? em.join('  ') : '·'}</Text>
                    </View>
                  )
                })
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal: pasar lista ── */}
      <Modal visible={listaOpen} transparent animationType="slide" onRequestClose={cerrarLista}>
        <View style={st.ov}>
          <View style={st.box}>
            <View style={st.boxHead}>
              <Text style={st.boxTitle}>🤝 Pasar lista</Text>
              <TouchableOpacity onPress={cerrarLista}><Text style={st.cerrar}>✕</Text></TouchableOpacity>
            </View>
            <View style={st.nav}>
              <TouchableOpacity onPress={() => abrirLista(new Date(listaFecha.getTime() - 86400000))} style={st.navBtn}><Text style={st.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={st.navTxt}>{listaFecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              <TouchableOpacity onPress={() => abrirLista(new Date(listaFecha.getTime() + 86400000))} style={st.navBtn}><Text style={st.navBtnTxt}>›</Text></TouchableOpacity>
            </View>
            <View style={st.huboRow}>
              <Text style={st.huboTxt}>¿Hubo reunión este día?</Text>
              <Switch value={huboReunion} onValueChange={toggleHubo} disabled={guardando} trackColor={{ true: '#1a6470' }} />
            </View>
            {huboReunion ? (
              <>
                <View style={st.listaTools}>
                  <Text style={st.contador}>{presentes.size}/{data.length} asistieron</Text>
                  <TouchableOpacity onPress={marcarTodos} disabled={guardando}><Text style={st.marcarTodos}>Marcar todos</Text></TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 360 }}>
                  {data.map(p => {
                    const on = presentes.has(p.user_id)
                    return (
                      <TouchableOpacity key={p.user_id} style={st.miembro} onPress={() => togglePresente(p.user_id)}>
                        <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkTxt}>✓</Text>}</View>
                        <Text style={st.miembroNom} numberOfLines={1}>{p.nombre ?? 'Usuario'}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </>
            ) : (
              <Text style={st.sinReunion}>Si no hubo reunión, este día no cuenta para nadie.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: TEXT, fontSize: 18, fontWeight: '900' },
  leyenda: { color: MUTE, fontSize: 11, marginTop: 4 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 8 },
  navBtn: { paddingHorizontal: 14, paddingVertical: 4 },
  navBtnTxt: { color: GOLD, fontSize: 26, fontWeight: '800' },
  navTxt: { color: TEXT, fontSize: 14, fontWeight: '700', minWidth: 140, textAlign: 'center', textTransform: 'capitalize' },
  listaBtn: { marginHorizontal: 12, marginBottom: 8, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  listaBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: BORDER },
  headCell: { backgroundColor: CARD },
  headTxt: { color: SUB, fontSize: 11, fontWeight: '800' },
  headSub: { color: MUTE, fontSize: 10 },
  nameCell: { width: 116, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  nameTxt: { color: TEXT, fontSize: 12, fontWeight: '700' },
  verMes: { color: GOLD, fontSize: 10, marginTop: 2 },
  dayCell: { width: 48, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: BORDER, paddingVertical: 4 },
  cellEmojis: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  vacio: { color: MUTE, textAlign: 'center', padding: 24 },
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  box: { backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '86%', borderTopWidth: 1, borderColor: BORDER },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxTitle: { color: TEXT, fontSize: 17, fontWeight: '900', flex: 1 },
  cerrar: { color: SUB, fontSize: 20, paddingLeft: 12 },
  mesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  mesDia: { color: SUB, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  mesEmojis: { color: TEXT, fontSize: 15 },
  huboRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  huboTxt: { color: TEXT, fontSize: 15, fontWeight: '700' },
  listaTools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  contador: { color: SUB, fontSize: 13, fontWeight: '700' },
  marcarTodos: { color: GOLD, fontSize: 13, fontWeight: '800' },
  miembro: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: MUTE, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  miembroNom: { color: TEXT, fontSize: 14, flex: 1 },
  sinReunion: { color: MUTE, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
})
