// "¿Cómo te fue?" — el aviso que sale al volver de una llamada.
//
// Por qué existe: tocar "Llamar" ya deja registrada la llamada sola, pero lo
// que de verdad sostiene el seguimiento es lo de DESPUÉS: si contestó, si hay
// que agendar, cuándo volver a marcar. Hasta ahora eso dependía de que el
// asesor se acordara de entrar al cliente y ponerlo a mano, y por ahí se caía.
//
// Se monta una sola vez en el layout de las pestañas, así que aparece sin
// importar en qué pantalla estés al volver.
//
// Se revisa al montar Y al volver al primer plano. Lo de montar no sobra: en
// una llamada larga el sistema puede matar la app, y entonces no hay ningún
// cambio de estado que escuchar — se vuelve a abrir desde cero.

import { useEffect, useRef, useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, AppState, ActivityIndicator, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getUsuarioActual } from '../lib/sesion'
import { useColors } from '../lib/ThemeContext'
import { registrarSeguimiento } from '../lib/gamification'
import { parchearListasClientes } from '../lib/queryClient'
import {
  leerLlamadaPendiente, limpiarLlamadaPendiente, type LlamadaPendiente,
} from '../lib/llamada-pendiente'

/** Las etapas en las que todavía tiene sentido marcar "no contesta". */
const ETAPAS_TEMPRANAS = new Set(['nuevo', 'por_perfilar', 'primer_contacto', 'no_contesta', 'cita_por_agendar'])

function enDias(dias: number, hora = 10) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(hora, 0, 0, 0)
  return d
}

