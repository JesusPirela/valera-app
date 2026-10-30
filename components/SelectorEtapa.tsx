// La etapa de venta de un cliente: un botón grande que se toca y se cambia
// ahí mismo.
//
// Antes fue una fila de chips numerados (parecía línea del tiempo) y después
// un embudo que se iba cerrando. Ninguno gustó, y el motivo es el mismo: las
// dos enseñaban las DIEZ etapas todo el tiempo, cuando lo único que importa
// de un cliente es en cuál está. Las otras nueve son ruido hasta el momento
// en que lo vas a mover.
//
// Así que ahora se ve una sola cosa grande —la etapa de ahora, con su color—
// y las demás salen solo al tocarla. Y se cambia desde aquí, sin entrar a
// Editar.
import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors } from '../lib/ThemeContext'

type Estado = { label: string; color: string; bg: string }

export default function SelectorEtapa({
  etapas, estados, valor, onCambiar, deshabilitado = false,
}: {
  /** Las etapas en orden. */
  etapas: string[]
  /** Clave → etiqueta y color. */
  estados: Record<string, Estado>
  valor: string | null | undefined
  /** Si se pasa, el botón abre la lista y cambia la etapa. */
  onCambiar?: (etapa: string) => Promise<void> | void
  deshabilitado?: boolean
}) {
  const c = useColors()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)

  const info = (e: string | null | undefined): Estado =>
    (e && estados[e]) || { label: e || 'Sin etapa', color: '#64748b', bg: '#f1f5f9' }

  const actual = info(valor)
  const pos = etapas.indexOf(valor ?? '')
  const sePuede = !!onCambiar && !deshabilitado

  async function elegir(etapa: string) {
    if (!onCambiar || etapa === valor) { setAbierto(false); return }
    setGuardando(etapa)
    try { await onCambiar(etapa) } finally {
      setGuardando(null)
      setAbierto(false)
    }
  }

  return (
    <View>
      {/* ── El botón grande ── */}
      <TouchableOpacity
        activeOpacity={sePuede ? 0.85 : 1}
        onPress={() => sePuede && setAbierto(v => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          borderRadius: 16,
          paddingVertical: 18,
          paddingHorizontal: 18,
          backgroundColor: actual.color,
          // Un realce suave para que se lea como botón y no como etiqueta.
          shadowColor: actual.color,
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          elevation: 4,
        }}
      >
        <View style={{
          width: 46, height: 46, borderRadius: 23,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: '#fff' }}>
            {pos >= 0 ? pos + 1 : '–'}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.8)' }}>
            ETAPA DE VENTA
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', marginTop: 2 }} numberOfLines={1}>
            {actual.label}
          </Text>
          {pos >= 0 ? (
            <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              {pos + 1} de {etapas.length}{sePuede ? '  ·  toca para cambiarla' : ''}
            </Text>
          ) : null}
        </View>

        {sePuede ? (
          <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={22} color="rgba(255,255,255,0.9)" />
        ) : null}
      </TouchableOpacity>

      {/* ── Las demás, solo cuando se piden ── */}
      {abierto ? (
        <View style={{
          marginTop: 10, borderRadius: 14, borderWidth: 1,
          borderColor: c.border, backgroundColor: c.card, overflow: 'hidden',
        }}>
          {etapas.map((e, i) => {
            const it = info(e)
            const esta = e === valor
            const cargando = guardando === e
            return (
              <TouchableOpacity
                key={e}
                activeOpacity={0.7}
                disabled={!!guardando}
                onPress={() => elegir(e)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 11,
                  paddingVertical: 13, paddingHorizontal: 14,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider,
                  backgroundColor: esta ? it.color + '1f' : 'transparent',
                  opacity: guardando && !cargando ? 0.45 : 1,
                }}
              >
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: esta ? it.color : it.color + '26',
                }}>
                  <Text style={{
                    fontSize: 11.5, fontWeight: '800',
                    color: esta ? '#fff' : it.color,
                  }}>{i + 1}</Text>
                </View>
                <Text style={{
                  flex: 1, fontSize: 14.5,
                  fontWeight: esta ? '800' : '600',
                  color: esta ? it.color : c.text,
                }} numberOfLines={1}>
                  {it.label}
                </Text>
                {cargando
                  ? <ActivityIndicator size="small" color={it.color} />
                  : esta
                    ? <Ionicons name="checkmark-circle" size={19} color={it.color} />
                    : null}
              </TouchableOpacity>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
