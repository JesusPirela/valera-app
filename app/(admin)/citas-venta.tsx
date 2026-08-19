// Tabla EXCLUSIVA admin/supervisor: seguimiento de citas de venta.
// - Se llena sola con el dashboard de citas (trigger BD) e importa el Excel.
// - Import: mapea nombres a usuarios reales, respeta el orden del CSV, liga asesor.
// - Filtros ESTILO EXCEL por columna (embudo → lista de valores con casillas),
//   celdas editables, encabezado + scroll horizontal fijos (sticky).
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform, Modal,
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
const VACIO = '(Vacías)'

const COLS: { key: ColKey; label: string; w: number }[] = [
  { key: 'cliente_nombre', label: 'Cliente', w: 180 },
  { key: 'telefono', label: 'Teléfono', w: 130 },
  { key: 'detalles_pago', label: 'Forma de pago', w: 230 },
  { key: 'interesado_en', label: 'Interesado en', w: 250 },
  { key: 'dia_cita', label: 'Día de la cita', w: 150 },
  { key: 'prospecto', label: 'Prospectó', w: 150 },
  { key: 'coordino', label: 'Coordinó', w: 140 },
  { key: 'atendio', label: 'Atendió', w: 150 },
  { key: 'retro_como_estuvo', label: 'Cómo estuvo la cita', w: 250 },
  { key: 'retro_info_extra', label: 'Info extra del cliente', w: 250 },
  { key: 'retro_plan_accion', label: 'Plan de acción', w: 250 },
  { key: 'estado_seguimiento', label: 'Estado seguimiento', w: 170 },
  { key: 'fecha_prox_seguimiento', label: 'Próx. seguimiento', w: 150 },
]

