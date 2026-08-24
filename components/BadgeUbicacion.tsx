import { View, Text, StyleSheet } from 'react-native'
import { infoEstadoPropiedad } from '../lib/estados-mexico'

// Badge de ubicación "a prueba de tontos":
//  • Querétaro (el mercado principal) → marca sutil gris, para no meter ruido.
//  • Otro estado → badge ÁMBAR imposible de ignorar con el nombre del estado.
//  • Sin dato → "Ubicación por confirmar" (nunca se disfraza de Querétaro).
// El color dice "de fuera"; el texto dice "de dónde".
export function BadgeUbicacion({ estado_mx, direccion, titulo, size = 'md' }: {
  estado_mx?: string | null
  direccion?: string | null
  titulo?: string | null
  size?: 'sm' | 'md'
}) {
  const info = infoEstadoPropiedad({ estado_mx, direccion, titulo })
  const small = size === 'sm'
  const padV = small ? 2 : 3
  const padH = small ? 6 : 8
  const fs = small ? 10 : 11.5

  if (info.esQueretaro) {
    return (
      <View style={[s.base, s.qro, { paddingVertical: padV, paddingHorizontal: padH }]}>
        <Text style={[s.txt, s.qroTxt, { fontSize: fs }]} numberOfLines={1}>📍 Querétaro</Text>
      </View>
    )
  }
  if (info.desconocido) {
    return (
      <View style={[s.base, s.unk, { paddingVertical: padV, paddingHorizontal: padH }]}>
        <Text style={[s.txt, s.unkTxt, { fontSize: fs }]} numberOfLines={1}>📍 Ubicación por confirmar</Text>
      </View>
    )
  }
  return (
    <View style={[s.base, s.fuera, { paddingVertical: padV, paddingHorizontal: padH }]}>
      <Text style={[s.txt, s.fueraTxt, { fontSize: fs }]} numberOfLines={1}>✈️ Fuera de Qro · {info.estado}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  base: { borderRadius: 7, alignSelf: 'flex-start', borderWidth: 1 },
  txt: { fontWeight: '800' },
  // Querétaro: sutil, calmado
  qro: { backgroundColor: '#eef2f7', borderColor: '#dbe3ec' },
  qroTxt: { color: '#5a6b7b' },
  // Foránea: ámbar fuerte (NO rojo, que ya significa vendida/error)
  fuera: { backgroundColor: '#fff4d6', borderColor: '#f0c14b' },
  fueraTxt: { color: '#8a5a00' },
  // Desconocido: neutro con aviso
  unk: { backgroundColor: '#f3eefb', borderColor: '#e0d3f2' },
  unkTxt: { color: '#6b4f8a' },
})
