import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type ErrRow = { mensaje: string; contexto: string | null; n: number; ultimo: string }
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

  const cargar = useCallback(async () => {
    const [e, ev] = await Promise.all([
      supabase.rpc('get_monitoreo_errores', { p_dias: dias }),
      supabase.rpc('get_monitoreo_eventos', { p_dias: dias }),
    ])
    setErrores((e.data ?? []) as ErrRow[])
    setEventos((ev.data ?? []) as EvtRow[])
    setLoading(false)
  }, [dias])

  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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
            errores.map((e, i) => (
              <View key={i} style={[s.errCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.errTop}>
                  <Text style={[s.errN, { color: '#dc2626' }]}>×{e.n}</Text>
                  <Text style={[s.errFecha, { color: c.textMute }]}>{fmt(e.ultimo)}</Text>
                </View>
                <Text style={[s.errMsg, { color: c.text }]}>{e.mensaje}</Text>
                {e.contexto ? <Text style={[s.errCtx, { color: c.textMute }]}>en: {e.contexto}</Text> : null}
              </View>
            ))
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
  errMsg: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  errCtx: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  evtCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  evtNombre: { fontSize: 14, fontWeight: '700', flex: 1 },
  evtN: { fontSize: 18, fontWeight: '900' },
  evtUsuarios: { fontSize: 11, marginTop: 1 },
})
