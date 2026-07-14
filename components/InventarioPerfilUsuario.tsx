import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

// Catálogos que se venden/regalan (mismos que ve el usuario en Perfil/Tienda).
const COLORES = [
  '#1a6470', '#c9a84c', '#1e3a5f', '#7b1e3a',
  '#2d6a4f', '#4a4a4a', '#5c3d99', '#c45c1a',
]
const AVATARES_PREMIUM = ['🔥','⚡','🌈','🦋','🐉','🦄','👑','💫','🌸','🔮','🌊','🏆','🎉','✨','🦁','🐺']

// Muestra qué avatares y colores YA TIENE un usuario, para no regalarle algo
// repetido al entregarle un premio. Lo que ya tiene sale marcado con ✓; lo que
// le falta, apagado.
export default function InventarioPerfilUsuario({ userId }: { userId: string }) {
  const c = useColors()

  const { data, isLoading } = useQuery({
    queryKey: ['inventario-perfil', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('avatares_desbloqueados, colores_desbloqueados')
        .eq('id', userId)
        .maybeSingle()
      return {
        avatares: ((data as any)?.avatares_desbloqueados ?? []) as string[],
        colores:  ((data as any)?.colores_desbloqueados  ?? []) as string[],
      }
    },
    staleTime: 1000 * 30,
  })

  if (isLoading) return <ActivityIndicator size="small" color="#1a6470" style={{ marginVertical: 10 }} />
  if (!data) return null

  const faltanAvatares = AVATARES_PREMIUM.filter(a => !data.avatares.includes(a)).length
  const faltanColores  = COLORES.filter(col => !data.colores.includes(col)).length

  return (
    <View style={[s.caja, { borderColor: c.border, backgroundColor: c.bg }]}>
      <Text style={[s.titulo, { color: c.text }]}>🎒 Lo que ya tiene</Text>

      <Text style={[s.sub, { color: c.textMute }]}>
        Avatares animados · le faltan {faltanAvatares} de {AVATARES_PREMIUM.length}
      </Text>
      <View style={s.grid}>
        {AVATARES_PREMIUM.map(a => {
          const tiene = data.avatares.includes(a)
          return (
            <View
              key={a}
              style={[
                s.avatarChip,
                { borderColor: c.border },
                tiene
                  ? { backgroundColor: '#16a34a1a', borderColor: '#16a34a' }
                  : { opacity: 0.35 },
              ]}
            >
              <Text style={s.avatarEmoji}>{a}</Text>
              {tiene && <Text style={s.check}>✓</Text>}
            </View>
          )
        })}
      </View>

      <Text style={[s.sub, { color: c.textMute, marginTop: 10 }]}>
        Colores · le faltan {faltanColores} de {COLORES.length}
      </Text>
      <View style={s.grid}>
        {COLORES.map(col => {
          const tiene = data.colores.includes(col)
          return (
            <View
              key={col}
              style={[
                s.colorChip,
                { backgroundColor: col },
                tiene ? { borderColor: '#16a34a', borderWidth: 2.5 } : { opacity: 0.3 },
              ]}
            >
              {tiene && <Text style={s.checkColor}>✓</Text>}
            </View>
          )
        })}
      </View>

      <Text style={[s.pie, { color: c.textMute }]}>
        Verde con ✓ = ya lo tiene. Apagado = se lo puedes regalar.
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12, gap: 4 },
  titulo: { fontSize: 13.5, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 11.5, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  avatarChip: {
    width: 36, height: 36, borderRadius: 9, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 18 },
  check: {
    position: 'absolute', top: -3, right: -3, fontSize: 10, fontWeight: '900',
    color: '#fff', backgroundColor: '#16a34a', borderRadius: 7,
    width: 14, height: 14, textAlign: 'center', lineHeight: 14, overflow: 'hidden',
  },
  colorChip: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  checkColor: { color: '#fff', fontSize: 14, fontWeight: '900' },
  pie: { fontSize: 10.5, marginTop: 8, fontStyle: 'italic' },
})
