import React, { useState, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform,
  Linking, ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useFocusEffect, router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { registrarContacto } from '../../lib/gamification'
import { abrirWhatsApp } from './crm'

// Marca de "ya vistos" para el popup que molesta: al abrir esta tabla se
// registran todos los ids actuales como vistos, así el popup deja de insistir.
const SEEN_KEY = 'lc_seen_v1'

type Lead = {
  id: string
  nombre: string
  telefono: string
  zona_busqueda: string | null
  presupuesto: string | null
  estado: string | null
  created_at: string
}

type SortCol = 'nombre' | 'telefono' | 'zona' | 'presupuesto'
type Sort = { col: SortCol; dir: 'asc' | 'desc' }

// Parseo heurístico del presupuesto en texto libre → número, para ordenar.
// "2.9m", "$2,9m a $3.2m", "3M", "8000" → millones/pesos aproximados.
function parsePresu(txt: string | null): number {
  if (!txt) return -1
  const limpio = txt.replace(/[,$]/g, ' ').toLowerCase()
  const m = limpio.match(/(\d+(?:\.\d+)?)\s*(m|k)?/)
  if (!m) return -1
  let n = parseFloat(m[1])
  if (m[2] === 'm' || n < 100) n *= 1_000_000
  else if (m[2] === 'k') n *= 1_000
  return n
}

function llamar(tel: string) { Linking.openURL(`tel:${tel}`) }

export default function LeadsCampania() {
  const c = useColors()
  const [sort, setSort] = useState<Sort>({ col: 'nombre', dir: 'asc' })

  const { data: leads = [], isLoading, refetch } = useQuery<Lead[]>({
    queryKey: ['leads-campania'],
    queryFn: async () => {
      const { data: { user } } = await getUsuarioActual()
      if (!user) return []
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, zona_busqueda, presupuesto, estado, created_at')
        .eq('fuente_lead', 'campana_fb')
        .eq('responsable_id', user.id)
        .is('eliminado_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 1000 * 60 * 2,
  })

  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } catch {} finally { setRefreshing(false) }
  }, [refetch])

  // Al entrar, marca todos los leads actuales como "vistos" para que el popup
  // deje de insistir con estos.
  useFocusEffect(useCallback(() => {
    if (!leads.length) return
    AsyncStorage.getItem(SEEN_KEY).then(raw => {
      const seen: string[] = raw ? JSON.parse(raw) : []
      const merged = Array.from(new Set([...seen, ...leads.map(l => l.id)]))
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(merged)).catch(() => {})
    }).catch(() => {})
  }, [leads]))

  const ordenados = useMemo(() => {
    const arr = [...leads]
    arr.sort((a, b) => {
      let cmp = 0
      if (sort.col === 'nombre') cmp = a.nombre.localeCompare(b.nombre, 'es')
      else if (sort.col === 'telefono') cmp = (a.telefono || '').localeCompare(b.telefono || '')
      else if (sort.col === 'zona') cmp = (a.zona_busqueda || '~').localeCompare(b.zona_busqueda || '~', 'es')
      else if (sort.col === 'presupuesto') cmp = parsePresu(a.presupuesto) - parsePresu(b.presupuesto)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [leads, sort])

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' })
  }

  function contactarWhatsApp(l: Lead) {
    abrirWhatsApp(l.telefono, l.nombre)
    getUsuarioActual().then(({ data: { user } }) => {
      if (user) registrarContacto(user.id, l.id, 'whatsapp').catch(() => {})
    })
  }
  function contactarLlamada(l: Lead) {
    llamar(l.telefono)
    getUsuarioActual().then(({ data: { user } }) => {
      if (user) registrarContacto(user.id, l.id, 'llamada').catch(() => {})
    })
  }

  const HeaderCell = ({ col, label, w }: { col: SortCol; label: string; w: number }) => (
    <TouchableOpacity style={[styles.th, { width: w }]} onPress={() => toggleSort(col)} activeOpacity={0.7}>
      <Text style={[styles.thTxt, { color: '#fff' }]} numberOfLines={1}>{label}</Text>
      {sort.col === col && (
        <Ionicons name={sort.dir === 'asc' ? 'caret-up' : 'caret-down'} size={11} color="#fff" style={{ marginLeft: 2 }} />
      )}
    </TouchableOpacity>
  )

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.headerBar}>
        <Text style={[styles.title, { color: c.text }]}>📣 Leads de campaña</Text>
        <Text style={[styles.sub, { color: c.textMute }]}>
          {leads.length} {leads.length === 1 ? 'cliente' : 'clientes'} · toca un encabezado para ordenar
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 40 }} />
      ) : leads.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 34 }}>📭</Text>
          <Text style={[styles.emptyTxt, { color: c.textMute }]}>Aún no tienes leads de campaña asignados.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ minWidth: '100%' }}
        >
          <View>
            {/* Encabezado */}
            <View style={styles.headRow}>
              <HeaderCell col="zona" label="Zona" w={150} />
              <HeaderCell col="presupuesto" label="Presupuesto" w={130} />
              <HeaderCell col="nombre" label="Nombre" w={170} />
              <HeaderCell col="telefono" label="Teléfono" w={130} />
              <View style={[styles.th, { width: 64 }]}><Text style={[styles.thTxt, { color: '#fff' }]}>WA</Text></View>
              <View style={[styles.th, { width: 64 }]}><Text style={[styles.thTxt, { color: '#fff' }]}>Llamar</Text></View>
            </View>

            {/* Filas */}
            <ScrollView
              style={{ maxHeight: Platform.OS === 'web' ? undefined : 9999 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
            >
              {ordenados.map((l, i) => (
                <View key={l.id} style={[styles.tr, { backgroundColor: i % 2 === 0 ? c.card : c.bg2, borderColor: c.border }]}>
                  <TouchableOpacity style={[styles.td, { width: 150 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={2}>{l.zona_busqueda || '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 130 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={2}>{l.presupuesto || '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 170 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.text, fontWeight: '700' }]} numberOfLines={2}>{l.nombre}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.td, { width: 130 }]} onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${l.id}` as any)}>
                    <Text style={[styles.tdTxt, { color: c.textSub }]} numberOfLines={1}>{l.telefono}</Text>
                  </TouchableOpacity>
                  <View style={[styles.td, { width: 64, alignItems: 'center' }]}>
                    <TouchableOpacity style={styles.actBtn} onPress={() => contactarWhatsApp(l)}>
                      <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.td, { width: 64, alignItems: 'center' }]}>
                    <TouchableOpacity style={styles.actBtn} onPress={() => contactarLlamada(l)}>
                      <Ionicons name="call" size={18} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  headRow: { flexDirection: 'row', backgroundColor: '#7c3aed' },
  th: { paddingVertical: 11, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  thTxt: { fontSize: 12, fontWeight: '800' },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' },
  td: { paddingVertical: 10, paddingHorizontal: 8, justifyContent: 'center' },
  tdTxt: { fontSize: 13 },
  actBtn: { padding: 6 },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
})
