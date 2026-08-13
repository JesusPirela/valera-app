import React, { useState, useMemo } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Linking, RefreshControl,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { thumb } from '../../lib/img'

type Persona = { id: string; nombre: string | null; role: string; telefono: string | null; avatar_url: string | null; activo: boolean | null }

const ROLES: Record<string, { label: string; color: string }> = {
  admin:              { label: 'Admin',         color: '#C62828' },
  supervisor:         { label: 'Supervisor',    color: '#00695C' },
  prospectador_plus:  { label: 'Prospectador+', color: '#5e35b1' },
  prospectador:       { label: 'Prospectador',  color: '#1565C0' },
  asesor:             { label: 'Asesor',        color: '#0277BD' },
  nuevo:              { label: 'Nuevo',          color: '#757575' },
}
function rolInfo(r: string) { return ROLES[r] ?? { label: r, color: '#757575' } }

type Filtro = 'todos' | 'asesores' | 'supervisor' | 'admin'
const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'], ['asesores', 'Asesores'], ['supervisor', 'Supervisores'], ['admin', 'Admin'],
]
const ROLES_ASESOR = new Set(['prospectador', 'prospectador_plus', 'asesor', 'nuevo'])

function norm(s: string | null): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}
function iniciales(n: string | null): string {
  return (n ?? '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
// Normaliza a WhatsApp MX (52 + 10 dígitos).
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

export default function Agenda() {
  const c = useColors()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const { data: personas = [], isLoading, refetch, isRefetching } = useQuery<Persona[]>({
    queryKey: ['agenda-contactos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, role, telefono, avatar_url, activo')
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as Persona[]
    },
    staleTime: 1000 * 60 * 5,
  })

  const lista = useMemo(() => {
    let arr = personas.filter(p => (p.nombre ?? '').trim())
    if (filtro === 'asesores') arr = arr.filter(p => ROLES_ASESOR.has(p.role))
    else if (filtro === 'supervisor') arr = arr.filter(p => p.role === 'supervisor')
    else if (filtro === 'admin') arr = arr.filter(p => p.role === 'admin')
    const q = norm(busqueda.trim())
    if (q) arr = arr.filter(p => norm(p.nombre).includes(q) || (p.telefono ?? '').includes(q) || norm(rolInfo(p.role).label).includes(q))
    return arr
  }, [personas, filtro, busqueda])

  const conTel = lista.filter(p => p.telefono).length

  const header = (
    <View>
      <Text style={[s.title, { color: c.text }]}>📇 Agenda de contactos</Text>
      <Text style={[s.sub, { color: c.textMute }]}>{lista.length} personas · {conTel} con teléfono</Text>
      <View style={s.chips}>
        {FILTROS.map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[s.chip, { borderColor: c.border }, filtro === k && { backgroundColor: '#1a6470', borderColor: '#1a6470' }]} onPress={() => setFiltro(k)}>
            <Text style={[s.chipTxt, { color: filtro === k ? '#fff' : c.textSub }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search-outline" size={16} color={c.textMute} style={{ marginRight: 8 }} />
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder="Buscar por nombre, teléfono o rol…"
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
      keyExtractor={p => p.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListEmptyComponent={<Text style={[s.muted, { color: c.textMute, marginTop: 24 }]}>Sin resultados.</Text>}
      renderItem={({ item: p }) => {
        const ri = rolInfo(p.role)
        return (
          <View style={[s.row, { backgroundColor: c.card, borderColor: c.border }]}>
            {p.avatar_url
              ? <Image source={{ uri: thumb(p.avatar_url, { width: 96, quality: 60 }) ?? p.avatar_url }} style={s.avatar} contentFit="cover" />
              : <View style={[s.avatar, { backgroundColor: ri.color + '22', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: ri.color, fontWeight: '800' }}>{iniciales(p.nombre)}</Text></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{p.nombre}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <View style={[s.rolBadge, { backgroundColor: ri.color + '18' }]}><Text style={[s.rolTxt, { color: ri.color }]}>{ri.label}</Text></View>
                {p.telefono ? <Text style={[s.tel, { color: c.textSub }]} numberOfLines={1}>{p.telefono}</Text> : <Text style={[s.tel, { color: c.textMute }]}>Sin teléfono</Text>}
              </View>
            </View>
            {p.telefono ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[s.act, { backgroundColor: '#16a34a18' }]} onPress={() => abrirWhatsApp(p.telefono!)}>
                  <Ionicons name="logo-whatsapp" size={20} color="#16a34a" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.act, { backgroundColor: '#2563eb18' }]} onPress={() => llamar(p.telefono!)}>
                  <Ionicons name="call" size={18} color="#2563eb" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )
      }}
    />
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  muted: { fontSize: 14, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt: { fontSize: 13, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  nombre: { fontSize: 16, fontWeight: '800' },
  rolBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  rolTxt: { fontSize: 11.5, fontWeight: '800' },
  tel: { fontSize: 13, fontWeight: '600' },
  act: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
