import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'

type Hilo = {
  telefono: string
  nombre: string | null
  cliente_id: string | null
  ultimo_mensaje: string
  fecha_ultimo: string
  direccion_ultimo: 'lead' | 'bot'
  total_mensajes: number
  estado_lead: 'contactado' | 'esperando_asesor' | 'atendido' | null
  prospectador_nombre: string | null
}

type ChatsScreenProps = {
  volverHref: string
  chatClienteBase: string
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function formatTelefono(telefono: string) {
  // telefono canónico: "52" + 10 dígitos
  const resto = telefono.slice(2)
  if (resto.length !== 10) return `+${telefono}`
  return `+52 ${resto.slice(0, 2)} ${resto.slice(2, 6)} ${resto.slice(6, 10)}`
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function badgeEstado(estado: Hilo['estado_lead']): { texto: string; color: string } | null {
  if (estado === 'esperando_asesor') return { texto: '🔥 Esperando asesor', color: '#c0392b' }
  if (estado === 'atendido') return { texto: '✅ Atendido', color: '#2e7d32' }
  if (estado === 'contactado') return { texto: '💬 Contactado', color: '#1a6470' }
  return null
}

export default function ChatsScreen({ volverHref, chatClienteBase }: ChatsScreenProps) {
  const c = useColors()
  const [hilos, setHilos] = useState<Hilo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cargar(esRefresh = false) {
    if (esRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const { data, error: err } = await supabase.functions.invoke('twilio-mensajes', {
      body: { action: 'hilos' },
    })

    if (err) {
      setError('No se pudieron cargar los chats. Intenta de nuevo.')
    } else if (data?.error) {
      setError(data.error)
    } else {
      setHilos(data?.hilos ?? [])
    }

    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { cargar() }, []))

  const styles = crearEstilos(c)

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace(volverHref as any)}>
          <Ionicons name="arrow-back" size={20} color="#1a6470" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.titulo, { color: c.text }]}>💬 Chats de WhatsApp</Text>
      </View>

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
      ) : hilos.length === 0 ? (
        <View style={styles.centro}>
          <Ionicons name="chatbubbles-outline" size={48} color={c.textMute} />
          <Text style={[styles.vacioTxt, { color: c.textSub }]}>
            No hay conversaciones de WhatsApp en los últimos 30 días.
          </Text>
        </View>
      ) : (
        <FlatList
          data={hilos}
          keyExtractor={(item) => item.telefono}
          contentContainerStyle={styles.lista}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} tintColor="#1a6470" />
          }
          renderItem={({ item }) => {
            const badge = badgeEstado(item.estado_lead)
            return (
              <TouchableOpacity
                style={[styles.item, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => router.push(
                  `${chatClienteBase}?telefono=${item.telefono}&nombre=${encodeURIComponent(item.nombre ?? '')}&clienteId=${item.cliente_id ?? ''}` as any
                )}
              >
                <View style={styles.avatar}>
                  {item.nombre ? (
                    <Text style={styles.avatarTxt}>{iniciales(item.nombre)}</Text>
                  ) : (
                    <Ionicons name="person-outline" size={18} color="#1a6470" />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.itemHeadRow}>
                    <Text style={[styles.nombre, { color: c.text }]} numberOfLines={1}>
                      {item.nombre ?? 'Lead sin registrar'}
                    </Text>
                    <Text style={[styles.fecha, { color: c.textMute }]}>{tiempoRelativo(item.fecha_ultimo)}</Text>
                  </View>
                  <Text style={[styles.telefono, { color: c.textSub }]}>{formatTelefono(item.telefono)}</Text>
                  <View style={styles.previewRow}>
                    {item.direccion_ultimo === 'lead' && <View style={styles.badgeLead} />}
                    <Text style={[styles.preview, { color: c.textSub }]} numberOfLines={1}>
                      {item.direccion_ultimo === 'bot' ? 'Bot: ' : ''}{item.ultimo_mensaje || '(sin texto)'}
                    </Text>
                  </View>
                  {(badge || item.prospectador_nombre) && (
                    <View style={styles.metaRow}>
                      {badge && (
                        <Text style={[styles.badgeEstado, { color: badge.color }]}>{badge.texto}</Text>
                      )}
                      {item.prospectador_nombre && (
                        <Text style={[styles.prospectador, { color: c.textMute }]}>
                          · {item.prospectador_nombre}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={16} color={c.textMute} />
              </TouchableOpacity>
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
    header: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    backText: { color: '#1a6470', fontSize: 15, fontWeight: '600' },
    titulo: { fontSize: 20, fontWeight: '700', marginTop: 8 },

    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
    errorTxt: { fontSize: 14, textAlign: 'center' },
    vacioTxt: { fontSize: 14, textAlign: 'center' },
    btnReintentar: { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
    btnReintentarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

    lista: { padding: 12, gap: 8 },
    item: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 12, borderWidth: 1, padding: 12,
    },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: '#e6f0f2', alignItems: 'center', justifyContent: 'center',
    },
    avatarTxt: { color: '#1a6470', fontWeight: '700', fontSize: 14 },
    itemHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    nombre: { fontSize: 14, fontWeight: '700', flex: 1 },
    fecha: { fontSize: 11 },
    telefono: { fontSize: 12, marginTop: 2 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    badgeLead: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#25D366' },
    preview: { fontSize: 12, flex: 1 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
    badgeEstado: { fontSize: 11, fontWeight: '700' },
    prospectador: { fontSize: 11 },
  })
}
