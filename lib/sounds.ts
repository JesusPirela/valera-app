import { Platform } from 'react-native'

let _ctx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (Platform.OS !== 'web') return null
  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') return null
  if (!_ctx) {
    try { _ctx = new (AudioContext || (window as any).webkitAudioContext)() } catch { return null }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
  return _ctx
}

// Sacudida corta (cofre vibrando antes de abrirse)
export function playShake() {
  const c = ctx(); if (!c) return
  const dur = 0.18
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.25
  }
  const src = c.createBufferSource()
  const gain = c.createGain()
  src.buffer = buf
  gain.gain.setValueAtTime(0.7, c.currentTime)
  src.connect(gain); gain.connect(c.destination)
  src.start()
}

// Whoosh + pop cuando la tapa sale volando
export function playOpen() {
  const c = ctx(); if (!c) return
  const dur = 0.5
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (i / data.length) * 0.28
  }
  const src = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(300, c.currentTime)
  filter.frequency.exponentialRampToValueAtTime(3500, c.currentTime + dur)
  filter.Q.value = 0.6
  gain.gain.setValueAtTime(0.7, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + dur)
  src.buffer = buf
  src.connect(filter); filter.connect(gain); gain.connect(c.destination)
  src.start()

  // Pop final
  const popOsc = c.createOscillator()
  const popGain = c.createGain()
  const popT = c.currentTime + dur * 0.65
  popOsc.type = 'sine'
  popOsc.frequency.setValueAtTime(700, popT)
  popOsc.frequency.exponentialRampToValueAtTime(220, popT + 0.18)
  popGain.gain.setValueAtTime(0.4, popT)
  popGain.gain.exponentialRampToValueAtTime(0.01, popT + 0.2)
  popOsc.connect(popGain); popGain.connect(c.destination)
  popOsc.start(popT); popOsc.stop(popT + 0.25)
}

// Ticks decelerados tipo slot machine (dura ~6.2 s)
let _rollingAbort = false

export function startRolling() {
  const c = ctx(); if (!c) return
  _rollingAbort = false
  const totalDur = 6.2
  const now = c.currentTime
  const N = 60

  const tickDur = 0.018
  const tickBuf = c.createBuffer(1, Math.floor(c.sampleRate * tickDur), c.sampleRate)
  const tdata = tickBuf.getChannelData(0)
  for (let j = 0; j < tdata.length; j++) {
    tdata[j] = (Math.random() * 2 - 1) * (1 - j / tdata.length) * 0.12
  }

  for (let i = 0; i < N; i++) {
    if (_rollingAbort) break
    const progress = i / (N - 1)
    const t = now + totalDur * (progress * progress) // cuadrático → desacelera
    const src = c.createBufferSource()
    const gain = c.createGain()
    src.buffer = tickBuf
    const vol = i < 6 ? (i / 6) * 0.14 : 0.14
    gain.gain.setValueAtTime(vol, t)
    src.connect(gain); gain.connect(c.destination)
    src.start(t)
  }
}

export function stopRolling() {
  _rollingAbort = true
}

// Arpeggio ascendente al ganar (premio común)
export function playWin() {
  const c = ctx(); if (!c) return
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = c.currentTime + i * 0.1
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.22, t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45)
    osc.connect(gain); gain.connect(c.destination)
    osc.start(t); osc.stop(t + 0.5)
  })
}

// Fanfarria ÉPICA para recompensas raras/mejores: arpegio ascendente rápido +
// acorde mayor sostenido con brillo + un golpe grave, más largo y triunfal.
export function playEpicWin() {
  const c = ctx(); if (!c) return
  const now = c.currentTime

  // 1) Arpegio ascendente rápido (dos octavas).
  const subida = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5] // G4→E6
  subida.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = now + i * 0.07
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.16, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3)
    osc.connect(gain); gain.connect(c.destination)
    osc.start(t); osc.stop(t + 0.32)
  })

  // 2) Acorde mayor sostenido (C mayor) que entra tras el arpegio.
  const acordeT = now + 0.42
  const acorde = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  acorde.forEach((freq) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, acordeT)
    gain.gain.linearRampToValueAtTime(0.14, acordeT + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.01, acordeT + 1.2)
    osc.connect(gain); gain.connect(c.destination)
    osc.start(acordeT); osc.stop(acordeT + 1.3)
  })

  // 3) Golpe grave (impacto) que le da cuerpo.
  const bass = c.createOscillator()
  const bassGain = c.createGain()
  bass.type = 'sine'
  bass.frequency.setValueAtTime(130, acordeT)
  bass.frequency.exponentialRampToValueAtTime(65, acordeT + 0.5)
  bassGain.gain.setValueAtTime(0.35, acordeT)
  bassGain.gain.exponentialRampToValueAtTime(0.01, acordeT + 0.8)
  bass.connect(bassGain); bassGain.connect(c.destination)
  bass.start(acordeT); bass.stop(acordeT + 0.85)

  // 4) Brillo (shimmer) agudo al final.
  const shimT = acordeT + 0.15
  ;[1568, 2093].forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = shimT + i * 0.08
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.08, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5)
    osc.connect(gain); gain.connect(c.destination)
    osc.start(t); osc.stop(t + 0.55)
  })
}
