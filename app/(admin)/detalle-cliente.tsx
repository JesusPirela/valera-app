import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { ESTADOS } from '../(prospectador)/crm'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  tipo_operacion: string | null
  tipo_credito: string | null
  presupuesto: string | null
  zona_busqueda: string | null
  notas: string | null
  proximo_contacto: string | null
  created_at: string
}

type Interaccion = {
  id: string
  tipo: string
  descripcion: string
  created_at: string
}

type Recordatorio = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_hora: string
  completado: boolean
}

const FUENTE_LABELS: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko',
  campana_fb: 'Campaña FB', grupo_fb: 'Grupo FB', otro: 'Otro',
  // legacy
  referido: 'Referido', redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría', evento: 'Evento',
}

const CREDITO_LABELS: Record<string, string> = {
  infonavit: 'Infonavit', fovisste: 'Fovisste',
  bancario: 'Bancario', contado: 'Contado', otro: 'Otro',
}

const TIPO_ICON: Record<string, string> = {
  nota: '📝', llamada: '📞', mensaje: '💬', visita: '🏠', estado_cambiado: '🔄',
}

function tiempoRelativo(fechaISO: string) {
  const diff = Date.now() - new Date(fechaISO).getTime()
  const min = Math.floor(diff / 60000)
  const hrs = Math.floor(min / 60)
  const dias = Math.floor(hrs / 24)
  if (min < 1) return 'Hace un momento'
  if (min < 60) return `Hace ${min} min`
  if (hrs < 24) return `Hace ${hrs}h`
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fechaISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFechaHora(fechaISO: string) {
  return new Date(fechaISO).toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminDetalleCliente() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacciones, setInteracciones] = useState<Interaccion[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    const [{ data: c }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('interacciones').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
      supabase.from('recordatorios').select('*').eq('cliente_id', id).order('fecha_hora', { ascending: true }),
    ])
    if (c) setCliente(c)
    setInteracciones(i ?? [])
    setRecordatorios(r ?? [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, [id]))

  if (loading) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 80 }} />
  if (!cliente) return (
    <View style={styles.container}>
      <Text style={{ padding: 24, color: '#aaa' }}>Cliente no encontrado.</Text>
    </View>
  )

  const info = ESTADOS[cliente.estado] ?? { label: cliente.estado, color: '#555', bg: '#eee' }
  const recPendientes = recordatorios.filter((r) => !r.completado)
  const recCompletados = recordatorios.filter((r) => r.completado)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Etiqueta solo lectura */}
      <View style={styles.readonlyBanner}>
        <Text style={styles.readonlyText}>Vista de consulta — solo lectura</Text>
      </View>

      {/* Info principal */}
      <View style={styles.clienteCard}>
        <View style={styles.clienteTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.clienteNombre}>{cliente.nombre}</Text>
            {cliente.empresa ? <Text style={styles.clienteEmpresa}>{cliente.empresa}</Text> : null}
          </View>
          <View style={[styles.estadoBadge, { backgroundColor: info.bg }]}>
            <Text style={[styles.estadoText, { color: info.color }]}>{info.label}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Teléfono</Text>
          <Text style={styles.infoValue}>{cliente.telefono}</Text>
        </View>
        {cliente.email ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{cliente.email}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fuente</Text>
          <Text style={styles.infoValue}>{FUENTE_LABELS[cliente.fuente_lead] ?? cliente.fuente_lead}</Text>
        </View>
        {cliente.tipo_operacion ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Busca en</Text>
            <Text style={styles.infoValue}>{cliente.tipo_operacion === 'venta' ? 'Venta' : 'Renta'}</Text>
          </View>
        ) : null}
        {cliente.zona_busqueda ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Zona</Text>
            <Text style={styles.infoValue}>{cliente.zona_busqueda}</Text>
          </View>
        ) : null}
        {cliente.tipo_credito ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Crédito</Text>
            <Text style={styles.infoValue}>{CREDITO_LABELS[cliente.tipo_credito] ?? cliente.tipo_credito}</Text>
          </View>
        ) : null}
        {cliente.presupuesto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Presupuesto</Text>
            <Text style={styles.infoValue}>{cliente.presupuesto}</Text>
          </View>
        ) : null}
        {cliente.proximo_contacto ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Próx. contacto</Text>
            <Text style={styles.infoValue}>{formatFechaHora(cliente.proximo_contacto)}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Agregado</Text>
          <Text style={styles.infoValue}>{tiempoRelativo(cliente.created_at)}</Text>
        </View>
        {cliente.notas ? (
          <View style={styles.notasBox}>
            <Text style={styles.notasLabel}>Notas</Text>
            <Text style={styles.notasText}>{cliente.notas}</Text>
          </View>
        ) : null}
      </View>

      {/* Recordatorios — solo lectura */}
      <Text style={styles.secTitle}>Recordatorios</Text>

      {recPendientes.length === 0 ? (
        <Text style={styles.emptyText}>Sin recordatorios pendientes.</Text>
      ) : (
        recPendientes.map((r) => {
          const vencido = new Date(r.fecha_hora) < new Date()
          return (
            <View key={r.id} style={[styles.recCard, vencido && styles.recCardVencido]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recTitulo, vencido && styles.recTituloVencido]}>{r.titulo}</Text>
                <Text style={styles.recFecha}>{formatFechaHora(r.fecha_hora)}</Text>
                {r.descripcion ? <Text style={styles.recDesc}>{r.descripcion}</Text> : null}
                {vencido && <Text style={styles.recVencidoLabel}>Vencido</Text>}
              </View>
            </View>
          )
        })
      )}

      {recCompletados.length > 0 && (
        <Text style={styles.recCompletadosLabel}>
          {recCompletados.length} recordatorio{recCompletados.length > 1 ? 's' : ''} completado{recCompletados.length > 1 ? 's' : ''}
        </Text>
      )}

      {/* Historial — solo lectura */}
      <Text style={[styles.secTitle, { marginTop: 16 }]}>Historial de actividad</Text>

      {interacciones.length === 0 ? (
        <Text style={styles.emptyText}>Sin actividad registrada.</Text>
      ) : (
        interacciones.map((item) => (
          <View key={item.id} style={styles.interaccionRow}>
            <Text style={styles.interaccionIcon}>{TIPO_ICON[item.tipo] ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.interaccionDesc}>{item.descripcion}</Text>
              <Text style={styles.interaccionFecha}>{tiempoRelativo(item.created_at)}</Text>
            </View>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 48 },

  readonlyBanner: {
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ffe082',
    alignItems: 'center',
  },
  readonlyText: { fontSize: 12, color: '#b8860b', fontWeight: '600' },

  clienteCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#eee',
  },
  clienteTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  clienteNombre: { fontSize: 20, fontWeight: '800', color: '#1a1a2e' },
  clienteEmpresa: { fontSize: 13, color: '#888', marginTop: 2 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  estadoText: { fontSize: 12, fontWeight: '700' },

  infoRow: {
    flexDirection: 'row', marginBottom: 6, flexWrap: 'wrap',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 6,
  },
  infoLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', width: 120 },
  infoValue: { fontSize: 13, color: '#333', flex: 1 },

  notasBox: {
    marginTop: 8, backgroundColor: '#f9f9f9', borderRadius: 8,
    padding: 10, borderLeftWidth: 3, borderLeftColor: '#c9a84c',
  },
  notasLabel: { fontSize: 11, fontWeight: '700', color: '#aaa', marginBottom: 4 },
  notasText: { fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 19 },

  secTitle: {
    fontSize: 12, fontWeight: '700', color: '#1a6470', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: '#bbb', marginBottom: 12 },

  recCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#e0f4f5',
  },
  recCardVencido: { borderColor: '#fde8e8', backgroundColor: '#fff8f8' },
  recTitulo: { fontSize: 14, fontWeight: '700', color: '#1a6470', marginBottom: 2 },
  recTituloVencido: { color: '#c0392b' },
  recFecha: { fontSize: 12, color: '#888' },
  recDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  recVencidoLabel: { fontSize: 11, color: '#c0392b', fontWeight: '600', marginTop: 3 },
  recCompletadosLabel: { fontSize: 12, color: '#bbb', marginBottom: 8 },

  interaccionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#eee',
  },
  interaccionIcon: { fontSize: 18 },
  interaccionDesc: { fontSize: 13, color: '#333', lineHeight: 19 },
  interaccionFecha: { fontSize: 11, color: '#bbb', marginTop: 3 },
})
