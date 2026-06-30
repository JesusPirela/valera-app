import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

type TablaData = {
  headers: string[]
  rows: string[][]
}

const TEAL = '#1a6470'

export default function TablaEquipo() {
  const c = useColors()
  const [data, setData] = useState<TablaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke('get-tabla-equipo')
      if (fnErr) { setError(fnErr.message); setLoading(false); return }
      if (result?.error) { setError(result.error); setLoading(false); return }
      setData(result as TablaData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const MIN_COL_WIDTH = 120
  const totalCols = data?.headers.length ?? 0

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={s.header}>
        <Text style={[s.titulo, { color: c.text }]}>📊 Tabla equipo</Text>
        <TouchableOpacity onPress={cargar} style={[s.reloadBtn, { borderColor: c.border }]} activeOpacity={0.7}>
          <Text style={[s.reloadBtnTxt, { color: TEAL }]}>↺ Actualizar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={[s.loadingTxt, { color: c.textMute }]}>Cargando datos…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={[s.errorTitle, { color: c.text }]}>No se pudieron cargar los datos</Text>
          <Text style={[s.errorMsg, { color: c.textMute }]}>{error}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: TEAL }]} onPress={cargar} activeOpacity={0.8}>
            <Text style={s.retryBtnTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : !data || data.rows.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
          <Text style={[s.emptyTxt, { color: c.textMute }]}>La hoja no tiene datos.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={[s.meta, { color: c.textMute }]}>
            {data.rows.length} filas · {totalCols} columnas
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              {/* Encabezados */}
              <View style={[s.row, s.headerRow, { backgroundColor: TEAL }]}>
                <View style={[s.cell, s.indexCell, { backgroundColor: '#144f59' }]}>
                  <Text style={[s.cellTxt, { color: 'rgba(255,255,255,0.6)', fontSize: 10 }]}>#</Text>
                </View>
                {data.headers.map((h, i) => (
                  <View key={i} style={[s.cell, { minWidth: MIN_COL_WIDTH, borderRightColor: 'rgba(255,255,255,0.15)' }]}>
                    <Text style={[s.cellTxt, s.headerTxt]} numberOfLines={2}>{h || '—'}</Text>
                  </View>
                ))}
              </View>

              {/* Filas */}
              {data.rows.map((row, ri) => (
                <View
                  key={ri}
                  style={[
                    s.row,
                    { backgroundColor: ri % 2 === 0 ? c.card : c.bg, borderBottomColor: c.border },
                  ]}
                >
                  <View style={[s.cell, s.indexCell, { borderRightColor: c.border }]}>
                    <Text style={[s.cellTxt, { color: c.textMute, fontSize: 10 }]}>{ri + 1}</Text>
                  </View>
                  {row.map((cell, ci) => (
                    <View key={ci} style={[s.cell, { minWidth: MIN_COL_WIDTH, borderRightColor: c.border }]}>
                      <Text style={[s.cellTxt, { color: c.text }]} numberOfLines={3}>{cell || '—'}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
  },
  titulo: { fontSize: 20, fontWeight: '900' },
  reloadBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  reloadBtnTxt: { fontSize: 13, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTxt: { marginTop: 12, fontSize: 13 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  errorMsg: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  retryBtn: { borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  retryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyTxt: { fontSize: 14 },

  meta: { fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 },

  row: { flexDirection: 'row', borderBottomWidth: 1 },
  headerRow: { borderBottomWidth: 0 },
  indexCell: {
    width: 36, borderRightWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
  },
  cell: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderRightWidth: 1, justifyContent: 'center',
  },
  cellTxt: { fontSize: 12, lineHeight: 17 },
  headerTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
})
