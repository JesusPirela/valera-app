import React, { useState, useCallback, useEffect, useMemo, createElement, memo } from 'react'
import {
  View, Text, StyleSheet, TextInput, Platform, Linking, Alert,
  ActivityIndicator, TouchableOpacity, ScrollView, FlatList, Modal, useWindowDimensions, RefreshControl, Keyboard,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { normalizar } from '../../lib/texto'
import { registrarAccion , registrarSeguimiento, registrarContacto } from '../../lib/gamification'

const VISTA_CRM_KEY = '@valera_crm_vista'
import { useColors, useTheme } from '../../lib/ThemeContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { OfflineBanner } from '../../components/OfflineBanner'
import ImportCSVModal, { parsearCSV, type ImportedRow } from '../../components/ImportCSVModal'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { enqueueClienteUpdate } from '../../lib/offline-queue'
import { conTimeout } from '../../lib/redIntentos'
import { puedeEnviarClienteAChatbot } from '../../lib/permisos'
import { ZonasInteresField } from '../../components/ZonasInteresField'
import { Tooltip } from '../../components/Tooltip'
// Si el CRM lanza un error al renderizar, mostrar pantalla recuperable + log
// en vez de quedarse en blanco/negro (expo-router usa este export por ruta).
export { ErrorBoundary } from '../../components/PantallaError'
import { parseZonasGuardadas } from '../../lib/zonas-interes'

type Cliente = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  empresa: string | null
  fuente_lead: string
  estado: string
  tipo_operacion: string | null
  proximo_contacto: string | null
  created_at: string
  updated_at: string
  nivel_interes: 'alto' | 'medio' | 'bajo' | null
  notas: string | null
  zona_busqueda: string | null
  presupuesto: string | null
  tipo_credito: string | null
  es_lead_campania?: boolean
  enviado_crm?: boolean
  recordatorios: { id: string; titulo: string; fecha_hora: string; completado: boolean }[]
}

const NIVEL_INTERES_LABEL: Record<string, string> = {
  alto: '🔥 Alto', medio: '🌡️ Medio', bajo: '❄️ Bajo',
}

const TIPO_CREDITO_LABEL: Record<string, string> = {
  infonavit: 'Infonavit',
  fovisste: 'Fovisste',
  bancario: 'Bancario',
  contado: 'Contado',
  otro: 'Otro',
}

export const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  primer_contacto:    { label: 'Primer contacto',        color: '#9a7018', bg: '#fdf8e6' }, // trigo dorado
  por_perfilar:       { label: 'Por perfilar',           color: '#7a5230', bg: '#f8ede0' }, // caoba
  no_contesta:        { label: 'No contesta',            color: '#6b7280', bg: '#f2f3f5' }, // pizarra
  cita_por_agendar:   { label: 'Cita por agendar',      color: '#bf4e1a', bg: '#fef2e8' }, // teja
  cita_a_futuro:      { label: 'Cita a futuro',         color: '#a07020', bg: '#fefae6' }, // ámbar
  cita_agendada:      { label: 'Cita agendada',         color: '#1a6855', bg: '#e4f5ef' }, // esmeralda
  seguimiento_cierre: { label: 'Seg. de cierre',        color: '#8b2252', bg: '#fdf0f7' }, // burdeos
  compro:             { label: 'Apartó / Compró',       color: '#1a5e32', bg: '#e5f5ea' }, // verde bosque
  compro_externo:     { label: 'Compró/Apartó c/ext.',  color: '#8b5e2a', bg: '#fef6ec' }, // bronce
  descartado:         { label: 'Descartado',            color: '#9b2020', bg: '#fff1f2' }, // rojo opaco
}

export const ORDEN_ESTADOS = [
  'primer_contacto', 'por_perfilar', 'no_contesta', 'cita_por_agendar',
  'cita_a_futuro', 'cita_agendada', 'seguimiento_cierre', 'compro', 'compro_externo', 'descartado',
]

const FUENTE_LEAD_LABELS: Record<string, string> = {
  sheets:           'Sheets',
  meta_ads:         'Meta Ads',
  google_ads:       'Google Ads',
  referido:         'Referido',
  web:              'Web',
  llamada_en_frio:  'Llamada fría',
  whatsapp:         'WhatsApp',
  portal:           'Portal',
  tiktok:           'TikTok',
  otro:             'Otro',
}

const RAZONES_DESCARTE = [
  { value: 'precio',          label: 'Precio fuera de rango' },
  { value: 'sin_respuesta',   label: 'Sin respuesta' },
  { value: 'competencia',     label: 'Eligió otra agencia' },
  { value: 'cambio_opinion',  label: 'Cambió de opinión' },
  { value: 'sin_interes',     label: 'Sin interés real' },
  { value: 'timing',          label: 'No es el momento' },
  { value: 'otro',            label: 'Otro' },
]

// Etapas de venta seleccionables al crear/editar un cliente. Es la lista
// canónica usada en el formulario y en la pantalla de detalle: incluye TODAS
// las etapas (primer contacto, cita a futuro, etc.) para que coincidan.
export const ETAPAS_CLIENTE = ORDEN_ESTADOS

function estadoInfo(e: string) {
  return ESTADOS[e] ?? { label: e, color: '#64748b', bg: '#f1f5f9' }
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'Ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Ayer'
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function proximoRec(recs: Cliente['recordatorios']) {
  return recs
    .filter(r => !r.completado)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())[0] ?? null
}

// Cuántos días lleva vencido un cliente (días desde su proximo_contacto o
// recordatorio más antiguo sin completar que ya pasó).
function diasVencido(c: Cliente): number {
  const now = Date.now()
  let vencioEn = now
  if (c.proximo_contacto) {
    const t = new Date(c.proximo_contacto).getTime()
    if (t < now) vencioEn = Math.min(vencioEn, t)
  }
  const recMin = (c.recordatorios ?? [])
    .filter(r => !r.completado && new Date(r.fecha_hora).getTime() < now)
    .reduce((min, r) => Math.min(min, new Date(r.fecha_hora).getTime()), Infinity)
  if (Number.isFinite(recMin)) vencioEn = Math.min(vencioEn, recMin)
  return Math.max(0, Math.floor((now - vencioEn) / 86400000))
}

// Normaliza un teléfono para comparar duplicados (quita no-dígitos y el prefijo MX).
function normalizarTel(tel: string): string {
  const d = (tel ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('52')) return d.slice(2)
  if (d.length === 13 && d.startsWith('521')) return d.slice(3)
  return d
}

// Un cliente "necesita seguimiento" (vencido) cuando tiene un contacto pendiente
// que ya pasó de su fecha y sigue sin resolverse. Se considera vencido si:
//  · su próximo contacto (proximo_contacto) ya pasó, o
//  · tiene un recordatorio abierto cuya fecha ya pasó.
// Se considera resuelto (NO vencido) cuando:
//  · el cliente está descartado o comprado (ya no hay que seguirlo), o
//  · fue reagendado a futuro (proximo_contacto en el futuro = el asesor ya
//    definió cuándo lo vuelve a contactar).
// Antes solo contaba el recordatorio abierto, así que un cliente con el próximo
// contacto vencido (⚠ en la columna de fecha) no aparecía al filtrar VENCIDOS.
function necesitaSeguimiento(c: Cliente): boolean {
  if (c.estado === 'descartado' || c.estado === 'compro' || c.estado === 'compro_externo') return false
  const now = Date.now()
  if (c.proximo_contacto) {
    const t = new Date(c.proximo_contacto).getTime()
    if (t > now) return false
    if (t < now) return true
  }
  return (c.recordatorios ?? []).some(r => !r.completado && new Date(r.fecha_hora).getTime() < now)
}

// Parsea un presupuesto en texto libre a un número aproximado (para filtrar por rango).
function parsePresu(txt: string | null | undefined): number | null {
  if (!txt) return null
  const s = String(txt).toLowerCase().replace(/[, $]/g, '')
  const m = s.match(/(\d+(\.\d+)?)\s*(m|k)?/)
  if (!m) return null
  let n = parseFloat(m[1])
  if (isNaN(n)) return null
  const suf = m[3]
  if (suf === 'm') n *= 1_000_000
  else if (suf === 'k') n *= 1_000
  else if (n < 100) n *= 1_000_000   // "1.6", "2.5" → millones (heurística)
  return n
}
// Formato compacto de dinero para el total del pipeline: $28.5M, $850k, $500.
function formatDineroCompacto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}
const FUENTE_LABEL_CRM: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko', campana_fb: 'Campaña FB', grupo_fb: 'Grupo FB',
  ficha_compartida: 'Ficha compartida', coleccion_compartida: 'Colección', sheets: 'Sheets',
  otro: 'Otro', referido: 'Referido', admin: 'Admin', constructora: 'Constructora',
}
const fuenteLabel = (f: string) => FUENTE_LABEL_CRM[f] ?? f

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

// Un campo del selector de fecha (Día/Mes/Año/Hora/Min): flechas + valor, orden fijo.
function FechaSpin({ label, value, onUp, onDown, c }: {
  label: string; value: string | number; onUp: () => void; onDown: () => void; c: ColoresCard
}) {
  return (
    <View style={{ alignItems: 'center', minWidth: 60 }}>
      <Text style={{ fontSize: 10, color: c.textMute, marginBottom: 4, fontWeight: '600' }}>{label}</Text>
      <TouchableOpacity onPress={onUp} style={{ padding: 8 }}><Text style={{ fontSize: 16, color: '#1a6470' }}>▲</Text></TouchableOpacity>
      <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, marginVertical: 2 }}>{value}</Text>
      <TouchableOpacity onPress={onDown} style={{ padding: 8 }}><Text style={{ fontSize: 16, color: '#1a6470' }}>▼</Text></TouchableOpacity>
    </View>
  )
}

export function abrirWhatsApp(telefono: string, nombre: string) {
  let phone = telefono.replace(/\D/g, '')
  // Normalizar número mexicano para WhatsApp (formato nuevo: 52 + 10 dígitos = 12 total)
  if (phone.startsWith('5252')) phone = phone.slice(2)           // doble código de país
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3) // formato viejo con 1
  const num = phone.length === 10 ? `52${phone}` : phone
  const msg = encodeURIComponent(`Hola ${nombre}, te contacto de Valera Real Estate. ¿Cómo estás?`)
  const url = `https://wa.me/${num}?text=${msg}`
  if (Platform.OS === 'web') window.open(url, '_blank')
  else Linking.openURL(url)
}

function llamar(tel: string) { Linking.openURL(`tel:${tel}`) }

// Semáforo de urgencia para leads que llegan de formulario o de recompensas
// (ruleta/tienda/cofre): un punto de color junto al nombre para atenderlos
// rápido. Verde = atendido o recién llegado; amarillo = +20 min; rojo = +1 h.
// "Atendido" = ya tiene próximo contacto agendado o cambió de estado inicial.
const FUENTES_SEMAFORO = new Set([
  'ficha_compartida', 'coleccion_compartida',
  'tienda_lead_premium', 'cofre_lead_premium', 'tienda_lead_meta', 'cofre_lead_meta',
])
function semaforoCrm(item: { fuente_lead: string; estado: string; proximo_contacto: string | null; created_at: string }): string | null {
  if (!FUENTES_SEMAFORO.has(item.fuente_lead)) return null
  const atendido = !!item.proximo_contacto || (!!item.estado && item.estado !== 'por_perfilar' && item.estado !== 'nuevo')
  if (atendido) return '#16a34a'
  const mins = (Date.now() - new Date(item.created_at).getTime()) / 60000
  if (mins < 20) return '#22c55e'
  if (mins < 60) return '#f59e0b'
  return '#ef4444'
}

type SortBy = 'reciente' | 'nombre' | 'contacto'
const SORT_LABELS: Record<SortBy, string> = {
  reciente: 'Más reciente',
  nombre:   'Nombre A–Z',
  contacto: 'Próximo contacto',
}

