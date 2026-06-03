import { useState, useEffect } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Premio = {
  id: string
  nombre: string
  icono: string
  tipo: string
}

// Los 8 premios ordenados de más a menos probable
export const PREMIOS: Premio[] = [
  { id: 'sorteo',     nombre: 'Entrada sorteo',  icono: '🎟️', tipo: 'sorteo'        },
  { id: 'plantilla',  nombre: 'Pack plantillas',  icono: '📋', tipo: 'plantilla'      },
  { id: 'boost',      nombre: 'Boost 3 días',     icono: '🚀', tipo: 'boost'          },
  { id: 'lead_meta',  nombre: 'Lead Meta Ads',    icono: '📱', tipo: 'lead_meta'      },
  { id: 'curso',      nombre: 'Acceso curso',     icono: '🎓', tipo: 'curso_premium'  },
  { id: 'lead_prem',  nombre: 'Lead Premium',     icono: '⭐', tipo: 'lead_premium'   },
  { id: 'merch',      nombre: 'Merch Valera',     icono: '👕', tipo: 'merch'          },
  { id: 'comision',   nombre: 'Comisión extra',   icono: '💰', tipo: 'comision_extra' },
]

// Probabilidades para el cofre de coins (pagado)
const PROB_COFRE     = [30, 22, 18, 13, 10, 5, 1.5, 0.5]
// Probabilidades para recompensa de milestone (gratis, peores chances en items caros)
const PROB_MILESTONE = [35, 25, 20, 12, 6, 1.5, 0.4, 0.1]

export function sortearPremio(esMilestone: boolean): Premio {
  const probs = esMilestone ? PROB_MILESTONE : PROB_COFRE
  const rand  = Math.random() * 100
  let acum = 0
  for (let i = 0; i < PREMIOS.length; i++) {
    acum += probs[i]
    if (rand <= acum) return PREMIOS[i]
  }
  return PREMIOS[0]
}

// ── Milestone storage ────────────────────────────────────────────────────────
const MILESTONE_KEY = '@valera_milestone_celebrado'

export async function checkMilestone(nivelActual: number): Promise<number | null> {
  if (nivelActual < 10 || nivelActual % 10 !== 0) return null
  try {
    let ultimo = 0
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      ultimo = parseInt(localStorage.getItem(MILESTONE_KEY) ?? '0')
    } else {
      const raw = await AsyncStorage.getItem(MILESTONE_KEY)
      ultimo = parseInt(raw ?? '0')
    }
    if (nivelActual > ultimo) {
      const val = String(nivelActual)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(MILESTONE_KEY, val)
      } else {
        await AsyncStorage.setItem(MILESTONE_KEY, val)
      }
      return nivelActual
    }
    return null
  } catch { return null }
}

// ── Componente visual ────────────────────────────────────────────────────────
interface Props {
  visible: boolean
  esMilestone?: boolean
  nivel?: number
  onClose: () => void
  onGanar: (premio: Premio) => void
}

