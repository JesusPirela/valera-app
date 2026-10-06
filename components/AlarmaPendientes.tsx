// Lo que la alarma está reclamando, con el botón de "Posponer" que el push
// promete.
//
// La alarma avisa por push al celular cada 30 minutos (entre 8am y 9pm, hasta
// 8 veces) mientras haya un lead sin contactar o una cita sin retro. Este panel
// es el otro lado: aquí se ve qué es y se apaga, ya sea atendiéndolo o
// posponiéndolo.
//
// Si no hay nada pendiente no dibuja nada: no vale la pena ocupar espacio para
// decir "todo bien".
import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

type Pendiente = {
  tipo: 'alarma_lead' | 'alarma_retro'
  referencia_id: string
  titulo: string
  detalle: string
  desde: string
  pospuesta_hasta: string | null
}

const OPCIONES_POSPONER: { label: string; minutos: number }[] = [
  { label: '1 hora', minutos: 60 },
  { label: '4 horas', minutos: 240 },
  { label: 'Mañana', minutos: 60 * 20 },
]

function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'hace menos de una hora'
  if (h < 24) return `hace ${h} hora${h === 1 ? '' : 's'}`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

export default function AlarmaPendientes() {
  const C = useColors()
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    supabase.rpc('mis_pendientes_alarma').then(({ data, error }) => {
      if (error) return                       // sin red: el panel simplemente no sale
      // Lo pospuesto no se muestra: posponer tiene que servir de algo.
      setPendientes((data ?? []).filter((p: Pendiente) =>
        !p.pospuesta_hasta || new Date(p.pospuesta_hasta) <= new Date()))
    })
  }, [])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function posponer(p: Pendiente, minutos: number) {
    setOcupado(true)
    const { data, error } = await supabase.rpc('posponer_alarma', {
      p_tipo: p.tipo, p_referencia_id: p.referencia_id, p_minutos: minutos,
    })
    setOcupado(false)
    setAbierto(null)
    // supabase.rpc NO lanza: devuelve { error }. Sin esta comprobación, un
    // fallo se vería como si hubiera pospuesto.
    if (error || !(data as any)?.ok) {
      const msg = error?.message ?? (data as any)?.error ?? 'Inténtalo de nuevo.'
      if (Platform.OS === 'web') window.alert('No se pudo posponer: ' + msg)
      else Alert.alert('No se pudo posponer', msg)
      return
    }
    setPendientes(prev => prev.filter(x => !(x.tipo === p.tipo && x.referencia_id === p.referencia_id)))
  }

  function atender(p: Pendiente) {
    if (p.tipo === 'alarma_lead') router.push(`/detalle-cliente?id=${p.referencia_id}` as any)
    else router.push('/asesor-citas' as any)
  }

  if (pendientes.length === 0) return null

  return (
    <View style={[s.caja, { backgroundColor: C.card, borderColor: '#e08e3c' }]}>
      <Text style={s.cabecera}>
        🔔 {pendientes.length === 1 ? 'Tienes 1 pendiente' : `Tienes ${pendientes.length} pendientes`}
      </Text>
      <Text style={s.sub}>
        Mientras sigan aquí, la app te va a estar avisando al celular. Atiéndelos o posponlos.
      </Text>

      {pendientes.map(p => {
        const clave = p.tipo + p.referencia_id
        return (
          <View key={clave} style={[s.fila, { borderColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.titulo, { color: C.text }]} numberOfLines={1}>
                {p.tipo === 'alarma_lead' ? '👤 ' : '📝 '}{p.titulo || 'Sin nombre'}
              </Text>
              <Text style={s.detalle} numberOfLines={1}>
                {p.detalle}{p.desde ? ` · ${haceCuanto(p.desde)}` : ''}
              </Text>
            </View>
            <TouchableOpacity style={s.btnAtender} onPress={() => atender(p)}>
              <Text style={s.btnAtenderTxt}>Atender</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnPosponer, { borderColor: C.border }]}
              onPress={() => setAbierto(abierto === clave ? null : clave)}
              disabled={ocupado}
            >
              <Text style={[s.btnPosponerTxt, { color: C.textSub }]}>Posponer</Text>
            </TouchableOpacity>

            {abierto === clave && (
              <View style={[s.menu, { backgroundColor: C.card, borderColor: C.border }]}>
                {OPCIONES_POSPONER.map(o => (
                  <TouchableOpacity key={o.label} style={s.menuItem} onPress={() => posponer(p, o.minutos)} disabled={ocupado}>
                    <Text style={{ color: C.text, fontSize: 13 }}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  caja: { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  cabecera: { fontSize: 15, fontWeight: '800', color: '#c2410c' },
  sub: { fontSize: 12, color: '#9aa5ab', marginTop: 3, marginBottom: 10, lineHeight: 17 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1 },
  titulo: { fontSize: 13.5, fontWeight: '700' },
  detalle: { fontSize: 11.5, color: '#9aa5ab', marginTop: 2 },
  btnAtender: { backgroundColor: '#1a6470', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnAtenderTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnPosponer: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  btnPosponerTxt: { fontSize: 12, fontWeight: '700' },
  menu: {
    position: 'absolute', right: 0, top: '100%', zIndex: 20,
    borderWidth: 1, borderRadius: 10, paddingVertical: 4, minWidth: 128,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
})
