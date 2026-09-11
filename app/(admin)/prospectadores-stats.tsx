// Estadísticas de prospectadores para el SUPERVISOR (y admin). Muestra las
// métricas de cada prospectador (publicaciones, seguimientos, clientes, citas)
// en un rango de fechas, SEPARADAS POR TIPO de prospectador: Plus, Prospectador
// y Nuevo. Es como la vista de estadísticas de bloque, pero sin filtrar por
// bloque: toda la información general del equipo. Cada fila abre el detalle
// individual (usuario-actividad) para ver el desglose por día de esa persona.
import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Metrica = 'propiedades_publicadas' | 'seguimientos' | 'clientes_nuevos' | 'citas'
type Prospectador = {
  id: string
  nombre: string | null
  role: string
  propiedades_publicadas: number
  seguimientos: number
  clientes_nuevos: number
  citas: number
}

const TEAL = '#1a6470'
const MEDALLA = ['🥇', '🥈', '🥉']

// Orden y etiquetas de los grupos (de mayor a menor jerarquía).
const GRUPOS: { role: string; label: string; emoji: string; color: string }[] = [
  { role: 'prospectador_plus', label: 'Prospectador Plus', emoji: '⭐', color: '#c9a84c' },
  { role: 'prospectador',      label: 'Prospectador',      emoji: '🔷', color: '#1a6470' },
  { role: 'nuevo',             label: 'Nuevo',             emoji: '🌱', color: '#2e7d32' },
]

const METRICAS: { key: Metrica; label: string; corta: string; color: string }[] = [
  { key: 'propiedades_publicadas', label: '📤 Publicaciones', corta: 'pub.',      color: '#1a6470' },
  { key: 'seguimientos',           label: '✅ Seguimientos',  corta: 'seg.',      color: '#c9a84c' },
  { key: 'clientes_nuevos',        label: '👤 Clientes',      corta: 'clientes',  color: '#7c3aed' },
  { key: 'citas',                  label: '📅 Citas',         corta: 'citas',     color: '#bf4e1a' },
]