type ColoresCard = ReturnType<typeof import('../../lib/ThemeContext').useColors>
const ClienteCard = memo(function ClienteCard({ item, c, darkMode, userRole, onChatbot }: {
  item: Cliente
  c: ColoresCard
  darkMode: boolean
  userRole: string | null
  onChatbot: (item: Cliente) => void
}) {
  const info    = estadoInfo(item.estado)
  const rec     = proximoRec(item.recordatorios ?? [])
  const recVenc = rec && new Date(rec.fecha_hora) < new Date()
  const recHoy  = rec && !recVenc && new Date(rec.fecha_hora).toDateString() === new Date().toDateString()
  const inits   = iniciales(item.nombre)
  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}`)}
      activeOpacity={0.8}
    >
      <View style={[s.cardBar, { backgroundColor: info.color }]} />
      <View style={s.cardBody}>
        <View style={s.cardHead}>
          <View style={[s.avatar, { backgroundColor: info.color + '22' }]}>
            <Text style={[s.avatarTxt, { color: info.color }]}>{inits}</Text>
          </View>
          <View style={s.cardHeadInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {semaforoCrm(item) ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: semaforoCrm(item)! }} /> : null}
              <Text style={[s.cardNombre, { color: c.text, flex: 1 }]} numberOfLines={1}>{item.nombre}</Text>
            </View>
            <View style={s.cardSubRow}>
              {item.nivel_interes ? (
                <View style={[s.fuenteTag, {
                  backgroundColor: item.nivel_interes === 'alto'
                    ? (darkMode ? '#2d1208' : '#fdeee6')
                    : item.nivel_interes === 'medio'
                    ? (darkMode ? '#27200a' : '#fdf6e3')
                    : (darkMode ? '#0d1e18' : '#eaf4ef'),
                }]}>
                  <Text style={[s.fuenteTagTxt, {
                    color: item.nivel_interes === 'alto'
                      ? (darkMode ? '#f4956a' : '#bf4e1a')
                      : item.nivel_interes === 'medio'
                      ? (darkMode ? '#e8c84a' : '#9a7018')
                      : (darkMode ? '#6dbf9a' : '#2d7a56'),
                  }]}>{NIVEL_INTERES_LABEL[item.nivel_interes]}</Text>
                </View>
              ) : null}
              {item.fuente_lead ? (
                <View style={[s.fuenteTag, { backgroundColor: darkMode ? c.bg : '#f1f5f9' }]}>
                  <Text style={[s.fuenteTagTxt, { color: c.textSub }]}>
                    {FUENTE_LEAD_LABELS[item.fuente_lead] ?? item.fuente_lead}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={[s.estadoBadge, { backgroundColor: darkMode ? info.color + '40' : info.bg }]}>
            <View style={[s.estadoDot, { backgroundColor: info.color }]} />
            <Text style={[s.estadoTxt, { color: info.color }]} numberOfLines={1}>{info.label}</Text>
          </View>
        </View>
        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <Ionicons name="call-outline" size={11} color={c.textMute} />
            <Text style={[s.metaTxt, { color: c.textSub }]}>{item.telefono}</Text>
          </View>
          {item.tipo_operacion && (
            <View style={s.metaItem}>
              <Ionicons name="home-outline" size={11} color={c.textMute} />
              <Text style={[s.metaTxt, { color: c.textSub, textTransform: 'capitalize' }]}>{item.tipo_operacion}</Text>
            </View>
          )}
          <View style={s.metaTime}>
            <Ionicons name="time-outline" size={11} color={c.textMute} />
            <Text style={[s.metaTxt, { color: c.textMute }]}>{tiempoRelativo(item.created_at)}</Text>
          </View>
        </View>
        {rec && (
          <View style={[s.recRow,
            recVenc ? { backgroundColor: darkMode ? '#2a0e0e' : '#fef2f2' }
            : recHoy ? { backgroundColor: darkMode ? '#27190a' : '#fffbeb' }
            : { backgroundColor: darkMode ? '#091e20' : '#f0fdfa' },
          ]}>
            <Ionicons
              name={recVenc ? 'warning-outline' : recHoy ? 'alarm-outline' : 'calendar-outline'}
              size={12}
              color={recVenc ? '#ef4444' : recHoy ? '#d97706' : '#1a6470'}
            />
            <Text style={[s.recTxt, { color: recVenc ? '#ef4444' : recHoy ? '#92400e' : '#1a6470' }]} numberOfLines={1}>
              {recVenc ? '⚠ Vencido · ' : recHoy ? 'Hoy · ' : ''}
              {new Date(rec.fecha_hora).toLocaleDateString('es-MX', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })} — {rec.titulo}
            </Text>
          </View>
        )}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionWa, darkMode && { backgroundColor: '#0b2016', borderColor: '#1a6b38' }]}
            onPress={() => {
              abrirWhatsApp(item.telefono, item.nombre)
              getUsuarioActual().then(({ data: { user } }) => { if (user) registrarContacto(user.id, item.id, 'whatsapp').catch(() => {}) })
            }}
          >
            <Ionicons name="logo-whatsapp" size={14} color={darkMode ? '#22c55e' : '#16a34a'} />
            <Text style={[s.actionWaTxt, darkMode && { color: '#22c55e' }]}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionCall, darkMode && { backgroundColor: '#091929', borderColor: '#0e5282' }]}
            onPress={() => {
              llamar(item.telefono)
              getUsuarioActual().then(({ data: { user } }) => { if (user) registrarContacto(user.id, item.id, 'llamada').catch(() => {}) })
            }}
          >
            <Ionicons name="call-outline" size={14} color={darkMode ? '#38bdf8' : '#0369a1'} />
            <Text style={[s.actionCallTxt, darkMode && { color: '#38bdf8' }]}>Llamar</Text>
          </TouchableOpacity>
          {/* Editar directo, sin pasar por el detalle: tocar la tarjeta sigue
              abriendo los datos del cliente, y este botón va derecho al form. */}
          <TouchableOpacity
            style={[s.actionEdit, darkMode && { backgroundColor: '#2a2410', borderColor: '#8a6d1f' }]}
            onPress={() => router.push(`/(prospectador)/cliente-form?id=${item.id}`)}
            accessibilityLabel={`Editar ${item.nombre}`}
          >
            <Ionicons name="create-outline" size={14} color={darkMode ? '#fbbf24' : '#a16207'} />
            <Text style={[s.actionEditTxt, darkMode && { color: '#fbbf24' }]}>Editar</Text>
          </TouchableOpacity>
          {puedeEnviarClienteAChatbot(userRole) && (
            <TouchableOpacity
              style={[s.actionChatbot, darkMode && { backgroundColor: '#241a33', borderColor: '#6a3fa0' }]}
              onPress={() => onChatbot(item)}
            >
              <Ionicons name="chatbubbles-outline" size={14} color={darkMode ? '#c084fc' : '#7c3aed'} />
              <Text style={[s.actionChatbotTxt, darkMode && { color: '#c084fc' }]}>Chatbot</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
})

export default function CRM() {
  // ?mios=1 → "Mi CRM": solo los clientes de los que el usuario es responsable.
  // (Para supervisores, que por RLS ven los de todo el equipo.)
  const { mios } = useLocalSearchParams<{ mios?: string }>()
  const soloMios = mios === '1'
  const c = useColors()
  const { darkMode, primaryColor } = useTheme()
  const queryClient = useQueryClient()
  const { isOnline, refreshPending, syncNow, pendingCount, isSyncing } = useOfflineSync()
  const [userRole, setUserRole]           = useState<string | null>(null)
  const [busqueda, setBusqueda]           = useState('')
  const [estadoFiltro, setEstadoFiltro]   = useState<string | null>(null)
  const [filtroVencidos, setFiltroVencidos] = useState(false)
  const [bannerCerrado, setBannerCerrado]       = useState(false)
  const [bannerDupCerrado, setBannerDupCerrado] = useState(false)
  const [showDuplicadosModal, setShowDuplicadosModal] = useState(false)
  const [opFiltro, setOpFiltro]           = useState<'venta' | 'renta' | null>(null)
  const [sortBy, setSortBy]               = useState<SortBy>('reciente')
  const [showSort, setShowSort]           = useState(false)
  const [vistaExcel, setVistaExcel]       = useState(false)
  // Tick que avanza cada minuto para que el memo de "vencidos" recalcule
  // aunque los datos del servidor no hayan cambiado (un recordatorio que
  // vence mientras la app está abierta no implica un nuevo fetch).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Recordar la vista elegida (tabla/lista) hasta que el usuario la cambie
  useEffect(() => {
    AsyncStorage.getItem(VISTA_CRM_KEY).then(v => { if (v === 'tabla') setVistaExcel(true) }).catch(() => {})
    supabase.auth.getSession().then(({ data: s }) => {
      const uid = s.session?.user?.id
      if (uid) {
        supabase.from('profiles').select('role').eq('id', uid).maybeSingle().then(({ data: p }) => {
          if (p?.role) setUserRole(p.role)
        })
      }
    })
  }, [])
  function toggleVista() {
    setVistaExcel(prev => {
      const next = !prev
      AsyncStorage.setItem(VISTA_CRM_KEY, next ? 'tabla' : 'lista').catch(() => {})
      return next
    })
  }

  // Botón "Enviar al chatbot" (solo Plus/Asesor/Supervisor). Solo clientes de
  // venta con presupuesto > $1.8M, tope de 10 por mes — validado en el form y
  // de nuevo en el backend (agregar-cliente-chatbot).
  const [clienteChatbot, setClienteChatbot] = useState<Cliente | null>(null)
  const [chatbotTelefono, setChatbotTelefono] = useState('')
  const [chatbotPresupuesto, setChatbotPresupuesto] = useState('')
  const [chatbotError, setChatbotError] = useState<string | null>(null)
  const [chatbotEnviando, setChatbotEnviando] = useState(false)
  function abrirModalChatbot(item: Cliente) {
    setChatbotTelefono(item.telefono ?? '')
    setChatbotPresupuesto((item.presupuesto ?? '').replace(/\D/g, ''))
    setChatbotError(null)
    setClienteChatbot(item)
  }
  function cerrarModalChatbot() {
    if (chatbotEnviando) return
    setClienteChatbot(null)
  }
  async function enviarClienteAChatbot() {
    if (!clienteChatbot) return
    setChatbotError(null)
    const presupuestoNum = Number(chatbotPresupuesto)
    if (!Number.isFinite(presupuestoNum) || presupuestoNum <= 1_800_000) {
      setChatbotError('El presupuesto debe ser mayor a $1,800,000.')
      return
    }
    setChatbotEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('agregar-cliente-chatbot', {
        body: {
          clienteId: clienteChatbot.id,
          nombre: clienteChatbot.nombre,
          telefono: chatbotTelefono,
          tipoOperacion: clienteChatbot.tipo_operacion,
          presupuesto: presupuestoNum,
        },
      })
      if (error || data?.error) {
        let msg = data?.error || 'No se pudo enviar al chatbot.'
        if (!data?.error && error) {
          try {
            // FunctionsHttpError esconde el body real en error.context
            const body = await (error as any).context?.json?.()
            msg = body?.error || error.message || msg
          } catch { msg = error.message || msg }
        }
        setChatbotError(msg)
        return
      }
      setClienteChatbot(null)
      const msg = `${clienteChatbot.nombre} fue enviado al chatbot.`
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Listo', msg)
    } catch (e) {
      setChatbotError(e instanceof Error ? e.message : 'No se pudo enviar al chatbot.')
    } finally {
      setChatbotEnviando(false)
    }
  }
  const [interesFilter, setInteresFilter] = useState<string | null>(null)
  const [zonaFilter, setZonaFilter]       = useState<string | null>(null)
  const [fuenteFilter, setFuenteFilter]   = useState<string | null>(null)
  const [creditoFilter, setCreditoFilter] = useState<string | null>(null)
  const [presMin, setPresMin]             = useState('')
  const [presMax, setPresMax]             = useState('')
  const [excelSort, setExcelSort]         = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [excelFilterModal, setExcelFilterModal] = useState<{
    col: string; label: string
    tipo?: 'opciones' | 'rango'
    options?: { value: string | null; label: string; color?: string }[]
  } | null>(null)
  // Edición inline en la tabla Excel
  const [editCell, setEditCell] = useState<{ id: string; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  // Confirmación visible tras guardar una celda: 'ok' (guardado) o 'pendiente'
  // (no llegó al servidor, quedó en cola y se reintenta solo).
  const [savedToast, setSavedToast] = useState<'ok' | 'pendiente' | null>(null)
  const [cellPicker, setCellPicker] = useState<{
    id: string; col: string; label: string
    options: { value: string | null; label: string; color?: string }[]
  } | null>(null)
  // Selector de Zonas de interés (multi-selección + "Otra"). `draft` es el valor
  // en edición hasta que se guarda.
  const [zonaPicker, setZonaPicker] = useState<{ id: string; draft: string } | null>(null)
  const [descarteModal, setDescarteModal] = useState<{ id: string } | null>(null)
  // Selector de "Próximo contacto": Día/Mes/Año fijo (no usa <input type="datetime-local">
  // porque su formato de despliegue depende del idioma del navegador/SO — en algunos
  // quedaba en mes/día/año en vez de día/mes/año). Mismo patrón que detalle-cliente.tsx.
  const [fechaModal, setFechaModal] = useState<{ id: string } | null>(null)
  const [fechaTemp, setFechaTemp] = useState<Date>(new Date())
  const { width: screenWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'

  const { data: clientes = [], isLoading, refetch } = useQuery<Cliente[]>({
    // Sufijo de versión: invalida el caché persistido en disco. Se subió a 'v3'
    // (30/jun/2026) porque algunos usuarios quedaron con una lista VACÍA cacheada
    // que no se reemplazaba, viendo su CRM en blanco pese a tener sus clientes
    // intactos en el servidor. Cambiar la clave fuerza una recarga fresca.
    queryKey: ['clientes', soloMios ? 'mios' : 'all', 'v5'],
    queryFn: async () => {
      let q = supabase
        .from('clientes')
        .select('id, nombre, telefono, email, empresa, fuente_lead, estado, tipo_operacion, proximo_contacto, created_at, updated_at, nivel_interes, notas, zona_busqueda, presupuesto, tipo_credito, es_lead_campania, enviado_crm, recordatorios(id, titulo, fecha_hora, completado)')
        .is('eliminado_at', null)
        .order('updated_at', { ascending: false })
      if (soloMios) {
        const { data: { user } } = await getUsuarioActual()
        if (user) q = q.eq('responsable_id', user.id)
      }
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 5,
  })

  // Jalar para actualizar
  const [refreshing, setRefreshing] = useState(false)
  const onPull = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } catch {} finally { setRefreshing(false) }
  }, [refetch])

  // Refrescar al enfocar SOLO si el cache ya está viejo (respeta staleTime).
  // Antes hacía refetch() en cada visita: como expo-router mantiene el tab
  // montado, recargaba el CRM del servidor cada vez que volvías, sintiéndose
  // lento sin necesidad. Ahora la lista cacheada aparece al instante y solo se
  // vuelve a pedir si pasaron >5 min.
  useFocusEffect(useCallback(() => {
    const st = queryClient.getQueryState(['clientes', soloMios ? 'mios' : 'all', 'v5'])
    // Refetch si pasaron >5 min O si detalle-cliente invalidó el caché
    // (ej. el usuario actualizó proximo_contacto y el banner debe quitarlo).
    const viejo = !st?.dataUpdatedAt || (Date.now() - st.dataUpdatedAt) > 1000 * 60 * 5
    if (viejo || st?.isInvalidated) refetch()
  }, [refetch, soloMios, queryClient]))

  useEffect(() => {
    if (!clientes.length) return
    for (const c of clientes) {
      queryClient.setQueryData(
        ['detalle-cliente', c.id, 'v2'],
        (old: unknown) => old ?? { cliente: c, interacciones: [], recordatorios: c.recordatorios ?? [] }
      )
    }
  }, [clientes])

  // ── Leads de campaña ──────────────────────────────────────────
  // Los clientes de origen "Campaña FB" viven en su PROPIA tabla-apartado y se
  // sacan del CRM normal. El asesor puede "mandar" un lead a su CRM normal: al
  // hacerlo se marca enviado_crm=true y entonces SÍ aparece en el CRM normal
  // (además de quedar en el Historial del apartado de campaña).
  const leadsCampania = useMemo(
    () => clientes.filter(c => c.es_lead_campania && !c.enviado_crm),
    [clientes]
  )
  const clientesCrm = useMemo(
    () => clientes.filter(c => !c.es_lead_campania || c.enviado_crm),
    [clientes]
  )

  // ── KPIs ──────────────────────────────────────────────────────
  // Base filtrada por operación para que KPIs y chips sean consistentes con la lista
  const clientesBase = useMemo(
    () => opFiltro ? clientesCrm.filter(c => c.tipo_operacion === opFiltro) : clientesCrm,
    [clientesCrm, opFiltro]
  )

  const { total, activos, citas, vencidos, cerrados, conteos, presupuestoActivo, presupuestoConteo } = useMemo(() => {
    const activosArr = clientesBase.filter(c => c.estado !== 'descartado' && c.estado !== 'compro' && c.estado !== 'compro_externo')
    // Suma aproximada del presupuesto (texto libre) de los clientes activos.
    let presupuestoActivo = 0, presupuestoConteo = 0
    for (const c of activosArr) {
      const v = parsePresu(c.presupuesto)
      if (v != null && v > 0) { presupuestoActivo += v; presupuestoConteo++ }
    }
    return {
      total:    clientesBase.length,
      activos:  activosArr.length,
      citas:    clientesBase.filter(c => c.estado === 'cita_agendada').length,
      vencidos: clientesBase.filter(necesitaSeguimiento).length,
      cerrados: clientesBase.filter(c => c.estado === 'compro' || c.estado === 'compro_externo').length,
      conteos:  ORDEN_ESTADOS.reduce<Record<string, number>>((acc, e) => {
        acc[e] = clientesBase.filter(c => c.estado === e).length
        return acc
      }, {}),
      presupuestoActivo, presupuestoConteo,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesBase, tick])

  // Clientes vencidos ordenados por urgencia (más días sin contacto primero).
  // Alimenta el banner de Oportunidades en riesgo.
  const clientesEnRiesgo = useMemo(
    () => clientesCrm.filter(necesitaSeguimiento).sort((a, b) => diasVencido(b) - diasVencido(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientesCrm, tick]
  )

  // Grupos de clientes con el mismo teléfono (duplicados). Cada grupo ≥ 2 clientes.
  // El primero de cada grupo es el más reciente (sugerido para conservar).
  const gruposDuplicados = useMemo(() => {
    const mapa = new Map<string, Cliente[]>()
    for (const cl of clientesCrm) {
      const tel = normalizarTel(cl.telefono)
      if (!tel || tel.length < 7) continue
      if (!mapa.has(tel)) mapa.set(tel, [])
      mapa.get(tel)!.push(cl)
    }
    const grupos: Cliente[][] = []
    for (const [, arr] of mapa) {
      if (arr.length > 1) {
        grupos.push([...arr].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      }
    }
    return grupos
  }, [clientesCrm])

  // Reabre el banner si aparece un cliente nuevo en riesgo después de cerrarlo
  const prevRiesgoLen = React.useRef(0)
  React.useEffect(() => {
    if (clientesEnRiesgo.length > prevRiesgoLen.current) setBannerCerrado(false)
    prevRiesgoLen.current = clientesEnRiesgo.length
  }, [clientesEnRiesgo.length])

  // ── Filtros ───────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    let result = clientesCrm
    if (busqueda.trim()) {
      const q = normalizar(busqueda)
      result = result.filter(c =>
        normalizar(c.nombre).includes(q) || c.telefono.includes(q) ||
        normalizar(c.email).includes(q) ||
        normalizar(c.empresa).includes(q)
      )
    }
    if (estadoFiltro === '__cerrados__') {
      result = result.filter(c => c.estado === 'compro' || c.estado === 'compro_externo')
    } else if (estadoFiltro) {
      result = result.filter(c => c.estado === estadoFiltro)
    }
    if (filtroVencidos) {
      result = result.filter(necesitaSeguimiento)
    }
    if (opFiltro)      result = result.filter(c => c.tipo_operacion === opFiltro)
    if (interesFilter) result = result.filter(c => c.nivel_interes === interesFilter)
    if (zonaFilter)    result = result.filter(c => {
      const { zonas, otra } = parseZonasGuardadas(c.zona_busqueda)
      return zonas.includes(zonaFilter) || (otra !== '' && zonaFilter === '__otra__')
    })
    if (fuenteFilter)  result = result.filter(c => (c.fuente_lead ?? 'otro') === fuenteFilter)
    if (creditoFilter) result = result.filter(c => c.tipo_credito === creditoFilter)
    if (presMin || presMax) {
      const min = parsePresu(presMin) ?? 0
      const max = parsePresu(presMax) ?? Infinity
      result = result.filter(c => { const v = parsePresu(c.presupuesto); return v != null && v >= min && v <= max })
    }
    if (sortBy === 'nombre') {
      result = [...result].sort((a, b) => a.nombre.localeCompare(b.nombre))
    } else if (sortBy === 'contacto') {
      result = [...result].sort((a, b) => {
        const aT = a.proximo_contacto ? new Date(a.proximo_contacto).getTime() : Infinity
        const bT = b.proximo_contacto ? new Date(b.proximo_contacto).getTime() : Infinity
        return aT - bT
      })
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesCrm, busqueda, estadoFiltro, filtroVencidos, opFiltro, interesFilter, zonaFilter, fuenteFilter, creditoFilter, presMin, presMax, sortBy, tick])

  // ── Excel table helpers ───────────────────────────────────────
  const filtradosExcel = useMemo(() => {
    if (!excelSort) return filtrados
    return [...filtrados].sort((a, b) => {
      let cmp = 0
      if (excelSort.col === 'nombre') cmp = a.nombre.localeCompare(b.nombre)
      else if (excelSort.col === 'estado') cmp = a.estado.localeCompare(b.estado)
      else if (excelSort.col === 'fecha') {
        const aT = a.proximo_contacto ? new Date(a.proximo_contacto).getTime() : Infinity
        const bT = b.proximo_contacto ? new Date(b.proximo_contacto).getTime() : Infinity
        cmp = aT === bT ? 0 : aT < bT ? -1 : 1
      }
      return excelSort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtrados, excelSort])

  function handleColSort(colId: string) {
    setExcelSort(prev => {
      if (prev?.col === colId) {
        if (prev.dir === 'asc') return { col: colId, dir: 'desc' as const }
        return null
      }
      return { col: colId, dir: 'asc' as const }
    })
  }

  function isColFiltered(colId: string): boolean {
    if (colId === 'estado') return estadoFiltro !== null
    if (colId === 'operacion') return opFiltro !== null
    if (colId === 'interes') return interesFilter !== null
    if (colId === 'zona') return zonaFilter !== null
    if (colId === 'fuente') return fuenteFilter !== null
    if (colId === 'tipo_credito') return creditoFilter !== null
    if (colId === 'presupuesto') return !!presMin || !!presMax
    return false
  }

  function getColFilterValue(colId: string): string | null {
    if (colId === 'estado') return estadoFiltro
    if (colId === 'operacion') return opFiltro
    if (colId === 'fuente') return fuenteFilter
    if (colId === 'tipo_credito') return creditoFilter
    if (colId === 'interes') return interesFilter
    if (colId === 'zona') return zonaFilter
    return null
  }

  function applyColFilter(col: string, value: string | null) {
    if (col === 'estado') setEstadoFiltro(value)
    else if (col === 'operacion') setOpFiltro(value as any)
    else if (col === 'interes') setInteresFilter(value)
    else if (col === 'zona') setZonaFilter(value)
    else if (col === 'fuente') setFuenteFilter(value)
    else if (col === 'tipo_credito') setCreditoFilter(value)
    setExcelFilterModal(null)
  }

  function handleOpenColFilter(colId: string) {
    if (colId === 'estado') {
      setExcelFilterModal({
        col: 'estado', label: 'Filtrar por Estado',
        options: [
          { value: null, label: 'Todos los estados' },
          ...ORDEN_ESTADOS.map(e => ({ value: e, label: estadoInfo(e).label, color: estadoInfo(e).color })),
        ],
      })
    } else if (colId === 'operacion') {
      setExcelFilterModal({
        col: 'operacion', label: 'Filtrar por Operación',
        options: [
          { value: null, label: 'Todos' },
          { value: 'venta', label: '🏠 Venta' },
          { value: 'renta', label: '🔑 Renta' },
        ],
      })
    } else if (colId === 'interes') {
      setExcelFilterModal({
        col: 'interes', label: 'Filtrar por Interés',
        options: [
          { value: null, label: 'Todos' },
          { value: 'alto', label: '🔥 Alto' },
          { value: 'medio', label: '🌡️ Medio' },
          { value: 'bajo', label: '❄️ Bajo' },
        ],
      })
    } else if (colId === 'zona') {
      // Zonas canónicas presentes en la cartera (según el catálogo), + "Otra".
      const presentes = new Set<string>()
      let hayOtra = false
      for (const cl of clientes) {
        const { zonas, otra } = parseZonasGuardadas(cl.zona_busqueda)
        zonas.forEach(z => presentes.add(z))
        if (otra) hayOtra = true
      }
      const zonasUnicas = [...presentes].sort()
      setExcelFilterModal({
        col: 'zona', label: 'Filtrar por Zona',
        options: [
          { value: null, label: 'Todas las zonas' },
          ...zonasUnicas.map(z => ({ value: z, label: z })),
          ...(hayOtra ? [{ value: '__otra__', label: 'Otra (texto libre)' }] : []),
        ],
      })
    } else if (colId === 'tipo_credito') {
      const set = new Set<string>()
      for (const cl of clientes) if (cl.tipo_credito) set.add(cl.tipo_credito)
      setExcelFilterModal({
        col: 'tipo_credito', label: 'Filtrar por Método de pago',
        options: [{ value: null, label: 'Todos' }, ...[...set].sort().map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))],
      })
    } else if (colId === 'presupuesto') {
      setExcelFilterModal({ col: 'presupuesto', label: 'Filtrar por Presupuesto', tipo: 'rango' })
    }
  }

  // ── Edición inline en la tabla Excel ──────────────────────────
  // Mapea el id de columna al campo real de la tabla `clientes`
  const COL_FIELD: Record<string, string> = {
    nombre: 'nombre', telefono: 'telefono', estado: 'estado',
    operacion: 'tipo_operacion', interes: 'nivel_interes', fecha: 'proximo_contacto',
    notas: 'notas', zona: 'zona_busqueda', presupuesto: 'presupuesto',
    tipo_credito: 'tipo_credito',
  }

  function mostrarGuardado(t: 'ok' | 'pendiente') {
    setSavedToast(t)
    setTimeout(() => setSavedToast(null), 2500)
  }

  async function guardarCelda(id: string, col: string, value: string | null) {
    const campo = COL_FIELD[col]
    if (!campo) return
    const clientePrev = clientes.find(cl => cl.id === id)
    const estadoPrevio = clientePrev?.estado
    const proximoPrevio = clientePrev?.proximo_contacto ?? null
    setSavingCell(true)
    // Actualización optimista inmediata en la cache activa (v3).
    // Se incluye updated_at para que necesitaSeguimiento() lo saque del banner.
    const ahoraInline = new Date().toISOString()
    queryClient.setQueryData<Cliente[]>(['clientes', soloMios ? 'mios' : 'all', 'v5'], (old) =>
      (old ?? []).map(cl => cl.id === id ? { ...cl, [campo]: value, updated_at: ahoraInline } as Cliente : cl)
    )

    const encolar = async () => {
      await enqueueClienteUpdate(id, { [campo]: value })
      await refreshPending()
    }

    if (!isOnline) {
      await encolar()
      setSavingCell(false); setEditCell(null)
      mostrarGuardado('pendiente')
      return
    }

    // Escritura con timeout + 1 reintento. Sin timeout, en la app nativa el
    // lock de sesión puede colgar el update indefinidamente y el cambio se
    // perdía en silencio (se veía guardado por el optimista pero al recargar
    // revertía). Si aun así no llega, se ENCOLA para reintentarlo solo —
    // nunca se pierde.
    let ok = false
    let errServidor = ''
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const { error } = await conTimeout(
          supabase.from('clientes').update({ [campo]: value }).eq('id', id),
          12_000,
        )
        if (!error) { ok = true; break }
        errServidor = error.message  // error real del servidor: no reintentar
        break
      } catch { /* timeout / caída de red: reintentar una vez */ }
    }

    if (ok) {
      if (campo === 'estado' && value !== estadoPrevio) {
        const { data: { user } } = await getUsuarioActual()
        if (user) {
          if (value === 'cita_agendada') registrarAccion(user.id, 'agendar_cita').catch(() => {})
          else if (value === 'compro')   registrarAccion(user.id, 'cerrar_venta').catch(() => {})
        }
        if (value === 'compro' && userRole !== 'admin') {
          const msg = '✅ Solicitud de apartado enviada. El equipo lo revisará y confirmará pronto.'
          Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Solicitud enviada', msg)
        }
      }
      // Editar cualquier dato de un cliente ya existente ES dar seguimiento.
      // Ya no hace falta la regla del "próximo contacto vencido" para evitar
      // farmeo: el servidor solo lo cuenta una vez por cliente al día.
      {
        const { data: { user } } = await getUsuarioActual()
        if (user) registrarSeguimiento(user.id, id).catch(() => {})
      }
      mostrarGuardado('ok')
    } else if (errServidor) {
      // Error real del servidor (validación/permisos): avisar y revertir.
      const m = `No se pudo guardar: ${errServidor}`
      Platform.OS === 'web' ? window.alert(m) : Alert.alert('Error', m)
      await refetch()
    } else {
      // Timeout / red inestable: no perder el cambio → dejarlo en cola.
      await encolar()
      mostrarGuardado('pendiente')
    }
    setSavingCell(false); setEditCell(null)
  }

  function abrirEdicion(item: Cliente, col: string) {
    // Columnas de enumeración → selector; texto/fecha → input inline
    if (col === 'estado') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar estado',
        options: ORDEN_ESTADOS.map(e => ({ value: e, label: estadoInfo(e).label, color: estadoInfo(e).color })),
      })
    } else if (col === 'operacion') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar operación',
        options: [
          { value: null, label: '— Sin operación' },
          { value: 'venta', label: '🏠 Venta' },
          { value: 'renta', label: '🔑 Renta' },
        ],
      })
    } else if (col === 'tipo_credito') {
      setCellPicker({
        id: item.id, col, label: 'Método de pago',
        options: [
          { value: null,         label: '— Sin definir' },
          { value: 'infonavit',  label: '🏦 Infonavit' },
          { value: 'fovisste',   label: '🏛️ Fovisste' },
          { value: 'bancario',   label: '💳 Bancario' },
          { value: 'contado',    label: '💵 Contado' },
          { value: 'otro',       label: '🔖 Otro' },
        ],
      })
    } else if (col === 'interes') {
      setCellPicker({
        id: item.id, col, label: 'Cambiar nivel de interés',
        options: [
          { value: null, label: '— Sin definir' },
          { value: 'alto', label: '🔥 Alto' },
          { value: 'medio', label: '🌡️ Medio' },
          { value: 'bajo', label: '❄️ Bajo' },
        ],
      })
    } else if (col === 'zona') {
      // Zonas de interés → selector multi-selección + "Otra"
      setZonaPicker({ id: item.id, draft: item.zona_busqueda ?? '' })
    } else if (col === 'fecha') {
      let b: Date
      if (item.proximo_contacto) {
        b = new Date(item.proximo_contacto)
      } else {
        // Sin fecha previa: arrancar a las 7:00 am (mañana si las 7 de hoy ya pasaron).
        b = new Date(); b.setHours(7, 0, 0, 0)
        if (b.getTime() < Date.now()) b.setDate(b.getDate() + 1)
      }
      setFechaTemp(b)
      setFechaModal({ id: item.id })
    } else {
      // nombre, telefono, notas, presupuesto → edición de texto inline
      const inicial = col === 'nombre' ? item.nombre
        : col === 'telefono' ? item.telefono
        : col === 'notas' ? (item.notas ?? '')
        : col === 'presupuesto' ? (item.presupuesto ?? '') : ''
      setEditValue(inicial)
      setEditCell({ id: item.id, col })
    }
  }

  function guardarTexto() {
    if (!editCell) return
    guardarCelda(editCell.id, editCell.col, editValue.trim() || null)
  }

  // Spinner del selector de fecha (Día/Mes/Año/Hora/Min) — mismo criterio que
  // detalle-cliente.tsx: nunca antes de ahora.
  function ajustarFechaTemp(campo: 'date' | 'month' | 'year' | 'hour' | 'minute', delta: number) {
    setFechaTemp((prev) => {
      const d = new Date(prev)
      if (campo === 'date')   d.setDate(d.getDate() + delta)
      if (campo === 'month')  d.setMonth(d.getMonth() + delta)
      if (campo === 'year')   d.setFullYear(d.getFullYear() + delta)
      if (campo === 'hour')   d.setHours((d.getHours() + delta + 24) % 24)
      if (campo === 'minute') d.setMinutes((d.getMinutes() + delta + 60) % 60)
      const ahora = new Date()
      if (d.getTime() < ahora.getTime()) return ahora
      return d
    })
  }

  function guardarFechaModal() {
    if (!fechaModal) return
    guardarCelda(fechaModal.id, 'fecha', fechaTemp.toISOString())
    setFechaModal(null)
  }

  function quitarFechaModal() {
    if (!fechaModal) return
    guardarCelda(fechaModal.id, 'fecha', null)
    setFechaModal(null)
  }

  // ── Importar CSV ──────────────────────────────────────────────
  const [importModal, setImportModal]   = useState(false)
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([])
  const [csvData, setCsvData]           = useState<string[][]>([])
  const [exportando, setExportando]     = useState(false)

  async function exportarCSV() {
    if (exportando || !clientes.length) return
    setExportando(true)
    try {
      const cab = ['Nombre', 'Teléfono', 'Email', 'Empresa', 'Estado', 'Tipo Operación', 'Nivel Interés', 'Zona Búsqueda', 'Presupuesto', 'Próximo Contacto', 'Notas', 'Creado']
      const filas = clientes.map(cl => [
        cl.nombre, cl.telefono, cl.email ?? '', cl.empresa ?? '',
        ESTADOS[cl.estado]?.label ?? cl.estado, cl.tipo_operacion ?? '',
        cl.nivel_interes ?? '', cl.zona_busqueda ?? '', cl.presupuesto ?? '',
        cl.proximo_contacto ? new Date(cl.proximo_contacto).toLocaleDateString('es-MX') : '',
        (cl.notas ?? '').replace(/[\r\n]+/g, ' '),
        new Date(cl.created_at).toLocaleDateString('es-MX'),
      ])
      const csv = '﻿' + [cab, ...filas].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `mis-clientes-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        Alert.alert('Exportar CSV', 'La descarga de CSV solo está disponible en la versión web.')
      }
    } catch (e: any) {
      Alert.alert('Error', 'Error al exportar: ' + e.message)
    } finally {
      setExportando(false)
    }
  }

  async function abrirImport() {
    const procesar = (texto: string) => {
      const matriz = parsearCSV(texto)
      if (matriz.length < 2) return
      setCsvHeaders(matriz[0])
      setCsvData(matriz.slice(1))
      setImportModal(true)
    }
    if (Platform.OS === 'web') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv,text/csv'
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0]
        if (!file) return
        procesar(await file.text())
      }
      input.click()
    } else {
      try {
        const DocumentPicker = await import('expo-document-picker')
        const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', '*/*'] })
        if (result.canceled) return
        const { default: FileSystem } = await import('expo-file-system')
        procesar(await FileSystem.readAsStringAsync(result.assets[0].uri))
      } catch {
        // módulo nativo no disponible en este build
      }
    }
  }

  async function eliminarClienteTabla(item: Cliente) {
    const confirmar = Platform.OS === 'web'
      ? window.confirm(`¿Eliminar a "${item.nombre}"? Esta acción no se puede deshacer.`)
      : await new Promise<boolean>(resolve =>
          Alert.alert('Eliminar cliente', `¿Eliminar a "${item.nombre}"? Esta acción no se puede deshacer.`, [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
          ])
        )
    if (!confirmar) return
    // Actualización optimista
    queryClient.setQueryData<Cliente[]>(['clientes', soloMios ? 'mios' : 'all', 'v5'], (old) =>
      (old ?? []).filter(cl => cl.id !== item.id)
    )
    const { error } = await supabase
      .from('clientes')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      if (Platform.OS === 'web') window.alert('No se pudo eliminar el cliente.')
      else Alert.alert('Error', 'No se pudo eliminar el cliente.')
    }
  }

  async function handleImportConfirm(rows: ImportedRow[]) {
    const { data: { user } } = await getUsuarioActual()
    if (!user) throw new Error('Sesión expirada')
    const { error } = await supabase.from('clientes').insert(rows.map(r => ({
      nombre: r.nombre, telefono: r.telefono,
      email: r.email, empresa: r.empresa,
      tipo_operacion: r.tipo_operacion, estado: r.estado ?? 'por_perfilar',
      zona_busqueda: r.zona_busqueda, presupuesto: r.presupuesto,
      fuente_lead: r.fuente_lead ?? 'sheets', notas: r.notas,
      responsable_id: user.id,
    })))
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: ['clientes'] })
  }

  async function eliminarDuplicado(item: Cliente) {
    // Actualización optimista — el grupo desaparece de inmediato en el modal
    queryClient.setQueryData<Cliente[]>(['clientes', soloMios ? 'mios' : 'all', 'v5'], (old) =>
      (old ?? []).filter(cl => cl.id !== item.id)
    )
    const { error } = await supabase
      .from('clientes')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      if (Platform.OS === 'web') window.alert('No se pudo eliminar el cliente.')
      else Alert.alert('Error', 'No se pudo eliminar el cliente.')
    }
  }

  // ── Excel table columns ───────────────────────────────────────
  type TCol = { id: string; label: string; flex: number; mw: number; sortable?: boolean; filterable?: boolean }
  const TABLE_COLS: TCol[] = isWeb ? [
    { id: 'nombre',       label: 'Nombre',         flex: 2.2, mw: 0, sortable: true },
    { id: 'telefono',    label: 'Teléfono',       flex: 1.2, mw: 0 },
    { id: 'estado',      label: 'Estado',         flex: 1.3, mw: 0, sortable: true, filterable: true },
    { id: 'operacion',   label: 'Op.',            flex: 0.8, mw: 0, filterable: true },
    { id: 'tipo_credito', label: 'Método pago',   flex: 0.9, mw: 0, filterable: true },
    { id: 'zona',        label: 'Zona',           flex: 1.4, mw: 0, filterable: true },
    { id: 'presupuesto', label: 'Presupuesto',    flex: 1.2, mw: 0, filterable: true },
    { id: 'fecha',       label: 'Prox. seguim.',  flex: 1.5, mw: 0, sortable: true },
    { id: 'notas',       label: 'Notas',          flex: 2.5, mw: 0 },
    { id: 'acciones',    label: '',               flex: 0.3, mw: 0 },
  ] : [
    { id: 'nombre',       label: 'Nombre',        flex: 0, mw: 130 },
    { id: 'telefono',    label: 'Teléfono',       flex: 0, mw: 100 },
    { id: 'estado',      label: 'Estado',         flex: 0, mw: 105, sortable: true, filterable: true },
    { id: 'operacion',   label: 'Op.',            flex: 0, mw: 60,  filterable: true },
    { id: 'tipo_credito', label: 'Método pago',   flex: 0, mw: 80, filterable: true },
    { id: 'zona',        label: 'Zona',           flex: 0, mw: 110, filterable: true },
    { id: 'presupuesto', label: 'Presupuesto',    flex: 0, mw: 105, filterable: true },
    { id: 'fecha',       label: 'Prox. seguim.',  flex: 0, mw: 105, sortable: true },
    { id: 'notas',       label: 'Notas',          flex: 0, mw: 180 },
    { id: 'acciones',    label: '',               flex: 0, mw: 44 },
  ]

  function cStyle(col: TCol) {
    return isWeb ? { flex: col.flex } : { minWidth: col.mw }
  }

  // renderItem HOISTEADO. Antes estaba como `renderItem={useCallback(...)}`
  // DENTRO del <FlatList>, que solo se renderiza en la vista LISTA. Al alternar
  // a la vista TABLA ese hook dejaba de llamarse → "Rendered more hooks than
  // during the previous render" → la pantalla se quedaba en blanco/negro. Un
  // hook debe llamarse siempre, al nivel del componente, sin condicionales.
  const renderCliente = useCallback(({ item }: { item: Cliente }) => (
    <ClienteCard item={item} c={c} darkMode={darkMode} userRole={userRole} onChatbot={abrirModalChatbot} />
  ), [c, darkMode, userRole, abrirModalChatbot])

  return (
    <>
      <OfflineBanner />
      <View style={[s.container, { backgroundColor: c.bg }]}>
        {savedToast && (
          <View style={[s.savedToast, savedToast === 'ok' ? s.savedToastOk : s.savedToastPend]} pointerEvents="none">
            <Text style={s.savedToastTxt}>
              {savedToast === 'ok' ? '✓ Guardado' : '⏳ Guardado — se sincronizará al reconectar'}
            </Text>
          </View>
        )}

        {/* Botón flotante "Guardar": aparece SOLO cuando hay cambios sin
            sincronizar (guardados en cola porque falló el envío o no había
            red), y desaparece en cuanto todo queda guardado en el servidor. */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={s.saveFab}
            activeOpacity={0.85}
            disabled={isSyncing}
            onPress={async () => { await syncNow(); await refetch() }}
          >
            {isSyncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="save" size={18} color="#fff" />}
            <Text style={s.saveFabTxt}>
              {isSyncing ? 'Guardando…' : `Guardar${pendingCount > 1 ? ` (${pendingCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Presupuesto total activo (aprox.) ── */}
        {presupuestoConteo > 0 && (
          <View style={s.presuBanner}>
            <Text style={{ fontSize: 22 }}>💰</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.presuBannerLbl}>Presupuesto activo (aprox.)</Text>
              <Text style={s.presuBannerNum}>{formatDineroCompacto(presupuestoActivo)}</Text>
            </View>
            <Text style={s.presuBannerSub}>de {presupuestoConteo} {presupuestoConteo === 1 ? 'cliente' : 'clientes'}</Text>
          </View>
        )}

        {/* ── KPI strip (todos clickeables) ── */}
        <View style={[s.kpiStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === null && !filtroVencidos && s.kpiActivo]}
            onPress={() => { setEstadoFiltro(null); setOpFiltro(null); setFiltroVencidos(false) }}
          >
            <Text style={[s.kpiNum, { color: '#3b82f6' }]}>{activos}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>ACTIVOS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === 'cita_agendada' && s.kpiActivo]}
            onPress={() => { setFiltroVencidos(false); setEstadoFiltro(estadoFiltro === 'cita_agendada' ? null : 'cita_agendada') }}
          >
            <Text style={[s.kpiNum, { color: '#f59e0b' }]}>{citas}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>CITAS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, filtroVencidos && s.kpiActivo]}
            onPress={() => { setEstadoFiltro(null); setFiltroVencidos(v => !v) }}
          >
            <Text style={[s.kpiNum, vencidos > 0 ? { color: '#ef4444' } : { color: c.border }]}>{vencidos}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>VENCIDOS</Text>
          </TouchableOpacity>
          <View style={[s.kpiDiv, { backgroundColor: c.border }]} />
          <TouchableOpacity
            style={[s.kpiItem, estadoFiltro === '__cerrados__' && s.kpiActivo]}
            onPress={() => { setFiltroVencidos(false); setEstadoFiltro(estadoFiltro === '__cerrados__' ? null : '__cerrados__') }}
          >
            <Text style={[s.kpiNum, { color: '#10b981' }]}>{cerrados}</Text>
            <Text style={[s.kpiLbl, { color: c.textMute }]}>CERRADOS</Text>
          </TouchableOpacity>
        </View>

        {/* ── Funnel bar ── */}
        <View style={[s.funnelWrap, { backgroundColor: c.card }]}>
          <View style={[s.funnelBar, { backgroundColor: darkMode ? c.border : '#e2e8f0' }]}>
            {total === 0 ? (
              <View style={[s.funnelSeg, { flex: 1, backgroundColor: c.border }]} />
            ) : (
              ORDEN_ESTADOS.map(e => {
                const n = conteos[e]
                if (n === 0) return null
                const info = estadoInfo(e)
                return (
                  <TouchableOpacity
                    key={e}
                    style={[s.funnelSeg, { flex: n, backgroundColor: info.color }]}
                    onPress={() => setEstadoFiltro(estadoFiltro === e ? null : e)}
                    activeOpacity={0.75}
                  />
                )
              })
            )}
          </View>
          {total === 0 && !isLoading ? (
            <Text style={s.funnelEmpty}>Agrega tu primer lead para ver el embudo de ventas</Text>
          ) : (
            <View style={s.funnelLegend}>
              {ORDEN_ESTADOS.filter(e => conteos[e] > 0).map(e => {
                const info = estadoInfo(e)
                const activo = estadoFiltro === e
                return (
                  <TouchableOpacity
                    key={e}
                    style={[s.legendItem, activo && { backgroundColor: info.color + '22', borderRadius: 12, paddingHorizontal: 6 }]}
                    onPress={() => { setFiltroVencidos(false); setEstadoFiltro(activo ? null : e) }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.legendDot, { backgroundColor: info.color }]} />
                    <Text style={[s.legendTxt, { color: activo ? info.color : c.textSub }, activo && { fontWeight: '700' }]}>{info.label} ({conteos[e]})</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>


        {/* ── Oportunidades en riesgo ── */}
        {clientesEnRiesgo.length > 0 && !filtroVencidos && !bannerCerrado && (
          <View style={s.opBanner}>
            <View style={s.opHeader}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                onPress={() => { setEstadoFiltro(null); setOpFiltro(null); setFiltroVencidos(true) }}
                activeOpacity={0.85}
              >
                <Text style={s.opEmoji}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.opTitulo}>
                    {clientesEnRiesgo.length} oportunidad{clientesEnRiesgo.length === 1 ? '' : 'es'} en riesgo
                  </Text>
                  <Text style={s.opSub}>Contáctalos antes de que se enfríen</Text>
                </View>
                <Text style={s.opCta}>Ver todos →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBannerCerrado(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 8 }}>
                <Ionicons name="close" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
            {!vistaExcel && clientesEnRiesgo.slice(0, 3).map(cl => {
              const dias = diasVencido(cl)
              return (
                <TouchableOpacity
                  key={cl.id}
                  style={s.opCliente}
                  onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${cl.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={s.opClienteNombre} numberOfLines={1}>{cl.nombre}</Text>
                  <View style={[s.opDiasBadge, dias >= 7 && s.opDiasBadgeAlta]}>
                    <Text style={[s.opDiasTxt, dias >= 7 && s.opDiasTxtAlta]}>{dias}d</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
            {!vistaExcel && clientesEnRiesgo.length > 3 && (
              <Text style={s.opMas}>+{clientesEnRiesgo.length - 3} más — toca "Ver todos" para verlos</Text>
            )}
          </View>
        )}

        {/* ── Clientes duplicados ── */}
        {gruposDuplicados.length > 0 && !bannerDupCerrado && (
          <View style={s.dupBanner}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              onPress={() => setShowDuplicadosModal(true)}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 18 }}>🔁</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.dupBannerTitulo}>
                  {gruposDuplicados.reduce((sum, g) => sum + g.length, 0)} clientes con número repetido
                </Text>
                <Text style={s.dupBannerSub}>Toca para revisar y limpiar duplicados</Text>
              </View>
              <Text style={s.dupBannerCta}>Ver →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBannerDupCerrado(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 8 }}>
              <Ionicons name="close" size={18} color="#d97706" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Botones: chats de WhatsApp + Colecciones ── */}
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 8 }}>
          <TouchableOpacity style={[s.btnCampana, { flex: 1, marginHorizontal: 0, marginTop: 0 }]} onPress={() => router.push('/(prospectador)/chats')}>
            <Text style={s.btnCampanaTxt}>💬 Chats de WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnCampana, { flex: 1, marginHorizontal: 0, marginTop: 0, backgroundColor: '#1a6470' }]} onPress={() => router.push('/(prospectador)/colecciones')}>
            <Text style={s.btnCampanaTxt}>📁 Colecciones</Text>
          </TouchableOpacity>
        </View>

        {/* ── Botón: Leads de campaña (solo si hay clientes asignados de campaña) ── */}
        {leadsCampania.length > 0 && (
          <TouchableOpacity style={s.btnLeadsCamp} onPress={() => router.push('/(prospectador)/leads-campania')} activeOpacity={0.88}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <Text style={{ fontSize: 28 }}>📣</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.btnLeadsCampTit}>Leads de campaña</Text>
                <Text style={s.btnLeadsCampSub}>Tu CRM de clientes de campaña</Text>
              </View>
            </View>
            <View style={s.badgeCampaniaBig}><Text style={s.badgeCampaniaBigTxt}>{leadsCampania.length}</Text></View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}

        {/* ── Search + sort + nuevo ── */}
        <View style={s.searchRow}>
          <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={15} color={c.textMute} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.searchInput, { color: c.text }]}
              placeholder="Buscar nombre, teléfono, empresa..."
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
          <Tooltip label="Ordenar clientes">
            <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => setShowSort(true)}>
              <Ionicons name="funnel-outline" size={15} color="#1a6470" />
              {sortBy !== 'reciente' && <View style={s.sortDot} />}
            </TouchableOpacity>
          </Tooltip>
          <Tooltip label={vistaExcel ? 'Ver como lista' : 'Ver como tabla'}>
            <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={toggleVista}>
              <Ionicons name={vistaExcel ? 'grid-outline' : 'list-outline'} size={15} color="#1a6470" />
            </TouchableOpacity>
          </Tooltip>
          <Tooltip label="Importar clientes (CSV)">
            <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={abrirImport}>
              <Ionicons name="cloud-upload-outline" size={15} color="#1a6470" />
            </TouchableOpacity>
          </Tooltip>
          <Tooltip label="Exportar clientes (CSV)">
            <TouchableOpacity style={[s.sortBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={exportarCSV} disabled={exportando}>
              {exportando
                ? <ActivityIndicator size="small" color="#1a6470" />
                : <Ionicons name="download-outline" size={15} color="#1a6470" />
              }
            </TouchableOpacity>
          </Tooltip>
          <Tooltip label="Nuevo cliente">
            <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(prospectador)/cliente-form')}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </Tooltip>
        </View>

        {/* ── Operacion tabs ── */}
        <View style={[s.opRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          {([null, 'venta', 'renta'] as const).map(op => {
            const label = op === null ? 'Todos' : op === 'venta' ? '🏠 Venta' : '🔑 Renta'
            const cnt   = op === null ? clientes.length : clientes.filter(c => c.tipo_operacion === op).length
            const activo = opFiltro === op
            return (
              <TouchableOpacity key={String(op)} style={[s.opTab, activo && s.opTabActivo]} onPress={() => setOpFiltro(op)}>
                <Text style={[s.opTabTxt, { color: c.textMute }, activo && s.opTabTxtActivo]}>{label}</Text>
                <View style={[s.opTabBadge, { backgroundColor: c.border }, activo && s.opTabBadgeActivo]}>
                  <Text style={[s.opTabBadgeTxt, { color: c.textMute }, activo && { color: '#1a6470' }]}>{cnt}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Sort label ── */}
        {sortBy !== 'reciente' && (
          <View style={s.sortActiveBar}>
            <Ionicons name="funnel" size={11} color="#1a6470" />
            <Text style={s.sortActiveTxt}>Ordenado por: {SORT_LABELS[sortBy]}</Text>
            <TouchableOpacity onPress={() => setSortBy('reciente')}>
              <Ionicons name="close-circle" size={14} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── List ── */}
        {isLoading ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 48 }} />
        ) : filtrados.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="people-outline" size={32} color="#94a3b8" />
            </View>
            <Text style={s.emptyTitle}>{busqueda || estadoFiltro ? 'Sin resultados' : 'Sin leads aún'}</Text>
            {!busqueda && !estadoFiltro && (
              <Text style={s.emptySub}>Agrega tu primer lead con el botón "Nuevo lead"</Text>
            )}
          </View>
        ) : vistaExcel ? (() => {
          const tableHeader = (
            <View style={s.excelTrHead}>
              {TABLE_COLS.map(col => {
                const isSorted = excelSort?.col === col.id
                const filtered = isColFiltered(col.id)
                return (
                  <View key={col.id} style={[s.excelTh, cStyle(col)]}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 }}
                      onPress={col.sortable ? () => handleColSort(col.id) : undefined}
                      disabled={!col.sortable}
                    >
                      <Text style={s.excelThTxt} numberOfLines={1}>{col.label}</Text>
                      {col.sortable && (
                        <Ionicons
                          name={!isSorted ? 'swap-vertical-outline' : excelSort!.dir === 'asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
                          size={11} color={isSorted ? '#fbbf24' : 'rgba(255,255,255,0.45)'}
                        />
                      )}
                    </TouchableOpacity>
                    {col.filterable && (
                      <TouchableOpacity style={[s.excelThFilter, filtered && s.excelThFilterOn]} onPress={() => handleOpenColFilter(col.id)}>
                        <Ionicons name="funnel" size={10} color={filtered ? '#fbbf24' : 'rgba(255,255,255,0.4)'} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          )

          function renderExcelRow(item: Cliente, idx: number) {
            const info = estadoInfo(item.estado)
            const interesRowBg = item.nivel_interes === 'alto'
              ? (darkMode ? '#2d1208' : '#fdeee6')
              : item.nivel_interes === 'medio'
              ? (darkMode ? '#27200a' : '#fdf6e3')
              : item.nivel_interes === 'bajo'
              ? (darkMode ? '#0d1e18' : '#eaf4ef')
              : null
            return (
              <View
                key={item.id}
                style={[
                  s.excelTr,
                  { borderBottomColor: c.border },
                  interesRowBg
                    ? { backgroundColor: interesRowBg }
                    : (idx % 2 !== 0 && { backgroundColor: darkMode ? '#0a1827' : '#f8fafc' }),
                ]}
              >
                {TABLE_COLS.map(col => {
                  const cs = cStyle(col)
                  const editando = editCell?.id === item.id && editCell?.col === col.id
                  // Editor de texto inline (nombre, teléfono, notas, zona, presupuesto). "fecha" usa
                  // su propio modal (fechaModal, más abajo) en vez de este editor de celda.
                  if (editando && (col.id === 'nombre' || col.id === 'telefono' || col.id === 'notas' || col.id === 'zona' || col.id === 'presupuesto')) {
                    if (col.id === 'notas' && isWeb) {
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs, { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 6 }]}>
                          {createElement('textarea', {
                            autoFocus: true,
                            value: editValue,
                            onChange: (e: any) => setEditValue(e.target.value),
                            onBlur: guardarTexto,
                            // Enter guarda y cierra; Shift+Enter hace salto de línea.
                            onKeyDown: (e: any) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardarTexto() }
                              else if (e.key === 'Escape') { guardarTexto() }
                            },
                            placeholder: 'Escribe una nota... (Enter guarda, Shift+Enter salta de línea)',
                            rows: 4,
                            style: {
                              width: '100%', minHeight: 80, resize: 'vertical',
                              padding: '6px 8px', borderRadius: 6,
                              border: '1.5px solid #1a9aaa', fontSize: 12,
                              fontFamily: 'inherit', lineHeight: '1.45',
                              color: darkMode ? '#fff' : '#111',
                              background: darkMode ? '#0a1827' : '#fff',
                              outline: 'none',
                            },
                          })}
                        </View>
                      )
                    }
                    return (
                      <View key={col.id} style={[s.excelTdCell, cs, col.id === 'notas' && { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 6 }]}>
                        <TextInput
                          autoFocus
                          value={editValue}
                          onChangeText={setEditValue}
                          onBlur={guardarTexto}
                          onSubmitEditing={col.id !== 'notas' ? guardarTexto : undefined}
                          placeholder={col.id === 'notas' ? 'Escribe una nota...' : ''}
                          placeholderTextColor={c.textMute}
                          keyboardType={col.id === 'telefono' ? 'phone-pad' : 'default'}
                          multiline={col.id === 'notas'}
                          numberOfLines={col.id === 'notas' ? 4 : 1}
                          style={[s.cellInput, { color: c.text, borderColor: '#1a9aaa', backgroundColor: c.bg }, col.id === 'notas' && { minHeight: 80, textAlignVertical: 'top' }]}
                        />
                      </View>
                    )
                  }

                  // Celdas (click → editar)
                  switch (col.id) {
                    case 'nombre': {
                      const sem = semaforoCrm(item)
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          {sem ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: sem }} /> : null}
                          <TouchableOpacity
                            onPress={() => router.push(`/(prospectador)/detalle-cliente?id=${item.id}` as any)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
                            style={{ padding: 2 }}
                          >
                            <Ionicons name="person-circle-outline" size={17} color="#1a9aaa" />
                          </TouchableOpacity>
                          <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirEdicion(item, 'nombre')} activeOpacity={0.6}>
                            <Text style={[s.excelTd, s.excelTdBold, s.cellTxtNoPad, { color: c.text }]} numberOfLines={1}>{item.nombre}</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    }
                    case 'telefono':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'telefono')} activeOpacity={0.6}>
                          <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub }]} numberOfLines={1}>{item.telefono}</Text>
                        </TouchableOpacity>
                      )
                    case 'estado':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'estado')} activeOpacity={0.6}>
                          <View style={[s.excelEstadoPill, { backgroundColor: darkMode ? info.color + '28' : info.bg }]}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: info.color }} />
                            <Text style={{ fontSize: 11, color: info.color, fontWeight: '700' }} numberOfLines={1}>{info.label}</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    case 'operacion':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'operacion')} activeOpacity={0.6}>
                          {item.tipo_operacion
                            ? <View style={[s.excelOpTag, item.tipo_operacion === 'venta'
                                ? { backgroundColor: darkMode ? 'rgba(26,100,112,0.22)' : '#e0f4f5' }
                                : { backgroundColor: darkMode ? 'rgba(124,58,237,0.22)' : '#f3e8ff' }]}>
                                <Text style={[s.excelOpTxt, { color: item.tipo_operacion === 'venta' ? '#1a9aaa' : '#a78bfa' }]}>
                                  {item.tipo_operacion === 'venta' ? '🏠 Venta' : '🔑 Renta'}
                                </Text>
                              </View>
                            : <Text style={[s.excelNull, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>—</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'tipo_credito':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'tipo_credito')} activeOpacity={0.6}>
                          {item.tipo_credito
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub }]} numberOfLines={1}>
                                {TIPO_CREDITO_LABEL[item.tipo_credito] ?? item.tipo_credito}
                              </Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>+ pago</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'fecha': {
                      const ts = item.proximo_contacto ? new Date(item.proximo_contacto) : null
                      const vencido = ts ? ts.getTime() < Date.now() : false
                      const hoy = ts ? ts.toDateString() === new Date().toDateString() : false
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'fecha')} activeOpacity={0.6}>
                          {ts
                            ? <Text style={[s.excelTd, s.excelTdDate, s.cellTxtNoPad, { color: vencido ? '#ef4444' : hoy ? '#d97706' : c.textSub }]} numberOfLines={1}>
                                {vencido ? '⚠ ' : hoy ? '📌 ' : ''}{ts.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} {ts.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>+ agregar</Text>
                          }
                        </TouchableOpacity>
                      )
                    }
                    case 'zona':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'zona')} activeOpacity={0.6}>
                          {item.zona_busqueda
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub }]} numberOfLines={1}>{item.zona_busqueda}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>+ zona</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'presupuesto':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs]} onPress={() => abrirEdicion(item, 'presupuesto')} activeOpacity={0.6}>
                          {item.presupuesto
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: '#2e7d32', fontWeight: '700' }]} numberOfLines={1}>{item.presupuesto}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>+ presup.</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'notas':
                      return (
                        <TouchableOpacity key={col.id} style={[s.excelTdCell, cs, { alignSelf: 'stretch', justifyContent: 'flex-start', paddingTop: 8 }]} onPress={() => abrirEdicion(item, 'notas')} activeOpacity={0.6}>
                          {item.notas
                            ? <Text style={[s.excelTd, s.cellTxtNoPad, { color: c.textSub, fontSize: 12, lineHeight: 17 }]} numberOfLines={3}>{item.notas}</Text>
                            : <Text style={[s.excelNull, s.cellTxtNoPad, { color: darkMode ? '#6b7280' : '#9ca3af' }]}>+ agregar</Text>
                          }
                        </TouchableOpacity>
                      )
                    case 'acciones':
                      return (
                        <View key={col.id} style={[s.excelTdCell, cs, { justifyContent: 'center', alignItems: 'center' }]}>
                          <TouchableOpacity
                            onPress={() => eliminarClienteTabla(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.6}
                          >
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      )
                    default: return null
                  }
                })}
              </View>
            )
          }

          if (isWeb) {
            const table = (
              <View style={[s.excelTable, { minWidth: screenWidth - 32 }]}>
                {tableHeader}
                {filtradosExcel.map((item, idx) => renderExcelRow(item, idx))}
                <View style={{ height: 100 }} />
              </View>
            )
            return (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
                <View style={[s.excelTableWrap, { backgroundColor: c.card }]}>{table}</View>
              </ScrollView>
            )
          }

          // Mobile: FlatList virtualizado (las filas no se montan todas a la vez,
          // evita que la app se trabe con cientos de clientes en vista Excel)
          const mobileTableWidth = TABLE_COLS.reduce((sum, col) => sum + col.mw, 0)
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <FlatList
                data={filtradosExcel}
                keyExtractor={item => item.id}
                style={{ width: mobileTableWidth }}
                ListHeaderComponent={() => tableHeader}
                stickyHeaderIndices={[0]}
                renderItem={({ item, index }) => renderExcelRow(item, index)}
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews
                windowSize={7}
                maxToRenderPerBatch={20}
                initialNumToRender={20}
              />
            </ScrollView>
          )
        })() : (
          <FlatList
            data={filtrados}
            keyExtractor={item => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100, paddingTop: 10 }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} tintColor="#1a6470" colors={['#1a6470']} />}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={7}
            initialNumToRender={15}
            renderItem={renderCliente}
          />
        )}
      </View>

      {/* ── Enviar al chatbot ── */}
      <Modal visible={!!clienteChatbot} transparent animationType="fade" onRequestClose={cerrarModalChatbot}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={cerrarModalChatbot}>
          <TouchableOpacity activeOpacity={1} style={[s.chatbotModalBox, { backgroundColor: c.card }]} onPress={e => e.stopPropagation()}>
            <Ionicons name="chatbubbles-outline" size={28} color="#7c3aed" style={{ marginBottom: 8 }} />
            <Text style={[s.chatbotModalTitle, { color: c.text }]}>Enviar al chatbot</Text>
            <Text style={[s.chatbotModalSub, { color: c.textMute }]}>
              {clienteChatbot?.nombre}
            </Text>

            {clienteChatbot?.tipo_operacion?.toLowerCase() !== 'venta' ? (
              <Text style={[s.chatbotModalInfo, { color: c.textMute }]}>
                Solo se pueden enviar al chatbot clientes cuya operación sea de
                venta. Este cliente está marcado como{' '}
                {clienteChatbot?.tipo_operacion || 'sin operación'}.
              </Text>
            ) : (
              <>
                <Text style={[s.chatbotModalInfo, { color: c.textMute, marginBottom: 8, textAlign: 'left' }]}>
                  Solo clientes de venta con presupuesto mayor a $1,800,000.
                  Confirma o corrige los datos antes de enviar.
                </Text>

                <Text style={[s.chatbotFieldLabel, { color: c.textMute }]}>Teléfono</Text>
                <TextInput
                  style={[s.chatbotInput, { color: c.text, borderColor: c.border }]}
                  value={chatbotTelefono}
                  onChangeText={setChatbotTelefono}
                  placeholder="10 dígitos"
                  placeholderTextColor={c.textMute}
                  keyboardType="phone-pad"
                />

                <Text style={[s.chatbotFieldLabel, { color: c.textMute }]}>Presupuesto (MXN)</Text>
                <TextInput
                  style={[s.chatbotInput, { color: c.text, borderColor: c.border }]}
                  value={chatbotPresupuesto ? Number(chatbotPresupuesto).toLocaleString('es-MX') : ''}
                  onChangeText={(t) => setChatbotPresupuesto(t.replace(/\D/g, ''))}
                  placeholder="Ej. 2500000"
                  placeholderTextColor={c.textMute}
                  keyboardType="number-pad"
                />

                {chatbotError && (
                  <Text style={s.chatbotErrorTxt}>{chatbotError}</Text>
                )}

                <TouchableOpacity
                  style={[s.chatbotModalEnviar, chatbotEnviando && { opacity: 0.6 }]}
                  onPress={enviarClienteAChatbot}
                  disabled={chatbotEnviando}
                >
                  {chatbotEnviando
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.chatbotModalCerrarTxt}>Enviar al chatbot</Text>}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={s.chatbotModalCerrar} onPress={cerrarModalChatbot} disabled={chatbotEnviando}>
              <Text style={s.chatbotModalCerrarTxt}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Sort bottom sheet ── */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setShowSort(false)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>Ordenar leads</Text>
            {(['reciente', 'nombre', 'contacto'] as SortBy[]).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.sortOpt, { borderBottomColor: c.border }]}
                onPress={() => { setSortBy(opt); setShowSort(false) }}
              >
                <View style={s.sortOptLeft}>
                  <Ionicons
                    name={opt === 'reciente' ? 'time-outline' : opt === 'nombre' ? 'text-outline' : 'calendar-outline'}
                    size={16}
                    color={sortBy === opt ? '#1a6470' : c.textMute}
                  />
                  <Text style={[s.sortOptTxt, { color: c.textSub }, sortBy === opt && { color: '#1a9aaa', fontWeight: '700' }]}>
                    {SORT_LABELS[opt]}
                  </Text>
                </View>
                {sortBy === opt && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Column filter modal ── */}
      <Modal visible={excelFilterModal !== null} transparent animationType="slide" onRequestClose={() => setExcelFilterModal(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setExcelFilterModal(null)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>{excelFilterModal?.label ?? ''}</Text>
            {excelFilterModal?.tipo === 'rango' ? (
              <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
                <Text style={{ color: c.textSub, fontSize: 12, marginBottom: 8 }}>Filtra por monto aproximado (ej. 1.5M, 2000000, 8000).</Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                  <TextInput style={[s.presInput, { color: c.text, borderColor: c.border }]} value={presMin} onChangeText={setPresMin} placeholder="Mínimo" placeholderTextColor={c.textMute} />
                  <Text style={{ color: c.textMute }}>—</Text>
                  <TextInput style={[s.presInput, { color: c.text, borderColor: c.border }]} value={presMax} onChangeText={setPresMax} placeholder="Máximo" placeholderTextColor={c.textMute} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[s.presBtn, { borderColor: c.border }]} onPress={() => { setPresMin(''); setPresMax('') }}>
                    <Text style={{ color: c.textSub, fontWeight: '700' }}>Limpiar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.presBtn, { backgroundColor: '#1a6470' }]} onPress={() => setExcelFilterModal(null)}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Aplicar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : excelFilterModal?.options?.map(opt => {
              const active = getColFilterValue(excelFilterModal!.col) === opt.value
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[s.sortOpt, { borderBottomColor: c.border }]}
                  onPress={() => applyColFilter(excelFilterModal!.col, opt.value)}
                >
                  <View style={s.sortOptLeft}>
                    {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                    <Text style={[s.sortOptTxt, { color: c.textSub }, active && { color: '#1a9aaa', fontWeight: '700' }]}>{opt.label}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Selector inline para celdas de estado/operación/interés ── */}
      <Modal visible={cellPicker !== null} transparent animationType="slide" onRequestClose={() => setCellPicker(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setCellPicker(null)}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>{cellPicker?.label ?? ''}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {cellPicker?.options.map(opt => {
                const cl = clientes.find(x => x.id === cellPicker.id)
                const actualVal = cl
                  ? (cellPicker.col === 'estado'       ? cl.estado
                    : cellPicker.col === 'operacion'   ? cl.tipo_operacion
                    : cellPicker.col === 'tipo_credito' ? cl.tipo_credito
                    : cl.nivel_interes)
                  : null
                const active = actualVal === opt.value
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[s.sortOpt, { borderBottomColor: c.border }]}
                    onPress={() => {
                      const p = cellPicker
                      setCellPicker(null)
                      if (p.col === 'estado' && opt.value === 'compro' && userRole !== 'admin') {
                        const msg = '¿El cliente ya apartó? Esta acción notificará al administrador para que verifique y apruebe el apartado.'
                        const confirmar = Platform.OS === 'web'
                          ? window.confirm(msg)
                          : undefined
                        if (Platform.OS === 'web') {
                          if (confirmar) guardarCelda(p.id, p.col, opt.value)
                        } else {
                          Alert.alert('Confirmar apartado', msg, [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Sí, enviar', onPress: () => guardarCelda(p.id, p.col, opt.value) },
                          ])
                        }
                      } else if (p.col === 'estado' && opt.value === 'descartado') {
                        setDescarteModal({ id: p.id })
                      } else {
                        guardarCelda(p.id, p.col, opt.value)
                      }
                    }}
                    disabled={savingCell}
                  >
                    <View style={s.sortOptLeft}>
                      {opt.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                      <Text style={[s.sortOptTxt, { color: c.textSub }, active && { color: '#1a9aaa', fontWeight: '700' }]}>{opt.label}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={18} color="#1a6470" />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: Próximo contacto (Día/Mes/Año/Hora/Min) ── */}
      <Modal visible={fechaModal !== null} transparent animationType="fade" onRequestClose={() => setFechaModal(null)}>
        <View style={s.dpOverlay}>
          <View style={[s.dpModal, { backgroundColor: c.card }]}>
            <Text style={[s.dpTitle, { color: c.text }]}>Próximo contacto</Text>
            <Text style={[s.dpSecLabel, { color: c.textMute }]}>Fecha</Text>
            <View style={s.dpRow}>
              <FechaSpin label="Día" value={fechaTemp.getDate()} onUp={() => ajustarFechaTemp('date', 1)} onDown={() => ajustarFechaTemp('date', -1)} c={c} />
              <FechaSpin label="Mes" value={fechaTemp.toLocaleString('es-MX', { month: 'short' })} onUp={() => ajustarFechaTemp('month', 1)} onDown={() => ajustarFechaTemp('month', -1)} c={c} />
              <FechaSpin label="Año" value={fechaTemp.getFullYear()} onUp={() => ajustarFechaTemp('year', 1)} onDown={() => ajustarFechaTemp('year', -1)} c={c} />
            </View>
            <Text style={[s.dpSecLabel, { color: c.textMute }]}>Hora</Text>
            <View style={s.dpRow}>
              <FechaSpin label="Hora" value={String(fechaTemp.getHours()).padStart(2, '0')} onUp={() => ajustarFechaTemp('hour', 1)} onDown={() => ajustarFechaTemp('hour', -1)} c={c} />
              <FechaSpin label="Min" value={String(fechaTemp.getMinutes()).padStart(2, '0')} onUp={() => ajustarFechaTemp('minute', 5)} onDown={() => ajustarFechaTemp('minute', -5)} c={c} />
            </View>
            <View style={s.dpActions}>
              <TouchableOpacity style={s.dpBtnQuitar} onPress={quitarFechaModal}>
                <Text style={s.dpBtnQuitarText}>Quitar fecha</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={s.dpBtnCancel} onPress={() => setFechaModal(null)}>
                <Text style={[s.dpBtnCancelText, { color: c.textSub }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dpBtnConfirm} onPress={guardarFechaModal}>
                <Text style={s.dpBtnConfirmText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: razón de descarte ── */}
      <Modal visible={descarteModal !== null} transparent animationType="slide" onRequestClose={() => setDescarteModal(null)}>
        <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={() => setDescarteModal(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.sortSheet, { backgroundColor: c.card }]} onPress={e => e.stopPropagation()}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>¿Por qué se descarta este lead?</Text>
            <Text style={{ fontSize: 12, color: c.textSub, marginBottom: 14 }}>Opcional — ayuda a entender qué mejorar</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {RAZONES_DESCARTE.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[s.sortOpt, { borderBottomColor: c.border }]}
                  onPress={async () => {
                    const dm = descarteModal!
                    setDescarteModal(null)
                    await guardarCelda(dm.id, 'estado', 'descartado')
                    supabase.from('clientes').update({ razon_descarte: r.value }).eq('id', dm.id).then()
                  }}
                >
                  <Text style={[s.sortOptTxt, { color: c.textSub }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.sortOpt, { borderBottomColor: 'transparent' }]}
                onPress={() => {
                  const dm = descarteModal!
                  setDescarteModal(null)
                  guardarCelda(dm.id, 'estado', 'descartado')
                }}
              >
                <Text style={{ fontSize: 13, color: c.textMute, paddingVertical: 4 }}>Saltar — no especificar</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Selector de Zonas de interés (multi-selección + "Otra") ── */}
      <Modal visible={zonaPicker !== null} transparent animationType="slide" onRequestClose={() => setZonaPicker(null)}>
        <View style={s.modalBg}>
          <View style={[s.sortSheet, { backgroundColor: c.card }]}>
            <View style={[s.sortHandle, { backgroundColor: c.border }]} />
            <Text style={[s.sortTitle, { color: c.text }]}>Zonas de interés</Text>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {zonaPicker && (
                <ZonasInteresField
                  value={zonaPicker.draft}
                  onChange={(next) => setZonaPicker(zp => zp ? { ...zp, draft: next } : zp)}
                />
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[s.zonaBtn, { borderColor: c.border }]}
                onPress={() => setZonaPicker(null)}
                disabled={savingCell}
              >
                <Text style={[s.zonaBtnTxt, { color: c.textSub }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.zonaBtn, { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => {
                  if (!zonaPicker) return
                  const p = zonaPicker
                  setZonaPicker(null)
                  guardarCelda(p.id, 'zona', p.draft.trim() || null)
                }}
                disabled={savingCell}
              >
                <Text style={[s.zonaBtnTxt, { color: '#fff' }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImportCSVModal
        visible={importModal}
        csvHeaders={csvHeaders}
        csvData={csvData}
        onClose={() => setImportModal(false)}
        onConfirm={handleImportConfirm}
      />

      {/* ── Modal: clientes duplicados ── */}
      <Modal visible={showDuplicadosModal} transparent animationType="slide" onRequestClose={() => setShowDuplicadosModal(false)}>
        <View style={s.dupModalBg}>
          <View style={[s.dupModalSheet, { backgroundColor: c.bg }]}>
            {/* Header */}
            <View style={[s.dupModalHeader, { borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.dupModalTitulo, { color: c.text }]}>🔁 Clientes duplicados</Text>
                <Text style={[s.dupModalSub, { color: c.textMute }]}>
                  {gruposDuplicados.length} grupo{gruposDuplicados.length !== 1 ? 's' : ''} con número repetido
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDuplicadosModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.textMute} />
              </TouchableOpacity>
            </View>

            {gruposDuplicados.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Text style={{ fontSize: 40 }}>✅</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>¡Sin duplicados!</Text>
                <TouchableOpacity style={s.dupBtnCerrar} onPress={() => setShowDuplicadosModal(false)}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 40 }}>
                {gruposDuplicados.map((grupo, gi) => (
                  <View key={gi} style={[s.dupGrupo, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Text style={[s.dupGrupoTel, { color: c.textMute }]}>📱 {grupo[0].telefono}</Text>
                    {grupo.map((cl, idx) => (
                      <View key={cl.id} style={[s.dupClienteRow, { borderTopColor: c.border }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[s.dupClienteNombre, { color: c.text }]} numberOfLines={1}>{cl.nombre}</Text>
                            {idx === 0 && (
                              <View style={s.dupBadgeReciente}>
                                <Text style={s.dupBadgeRecienteTxt}>Más reciente</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[s.dupClienteInfo, { color: c.textMute }]}>
                            {ESTADOS[cl.estado]?.label ?? cl.estado} · {new Date(cl.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={s.dupBtnElim}
                          onPress={() => {
                            const confirmar = Platform.OS === 'web'
                              ? window.confirm(`¿Eliminar a "${cl.nombre}"? Esta acción no se puede deshacer.`)
                              : undefined
                            if (Platform.OS === 'web') {
                              if (confirmar) eliminarDuplicado(cl)
                            } else {
                              Alert.alert('Eliminar duplicado', `¿Eliminar a "${cl.nombre}"?`, [
                                { text: 'Cancelar', style: 'cancel' },
                                { text: 'Eliminar', style: 'destructive', onPress: () => eliminarDuplicado(cl) },
                              ])
                            }
                          }}
                        >
                          <Ionicons name="trash-outline" size={13} color="#fff" />
                          <Text style={s.dupBtnElimTxt}>Eliminar</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Banner duplicados
  dupBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fffbeb', borderLeftWidth: 4, borderLeftColor: '#f59e0b',
    marginHorizontal: 12, marginTop: 8, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dupBannerTitulo: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  dupBannerSub:    { fontSize: 11, color: '#b45309', marginTop: 1 },
  dupBannerCta:    { fontSize: 12, fontWeight: '700', color: '#d97706', marginRight: 4 },

  // Modal duplicados
  dupModalBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  dupModalSheet:  { borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%' },
  dupModalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dupModalTitulo: { fontSize: 16, fontWeight: '800' },
  dupModalSub:    { fontSize: 12, marginTop: 2 },

  // Grupos
  dupGrupo:       { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  dupGrupoTel:    { fontSize: 12, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 8 },
  dupClienteRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1,
  },
  dupClienteNombre: { fontSize: 13, fontWeight: '700' },
  dupClienteInfo:   { fontSize: 11, marginTop: 2 },
  dupBadgeReciente: { backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dupBadgeRecienteTxt: { fontSize: 9, fontWeight: '800', color: '#065f46' },
  dupBtnElim:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  dupBtnElimTxt:  { fontSize: 11, fontWeight: '700', color: '#fff' },
  dupBtnCerrar:   { backgroundColor: '#1a6470', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  dpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  dpModal: {
    borderRadius: 20, padding: 24, width: '88%', maxWidth: 360,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  dpTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  dpSecLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  dpRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  dpActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dpBtnQuitar: { paddingHorizontal: 10, paddingVertical: 9 },
  dpBtnQuitarText: { color: '#c0392b', fontWeight: '600', fontSize: 13 },
  dpBtnCancel: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0' },
  dpBtnCancelText: { fontWeight: '600', fontSize: 13 },
  dpBtnConfirm: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a6470' },
  dpBtnConfirmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  savedToast: {
    position: 'absolute', bottom: 28, alignSelf: 'center', zIndex: 999,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 8,
    maxWidth: '90%',
  },
  savedToastOk: { backgroundColor: '#1a6470' },
  savedToastPend: { backgroundColor: '#b9770a' },
  savedToastTxt: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  saveFab: {
    position: 'absolute', bottom: 24, right: 20, zIndex: 1000,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#e67e22', borderRadius: 26,
    paddingHorizontal: 18, paddingVertical: 13,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 9,
    // @ts-ignore — cursor solo aplica en web
    cursor: 'pointer',
  },
  saveFabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  addBtn: {
    width: 42, height: 42, backgroundColor: '#1a6470',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },

  // ── KPI strip ───────────────────────────────────────────────────
  kpiStrip: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  presuBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginTop: 10, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1a6470',
  },
  presuBannerLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  presuBannerNum: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 1 },
  presuBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '700', textAlign: 'right', maxWidth: 90 },
  kpiItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, borderRadius: 10 },
  kpiActivo: { backgroundColor: 'rgba(26,100,112,0.12)' },
  kpiNum:  { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  kpiLbl:  { fontSize: 9, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.6 },
  kpiDiv:  { width: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },

  // ── Funnel ──────────────────────────────────────────────────────
  funnelWrap: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 10 },
  funnelBar: {
    height: 6, flexDirection: 'row', borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  funnelSeg: { height: '100%' },
  funnelLegend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8,
  },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 7, height: 7, borderRadius: 4 },
  legendTxt:    { fontSize: 10, color: '#64748b', fontWeight: '500' },
  funnelEmpty:  { fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' },

  // ── Stage chips ─────────────────────────────────────────────────
  stagePipe:        { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  stagePipeContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  stageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  stageChipAll: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  stageDot:     { width: 6, height: 6, borderRadius: 3 },
  stageChipTxt: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  stageCnt:     { fontSize: 11, color: '#94a3b8', fontWeight: '700' },

  // ── Botón chats ─────────────────────────────────────────────────
  btnCampana: {
    marginHorizontal: 12, marginTop: 8,
    backgroundColor: '#25D366', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
    flexShrink: 0,
  },
  btnCampanaTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  badgeCampania: { backgroundColor: 'rgba(255,255,255,0.9)', minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeCampaniaTxt: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  btnLeadsCamp: {
    marginHorizontal: 12, marginTop: 10, backgroundColor: '#7c3aed', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0 4px 14px rgba(124,58,237,0.35)' } as any, default: { elevation: 4 } }),
  },
  btnLeadsCampTit: { color: '#fff', fontSize: 17, fontWeight: '900' },
  btnLeadsCampSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  badgeCampaniaBig: { backgroundColor: '#fff', minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  badgeCampaniaBigTxt: { fontSize: 15, fontWeight: '900', color: '#7c3aed' },
  opBanner: {
    marginHorizontal: 12, marginTop: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fef2f2', overflow: 'hidden',
  },
  opHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 },
  opEmoji: { fontSize: 22 },
  opTitulo: { fontSize: 14, fontWeight: '800', color: '#b91c1c' },
  opSub: { fontSize: 12, color: '#9a4b4b', marginTop: 1 },
  opCta: { fontSize: 12, fontWeight: '800', color: '#b91c1c' },
  opCliente: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#fecaca',
  },
  opClienteNombre: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7f1d1d' },
  opDiasBadge: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  opDiasBadgeAlta: { backgroundColor: '#ef4444' },
  opDiasTxt: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  opDiasTxtAlta: { color: '#fff' },
  opMas: { fontSize: 12, color: '#9a4b4b', textAlign: 'center', paddingVertical: 8 },

  // ── Search ──────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b' },
  sortBtn: {
    width: 42, height: 42, backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  sortDot: {
    position: 'absolute', top: 8, right: 8,
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444',
  },

  // ── Operation tabs ──────────────────────────────────────────────
  opRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  opTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  opTabActivo:   { borderBottomColor: '#1a6470' },
  opTabTxt:      { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  opTabTxtActivo:{ color: '#1a6470' },
  opTabBadge:    { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  opTabBadgeActivo: { backgroundColor: '#e0f4f5' },
  opTabBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },

  // ── Sort active bar ─────────────────────────────────────────────
  sortActiveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#e0f4f5',
  },
  sortActiveTxt: { flex: 1, fontSize: 12, color: '#1a6470', fontWeight: '600' },

  // ── Empty ────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptySub:   { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  // ── Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    marginBottom: 10, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 14 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarTxt:    { fontSize: 15, fontWeight: '800' },
  cardHeadInfo: { flex: 1, minWidth: 0 },
  cardNombre:   { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
  cardSubRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardEmpresa:  { fontSize: 12, color: '#64748b' },
  fuenteTag:    { backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  fuenteTagTxt: { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'capitalize' },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, flexShrink: 0, maxWidth: 130,
  },
  estadoDot: { width: 5, height: 5, borderRadius: 3 },
  estadoTxt: { fontSize: 11, fontWeight: '700' },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, alignItems: 'center' },
  metaTime: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' as any },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:  { fontSize: 12, color: '#64748b' },

  recRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  recVenc: { backgroundColor: '#fef2f2' },
  recHoy:  { backgroundColor: '#fffbeb' },
  recProx: { backgroundColor: '#f0fdfa' },
  recTxt:  { fontSize: 12, flex: 1, fontWeight: '500' },

  actions:      { flexDirection: 'row', gap: 8 },
  actionWa: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  actionWaTxt:  { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  actionCall: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f0f9ff', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bae6fd',
  },
  actionCallTxt: { fontSize: 13, fontWeight: '600', color: '#0369a1' },
  actionEdit: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#fefce8', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#fde68a',
  },
  actionEditTxt: { fontSize: 13, fontWeight: '600', color: '#a16207' },
  actionChatbot: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f5f3ff', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#ddd6fe',
  },
  actionChatbotTxt: { fontSize: 13, fontWeight: '600', color: '#7c3aed' },

  // ── Modal "Enviar al chatbot" ───────────────────────────────────
  chatbotModalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, alignItems: 'center',
  },
  chatbotModalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  chatbotModalSub: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  chatbotModalInfo: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  chatbotFieldLabel: { fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 4 },
  chatbotInput: {
    width: '100%', borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginBottom: 10,
  },
  chatbotErrorTxt: { color: '#dc2626', fontSize: 12, marginBottom: 8, alignSelf: 'flex-start' },
  chatbotModalEnviar: {
    backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 32,
    width: '100%', alignItems: 'center', marginBottom: 8,
  },
  chatbotModalCerrar: {
    backgroundColor: '#94a3b8', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 32,
  },
  chatbotModalCerrarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Sort bottom sheet ────────────────────────────────────────────
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sortSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  sortHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 20,
  },
  sortTitle:   { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  zonaBtn:     { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  zonaBtnTxt:  { fontSize: 15, fontWeight: '700' },
  sortOpt:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sortOptLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortOptTxt:  { fontSize: 15, color: '#334155', fontWeight: '500' },
  presInput:   { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  presBtn:     { flex: 1, borderWidth: 1, borderColor: 'transparent', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },

  // ── Vista Tabla Monday.com ───────────────────────────────────────
  excelTableWrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  excelTable: { flex: 1 },
  excelTrHead: {
    flexDirection: 'row',
    backgroundColor: '#1a3547',
    minHeight: 44,
    alignItems: 'stretch',
  },
  excelTh: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  excelThTxt: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3, flex: 1 },
  excelThFilter: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 4,
  },
  excelThFilterOn: { backgroundColor: 'rgba(251,191,36,0.2)' },
  excelTr: {
    flexDirection: 'row',
    minHeight: 44,
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  excelTrAlt: { backgroundColor: '#f8fafc' },
  excelTd: {
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  excelTdBold: { fontWeight: '700', color: '#0f172a' },
  excelTdDate: { fontSize: 12, color: '#64748b' },
  excelTdCell: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  excelEstadoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  excelOpTag: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  excelOpVenta: { backgroundColor: '#e0f4f5' },
  excelOpRenta: { backgroundColor: '#f3e8ff' },
  excelOpTxt: { fontSize: 12, fontWeight: '600' },
  excelNull: { fontSize: 13, color: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 10 },
  cellTxtNoPad: { paddingHorizontal: 0, paddingVertical: 0 },
  cellInput: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 13,
  },
})
