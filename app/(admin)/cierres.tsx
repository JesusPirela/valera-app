// Apartado EXCLUSIVO admin: seguimiento de CIERRES (venta y renta).
// Tabla editable (estilo citas de venta): cliente, operación, etapa ("cómo
// vamos"), fecha de escrituración, comisión (dinero a ganar), quién prospectó /
// agendó / atendió. Barra de resumen arriba. Respaldo: tabla public.cierres.
import { useCallback, useEffect, useMemo, useState, memo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type Tipo = 'texto' | 'op' | 'etapa' | 'fecha' | 'dinero' | 'usuario'
type Fila = {
  id: string; orden: number | null; cliente_nombre: string | null; telefono: string | null
  tipo_operacion: string | null; interesado_en: string | null; etapa: string | null
  fecha_cita: string | null; fecha_escrituracion: string | null; comision: number | null
  prospecto: string | null; coordino: string | null; atendio: string | null; notas: string | null
  created_at: string | null
}
type ColKey = keyof Fila

const COLS: { key: ColKey; label: string; w: number; tipo: Tipo }[] = [
  { key: 'cliente_nombre', label: 'Cliente', w: 180, tipo: 'texto' },
  { key: 'telefono', label: 'Teléfono', w: 130, tipo: 'texto' },
  { key: 'tipo_operacion', label: 'Operación', w: 110, tipo: 'op' },
  { key: 'fecha_cita', label: 'Registro / cita', w: 150, tipo: 'fecha' },
  { key: 'interesado_en', label: 'Propiedad / interés', w: 230, tipo: 'texto' },
  { key: 'etapa', label: 'Cómo vamos', w: 150, tipo: 'etapa' },
  { key: 'fecha_escrituracion', label: 'Escrituración', w: 150, tipo: 'fecha' },
  { key: 'comision', label: 'A ganar (comisión)', w: 160, tipo: 'dinero' },
  { key: 'prospecto', label: 'Prospectó', w: 150, tipo: 'usuario' },
  { key: 'coordino', label: 'Agendó', w: 150, tipo: 'usuario' },
  { key: 'atendio', label: 'Atendió', w: 150, tipo: 'usuario' },
  { key: 'notas', label: 'Notas', w: 240, tipo: 'texto' },
]
const NUM_W = 44, DEL_W = 56, ROW_H = 52

const ETAPAS = ['Apartado', 'Trámite', 'Por escriturar', 'Escriturado', 'Caído'] as const
const ETAPA_COLOR: Record<string, string> = {
  'Apartado': '#d97706', 'Trámite': '#2563eb', 'Por escriturar': '#7c3aed',
  'Escriturado': '#059669', 'Caído': '#dc2626',
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '' : '$' + Number(n).toLocaleString('es-MX')
function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${parseInt(m[3], 10)} ${MESES[parseInt(m[2], 10) - 1]} ${m[1]}`
}

// ─── Calendario (solo fecha) ─────────────────────────────────────────────────
function CalPicker({ valor, onPick, onClear }: { valor: string | null; onPick: (iso: string) => void; onClear: () => void }) {
  const c = useColors()
  const hoy = new Date()
  const ini = valor ? new Date(valor + 'T12:00:00') : hoy
  const [vista, setVista] = useState(() => new Date(ini.getFullYear(), ini.getMonth(), 1))
  const y = vista.getFullYear(), m = vista.getMonth()
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const dias = new Date(y, m + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(off).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)]
  const selY = valor ? parseInt(valor.slice(0, 4), 10) : -1
  const selM = valor ? parseInt(valor.slice(5, 7), 10) - 1 : -1
  const selD = valor ? parseInt(valor.slice(8, 10), 10) : -1
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setVista(new Date(y, m - 1, 1))}><Text style={st.calNav}>‹</Text></TouchableOpacity>
        <Text style={{ fontWeight: '800', fontSize: 15, color: c.text }}>{MESES_LARGO[m]} {y}</Text>
        <TouchableOpacity onPress={() => setVista(new Date(y, m + 1, 1))}><Text style={st.calNav}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' }}>{DOW.map((d, i) => <Text key={i} style={[st.calDow, { color: c.textMute }]}>{d}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {celdas.map((dd, i) => {
          const sel = dd === selD && m === selM && y === selY
          return (
            <View key={i} style={st.calCell}>
              {dd != null && (
                <TouchableOpacity onPress={() => onPick(`${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)}>
                  <View style={[st.calDia, sel && { backgroundColor: '#1a6470' }]}>
                    <Text style={{ color: sel ? '#fff' : c.text, fontWeight: sel ? '800' : '500', fontSize: 13 }}>{dd}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )
        })}
      </View>
      <TouchableOpacity onPress={onClear} style={{ marginTop: 6, alignSelf: 'center' }}>
        <Text style={{ color: '#c0392b', fontWeight: '700', fontSize: 12.5 }}>Sin fecha</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Fila ────────────────────────────────────────────────────────────────────
