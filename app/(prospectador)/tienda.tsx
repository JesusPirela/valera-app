import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { comprarItem, getCoinsDisplay, registrarPremioRuleta, calcularNivel } from '../../lib/gamification'
import { RuletaModal, checkMilestone, CONFIG_DEFAULT, type Premio, type RuletaConfig } from '../../components/RuletaModal'

type StoreItem = {
  id: string
  nombre: string
  descripcion: string
  costo_coins: number
  tipo: string
  disponible: boolean
  stock: number | null
  icono: string
  orden: number
}

type Compra = {
  id: string
  created_at: string
  costo_coins: number
  estado: string
  notas_admin: string | null
  es_ruleta: boolean
  es_milestone: boolean
  nombre_premio: string | null
  store_items: { nombre: string; icono: string } | null
}

// Detecta premios del cofre: columna dedicada O costo 0 (items regulares cuestan ≥1)
function esCofre(c: Compra): boolean {
  return c.es_ruleta === true || c.costo_coins === 0
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Tienda', msg)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icono: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#c9a84c', bg: '#1a1500', icono: '⏳' },
  entregado:  { label: 'Entregado',  color: '#2ecc71', bg: '#0d2018', icono: '✅' },
  rechazado:  { label: 'Rechazado',  color: '#e74c3c', bg: '#1f0a0a', icono: '❌' },
}

