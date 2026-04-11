import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SectionList, TextInput,
  ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from '../(prospectador)/crm'

type ClienteAdmin = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  estado: string
  created_at: string
  responsable_id: string
  prospectador_nombre: string
  prospectador_email: string
}

type Seccion = {
  title: string
  email: string
  data: ClienteAdmin[]
  total: number
}

const ORDEN_ESTADOS = [
  'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_agendada', 'seguimiento_cierre', 'compro', 'descartado',
]

function estadoInfo(estado: string) {
  return ESTADOS[estado] ?? { label: estado, color: '#555', bg: '#eee' }
}

function tiempoRelativo(fechaISO: string) {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function AdminCRM() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())

  async function cargarClientes() {
    setLoading(true)

    const { data, error } = await supabase
      .from('clientes')
      .select(`
        id, nombre, telefono, email, empresa, estado, created_at, responsable_id,
        profiles!responsable_id (nombre, email)
      `)
      .order('created_at', { ascending: false })

    if (error || !data) { setLoading(false); return }

    // Normalizar y agrupar por prospectador
    const clientesNorm: ClienteAdmin[] = data.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      empresa: c.empresa,
      estado: c.estado,
      created_at: c.created_at,
      responsable_id: c.responsable_id,
      prospectador_nombre: c.profiles?.nombre ?? 'Sin nombre',
      prospectador_email: c.profiles?.email ?? '',
    }))

    // Agrupar por prospectador
    const mapaProsp = new Map<string, ClienteAdmin[]>()
    for (const cl of clientesNorm) {
      const key = cl.prospectador_nombre
      if (!mapaProsp.has(key)) mapaProsp.set(key, [])
      mapaProsp.get(key)!.push(cl)
    }

    const secs: Seccion[] = Array.from(mapaProsp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nombre, clientes]) => ({
        title: nombre,
        email: clientes[0]?.prospectador_email ?? '',
        data: clientes,
        total: clientes.length,
      }))

    setSecciones(secs)
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargarClientes() }, []))

  function toggleSeccion(title: string) {
    setSeccionesColapsadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(title)) nuevo.delete(title)
      else nuevo.add(title)
      return nuevo
    })
  }

  // Filtrar clientes dentro de cada sección
  const seccionesFiltradas: Seccion[] = secciones
    .map((sec) => {
      let clientes = sec.data
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        clientes = clientes.filter((c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          sec.title.toLowerCase().includes(q)
        )
      }
      if (estadoFiltro) clientes = clientes.filter((c) => c.estado === estadoFiltro)
      return { ...sec, data: clientes }
    })
    .filter((sec) => sec.data.length > 0)

  // Totales globales por estado
  const todosClientes = secciones.flatMap((s) => s.data)
  const totalGlobal = todosClientes.length
  const conteosPorEstado = ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = todosClientes.filter((c) => c.estado === e).length
    return acc
  }, {})

  return (
    <View style={styles.container}>
      {/* Resumen global */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.resumenScroll}
        contentContainerStyle={styles.resumenContent}
      >
        <TouchableOpacity
          style={[styles.resumenChip, estadoFiltro === null && styles.resumenChipAll]}
          onPress={() => setEstadoFiltro(null)}
        >
          <Text style={[styles.resumenCount, estadoFiltro === null && styles.resumenCountAll]}>
            {totalGlobal}
          </Text>
          <Text style={[styles.resumenLabel, estadoFiltro === null && styles.resumenLabelAll]}>
            Total
          </Text>
        </TouchableOpacity>
        {ORDEN_ESTADOS.map((e) => {
          const info = estadoInfo(e)
          const activo = estadoFiltro === e
          return (
            <TouchableOpacity
              key={e}
              style={[styles.resumenChip, activo && { backgroundColor: info.bg, borderColor: info.color }]}
              onPress={() => setEstadoFiltro(activo ? null : e)}
            >
              <Text style={[styles.resumenCount, activo && { color: info.color }]}>
                {conteosPorEstado[e]}
              </Text>
              <Text style={[styles.resumenLabel, activo && { color: info.color, fontWeight: '600' }]}>
                {info.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Búsqueda */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o prospectador..."
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
      ) : seccionesFiltradas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
        </View>
      ) : (
        <SectionList
          sections={seccionesFiltradas.map((sec) => ({
            ...sec,
            data: seccionesColapsadas.has(sec.title) ? [] : sec.data,
          }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const colapsada = seccionesColapsadas.has(section.title)
            const totalSec = secciones.find((s) => s.title === section.title)?.total ?? 0
            return (
              <TouchableOpacity
                style={styles.secHeader}
                onPress={() => toggleSeccion(section.title)}
                activeOpacity={0.75}
              >
                <View style={styles.secHeaderLeft}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {section.title.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.secNombre}>{section.title}</Text>
                    {section.email ? (
                      <Text style={styles.secEmail}>{section.email}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.secHeaderRight}>
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText}>{totalSec} clientes</Text>
                  </View>
                  <Text style={styles.chevron}>{colapsada ? '▶' : '▼'}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
          renderItem={({ item }) => {
            const info = estadoInfo(item.estado)
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardNombre}>{item.nombre}</Text>
                    {item.empresa ? <Text style={styles.cardEmpresa}>{item.empresa}</Text> : null}
                  </View>
                  <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
                    <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardTel}>{item.telefono}</Text>
                  <Text style={styles.cardFecha}>{tiempoRelativo(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
          renderSectionFooter={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  resumenScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  resumenContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  resumenChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    backgroundColor: '#fafafa', minWidth: 70,
  },
  resumenChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  resumenCount: { fontSize: 18, fontWeight: '700', color: '#555' },
  resumenCountAll: { color: '#fff' },
  resumenLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 1 },
  resumenLabelAll: { color: '#c9a84c' },
  searchRow: { padding: 12 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e',
  },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, color: '#aaa' },
  secHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 10,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#dde8e9',
  },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1a6470', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#c9a84c', fontSize: 16, fontWeight: '800' },
  secNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  secEmail: { fontSize: 11, color: '#aaa', marginTop: 1 },
  secHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalBadge: {
    backgroundColor: '#e0f4f5', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  totalBadgeText: { fontSize: 12, color: '#1a6470', fontWeight: '700' },
  chevron: { fontSize: 12, color: '#aaa' },
  card: {
    backgroundColor: '#fff', borderRadius: 10,
    marginHorizontal: 12, marginTop: 6,
    padding: 12, borderWidth: 1, borderColor: '#eee',
    borderLeftWidth: 3, borderLeftColor: '#1a6470',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardNombre: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  cardEmpresa: { fontSize: 11, color: '#aaa', marginTop: 1 },
  estadoBadge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  estadoText: { fontSize: 11, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTel: { fontSize: 13, color: '#555' },
  cardFecha: { fontSize: 11, color: '#bbb' },
})
