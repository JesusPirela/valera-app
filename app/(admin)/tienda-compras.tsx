import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert, Platform,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

type Compra = {
  id: string
  user_id: string
  costo_coins: number
  estado: string
  notas_admin: string | null
  atendido_at: string | null
  created_at: string
  user_nombre: string
  user_avatar: string | null
  item_nombre: string
  item_icono: string
  item_tipo: string
  item_descripcion: string | null
}

const MENSAJES_DEFAULT: Record<string, string> = {
  lead_premium:       '¡Tu Lead Premium está en proceso! En breve recibirás los datos de un lead calificado de alta conversión.',
  lead_meta:          '¡Tu Lead Meta Ads ha sido procesado! Te enviamos los datos del lead generado por nuestras campañas.',
  boost:              '¡Tu Boost está activo! Tu propiedad ya aparece destacada en el catálogo por los próximos 7 días.',
  plantilla:          '¡Tus plantillas profesionales están listas! Revisa tu correo o escríbenos para que te las enviemos.',
  acceso_prioritario: '¡Tu acceso prioritario está activado! Durante esta semana verás propiedades exclusivas antes que nadie.',
  sorteo:             '¡Tu número de sorteo está registrado! Te avisaremos con los detalles del sorteo mensual.',
  comision_extra:     '¡Tu bono de comisión adicional del 0.5% está activado para tus próximas 2 semanas de ventas!',
  curso_premium:      '¡Tu acceso al curso premium está listo! Te enviamos el enlace al módulo exclusivo de cierre de ventas.',
  merch:              '¡Tu pedido de Merch Valera está en camino! El equipo te contactará para confirmar talla y dirección.',
}

const ES_LEAD = (tipo: string) => tipo === 'lead_premium' || tipo === 'lead_meta'

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Tienda', msg)
}

