// Tabla EXCLUSIVA admin/supervisor: seguimiento de citas de venta.
// - Se llena sola con el dashboard de citas (trigger BD) e importa el Excel.
// - Al importar: mapea los nombres del Excel a los usuarios reales, respeta el
//   ORDEN del CSV y liga el asesor (asesor_id) para el popup de retro.
// - Filtros por columna (como Excel), celdas editables, encabezado + scroll
//   horizontal fijos (sticky).
import { useCallback, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import RetroCitaWizard, { CitaRetro } from '../../components/RetroCitaWizard'

type Fila = CitaRetro & {
  orden: number | null; telefono: string | null; detalles_pago: string | null
  dia_cita: string | null; prospecto: string | null; coordino: string | null; atendio: string | null
  estado_seguimiento: string | null; fecha_prox_seguimiento: string | null; retro_completada_at: string | null
}

type ColKey = keyof Fila
const COLS: { key: ColKey; label: string; w: number; edit: boolean }[] = [
  { key: 'cliente_nombre', label: 'Cliente', w: 180, edit: true },
  { key: 'telefono', label: 'Teléfono', w: 130, edit: true },
  { key: 'detalles_pago', label: 'Forma de pago', w: 230, edit: true },
  { key: 'interesado_en', label: 'Interesado en', w: 250, edit: true },
  { key: 'dia_cita', label: 'Día de la cita', w: 150, edit: true },
  { key: 'prospecto', label: 'Prospectó', w: 150, edit: true },
  { key: 'coordino', label: 'Coordinó', w: 140, edit: true },
  { key: 'atendio', label: 'Atendió', w: 150, edit: true },
  { key: 'retro_como_estuvo', label: 'Cómo estuvo la cita', w: 250, edit: true },
  { key: 'retro_info_extra', label: 'Info extra del cliente', w: 250, edit: true },
  { key: 'retro_plan_accion', label: 'Plan de acción', w: 250, edit: true },
  { key: 'estado_seguimiento', label: 'Estado seguimiento', w: 170, edit: true },
  { key: 'fecha_prox_seguimiento', label: 'Próx. seguimiento', w: 150, edit: true },
]

// ── Mapeo de nombres del Excel → nombre EXACTO del usuario en la app ─────────
// (los normaliza sin acentos/emojis/mayúsculas). Los no listados se dejan igual.
const MAPEO: Record<string, string> = {
  andres: 'Andres Asesor', andre: 'André Tenorio',
  ruben: 'Rayo⚡', rayo: 'Rayo⚡',
  ak: 'Aketzali', aketzali: 'Aketzali',
  alexis: 'Alexis', chucho: 'Chucho',
  fatima: 'Fatima Ruiz', 'fatima ruiz': 'Fatima Ruiz',
  alma: 'Alma Carrera', jessica: 'Jessica Santos', hugo: 'Hugo Prado',
  deisy: 'Deisy García Farias', martin: 'Martin Ballesteros',
  'carlos garcia': 'Carlos Garcia', 'carlos carbajal': 'Carlos Carbajal',
  brith: 'Brith Solis 🐉', brithanni: 'Brith Solis 🐉', brit: 'Brith Solis 🐉', 'brith solis': 'Brith Solis 🐉',
  karina: 'Karina Jaret', santi: 'Santiago Alfaro', santiago: 'Santiago Alfaro',
  sara: 'Sara', roberto: 'Roberto Betito', beto: 'Roberto Betito',
  oliver: 'Oliver Javier', leo: 'Leonardo Pirela', eve: 'Eve Limon',
  gabriela: 'Gabriela', alberto: 'Alberto Bucio', 'ana hilda': 'Ana Hilda Pérez Mar',
  angelica: 'Angelica Zarate', angy: 'Angelica Zarate', lydia: 'Lydia Rodríguez',
  marisol: 'Marisol', dax: 'Dax Alejandro', kevin: 'Kevin Ituriel',
  'wendy l': 'Wendoly Lefranc', wendy: 'Wendoly Lefranc', sofia: 'Sofia Camacho',
  oswaldo: 'Oswaldo Andrés Balderas', steve: 'Esteban Astor',
  'jose fernando': 'Jose Fernando', kary: 'Kary Mama Beto',
}
function normalizar(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, ' ')
}
function mapear(nombre: string | undefined): string {
  const v = (nombre ?? '').trim()
  if (!v) return v
  return MAPEO[normalizar(v)] ?? v
}

