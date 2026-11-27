import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  ActivityIndicator, StyleSheet, Platform, Alert,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as Clipboard from 'expo-clipboard'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'
import { parsearCSV } from './ImportCSVModal'
import DarLoteModal from './DarLoteModal'

// Tabla LIGERA para clientes de Vinte (constructora aliada) — tabla propia
// (clientes_vinte), sin relación con citas_venta. Sin retro, sin chatbot, sin
// gráficas: solo editar, importar/exportar CSV y armar lotes, igual que en
// citas-venta pero sin todo lo demás que no aplica aquí.
type ClienteVinte = {
  id: string
  cliente_nombre: string | null
  telefono: string | null
  zona_interesada: string | null
  presupuesto: number | null
  fecha_contacto: string | null  // YYYY-MM-DD
  notas: string | null
}
type LoteGuardado = {
  id: string; clientes_hash: string; dado_at: string
  asignado_a: string | null; asignado_texto: string | null
  trabajado: boolean
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso + 'T00:00:00')
  if (isNaN(t.getTime())) return iso
  return t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
function hashDeIds(ids: string[]): string {
  return [...ids].sort().join(',')
}

export default function VinteTabla({ miId, profiles }: {
  miId: string | null
  profiles: { id: string; nombre: string }[]
}) {
  const c = useColors()
  const [clientes, setClientes] = useState<ClienteVinte[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  const [lotesAbierto, setLotesAbierto] = useState(false)
  const [tamanoLote, setTamanoLote] = useState(20)
  const [lotesGuardados, setLotesGuardados] = useState<LoteGuardado[]>([])
  const [darLoteModal, setDarLoteModal] = useState<{ grupo: ClienteVinte[]; numero: number } | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase.from('clientes_vinte').select('*').order('created_at', { ascending: false })
    setClientes((data ?? []) as ClienteVinte[])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const cargarLotesGuardados = useCallback(() => {
    supabase.from('lotes_vinte').select('id, clientes_hash, dado_at, asignado_a, asignado_texto, trabajado')
      .then(({ data }) => setLotesGuardados((data ?? []) as LoteGuardado[]))
  }, [])
  useEffect(() => { cargarLotesGuardados() }, [cargarLotesGuardados])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(f =>
      (f.cliente_nombre ?? '').toLowerCase().includes(q) ||
      (f.telefono ?? '').toLowerCase().includes(q) ||
      (f.zona_interesada ?? '').toLowerCase().includes(q) ||
      (f.notas ?? '').toLowerCase().includes(q)
    )
  }, [clientes, busqueda])

  // Optimista con reversión si falla — mismo criterio que citas-venta.
  const actualizarCampo = useCallback(async (id: string, patch: Partial<ClienteVinte>) => {
    let anterior: ClienteVinte | undefined
    setClientes(fs => fs.map(f => { if (f.id !== id) return f; anterior = f; return { ...f, ...patch } }))
    const { error } = await supabase.from('clientes_vinte').update(patch).eq('id', id)
    if (error && anterior) {
      setClientes(fs => fs.map(f => (f.id === id ? anterior! : f)))
      if (Platform.OS === 'web') window.alert('No se guardó el cambio: ' + error.message)
      else Alert.alert('No se guardó el cambio', error.message)
    }
  }, [])

  async function agregarFila() {
    const { data, error } = await supabase.from('clientes_vinte')
      .insert({ cliente_nombre: 'Nuevo cliente', creado_por: miId })
      .select('*').single()
    if (error || !data) {
      setMsg('✗ No se pudo agregar.'); setTimeout(() => setMsg(''), 3000); return
    }
    setClientes(fs => [data as ClienteVinte, ...fs])
  }

  function eliminarFila(f: ClienteVinte) {
    const confirmar = (texto: string, ok: () => void) => {
      if (Platform.OS === 'web') { if (window.confirm(texto)) ok() }
      else Alert.alert('Confirmar', texto, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: ok }])
    }
    confirmar(`¿Borrar a "${f.cliente_nombre ?? 'sin nombre'}"?`, async () => {
      setClientes(fs => fs.filter(x => x.id !== f.id))
      await supabase.from('clientes_vinte').delete().eq('id', f.id)
    })
  }

  function csvDeFilas(filas: ClienteVinte[]): string {
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const encabezados = ['Nombre', 'Teléfono', 'Zona', 'Presupuesto', 'Fecha', 'Notas']
    const cuerpo = filas.map(f => [f.cliente_nombre, f.telefono, f.zona_interesada, f.presupuesto, f.fecha_contacto, f.notas].map(esc).join(','))
    return encabezados.map(esc).join(',') + '\n' + cuerpo.join('\n')
  }
  function descargarCSV(csv: string, nombreArchivo: string) {
    if (Platform.OS !== 'web') return
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nombreArchivo
    a.click()
  }
  function exportarCSV() {
    descargarCSV(csvDeFilas(visibles), `clientes-vinte-${hoyISO()}.csv`)
  }

  // Detecta columnas por nombre de encabezado (en vez de pedir orden fijo) —
  // así sirve con exportes de Excel/Sheets sin importar el orden de columnas.
  function detectarColumna(headers: string[], patrones: RegExp[]): number {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim()
      if (patrones.some(p => p.test(h))) return i
    }
    return -1
  }

  async function importarCSV() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true })
      if (res.canceled || !res.assets?.[0]) return
      setImportando(true); setMsg('Leyendo archivo…')
      const asset = res.assets[0]
      const texto = Platform.OS === 'web' && (asset as any).file ? await (asset as any).file.text() : await (await fetch(asset.uri)).text()
      const filas = parsearCSV(texto)
      if (filas.length < 2) { setMsg('✗ El archivo no tiene filas.'); setImportando(false); return }
      const headers = filas[0]
      const iNombre = detectarColumna(headers, [/nombre/, /^name$/, /cliente/])
      const iTel = detectarColumna(headers, [/telefono/, /tel[eé]fono/, /^phone$/, /celular/, /whatsapp/])
      const iZona = detectarColumna(headers, [/zona/, /region/])
      const iPresupuesto = detectarColumna(headers, [/presupuesto/, /budget/, /precio/])
      const iFecha = detectarColumna(headers, [/fecha/, /^date$/])
      const iNotas = detectarColumna(headers, [/notas?/, /notes?/, /comentarios?/])

      if (iNombre < 0 && iTel < 0) {
        setMsg('✗ No se reconoció ninguna columna de nombre ni teléfono.'); setImportando(false); return
      }

      const registros = filas.slice(1)
        .map(r => ({
          cliente_nombre: iNombre >= 0 ? (r[iNombre] ?? '').trim() || null : null,
          telefono: iTel >= 0 ? (r[iTel] ?? '').replace(/[^\d+]/g, '') || null : null,
          zona_interesada: iZona >= 0 ? (r[iZona] ?? '').trim() || null : null,
          presupuesto: iPresupuesto >= 0 ? (Number(String(r[iPresupuesto] ?? '').replace(/[^0-9.]/g, '')) || null) : null,
          fecha_contacto: iFecha >= 0 ? (r[iFecha] ?? '').trim() || null : null,
          notas: iNotas >= 0 ? (r[iNotas] ?? '').trim() || null : null,
          creado_por: miId,
        }))
        .filter(x => x.cliente_nombre || x.telefono)

      if (registros.length === 0) { setMsg('✗ No hay filas con nombre o teléfono.'); setImportando(false); return }

      setMsg(`Importando ${registros.length} clientes…`)
      let ok = 0
      for (let i = 0; i < registros.length; i += 200) {
        const { error } = await supabase.from('clientes_vinte').insert(registros.slice(i, i + 200))
        if (!error) ok += Math.min(200, registros.length - i)
      }
      setMsg(`✓ ${ok} de ${registros.length} clientes importados.`)
      setTimeout(() => setMsg(''), 4000)
      cargar()
    } catch (e) {
      setMsg('✗ Error al importar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setImportando(false)
    }
  }

  // Lotes: igual que en citas-venta — de la fecha de contacto más vieja a la
  // más reciente, en grupos de `tamanoLote`, cruzados contra lotes_vinte para
  // saber cuáles ya se dieron.
  const lotes = useMemo(() => {
    if (!lotesAbierto || tamanoLote < 1) return []
    const ordenadas = [...visibles].sort((a, b) => {
      if (!a.fecha_contacto && !b.fecha_contacto) return 0
      if (!a.fecha_contacto) return 1
      if (!b.fecha_contacto) return -1
      return a.fecha_contacto.localeCompare(b.fecha_contacto)
    })
    const grupos: ClienteVinte[][] = []
    for (let i = 0; i < ordenadas.length; i += tamanoLote) grupos.push(ordenadas.slice(i, i + tamanoLote))
    return grupos
  }, [visibles, lotesAbierto, tamanoLote])

  const lotesGuardadosPorHash = useMemo(
    () => new Map(lotesGuardados.map(l => [l.clientes_hash, l])),
    [lotesGuardados]
  )

  function exportarLoteCSV(grupo: ClienteVinte[], numero: number) {
    descargarCSV(csvDeFilas(grupo), `clientes-vinte-lote-${numero}-${hoyISO()}.csv`)
  }
  async function copiarLoteWhatsApp(grupo: ClienteVinte[], numero: number) {
    const texto = `*Lote ${numero} · ${grupo.length} clientes*\n\n` + grupo.map((f, i) => {
      const partes = [f.cliente_nombre?.trim() || 'Sin nombre']
      if (f.telefono) partes.push(f.telefono)
      if (f.zona_interesada) partes.push(f.zona_interesada)
      return `${i + 1}. ${partes.join(' · ')}${f.fecha_contacto ? `\n   📅 ${fmtFecha(f.fecha_contacto)}` : ''}`
    }).join('\n')
    try { await Clipboard.setStringAsync(texto) } catch { /* sin portapapeles */ }
    if (Platform.OS === 'web') window.alert(`✓ Lote ${numero} copiado (listo para pegar en WhatsApp)`)
    else Alert.alert('✓ Copiado', `Lote ${numero} copiado, listo para pegar en WhatsApp.`)
  }

  async function confirmarDarLote(asignadoA: string | null, asignadoTexto: string) {
    if (!darLoteModal) return
    const { grupo, numero } = darLoteModal
    const { error } = await supabase.from('lotes_vinte').insert({
      numero, tamano: grupo.length, clientes_ids: grupo.map(f => f.id),
      creado_por: miId, asignado_a: asignadoA, asignado_texto: asignadoTexto.trim() || null,
    })
    if (error) {
      const m = error.code === '23505' ? 'Este lote ya se le dio a alguien antes.' : (error.message || 'No se pudo dar el lote.')
      if (Platform.OS === 'web') window.alert(m); else Alert.alert('Error', m)
      return
    }
    cargarLotesGuardados()
    setDarLoteModal(null)
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topRow}>
        <Text style={[st.h1, { color: c.text }]}>🏗️ Clientes Vinte</Text>
        <Text style={[st.sub, { color: c.textMute }]}>{clientes.length} clientes</Text>
      </View>

      <View style={st.toolbar}>
        <TextInput
          style={[st.busca, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar nombre, teléfono, zona…" placeholderTextColor={c.textMute}
        />
        <TouchableOpacity style={st.btn} onPress={agregarFila}><Text style={st.btnTxt}>＋ Agregar</Text></TouchableOpacity>
        <TouchableOpacity style={st.btn} onPress={exportarCSV}><Text style={st.btnTxt}>⬇ Exportar</Text></TouchableOpacity>
        <TouchableOpacity style={[st.btn, importando && { opacity: 0.6 }]} onPress={importarCSV} disabled={importando}>
          {importando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.btnTxt}>⬆ Importar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[st.btnOutline, lotesAbierto && st.btnOutlineOn]} onPress={() => setLotesAbierto(v => !v)}>
          <Text style={[st.btnOutlineTxt, lotesAbierto && { color: '#fff' }]}>{lotesAbierto ? '✕ Cerrar lotes' : '📦 Armar lotes'}</Text>
        </TouchableOpacity>
      </View>
      {!!msg && <Text style={[st.msg, { color: c.textSub }]}>{msg}</Text>}

      {lotesAbierto && (
        <View style={st.lotesCaja}>
          <View style={st.fechaBar}>
            <Text style={[st.fechaLabel, { color: c.textSub }]}>📦 Tamaño del lote:</Text>
            {[10, 20, 30, 50].map(n => (
              <TouchableOpacity key={n} style={[st.fechaChip, { borderColor: c.border }, tamanoLote === n && st.fechaChipOn]} onPress={() => setTamanoLote(n)}>
                <Text style={[st.fechaChipTxt, { color: tamanoLote === n ? '#fff' : c.textSub }]}>{n}</Text>
              </TouchableOpacity>
            ))}
            <Text style={{ color: c.textMute, fontSize: 12 }}>
              · {visibles.length} visibles → {lotes.length} lote{lotes.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={[st.lotesHint, { color: c.textMute }]}>
            Filtra con la búsqueda de arriba para elegir QUIÉNES entran a los lotes; esto solo los agrupa, del más viejo al más reciente.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ width: '100%' }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {lotes.map((grupo, i) => {
              const dado = lotesGuardadosPorHash.get(hashDeIds(grupo.map(f => f.id)))
              const nombreDado = dado && (dado.asignado_a ? (profiles.find(p => p.id === dado.asignado_a)?.nombre ?? 'Usuario') : dado.asignado_texto)
              return (
                <View key={i} style={[st.loteCard, { borderColor: c.border, backgroundColor: c.bg }]}>
                  <Text style={[st.loteTitulo, { color: c.text }]}>Lote {i + 1}</Text>
                  <Text style={[st.loteSub, { color: c.textMute }]}>{grupo.length} cliente{grupo.length === 1 ? '' : 's'}</Text>
                  <TouchableOpacity style={st.loteBtn} onPress={() => exportarLoteCSV(grupo, i + 1)}>
                    <Text style={st.loteBtnTxt}>⬇ Excel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.loteBtn, st.loteBtnWa]} onPress={() => copiarLoteWhatsApp(grupo, i + 1)}>
                    <Text style={[st.loteBtnTxt, st.loteBtnWaTxt]}>📋 WhatsApp</Text>
                  </TouchableOpacity>
                  {dado ? (
                    <View style={st.loteDadoAviso}>
                      <Text style={st.loteDadoTxt} numberOfLines={2}>✓ Dado a {nombreDado}{dado.trabajado ? ' · trabajado' : ''}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={[st.loteBtn, st.loteBtnDar]} onPress={() => setDarLoteModal({ grupo, numero: i + 1 })}>
                      <Text style={st.loteBtnTxt}>🎯 Dar lote</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </ScrollView>
        </View>
      )}

      <View style={[st.headRow, { borderColor: c.border }]}>
        <Text style={[st.headCell, { width: 160, color: c.textSub }]}>Nombre</Text>
        <Text style={[st.headCell, { width: 120, color: c.textSub }]}>Teléfono</Text>
        <Text style={[st.headCell, { width: 130, color: c.textSub }]}>Zona</Text>
        <Text style={[st.headCell, { width: 110, color: c.textSub }]}>Presupuesto</Text>
        <Text style={[st.headCell, { width: 110, color: c.textSub }]}>Fecha</Text>
        <Text style={[st.headCell, { flex: 1, minWidth: 160, color: c.textSub }]}>Notas</Text>
        <Text style={[st.headCell, { width: 36 }]} />
      </View>
      {cargando ? (
        <ActivityIndicator color={c.text} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={f => f.id}
          renderItem={({ item: f }) => (
            <View style={[st.row, { borderColor: c.border }]}>
              <TextInput style={[st.cell, { width: 160, color: c.text }]} value={f.cliente_nombre ?? ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, cliente_nombre: t } : x))} onEndEditing={() => actualizarCampo(f.id, { cliente_nombre: f.cliente_nombre })} placeholder="—" placeholderTextColor={c.textMute} />
              <TextInput style={[st.cell, { width: 120, color: c.text }]} value={f.telefono ?? ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, telefono: t } : x))} onEndEditing={() => actualizarCampo(f.id, { telefono: f.telefono })} placeholder="—" placeholderTextColor={c.textMute} keyboardType="phone-pad" />
              <TextInput style={[st.cell, { width: 130, color: c.text }]} value={f.zona_interesada ?? ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, zona_interesada: t } : x))} onEndEditing={() => actualizarCampo(f.id, { zona_interesada: f.zona_interesada })} placeholder="—" placeholderTextColor={c.textMute} />
              <TextInput style={[st.cell, { width: 110, color: c.text }]} value={f.presupuesto != null ? String(f.presupuesto) : ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, presupuesto: t ? Number(t.replace(/\D/g, '')) : null } : x))} onEndEditing={() => actualizarCampo(f.id, { presupuesto: f.presupuesto })} placeholder="—" placeholderTextColor={c.textMute} keyboardType="number-pad" />
              <TextInput style={[st.cell, { width: 110, color: c.text }]} value={f.fecha_contacto ?? ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, fecha_contacto: t } : x))} onEndEditing={() => actualizarCampo(f.id, { fecha_contacto: f.fecha_contacto || null })} placeholder="AAAA-MM-DD" placeholderTextColor={c.textMute} />
              <TextInput style={[st.cell, { flex: 1, minWidth: 160, color: c.text }]} value={f.notas ?? ''} onChangeText={t => setClientes(fs => fs.map(x => x.id === f.id ? { ...x, notas: t } : x))} onEndEditing={() => actualizarCampo(f.id, { notas: f.notas })} placeholder="—" placeholderTextColor={c.textMute} />
              <TouchableOpacity style={{ width: 36, alignItems: 'center' }} onPress={() => eliminarFila(f)}><Text style={{ fontSize: 16 }}>🗑️</Text></TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={[st.vacio, { color: c.textMute }]}>Sin clientes todavía. Importa un CSV o agrega uno manualmente.</Text>}
        />
      )}

      {darLoteModal && (
        <DarLoteModal
          numero={darLoteModal.numero}
          cantidad={darLoteModal.grupo.length}
          profiles={profiles}
          onClose={() => setDarLoteModal(null)}
          onConfirmar={confirmarDarLote}
        />
      )}
    </View>
  )
}

