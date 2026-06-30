import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type Admin = { id: string; nombre: string | null; color_ficha: string | null }

// Paleta de colores sugeridos para la ficha PDF.
const PRESETS = [
  '#1a6470', '#c62828', '#1565c0', '#2e7d32',
  '#6a1b9a', '#e65100', '#ad1457', '#455a64',
]

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function ColoresFicha() {
  useSupervisorBlock()
  const c = useColors()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [hexInputs, setHexInputs] = useState<Record<string, string>>({})

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, nombre, color_ficha')
      .eq('role', 'admin')
      .order('nombre', { ascending: true })
    const lista = (data ?? []) as Admin[]
    setAdmins(lista)
    setHexInputs(Object.fromEntries(lista.map(a => [a.id, a.color_ficha ?? ''])))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function guardarColor(adminId: string, color: string) {
    setGuardando(adminId)
    const { data, error } = await supabase.rpc('set_color_ficha', { p_user_id: adminId, p_color: color })
    setGuardando(null)
    const resp = data as { ok: boolean; error?: string } | null
    if (error || !resp?.ok) {
      alerta(resp?.error ?? error?.message ?? 'No se pudo guardar el color')
      return
    }
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, color_ficha: color || null } : a))
    setHexInputs(prev => ({ ...prev, [adminId]: color }))
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={[s.titulo, { color: c.text }]}>Colores de ficha PDF</Text>
      <Text style={[s.sub, { color: c.textSub }]}>
        El color define el encabezado de la ficha PDF de las propiedades subidas por cada administrador.
      </Text>

      {admins.map(a => {
        const actual = a.color_ficha || '#1a6470'
        return (
          <View key={a.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.cardHeader}>
              <View style={[s.preview, { backgroundColor: actual }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.nombre, { color: c.text }]}>{a.nombre ?? 'Sin nombre'}</Text>
                <Text style={[s.colorTxt, { color: c.textSub }]}>
                  {a.color_ficha ? a.color_ficha.toUpperCase() : 'Por defecto (#1A6470)'}
                </Text>
              </View>
              {guardando === a.id && <ActivityIndicator color="#1a6470" />}
            </View>

            {/* Presets */}
            <View style={s.swatchRow}>
              {PRESETS.map(p => {
                const sel = actual.toLowerCase() === p.toLowerCase()
                return (
                  <TouchableOpacity
                    key={p}
                    style={[s.swatch, { backgroundColor: p }, sel && s.swatchSel]}
                    onPress={() => guardarColor(a.id, p)}
                    disabled={guardando === a.id}
                  >
                    {sel && <Text style={s.swatchCheck}>✓</Text>}
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Hex manual */}
            <View style={s.hexRow}>
              <TextInput
                style={[s.hexInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                placeholder="#RRGGBB"
                placeholderTextColor={c.textSub}
                value={hexInputs[a.id] ?? ''}
                onChangeText={t => setHexInputs(prev => ({ ...prev, [a.id]: t }))}
                autoCapitalize="characters"
                maxLength={7}
              />
              <TouchableOpacity
                style={[s.aplicarBtn, guardando === a.id && { opacity: 0.5 }]}
                onPress={() => guardarColor(a.id, (hexInputs[a.id] ?? '').trim())}
                disabled={guardando === a.id}
              >
                <Text style={s.aplicarTxt}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 18, lineHeight: 18 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  preview: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  nombre: { fontSize: 16, fontWeight: '700' },
  colorTxt: { fontSize: 12, marginTop: 2 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  swatch: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchSel: { borderColor: '#c9a84c' },
  swatchCheck: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hexRow: { flexDirection: 'row', gap: 8 },
  hexInput: {
    flex: 1, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontWeight: '600',
  },
  aplicarBtn: {
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  aplicarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
