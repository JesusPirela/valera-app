import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type ErrRow = {
  mensaje: string; contexto: string | null; n: number; usuarios: number; ultimo: string
  stack: string | null; plataforma: string | null; version_app: string | null
}
type Ocurrencia = { contexto: string | null; plataforma: string | null; version_app: string | null; usuario: string; created_at: string; stack: string | null }
type EvtRow = { evento: string; n: number; usuarios: number }

const TEAL = '#1a6470'

export default function Monitoreo() {
  useSupervisorBlock()
  const c = useColors()
  const [dias, setDias] = useState<1 | 7 | 30>(7)
  const [tab, setTab] = useState<'errores' | 'eventos'>('errores')
  const [errores, setErrores] = useState<ErrRow[]>([])
  const [eventos, setEventos] = useState<EvtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)   // mensaje del error abierto
  const [ocurrencias, setOcurrencias] = useState<Ocurrencia[]>([])
  const [cargandoOcur, setCargandoOcur] = useState(false)
  const [revisados, setRevisados] = useState<Set<string>>(new Set())   // errores ya vistos/atendidos

  const cargar = useCallback(async () => {
    const [e, ev, rev] = await Promise.all([
      supabase.rpc('get_monitoreo_errores', { p_dias: dias }),
      supabase.rpc('get_monitoreo_eventos', { p_dias: dias }),
      supabase.from('monitoreo_errores_revisados').select('mensaje'),
    ])
    setErrores((e.data ?? []) as ErrRow[])
    setEventos((ev.data ?? []) as EvtRow[])
    setRevisados(new Set((rev.data ?? []).map((r: any) => r.mensaje)))
    setLoading(false)
  }, [dias])

  // Marcar/desmarcar un error como revisado (check/uncheck). Se persiste para
  // que quede entre sesiones y para que se pueda marcar automáticamente al
  // arreglarlo.
  async function toggleRevisado(mensaje: string) {
    const yaEsta = revisados.has(mensaje)
    setRevisados(prev => { const set = new Set(prev); yaEsta ? set.delete(mensaje) : set.add(mensaje); return set })
    try {
      if (yaEsta) {
        await supabase.from('monitoreo_errores_revisados').delete().eq('mensaje', mensaje)
      } else {
        const { data: { user } } = await getUsuarioActual()
        await supabase.from('monitoreo_errores_revisados').upsert({ mensaje, revisado_por: user?.id ?? null, revisado_en: new Date().toISOString() })
      }
    } catch { /* si falla, el estado local ya cambió; se corrige al recargar */ }
  }

  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  async function toggleError(mensaje: string) {
    if (expandido === mensaje) { setExpandido(null); return }
    setExpandido(mensaje)
    setCargandoOcur(true)
    setOcurrencias([])
    const { data } = await supabase.rpc('get_error_ocurrencias', { p_mensaje: mensaje, p_dias: 30 })
    setOcurrencias((data ?? []) as Ocurrencia[])
    setCargandoOcur(false)
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>🩺 Monitoreo</Text>
          <Text style={s.headerSub}>Errores de la app y actividad de los usuarios</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} refreshControl={refreshControl}>
        {/* Rango + pestañas */}
        <View style={s.chipsRow}>
          {([[1, 'Hoy'], [7, '7 días'], [30, '30 días']] as const).map(([v, lbl]) => (
            <TouchableOpacity key={v} style={[s.chip, { borderColor: c.border }, dias === v && s.chipOn]} onPress={() => setDias(v)}>
              <Text style={[s.chipTxt, { color: c.textSub }, dias === v && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.chipsRow}>
          {([['errores', `⚠️ Errores${errores.length ? ` (${errores.length})` : ''}`], ['eventos', '📊 Actividad']] as const).map(([v, lbl]) => (
            <TouchableOpacity key={v} style={[s.tab, { borderColor: c.border }, tab === v && s.tabOn]} onPress={() => setTab(v)}>
              <Text style={[s.tabTxt, { color: c.textSub }, tab === v && s.tabTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
        ) : tab === 'errores' ? (
          errores.length === 0 ? (
            <View style={s.vacio}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={[s.vacioTxt, { color: c.textMute }]}>Ningún error en este periodo. Todo tranquilo.</Text>
            </View>
          ) : (
            errores.map((e, i) => {
              const abierto = expandido === e.mensaje
              const revisado = revisados.has(e.mensaje)
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.9}
                  onPress={() => toggleError(e.mensaje)}
                  style={[s.errCard, { backgroundColor: c.card, borderColor: c.border }, revisado && { opacity: 0.5 }]}
                >
                  <View style={s.errTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      {/* Check para marcar el error como ya visto/atendido */}
                      <TouchableOpacity
                        onPress={() => toggleRevisado(e.mensaje)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[s.chkBox, { borderColor: c.border }, revisado && s.chkBoxOn]}
                      >
                        {revisado && <Text style={s.chkTick}>✓</Text>}
                      </TouchableOpacity>
                      <Text style={[s.errN, { color: '#dc2626' }]}>×{e.n}</Text>
                      {revisado && <Text style={s.chkLbl}>Revisado</Text>}
                    </View>
                    <Text style={[s.errFecha, { color: c.textMute }]}>{fmt(e.ultimo)}</Text>
                  </View>
                  <Text style={[s.errMsg, { color: c.text }]}>{e.mensaje}</Text>
                  <View style={s.errMetaRow}>
                    {e.contexto ? <Text style={[s.errTag, { color: c.textMute, borderColor: c.border }]}>📍 {e.contexto}</Text> : null}
                    {e.plataforma ? <Text style={[s.errTag, { color: c.textMute, borderColor: c.border }]}>📱 {e.plataforma}</Text> : null}
                    {e.version_app ? <Text style={[s.errTag, { color: c.textMute, borderColor: c.border }]}>v{e.version_app}</Text> : null}
                    <Text style={[s.errTag, { color: c.textMute, borderColor: c.border }]}>👤 {e.usuarios} usuario{e.usuarios === 1 ? '' : 's'}</Text>
                  </View>
                  <Text style={[s.errVer, { color: '#00838F' }]}>{abierto ? '▲ Ocultar detalle' : '▼ Ver detalle'}</Text>

                  {abierto && (
                    <View style={[s.errDetalle, { borderTopColor: c.border }]}>
                      {e.stack ? (
                        <>
                          <Text style={[s.errDetLbl, { color: c.textMute }]}>Stack (dónde ocurrió):</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: 8 }}>
                            <Text style={[s.errStack, { color: c.text }]} selectable>{e.stack}</Text>
                          </ScrollView>
                        </>
                      ) : (
                        <Text style={[s.errDetLbl, { color: c.textMute }]}>Sin stack disponible.</Text>
                      )}

                      <Text style={[s.errDetLbl, { color: c.textMute }]}>Últimas veces que pasó:</Text>
                      {cargandoOcur ? (
                        <ActivityIndicator color={TEAL} style={{ marginVertical: 8 }} />
                      ) : (
                        ocurrencias.map((o, j) => (
                          <View key={j} style={[s.ocurFila, { borderBottomColor: c.border }]}>
                            <Text style={[s.ocurTxt, { color: c.text }]} numberOfLines={1}>
                              {fmt(o.created_at)} · {o.usuario} · {o.plataforma ?? '?'} {o.version_app ? `v${o.version_app}` : ''}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })
          )
        ) : (
          eventos.length === 0 ? (
            <View style={s.vacio}><Text style={[s.vacioTxt, { color: c.textMute }]}>Sin actividad registrada aún.</Text></View>
          ) : (
            eventos.map((e, i) => (
              <View key={i} style={[s.evtCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[s.evtNombre, { color: c.text }]}>{e.evento}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.evtN, { color: TEAL }]}>{e.n.toLocaleString()}</Text>
                  <Text style={[s.evtUsuarios, { color: c.textMute }]}>{e.usuarios} usuarios</Text>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { backgroundColor: TEAL, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  tab: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: TEAL, borderColor: TEAL },
  tabTxt: { fontSize: 13, fontWeight: '800' },
  tabTxtOn: { color: '#fff' },

  vacio: { alignItems: 'center', marginTop: 50, gap: 10, paddingHorizontal: 30 },
  vacioTxt: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  errCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  errTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  errN: { fontSize: 13, fontWeight: '900' },
  errFecha: { fontSize: 11 },
  chkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chkBoxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  chkTick: { color: '#fff', fontSize: 13, fontWeight: '900' },
  chkLbl: { fontSize: 10.5, fontWeight: '700', color: '#16a34a' },
  errMsg: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  errMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  errTag: { fontSize: 10.5, fontWeight: '600', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  errVer: { fontSize: 12, fontWeight: '800', marginTop: 8 },
  errDetalle: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  errDetLbl: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  errStack: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
  ocurFila: { paddingVertical: 6, borderBottomWidth: 1 },
  ocurTxt: { fontSize: 11.5 },

  evtCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  evtNombre: { fontSize: 14, fontWeight: '700', flex: 1 },
  evtN: { fontSize: 18, fontWeight: '900' },
  evtUsuarios: { fontSize: 11, marginTop: 1 },
})
