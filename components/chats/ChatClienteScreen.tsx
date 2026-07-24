import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'

type Mensaje = { sid: string; body: string; direction: 'lead' | 'bot'; fecha: string }
type Fila = { tipo: 'separador'; label: string; key: string } | { tipo: 'mensaje'; data: Mensaje; key: string }
type EstadoLead = 'contactado' | 'esperando_asesor' | 'atendido'

type ChatClienteScreenProps = {
  volverHref: string
  fichaHrefBuilder: (clienteId: string) => string
}

function formatTelefono(telefono: string) {
  const resto = telefono.slice(2)
  if (resto.length !== 10) return `+${telefono}`
  return `+52 ${resto.slice(0, 2)} ${resto.slice(2, 6)} ${resto.slice(6, 10)}`
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
}

function formatDia(iso: string) {
  const fecha = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  if (fecha.toDateString() === hoy.toDateString()) return 'Hoy'
  if (fecha.toDateString() === ayer.toDateString()) return 'Ayer'
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ChatClienteScreen({ volverHref, fichaHrefBuilder }: ChatClienteScreenProps) {
  const c = useColors()
  const { telefono, nombre, clienteId } = useLocalSearchParams<{ telefono: string; nombre?: string; clienteId?: string }>()

  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [estadoLead, setEstadoLead] = useState<EstadoLead | null>(null)
  const [marcando, setMarcando] = useState(false)
  const listRef = useRef<FlatList>(null)

  async function cargar(esRefresh = false) {
    if (esRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const [resMensajes, resLead] = await Promise.all([
      supabase.functions.invoke('twilio-mensajes', { body: { action: 'mensajes', telefono } }),
      supabase.from('chatbot_leads').select('id, estado').eq('telefono', telefono ?? '').maybeSingle(),
    ])

    const { data, error: err } = resMensajes
    if (err) {
      setError('No se pudo cargar la conversación. Intenta de nuevo.')
    } else if (data?.error) {
      setError(data.error)
    } else {
      setMensajes(data?.mensajes ?? [])
    }

    if (resLead.data) {
      setLeadId(resLead.data.id)
      setEstadoLead(resLead.data.estado)
    } else {
      setLeadId(null)
      setEstadoLead(null)
    }

    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, [telefono]))

  async function marcarAtendido() {
    if (!leadId) return
    setMarcando(true)

    const { error: errLead } = await supabase
      .from('chatbot_leads')
      .update({ estado: 'atendido' })
      .eq('id', leadId)

    if (errLead) {
      Alert.alert('Error', 'No se pudo marcar el lead como atendido.')
      setMarcando(false)
      return
    }

    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('chatbot_lead_id', leadId)
      .eq('leida', false)

    setEstadoLead('atendido')
    setMarcando(false)
  }

  const styles = crearEstilos(c)

  // Construir filas con separadores de día
  const filas: Fila[] = []
  let diaAnterior: string | null = null
  for (const m of mensajes) {
    const dia = formatDia(m.fecha)
    if (dia !== diaAnterior) {
      filas.push({ tipo: 'separador', label: dia, key: `sep-${dia}-${m.sid}` })
      diaAnterior = dia
    }
    filas.push({ tipo: 'mensaje', data: m, key: m.sid })
  }

  const nombreMostrado = nombre && nombre.trim() ? nombre : 'Lead sin registrar'

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        {/* Volver a donde estabas. Antes se forzaba SIEMPRE la lista de chats
            porque el historial "mandaba al inicio", pero eso era el
            backBehavior por defecto de las pestañas (ya corregido en el layout
            a "history"). volverHref queda de plan B si no hay historial. */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(volverHref as any))}
        >
          <Ionicons name="arrow-back" size={20} color="#1a6470" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nombre, { color: c.text }]} numberOfLines={1}>{nombreMostrado}</Text>
          <Text style={[styles.telefono, { color: c.textSub }]}>{formatTelefono(telefono ?? '')}</Text>
        </View>
        {!!clienteId && (
          <TouchableOpacity style={styles.btnFicha} onPress={() => router.push(fichaHrefBuilder(clienteId) as any)}>
            <Ionicons name="person-circle-outline" size={16} color="#1a6470" />
            <Text style={styles.btnFichaTxt}>Ficha</Text>
          </TouchableOpacity>
        )}
      </View>

      {leadId && estadoLead !== 'atendido' && (
        <View style={[styles.atendidoBar, { borderBottomColor: c.border }]}>
          <Text style={[styles.atendidoTxt, { color: c.textSub }]}>
            {estadoLead === 'esperando_asesor' ? '🔥 Esperando ser atendido' : '💬 Contactado por el chatbot'}
          </Text>
          <TouchableOpacity style={styles.btnAtendido} onPress={marcarAtendido} disabled={marcando}>
            <Text style={styles.btnAtendidoTxt}>{marcando ? 'Guardando...' : 'Marcar como atendido'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {leadId && estadoLead === 'atendido' && (
        <View style={[styles.atendidoBar, { borderBottomColor: c.border }]}>
          <Text style={[styles.atendidoTxt, { color: '#2e7d32' }]}>✅ Atendido</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centro}>
          <ActivityIndicator color="#1a6470" size="large" />
        </View>
      ) : error ? (
        <View style={styles.centro}>
          <Ionicons name="alert-circle-outline" size={40} color="#c0392b" />
          <Text style={[styles.errorTxt, { color: c.text }]}>{error}</Text>
          <TouchableOpacity style={styles.btnReintentar} onPress={() => cargar()}>
            <Text style={styles.btnReintentarTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : filas.length === 0 ? (
        <View style={styles.centro}>
          <Ionicons name="chatbubbles-outline" size={48} color={c.textMute} />
          <Text style={[styles.vacioTxt, { color: c.textSub }]}>
            Todavía no hay mensajes con este número.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filas}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.lista}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} tintColor="#1a6470" />
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            if (item.tipo === 'separador') {
              return (
                <View style={styles.separadorRow}>
                  <Text style={[styles.separadorTxt, { color: c.textMute, backgroundColor: c.card }]}>{item.label}</Text>
                </View>
              )
            }
            const m = item.data
            const esBot = m.direction === 'bot'
            return (
              <View style={[styles.burbujaRow, esBot ? styles.burbujaRowBot : styles.burbujaRowLead]}>
                <View style={[styles.burbuja, esBot ? styles.burbujaBot : [styles.burbujaLead, { backgroundColor: c.card, borderColor: c.border }]]}>
                  <Text style={[styles.burbujaTxt, esBot ? styles.burbujaTxtBot : { color: c.text }]}>{m.body || '(sin texto)'}</Text>
                  <Text style={[styles.burbujaHora, esBot ? styles.burbujaHoraBot : { color: c.textMute }]}>{formatHora(m.fecha)}</Text>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

function crearEstilos(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    nombre: { fontSize: 16, fontWeight: '700' },
    telefono: { fontSize: 12, marginTop: 1 },
    btnFicha: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#e6f0f2', borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    btnFichaTxt: { color: '#1a6470', fontSize: 12, fontWeight: '700' },

    atendidoBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 8,
    },
    atendidoTxt: { fontSize: 12, fontWeight: '600', flex: 1 },
    btnAtendido: { backgroundColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    btnAtendidoTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    errorTxt: { fontSize: 14, textAlign: 'center' },
    vacioTxt: { fontSize: 14, textAlign: 'center' },
    btnReintentar: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
    btnReintentarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

    lista: { padding: 12, paddingBottom: 24 },
    separadorRow: { alignItems: 'center', marginVertical: 10 },
    separadorTxt: { fontSize: 11, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },

    burbujaRow: { flexDirection: 'row', marginBottom: 6 },
    burbujaRowLead: { justifyContent: 'flex-start' },
    burbujaRowBot: { justifyContent: 'flex-end' },
    burbuja: { maxWidth: '78%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    burbujaLead: { borderWidth: 1, borderBottomLeftRadius: 2 },
    burbujaBot: { backgroundColor: '#1a6470', borderBottomRightRadius: 2 },
    burbujaTxt: { fontSize: 14, lineHeight: 19 },
    burbujaTxtBot: { color: '#fff' },
    burbujaHora: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
    burbujaHoraBot: { color: 'rgba(255,255,255,0.75)' },
  })
}