export function RuletaModal({ visible, esMilestone = false, nivel, onClose, onGanar }: Props) {
  const [fase, setFase]       = useState<'listo' | 'girando' | 'resultado'>('listo')
  const [activoIdx, setActivo] = useState(-1)
  const [ganador, setGanador] = useState<Premio | null>(null)

  useEffect(() => {
    if (!visible) { setFase('listo'); setActivo(-1); setGanador(null) }
  }, [visible])

  function girar() {
    if (fase !== 'listo') return
    setFase('girando')

    const premio     = sortearPremio(esMilestone)
    const ganadorIdx = PREMIOS.findIndex(p => p.id === premio.id)
    const n          = PREMIOS.length   // 8
    const totalSteps = 3 * n + ganadorIdx  // 3 vueltas completas + llegar al ganador

    let step = 0

    function tick() {
      step++
      setActivo(step % n)

      if (step < totalSteps) {
        // Deceleración: 80ms → ~580ms al final
        const t = step / totalSteps
        setTimeout(tick, 80 + t * t * 500)
      } else {
        setActivo(ganadorIdx)
        setGanador(premio)
        setFase('resultado')
        onGanar(premio)
      }
    }

    setTimeout(tick, 80)
  }

  const titulo = esMilestone
    ? `🏆 ¡Nivel ${nivel} alcanzado!`
    : '🎰 Cofre Misterioso'
  const sub = esMilestone
    ? `Recompensa especial por alcanzar el nivel ${nivel}`
    : 'Gira la ruleta para descubrir tu premio'

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fase === 'resultado' ? onClose : undefined}>
      <View style={rs.overlay}>
        <View style={rs.card}>
          {fase === 'resultado' && (
            <TouchableOpacity style={rs.closeBtn} onPress={onClose}>
              <Text style={rs.closeTxt}>✕</Text>
            </TouchableOpacity>
          )}

          <Text style={rs.titulo}>{titulo}</Text>
          <Text style={rs.sub}>{sub}</Text>

          {/* Cuadrícula 4×2 de premios */}
          <View style={rs.grid}>
            {PREMIOS.map((p, i) => {
              const activo  = i === activoIdx
              const ganando = ganador?.id === p.id
              return (
                <View
                  key={p.id}
                  style={[rs.cell, activo && rs.cellActive, ganando && rs.cellWinner]}
                >
                  <Text style={rs.cellIcn}>{p.icono}</Text>
                  <Text style={[rs.cellNom, ganando && rs.cellNomWinner]} numberOfLines={2}>
                    {p.nombre}
                  </Text>
                </View>
              )
            })}
          </View>

          {fase === 'resultado' ? (
            <View style={rs.result}>
              <Text style={rs.resultIcn}>{ganador?.icono}</Text>
              <Text style={rs.resultTxt}>¡Ganaste {ganador?.nombre}!</Text>
              <Text style={rs.resultSub}>El equipo Valera te lo entregará pronto 🎁</Text>
              <TouchableOpacity style={rs.doneBtn} onPress={onClose}>
                <Text style={rs.doneTxt}>¡Genial!</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[rs.spinBtn, fase === 'girando' && rs.spinBtnDis]}
              onPress={girar}
              disabled={fase === 'girando'}
            >
              <Text style={rs.spinTxt}>{fase === 'girando' ? '🌀 Girando...' : '🎰 ¡Girar!'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const DARK = '#0d1b2a'
const GOLD = '#c9a84c'

const rs = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#111f2e', borderRadius: 24, padding: 24,
    width: '100%', maxWidth: 420, alignItems: 'center',
    borderWidth: 1.5, borderColor: GOLD,
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 4 },
  closeTxt: { color: '#94a3b8', fontSize: 18, fontWeight: '700' },
  titulo:   { fontSize: 20, fontWeight: '900', color: GOLD, textAlign: 'center', marginBottom: 4 },
  sub:      { fontSize: 12, color: '#7a9ab5', textAlign: 'center', marginBottom: 18, lineHeight: 17 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 },
  cell: {
    width: '22%', aspectRatio: 0.95,
    backgroundColor: '#1e3448', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    padding: 6, borderWidth: 1.5, borderColor: 'transparent',
  },
  cellActive: { borderColor: GOLD, backgroundColor: '#2a3d52' },
  cellWinner: { borderColor: GOLD, backgroundColor: '#1a2e10', borderWidth: 2.5 },
  cellIcn:    { fontSize: 20, marginBottom: 3 },
  cellNom:    { fontSize: 9, color: '#7a9ab5', textAlign: 'center', lineHeight: 11 },
  cellNomWinner: { color: GOLD, fontWeight: '700' },

  spinBtn:    { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  spinBtnDis: { opacity: 0.5 },
  spinTxt:    { color: DARK, fontSize: 16, fontWeight: '900' },

  result:     { alignItems: 'center', marginTop: 4 },
  resultIcn:  { fontSize: 48, marginBottom: 8 },
  resultTxt:  { fontSize: 18, fontWeight: '800', color: GOLD, textAlign: 'center', marginBottom: 4 },
  resultSub:  { fontSize: 12, color: '#7a9ab5', textAlign: 'center', marginBottom: 16, lineHeight: 17 },
  doneBtn:    { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  doneTxt:    { color: '#fff', fontSize: 15, fontWeight: '700' },
})