const FilaRow = memo(function FilaRow({ f, idx, onTap, onDel }: {
  f: Fila; idx: number; onTap: (id: string, key: ColKey, tipo: Tipo) => void; onDel: (f: Fila) => void
}) {
  const c = useColors()
  return (
    <View style={[st.row, { minHeight: ROW_H, borderColor: c.border, backgroundColor: idx % 2 ? c.bg : c.card }]}>
      <View style={[st.cell, st.counterCell, { width: NUM_W, borderColor: c.border }]}>
        <Text style={[st.counterTxt, { color: c.textMute }]}>{idx + 1}</Text>
      </View>
      {COLS.map(col => {
        const raw = f[col.key]
        let display = ''
        let esRegistro = false
        if (col.tipo === 'dinero') display = fmtMoney(raw as number)
        else if (col.tipo === 'fecha') {
          display = fmtFecha(raw as string)
          // Sin fecha de cita: mostrar cuándo se registró el cierre (created_at).
          if (!display && col.key === 'fecha_cita' && f.created_at) { display = fmtFecha(f.created_at) + ' · registro'; esRegistro = true }
        }
        else if (col.tipo === 'op') display = raw ? (String(raw)[0].toUpperCase() + String(raw).slice(1)) : ''
        else display = (raw as string) ?? ''
        const esEtapa = col.tipo === 'etapa' && raw
        const esOp = col.tipo === 'op' && raw
        const col1 = esEtapa ? ETAPA_COLOR[String(raw)] : (esOp ? (raw === 'renta' ? '#0369a1' : '#7a4f00') : (esRegistro ? c.textMute : (display ? c.text : c.textMute)))
        return (
          <TouchableOpacity key={col.key} style={[st.cell, { width: col.w, borderColor: c.border }]} activeOpacity={0.6}
            onPress={() => onTap(f.id, col.key, col.tipo)}>
            {esEtapa ? (
              <View style={[st.pill, { backgroundColor: ETAPA_COLOR[String(raw)] + '22' }]}>
                <View style={[st.dot, { backgroundColor: ETAPA_COLOR[String(raw)] }]} />
                <Text style={{ color: ETAPA_COLOR[String(raw)], fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{display}</Text>
              </View>
            ) : (
              <Text style={{ color: col1, fontSize: 12.5, fontWeight: (esOp || col.tipo === 'dinero') ? '800' : '400' }} numberOfLines={2}>
                {display || '—'}
              </Text>
            )}
          </TouchableOpacity>
        )
      })}
      <View style={[st.cell, { width: DEL_W, borderColor: c.border, alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => onDel(f)}><Text style={{ fontSize: 15 }}>🗑️</Text></TouchableOpacity>
      </View>
    </View>
  )
})

// ─── Pantalla ────────────────────────────────────────────────────────────────
export default function Cierres() {
  const c = useColors()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<string[]>([])
  const [fTipo, setFTipo] = useState<'todos' | 'venta' | 'renta'>('todos')
  const [fEtapa, setFEtapa] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ id: string; key: ColKey; tipo: Tipo; val: string } | null>(null)
  const [busca, setBusca] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('cierres').select('*')
      .order('orden', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    setFilas((data ?? []) as Fila[]); setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // Candado admin.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('profiles').select('role').eq('id', session.user.id).single()
        .then(({ data }) => { if (data && data.role !== 'admin') router.replace('/(admin)/propiedades') })
    })
  }, [])
  useEffect(() => {
    supabase.from('profiles').select('nombre').order('nombre')
      .then(({ data }) => setProfiles((data ?? []).map((p: any) => p.nombre).filter(Boolean)))
  }, [])

  const visibles = useMemo(() => filas.filter(f =>
    (fTipo === 'todos' || f.tipo_operacion === fTipo) && (!fEtapa || f.etapa === fEtapa)
  ), [filas, fTipo, fEtapa])

  // Resumen "cómo vamos".
  const resumen = useMemo(() => {
    const base = fTipo === 'todos' ? filas : filas.filter(f => f.tipo_operacion === fTipo)
    const porEtapa: Record<string, number> = {}
    let ganar = 0
    for (const f of base) {
      porEtapa[f.etapa ?? '—'] = (porEtapa[f.etapa ?? '—'] ?? 0) + 1
      if (f.etapa !== 'Caído' && f.comision) ganar += Number(f.comision)
    }
    return {
      total: base.length, ganar,
      venta: base.filter(f => f.tipo_operacion === 'venta').length,
      renta: base.filter(f => f.tipo_operacion === 'renta').length,
      porEtapa,
    }
  }, [filas, fTipo])

  const totalW = NUM_W + COLS.reduce((s, col) => s + col.w, 0) + DEL_W

  async function guardar(id: string, key: ColKey, value: any) {
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f))
    await supabase.from('cierres').update({ [key]: value }).eq('id', id)
  }
  async function agregar() {
    const orden = (filas.reduce((mx, f) => Math.max(mx, f.orden ?? 0), 0)) + 1
    const { data } = await supabase.from('cierres')
      .insert({ etapa: 'Apartado', tipo_operacion: 'venta', orden }).select().single()
    if (data) setFilas(prev => [...prev, data as Fila])
  }
  function borrar(f: Fila) {
    const go = async () => { await supabase.from('cierres').delete().eq('id', f.id); setFilas(prev => prev.filter(x => x.id !== f.id)) }
    if (Platform.OS === 'web') { if (confirm(`¿Borrar el cierre de ${f.cliente_nombre ?? 'este cliente'}?`)) go() }
    else Alert.alert('Borrar cierre', `¿Borrar el cierre de ${f.cliente_nombre ?? 'este cliente'}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  const onTap = (id: string, key: ColKey, tipo: Tipo) => {
    const f = filas.find(x => x.id === id); if (!f) return
    const cur = f[key]
    setBusca('')
    setEdit({ id, key, tipo, val: cur == null ? '' : String(cur) })
  }

  const filtroProfiles = profiles.filter(n => n.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>🤝 Cierres</Text>
          <Text style={[st.sub, { color: c.textMute }]}>Venta y renta · cómo vamos, escrituración y comisión</Text>
        </View>
        <TouchableOpacity style={st.btnAgregar} onPress={agregar}><Text style={st.btnAgregarTxt}>+ Cierre</Text></TouchableOpacity>
      </View>

      {/* Resumen "cómo vamos" */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        <View style={[st.kpi, { backgroundColor: '#0f4c58' }]}>
          <Text style={st.kpiVal}>{fmtMoney(resumen.ganar) || '$0'}</Text>
          <Text style={st.kpiLbl}>Dinero a ganar</Text>
        </View>
        <View style={[st.kpi, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
          <Text style={[st.kpiVal, { color: c.text }]}>{resumen.total}</Text>
          <Text style={[st.kpiLbl, { color: c.textMute }]}>Cierres · {resumen.venta}V / {resumen.renta}R</Text>
        </View>
        {ETAPAS.map(e => (
          <TouchableOpacity key={e} onPress={() => setFEtapa(fEtapa === e ? null : e)}
            style={[st.kpi, { backgroundColor: fEtapa === e ? ETAPA_COLOR[e] : c.card, borderWidth: 1, borderColor: fEtapa === e ? ETAPA_COLOR[e] : c.border }]}>
            <Text style={[st.kpiVal, { color: fEtapa === e ? '#fff' : ETAPA_COLOR[e] }]}>{resumen.porEtapa[e] ?? 0}</Text>
            <Text style={[st.kpiLbl, { color: fEtapa === e ? '#fff' : c.textMute }]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtro operación */}
      <View style={st.fTipoRow}>
        {(['todos', 'venta', 'renta'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setFTipo(t)}
            style={[st.fChip, { borderColor: fTipo === t ? '#1a6470' : c.border, backgroundColor: fTipo === t ? '#1a6470' : 'transparent' }]}>
            <Text style={{ fontWeight: '700', fontSize: 12.5, color: fTipo === t ? '#fff' : c.textSub }}>
              {t === 'todos' ? 'Todos' : t === 'venta' ? 'Venta' : 'Renta'}
            </Text>
          </TouchableOpacity>
        ))}
        {fEtapa && (
          <TouchableOpacity onPress={() => setFEtapa(null)}><Text style={{ color: '#c0392b', fontWeight: '800', fontSize: 12.5 }}>✕ {fEtapa}</Text></TouchableOpacity>
        )}
      </View>

      {loading ? <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} /> : (
        <ScrollView style={{ flex: 1, marginTop: 8 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ width: totalW }}>
              {/* Encabezado */}
              <View style={[st.headRow, { backgroundColor: '#0f4c58' }]}>
                <View style={[st.headCell, { width: NUM_W }]}><Text style={st.headTxt}>#</Text></View>
                {COLS.map(col => (
                  <View key={col.key} style={[st.headCell, { width: col.w }]}><Text style={st.headTxt} numberOfLines={2}>{col.label}</Text></View>
                ))}
                <View style={[st.headCell, { width: DEL_W }]}><Text style={st.headTxt}> </Text></View>
              </View>
              {/* Filas */}
              {visibles.map((f, i) => <FilaRow key={f.id} f={f} idx={i} onTap={onTap} onDel={borrar} />)}
              {visibles.length === 0 && (
                <Text style={[st.vacio, { color: c.textMute }]}>Sin cierres{fEtapa ? ` en "${fEtapa}"` : ''}. Toca “+ Cierre” para agregar.</Text>
              )}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* ─── Editor ─── */}
      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setEdit(null)}>
            <TouchableOpacity activeOpacity={1} style={[st.dropCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation()}>
              {edit && (() => {
                const col = COLS.find(k => k.key === edit.key)!
                const cerrar = () => setEdit(null)
                const set = (v: any) => { guardar(edit.id, edit.key, v); cerrar() }
                return (
                  <>
                    <Text style={[st.dropTitulo, { color: c.text }]}>{col.label}</Text>

                    {(edit.tipo === 'texto') && (
                      <>
                        <TextInput style={[st.editArea, { borderColor: c.border, color: c.text }]} value={edit.val}
                          onChangeText={t => setEdit({ ...edit, val: t })} multiline autoFocus placeholder="Escribe…" placeholderTextColor={c.textMute} />
                        <View style={st.dropAcciones}>
                          <TouchableOpacity style={st.dropCancel} onPress={cerrar}><Text style={[st.dropCancelTxt, { color: c.text }]}>Cancelar</Text></TouchableOpacity>
                          <TouchableOpacity style={st.dropOk} onPress={() => set(edit.val.trim() || null)}><Text style={st.dropOkTxt}>Guardar ✓</Text></TouchableOpacity>
                        </View>
                      </>
                    )}

                    {edit.tipo === 'dinero' && (
                      <>
                        <TextInput style={[st.editArea, { borderColor: c.border, color: c.text, minHeight: 0 }]} value={edit.val}
                          onChangeText={t => setEdit({ ...edit, val: t.replace(/[^\d.]/g, '') })} keyboardType="numeric" autoFocus placeholder="0" placeholderTextColor={c.textMute} />
                        <View style={st.dropAcciones}>
                          <TouchableOpacity style={st.dropCancel} onPress={cerrar}><Text style={[st.dropCancelTxt, { color: c.text }]}>Cancelar</Text></TouchableOpacity>
                          <TouchableOpacity style={st.dropOk} onPress={() => set(edit.val.trim() === '' ? null : Number(edit.val))}><Text style={st.dropOkTxt}>Guardar ✓</Text></TouchableOpacity>
                        </View>
                      </>
                    )}

                    {edit.tipo === 'op' && (
                      <View style={{ gap: 8 }}>
                        {(['venta', 'renta'] as const).map(op => (
                          <TouchableOpacity key={op} style={[st.optRow, { borderColor: edit.val === op ? '#1a6470' : c.border, backgroundColor: edit.val === op ? '#1a647011' : 'transparent' }]} onPress={() => set(op)}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: op === 'renta' ? '#0369a1' : '#7a4f00' }}>{op === 'venta' ? 'Venta' : 'Renta'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {edit.tipo === 'etapa' && (
                      <View style={{ gap: 8 }}>
                        {ETAPAS.map(e => (
                          <TouchableOpacity key={e} style={[st.optRow, { borderColor: edit.val === e ? ETAPA_COLOR[e] : c.border, backgroundColor: edit.val === e ? ETAPA_COLOR[e] + '15' : 'transparent' }]} onPress={() => set(e)}>
                            <View style={[st.dot, { backgroundColor: ETAPA_COLOR[e] }]} />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: ETAPA_COLOR[e] }}>{e}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {edit.tipo === 'fecha' && (
                      <CalPicker valor={edit.val || null} onPick={(iso) => set(iso)} onClear={() => set(null)} />
                    )}

                    {edit.tipo === 'usuario' && (
                      <>
                        <TextInput style={[st.dropBusca, { borderColor: c.border, color: c.text }]} value={busca} onChangeText={setBusca} placeholder="Buscar o escribir…" placeholderTextColor={c.textMute} autoFocus />
                        <ScrollView style={{ maxHeight: 280, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                          {busca.trim() !== '' && !filtroProfiles.some(n => n.toLowerCase() === busca.trim().toLowerCase()) && (
                            <TouchableOpacity style={st.otroBtn} onPress={() => set(busca.trim())}><Text style={st.otroBtnTxt}>Usar “{busca.trim()}”</Text></TouchableOpacity>
                          )}
                          <TouchableOpacity style={st.dropItem} onPress={() => set(null)}><Text style={{ color: c.textMute, fontSize: 13.5 }}>— Sin asignar —</Text></TouchableOpacity>
                          {filtroProfiles.map(n => (
                            <TouchableOpacity key={n} style={st.dropItem} onPress={() => set(n)}>
                              <Text style={{ color: c.text, fontSize: 13.5 }} numberOfLines={1}>{n}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <TouchableOpacity style={[st.dropCancel, { marginTop: 10 }]} onPress={cerrar}><Text style={[st.dropCancelTxt, { color: c.text }]}>Cerrar</Text></TouchableOpacity>
                      </>
                    )}
                  </>
                )
              })()}
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  btnAgregar: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnAgregarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  kpi: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, minWidth: 92, justifyContent: 'center' },
  kpiVal: { color: '#fff', fontWeight: '900', fontSize: 16 },
  kpiLbl: { color: '#ffffffcc', fontWeight: '700', fontSize: 10.5, marginTop: 1 },
  fTipoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  fChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  headRow: { flexDirection: 'row', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  headCell: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff22' },
  headTxt: { flex: 1, fontSize: 11.5, fontWeight: '800', color: '#fff' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch', overflow: 'hidden' },
  cell: { paddingHorizontal: 8, paddingVertical: 8, borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden' },
  counterCell: { alignItems: 'center', backgroundColor: '#0f4c580d' },
  counterTxt: { fontSize: 11, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5, lineHeight: 20 },
  dropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropCard: { width: '100%', maxWidth: 400, borderRadius: 14, padding: 16 },
  dropTitulo: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  dropBusca: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  editArea: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 80 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 },
  otroBtn: { borderWidth: 1.5, borderColor: '#1a6470', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginBottom: 6 },
  otroBtnTxt: { color: '#1a6470', fontWeight: '800', fontSize: 12.5 },
  dropItem: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#8882' },
  dropAcciones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dropCancel: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropCancelTxt: { fontWeight: '700', fontSize: 14 },
  dropOk: { flex: 1, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropOkTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  calNav: { fontSize: 26, color: '#1a6470', fontWeight: '800', paddingHorizontal: 10 },
  calDow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calCell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center' },
  calDia: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
})