// ── Mapeo de nombres del Excel → nombre EXACTO del usuario en la app ─────────
const MAPEO: Record<string, string> = {
  andres: 'Andres Asesor', andre: 'André Tenorio',
  ruben: 'Rayo⚡', rayo: 'Rayo⚡',
  ak: 'Aketzali', aketzali: 'Aketzali',
  alexis: 'Alexis', chucho: 'Chucho',
  lupillo: 'Carlos Carbajal', ian: 'Ian Gonzalez',
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
  return v ? (MAPEO[normalizar(v)] ?? v) : v
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
  // Filtros estilo Excel: por columna, un conjunto de valores PERMITIDOS.
  const [filtrosSel, setFiltrosSel] = useState<Record<string, Set<string>>>({})
  const [dropCol, setDropCol] = useState<ColKey | null>(null)   // columna con el dropdown abierto
  const [dropSel, setDropSel] = useState<Set<string>>(new Set())
  const [dropBusca, setDropBusca] = useState('')
  const [edit, setEdit] = useState<{ id: string; key: ColKey } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [wizard, setWizard] = useState<Fila | null>(null)
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  // Scroll horizontal sincronizado entre encabezado (sticky), cuerpo y la barra
  // fija de abajo. Un lock evita el bucle entre los onScroll.
  const headerRef = useRef<ScrollView>(null)
  const bodyRef = useRef<ScrollView>(null)
  const barRef = useRef<ScrollView>(null)
  const syncing = useRef(false)
  function syncX(x: number, from: 'h' | 'b' | 'bar') {
    if (syncing.current) return
    syncing.current = true
    if (from !== 'h') headerRef.current?.scrollTo({ x, animated: false })
    if (from !== 'b') bodyRef.current?.scrollTo({ x, animated: false })
    if (from !== 'bar') barRef.current?.scrollTo({ x, animated: false })
    requestAnimationFrame(() => { syncing.current = false })
  }

  const cargar = useCallback(async () => {
    // Se pagina de 1000 en 1000 (Supabase limita cada consulta a 1000) para traer TODAS.
    const cols = 'id, orden, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio, estado_seguimiento, fecha_prox_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion, retro_completada_at'
    const todas: Fila[] = []; const paso = 1000
    for (let desde = 0; ; desde += paso) {
      const { data, error } = await supabase.from('citas_venta').select(cols)
        .order('orden', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(desde, desde + paso - 1)
      if (error || !data || data.length === 0) break
      todas.push(...(data as Fila[]))
      if (data.length < paso) break
    }
    setFilas(todas); setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const valorDe = (f: Fila, key: ColKey) => String((f[key] as string) ?? '').trim() || VACIO

  const visibles = useMemo(() => filas.filter(f =>
    Object.entries(filtrosSel).every(([k, set]) => set.has(valorDe(f, k as ColKey)))
  ), [filas, filtrosSel])

  // Valores distintos de una columna (para el dropdown), ordenados.
  const valoresColumna = (key: ColKey): string[] => {
    const s = new Set<string>()
    for (const f of filas) s.add(valorDe(f, key))
    return [...s].sort((a, b) => a === VACIO ? 1 : b === VACIO ? -1 : a.localeCompare(b, 'es', { numeric: true }))
  }

  function abrirDropdown(key: ColKey) {
    const actual = filtrosSel[key]
    setDropSel(actual ? new Set(actual) : new Set(valoresColumna(key)))  // todo marcado si no hay filtro
    setDropBusca('')
    setDropCol(key)
  }
  function aplicarDropdown() {
    if (!dropCol) return
    const todos = valoresColumna(dropCol)
    setFiltrosSel(prev => {
      const n = { ...prev }
      if (dropSel.size === 0 || dropSel.size === todos.length) delete n[dropCol]  // sin filtro
      else n[dropCol] = new Set(dropSel)
      return n
    })
    setDropCol(null)
  }

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
        ? await (asset as any).file.text() : await (await fetch(asset.uri)).text()
      const rows = parseCSV(texto)
      if (rows.length < 2) { setMsg('✗ El archivo no tiene filas.'); setImportando(false); return }
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
          retro_como_estuvo: limpio(r[5]) || null,
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

  const totalW = COLS.reduce((s, col) => s + col.w, 0) + 150
  const dropValores = dropCol ? valoresColumna(dropCol).filter(v => !dropBusca.trim() || v.toLowerCase().includes(dropBusca.toLowerCase())) : []

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>📋 Citas de venta</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{filas.length} citas · {visibles.length} visibles · exclusiva admin/supervisor</Text>
        </View>
        {Object.keys(filtrosSel).length > 0 && (
          <TouchableOpacity style={st.btnLimpiar} onPress={() => setFiltrosSel({})}>
            <Text style={st.btnLimpiarTxt}>✕ Quitar filtros</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[st.btnImport, importando && { opacity: 0.6 }]} onPress={importarCSV} disabled={importando}>
          {importando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.btnImportTxt}>⬆ Importar CSV</Text>}
        </TouchableOpacity>
      </View>
      {msg ? <Text style={[st.msg, { color: msg.startsWith('✓') ? '#1a6855' : msg.startsWith('✗') ? '#c0392b' : c.textMute }]}>{msg}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={{ flex: 1, marginTop: 8 }}
          showsVerticalScrollIndicator persistentScrollbar
          stickyHeaderIndices={[0]}
          scrollEventThrottle={16}
        >
          {/* 0 · Encabezado STICKY (la barra horizontal va abajo, fija) */}
          <ScrollView
            ref={headerRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
            onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'h')}
            style={{ backgroundColor: c.bg }}
          >
            <View style={[st.headRow, { backgroundColor: '#0f4c58', width: totalW }]}>
              {COLS.map(col => {
                const activo = !!filtrosSel[col.key]
                return (
                  <TouchableOpacity key={col.key} style={[st.headCell, { width: col.w }]} activeOpacity={0.7} onPress={() => abrirDropdown(col.key)}>
                    <Text style={st.headTxt} numberOfLines={2}>{col.label}</Text>
                    <Text style={[st.embudo, activo && st.embudoActivo]}>{activo ? '▼●' : '▾'}</Text>
                  </TouchableOpacity>
                )
              })}
              <Text style={[st.headCell, st.headTxt, { width: 150 }]}>Retro</Text>
            </View>
          </ScrollView>

          {/* 1 · Cuerpo — se mueve en sinc. con el encabezado y la barra de abajo */}
          <ScrollView
            ref={bodyRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
            onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'b')}
          >
            <View style={{ width: totalW }}>
              {visibles.map((f, idx) => (
                <View key={f.id} style={[st.row, { borderColor: c.border, backgroundColor: idx % 2 ? c.bg : c.card }]}>
                  {COLS.map(col => {
                    const editing = edit?.id === f.id && edit?.key === col.key
                    if (editing) {
                      return (
                        <TextInput key={col.key}
                          style={[st.cell, st.cellEdit, { width: col.w, color: c.text }]}
                          value={editVal} onChangeText={setEditVal} autoFocus multiline
                          onBlur={() => guardarCelda(f.id, col.key, editVal)}
                          onSubmitEditing={() => guardarCelda(f.id, col.key, editVal)} />
                      )
                    }
                    const val = (f[col.key] as string) ?? ''
                    return (
                      <TouchableOpacity key={col.key} style={[st.cell, { width: col.w, borderColor: c.border }]} activeOpacity={0.6}
                        onPress={() => { setEdit({ id: f.id, key: col.key }); setEditVal(val) }}>
                        <Text style={{ color: val ? c.text : c.textMute, fontSize: 12.5 }} numberOfLines={3}>{val || '—'}</Text>
                      </TouchableOpacity>
                    )
                  })}
                  <View style={[st.cell, { width: 150, borderColor: c.border }]}>
                    <TouchableOpacity style={[st.retroBtn, f.retro_completada_at ? st.retroHecha : st.retroPend]} onPress={() => setWizard(f)}>
                      <Text style={[st.retroBtnTxt, { color: f.retro_completada_at ? '#1a6855' : '#fff' }]}>{f.retro_completada_at ? '✓ Ver / editar' : '📝 Dar retro'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {visibles.length === 0 && (
                <Text style={[st.vacio, { color: c.textMute }]}>
                  {Object.keys(filtrosSel).length ? 'Sin resultados con esos filtros.' : 'Aún no hay citas. Importa tu Excel con "Importar CSV".'}
                </Text>
              )}
              <View style={{ height: 60 }} />
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Barra de desplazamiento horizontal FIJA al pie (siempre visible) */}
      {!loading && (
        <ScrollView
          ref={barRef} horizontal showsHorizontalScrollIndicator persistentScrollbar scrollEventThrottle={16}
          onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'bar')}
          style={st.barraAbajo}
        >
          <View style={{ width: totalW, height: 1 }} />
        </ScrollView>
      )}

      {/* Dropdown de filtro estilo Excel */}
      <Modal visible={dropCol !== null} transparent animationType="fade" onRequestClose={() => setDropCol(null)}>
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setDropCol(null)}>
          <TouchableOpacity activeOpacity={1} style={[st.dropCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation?.()}>
            <Text style={[st.dropTitulo, { color: c.text }]}>Filtrar: {COLS.find(cc => cc.key === dropCol)?.label}</Text>
            <TextInput
              style={[st.dropBusca, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={dropBusca} onChangeText={setDropBusca} placeholder="Buscar valor…" placeholderTextColor={c.textMute} />
            <View style={st.dropTodos}>
              <TouchableOpacity onPress={() => setDropSel(new Set(dropValores))}><Text style={st.dropAccion}>Seleccionar todo</Text></TouchableOpacity>
              <Text style={{ color: c.textMute }}>·</Text>
              <TouchableOpacity onPress={() => setDropSel(new Set())}><Text style={st.dropAccion}>Ninguno</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320, marginTop: 6 }}>
              {dropValores.map(v => {
                const on = dropSel.has(v)
                return (
                  <TouchableOpacity key={v} style={st.dropItem} onPress={() => setDropSel(s => { const n = new Set(s); on ? n.delete(v) : n.add(v); return n })}>
                    <View style={[st.check, on && st.checkOn]}>{on ? <Text style={st.checkMark}>✓</Text> : null}</View>
                    <Text style={[st.dropItemTxt, { color: c.text }]} numberOfLines={1}>{v}</Text>
                  </TouchableOpacity>
                )
              })}
              {dropValores.length === 0 && <Text style={{ color: c.textMute, padding: 12, fontSize: 12.5 }}>Sin valores.</Text>}
            </ScrollView>
            <View style={st.dropAcciones}>
              <TouchableOpacity style={st.dropCancel} onPress={() => setDropCol(null)}><Text style={[st.dropCancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={st.dropOk} onPress={aplicarDropdown}><Text style={st.dropOkTxt}>Aplicar</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {wizard && <RetroCitaWizard cita={wizard} onClose={() => setWizard(null)} onSaved={cargar} />}
    </View>
  )
}

const st = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  btnLimpiar: { borderWidth: 1, borderColor: '#c0392b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  btnLimpiarTxt: { color: '#c0392b', fontWeight: '800', fontSize: 12.5 },
  btnImport: { backgroundColor: '#7a4f00', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnImportTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  msg: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  headRow: { flexDirection: 'row', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 11, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff22' },
  headTxt: { flex: 1, fontSize: 11.5, fontWeight: '800', color: '#fff' },
  embudo: { color: '#ffffff99', fontSize: 12, fontWeight: '900' },
  embudoActivo: { color: '#f4c752' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' },
  cell: { paddingHorizontal: 8, paddingVertical: 9, borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  cellEdit: { borderWidth: 1.5, borderColor: '#1a6470', borderRadius: 4, fontSize: 12.5, paddingVertical: 6, textAlignVertical: 'top' },
  retroBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  retroPend: { backgroundColor: '#1a6470' },
  retroHecha: { backgroundColor: '#1a685522', borderWidth: 1, borderColor: '#1a6855' },
  retroBtnTxt: { fontSize: 11.5, fontWeight: '800' },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5, lineHeight: 20, maxWidth: 420 },
  barraAbajo: { height: 16, flexGrow: 0, marginTop: 2 },
  // Dropdown
  dropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropCard: { width: '100%', maxWidth: 380, borderRadius: 14, padding: 16 },
  dropTitulo: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  dropBusca: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  dropTodos: { flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' },
  dropAccion: { color: '#1a6470', fontWeight: '800', fontSize: 12.5 },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#9aa', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  dropItemTxt: { fontSize: 13.5, flex: 1 },
  dropAcciones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dropCancel: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropCancelTxt: { fontWeight: '700', fontSize: 14 },
  dropOk: { flex: 1, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropOkTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
