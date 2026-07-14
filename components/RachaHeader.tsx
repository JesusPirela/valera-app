import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { getEstadoRacha, tomarHitoPendiente, type HitoRacha } from '../lib/gamification'
import HitoRachaModal from './HitoRachaModal'

// La racha, visible en el inicio. Antes vivía solo en Misiones, que hay que ir a
// buscar; una racha que no ves todos los días no te presiona a cuidarla.
//
// La llama se apaga (🕯️) mientras no cumplas la meta de hoy, y prende (🔥) al
// cumplirla. Tocarla lleva a Misiones, que es donde se cumple.
export default function RachaHeader() {
  const [hito, setHito] = useState<HitoRacha | null>(null)

  const { data: r } = useQuery({
    queryKey: ['estado-racha'],
    queryFn: getEstadoRacha,
    staleTime: 1000 * 30,
    networkMode: 'offlineFirst',
  })

  // Si al publicar/registrar se alcanzó un hito, se celebra aquí.
  useEffect(() => {
    const pendiente = tomarHitoPendiente()
    if (pendiente) setHito(pendiente)
  }, [r])

  if (!r) return null

  const cumplida = r.meta_cumplida_hoy
  const enRiesgo = !cumplida && r.racha > 0

  return (
    <>
      <TouchableOpacity
        style={[s.chip, enRiesgo && s.chipRiesgo, cumplida && s.chipOk]}
        onPress={() => router.push('/(prospectador)/misiones')}
        activeOpacity={0.8}
      >
        <Text style={s.llama}>{cumplida ? '🔥' : '🕯️'}</Text>
        <Text style={s.num}>{r.racha}</Text>
      </TouchableOpacity>

      <HitoRachaModal hito={hito} onClose={() => setHito(null)} />
    </>
  )
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  chipOk:     { borderColor: '#ff8a3d' },
  chipRiesgo: { borderColor: 'rgba(255,255,255,0.35)', opacity: 0.85 },
  llama: { fontSize: 15 },
  num:   { color: '#fff', fontWeight: '900', fontSize: 15 },
})
