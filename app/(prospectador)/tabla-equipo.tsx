import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { normalizar } from '../../lib/texto'

type TablaData = {
  headers: string[]
  rows: string[][]
}

const TEAL = '#1a6470'

// Intenta identificar qué columna contiene el precio (empieza con $ o tiene números grandes)
function esPrecio(val: string) {
  return /^\$[\d,]+/.test(val.trim()) || /^\d{1,3}(,\d{3})+$/.test(val.trim())
}

export default function TablaEquipo() {
  const c = useColors()
  const [data, setData] = useState<TablaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

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

  const filasFiltradas = data
    ? data.rows.filter(row =>
        !busqueda.trim() ||
        row.some(cell => normalizar(cell).includes(normalizar(busqueda)))
      )
    : []

  function renderCard({ item, index }: { item: string[]; index: number }) {
    const headers = data?.headers ?? []
    // Primer campo no vacío como título principal
    const titulo = item[0] ?? ''
    const resto = headers.slice(1).map((h, i) => ({ label: h, value: item[i + 1] ?? '' }))
      .filter(x => x.value.trim() && x.value !== '—' && x.value !== '-')

    // Detectar precio para resaltarlo
    const precioEntry = resto.find(x => esPrecio(x.value))
    const otrosCampos = resto.filter(x => x !== precioEntry)

    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.cardTop}>
          <View style={[s.indexBadge, { backgroundColor: TEAL }]}>
            <Text style={s.indexTxt}>{index + 1}</Text>
          </View>
          <Text style={[s.cardTitulo, { color: c.text }]} numberOfLines={2}>{titulo || '—'}</Text>
          {precioEntry && (
            <Text style={s.precio}>{precioEntry.value}</Text>
          )}
        </View>
        {otrosCampos.length > 0 && (
          <View style={s.camposWrap}>
            {otrosCampos.map((campo, i) => (
              <View key={i} style={[s.campo, { borderColor: c.border }]}>
                <Text style={[s.campoLabel, { color: c.textMute }]}>{campo.label}</Text>
                <Text style={[s.campoVal, { color: c.text }]} numberOfLines={2}>{campo.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    )
  }

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
        <>
          <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: c.text }]}
              placeholder="Buscar en la tabla…"
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={[s.meta, { color: c.textMute }]}>
            {filasFiltradas.length} registro{filasFiltradas.length !== 1 ? 's' : ''}
            {busqueda.trim() ? ` (filtrado de ${data.rows.length})` : ''}
          </Text>
          <FlatList
            data={filasFiltradas}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderCard}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  titulo: { fontSize: 20, fontWeight: '900' },
  reloadBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  reloadBtnTxt: { fontSize: 13, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginBottom: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14 },

  meta: { fontSize: 11, paddingHorizontal: 16, paddingBottom: 6 },

  card: {
    borderRadius: 12, borderWidth: 1,
    marginBottom: 10, padding: 12,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  indexBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  indexTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  cardTitulo: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  precio: { fontSize: 14, fontWeight: '900', color: TEAL, flexShrink: 0 },

  camposWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  campo: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
    minWidth: 100,
  },
  campoLabel: { fontSize: 10, fontWeight: '700', marginBottom: 2, textTransform: 'uppercase' },
  campoVal: { fontSize: 13, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTxt: { marginTop: 12, fontSize: 13 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  errorMsg: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  retryBtn: { borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  retryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyTxt: { fontSize: 14 },
})