export default function PopupTrasLlamada() {
  const c = useColors()
  const queryClient = useQueryClient()
  const [pendiente, setPendiente] = useState<LlamadaPendiente | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  // Evita que dos revisiones a la vez abran el aviso dos veces.
  const revisando = useRef(false)

  async function revisar() {
    if (revisando.current || pendiente) return
    revisando.current = true
    try {
      const p = await leerLlamadaPendiente()
      if (p) setPendiente(p)
    } finally {
      revisando.current = false
    }
  }

  useEffect(() => {
    revisar()
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') revisar() })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cerrar() {
    await limpiarLlamadaPendiente()
    setPendiente(null)
  }

  /**
   * Deja el resultado por escrito: la interacción (lo que pasó) y, si procede,
   * el recordatorio de cuándo volver.
   *
   * La ETAPA solo se toca si el cliente está en una etapa temprana. Si ya iba
   * en "seguimiento de cierre", marcarlo como "no contesta" porque no agarró
   * una llamada lo echaría para atrás en el embudo, y eso es peor que no
   * registrar nada.
   */
  async function resolver(opcion: 'no_contesto' | 'agendar' | 'recordar', descripcion: string) {
    if (!pendiente) return
    setGuardando(opcion)
    try {
      const { data: { user } } = await getUsuarioActual()
      if (!user) { await cerrar(); return }
      const { clienteId, nombre } = pendiente

      await supabase.from('interacciones').insert({
        cliente_id: clienteId,
        user_id: user.id,
        tipo: 'llamada',
        descripcion,
      })

      if (opcion !== 'agendar') {
        const cuando = opcion === 'no_contesto' ? enDias(1) : enDias(3)
        await supabase.from('recordatorios').insert({
          cliente_id: clienteId,
          user_id: user.id,
          titulo: opcion === 'no_contesto' ? `Volver a marcar a ${nombre}` : `Dar seguimiento a ${nombre}`,
          descripcion,
          fecha_hora: cuando.toISOString(),
        })
        parchearListasClientes(lista => lista.map(cl => cl.id !== clienteId ? cl
          : { ...cl, proximo_contacto: cuando.toISOString(), updated_at: new Date().toISOString() }))
      }

      if (opcion === 'no_contesto') {
        // Solo desde una etapa temprana (ver la nota de arriba).
        const { data: cl } = await supabase.from('clientes').select('estado').eq('id', clienteId).maybeSingle()
        if (cl?.estado && ETAPAS_TEMPRANAS.has(cl.estado) && cl.estado !== 'no_contesta') {
          await supabase.from('clientes').update({ estado: 'no_contesta', updated_at: new Date().toISOString() }).eq('id', clienteId)
          parchearListasClientes(lista => lista.map(x => x.id !== clienteId ? x : { ...x, estado: 'no_contesta' }))
        }
      }

      registrarSeguimiento(user.id, clienteId).catch(() => {})
      queryClient.invalidateQueries({ queryKey: ['detalle-cliente', clienteId] })

      await cerrar()
      if (opcion === 'agendar') {
        // Se abre el cliente con el flujo de agendar ya desplegado: dos toques
        // desde que cuelgas hasta que la cita queda puesta.
        router.push(`/(prospectador)/detalle-cliente?id=${clienteId}&agendar=1` as any)
      }
    } finally {
      setGuardando(null)
    }
  }

  if (!pendiente) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cerrar}>
      <View style={s.fondo}>
        <View style={[s.caja, { backgroundColor: c.card }]}>
          <View style={s.cabeza}>
            <Ionicons name="call" size={18} color="#2aa3b6" />
            <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>
              ¿Cómo te fue con {pendiente.nombre}?
            </Text>
          </View>
          <Text style={[s.sub, { color: c.textMute }]}>
            Déjalo anotado ahora y no se te pierde el seguimiento.
          </Text>

          <Opcion
            icono="close-circle-outline" color="#d95f5f" cargando={guardando === 'no_contesto'}
            titulo="No contestó" detalle="Te lo recuerdo mañana"
            onPress={() => resolver('no_contesto', 'No contestó la llamada')}
            c={c}
          />
          <Opcion
            icono="calendar-outline" color="#2aa3b6" cargando={guardando === 'agendar'}
            titulo="Hablamos — agendar cita" detalle="Abre el cliente para elegir propiedad y fecha"
            onPress={() => resolver('agendar', 'Hablamos por teléfono. Se va a agendar cita.')}
            c={c}
          />
          <Opcion
            icono="time-outline" color="#c6901f" cargando={guardando === 'recordar'}
            titulo="Hablamos — recordar en 3 días" detalle="Sigue vivo, pero todavía no es cita"
            onPress={() => resolver('recordar', 'Hablamos por teléfono. Sigue en seguimiento.')}
            c={c}
          />

          <TouchableOpacity style={s.ahoraNo} onPress={cerrar} disabled={!!guardando}>
            <Text style={[s.ahoraNoTxt, { color: c.textMute }]}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function Opcion({ icono, color, titulo, detalle, onPress, cargando, c }: {
  icono: any; color: string; titulo: string; detalle: string
  onPress: () => void; cargando: boolean; c: ReturnType<typeof useColors>
}) {
  return (
    <TouchableOpacity
      style={[s.opcion, { borderColor: c.border, backgroundColor: c.bg }]}
      onPress={onPress}
      disabled={cargando}
      activeOpacity={0.7}
    >
      {cargando
        ? <ActivityIndicator size="small" color={color} style={{ width: 22 }} />
        : <Ionicons name={icono} size={22} color={color} />}
      <View style={{ flex: 1 }}>
        <Text style={[s.opcionTitulo, { color: c.text }]} numberOfLines={1}>{titulo}</Text>
        <Text style={[s.opcionDetalle, { color: c.textMute }]} numberOfLines={2}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMute} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  fondo: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 18,
  },
  caja: {
    width: '100%', maxWidth: 420, borderRadius: 18, padding: 18,
    ...Platform.select({ web: { boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }, default: {} }),
  },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 4, marginBottom: 14 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 9,
  },
  opcionTitulo: { fontSize: 14.5, fontWeight: '700' },
  opcionDetalle: { fontSize: 11.5, marginTop: 1 },
  ahoraNo: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  ahoraNoTxt: { fontSize: 13, fontWeight: '600' },
})
