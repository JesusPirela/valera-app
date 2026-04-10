import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Resumen = {
  total_propiedades: number
  total_prospectadores: number
  total_vistas: number
  total_descargas: number
}

type TopPropiedad = {
  codigo: string
  titulo: string
  total: number
  vistas: number
  descargas: number
}

type TopProspectador = {
  email: string
  total: number
  vistas: number
  descargas: number
}

type ActividadDia = {
  dia: string
  total: number
}

type Estadisticas = {
  resumen: Resumen
  top_propiedades: TopPropiedad[]
  top_prospectadores: TopProspectador[]
  actividad_7dias: ActividadDia[]
}

function emailCorto(email: string) {
  const [usuario] = email.split('@')
  return usuario.length > 18 ? usuario.slice(0, 16) + '…' : usuario
}

function BarraHorizontal({
  label,
  sublabel,
  valor,
  max,
  colorPrincipal,
}: {
  label: string
  sublabel?: string
  valor: number
  max: number
  colorPrincipal: string
}) {
  const pct = max > 0 ? valor / max : 0
  return (
    <View style={styles.barraRow}>
      <View style={styles.barraInfo}>
        <Text style={styles.barraLabel} numberOfLines={1}>{label}</Text>
        {sublabel ? <Text style={styles.barraSubLabel} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      <View style={styles.barraTrack}>
        <View style={[styles.barraFill, { width: `${Math.max(pct * 100, 2)}%` as any, backgroundColor: colorPrincipal }]} />
      </View>
      <Text style={styles.barraValor}>{valor}</Text>
    </View>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      {children}
    </View>
  )
}

export default function Estadisticas() {
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_estadisticas_admin')
    if (!error && data) setStats(data as Estadisticas)
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  if (!stats) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudieron cargar las estadísticas.</Text>
        <TouchableOpacity onPress={cargar} style={styles.reintentarBtn}>
          <Text style={styles.reintentarText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const { resumen, top_propiedades, top_prospectadores, actividad_7dias } = stats

  const maxActividad = actividad_7dias.length > 0 ? Math.max(...actividad_7dias.map(d => d.total)) : 1
  const maxPropiedad = top_propiedades.length > 0 ? top_propiedades[0].total : 1
  const maxProspectador = top_prospectadores.length > 0 ? top_prospectadores[0].total : 1

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(admin)/propiedades')}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

      {/* Tarjetas de resumen */}
      <View style={styles.resumenGrid}>
        <View style={[styles.resumenCard, { borderTopColor: '#1a6470' }]}>
          <Text style={styles.resumenNum}>{resumen.total_propiedades}</Text>
          <Text style={styles.resumenLabel}>Propiedades</Text>
        </View>
        <View style={[styles.resumenCard, { borderTopColor: '#2e7d32' }]}>
          <Text style={[styles.resumenNum, { color: '#2e7d32' }]}>{resumen.total_prospectadores}</Text>
          <Text style={styles.resumenLabel}>Prospectadores</Text>
        </View>
        <View style={[styles.resumenCard, { borderTopColor: '#1a6470' }]}>
          <Text style={[styles.resumenNum, { color: '#1a6470' }]}>{resumen.total_vistas}</Text>
          <Text style={styles.resumenLabel}>Vistas</Text>
        </View>
        <View style={[styles.resumenCard, { borderTopColor: '#c8960c' }]}>
          <Text style={[styles.resumenNum, { color: '#c8960c' }]}>{resumen.total_descargas}</Text>
          <Text style={styles.resumenLabel}>Descargas</Text>
        </View>
      </View>

      {/* Actividad últimos 7 días */}
      <Seccion titulo="Actividad — últimos 7 días">
        {actividad_7dias.length === 0 ? (
          <Text style={styles.sinDatos}>Sin actividad reciente</Text>
        ) : (
          actividad_7dias.map((d) => (
            <BarraHorizontal
              key={d.dia}
              label={d.dia}
              valor={d.total}
              max={maxActividad}
              colorPrincipal="#1a6470"
            />
          ))
        )}
      </Seccion>

      {/* Top propiedades */}
      <Seccion titulo="Propiedades más activas">
        {top_propiedades.length === 0 ? (
          <Text style={styles.sinDatos}>Sin datos aún</Text>
        ) : (
          top_propiedades.map((p) => (
            <BarraHorizontal
              key={p.codigo}
              label={p.codigo}
              sublabel={`${p.vistas} vistas · ${p.descargas} descargas`}
              valor={p.total}
              max={maxPropiedad}
              colorPrincipal="#1a6470"
            />
          ))
        )}
      </Seccion>

      {/* Top prospectadores */}
      <Seccion titulo="Prospectadores más activos">
        {top_prospectadores.length === 0 ? (
          <Text style={styles.sinDatos}>Sin datos aún</Text>
        ) : (
          top_prospectadores.map((p) => (
            <BarraHorizontal
              key={p.email}
              label={emailCorto(p.email)}
              sublabel={`${p.vistas} vistas · ${p.descargas} descargas`}
              valor={p.total}
              max={maxProspectador}
              colorPrincipal="#c8960c"
            />
          ))
        )}
      </Seccion>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  backBtnText: { color: '#1a6470', fontSize: 15, fontWeight: '600' as const },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#aaa', fontSize: 15, marginBottom: 16 },
  reintentarBtn: {
    borderWidth: 1,
    borderColor: '#1a6470',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  reintentarText: { color: '#1a6470', fontWeight: '600' },

  resumenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  resumenCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderTopWidth: 3,
  },
  resumenNum: { fontSize: 28, fontWeight: '800', color: '#1a6470' },
  resumenLabel: { fontSize: 12, color: '#999', marginTop: 2 },

  seccion: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  sinDatos: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 8 },

  barraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  barraInfo: { width: 72 },
  barraLabel: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  barraSubLabel: { fontSize: 10, color: '#aaa', marginTop: 1 },
  barraTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barraFill: {
    height: '100%',
    borderRadius: 5,
  },
  barraValor: { fontSize: 12, fontWeight: '700', color: '#555', width: 28, textAlign: 'right' },
})
