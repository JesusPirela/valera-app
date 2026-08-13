import React, { useState, useMemo } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Linking, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'

// Agenda de "asesores de contacto": los agentes/inmobiliarias externos que se
// eligen (o se crean) al dar de alta una propiedad (tabla `asesores`, usada por
// el AsesorPicker). NO son los usuarios del equipo.
type Asesor = { id: string; nombre: string; inmobiliaria: string | null; telefono: string | null }

function norm(s: string | null): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}
function iniciales(n: string): string {
  return (n ?? '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function waNum(tel: string): string {
  let p = tel.replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  return p.length === 10 ? '52' + p : p
}
function abrirWhatsApp(tel: string) {
  const url = `https://wa.me/${waNum(tel)}`
  if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url)
}
function llamar(tel: string) { Linking.openURL(`tel:${tel.replace(/[^\d+]/g, '')}`) }

// Color estable por inmobiliaria (para el avatar).
const PALETA = ['#2563eb', '#059669', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#dc2626', '#4f46e5', '#16a34a', '#c026d3']
function colorDe(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

export default function Agenda() {
  const c = useColors()
  const [busqueda, setBusqueda] = useState('')

  const { data: asesores = [], isLoading, refetch, isRefetching } = useQuery<Asesor[]>({
    queryKey: ['agenda-asesores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asesores')
        .select('id, nombre, inmobiliaria, telefono')
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as Asesor[]
    },
    staleTime: 1000 * 60 * 5,
  })

  const lista = useMemo(() => {
    const q = norm(busqueda.trim())
    if (!q) return asesores
    return asesores.filter(a =>
      norm(a.nombre).includes(q) || norm(a.inmobiliaria).includes(q) || (a.telefono ?? '').includes(q))
  }, [asesores, busqueda])

  const conTel = lista.filter(a => a.telefono).length

  const header = (
    <View>
      <Text style={[s.title, { color: c.text }]}>📇 Agenda de asesores de contacto</Text>
      <Text style={[s.sub, { color: c.textMute }]}>{lista.length} asesores · {conTel} con teléfono</Text>
      <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={16} color={c.textMute} style={{ marginRight: 8 }} />
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder="Buscar por nombre, inmobiliaria o teléfono…"
          placeholderTextColor={c.textMute}
          value={busqueda} onChangeText={setBusqueda}
          autoCapitalize="none" autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={17} color={c.textMute} /></TouchableOpacity>
        )}
      </View>
    </View>
  )

  if (isLoading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color="#1a6470" /></View>

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      data={lista}
      keyExtractor={a => a.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={<Text style={[s.muted, { color: c.textMute, marginTop: 24 }]}>Sin resultados.</Text>}
      renderItem={({ item: a }) => {
        const col = colorDe(a.inmobiliaria || a.nombre)
        return (
          <View style={[s.row, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[s.avatar, { backgroundColor: col + '22' }]}>
              <Text style={{ color: col, fontWeight: '800' }}>{iniciales(a.nombre)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{a.nombre}</Text>
              <Text style={[s.meta, { color: c.textSub }]} numberOfLines={1}>
                {a.inmobiliaria ? `🏢 ${a.inmobiliaria}` : 'Sin inmobiliaria'}{a.telefono ? ` · ${a.telefono}` : ''}
              </Text>
            </View>
            {a.telefono ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[s.act, { backgroundColor: '#16a34a18' }]} onPress={() => abrirWhatsApp(a.telefono!)}>
                  <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.act, { backgroundColor: '#2563eb18' }]} onPress={() => llamar(a.telefono!)}>
                  <Ionicons name="call" size={18} color="#2563eb" />
                </TouchableOpacity>
              </View>
            ) : <Text style={[s.sinTel, { color: c.textMute }]}>Sin tel.</Text>}
          </View>
        )
      }}
    />
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  muted: { fontSize: 14, textAlign: 'center' },
  title: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  nombre: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  act: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sinTel: { fontSize: 12, fontWeight: '600' },
})
