// Tabla EXCLUSIVA admin/supervisor: seguimiento de citas de venta.
// - Import del Excel (mapea nombres, orden del CSV, liga asesor) + autollenado
//   desde el dashboard (solo citas coordinadas por Alexis o Chucho).
// - VIRTUALIZADA (FlatList, altura de fila fija): solo dibuja lo visible → RAM baja.
// - Filtros estilo Excel, celdas editables (menús para cliente/usuarios, calendario
//   para el día), borrar filas, encabezado sticky y barras de scroll siempre visibles.
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Platform, Modal, Alert,
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
type Tipo = 'texto' | 'usuario' | 'cliente' | 'fecha'
const VACIO = '(Vacías)'
const ROW_H = 54  // altura fija de fila (necesaria para virtualizar con getItemLayout)

const COLS: { key: ColKey; label: string; w: number; tipo: Tipo }[] = [
  { key: 'cliente_nombre', label: 'Cliente', w: 190, tipo: 'cliente' },
  { key: 'telefono', label: 'Teléfono', w: 130, tipo: 'texto' },
  { key: 'detalles_pago', label: 'Forma de pago', w: 230, tipo: 'texto' },
  { key: 'interesado_en', label: 'Interesado en', w: 250, tipo: 'texto' },
  { key: 'dia_cita', label: 'Día de la cita', w: 170, tipo: 'fecha' },
  { key: 'prospecto', label: 'Prospectó', w: 160, tipo: 'usuario' },
  { key: 'coordino', label: 'Coordinó', w: 150, tipo: 'usuario' },
  { key: 'atendio', label: 'Atendió', w: 160, tipo: 'usuario' },
  { key: 'retro_como_estuvo', label: 'Cómo estuvo la cita', w: 250, tipo: 'texto' },
  { key: 'retro_info_extra', label: 'Info extra del cliente', w: 250, tipo: 'texto' },
  { key: 'retro_plan_accion', label: 'Plan de acción', w: 250, tipo: 'texto' },
  { key: 'estado_seguimiento', label: 'Estado seguimiento', w: 170, tipo: 'texto' },
  { key: 'fecha_prox_seguimiento', label: 'Próx. seguimiento', w: 150, tipo: 'texto' },
]
const ACC_W = 130  // columna de acciones (retro + borrar)

const MAPEO: Record<string, string> = {
  andres: 'Andres Asesor', andre: 'André Tenorio', ruben: 'Rayo⚡', rayo: 'Rayo⚡',
  ak: 'Aketzali', aketzali: 'Aketzali', alexis: 'Alexis', chucho: 'Chucho',
  lupillo: 'Carlos Carbajal', ian: 'Ian Gonzalez',
  fatima: 'Fatima Ruiz', 'fatima ruiz': 'Fatima Ruiz', alma: 'Alma Carrera',
  jessica: 'Jessica Santos', hugo: 'Hugo Prado', deisy: 'Deisy García Farias',
  martin: 'Martin Ballesteros', 'carlos garcia': 'Carlos Garcia', 'carlos carbajal': 'Carlos Carbajal',
  brith: 'Brith Solis 🐉', brithanni: 'Brith Solis 🐉', brit: 'Brith Solis 🐉', 'brith solis': 'Brith Solis 🐉',
  karina: 'Karina Jaret', santi: 'Santiago Alfaro', santiago: 'Santiago Alfaro', sara: 'Sara',
  roberto: 'Roberto Betito', beto: 'Roberto Betito', oliver: 'Oliver Javier',
  leo: 'Leonardo Pirela', eve: 'Eve Limon', gabriela: 'Gabriela', alberto: 'Alberto Bucio',
  'ana hilda': 'Ana Hilda Pérez Mar', angelica: 'Angelica Zarate', angy: 'Angelica Zarate',
  lydia: 'Lydia Rodríguez', marisol: 'Marisol', dax: 'Dax Alejandro', kevin: 'Kevin Ituriel',
  'wendy l': 'Wendoly Lefranc', wendy: 'Wendoly Lefranc', sofia: 'Sofia Camacho',
  oswaldo: 'Oswaldo Andrés Balderas', steve: 'Esteban Astor', 'jose fernando': 'Jose Fernando', kary: 'Kary Mama Beto',
}
function normalizar(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, ' ')
}
function mapear(n: string | undefined): string { const v = (n ?? '').trim(); return v ? (MAPEO[normalizar(v)] ?? v) : v }
function arreglarEncoding(s: string): string {
  if (!s || !/[ÃÂ]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map(ch => ch.charCodeAt(0) & 0xff))
    // @ts-ignore TextDecoder existe en web
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
function confirmar(msg: string, onSi: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(msg)) onSi() }
  else Alert.alert('Confirmar', msg, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: onSi }])
}

