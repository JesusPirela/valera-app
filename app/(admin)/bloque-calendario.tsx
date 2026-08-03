import { useCallback, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Modal,
} from 'react-native'
import { useLocalSearchParams, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

// Paleta oscura para empatar con el detalle del bloque.
const BG = '#0d1b2a', CARD = '#12283b', CARD2 = '#152f45', BORDER = '#1e3448'
const TEXT = '#e8f0f4', SUB = '#8fb0cc', MUTE = '#5f7690', GOLD = '#c9a84c'
const ON = '#22c55e', ONBG = '#0f2f1e'

type Metricas = { reunion: boolean | null; cita: boolean; cliente: boolean; uso: boolean; publico: boolean }
type Persona = { user_id: string; nombre: string | null; role: string; dias: Record<string, Metricas> }

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const pad = (n: number) => String(n).padStart(2, '0')
const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function lunesDeSemana(offset: number): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow + offset * 7)
  return d
}

// Indicadores activos de un día (para el grid semanal / mensual).
function iconosDe(m: Metricas | undefined): { e: string }[] {
  if (!m) return []
  const out: { e: string }[] = []
  if (m.reunion === true) out.push({ e: '🤝' })
  else if (m.reunion === false) out.push({ e: '❌' })
  if (m.cita) out.push({ e: '📅' })
  if (m.cliente) out.push({ e: '👥' })
  if (m.uso || m.publico) out.push({ e: '📱' })
  return out
}

// ── Pill de una métrica (checklist) ─────────────────────────────
function Pill({ icon, label, estado, onPress }: {
  icon: string; label: string; estado: 'si' | 'no' | 'na'; onPress?: () => void
}) {
  const done = estado === 'si', na = estado === 'na'
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={[pl.pill, done && pl.pillOn, na && pl.pillNa, !!onPress && !done && pl.pillTap]}
    >
      <Text style={pl.icon}>{icon}</Text>
      <Text style={[pl.label, done && pl.labelOn, na && pl.labelNa]} numberOfLines={1}>{label}</Text>
      <Text style={[pl.check, done && pl.checkOn]}>{na ? '–' : done ? '✓' : '○'}</Text>
    </TouchableOpacity>
  )
}

