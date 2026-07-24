import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert, useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

import { getUsuarioActual } from '../../lib/sesion'
type TareaInfo = {
  id: string
  titulo: string
  descripcion: string | null
  tipo: string
  meta_cantidad: number
  fecha_limite: string | null
}

type Asignacion = {
  id: string
  progreso: number
  completada: boolean
  completada_at: string | null
  tarea: TareaInfo
}

const TIPO_LABEL: Record<string, string> = {
  manual: 'Manual',
  publicar_propiedades: 'Publicar propiedades',
  contactar_clientes: 'Contactar clientes',
  completar_curso: 'Completar curso',
}

const TIPO_ICON: Record<string, string> = {
  manual: 'checkmark-circle-outline',
  publicar_propiedades: 'home-outline',
  contactar_clientes: 'people-outline',
  completar_curso: 'school-outline',
}

export default function TareasScreen() {
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  useFocusEffect(useCallback(() => {
    cargar()
  }, []))

  const yaCargoRef = useRef(false)
  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    const { data: { user } } = await getUsuarioActual()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('tarea_asignaciones')
      .select(`
        id, progreso, completada, completada_at,
        tarea:tareas(id, titulo, descripcion, tipo, meta_cantidad, fecha_limite, activa)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const validas = ((data ?? []) as any[]).filter((a: any) => a.tarea?.activa !== false)
    setAsignaciones(validas)
    yaCargoRef.current = true
    setLoading(false)
  }

  async function marcarManual(asignacionId: string) {
    const { error } = await supabase
      .from('tarea_asignaciones')
      .update({ completada: true, progreso: 1, completada_at: new Date().toISOString() })
      .eq('id', asignacionId)
    if (error) {
      if (Platform.OS === 'web') window.alert('No se pudo marcar la tarea')
      else Alert.alert('Error', 'No se pudo marcar la tarea')
      return
    }
    cargar()
  }

  const pendientes = asignaciones.filter(a => !a.completada)
  const completadas = asignaciones.filter(a => a.completada)
  const total = asignaciones.length
  const pct = total > 0 ? Math.round((completadas.length / total) * 100) : 0

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a6470" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        { paddingBottom: 40 },
        isWide && { alignItems: 'center' },
      ]}
    >
      <View style={isWide ? styles.wideInner : undefined}>
        {/* Hero de progreso diario */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Progreso de hoy</Text>
              <Text style={styles.heroPct}>{pct}%</Text>
            </View>
            <View style={styles.heroStats}>
              <Text style={styles.heroFrac}>{completadas.length}/{total}</Text>
              <Text style={styles.heroFracLabel}>completadas</Text>
            </View>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${pct}%` as any }]} />
          </View>
          {pct === 100 && total > 0 && (
            <Text style={styles.heroFire}>🔥 ¡Todas completadas! Excelente trabajo.</Text>
          )}
        </View>

        {/* Pendientes */}
        {pendientes.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Pendientes ({pendientes.length})</Text>
            <View style={isWide ? styles.grid : undefined}>
              {pendientes.map(a => (
                <View key={a.id} style={isWide ? styles.gridItem : undefined}>
                  <TareaCard asignacion={a} onMarcar={() => marcarManual(a.id)} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Completadas */}
        {completadas.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Completadas ({completadas.length})</Text>
            <View style={isWide ? styles.grid : undefined}>
              {completadas.map(a => (
                <View key={a.id} style={isWide ? styles.gridItem : undefined}>
                  <TareaCard asignacion={a} onMarcar={() => {}} />
                </View>
              ))}
            </View>
          </View>
        )}

        {total === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>Sin tareas asignadas</Text>
            <Text style={styles.emptySub}>
              Cuando el administrador te asigne tareas, aparecerán aquí
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

function TareaCard({ asignacion, onMarcar }: { asignacion: Asignacion; onMarcar: () => void }) {
  const { tarea, progreso, completada, completada_at } = asignacion
  const medible = tarea.meta_cantidad > 1
  const pct = medible
    ? Math.min(100, Math.round((progreso / tarea.meta_cantidad) * 100))
    : completada ? 100 : 0

  const diasRestantes = tarea.fecha_limite
    ? Math.ceil((new Date(tarea.fecha_limite).getTime() - Date.now()) / 86400000)
    : null

  const iconName = (TIPO_ICON[tarea.tipo] ?? 'ellipse-outline') as any

  return (
    <View style={[styles.card, completada && styles.cardDone]}>
      <View style={styles.cardTop}>
        <View style={[styles.tipoIconWrap, completada && styles.tipoIconWrapDone]}>
          <Ionicons name={iconName} size={20} color={completada ? '#2a8a5a' : '#1a6470'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitulo, completada && styles.cardTituloDone]}>
            {tarea.titulo}
          </Text>
          {tarea.descripcion ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{tarea.descripcion}</Text>
          ) : null}
          <Text style={styles.tipoChip}>{TIPO_LABEL[tarea.tipo] ?? tarea.tipo}</Text>
        </View>
        {completada && (
          <Ionicons name="checkmark-circle" size={26} color="#2a8a5a" style={{ marginLeft: 4 }} />
        )}
      </View>

      {/* Barra de progreso para tareas medibles */}
      {medible && (
        <View style={styles.progressWrap}>
          <View style={styles.miniBarBg}>
            <View
              style={[
                styles.miniBarFill,
                { width: `${pct}%` as any, backgroundColor: completada ? '#2a8a5a' : '#1a6470' },
              ]}
            />
          </View>
          <Text style={[styles.counter, completada && { color: '#2a8a5a' }]}>
            {progreso} / {tarea.meta_cantidad} — {pct}%
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        {diasRestantes !== null && !completada && (
          <Text style={[styles.deadline, diasRestantes <= 0 && styles.deadlineRed]}>
            {diasRestantes <= 0
              ? '⚠️ Vencida'
              : diasRestantes === 1
              ? '⏰ Vence hoy'
              : `📅 ${diasRestantes}d restantes`}
          </Text>
        )}
        {completada && completada_at && (
          <Text style={styles.doneAt}>
            ✓ Completada el{' '}
            {new Date(completada_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
          </Text>
        )}
        {!completada && tarea.tipo === 'manual' && (
          <TouchableOpacity style={styles.completarBtn} onPress={onMarcar}>
            <Text style={styles.completarText}>Marcar completada</Text>
          </TouchableOpacity>
        )}
        {!completada && tarea.tipo !== 'manual' && (
          <Text style={styles.autoHint}>↻ Progreso automático</Text>
        )}
      </View>
    </View>
  )
}

const TEAL = '#1a6470'
const GOLD = '#c9a84c'
const GREEN = '#2a8a5a'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  hero: {
    margin: 16,
    backgroundColor: TEAL,
    borderRadius: 20,
    padding: 22,
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  heroLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 },
  heroPct: { color: '#fff', fontSize: 52, fontWeight: '800', lineHeight: 56 },
  heroStats: { alignItems: 'flex-end', paddingBottom: 6 },
  heroFrac: { color: GOLD, fontSize: 22, fontWeight: '700' },
  heroFracLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  barBg: { height: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 5 },
  barFill: { height: 10, backgroundColor: GOLD, borderRadius: 5 },
  heroFire: { color: GOLD, fontSize: 13, fontWeight: '600', marginTop: 10, textAlign: 'center' },

  seccion: { paddingHorizontal: 16, marginTop: 4 },
  seccionTitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a9ea0',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 8,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0eaec',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDone: { borderColor: '#b8e0c8', backgroundColor: '#f3fbf6' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#e8f2f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipoIconWrapDone: { backgroundColor: '#d4f0e2' },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#1a2e30', marginBottom: 2 },
  cardTituloDone: { color: GREEN },
  cardDesc: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 4 },
  tipoChip: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '600',
    color: '#6a8a8e',
    backgroundColor: '#eaf2f4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },

  progressWrap: { marginTop: 12 },
  miniBarBg: { height: 7, backgroundColor: '#e0eaec', borderRadius: 4, marginBottom: 5 },
  miniBarFill: { height: 7, borderRadius: 4 },
  counter: { fontSize: 12, color: '#666', fontWeight: '600' },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  deadline: { fontSize: 12, color: '#8a9ea0' },
  deadlineRed: { color: '#c0392b', fontWeight: '700' },
  doneAt: { fontSize: 12, color: GREEN, fontWeight: '600' },
  completarBtn: {
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  completarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  autoHint: { fontSize: 11, color: '#b0bec0', fontStyle: 'italic', marginLeft: 'auto' },

  empty: { alignItems: 'center', paddingHorizontal: 40, marginTop: 60 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEAL, marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#8a9ea0', textAlign: 'center', lineHeight: 20 },

  wideInner: { width: '100%', maxWidth: 860, paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { flex: 1, minWidth: 300 },
})
