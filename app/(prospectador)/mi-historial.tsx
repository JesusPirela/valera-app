import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { calcularNivel, tituloPorNivel } from '../../lib/gamification'

type Historial = {
  nombre: string
  xp: number
  valera_coins: number
  streak_dias: number
  total_propiedades: number
  total_publicaciones: number
  total_clientes: number
  total_cursos: number
  total_seguimientos: number
  total_ventas: number
  total_interacciones: number
  created_at: string
  horas_conectado: number
  coins_ganados: number
  coins_gastados: number
}

type XpTx = {
  id: string
  cantidad: number
  concepto: string
  created_at: string
}

const DARK = '#0d1b2a'
const CARD = '#111f2e'
const MID  = '#1e3448'
const GOLD = '#c9a84c'
const TEAL = '#1a6470'

function StatRow({ icono, label, valor, sub, onPress }: { icono: string; label: string; valor: string | number; sub?: string; onPress?: () => void }) {
  const contenido = (
    <View style={s.statRow}>
      <Text style={s.statIcn}>{icono}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.statLbl}>{label}</Text>
        {sub ? <Text style={s.statSub}>{sub}</Text> : null}
      </View>
      <Text style={s.statVal}>{valor}</Text>
      {onPress ? <Text style={s.statChevron}>›</Text> : null}
    </View>
  )
  return onPress
    ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{contenido}</TouchableOpacity>
    : contenido
}

function SeccionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitulo}>{titulo}</Text>
      {children}
    </View>
  )
}

function formatHoras(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function diasDesde(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86400000)
}

