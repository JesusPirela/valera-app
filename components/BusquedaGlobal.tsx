// Búsqueda global (admin): salta a cualquier cliente, propiedad o pantalla.
// Trigger: ícono 🔍 en el header + atajo Ctrl/⌘+K en web. Es un overlay nuevo
// y autocontenido — no modifica ninguna pantalla existente.
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

type Res = { key: string; titulo: string; sub?: string; icon: string; ir: () => void }

// Pantallas frecuentes a las que saltar por nombre.
const PANTALLAS: { label: string; route: string; icon: string }[] = [
  { label: 'Panel', route: '/(admin)/cockpit', icon: 'analytics-outline' },
  { label: 'CRM', route: '/(admin)/crm', icon: 'people-outline' },
  { label: 'Coordinación de citas', route: '/(admin)/coordinacion-citas', icon: 'calendar-outline' },
  { label: 'Citas de venta', route: '/(admin)/citas-venta', icon: 'document-text-outline' },
  { label: 'Cierres', route: '/(admin)/cierres', icon: 'ribbon-outline' },
  { label: 'Calendario', route: '/(admin)/calendario', icon: 'calendar-number-outline' },
  { label: 'Nueva propiedad', route: '/(admin)/nueva-propiedad', icon: 'add-circle-outline' },
  { label: 'Estadísticas', route: '/(admin)/estadisticas', icon: 'stats-chart-outline' },
  { label: 'Usuarios', route: '/(admin)/prospectadores', icon: 'person-add-outline' },
  { label: 'Leads de campañas', route: '/(admin)/leads-campanias', icon: 'funnel-outline' },
  { label: 'Anuncios', route: '/(admin)/anuncios', icon: 'megaphone-outline' },
  { label: 'Actividad', route: '/(admin)/actividad', icon: 'pulse-outline' },
  { label: 'Monitoreo', route: '/(admin)/monitoreo', icon: 'medkit-outline' },
]

function limpiar(q: string) { return q.replace(/[,()%]/g, ' ').trim() }

export default function BusquedaGlobal() {
  const c = useColors()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [clientes, setClientes] = useState<Res[]>([])
  const [props, setProps] = useState<Res[]>([])
  const [buscando, setBuscando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)

  const cerrar = useCallback(() => { setAbierto(false); setQ(''); setClientes([]); setProps([]) }, [])
  const abrir = useCallback(() => setAbierto(true), [])

  // Atajo Ctrl/⌘+K (web).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setAbierto(v => !v) }
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Búsqueda con debounce.
  useEffect(() => {
    if (!abierto) return
    const term = limpiar(q)
    if (timer.current) clearTimeout(timer.current)
    if (term.length < 2) { setClientes([]); setProps([]); setBuscando(false); return }
    setBuscando(true)
    timer.current = setTimeout(async () => {
      try {
        const [cli, pr] = await Promise.all([
          supabase.from('clientes').select('id, nombre, telefono')
            .or(`nombre.ilike.%${term}%,telefono.ilike.%${term}%`).limit(6),
          supabase.from('propiedades').select('id, codigo, titulo')
            .or(`codigo.ilike.%${term}%,titulo.ilike.%${term}%`).limit(6),
        ])
        setClientes((cli.data ?? []).map((x: any) => ({
          key: 'c' + x.id, titulo: x.nombre ?? 'Cliente', sub: x.telefono ?? undefined, icon: 'person',
          ir: () => { cerrar(); router.push(`/(admin)/detalle-cliente?id=${x.id}` as any) },
        })))
        setProps((pr.data ?? []).map((x: any) => ({
          key: 'p' + x.id, titulo: x.titulo ?? x.codigo, sub: x.codigo, icon: 'home',
          ir: () => { cerrar(); router.push(`/(admin)/editar-propiedad?id=${x.id}` as any) },
        })))
      } catch { /* red: sin resultados */ } finally { setBuscando(false) }
    }, 280)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, abierto, cerrar])

  const term = limpiar(q).toLowerCase()
  const pantallas: Res[] = term.length >= 1
    ? PANTALLAS.filter(p => p.label.toLowerCase().includes(term)).slice(0, 6).map(p => ({
        key: 'n' + p.route, titulo: p.label, icon: p.icon.replace('-outline', ''),
        ir: () => { cerrar(); router.push(p.route as any) },
      }))
    : PANTALLAS.slice(0, 6).map(p => ({
        key: 'n' + p.route, titulo: p.label, icon: p.icon.replace('-outline', ''),
        ir: () => { cerrar(); router.push(p.route as any) },
      }))

  const nada = !buscando && term.length >= 2 && clientes.length === 0 && props.length === 0 && pantallas.length === 0

  return (
    <>
      <TouchableOpacity onPress={abrir} style={styles.trigger} accessibilityLabel="Buscar">
        <Ionicons name="search" size={18} color="#c9a84c" />
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={cerrar} statusBarTranslucent>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={cerrar}>
          <TouchableOpacity activeOpacity={1} style={[styles.panel, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {}}>
            <View style={[styles.searchRow, { borderColor: c.border }]}>
              <Ionicons name="search-outline" size={18} color={c.textMute} />
              <TextInput
                ref={inputRef}
                autoFocus
                value={q}
                onChangeText={setQ}
                placeholder="Buscar cliente, propiedad o pantalla…"
                placeholderTextColor={c.placeholder}
                style={[styles.input, { color: c.text }]}
                returnKeyType="search"
              />
              {buscando ? <ActivityIndicator size="small" color="#1a6470" /> : null}
              <TouchableOpacity onPress={cerrar}><Text style={[styles.cerrar, { color: c.textMute }]}>Esc</Text></TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              {nada && <Text style={[styles.vacio, { color: c.textMute }]}>Sin resultados para "{limpiar(q)}".</Text>}
              <Grupo titulo="Clientes" items={clientes} c={c} />
              <Grupo titulo="Propiedades" items={props} c={c} />
              <Grupo titulo="Ir a" items={pantallas} c={c} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function Grupo({ titulo, items, c }: { titulo: string; items: Res[]; c: ReturnType<typeof useColors> }) {
  if (items.length === 0) return null
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={[styles.grupoTit, { color: c.textMute }]}>{titulo.toUpperCase()}</Text>
      {items.map(it => (
        <TouchableOpacity key={it.key} style={styles.item} onPress={it.ir} activeOpacity={0.7}>
          <View style={[styles.itemIcon, { backgroundColor: c.bg }]}>
            <Ionicons name={it.icon as any} size={16} color="#1a6470" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.itemTit, { color: c.text }]} numberOfLines={1}>{it.titulo}</Text>
            {it.sub ? <Text style={[styles.itemSub, { color: c.textMute }]} numberOfLines={1}>{it.sub}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={15} color={c.textMute} />
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  trigger: { padding: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', paddingTop: Platform.OS === 'web' ? 80 : 100, paddingHorizontal: 16 },
  panel: { width: '100%', maxWidth: 560, borderRadius: 16, borderWidth: 1, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0 12px 40px rgba(0,0,0,0.3)' } as any, default: { elevation: 8 } }) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  input: { flex: 1, fontSize: 15.5, padding: 0 },
  cerrar: { fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: '#88888855', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  vacio: { fontSize: 13.5, padding: 16, textAlign: 'center' },
  grupoTit: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 9 },
  itemIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemTit: { fontSize: 14, fontWeight: '600' },
  itemSub: { fontSize: 12, marginTop: 1 },
})