function arreglarEncoding(s: string): string {
  if (!s || !/[ÃÂ]/.test(s)) return s
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
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
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
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<{ id: string; key: ColKey } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [wizard, setWizard] = useState<Fila | null>(null)
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('citas_venta')
      .select('id, orden, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio, estado_seguimiento, fecha_prox_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion, retro_completada_at')
      .order('orden', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(3000)
    setFilas((data ?? []) as Fila[])
    setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const visibles = useMemo(() => filas.filter(f =>
    COLS.every(col => {
      const q = (filtros[col.key] ?? '').trim().toLowerCase()
      if (!q) return true
      return String((f[col.key] as string) ?? '').toLowerCase().includes(q)
    })
  ), [filas, filtros])

  async function guardarCelda(id: string, key: ColKey, valor: string) {
    setEdit(null)
    const v = valor.trim() || null
    setFilas(fs => fs.map(f => f.id === id ? { ...f, [key]: v } as Fila : f))
    await supabase.from('citas_venta').update({ [key]: v }).eq('id', id)
  }

  async function importarCSV() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true })
      if (res.canceled || !res.assets?.[0]) return
      setImportando(true); setMsg('Leyendo archivo…')
      const asset = res.assets[0]
      const texto = Platform.OS === 'web' && (asset as any).file
        ? await (asset as any).file.text()
        : await (await fetch(asset.uri)).text()
      const rows = parseCSV(texto)
      if (rows.length < 2) { setMsg('✗ El archivo no tiene filas.'); setImportando(false); return }

      // Perfiles para ligar asesor_id por nombre
      const { data: perfiles } = await supabase.from('profiles').select('id, nombre')
      const idPorNombre = new Map((perfiles ?? []).map((p: any) => [p.nombre, p.id]))

      const limpio = (s: string | undefined) => arreglarEncoding((s ?? '').trim())
      const registros = rows.slice(1).map((r, i) => {
        const atendio = mapear(limpio(r[8]))
        return {
          orden: i,
          cliente_nombre: limpio(r[0]) || null,
          telefono: (r[1] ?? '').replace(/[^\d+]/g, '') || null,
          detalles_pago: limpio(r[2]) || null,
          interesado_en: limpio(r[3]) || null,
          dia_cita: limpio(r[4]) || null,
          retro_como_estuvo: limpio(r[5]) || null,   // el viejo "¿Q PASÓ?"
          prospecto: mapear(limpio(r[6])) || null,
          coordino: mapear(limpio(r[7])) || null,
          atendio: atendio || null,
          asesor_id: idPorNombre.get(atendio) ?? null,
          estado_seguimiento: limpio(r[9]) || null,
          fecha_prox_seguimiento: limpio(r[10]) || null,
          origen: 'excel',
        }
      }).filter(x => x.cliente_nombre && x.cliente_nombre.toLowerCase() !== 'asd')

      setMsg('Reemplazando import anterior…')
      await supabase.from('citas_venta').delete().eq('origen', 'excel')
      setMsg(`Importando ${registros.length} citas…`)
      let ok = 0
      for (let i = 0; i < registros.length; i += 200) {
        const { error } = await supabase.from('citas_venta').insert(registros.slice(i, i + 200))
        if (!error) ok += Math.min(200, registros.length - i)
      }
      setMsg(`✓ Se importaron ${ok} citas (nombres mapeados y en orden del Excel).`)
      cargar()
    } catch (e: any) {
      setMsg('✗ Error al importar: ' + (e?.message ?? 'desconocido'))
    } finally { setImportando(false) }
  }

  const totalW = COLS.reduce((s, col) => s + col.w, 0) + 150  // + col retro

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>📋 Citas de venta</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{filas.length} citas · {visibles.length} visibles · exclusiva admin/supervisor</Text>
        </View>
        <TouchableOpacity style={[st.btnImport, importando && { opacity: 0.6 }]} onPress={importarCSV} disabled={importando}>
          {importando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.btnImportTxt}>⬆ Importar CSV</Text>}
        </TouchableOpacity>
      </View>
      {msg ? <Text style={[st.msg, { color: msg.startsWith('✓') ? '#1a6855' : msg.startsWith('✗') ? '#c0392b' : c.textMute }]}>{msg}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator stickyHeaderIndices={[]} style={{ flex: 1, marginTop: 8 }}>
          <View style={{ width: totalW, flex: 1 }}>
            {/* Encabezado + filtros (fijos arriba) */}
            <View style={[st.headRow, { backgroundColor: '#0f4c58', borderColor: c.border }]}>
              {COLS.map(col => (
                <Text key={col.key} style={[st.headCell, { width: col.w }]} numberOfLines={2}>{col.label}</Text>
              ))}
              <Text style={[st.headCell, { width: 150 }]}>Retro</Text>
            </View>
            <View style={[st.filterRow, { backgroundColor: c.card, borderColor: c.border }]}>
              {COLS.map(col => (
                <View key={col.key} style={{ width: col.w, paddingHorizontal: 4 }}>
                  <TextInput
                    style={[st.filterInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={filtros[col.key] ?? ''}
                    onChangeText={v => setFiltros(f => ({ ...f, [col.key]: v }))}
                    placeholder="Filtrar…" placeholderTextColor={c.textMute}
                  />
                </View>
              ))}
              <View style={{ width: 150 }} />
            </View>

            {/* Filas (scroll vertical propio → header y scroll horizontal quedan fijos) */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
              {visibles.map((f, idx) => (
                <View key={f.id} style={[st.row, { borderColor: c.border, backgroundColor: idx % 2 ? c.bg : c.card }]}>
                  {COLS.map(col => {
                    const editing = edit?.id === f.id && edit?.key === col.key
                    if (editing) {
                      return (
                        <TextInput
                          key={col.key}
                          style={[st.cell, st.cellEdit, { width: col.w, color: c.text, borderColor: '#1a6470' }]}
                          value={editVal} onChangeText={setEditVal} autoFocus multiline
                          onBlur={() => guardarCelda(f.id, col.key, editVal)}
                          onSubmitEditing={() => guardarCelda(f.id, col.key, editVal)}
                        />
                      )
                    }
                    const val = (f[col.key] as string) ?? ''
                    return (
                      <TouchableOpacity key={col.key} style={[st.cell, { width: col.w, borderColor: c.border }]}
                        activeOpacity={0.6}
                        onPress={() => { setEdit({ id: f.id, key: col.key }); setEditVal(val) }}>
                        <Text style={{ color: val ? c.text : c.textMute, fontSize: 12.5 }} numberOfLines={3}>{val || '—'}</Text>
                      </TouchableOpacity>
                    )
                  })}
                  {/* Retro */}
                  <View style={[st.cell, { width: 150, borderColor: c.border }]}>
                    <TouchableOpacity
                      style={[st.retroBtn, f.retro_completada_at ? st.retroHecha : st.retroPend]}
                      onPress={() => setWizard(f)}>
                      <Text style={[st.retroBtnTxt, { color: f.retro_completada_at ? '#1a6855' : '#fff' }]}>
                        {f.retro_completada_at ? '✓ Ver / editar' : '📝 Dar retro'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {visibles.length === 0 && (
                <Text style={[st.vacio, { color: c.textMute }]}>
                  {Object.values(filtros).some(v => v?.trim()) ? 'Sin resultados con esos filtros.' : 'Aún no hay citas. Importa tu Excel con "Importar CSV".'}
                </Text>
              )}
              <View style={{ height: 60 }} />
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {wizard && <RetroCitaWizard cita={wizard} onClose={() => setWizard(null)} onSaved={cargar} />}
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  btnImport: { backgroundColor: '#7a4f00', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnImportTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  msg: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  headRow: { flexDirection: 'row', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  headCell: { width: 150, fontSize: 11.5, fontWeight: '800', color: '#fff', paddingHorizontal: 8, paddingVertical: 11, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff22' },
  filterRow: { flexDirection: 'row', borderBottomWidth: 2, paddingVertical: 5 },
  filterInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5, fontSize: 11.5 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' },
  cell: { paddingHorizontal: 8, paddingVertical: 9, borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  cellEdit: { borderWidth: 1.5, borderRadius: 4, fontSize: 12.5, paddingVertical: 6, textAlignVertical: 'top' },
  retroBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  retroPend: { backgroundColor: '#1a6470' },
  retroHecha: { backgroundColor: '#1a685522', borderWidth: 1, borderColor: '#1a6855' },
  retroBtnTxt: { fontSize: 11.5, fontWeight: '800' },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5, lineHeight: 20, maxWidth: 420 },
})