const st = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12.5 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  busca: { flex: 1, minWidth: 180, maxWidth: 360, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13 },
  btn: { backgroundColor: '#1a6470', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  btnTxt: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: '#1a6470', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  btnOutlineOn: { backgroundColor: '#1a6470' },
  btnOutlineTxt: { color: '#1a6470', fontSize: 12.5, fontWeight: '700' },
  msg: { fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 8, marginTop: 10 },
  headCell: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  cell: { paddingHorizontal: 6, paddingVertical: 8, fontSize: 13 },
  vacio: { textAlign: 'center', padding: 30, fontSize: 13.5 },
  lotesCaja: { marginTop: 10, marginBottom: 6 },
  lotesHint: { fontSize: 11.5, marginBottom: 6 },
  fechaBar: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fechaLabel: { fontSize: 12.5, fontWeight: '700' },
  fechaChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  fechaChipOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  fechaChipTxt: { fontSize: 12.5, fontWeight: '700' },
  loteCard: { width: 170, borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  loteTitulo: { fontSize: 14, fontWeight: '800' },
  loteSub: { fontSize: 12, marginBottom: 2 },
  loteBtn: { backgroundColor: '#1a6470', borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  loteBtnWa: { backgroundColor: '#e8f8ef' },
  loteBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loteBtnWaTxt: { color: '#16a34a' },
  loteBtnDar: { backgroundColor: '#7c3aed' },
  loteDadoAviso: { backgroundColor: 'rgba(22,163,74,0.14)', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 },
  loteDadoTxt: { color: '#16a34a', fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
})
