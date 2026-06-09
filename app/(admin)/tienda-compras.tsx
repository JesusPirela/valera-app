import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert, Platform,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors, AppColors } from '../../lib/ThemeContext'
import { useSupervisorBlock } from '../../hooks/useSupervisorBlock'

type UsuarioCofre = {
  id: string
  nombre: string
  cofres_pendientes: number
}

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
  es_ruleta: boolean
  es_milestone: boolean
  nombre_premio: string | null
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
  useSupervisorBlock()
  const c = useColors()
  const [compras, setCompras]       = useState<Compra[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtro, setFiltro]         = useState<'todas' | 'pendiente' | 'entregado' | 'rechazado' | 'cofre' | 'regalar'>('pendiente')

  // Modal de atención
  const [modal, setModal]           = useState(false)
  const [seleccionada, setSeleccionada] = useState<Compra | null>(null)
  const [mensaje, setMensaje]       = useState('')
  const [enviando, setEnviando]     = useState(false)

  // Mini-form de lead
  const [nombreLead, setNombreLead] = useState('')
  const [telLead, setTelLead]       = useState('')

  // Rechazo
  const [modalRechazo, setModalRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [compraRechazo, setCompraRechazo] = useState<Compra | null>(null)

  // Regalar cofres
  const [usuarios, setUsuarios]           = useState<UsuarioCofre[]>([])
  const [loadingUsers, setLoadingUsers]   = useState(false)
  const [busquedaUser, setBusquedaUser]   = useState('')
  const [modalRegalar, setModalRegalar]   = useState(false)
  const [usuarioRegalo, setUsuarioRegalo] = useState<UsuarioCofre | null>(null)
  const [cantRegalo, setCantRegalo]       = useState(1)
  const [notaRegalo, setNotaRegalo]       = useState('')
  const [regalando, setRegalando]         = useState(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_compras_tienda')
    if (error) {
      alerta('Error al cargar compras: ' + error.message)
      console.error('[Tienda]', error)
    }
    setCompras((data ?? []) as Compra[])
    setLoading(false)
  }

  function abrirModal(compraArg: Compra) {
    setSeleccionada(compraArg)
    const msgDefault = esCofre(compraArg)
      ? `¡Felicidades! Tu premio del cofre "${compraArg.nombre_premio ?? compraArg.item_nombre}" está siendo procesado. El equipo Valera te contactará pronto. 🎉`
      : (MENSAJES_DEFAULT[compraArg.item_tipo] ?? `Tu recompensa "${compraArg.item_nombre}" ha sido procesada. ¡Gracias por tu esfuerzo!`)
    setMensaje(msgDefault)
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

  function abrirRechazo(compraArg: Compra) {
    setCompraRechazo(compraArg)
    setMotivoRechazo('Lo sentimos, en este momento no podemos procesar tu solicitud. Tus Valera Coins han sido reintegrados.')
    setModalRechazo(true)
  }

  async function rechazar() {
    if (!compraRechazo) return
    if (!motivoRechazo.trim()) { alerta('Escribe el motivo del rechazo.'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('admin_rechazar_compra', {
      p_compra_id: compraRechazo.id,
      p_motivo:    motivoRechazo.trim(),
    })
    setEnviando(false)
    if (error) { alerta('Error: ' + error.message); return }
    setModalRechazo(false)
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

  async function cargarUsuarios() {
    setLoadingUsers(true)
    const { data: perfs } = await supabase
      .from('profiles').select('id, nombre').neq('role', 'admin').order('nombre')
    if (!perfs) { setLoadingUsers(false); return }
    const ids = perfs.map((u: any) => u.id)
    const { data: stats } = await supabase
      .from('user_stats').select('id, cofres_pendientes').in('id', ids)
    const statsMap = new Map((stats ?? []).map((s: any) => [s.id, s.cofres_pendientes ?? 0]))
    setUsuarios(perfs.map((u: any) => ({
      id: u.id,
      nombre: u.nombre ?? 'Sin nombre',
      cofres_pendientes: statsMap.get(u.id) ?? 0,
    })))
    setLoadingUsers(false)
  }

  async function regalarCofre() {
    if (!usuarioRegalo) return
    setRegalando(true)
    const nota = notaRegalo.trim() ||
      `El equipo Valera te regala ${cantRegalo} cofre${cantRegalo > 1 ? 's' : ''} misterioso${cantRegalo > 1 ? 's' : ''} 🎁`
    const { data, error } = await supabase.rpc('admin_regalar_cofre', {
      p_target_user_id: usuarioRegalo.id,
      p_cantidad:       cantRegalo,
      p_nota:           nota,
    })
    setRegalando(false)
    if (error || !data) { alerta('Error: ' + (error?.message ?? 'desconocido')); return }
    setUsuarios(prev => prev.map(u =>
      u.id === usuarioRegalo.id
        ? { ...u, cofres_pendientes: u.cofres_pendientes + cantRegalo }
        : u
    ))
    alerta(`✅ ${cantRegalo} cofre${cantRegalo > 1 ? 's regalados' : ' regalado'} a ${usuarioRegalo.nombre}`)
    setModalRegalar(false)
    setNotaRegalo('')
    setCantRegalo(1)
  }

  const esCofre = (comp: Compra) => comp.es_ruleta === true || comp.costo_coins === 0

  const lista = compras.filter(comp => {
    if (filtro === 'cofre')     return esCofre(comp)
    if (filtro === 'todas')     return !esCofre(comp)
    if (filtro === 'pendiente') return !esCofre(comp) && comp.estado === 'pendiente'
    if (filtro === 'entregado') return !esCofre(comp) && comp.estado === 'entregado'
    if (filtro === 'rechazado') return !esCofre(comp) && comp.estado === 'rechazado'
    return true
  })
  const pendientes      = compras.filter(comp => !esCofre(comp) && comp.estado === 'pendiente').length
  const cofrePendientes = compras.filter(comp =>  esCofre(comp) && comp.estado === 'pendiente').length
  const rechazadas      = compras.filter(comp => comp.estado === 'rechazado').length

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color="#1a6470" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filtroScroll, { backgroundColor: c.card, borderBottomColor: c.border }]} contentContainerStyle={s.filtroRow}>
        {([
          ['todas',     'Todas'],
          ['pendiente', `⏳ Pendientes${pendientes > 0 ? ` (${pendientes})` : ''}`],
          ['entregado', '✅ Entregadas'],
          ['rechazado', '❌ Rechazadas'],
          ['cofre',     `🎁 Cofre${cofrePendientes > 0 ? ` (${cofrePendientes})` : ''}`],
          ['regalar',   '🎀 Regalar'],
        ] as const).map(([val, lbl]) => (
          <TouchableOpacity
            key={val}
            style={[s.filtroBtn, filtro === val && s.filtroBtnActivo]}
            onPress={() => {
              setFiltro(val)
              if (val === 'regalar' && usuarios.length === 0) cargarUsuarios()
            }}
          >
            <Text style={[s.filtroTxt, { color: c.textSub }, filtro === val && s.filtroTxtActivo]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtro === 'regalar' ? (
        // ── Tab Regalar ─────────────────────────────────────────────
        <View style={{ flex: 1 }}>
          <View style={s.regalarHeader}>
            <Text style={[s.regalarHeaderTxt, { color: c.text }]}>Regalar cofres a usuarios</Text>
            <Text style={[s.regalarHeaderSub, { color: c.textSub }]}>Selecciona un usuario para regalarle cofres gratis</Text>
          </View>
          <View style={[s.regalarSearchRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 16, marginRight: 6 }}>🔍</Text>
            <TextInput
              style={[s.regalarSearch, { color: c.text }]}
              placeholder="Buscar usuario..."
              placeholderTextColor={c.textMute}
              value={busquedaUser}
              onChangeText={setBusquedaUser}
            />
          </View>
          {loadingUsers
            ? <ActivityIndicator style={{ marginTop: 40 }} color="#1a6470" />
            : (
              <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
                {usuarios
                  .filter(u => !busquedaUser || u.nombre.toLowerCase().includes(busquedaUser.toLowerCase()))
                  .map(u => (
                    <TouchableOpacity
                      key={u.id}
                      style={[s.userCard, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => { setUsuarioRegalo(u); setCantRegalo(1); setNotaRegalo(''); setModalRegalar(true) }}
                    >
                      <View style={s.userCardLeft}>
                        <View style={s.userAvatar}>
                          <Text style={{ fontSize: 20 }}>👤</Text>
                        </View>
                        <View>
                          <Text style={[s.userNombre, { color: c.text }]}>{u.nombre}</Text>
                          {u.cofres_pendientes > 0 && (
                            <Text style={s.userCofres}>🎁 {u.cofres_pendientes} cofre{u.cofres_pendientes > 1 ? 's' : ''} pendiente{u.cofres_pendientes > 1 ? 's' : ''}</Text>
                          )}
                        </View>
                      </View>
                      <View style={s.regalarBtn}>
                        <Text style={s.regalarBtnTxt}>🎁 Regalar</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                {usuarios.filter(u => !busquedaUser || u.nombre.toLowerCase().includes(busquedaUser.toLowerCase())).length === 0 && (
                  <View style={s.emptyBox}>
                    <Text style={s.emptyTxt}>No se encontraron usuarios.</Text>
                  </View>
                )}
              </ScrollView>
            )
          }
        </View>
      ) : (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {lista.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTxt}>No hay compras {filtro === 'pendiente' ? 'pendientes' : filtro === 'entregado' ? 'entregadas' : ''}.</Text>
          </View>
        ) : lista.map(compra => {
          const esCofr = esCofre(compra)
          const nombre = esCofr ? (compra.nombre_premio ?? compra.item_nombre ?? 'Premio cofre') : compra.item_nombre
          const icono  = esCofr ? (compra.es_milestone ? '🏆' : '🎁') : compra.item_icono
          return (
          <View key={compra.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }, compra.estado === 'entregado' && s.cardEntregada]}>
            <View style={s.cardTop}>
              <Text style={s.itemIcono}>{icono}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[s.itemNombre, { color: c.text }]}>{nombre}</Text>
                  {esCofr && (
                    <View style={{ backgroundColor: '#1a1500', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#c9a84c66' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#c9a84c', letterSpacing: 1 }}>{compra.es_milestone ? 'NIVEL' : 'COFRE'}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.userName, { color: c.textSub }]}>👤 {compra.user_nombre}</Text>
              </View>
              <View style={[s.estadoBadge, compra.estado === 'entregado' ? s.badgeOk : compra.estado === 'rechazado' ? s.badgeRechazado : s.badgePending]}>
                <Text style={s.estadoTxt}>
                  {compra.estado === 'entregado' ? '✅ Entregado' : compra.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente'}
                </Text>
              </View>
            </View>

            <View style={s.cardMeta}>
              <Text style={[s.metaTxt, { color: c.textMute }]}>{esCofr ? '🎁 Premio de cofre' : `💰 ${compra.costo_coins.toLocaleString()} coins`}</Text>
              <Text style={[s.metaTxt, { color: c.textMute }]}>
                {new Date(compra.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {compra.estado === 'entregado' && compra.notas_admin ? (
              <Text style={[s.notaAdmin, { color: c.textSub }]} numberOfLines={2}>📝 {compra.notas_admin}</Text>
            ) : null}

            {compra.estado === 'pendiente' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[s.btnAtender, { flex: 1 }]} onPress={() => abrirModal(compra)}>
                  <Text style={s.btnAtenderTxt}>✅ Atender</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnAtender, s.btnRechazar]} onPress={() => abrirRechazo(compra)}>
                  <Text style={s.btnAtenderTxt}>❌ Rechazar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          )
        })}
      </ScrollView>
      )}

      {/* Modal Regalar cofre */}
      <Modal visible={modalRegalar} animationType="slide" transparent onRequestClose={() => setModalRegalar(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, paddingBottom: 40 }]}>
            <Text style={[s.modalTitle, { color: '#2e7d32' }]}>🎁 Regalar cofres</Text>
            {usuarioRegalo && (
              <View style={[s.modalInfo, { marginBottom: 16 }]}>
                <Text style={s.modalInfoIcono}>👤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalInfoNombre, { color: c.text }]}>{usuarioRegalo.nombre}</Text>
                  <Text style={s.modalInfoUser}>
                    Cofres pendientes actuales: {usuarioRegalo.cofres_pendientes}
                  </Text>
                </View>
              </View>
            )}

            <Text style={[s.seccionTitle, { color: c.text }]}>Cantidad de cofres</Text>
            <View style={s.cantRow}>
              {[1, 2, 3, 5, 10].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.cantBtn, cantRegalo === n && s.cantBtnActivo]}
                  onPress={() => setCantRegalo(n)}
                >
                  <Text style={[s.cantBtnTxt, cantRegalo === n && s.cantBtnTxtActivo]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: c.textSub, marginTop: 12 }]}>Mensaje (opcional)</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText, height: 80, textAlignVertical: 'top' }]}
              value={notaRegalo}
              onChangeText={setNotaRegalo}
              multiline
              placeholder="Ej: ¡Premio por tu excelente desempeño este mes! 🏆"
              placeholderTextColor={c.textMute}
            />

            <TouchableOpacity
              style={[s.btnEnviar, { backgroundColor: '#2e7d32', marginTop: 16 }, regalando && { opacity: 0.6 }]}
              onPress={regalarCofre}
              disabled={regalando}
            >
              {regalando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnEnviarTxt}>🎁 Regalar {cantRegalo} cofre{cantRegalo > 1 ? 's' : ''}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalRegalar(false)}>
              <Text style={s.btnCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de atención */}
      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={[s.modalSheet, { backgroundColor: c.card }]} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {seleccionada && (
              <>
                <Text style={s.modalTitle}>Atender compra</Text>

                {/* Info compra */}
                <View style={s.modalInfo}>
                  <Text style={s.modalInfoIcono}>{esCofre(seleccionada) ? (seleccionada.es_milestone ? '🏆' : '🎁') : seleccionada.item_icono}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalInfoNombre, { color: c.text }]}>{esCofre(seleccionada) ? (seleccionada.nombre_premio ?? seleccionada.item_nombre) : seleccionada.item_nombre}</Text>
                    <Text style={s.modalInfoUser}>Usuario: {seleccionada.user_nombre}</Text>
                    {!esCofre(seleccionada) && seleccionada.item_descripcion ? (
                      <Text style={s.modalInfoDesc}>{seleccionada.item_descripcion}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Si es tipo lead: registrar cliente */}
                {ES_LEAD(seleccionada.item_tipo) && (
                  <View style={s.seccion}>
                    <Text style={[s.seccionTitle, { color: c.text }]}>👤 Registrar lead al usuario</Text>
                    <Text style={s.seccionDesc}>
                      Al registrar el lead, el cliente aparecerá directamente en el CRM del prospectador y recibirá una notificación automática.
                    </Text>
                    <Text style={[s.fieldLabel, { color: c.textSub }]}>Nombre del lead *</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                      value={nombreLead}
                      onChangeText={setNombreLead}
                      placeholder="Nombre completo"
                      autoCapitalize="words"
                    />
                    <Text style={[s.fieldLabel, { color: c.textSub }]}>Teléfono *</Text>
                    <TextInput
                      style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
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
                  <Text style={[s.seccionTitle, { color: c.text }]}>💬 Mensaje para el usuario</Text>
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

      {/* Modal de rechazo */}
      <Modal visible={modalRechazo} animationType="slide" transparent onRequestClose={() => setModalRechazo(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: 40, backgroundColor: c.card }]}>
            <Text style={[s.modalTitle, { color: '#c0392b' }]}>❌ Rechazar compra</Text>
            {compraRechazo && (
              <View style={s.modalInfo}>
                <Text style={s.modalInfoIcono}>{compraRechazo.item_icono}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalInfoNombre, { color: c.text }]}>{compraRechazo.item_nombre}</Text>
                  <Text style={s.modalInfoUser}>👤 {compraRechazo.user_nombre} · 💰 {compraRechazo.costo_coins} coins</Text>
                </View>
              </View>
            )}
            <Text style={[s.seccionTitle, { color: c.text }]}>Motivo del rechazo</Text>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              Los Valera Coins serán devueltos automáticamente al usuario.
            </Text>
            <TextInput
              style={[s.input, { height: 90, textAlignVertical: 'top' }]}
              value={motivoRechazo}
              onChangeText={setMotivoRechazo}
              multiline
              numberOfLines={3}
              placeholder="Explica el motivo del rechazo..."
            />
            <TouchableOpacity
              style={[s.btnEnviar, { backgroundColor: '#c0392b', marginTop: 12 }, enviando && { opacity: 0.6 }]}
              onPress={rechazar}
              disabled={enviando}
            >
              {enviando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnEnviarTxt}>❌ Rechazar y devolver coins</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancelar} onPress={() => setModalRechazo(false)}>
              <Text style={s.btnCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
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

  filtroScroll: { flexGrow: 0, borderBottomWidth: 1 },
  filtroRow:    { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  filtroBtn:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  filtroBtnActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  filtroTxt:       { fontSize: 12, fontWeight: '600' },
  filtroTxtActivo: { color: '#fff' },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { fontSize: 15, color: '#aaa' },

  card: {
    borderRadius: 14, marginBottom: 10,
    borderWidth: 1, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardEntregada: { opacity: 0.75, borderColor: '#c8e6c9' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  itemIcono: { fontSize: 28 },
  itemNombre: { fontSize: 15, fontWeight: '700' },
  userName: { fontSize: 12, marginTop: 2 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgePending:   { backgroundColor: '#fff3e0' },
  badgeOk:        { backgroundColor: '#e8f5e9' },
  badgeRechazado: { backgroundColor: '#fdecea' },
  estadoTxt: { fontSize: 11, fontWeight: '700' },

  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaTxt: { fontSize: 12 },
  notaAdmin: { fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
  ruletaBadge: { backgroundColor: '#fff8e1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#c9a84c66' },
  ruletaBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#c9a84c', letterSpacing: 0.5 },

  btnAtender: {
    backgroundColor: '#1a6470', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  btnRechazar:   { backgroundColor: '#c0392b' },
  btnAtenderTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a6470', marginBottom: 16 },

  modalInfo: {
    flexDirection: 'row', gap: 12, backgroundColor: '#f5f8f9',
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#dde8e9',
  },
  modalInfoIcono:  { fontSize: 32 },
  modalInfoNombre: { fontSize: 15, fontWeight: '700' },
  modalInfoUser:   { fontSize: 12, color: '#1a6470', marginTop: 2 },
  modalInfoDesc:   { fontSize: 12, color: '#888', marginTop: 4 },

  seccion: { marginBottom: 16 },
  seccionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  seccionDesc:  { fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 17 },

  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 5, marginTop: 8, textTransform: 'uppercase' as const },
  input: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
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

  // Regalar
  regalarHeader: { padding: 16, paddingBottom: 4 },
  regalarHeaderTxt: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  regalarHeaderSub: { fontSize: 12 },
  regalarSearchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 4, marginTop: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  regalarSearch: { flex: 1, fontSize: 14 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, marginBottom: 8, padding: 14, borderWidth: 1,
  },
  userCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  userAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#e8f4f8', alignItems: 'center', justifyContent: 'center',
  },
  userNombre: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  userCofres: { fontSize: 11, color: '#2e7d32', fontWeight: '600' },
  regalarBtn: {
    backgroundColor: '#2e7d32', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  regalarBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

  cantRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cantBtn: {
    width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ddd',
  },
  cantBtnActivo: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  cantBtnTxt: { fontSize: 16, fontWeight: '700', color: '#555' },
  cantBtnTxtActivo: { color: '#fff' },
})