export default function Tienda() {
  const [userId, setUserId]       = useState<string | null>(null)
  const [coins, setCoins]         = useState(0)
  const [items, setItems]         = useState<StoreItem[]>([])
  const [compras, setCompras]     = useState<Compra[]>([])
  const [tab, setTab]             = useState<'tienda' | 'historial' | 'cofre'>('tienda')
  const [loading, setLoading]     = useState(true)
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [comprando, setComprando]       = useState<string | null>(null)
  const [showRuleta, setShowRuleta]           = useState(false)
  const [ruletaMilestone, setRuletaMilestone] = useState(false)
  const [milestoneNivel, setMilestoneNivel]   = useState<number | undefined>()
  const [ruletaCfg, setRuletaCfg]             = useState<RuletaConfig>(CONFIG_DEFAULT)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [statsRes, itemsRes, comprasRes, cfgRes] = await Promise.all([
      supabase.from('user_stats').select('valera_coins, xp').eq('id', user.id).maybeSingle(),
      supabase.from('store_items').select('*').eq('disponible', true).order('orden'),
      supabase.from('store_compras')
        .select('id, created_at, costo_coins, estado, notas_admin, es_ruleta, es_milestone, nombre_premio, store_items(nombre, icono)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('app_config').select('value').eq('key', 'ruleta_config').maybeSingle(),
    ])

    // Cargar config de ruleta desde Supabase
    if (cfgRes.data?.value) {
      try { setRuletaCfg(JSON.parse(cfgRes.data.value)) } catch {}
    }

    const xp    = (statsRes.data as any)?.xp ?? 0
    const nivel = calcularNivel(xp)
    setCoins(statsRes.data?.valera_coins ?? 0)
    setItems((itemsRes.data ?? []) as StoreItem[])
    setCompras((comprasRes.data ?? []) as Compra[])
    setLoading(false)

    // Verificar si hay un milestone de nivel pendiente (cada 10 niveles)
    const milestone = await checkMilestone(nivel)
    if (milestone) {
      setMilestoneNivel(milestone)
      setRuletaMilestone(true)
      setShowRuleta(true)
    }
  }

  async function handleCompra(item: StoreItem) {
    if (!userId) return
    if (coins < item.costo_coins) {
      alerta(`Necesitas ${item.costo_coins} Valera Coins. Tienes ${coins}.`)
      return
    }
    setComprando(item.id)
    const { ok, error } = await comprarItem(userId, item.id, item.nombre, item.costo_coins)
    setComprando(null)

    if (ok) {
      setCoins(prev => prev - item.costo_coins)
      alerta(`¡Compraste "${item.nombre}"! 🎉\nEl equipo de Valera te contactará para entregar tu recompensa.`)
      cargar()
    } else {
      alerta(error ?? 'Error al procesar la compra')
    }
  }

  // Solo abre el modal — las monedas se descuentan cuando el usuario toca "ABRIR COFRE"
  function abrirCofre() {
    setRuletaMilestone(false)
    setMilestoneNivel(undefined)
    setShowRuleta(true)
  }

  // Llamado por el modal cuando el usuario confirma abrir (toca el botón interno)
  async function onConfirmarAbrir(): Promise<boolean> {
    const costo = ruletaCfg.costo
    if (coins < costo) {
      alerta(`Necesitas ${costo} Valera Coins para abrir el cofre. Tienes ${coins}.`)
      return false
    }
    const { error } = await supabase.rpc('gastar_coins', {
      p_user_id: userId,
      p_cantidad: costo,
      p_concepto: 'Cofre ruleta 🎰',
    })
    if (error) { alerta('Error al abrir el cofre'); return false }
    setCoins(prev => prev - costo)
    return true
  }

  async function onGanarPremio(premio: Premio) {
    const result = await registrarPremioRuleta(premio.tipo, premio.nombre, 0, ruletaMilestone)
    if (!result.ok) {
      alerta(`No se pudo registrar tu premio "${premio.nombre}". Captura pantalla y contacta al equipo.\n\nError: ${result.error ?? 'desconocido'}`)
    }
    // Refrescar compras en silencio (sin loading que desmonta el modal)
    if (userId) {
      const { data } = await supabase
        .from('store_compras')
        .select('id, created_at, costo_coins, estado, notas_admin, es_ruleta, es_milestone, nombre_premio, store_items(nombre, icono)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      setCompras((data ?? []) as Compra[])
    }
  }

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: DARK }}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Tienda Valera</Text>
          <Text style={s.headerSub}>Convierte tu productividad en recompensas</Text>
        </View>
        <View style={s.coinsBadge}>
          <Text style={s.coinsIcn}>💰</Text>
          <Text style={s.coinsVal}>{coins.toLocaleString()}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'tienda' && s.tabBtnActive]}
          onPress={() => setTab('tienda')}
        >
          <Text style={[s.tabTxt, tab === 'tienda' && s.tabTxtActive]}>🛒 Artículos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'historial' && s.tabBtnActive]}
          onPress={() => setTab('historial')}
        >
          <Text style={[s.tabTxt, tab === 'historial' && s.tabTxtActive]}>
            📋 Mis Compras
            {compras.filter(c => !esCofre(c) && c.estado === 'pendiente').length > 0 && (
              <Text style={s.tabBadge}> {compras.filter(c => !esCofre(c) && c.estado === 'pendiente').length}</Text>
            )}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'cofre' && s.tabBtnActive]}
          onPress={() => setTab('cofre')}
        >
          <Text style={[s.tabTxt, tab === 'cofre' && s.tabTxtActive]}>
            🎁 Cofre
            {compras.filter(c => esCofre(c) && c.estado === 'pendiente').length > 0 && (
              <Text style={s.tabBadge}> {compras.filter(c => esCofre(c) && c.estado === 'pendiente').length}</Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'tienda' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          <Text style={s.hint}>
            💡 Tras comprar, el equipo de Valera te contactará para entregar tu recompensa.
          </Text>

          {/* Cofre / Ruleta */}
          <TouchableOpacity
            style={[s.cofreCard, coins < ruletaCfg.costo && s.cofreCardDis]}
            onPress={abrirCofre}
            disabled={coins < ruletaCfg.costo}
          >
            <View style={s.cofreLeft}>
              <Text style={s.cofreIcn}>🎁</Text>
              <View>
                <Text style={s.cofreNombre}>Cofre Misterioso</Text>
                <Text style={s.cofreSub}>Abre el cofre y gana una recompensa sorpresa</Text>
              </View>
            </View>
            <View style={s.cofreCosto}>
              <Text style={s.cofreCostoNum}>{ruletaCfg.costo}</Text>
              <Text style={s.cofreCostoIcn}>💰</Text>
            </View>
          </TouchableOpacity>

          {/* Items */}
          <View style={s.grid}>
            {items.map(item => {
              const puedePagar = coins >= item.costo_coins
              const cargando   = comprando === item.id
              return (
                <View key={item.id} style={s.card}>
                  <View style={s.cardIconWrap}>
                    <Text style={s.cardIcon}>{item.icono}</Text>
                  </View>
                  <Text style={s.cardNombre}>{item.nombre}</Text>
                  <Text style={s.cardDesc} numberOfLines={2}>{item.descripcion}</Text>
                  <View style={s.cardBottom}>
                    <View style={s.costBadge}>
                      <Text style={s.costTxt}>{item.costo_coins.toLocaleString()} 💰</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.buyBtn, !puedePagar && s.buyBtnDisabled]}
                      onPress={() => handleCompra(item)}
                      disabled={!puedePagar || !!comprando}
                    >
                      {cargando
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.buyBtnTxt}>{puedePagar ? 'Canjear' : 'Sin saldo'}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}
          </View>

          {/* Cómo ganar coins */}
          <View style={s.howCard}>
            <Text style={s.howTitle}>¿Cómo ganar Valera Coins?</Text>
            {getCoinsDisplay().map(({ icono, label, coins: c }) => (
              <View key={label} style={s.howRow}>
                <Text style={s.howIcn}>{icono}</Text>
                <Text style={s.howTxt}>{label}</Text>
                <Text style={s.howVal}>+{c} coins</Text>
              </View>
            ))}
            <View style={s.howRow}>
              <Text style={s.howIcn}>🔥</Text>
              <Text style={s.howTxt}>Acceso diario</Text>
              <Text style={s.howVal}>+5 coins</Text>
            </View>
            <View style={s.howRow}>
              <Text style={s.howIcn}>🎯</Text>
              <Text style={s.howTxt}>Completar misión</Text>
              <Text style={s.howVal}>bonus coins</Text>
            </View>
          </View>

        </ScrollView>
      ) : tab === 'historial' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {compras.filter(c => !esCofre(c)).length === 0 ? (
            <View style={s.emptyHistorial}>
              <Text style={s.emptyIcn}>🛍️</Text>
              <Text style={s.emptyTxt}>Aún no has realizado compras</Text>
              <Text style={s.emptySub}>Tus pedidos aparecerán aquí una vez que canjees tus Valera Coins</Text>
            </View>
          ) : (
            compras.filter(c => !esCofre(c)).map(c => {
              const cfg    = ESTADO_CONFIG[c.estado] ?? ESTADO_CONFIG.pendiente
              const item   = c.store_items
              const nombre = item?.nombre ?? 'Artículo'
              const icono  = item?.icono ?? '🎁'
              return (
                <View key={c.id} style={[s.compraCard, { borderColor: cfg.color + '44' }]}>
                  <View style={s.compraTop}>
                    <View style={[s.compraIconWrap, { backgroundColor: cfg.bg }]}>
                      <Text style={s.compraIconTxt}>{icono}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.compraNombre}>{nombre}</Text>
                      <Text style={s.compraFecha}>{formatFecha(c.created_at)}</Text>
                    </View>
                    <View style={[s.estadoBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '66' }]}>
                      <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.icono} {cfg.label}</Text>
                    </View>
                  </View>

                  <View style={s.compraBot}>
                    <Text style={s.compraCosto}>
                      {c.costo_coins > 0 ? `💰 ${c.costo_coins.toLocaleString()} coins` : '🎁 Premio gratis'}
                    </Text>
                  </View>

                  {(c.estado === 'entregado' || c.estado === 'rechazado') && c.notas_admin ? (
                    <View style={[s.notaAdmin, { borderColor: cfg.color + '33' }]}>
                      <Text style={s.notaAdminLbl}>📝 Mensaje del equipo:</Text>
                      <Text style={s.notaAdminTxt}>{c.notas_admin}</Text>
                    </View>
                  ) : c.estado === 'pendiente' ? (
                    <Text style={s.pendienteTxt}>
                      El equipo de Valera procesará tu solicitud pronto.
                    </Text>
                  ) : null}
                </View>
              )
            })
          )}

        </ScrollView>
      ) : (
        // ── Tab Cofre ──────────────────────────────────────────────
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {compras.filter(c => esCofre(c)).length === 0 ? (
            <View style={s.emptyHistorial}>
              <Text style={s.emptyIcn}>🎁</Text>
              <Text style={s.emptyTxt}>Sin premios del cofre aún</Text>
              <Text style={s.emptySub}>Abre un cofre desde la tienda para ganar recompensas</Text>
            </View>
          ) : (
            compras.filter(c => esCofre(c)).map(c => {
              const cfg    = ESTADO_CONFIG[c.estado] ?? ESTADO_CONFIG.pendiente
              const nombre = c.nombre_premio ?? (c.store_items?.nombre ?? 'Premio cofre')
              const icono  = c.es_milestone ? '🏆' : '🎁'
              return (
                <View key={c.id} style={[s.compraCard, { borderColor: cfg.color + '44' }]}>
                  <View style={s.compraTop}>
                    <View style={[s.compraIconWrap, { backgroundColor: cfg.bg }]}>
                      <Text style={s.compraIconTxt}>{icono}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={s.compraNombre}>{nombre}</Text>
                        <View style={s.ruletaBadge}>
                          <Text style={s.ruletaBadgeTxt}>{c.es_milestone ? 'NIVEL' : 'COFRE'}</Text>
                        </View>
                      </View>
                      <Text style={s.compraFecha}>{formatFecha(c.created_at)}</Text>
                    </View>
                    <View style={[s.estadoBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '66' }]}>
                      <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.icono} {cfg.label}</Text>
                    </View>
                  </View>
                  <View style={s.compraBot}>
                    <Text style={s.compraCosto}>
                      {c.costo_coins > 0 ? `💰 ${c.costo_coins.toLocaleString()} coins` : '🎁 Premio gratis'}
                    </Text>
                  </View>
                  {(c.estado === 'entregado' || c.estado === 'rechazado') && c.notas_admin ? (
                    <View style={[s.notaAdmin, { borderColor: cfg.color + '33' }]}>
                      <Text style={s.notaAdminLbl}>📝 Mensaje del equipo:</Text>
                      <Text style={s.notaAdminTxt}>{c.notas_admin}</Text>
                    </View>
                  ) : c.estado === 'pendiente' ? (
                    <Text style={s.pendienteTxt}>El equipo de Valera procesará tu recompensa pronto.</Text>
                  ) : null}
                </View>
              )
            })
          )}
        </ScrollView>
      )}
      <RuletaModal
        visible={showRuleta}
        esMilestone={ruletaMilestone}
        nivel={milestoneNivel}
        premios={ruletaCfg.premios}
        costoGirar={ruletaCfg.costo}
        puedePagar={coins >= ruletaCfg.costo}
        onConfirmarAbrir={onConfirmarAbrir}
        onClose={() => setShowRuleta(false)}
        onGanar={onGanarPremio}
        onGirarOtraVez={ruletaMilestone ? undefined : () => {}}
      />
    </View>
  )
}