export default function ProspectadoresStats() {
  const c = useColors()
  const [datos, setDatos] = useState<Prospectador[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<7 | 30 | 90>(30)
  const [metrica, setMetrica] = useState<Metrica>('propiedades_publicadas')

  const cargar = useCallback(async () => {
    const fin = new Date()
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - (rango - 1))
    inicio.setHours(0, 0, 0, 0)
    const { data } = await supabase.rpc('get_productividad_equipo', {
      p_inicio: inicio.toISOString(), p_fin: fin.toISOString(),
    })
    const lista = ((data ?? []) as any[]).map(u => ({
      id: u.id,
      nombre: u.nombre,
      role: u.role,
      propiedades_publicadas: u.propiedades_publicadas ?? 0,
      seguimientos: u.seguimientos ?? 0,
      clientes_nuevos: u.clientes_nuevos ?? 0,
      citas: u.citas ?? 0,
    })) as Prospectador[]
    setDatos(lista)
    setLoading(false)
  }, [rango])

  useFocusEffect(useCallback(() => { setLoading(true); cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  const metricaInfo = METRICAS.find(m => m.key === metrica)!

  // Agrupa por tipo de prospectador y ordena cada grupo por la métrica activa.
  const grupos = useMemo(() => {
    return GRUPOS.map(g => {
      const miembros = datos
        .filter(d => d.role === g.role)
        .sort((a, b) => b[metrica] - a[metrica])
      const total = miembros.reduce((s, m) => s + m[metrica], 0)
      return { ...g, miembros, total }
    })
  }, [datos, metrica])

  const totalGeneral = useMemo(
    () => grupos.reduce((s, g) => s + g.total, 0),
    [grupos],
  )

  function abrirProspectador(p: Prospectador) {
    router.push({
      pathname: '/(admin)/usuario-actividad',
      params: { id: p.id, nombre: p.nombre ?? '' },
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(prospectador)/supervision')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>📊 Estadísticas de prospectadores</Text>
          <Text style={s.headerSub}>Desempeño del equipo por tipo de prospectador</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} refreshControl={refreshControl}>
        {/* Rango */}
        <View style={s.chipsRow}>
          {([[7, '7 días'], [30, '30 días'], [90, '90 días']] as const).map(([v, lbl]) => (
            <TouchableOpacity key={v} style={[s.chip, { borderColor: c.border }, rango === v && s.chipOn]} onPress={() => setRango(v)}>
              <Text style={[s.chipTxt, { color: c.textSub }, rango === v && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Métrica (ordena las listas) */}
        <View style={s.chipsRow}>
          {METRICAS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[s.chip, { borderColor: c.border }, metrica === m.key && { backgroundColor: m.color, borderColor: m.color }]}
              onPress={() => setMetrica(m.key)}
            >
              <Text style={[s.chipTxt, { color: c.textSub }, metrica === m.key && s.chipTxtOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 50 }} />
        ) : datos.length === 0 ? (
          <Text style={[s.vacio, { color: c.textMute }]}>No hay datos de prospectadores en este periodo.</Text>
        ) : (
          <>
            {/* Resumen general */}
            <View style={[s.resumen, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[s.resTotal, { color: metricaInfo.color }]}>{totalGeneral}</Text>
              <Text style={[s.resLbl, { color: c.textMute }]}>
                {metricaInfo.label} · todo el equipo · últimos {rango} días
              </Text>
            </View>

            {/* Grupos por tipo de prospectador */}
            {grupos.map(g => (
              <View key={g.role} style={{ marginBottom: 18 }}>
                <View style={s.grupoHeader}>
                  <Text style={[s.grupoTitulo, { color: c.text }]}>
                    {g.emoji} {g.label}
                  </Text>
                  <Text style={[s.grupoBadge, { color: g.color, borderColor: g.color }]}>
                    {g.miembros.length} · {g.total} {metricaInfo.corta}
                  </Text>
                </View>

                {g.miembros.length === 0 ? (
                  <Text style={[s.grupoVacio, { color: c.textMute }]}>Sin prospectadores en este grupo.</Text>
                ) : (
                  g.miembros.map((p, i) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => abrirProspectador(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.pos}>{MEDALLA[i] ?? `${i + 1}.`}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>
                          {p.nombre ?? 'Sin nombre'}
                        </Text>
                        <Text style={[s.subMetricas, { color: c.textMute }]} numberOfLines={1}>
                          📤 {p.propiedades_publicadas}  ✅ {p.seguimientos}  👤 {p.clientes_nuevos}  📅 {p.citas}
                        </Text>
                      </View>
                      <Text style={[s.valor, { color: metricaInfo.color }]}>{p[metrica]}</Text>
                      <Text style={[s.chevron, { color: c.textMute }]}>›</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ))}

            <Text style={[s.pie, { color: c.textMute }]}>
              Toca a un prospectador para ver su actividad día por día. El valor grande y el orden dependen de la métrica seleccionada arriba.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  header: { backgroundColor: TEAL, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },

  vacio: { fontSize: 13.5, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },

  resumen: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16, alignItems: 'center' },
  resTotal: { fontSize: 34, fontWeight: '900' },
  resLbl: { fontSize: 12, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  grupoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  grupoTitulo: { fontSize: 15.5, fontWeight: '800' },
  grupoBadge: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  grupoVacio: { fontSize: 12.5, fontStyle: 'italic', paddingVertical: 6, paddingLeft: 4 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  pos: { fontSize: 16, width: 26, textAlign: 'center' },
  nombre: { fontSize: 14.5, fontWeight: '700' },
  subMetricas: { fontSize: 11.5, marginTop: 3, letterSpacing: 0.2 },
  valor: { fontSize: 22, fontWeight: '900', minWidth: 34, textAlign: 'right' },
  chevron: { fontSize: 22, fontWeight: '300' },

  pie: { fontSize: 11.5, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },
})
