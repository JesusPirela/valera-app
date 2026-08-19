// Tabla EXCLUSIVA admin/supervisor: seguimiento de citas de venta.
// - Se llena sola con el dashboard de citas (trigger en la BD) y con el import
//   del Excel histórico (botón "Importar CSV").
// - Cada fila tiene "📝 Retro" que abre el wizard de 3 preguntas.
import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform, Alert,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import RetroCitaWizard, { CitaRetro } from '../../components/RetroCitaWizard'

type Fila = CitaRetro & {
  telefono: string | null; detalles_pago: string | null; dia_cita: string | null
  prospecto: string | null; coordino: string | null; atendio: string | null
  estado_seguimiento: string | null; fecha_prox_seguimiento: string | null
  retro_completada_at: string | null
}

// Columnas de la tabla (ancho fijo para el scroll horizontal).
const COLS: { key: keyof Fila | 'retro'; label: string; w: number }[] = [
  { key: 'cliente_nombre', label: 'Cliente', w: 170 },
  { key: 'telefono', label: 'Teléfono', w: 130 },
  { key: 'detalles_pago', label: 'Forma de pago', w: 220 },
  { key: 'interesado_en', label: 'Interesado en', w: 240 },
  { key: 'dia_cita', label: 'Día de la cita', w: 150 },
  { key: 'prospecto', label: 'Prospectó', w: 120 },
  { key: 'coordino', label: 'Coordinó', w: 110 },
  { key: 'atendio', label: 'Atendió', w: 120 },
  { key: 'retro', label: 'Retroalimentación', w: 150 },
  { key: 'retro_como_estuvo', label: 'Cómo estuvo', w: 240 },
  { key: 'retro_info_extra', label: 'Info extra del cliente', w: 240 },
  { key: 'retro_plan_accion', label: 'Plan de acción', w: 240 },
  { key: 'estado_seguimiento', label: 'Estado seguimiento', w: 160 },
  { key: 'fecha_prox_seguimiento', label: 'Próx. seguimiento', w: 150 },
]

// Arregla el mojibake típico de Excel (UTF-8 leído como Latin-1): "RamÃ³n" → "Ramón".
function arreglarEncoding(s: string): string {
  if (!s || !/[ÃÂ][\x80-\xbf-¿]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map(ch => ch.charCodeAt(0) & 0xff))
    // @ts-ignore TextDecoder existe en web (donde se usa el import)
    return new TextDecoder('utf-8').decode(bytes)
  } catch { return s }
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (ch !== '\r') cur += ch
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

