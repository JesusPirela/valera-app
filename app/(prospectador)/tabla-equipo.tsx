import { useState, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, SectionList, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { normalizar } from '../../lib/texto'

type TablaData = {
  headers: string[]
  rows: string[][]
}

type Grupo = {
  title: string
  data: string[][]
}

const TEAL = '#1a6470'

function esPrecio(val: string, label = '') {
  if (normalizar(label).includes('precio')) return true
  const v = val.trim()
  return (
    /^\$[\d,.]+/.test(v) ||           // $1,500,000 o $1.500.000
    /^\d{1,3}(,\d{3})+$/.test(v) ||   // 1,500,000
    /^\d{6,}$/.test(v)                 // 1500000 (número plano ≥6 dígitos)
  )
}

function formatearPrecio(val: string): string {
  const digits = val.replace(/[^\d]/g, '')
  if (!digits || digits.length < 4) return val
  const num = parseInt(digits, 10)
  if (isNaN(num)) return val
  return `$${num.toLocaleString('es-MX')}`
}

export default function TablaEquipo() {
  const c = useColors()
  const [data, setData] = useState<TablaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})

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

  // Agrupar filas por el primer campo (nombre del desarrollo)
  const grupos: Grupo[] = useMemo(() => {
    if (!data) return []
    const q = normalizar(busqueda)

    // Fill-forward: celdas combinadas en Sheets exportan vacío para las filas siguientes
    let lastDesarrollo = ''
    const filledRows = data.rows.map(row => {
      const d = row[0]?.trim()
      if (d) lastDesarrollo = d
      return lastDesarrollo ? [lastDesarrollo, ...row.slice(1)] : row
    })

    const map = new Map<string, string[][]>()
    for (const row of filledRows) {
      const nombre = row[0]?.trim() || 'Sin nombre'
      if (q && !row.some(cell => normalizar(cell).includes(q))) continue
      if (!map.has(nombre)) map.set(nombre, [])
      map.get(nombre)!.push(row)
    }
    return Array.from(map.entries()).map(([title, rows]) => ({ title, data: rows }))
  }, [data, busqueda])

  const totalModelos = grupos.reduce((s, g) => s + g.data.length, 0)

  function toggleGrupo(titulo: string) {
    setColapsados(v => ({ ...v, [titulo]: !v[titulo] }))
  }

  function renderSectionHeader({ section }: { section: Grupo }) {
    const count = section.data.length
    const colapsado = colapsados[section.title] ?? false
    return (
      <TouchableOpacity
        style={[s.grupoHeader, { backgroundColor: TEAL + 'cc', borderColor: TEAL }]}
        onPress={() => toggleGrupo(section.title)}
        activeOpacity={0.8}
      >
        <Text style={s.grupoTitulo} numberOfLines={1}>{section.title}</Text>
        <Text style={s.grupoCount}>{count} {count === 1 ? 'modelo' : 'modelos'}</Text>
        <Text style={s.grupoChevron}>{colapsado ? '▶' : '▼'}</Text>
      </TouchableOpacity>
    )
  }

  function renderItem({ item, index, section }: { item: string[]; index: number; section: Grupo }) {
    if (colapsados[section.title]) return null

    const headers = data?.headers ?? []
    // Columnas 1+ son los atributos del modelo
    const campos = headers.slice(1).map((h, i) => ({ label: h, value: item[i + 1] ?? '' }))
      .filter(x => x.value.trim() && x.value !== '—' && x.value !== '-')

    const precioEntry = campos.find(x => esPrecio(x.value, x.label))
    const otrosCampos = campos.filter(x => x !== precioEntry)
    const esUltimo = index === section.data.length - 1

    return (
      <View style={[
        s.modeloCard,
        { backgroundColor: c.card, borderColor: c.border },
        esUltimo && s.modeloCardUltimo,
      ]}>
        <View style={[s.modeloBar, { backgroundColor: TEAL }]} />
        <View style={{ flex: 1 }}>
          <View style={s.modeloTop}>
            <View style={[s.modeloIdx, { backgroundColor: TEAL + '22' }]}>
              <Text style={[s.modeloIdxTxt, { color: TEAL }]}>{index + 1}</Text>
            </View>
            {precioEntry && (
              <Text style={s.modeloPrecio}>{formatearPrecio(precioEntry.value)}</Text>
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
              placeholder="Buscar desarrollo o modelo…"
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={[{ fontSize: 15, color: c.textMute, paddingHorizontal: 4 }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[s.meta, { color: c.textMute }]}>
            {grupos.length} {grupos.length === 1 ? 'desarrollo' : 'desarrollos'} · {totalModelos} modelos
            {busqueda.trim() ? ` (filtrado)` : ''}
          </Text>
          <SectionList
            sections={grupos}
            keyExtractor={(item, i) => `${item[0]}_${i}`}
            renderSectionHeader={renderSectionHeader}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
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

  // Header del grupo (desarrollo)
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 12, marginBottom: 2,
  },
  grupoTitulo: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '900' },
  grupoCount: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', marginRight: 8 },
  grupoChevron: { color: '#fff', fontSize: 14 },

  // Tarjeta de modelo (hijo del grupo)
  modeloCard: {
    flexDirection: 'row',
    borderWidth: 1, borderTopWidth: 0,
    marginBottom: 0, padding: 10,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  modeloCardUltimo: {
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    marginBottom: 4,
  },
  modeloBar: { width: 3, borderRadius: 2, marginRight: 10, alignSelf: 'stretch' },
  modeloTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  modeloIdx: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  modeloIdxTxt: { fontSize: 10, fontWeight: '800' },
  modeloPrecio: { fontSize: 14, fontWeight: '900', color: TEAL },

  camposWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  campo: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 90 },
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
