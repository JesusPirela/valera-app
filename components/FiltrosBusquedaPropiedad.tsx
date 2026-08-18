// Filtros reutilizables para buscar propiedades (operación, tipo, recámaras,
// rango de precio). Encapsula tanto la UI (chips + inputs) como la lógica de
// aplicarlos a una consulta de Supabase, para no re-implementarlos en cada
// pantalla (colecciones, y a futuro otras búsquedas).
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useColors } from '../lib/ThemeContext'

export type FiltrosPropiedad = {
  operacion: string | null
  tipo: string | null
  recamaras: number | null
  precioMin: string
  precioMax: string
}

export const FILTROS_VACIOS: FiltrosPropiedad = {
  operacion: null, tipo: null, recamaras: null, precioMin: '', precioMax: '',
}

export function hayFiltrosActivos(f: FiltrosPropiedad): boolean {
  return !!f.operacion || !!f.tipo || !!f.recamaras || !!f.precioMin.trim() || !!f.precioMax.trim()
}

// Aplica los filtros a un query builder de Supabase y lo devuelve encadenable.
// `query` es el resultado de supabase.from('propiedades').select(...).
export function aplicarFiltrosPropiedad<T>(query: T, f: FiltrosPropiedad): T {
  let q: any = query
  if (f.operacion) q = q.eq('operacion', f.operacion)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.recamaras) q = q.gte('recamaras', f.recamaras)
  const minN = parseInt(f.precioMin.replace(/\D/g, ''), 10)
  if (!isNaN(minN)) q = q.gte('precio', minN)
  const maxN = parseInt(f.precioMax.replace(/\D/g, ''), 10)
  if (!isNaN(maxN)) q = q.lte('precio', maxN)
  return q as T
}

const OPERACIONES = [{ v: 'venta', l: 'Venta' }, { v: 'renta', l: 'Renta' }]
const TIPOS = [
  { v: 'casa', l: '🏡 Casa' }, { v: 'departamento', l: '🏢 Depto' },
  { v: 'local', l: '🏪 Local' }, { v: 'terreno', l: '🌄 Terreno' },
]

export function FiltrosBusquedaPropiedad({ value, onChange }: {
  value: FiltrosPropiedad
  onChange: (next: FiltrosPropiedad) => void
}) {
  const c = useColors()
  const set = (patch: Partial<FiltrosPropiedad>) => onChange({ ...value, ...patch })

  return (
    <View style={{ marginTop: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row} keyboardShouldPersistTaps="handled">
        {OPERACIONES.map(o => {
          const on = value.operacion === o.v
          return (
            <TouchableOpacity key={o.v} style={[st.chip, { borderColor: c.border }, on && st.chipOn]} onPress={() => set({ operacion: on ? null : o.v })}>
              <Text style={[st.chipTxt, { color: on ? '#fff' : c.textSub }]}>{o.l}</Text>
            </TouchableOpacity>
          )
        })}
        {TIPOS.map(t => {
          const on = value.tipo === t.v
          return (
            <TouchableOpacity key={t.v} style={[st.chip, { borderColor: c.border }, on && st.chipOn]} onPress={() => set({ tipo: on ? null : t.v })}>
              <Text style={[st.chipTxt, { color: on ? '#fff' : c.textSub }]}>{t.l}</Text>
            </TouchableOpacity>
          )
        })}
        {[1, 2, 3, 4].map(n => {
          const on = value.recamaras === n
          return (
            <TouchableOpacity key={n} style={[st.chip, { borderColor: c.border }, on && st.chipOn]} onPress={() => set({ recamaras: on ? null : n })}>
              <Text style={[st.chipTxt, { color: on ? '#fff' : c.textSub }]}>🛏️ {n}+</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <View style={st.precioRow}>
        <TextInput style={[st.precioInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
          value={value.precioMin} onChangeText={v => set({ precioMin: v })} placeholder="Precio mín." placeholderTextColor={c.textMute} keyboardType="numeric" />
        <TextInput style={[st.precioInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
          value={value.precioMax} onChangeText={v => set({ precioMax: v })} placeholder="Precio máx." placeholderTextColor={c.textMute} keyboardType="numeric" />
        {hayFiltrosActivos(value) && (
          <TouchableOpacity style={st.limpiar} onPress={() => onChange(FILTROS_VACIOS)}>
            <Text style={st.limpiarTxt}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  row: { gap: 7, paddingRight: 6, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  precioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  precioInput: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  limpiar: { paddingHorizontal: 6, paddingVertical: 8 },
  limpiarTxt: { color: '#e11d48', fontWeight: '800', fontSize: 12.5 },
})