export default function CitasVenta() {
  const c = useColors()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [wizard, setWizard] = useState<Fila | null>(null)
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('citas_venta')
      .select('id, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio, estado_seguimiento, fecha_prox_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion, retro_completada_at')
      .order('created_at', { ascending: false })
      .limit(2000)
    setFilas((data ?? []) as Fila[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const q = busca.trim().toLowerCase()
  const visibles = q
    ? filas.filter(f => [f.cliente_nombre, f.telefono, f.interesado_en, f.atendio, f.prospecto]
        .some(v => (v ?? '').toLowerCase().includes(q)))
    : filas

  async function importarCSV() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true })
      if (res.canceled || !res.assets?.[0]) return
      setImportando(true); setMsg('Leyendo archivo…')
      const asset = res.assets[0]
      let texto = ''
      if (Platform.OS === 'web' && (asset as any).file) {
        texto = await (asset as any).file.text()
      } else {
        texto = await (await fetch(asset.uri)).text()
      }
      const rows = parseCSV(texto)
      if (rows.length < 2) { setMsg('✗ El archivo no tiene filas.'); setImportando(false); return }
      // Se mapea por POSICIÓN (los encabezados vienen con mojibake). Estructura del Excel:
      // 0 Cliente · 1 Número · 2 Detalles · 3 Interesado en · 4 Día · 5 ¿Q pasó? ·
      // 6 Prospectó · 7 Coordinó · 8 Atendió · 9 Estado seguimiento · 10 Próx. seguimiento
      const limpio = (s: string | undefined) => arreglarEncoding((s ?? '').trim())
      const registros = rows.slice(1).map(r => ({
        cliente_nombre: limpio(r[0]) || null,
        telefono: (r[1] ?? '').replace(/[^\d+]/g, '') || null,
        detalles_pago: limpio(r[2]) || null,
        interesado_en: limpio(r[3]) || null,
        dia_cita: limpio(r[4]) || null,
        retro_como_estuvo: limpio(r[5]) || null,   // el viejo "¿Q PASÓ?" entra como "cómo estuvo"
        prospecto: limpio(r[6]) || null,
        coordino: limpio(r[7]) || null,
        atendio: limpio(r[8]) || null,
        estado_seguimiento: limpio(r[9]) || null,
        fecha_prox_seguimiento: limpio(r[10]) || null,
        origen: 'excel',
      })).filter(x => x.cliente_nombre && x.cliente_nombre.toLowerCase() !== 'asd')

      setMsg(`Importando ${registros.length} citas…`)
      let ok = 0
      for (let i = 0; i < registros.length; i += 200) {
        const lote = registros.slice(i, i + 200)
        const { error } = await supabase.from('citas_venta').insert(lote)
        if (!error) ok += lote.length
      }
      setMsg(`✓ Se importaron ${ok} citas.`)
      cargar()
    } catch (e: any) {
      setMsg('✗ Error al importar: ' + (e?.message ?? 'desconocido'))
    } finally {
      setImportando(false)
    }
  }

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>📋 Citas de venta</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{filas.length} citas · exclusiva admin/supervisor</Text>
        </View>
        <TouchableOpacity style={[st.btnImport, importando && { opacity: 0.6 }]} onPress={importarCSV} disabled={importando}>
          {importando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.btnImportTxt}>⬆ Importar CSV</Text>}
        </TouchableOpacity>
      </View>
      {msg ? <Text style={[st.msg, { color: msg.startsWith('✓') ? '#1a6855' : msg.startsWith('✗') ? '#c0392b' : c.textMute }]}>{msg}</Text> : null}

      <TextInput
        style={[st.search, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        placeholder="Buscar por cliente, teléfono, propiedad o asesor…"
        placeholderTextColor={c.textMute}
        value={busca} onChangeText={setBusca}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View>
            {/* Encabezado */}
            <View style={[st.headRow, { borderColor: c.border, backgroundColor: c.card }]}>
              {COLS.map(col => (
                <Text key={col.key as string} style={[st.headCell, { width: col.w, color: c.textSub, borderColor: c.border }]} numberOfLines={2}>{col.label}</Text>
              ))}
            </View>
            <ScrollView style={{ flex: 1 }}>
              {visibles.map(f => (
                <View key={f.id} style={[st.row, { borderColor: c.border }]}>
                  {COLS.map(col => {
                    if (col.key === 'retro') {
                      const hecha = !!f.retro_completada_at
                      return (
                        <View key="retro" style={[st.cell, { width: col.w, borderColor: c.border, alignItems: 'flex-start' }]}>
                          <TouchableOpacity style={[st.retroBtn, hecha ? st.retroHecha : st.retroPend]} onPress={() => setWizard(f)}>
                            <Text style={[st.retroBtnTxt, { color: hecha ? '#1a6855' : '#fff' }]}>{hecha ? '✓ Ver / editar' : '📝 Dar retro'}</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    }
                    const val = (f[col.key as keyof Fila] as string) ?? ''
                    return (
                      <Text key={col.key as string} style={[st.cell, { width: col.w, color: c.text, borderColor: c.border }]} numberOfLines={3}>{val || '—'}</Text>
                    )
                  })}
                </View>
              ))}
              {visibles.length === 0 && (
                <Text style={[st.vacio, { color: c.textMute }]}>
                  {q ? 'Sin resultados.' : 'Aún no hay citas. Importa tu Excel con "Importar CSV" o espera a que se creen citas en el dashboard.'}
                </Text>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {wizard && (
        <RetroCitaWizard
          cita={wizard}
          onClose={() => setWizard(null)}
          onSaved={cargar}
        />
      )}
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  btnImport: { backgroundColor: '#7a4f00', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnImportTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  msg: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginVertical: 10 },
  headRow: { flexDirection: 'row', borderBottomWidth: 2, borderTopWidth: 1 },
  headCell: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 10, borderRightWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { fontSize: 12.5, paddingHorizontal: 8, paddingVertical: 9, borderRightWidth: StyleSheet.hairlineWidth },
  retroBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  retroPend: { backgroundColor: '#1a6470' },
  retroHecha: { backgroundColor: '#1a685522', borderWidth: 1, borderColor: '#1a6855' },
  retroBtnTxt: { fontSize: 11.5, fontWeight: '800' },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5, lineHeight: 20, maxWidth: 420 },
})