export default function MiHistorial() {
  const [data, setData]       = useState<Historial | null>(null)
  const [xpTxs, setXpTxs]    = useState<XpTx[]>([])
  const [loading, setLoading] = useState(true)
  const yaCargoRef = useRef(false)

  useFocusEffect(useCallback(() => { cargar() }, []))

  async function cargar() {
    if (!yaCargoRef.current) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [perfil, stats, minConexion, txs, propiedades, publicaciones, clientes, seguimientos, interacciones, cursos, xpTxsRes] = await Promise.all([
      supabase.from('profiles').select('nombre, created_at').eq('id', user.id).maybeSingle(),
      supabase.from('user_stats').select('xp, valera_coins, streak_dias, total_ventas').eq('id', user.id).maybeSingle(),
      // Total de minutos conectado con intervalos fusionados (mismo cálculo que el resto de la app)
      supabase.rpc('get_total_minutos_conexion'),
      supabase.from('coin_transactions').select('cantidad').eq('user_id', user.id),
      // Propiedades únicas publicadas (UNIQUE constraint = una fila por propiedad)
      supabase.from('propiedad_publicacion').select('propiedad_id', { count: 'exact', head: true }).eq('user_id', user.id),
      // Publicaciones totales (una fila por evento, incluyendo re-publicaciones)
      supabase.from('publicacion_log').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('responsable_id', user.id),
      supabase.from('recordatorios').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('completado', true),
      supabase.from('interacciones').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('vu_certificados').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      // Últimas 30 transacciones de XP
      supabase.from('xp_transactions').select('id, cantidad, concepto, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ])

    const coinsG = (txs.data ?? []).filter((t: any) => t.cantidad > 0).reduce((a: number, t: any) => a + t.cantidad, 0)
    const coinsE = (txs.data ?? []).filter((t: any) => t.cantidad < 0).reduce((a: number, t: any) => a + Math.abs(t.cantidad), 0)

    setData({
      nombre:              perfil.data?.nombre ?? '',
      xp:                  stats.data?.xp ?? 0,
      valera_coins:        stats.data?.valera_coins ?? 0,
      streak_dias:         stats.data?.streak_dias ?? 0,
      total_propiedades:   propiedades.count  ?? 0,
      total_publicaciones: publicaciones.count ?? 0,
      total_clientes:      clientes.count     ?? 0,
      total_cursos:        cursos.count       ?? 0,
      total_seguimientos:  seguimientos.count ?? 0,
      total_ventas:        stats.data?.total_ventas ?? 0,
      total_interacciones: interacciones.count ?? 0,
      created_at:          perfil.data?.created_at ?? new Date().toISOString(),
      horas_conectado:     (minConexion.data as number | null) ?? 0,
      coins_ganados:       coinsG,
      coins_gastados:      coinsE,
    })
    setXpTxs((xpTxsRes.data ?? []) as XpTx[])
    yaCargoRef.current = true
    setLoading(false)
  }

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: DARK, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={GOLD} />
    </View>
  )

  if (!data) return null

  const nivel  = calcularNivel(data.xp)
  const titulo = tituloPorNivel(nivel)
  const diasRegistrado = diasDesde(data.created_at)

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>

      {/* Hero */}
      <View style={s.hero}>
        <View style={s.nivelCircle}>
          <Text style={s.nivelNum}>{nivel}</Text>
          <Text style={s.nivelLbl}>Nv.</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroNombre}>{data.nombre}</Text>
          <Text style={s.heroTitulo}>{titulo}</Text>
          <Text style={s.heroDias}>
            {diasRegistrado === 0
              ? 'Se registró hoy'
              : `${diasRegistrado} día${diasRegistrado !== 1 ? 's' : ''} en Valera`}
          </Text>
        </View>
      </View>

      {/* Producción */}
      <SeccionCard titulo="📦 Producción total">
        <StatRow icono="🏠" label="Propiedades publicadas"
          valor={data.total_propiedades.toLocaleString()}
          onPress={() => router.push('/(prospectador)/mi-publicaciones' as any)} />
        <StatRow icono="📤" label="Publicaciones totales"
          valor={data.total_publicaciones.toLocaleString()}
          onPress={() => router.push('/(prospectador)/mi-publicaciones' as any)} />
        <StatRow icono="👤" label="Clientes agregados"      valor={data.total_clientes.toLocaleString()} />
        <StatRow icono="🤝" label="Ventas cerradas"         valor={data.total_ventas.toLocaleString()} />
        <StatRow icono="✅" label="Seguimientos completados" valor={data.total_seguimientos.toLocaleString()} />
        <StatRow icono="💬" label="Interacciones registradas" valor={data.total_interacciones.toLocaleString()} />
      </SeccionCard>

      {/* Tiempo y presencia */}
      <SeccionCard titulo="⏱️ Tiempo y presencia">
        <StatRow icono="🕐" label="Tiempo conectado (total)"
          valor={formatHoras(data.horas_conectado)}
          sub="Desde que empezó el tracking" />
        <StatRow icono="🔥" label="Racha máx. actual" valor={`${data.streak_dias} días`} />
      </SeccionCard>

      {/* Crecimiento */}
      <SeccionCard titulo="⭐ Crecimiento">
        <StatRow icono="✨" label="XP total acumulado"   valor={data.xp.toLocaleString()} />
        <StatRow icono="🎓" label="Cursos completados"   valor={data.total_cursos.toLocaleString()} />
        {xpTxs.length > 0 && (
          <View style={s.xpLogWrap}>
            <Text style={s.xpLogTitulo}>Historial de XP</Text>
            {xpTxs.map(tx => (
              <View key={tx.id} style={s.xpLogRow}>
                <View style={s.xpLogBadge}>
                  <Text style={s.xpLogBadgeTxt}>+{tx.cantidad} XP</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.xpLogConcepto}>{tx.concepto}</Text>
                  <Text style={s.xpLogFecha}>
                    {new Date(tx.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    {' · '}
                    {new Date(tx.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SeccionCard>

      {/* Valera Coins */}
      <SeccionCard titulo="💰 Valera Coins">
        <StatRow icono="💎" label="Saldo actual"   valor={`${data.valera_coins.toLocaleString()} 💰`} />
        <StatRow icono="📈" label="Total ganados"  valor={`+${data.coins_ganados.toLocaleString()}`} />
        <StatRow icono="🛒" label="Total gastados" valor={`-${data.coins_gastados.toLocaleString()}`} />
      </SeccionCard>

    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: TEAL, padding: 20, paddingTop: 24,
  },
  nivelCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  nivelNum:    { fontSize: 22, fontWeight: '900', color: GOLD, lineHeight: 24 },
  nivelLbl:    { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  heroNombre:  { fontSize: 18, fontWeight: '900', color: '#fff' },
  heroTitulo:  { fontSize: 12, color: GOLD, fontWeight: '700', marginTop: 2 },
  heroDias:    { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 },

  card: {
    backgroundColor: CARD, borderRadius: 16, margin: 16, marginBottom: 0,
    padding: 16, borderWidth: 1, borderColor: MID,
  },
  cardTitulo: { fontSize: 13, fontWeight: '800', color: '#fff', marginBottom: 12 },

  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MID,
  },
  statIcn: { fontSize: 20, width: 28 },
  statLbl: { fontSize: 13, color: '#c0d0dc', fontWeight: '500' },
  statSub: { fontSize: 10, color: '#556a7a', marginTop: 1 },
  statVal: { fontSize: 15, fontWeight: '800', color: GOLD },
  statChevron: { fontSize: 20, fontWeight: '700', color: GOLD, marginLeft: 8, marginTop: -2 },

  xpLogWrap:    { marginTop: 14, borderTopWidth: 1, borderTopColor: MID, paddingTop: 12 },
  xpLogTitulo:  { fontSize: 11, fontWeight: '800', color: GOLD, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  xpLogRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: MID },
  xpLogBadge:   { backgroundColor: GOLD + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 62, alignItems: 'center' },
  xpLogBadgeTxt:{ fontSize: 12, fontWeight: '900', color: GOLD },
  xpLogConcepto:{ fontSize: 12, color: '#c0d0dc', fontWeight: '600' },
  xpLogFecha:   { fontSize: 10, color: '#556a7a', marginTop: 1 },
})