const DARK = '#0d1b2a'
const CARD = '#111f2e'
const GOLD = '#c9a84c'

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, backgroundColor: '#122030',
    borderBottomWidth: 1, borderBottomColor: '#1e3448',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#7a9ab5', marginTop: 2 },
  coinsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1a1500', borderRadius: 20, borderWidth: 1, borderColor: GOLD,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  coinsIcn: { fontSize: 18 },
  coinsVal: { fontSize: 16, fontWeight: '800', color: GOLD },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#0d1b2a',
    borderBottomWidth: 1, borderBottomColor: '#1e3448',
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: GOLD },
  tabTxt:       { fontSize: 13, fontWeight: '600', color: '#556a7a' },
  tabTxtActive: { color: GOLD },
  tabBadge:     { color: '#e74c3c', fontWeight: '800' },

  hint: { fontSize: 12, color: '#556a7a', paddingHorizontal: 16, paddingVertical: 10, lineHeight: 18 },

  cofreCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 12, marginBottom: 4, padding: 16,
    backgroundColor: '#1a1500', borderRadius: 16,
    borderWidth: 1.5, borderColor: GOLD,
  },
  cofreCardDis: { opacity: 0.5 },
  cofreLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cofreIcn:   { fontSize: 32 },
  cofreNombre:{ fontSize: 15, fontWeight: '800', color: GOLD },
  cofreSub:   { fontSize: 11, color: '#7a9ab5', marginTop: 2 },
  cofreCosto: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0d1b2a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  cofreCostoNum: { fontSize: 16, fontWeight: '900', color: GOLD },
  cofreCostoIcn: { fontSize: 16 },

  grid: { padding: 12, gap: 12 },
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e3448',
  },
  cardIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1500',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  cardIcon:   { fontSize: 26 },
  cardNombre: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 4 },
  cardDesc:   { fontSize: 12, color: '#7a9ab5', lineHeight: 17, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  costBadge:  { backgroundColor: '#1a1500', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  costTxt:    { color: GOLD, fontSize: 13, fontWeight: '700' },
  buyBtn: {
    backgroundColor: GOLD, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  buyBtnDisabled: { backgroundColor: '#2a3a4a', opacity: 0.7 },
  buyBtnTxt: { color: '#1a1000', fontWeight: '800', fontSize: 13 },

  howCard: {
    backgroundColor: CARD, borderRadius: 16, margin: 16,
    padding: 16, borderWidth: 1, borderColor: '#1e3448',
  },
  howTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 12 },
  howRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#1a2d3e' },
  howIcn: { fontSize: 18, width: 28 },
  howTxt: { flex: 1, fontSize: 13, color: '#c0d0dc' },
  howVal: { fontSize: 13, fontWeight: '700', color: GOLD },

  // Historial
  emptyHistorial: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcn:  { fontSize: 48 },
  emptyTxt:  { fontSize: 16, fontWeight: '700', color: '#c0d0dc' },
  emptySub:  { fontSize: 13, color: '#556a7a', textAlign: 'center', lineHeight: 19 },

  compraCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 12,
  },
  compraTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  compraIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  compraIconTxt: { fontSize: 22 },
  compraNombre:  { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  compraFecha:   { fontSize: 11, color: '#556a7a' },

  estadoBadge: {
    borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  estadoTxt: { fontSize: 11, fontWeight: '700' },

  compraBot: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  compraCosto: { fontSize: 13, color: GOLD, fontWeight: '700' },

  notaAdmin: {
    backgroundColor: '#0d1b2a', borderRadius: 10, padding: 10,
    borderWidth: 1, marginTop: 4,
  },
  notaAdminLbl: { fontSize: 11, color: '#7a9ab5', fontWeight: '700', marginBottom: 4 },
  notaAdminTxt: { fontSize: 13, color: '#c0d0dc', lineHeight: 18 },

  pendienteTxt: { fontSize: 11, color: '#556a7a', fontStyle: 'italic', marginTop: 4 },

  ruletaBadge: {
    backgroundColor: '#1a1500', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: GOLD + '66',
  },
  ruletaBadgeTxt: { fontSize: 9, fontWeight: '800', color: GOLD, letterSpacing: 1 },
})