export default function BloqueCalendario() {
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>()
  const [vista, setVista] = useState<'checklist' | 'semana'>('checklist')
  const [loading, setLoading] = useState(true)

  // Checklist del día
  const [fecha, setFecha] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [dia, setDia] = useState<Persona[]>([])
  const [huboReunion, setHuboReunion] = useState(false)

  // Semana
  const [semana, setSemana] = useState(0)
  const [sem, setSem] = useState<Persona[]>([])

  // Mensual por persona
  const [personaSel, setPersonaSel] = useState<Persona | null>(null)
  const [mesData, setMesData] = useState<Persona | null>(null)
  const [mes, setMes] = useState(0)

  const diasSemana = useMemo(() => {
    const lun = lunesDeSemana(semana)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(lun); d.setDate(lun.getDate() + i); return d })
  }, [semana])

  const cargarDia = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const iso = fmtISO(fecha)
      const [{ data: d }, { data: reu }] = await Promise.all([
        supabase.rpc('bloque_calendario', { p_bloque_id: id, p_desde: iso, p_hasta: iso }),
        supabase.rpc('reuniones_bloque', { p_bloque_id: id, p_desde: iso, p_hasta: iso }),
      ])
      setDia((d ?? []) as Persona[])
      setHuboReunion(Array.isArray(reu) && reu.includes(iso))
    } finally { setLoading(false) }
  }, [id, fecha])

  const cargarSemana = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { data: d } = await supabase.rpc('bloque_calendario', {
        p_bloque_id: id, p_desde: fmtISO(diasSemana[0]), p_hasta: fmtISO(diasSemana[6]),
      })
      setSem((d ?? []) as Persona[])
    } finally { setLoading(false) }
  }, [id, diasSemana])

  useFocusEffect(useCallback(() => {
    vista === 'checklist' ? cargarDia() : cargarSemana()
  }, [vista, cargarDia, cargarSemana]))

  // ── Acciones de reunión / asistencia ──────────────────────────
  async function toggleHubo(v: boolean) {
    setHuboReunion(v)
    await supabase.rpc('marcar_reunion_bloque', { p_bloque_id: id, p_fecha: fmtISO(fecha), p_hubo: v })
    if (!v) cargarDia()
  }
  async function toggleAsistio(p: Persona) {
    const isoF = fmtISO(fecha)
    const actual = p.dias?.[isoF]?.reunion === true
    setDia(prev => prev.map(x => x.user_id === p.user_id
      ? { ...x, dias: { ...x.dias, [isoF]: { ...(x.dias?.[isoF] ?? {} as Metricas), reunion: !actual } } } : x))
    if (!huboReunion) setHuboReunion(true)
    await supabase.rpc('marcar_asistencia_bloque', { p_user_id: p.user_id, p_fecha: isoF, p_asistio: !actual })
  }

  // ── Mensual por persona ───────────────────────────────────────
  const rangoMes = useMemo(() => {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + mes)
    return { ini: new Date(base.getFullYear(), base.getMonth(), 1), fin: new Date(base.getFullYear(), base.getMonth() + 1, 0) }
  }, [mes])
  const abrirPersona = useCallback(async (p: Persona, offsetMes = 0) => {
    setPersonaSel(p); setMes(offsetMes); setMesData(null)
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + offsetMes)
    const ini = fmtISO(new Date(base.getFullYear(), base.getMonth(), 1))
    const fin = fmtISO(new Date(base.getFullYear(), base.getMonth() + 1, 0))
    const { data: d } = await supabase.rpc('bloque_calendario', { p_bloque_id: id, p_desde: ini, p_hasta: fin, p_user_id: p.user_id })
    setMesData(((d ?? [])[0] ?? null) as Persona | null)
  }, [id])

  const iso = fmtISO(fecha)
  const esHoy = iso === fmtISO(new Date(new Date().setHours(0, 0, 0, 0)))
  const fechaTxt = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const rangoSemTxt = `${diasSemana[0].getDate()} ${diasSemana[0].toLocaleDateString('es-MX', { month: 'short' })} – ${diasSemana[6].getDate()} ${diasSemana[6].toLocaleDateString('es-MX', { month: 'short' })}`

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.title}>📅 Calendario de {nombre ?? 'bloque'}</Text>

        {/* ── Leyenda / nomenclatura ── */}
        <View style={s.legend}>
          <Text style={s.legendTitle}>¿Qué mide cada cosa?</Text>
          <LegendRow icon="🤝" nom="Reunión" desc="Asistió a la junta — se marca a mano" manual />
          <LegendRow icon="📅" nom="Cita" desc="Agendó una cita ese día" />
          <LegendRow icon="👥" nom="Cliente" desc="Metió un cliente o pasó un perfil" />
          <LegendRow icon="📱" nom="Actividad" desc="Usó la app o publicó una propiedad" />
          <Text style={s.legendNota}>📅 👥 📱 se marcan solas con lo que ya hay en el sistema. Solo la 🤝 la marcas tú.</Text>
        </View>

        {/* ── Toggle de vista ── */}
        <View style={s.toggle}>
          <TouchableOpacity style={[s.togBtn, vista === 'checklist' && s.togBtnOn]} onPress={() => setVista('checklist')}>
            <Text style={[s.togTxt, vista === 'checklist' && s.togTxtOn]}>✅ Checklist del día</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.togBtn, vista === 'semana' && s.togBtnOn]} onPress={() => setVista('semana')}>
            <Text style={[s.togTxt, vista === 'semana' && s.togTxtOn]}>📆 Semana</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 40 }} /> : vista === 'checklist' ? (
          <>
            {/* Navegación de día */}
            <View style={s.nav}>
              <TouchableOpacity onPress={() => setFecha(f => new Date(f.getTime() - 86400000))} style={s.navBtn}><Text style={s.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={s.navTxt}>{esHoy ? 'Hoy · ' : ''}{fechaTxt}</Text>
              <TouchableOpacity onPress={() => setFecha(f => new Date(f.getTime() + 86400000))} style={s.navBtn}><Text style={s.navBtnTxt}>›</Text></TouchableOpacity>
            </View>

            {/* ¿Hubo reunión? */}
            <View style={s.huboRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.huboTxt}>¿Hubo reunión este día?</Text>
                <Text style={s.huboSub}>Actívalo para poder palomear la asistencia 🤝</Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleHubo(!huboReunion)}
                style={[s.huboToggle, huboReunion && s.huboToggleOn]}
                activeOpacity={0.8}
              >
                <Text style={[s.huboToggleTxt, huboReunion && s.huboToggleTxtOn]}>
                  {huboReunion ? '✓ Sí' : 'No'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Checklist por integrante */}
            {dia.map(p => {
              const m = p.dias?.[iso]
              const reuEstado: 'si' | 'no' | 'na' = !huboReunion ? 'na' : (m?.reunion === true ? 'si' : 'no')
              const cita: 'si' | 'no' = m?.cita ? 'si' : 'no'
              const cli: 'si' | 'no' = m?.cliente ? 'si' : 'no'
              const act: 'si' | 'no' = (m?.uso || m?.publico) ? 'si' : 'no'
              const score = [reuEstado === 'si', cita === 'si', cli === 'si', act === 'si'].filter(Boolean).length
              return (
                <View key={p.user_id} style={s.miembroCard}>
                  <TouchableOpacity style={s.miembroHead} onPress={() => abrirPersona(p)} activeOpacity={0.7}>
                    <Text style={s.miembroNom} numberOfLines={1}>{p.nombre ?? 'Usuario'}</Text>
                    <Text style={s.miembroScore}>{score}/4</Text>
                    <Text style={s.verMes}>ver mes ›</Text>
                  </TouchableOpacity>
                  <View style={s.pillGrid}>
                    <Pill icon="🤝" label="Reunión"   estado={reuEstado} onPress={huboReunion ? () => toggleAsistio(p) : undefined} />
                    <Pill icon="📅" label="Cita"      estado={cita} />
                    <Pill icon="👥" label="Cliente"   estado={cli} />
                    <Pill icon="📱" label="Actividad" estado={act} />
                  </View>
                </View>
              )
            })}
            {dia.length === 0 && <Text style={s.vacio}>Este bloque no tiene miembros.</Text>}
          </>
        ) : (
          <>
            {/* Semana */}
            <View style={s.nav}>
              <TouchableOpacity onPress={() => setSemana(x => x - 1)} style={s.navBtn}><Text style={s.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={s.navTxt}>{semana === 0 ? 'Esta semana' : rangoSemTxt}</Text>
              <TouchableOpacity onPress={() => setSemana(x => x + 1)} style={s.navBtn}><Text style={s.navBtnTxt}>›</Text></TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              <View style={s.gRow}>
                <View style={[s.gName, s.gHead]}><Text style={s.gHeadTxt}>Persona</Text></View>
                {diasSemana.map((d, i) => (
                  <View key={i} style={[s.gCell, s.gHead]}>
                    <Text style={s.gHeadTxt}>{DIAS_CORTOS[i]}</Text>
                    <Text style={s.gHeadSub}>{d.getDate()}</Text>
                  </View>
                ))}
              </View>
              {sem.map(p => (
                <View key={p.user_id} style={s.gRow}>
                  <TouchableOpacity style={s.gName} onPress={() => abrirPersona(p)}>
                    <Text style={s.gNameTxt} numberOfLines={2}>{p.nombre ?? 'Usuario'}</Text>
                  </TouchableOpacity>
                  {diasSemana.map((d, i) => (
                    <View key={i} style={s.gCell}>
                      {iconosDe(p.dias?.[fmtISO(d)]).map((ic, k) => (
                        <Text key={k} style={s.gIcon}>{ic.e}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Modal mensual por persona ── */}
      <Modal visible={!!personaSel} transparent animationType="slide" onRequestClose={() => setPersonaSel(null)}>
        <View style={s.ov}>
          <View style={s.box}>
            <View style={s.boxHead}>
              <Text style={s.boxTitle} numberOfLines={1}>{personaSel?.nombre ?? ''}</Text>
              <TouchableOpacity onPress={() => setPersonaSel(null)}><Text style={s.cerrar}>✕</Text></TouchableOpacity>
            </View>
            <View style={s.nav}>
              <TouchableOpacity onPress={() => personaSel && abrirPersona(personaSel, mes - 1)} style={s.navBtn}><Text style={s.navBtnTxt}>‹</Text></TouchableOpacity>
              <Text style={s.navTxt}>{rangoMes.ini.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => personaSel && abrirPersona(personaSel, mes + 1)} style={s.navBtn}><Text style={s.navBtnTxt}>›</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440 }}>
              {!mesData ? <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} /> : (() => {
                const arr: Date[] = []
                for (let d = new Date(rangoMes.ini); d <= rangoMes.fin; d.setDate(d.getDate() + 1)) arr.push(new Date(d))
                return arr.map(d => {
                  const ic = iconosDe(mesData.dias?.[fmtISO(d)])
                  return (
                    <View key={fmtISO(d)} style={s.mesRow}>
                      <Text style={s.mesDia}>{DIAS_CORTOS[(d.getDay() + 6) % 7]} {d.getDate()}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {ic.length ? ic.map((x, k) => <Text key={k} style={s.mesIcon}>{x.e}</Text>) : <Text style={s.mesVacio}>·</Text>}
                      </View>
                    </View>
                  )
                })
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function LegendRow({ icon, nom, desc, manual }: { icon: string; nom: string; desc: string; manual?: boolean }) {
  return (
    <View style={s.legRow}>
      <Text style={s.legIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.legNom}>{nom}{manual ? <Text style={s.legManual}>  · manual</Text> : null}</Text>
        <Text style={s.legDesc}>{desc}</Text>
      </View>
    </View>
  )
}

const pl = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '46%', flexGrow: 1, backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 11 },
  pillOn: { backgroundColor: ONBG, borderColor: ON },
  pillNa: { opacity: 0.45 },
  pillTap: { borderColor: '#33586e', borderStyle: 'dashed' },
  icon: { fontSize: 16 },
  label: { flex: 1, color: SUB, fontSize: 13, fontWeight: '700' },
  labelOn: { color: '#bff0d4' },
  labelNa: { color: MUTE },
  check: { color: MUTE, fontSize: 15, fontWeight: '900' },
  checkOn: { color: ON },
})

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  title: { color: TEXT, fontSize: 22, fontWeight: '900', paddingHorizontal: 16, paddingTop: 16 },

  legend: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, margin: 14, padding: 16 },
  legendTitle: { color: GOLD, fontSize: 16, fontWeight: '900', marginBottom: 10 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  legIcon: { fontSize: 24, width: 30, textAlign: 'center' },
  legNom: { color: TEXT, fontSize: 15, fontWeight: '800' },
  legManual: { color: GOLD, fontSize: 12, fontWeight: '700' },
  legDesc: { color: SUB, fontSize: 13, marginTop: 1 },
  legendNota: { color: MUTE, fontSize: 12.5, marginTop: 10, lineHeight: 18 },

  toggle: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginBottom: 6 },
  togBtn: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  togBtnOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  togTxt: { color: SUB, fontSize: 14, fontWeight: '800' },
  togTxtOn: { color: '#fff' },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  navBtn: { paddingHorizontal: 16, paddingVertical: 4 },
  navBtnTxt: { color: GOLD, fontSize: 30, fontWeight: '800' },
  navTxt: { color: TEXT, fontSize: 15, fontWeight: '800', minWidth: 190, textAlign: 'center', textTransform: 'capitalize' },

  huboRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 14, marginBottom: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14 },
  huboTxt: { color: TEXT, fontSize: 15, fontWeight: '800' },
  huboSub: { color: MUTE, fontSize: 12, marginTop: 2 },
  huboToggle: { minWidth: 66, alignItems: 'center', backgroundColor: '#33455a', borderWidth: 1, borderColor: '#4a5f78', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 18 },
  huboToggleOn: { backgroundColor: ON, borderColor: ON },
  huboToggleTxt: { color: '#c7d6e4', fontSize: 15, fontWeight: '900' },
  huboToggleTxtOn: { color: '#06240f' },

  miembroCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, marginHorizontal: 14, marginBottom: 10, padding: 14 },
  miembroHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  miembroNom: { flex: 1, color: TEXT, fontSize: 16, fontWeight: '800' },
  miembroScore: { color: GOLD, fontSize: 15, fontWeight: '900' },
  verMes: { color: SUB, fontSize: 12, fontWeight: '700' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  vacio: { color: MUTE, textAlign: 'center', padding: 30, fontSize: 14 },

  gRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  gHead: { backgroundColor: CARD },
  gHeadTxt: { color: SUB, fontSize: 12, fontWeight: '800' },
  gHeadSub: { color: MUTE, fontSize: 11 },
  gName: { width: 104, paddingHorizontal: 10, paddingVertical: 12, justifyContent: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  gNameTxt: { color: TEXT, fontSize: 13, fontWeight: '700' },
  gCell: { flex: 1, minWidth: 38, minHeight: 60, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 2, borderRightWidth: 1, borderRightColor: BORDER, paddingVertical: 6 },
  gIcon: { fontSize: 17 },

  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  box: { backgroundColor: BG, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '86%', borderTopWidth: 1, borderColor: BORDER },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxTitle: { color: TEXT, fontSize: 18, fontWeight: '900', flex: 1 },
  cerrar: { color: SUB, fontSize: 22, paddingLeft: 12 },
  mesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: BORDER },
  mesDia: { color: SUB, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  mesIcon: { fontSize: 18 },
  mesVacio: { color: MUTE, fontSize: 16 },
})