// ── Fila (solo muestra; memoizada y de altura fija → virtualización sin lag) ──
const FilaRow = memo(function FilaRow({ f, idx, onTap, onRetro, onDelete }: {
  f: Fila; idx: number
  onTap: (id: string, k: ColKey, t: Tipo, val: string) => void
  onRetro: (f: Fila) => void; onDelete: (f: Fila) => void
}) {
  const c = useColors()
  return (
    <View style={[st.row, { height: ROW_H, borderColor: c.border, backgroundColor: idx % 2 ? c.bg : c.card }]}>
      {COLS.map(col => {
        const val = (f[col.key] as string) ?? ''
        return (
          <TouchableOpacity key={col.key} style={[st.cell, { width: col.w, borderColor: c.border }]} activeOpacity={0.6}
            onPress={() => onTap(f.id, col.key, col.tipo, val)}>
            <Text style={{ color: val ? c.text : c.textMute, fontSize: 12.5 }} numberOfLines={2}>{val || '—'}{col.tipo !== 'texto' ? '  ▾' : ''}</Text>
          </TouchableOpacity>
        )
      })}
      <View style={[st.cell, { width: ACC_W, borderColor: c.border, flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
        <TouchableOpacity style={[st.retroBtn, f.retro_completada_at ? st.retroHecha : st.retroPend]} onPress={() => onRetro(f)}>
          <Text style={[st.retroBtnTxt, { color: f.retro_completada_at ? '#1a6855' : '#fff' }]}>{f.retro_completada_at ? '✓' : '📝'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(f)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}><Text style={st.delTxt}>🗑</Text></TouchableOpacity>
      </View>
    </View>
  )
}, (a, b) => a.f === b.f && a.idx === b.idx)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function fmtFecha(d: Date): string {
  const h = d.getHours(); const ampm = h < 12 ? 'am' : 'pm'; const h12 = h % 12 || 12
  return `${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}, ${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}
function CalendarioHora({ onConfirm, onClose }: { onConfirm: (display: string, iso: string) => void; onClose: () => void }) {
  const c = useColors()
  const [d, setD] = useState(() => { const x = new Date(); x.setMinutes(0); return x })
  const [vista, setVista] = useState(() => new Date(d.getFullYear(), d.getMonth(), 1))
  const y = vista.getFullYear(), m = vista.getMonth()
  const off = (new Date(y, m, 1).getDay() + 6) % 7
  const dias = new Date(y, m + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(off).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)]
  const set = (patch: Partial<{ dd: number; hh: number; mm: number }>) => setD(prev => { const x = new Date(prev); if (patch.dd) x.setFullYear(y, m, patch.dd); if (patch.hh != null) x.setHours(patch.hh); if (patch.mm != null) x.setMinutes(patch.mm); return x })
  const h = d.getHours()
  return (
    <View style={[st.dropCard, { backgroundColor: c.card, maxWidth: 340 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setVista(new Date(y, m - 1, 1))}><Text style={st.calNav}>‹</Text></TouchableOpacity>
        <Text style={[st.dropTitulo, { color: c.text, marginBottom: 0, textTransform: 'capitalize' }]}>{MESES[m]} {y}</Text>
        <TouchableOpacity onPress={() => setVista(new Date(y, m + 1, 1))}><Text style={st.calNav}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' }}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((w, i) => <Text key={i} style={[st.calDow, { color: c.textMute }]}>{w}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {celdas.map((dd, i) => {
          if (dd === null) return <View key={i} style={st.calCell} />
          const sel = dd === d.getDate() && m === d.getMonth() && y === d.getFullYear()
          return (
            <TouchableOpacity key={i} style={st.calCell} onPress={() => set({ dd })}>
              <View style={[st.calDia, sel && { backgroundColor: '#1a6470' }]}><Text style={{ color: sel ? '#fff' : c.text, fontWeight: sel ? '800' : '500', fontSize: 13 }}>{dd}</Text></View>
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' }}>
        <Text style={{ color: c.textMute, fontSize: 12 }}>Hora:</Text>
        <TouchableOpacity onPress={() => set({ hh: (h + 23) % 24 })}><Text style={st.calStep}>−</Text></TouchableOpacity>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 15, minWidth: 26, textAlign: 'center' }}>{h % 12 || 12}</Text>
        <TouchableOpacity onPress={() => set({ hh: (h + 1) % 24 })}><Text style={st.calStep}>+</Text></TouchableOpacity>
        <Text style={{ color: c.text }}>:</Text>
        <TouchableOpacity onPress={() => set({ mm: (d.getMinutes() + 45) % 60 })}><Text style={st.calStep}>−</Text></TouchableOpacity>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 15, minWidth: 30, textAlign: 'center' }}>{String(d.getMinutes()).padStart(2, '0')}</Text>
        <TouchableOpacity onPress={() => set({ mm: (d.getMinutes() + 15) % 60 })}><Text style={st.calStep}>+</Text></TouchableOpacity>
        <Text style={{ color: c.text, fontWeight: '700', marginLeft: 4 }}>{h < 12 ? 'am' : 'pm'}</Text>
      </View>
      <View style={st.dropAcciones}>
        <TouchableOpacity style={st.dropCancel} onPress={onClose}><Text style={[st.dropCancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
        <TouchableOpacity style={st.dropOk} onPress={() => onConfirm(fmtFecha(d), d.toISOString())}><Text style={st.dropOkTxt}>Aceptar</Text></TouchableOpacity>
      </View>
    </View>
  )
}

export default function CitasVenta() {
  const c = useColors()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<{ id: string; nombre: string }[]>([])
  const [clientes, setClientes] = useState<{ id: string; nombre: string; telefono: string | null }[]>([])
  const [filtrosSel, setFiltrosSel] = useState<Record<string, Set<string>>>({})
  const [dropCol, setDropCol] = useState<ColKey | null>(null)
  const [dropSel, setDropSel] = useState<Set<string>>(new Set())
  const [dropBusca, setDropBusca] = useState('')
  const [editTxt, setEditTxt] = useState<{ id: string; key: ColKey; val: string } | null>(null)
  const [picker, setPicker] = useState<{ id: string; key: ColKey; tipo: Tipo } | null>(null)
  const [pickBusca, setPickBusca] = useState('')
  const [wizard, setWizard] = useState<Fila | null>(null)
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  const [listH, setListH] = useState(0)   // alto medido del cuerpo (para virtualizar la FlatList)

  const headerRef = useRef<ScrollView>(null); const bodyRef = useRef<ScrollView>(null); const barRef = useRef<ScrollView>(null)
  const listRef = useRef<FlatList>(null); const vbarRef = useRef<ScrollView>(null)
  const syncingX = useRef(false); const syncingY = useRef(false)
  function syncX(x: number, from: 'h' | 'b' | 'bar') {
    if (syncingX.current) return; syncingX.current = true
    if (from !== 'h') headerRef.current?.scrollTo({ x, animated: false })
    if (from !== 'b') bodyRef.current?.scrollTo({ x, animated: false })
    if (from !== 'bar') barRef.current?.scrollTo({ x, animated: false })
    requestAnimationFrame(() => { syncingX.current = false })
  }
  function syncY(yy: number, from: 'list' | 'vbar') {
    if (syncingY.current) return; syncingY.current = true
    if (from !== 'list') listRef.current?.scrollToOffset({ offset: yy, animated: false })
    if (from !== 'vbar') vbarRef.current?.scrollTo({ y: yy, animated: false })
    requestAnimationFrame(() => { syncingY.current = false })
  }

  const cargar = useCallback(async () => {
    const cols = 'id, orden, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio, estado_seguimiento, fecha_prox_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion, retro_completada_at'
    const todas: Fila[] = []; const paso = 1000
    for (let desde = 0; ; desde += paso) {
      const { data, error } = await supabase.from('citas_venta').select(cols)
        .order('orden', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
        .range(desde, desde + paso - 1)
      if (error || !data || data.length === 0) break
      todas.push(...(data as Fila[]))
      if (data.length < paso) break
    }
    setFilas(todas); setLoading(false)
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  useEffect(() => {
    supabase.from('profiles').select('id, nombre').order('nombre').then(({ data }) => setProfiles((data ?? []).filter((p: any) => p.nombre)))
    supabase.from('clientes').select('id, nombre, telefono').is('eliminado_at', null).order('nombre').limit(5000).then(({ data }) => setClientes(data ?? []))
  }, [])

  const valorDe = (f: Fila, key: ColKey) => String((f[key] as string) ?? '').trim() || VACIO
  const visibles = useMemo(() => filas.filter(f =>
    Object.entries(filtrosSel).every(([k, set]) => set.has(valorDe(f, k as ColKey)))
  ), [filas, filtrosSel])

  const valoresColumna = (key: ColKey): string[] => {
    const s = new Set<string>(); for (const f of filas) s.add(valorDe(f, key))
    return [...s].sort((a, b) => a === VACIO ? 1 : b === VACIO ? -1 : a.localeCompare(b, 'es', { numeric: true }))
  }
  const abrirDropdown = (key: ColKey) => { const a = filtrosSel[key]; setDropSel(a ? new Set(a) : new Set(valoresColumna(key))); setDropBusca(''); setDropCol(key) }
  const aplicarDropdown = () => {
    if (!dropCol) return
    const todos = valoresColumna(dropCol)
    setFiltrosSel(prev => { const n = { ...prev }; (dropSel.size === 0 || dropSel.size === todos.length) ? delete n[dropCol] : (n[dropCol] = new Set(dropSel)); return n })
    setDropCol(null)
  }

  const aplicarCambio = useCallback(async (id: string, patch: Record<string, any>) => {
    setFilas(fs => fs.map(f => f.id === id ? { ...f, ...patch } as Fila : f))
    await supabase.from('citas_venta').update(patch).eq('id', id)
  }, [])
  const onTap = useCallback((id: string, k: ColKey, t: Tipo, val: string) => {
    if (t === 'texto') setEditTxt({ id, key: k, val })
    else { setPickBusca(''); setPicker({ id, key: k, tipo: t }) }
  }, [])
  const onRetro = useCallback((f: Fila) => setWizard(f), [])
  const onDelete = useCallback((f: Fila) => {
    confirmar(`¿Borrar la cita de "${f.cliente_nombre ?? 'sin nombre'}"?`, async () => {
      setFilas(fs => fs.filter(x => x.id !== f.id))
      await supabase.from('citas_venta').delete().eq('id', f.id)
    })
  }, [])

  function elegirUsuario(nombre: string, id: string | null) {
    if (!picker) return
    const patch: Record<string, any> = { [picker.key]: nombre || null }
    if (picker.key === 'atendio') patch.asesor_id = id
    aplicarCambio(picker.id, patch); setPicker(null)
  }
  function elegirCliente(nombre: string, tel: string | null) {
    if (!picker) return
    const patch: Record<string, any> = { cliente_nombre: nombre }
    if (tel) patch.telefono = tel
    aplicarCambio(picker.id, patch); setPicker(null)
  }

  async function importarCSV() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true })
      if (res.canceled || !res.assets?.[0]) return
      setImportando(true); setMsg('Leyendo archivo…')
      const asset = res.assets[0]
      const texto = Platform.OS === 'web' && (asset as any).file ? await (asset as any).file.text() : await (await fetch(asset.uri)).text()
      const rows = parseCSV(texto)
      if (rows.length < 2) { setMsg('✗ El archivo no tiene filas.'); setImportando(false); return }
      const { data: perfiles } = await supabase.from('profiles').select('id, nombre')
      const idPorNombre = new Map((perfiles ?? []).map((p: any) => [p.nombre, p.id]))
      const limpio = (s: string | undefined) => arreglarEncoding((s ?? '').trim())
      const registros = rows.slice(1).map((r, i) => {
        const atendio = mapear(limpio(r[8]))
        return {
          orden: i, cliente_nombre: limpio(r[0]) || null, telefono: (r[1] ?? '').replace(/[^\d+]/g, '') || null,
          detalles_pago: limpio(r[2]) || null, interesado_en: limpio(r[3]) || null, dia_cita: limpio(r[4]) || null,
          retro_como_estuvo: limpio(r[5]) || null, prospecto: mapear(limpio(r[6])) || null, coordino: mapear(limpio(r[7])) || null,
          atendio: atendio || null, asesor_id: idPorNombre.get(atendio) ?? null,
          estado_seguimiento: limpio(r[9]) || null, fecha_prox_seguimiento: limpio(r[10]) || null, origen: 'excel',
        }
      }).filter(x => x.cliente_nombre && x.cliente_nombre.toLowerCase() !== 'asd')
      setMsg('Reemplazando import anterior…')
      await supabase.from('citas_venta').delete().eq('origen', 'excel')
      setMsg(`Importando ${registros.length} citas…`)
      let ok = 0
      for (let i = 0; i < registros.length; i += 200) { const { error } = await supabase.from('citas_venta').insert(registros.slice(i, i + 200)); if (!error) ok += Math.min(200, registros.length - i) }
      setMsg(`Importadas ${ok}. Rellenando datos del dashboard…`)
      await supabase.rpc('backfill_citas_venta')   // rellena teléfono/coordino/atendió faltantes
      setMsg(`✓ Se importaron ${ok} citas (con datos del dashboard rellenados).`); cargar()
    } catch (e: any) { setMsg('✗ Error al importar: ' + (e?.message ?? 'desconocido')) } finally { setImportando(false) }
  }

  const totalW = COLS.reduce((s, col) => s + col.w, 0) + ACC_W
  const dropValores = dropCol ? valoresColumna(dropCol).filter(v => !dropBusca.trim() || v.toLowerCase().includes(dropBusca.toLowerCase())) : []
  const pickLista = picker
    ? (picker.tipo === 'cliente'
        ? clientes.filter(x => !pickBusca.trim() || (x.nombre ?? '').toLowerCase().includes(pickBusca.toLowerCase()) || (x.telefono ?? '').includes(pickBusca))
        : profiles.filter(x => !pickBusca.trim() || x.nombre.toLowerCase().includes(pickBusca.toLowerCase())))
    : []

  return (
    <View style={[st.page, { backgroundColor: c.bg }]}>
      <View style={st.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>📋 Citas de venta</Text>
          <Text style={[st.sub, { color: c.textMute }]}>{filas.length} citas · {visibles.length} visibles · exclusiva admin/supervisor</Text>
        </View>
        {Object.keys(filtrosSel).length > 0 && <TouchableOpacity style={st.btnLimpiar} onPress={() => setFiltrosSel({})}><Text style={st.btnLimpiarTxt}>✕ Quitar filtros</Text></TouchableOpacity>}
        <TouchableOpacity style={[st.btnImport, importando && { opacity: 0.6 }]} onPress={importarCSV} disabled={importando}>
          {importando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.btnImportTxt}>⬆ Importar CSV</Text>}
        </TouchableOpacity>
      </View>
      {msg ? <Text style={[st.msg, { color: msg.startsWith('✓') ? '#1a6855' : msg.startsWith('✗') ? '#c0392b' : c.textMute }]}>{msg}</Text> : null}

      {loading ? <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} /> : (
        <View style={{ flex: 1, marginTop: 8, flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            {/* Encabezado (fijo arriba, scroll horizontal sincronizado) */}
            <ScrollView ref={headerRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'h')} style={{ flexGrow: 0 }}>
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
                <Text style={[st.headCell, st.headTxt, { width: ACC_W }]}>Retro / Borrar</Text>
              </View>
            </ScrollView>

            {/* Cuerpo: scroll horizontal envuelve una FlatList virtualizada.
                La FlatList NECESITA altura fija (medida) para virtualizar en web;
                sin ella renderiza las 1000+ filas y come RAM. */}
            <ScrollView ref={bodyRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
              onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'b')} style={{ flex: 1 }}
              onLayout={e => setListH(e.nativeEvent.layout.height)}>
              <FlatList
                ref={listRef}
                style={{ width: totalW, height: listH }}
                data={visibles}
                keyExtractor={f => f.id}
                getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
                renderItem={({ item, index }) => <FilaRow f={item} idx={index} onTap={onTap} onRetro={onRetro} onDelete={onDelete} />}
                initialNumToRender={25} maxToRenderPerBatch={25} windowSize={11} removeClippedSubviews
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={e => syncY(e.nativeEvent.contentOffset.y, 'list')}
                ListEmptyComponent={<Text style={[st.vacio, { color: c.textMute }]}>{Object.keys(filtrosSel).length ? 'Sin resultados con esos filtros.' : 'Aún no hay citas. Importa tu Excel con "Importar CSV".'}</Text>}
              />
            </ScrollView>

            {/* Barra horizontal fija al pie */}
            <ScrollView ref={barRef} horizontal showsHorizontalScrollIndicator persistentScrollbar scrollEventThrottle={16} onScroll={e => syncX(e.nativeEvent.contentOffset.x, 'bar')} style={st.barraAbajo}>
              <View style={{ width: totalW, height: 1 }} />
            </ScrollView>
          </View>

          {/* Barra vertical fija a la derecha (siempre visible y arrastrable) */}
          <ScrollView ref={vbarRef} showsVerticalScrollIndicator persistentScrollbar scrollEventThrottle={16} onScroll={e => syncY(e.nativeEvent.contentOffset.y, 'vbar')} style={st.barraDer}>
            <View style={{ width: 1, height: Math.max(visibles.length * ROW_H, 1) }} />
          </ScrollView>
        </View>
      )}

      {/* Editar celda de texto */}
      <Modal visible={editTxt !== null} transparent animationType="fade" onRequestClose={() => setEditTxt(null)}>
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setEditTxt(null)}>
          <TouchableOpacity activeOpacity={1} style={[st.dropCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation?.()}>
            <Text style={[st.dropTitulo, { color: c.text }]}>{COLS.find(cc => cc.key === editTxt?.key)?.label}</Text>
            <TextInput style={[st.editArea, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={editTxt?.val ?? ''} onChangeText={v => setEditTxt(e => e ? { ...e, val: v } : e)} multiline autoFocus textAlignVertical="top" />
            <View style={st.dropAcciones}>
              <TouchableOpacity style={st.dropCancel} onPress={() => setEditTxt(null)}><Text style={[st.dropCancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={st.dropOk} onPress={() => { if (editTxt) aplicarCambio(editTxt.id, { [editTxt.key]: editTxt.val.trim() || null }); setEditTxt(null) }}><Text style={st.dropOkTxt}>Guardar</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Filtro estilo Excel */}
      <Modal visible={dropCol !== null} transparent animationType="fade" onRequestClose={() => setDropCol(null)}>
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setDropCol(null)}>
          <TouchableOpacity activeOpacity={1} style={[st.dropCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation?.()}>
            <Text style={[st.dropTitulo, { color: c.text }]}>Filtrar: {COLS.find(cc => cc.key === dropCol)?.label}</Text>
            <TextInput style={[st.dropBusca, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={dropBusca} onChangeText={setDropBusca} placeholder="Buscar valor…" placeholderTextColor={c.textMute} />
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
            </ScrollView>
            <View style={st.dropAcciones}>
              <TouchableOpacity style={st.dropCancel} onPress={() => setDropCol(null)}><Text style={[st.dropCancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={st.dropOk} onPress={aplicarDropdown}><Text style={st.dropOkTxt}>Aplicar</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Menú: usuario / cliente / fecha */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={st.dropOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation?.()}>
            {picker?.tipo === 'fecha' ? (
              <CalendarioHora onConfirm={(disp, iso) => { aplicarCambio(picker.id, { dia_cita: disp, fecha_cita: iso }); setPicker(null) }} onClose={() => setPicker(null)} />
            ) : (
              <View style={[st.dropCard, { backgroundColor: c.card }]}>
                <Text style={[st.dropTitulo, { color: c.text }]}>{picker?.tipo === 'cliente' ? 'Elegir cliente' : 'Elegir usuario'}</Text>
                <TextInput style={[st.dropBusca, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={pickBusca} onChangeText={setPickBusca} placeholder="Buscar…" placeholderTextColor={c.textMute} autoFocus />
                <ScrollView style={{ maxHeight: 340, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                  {picker?.tipo === 'usuario' && <TouchableOpacity style={st.dropItem} onPress={() => elegirUsuario('', null)}><Text style={{ color: c.textMute, fontSize: 13.5 }}>— Sin asignar —</Text></TouchableOpacity>}
                  {(pickLista as any[]).map((x: any) => (
                    <TouchableOpacity key={x.id} style={st.dropItem} onPress={() => picker?.tipo === 'cliente' ? elegirCliente(x.nombre, x.telefono) : elegirUsuario(x.nombre, x.id)}>
                      <Text style={[st.dropItemTxt, { color: c.text }]} numberOfLines={1}>{x.nombre}{picker?.tipo === 'cliente' && x.telefono ? `  ·  ${x.telefono}` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                  {pickLista.length === 0 && <Text style={{ color: c.textMute, padding: 12, fontSize: 12.5 }}>Sin resultados.</Text>}
                </ScrollView>
                <TouchableOpacity style={[st.dropCancel, { marginTop: 12 }]} onPress={() => setPicker(null)}><Text style={[st.dropCancelTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
              </View>
            )}
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
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch', overflow: 'hidden' },
  cell: { paddingHorizontal: 8, paddingVertical: 8, borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden' },
  retroBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  retroPend: { backgroundColor: '#1a6470' },
  retroHecha: { backgroundColor: '#1a685522', borderWidth: 1, borderColor: '#1a6855' },
  retroBtnTxt: { fontSize: 13, fontWeight: '800' },
  delTxt: { fontSize: 16 },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5, lineHeight: 20, maxWidth: 420 },
  barraAbajo: { height: 16, flexGrow: 0, marginTop: 2 },
  barraDer: { width: 16, flexGrow: 0, marginLeft: 2 },
  editArea: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 120 },
  dropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropCard: { width: '100%', maxWidth: 380, borderRadius: 14, padding: 16 },
  dropTitulo: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  dropBusca: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  dropTodos: { flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' },
  dropAccion: { color: '#1a6470', fontWeight: '800', fontSize: 12.5 },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#9aa', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  dropItemTxt: { fontSize: 13.5, flex: 1 },
  dropAcciones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dropCancel: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropCancelTxt: { fontWeight: '700', fontSize: 14 },
  dropOk: { flex: 1, backgroundColor: '#1a6470', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  dropOkTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  calNav: { fontSize: 24, color: '#1a6470', fontWeight: '800', paddingHorizontal: 8 },
  calDow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calCell: { width: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' },
  calDia: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calStep: { fontSize: 20, color: '#1a6470', fontWeight: '800', paddingHorizontal: 8 },
})
