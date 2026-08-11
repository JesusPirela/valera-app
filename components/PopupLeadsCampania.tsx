import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native'
import { router, usePathname } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { getUsuarioActual } from '../lib/sesion'

const SEEN_KEY = 'lc_seen_v1'
// Solo insiste con leads llegados en los últimos 14 días para no revivir la
// bandeja histórica completa la primera vez.
const DIAS = 14

type Nuevo = { id: string; nombre: string; zona_busqueda: string | null; presupuesto: string | null }

/**
 * Popup insistente: cuando al asesor le asignan clientes de campaña nuevos
 * (origen "Campaña FB") que aún no ha abierto, salta un modal que lo interrumpe
 * para que los atienda lo antes posible. Deja de insistir cuando abre la tabla
 * de Leads de campaña (que los marca como vistos).
 */
export default function PopupLeadsCampania() {
  const pathname = usePathname()
  const [nuevos, setNuevos] = useState<Nuevo[]>([])
  const [visible, setVisible] = useState(false)
  // Si el usuario toca "Después", no re-molestar hasta el próximo arranque.
  const pospuesto = useRef(false)
  const revisandoRef = useRef(false)

  const revisar = useCallback(async () => {
    if (pospuesto.current || revisandoRef.current) return
    revisandoRef.current = true
    try {
      const { data: { user } } = await getUsuarioActual()
      if (!user) return
      const desde = new Date(Date.now() - DIAS * 86400_000).toISOString()
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, zona_busqueda, presupuesto')
        .eq('es_lead_campania', true)
        .eq('responsable_id', user.id)
        .is('eliminado_at', null)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
      if (!data || data.length === 0) return
      const raw = await AsyncStorage.getItem(SEEN_KEY)
      const seen: string[] = raw ? JSON.parse(raw) : []
      const seenSet = new Set(seen)
      const sinVer = data.filter(d => !seenSet.has(d.id))
      if (sinVer.length > 0) {
        setNuevos(sinVer)
        setVisible(true)
      }
    } catch {
      // silencioso: es un aviso, no crítico
    } finally {
      revisandoRef.current = false
    }
  }, [])

  useEffect(() => {
    revisar()
    const sub = AppState.addEventListener('change', st => { if (st === 'active') revisar() })
    // Reacción inmediata si llega un lead mientras la app está abierta.
    const ch = supabase
      .channel('lc-popup')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clientes' }, payload => {
        const row = payload.new as { es_lead_campania?: boolean }
        if (row?.es_lead_campania) setTimeout(revisar, 500)
      })
      .subscribe()
    return () => { sub.remove(); supabase.removeChannel(ch) }
  }, [revisar])

  function verAhora() {
    setVisible(false)
    router.push('/(prospectador)/leads-campania')
  }
  function despues() {
    pospuesto.current = true
    setVisible(false)
  }

  // No taparse a sí mismo si el usuario ya está en la tabla.
  if (pathname.includes('leads-campania')) return null
  if (!visible || nuevos.length === 0) return null

  return (
    <Modal transparent visible animationType="fade" onRequestClose={despues}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}><Text style={{ fontSize: 30 }}>📣</Text></View>
          <Text style={styles.title}>
            {nuevos.length === 1 ? '¡Nuevo lead de campaña!' : `¡${nuevos.length} nuevos leads de campaña!`}
          </Text>
          <Text style={styles.body}>
            Atiéndelos lo antes posible para no perder la oportunidad.
          </Text>
          <View style={styles.lista}>
            {nuevos.slice(0, 4).map(n => (
              <View key={n.id} style={styles.item}>
                <Text style={styles.itemNombre} numberOfLines={1}>• {n.nombre}</Text>
                {(n.zona_busqueda || n.presupuesto) ? (
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {[n.zona_busqueda, n.presupuesto].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            ))}
            {nuevos.length > 4 && (
              <Text style={styles.itemMeta}>y {nuevos.length - 4} más…</Text>
            )}
          </View>
          <TouchableOpacity style={styles.btnPrim} onPress={verAhora} activeOpacity={0.85}>
            <Text style={styles.btnPrimTxt}>📋 Atender ahora</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={despues} activeOpacity={0.7}>
            <Text style={styles.btnGhostTxt}>Después</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center' },
  iconWrap: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#4c1d95', textAlign: 'center' },
  body: { fontSize: 13.5, color: '#555', textAlign: 'center', marginTop: 6, marginBottom: 12 },
  lista: { alignSelf: 'stretch', backgroundColor: '#faf5ff', borderRadius: 12, padding: 12, marginBottom: 16, gap: 6 },
  item: {},
  itemNombre: { fontSize: 14, fontWeight: '700', color: '#3b0764' },
  itemMeta: { fontSize: 12, color: '#7c3aed' },
  btnPrim: { alignSelf: 'stretch', backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnPrimTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnGhost: { paddingVertical: 10, marginTop: 4 },
  btnGhostTxt: { color: '#888', fontSize: 13.5, fontWeight: '600' },
})