export default function TiendaCompras() {
  const [compras, setCompras]       = useState<Compra[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtro, setFiltro]         = useState<'todas' | 'pendiente' | 'entregado'>('pendiente')

  // Modal de atención
  const [modal, setModal]           = useState(false)
  const [seleccionada, setSeleccionada] = useState<Compra | null>(null)
  const [mensaje, setMensaje]       = useState('')
  const [enviando, setEnviando]     = useState(false)

  // Mini-form de lead
  const [nombreLead, setNombreLead] = useState('')
  const [telLead, setTelLead]       = useState('')

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.rpc('get_compras_tienda')
    setCompras((data ?? []) as Compra[])
    setLoading(false)
  }

  function abrirModal(c: Compra) {
    setSeleccionada(c)
    setMensaje(MENSAJES_DEFAULT[c.item_tipo] ?? `Tu recompensa "${c.item_nombre}" ha sido procesada. ¡Gracias por tu esfuerzo!`)
    setNombreLead('')
    setTelLead('')
    setModal(true)
  }

  async function entregar() {
    if (!seleccionada) return
    if (!mensaje.trim()) { alerta('Escribe un mensaje para el usuario.'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('admin_entregar_recompensa', {
      p_compra_id: seleccionada.id,
      p_user_id:   seleccionada.user_id,
      p_mensaje:   mensaje.trim(),
    })
    setEnviando(false)
    if (error) { alerta('Error: ' + error.message); return }
    setModal(false)
    cargar()
  }

  async function registrarLead() {
    if (!seleccionada) return
    if (!nombreLead.trim()) { alerta('El nombre del lead es obligatorio.'); return }
    if (!telLead.trim())    { alerta('El teléfono es obligatorio.'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('admin_registrar_lead', {
      p_compra_id:      seleccionada.id,
      p_responsable_id: seleccionada.user_id,
      p_nombre:         nombreLead.trim(),
      p_telefono:       telLead.trim(),
      p_fuente:         seleccionada.item_tipo === 'lead_meta' ? 'campana_fb' : 'marketplace',
    })
    setEnviando(false)
    if (error) { alerta('Error: ' + error.message); return }
    setModal(false)
    cargar()
  }

  const lista = compras.filter(c => filtro === 'todas' ? true : c.estado === filtro)
  const pendientes = compras.filter(c => c.estado === 'pendiente').length

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f4f5' }}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Compras de Tienda 🛒</Text>
          <Text style={s.headerSub}>
            {pendientes > 0 ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''} de entrega` : 'Todo al día ✅'}
          </Text>
        </View>
        <TouchableOpacity style={s.btnArticulos} onPress={() => router.push('/(admin)/tienda-items')}>
          <Text style={s.btnArticulosTxt}>🏪 Artículos</Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={s.filtroRow}>
        {([['todas', 'Todas'], ['pendiente', '⏳ Pendientes'], ['entregado', '✅ Entregadas']] as const).map(([val, lbl]) => (
          <TouchableOpacity
            key={val}
            style={[s.filtroBtn, filtro === val && s.filtroBtnActivo]}
            onPress={() => setFiltro(val)}
          >
            <Text style={[s.filtroTxt, filtro === val && s.filtroTxtActivo]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {lista.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTxt}>No hay compras {filtro === 'pendiente' ? 'pendientes' : filtro === 'entregado' ? 'entregadas' : ''}.</Text>
          </View>
        ) : lista.map(c => (
          <View key={c.id} style={[s.card, c.estado === 'entregado' && s.cardEntregada]}>
            <View style={s.cardTop}>
              <Text style={s.itemIcono}>{c.item_icono}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemNombre}>{c.item_nombre}</Text>
                <Text style={s.userName}>👤 {c.user_nombre}</Text>
              </View>
              <View style={[s.estadoBadge, c.estado === 'entregado' ? s.badgeOk : s.badgePending]}>
                <Text style={s.estadoTxt}>{c.estado === 'entregado' ? '✅ Entregado' : '⏳ Pendiente'}</Text>
              </View>
            </View>

            <View style={s.cardMeta}>
              <Text style={s.metaTxt}>💰 {c.costo_coins.toLocaleString()} coins</Text>
              <Text style={s.metaTxt}>
                {new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {c.estado === 'entregado' && c.notas_admin ? (
              <Text style={s.notaAdmin} numberOfLines={2}>📝 {c.notas_admin}</Text>
            ) : null}

            {c.estado === 'pendiente' && (
              <TouchableOpacity style={s.btnAtender} onPress={() => abrirModal(c)}>
                <Text style={s.btnAtenderTxt}>Atender entrega</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Modal de atención */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.modalSheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {seleccionada && (
              <>
                <Text style={s.modalTitle}>Atender compra</Text>

                {/* Info compra */}
                <View style={s.modalInfo}>
                  <Text style={s.modalInfoIcono}>{seleccionada.item_icono}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalInfoNombre}>{seleccionada.item_nombre}</Text>
                    <Text style={s.modalInfoUser}>Usuario: {seleccionada.user_nombre}</Text>
                    {seleccionada.item_descripcion ? (
                      <Text style={s.modalInfoDesc}>{seleccionada.item_descripcion}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Si es tipo lead: registrar cliente */}
                {ES_LEAD(seleccionada.item_tipo) && (
                  <View style={s.seccion}>
                    <Text style={s.seccionTitle}>👤 Registrar lead al usuario</Text>
                    <Text style={s.seccionDesc}>
                      Al registrar el lead, el cliente aparecerá directamente en el CRM del prospectador y recibirá una notificación automática.
                    </Text>
                    <Text style={s.fieldLabel}>Nombre del lead *</Text>
                    <TextInput
                      style={s.input}
                      value={nombreLead}
                      onChangeText={setNombreLead}
                      placeholder="Nombre completo"
                      autoCapitalize="words"
                    />
                    <Text style={s.fieldLabel}>Teléfono *</Text>
                    <TextInput
                      style={s.input}
                      value={telLead}
                      onChangeText={setTelLead}
                      placeholder="442 000 0000"
                      keyboardType="phone-pad"
                    />
                    <TouchableOpacity
                      style={[s.btnRegistrarLead, enviando && { opacity: 0.6 }]}
                      onPress={registrarLead}
                      disabled={enviando}
                    >
                      {enviando
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.btnRegistrarLeadTxt}>✅ Registrar lead + notificar</Text>
                      }
                    </TouchableOpacity>
                    <View style={s.divisor}><Text style={s.divisorTxt}>— o envía un mensaje personalizado —</Text></View>
                  </View>
                )}

                {/* Enviar notificación */}
                <View style={s.seccion}>
                  <Text style={s.seccionTitle}>💬 Mensaje para el usuario</Text>
                  <TextInput
                    style={[s.input, { height: 100, textAlignVertical: 'top' }]}
                    value={mensaje}
                    onChangeText={setMensaje}
                    multiline
                    numberOfLines={4}
                    placeholder="Escribe el mensaje que verá el usuario en sus notificaciones..."
                  />
                  <TouchableOpacity
                    style={[s.btnEnviar, enviando && { opacity: 0.6 }]}
                    onPress={entregar}
                    disabled={enviando}
                  >
                    {enviando
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.btnEnviarTxt}>📤 Enviar y marcar como entregado</Text>
                    }
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}>
                  <Text style={s.btnCancelarTxt}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14,
  },
  btnArticulos:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  btnArticulosTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  filtroRow: { flexDirection: 'row', gap: 6, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e8eef0' },
  filtroBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  filtroBtnActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  filtroTxt: { fontSize: 12, fontWeight: '600', color: '#666' },
  filtroTxtActivo: { color: '#fff' },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { fontSize: 15, color: '#aaa' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e0eaec', padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardEntregada: { opacity: 0.75, borderColor: '#c8e6c9' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  itemIcono: { fontSize: 28 },
  itemNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  userName: { fontSize: 12, color: '#666', marginTop: 2 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgePending: { backgroundColor: '#fff3e0' },
  badgeOk:      { backgroundColor: '#e8f5e9' },
  estadoTxt: { fontSize: 11, fontWeight: '700' },

  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaTxt: { fontSize: 12, color: '#888' },
  notaAdmin: { fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 6 },

  btnAtender: {
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  btnAtenderTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 16 },

  modalInfo: {
    flexDirection: 'row', gap: 12, backgroundColor: '#f5f8f9',
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#dde8e9',
  },
  modalInfoIcono:  { fontSize: 32 },
  modalInfoNombre: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  modalInfoUser:   { fontSize: 12, color: '#1a6470', marginTop: 2 },
  modalInfoDesc:   { fontSize: 12, color: '#888', marginTop: 4 },

  seccion: { marginBottom: 16 },
  seccionTitle: { fontSize: 14, fontWeight: '800', color: '#1a1a2e', marginBottom: 6 },
  seccionDesc:  { fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 17 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 5, marginTop: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#f5f8f9', borderRadius: 10, borderWidth: 1, borderColor: '#dde8e9',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1a1a2e',
  },

  btnRegistrarLead: {
    backgroundColor: '#2e7d32', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 12,
  },
  btnRegistrarLeadTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  divisor: { alignItems: 'center', marginVertical: 16 },
  divisorTxt: { fontSize: 12, color: '#aaa' },

  btnEnviar: {
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  btnEnviarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  btnCancelar: { alignItems: 'center', paddingVertical: 14 },
  btnCancelarTxt: { color: '#aaa', fontSize: 14 },
})
