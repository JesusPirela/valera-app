// La etapa de venta de un cliente, como embudo.
//
// Antes era una fila horizontal de chips numerados unidos por rayitas, que hay
// que arrastrar de lado para leer y que se ve igual que una línea del tiempo:
// diez pasos del mismo tamaño, como si llegar al final fuera cuestión de
// avanzar casillas.
//
// Un embudo dice otra cosa, que es la verdadera: cada etapa deja pasar a menos
// gente que la anterior. Por eso va de arriba abajo y cada escalón es más
// angosto que el de encima. Sin números, sin flechas y sin rayas de conexión,
// que es lo que hacía que pareciera un calendario.
//
// "Descartado" va APARTE, debajo y separado. No es el fondo del embudo: es la
// puerta de salida. Ponerlo como el escalón más angosto diría que descartar a
// alguien es el objetivo final, que es justo al revés.
import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColors } from '../lib/ThemeContext'

type Estado = { label: string; color: string; bg: string }

// Qué tan ancho es el escalón más angosto del embudo, en proporción al más
// ancho. Si se cerrara más, las etiquetas de abajo no caben.
const ANCHO_MINIMO = 0.5

export default function EmbudoEtapaVenta({
  etapas, estados, estadoActual, onElegir, salida = 'descartado',
}: {
  /** Las etapas en orden, de la más ancha a la más angosta. */
  etapas: string[]
  /** Clave → etiqueta y color. */
  estados: Record<string, Estado>
  estadoActual: string | null | undefined
  /** Si se pasa, cada escalón se puede tocar para cambiar la etapa. */
  onElegir?: (etapa: string) => void
  /** La etapa que es una salida y no un escalón del embudo. */
  salida?: string
}) {
  const c = useColors()

  const cuerpo = etapas.filter(e => e !== salida)
  const idxActual = etapas.indexOf(estadoActual ?? '')
  const esSalida = estadoActual === salida

  const Escalon = ({ etapa, i, total }: { etapa: string; i: number; total: number }) => {
    const info = estados[etapa] ?? { label: etapa, color: '#64748b', bg: '#f1f5f9' }
    const idx = etapas.indexOf(etapa)
    const activo = estadoActual === etapa
    // Si el cliente ya salió por descartado, ninguna etapa cuenta como pasada:
    // enseñar medio embudo en verde diría que avanzó, y no avanzó.
    const pasado = !esSalida && idxActual > idx

    // De 100% al mínimo, repartido parejo entre los escalones.
    const ancho = total <= 1 ? 1 : 1 - (1 - ANCHO_MINIMO) * (i / (total - 1))

    const Caja = onElegir ? TouchableOpacity : View
    return (
      <Caja
        {...(onElegir ? { onPress: () => onElegir(etapa), activeOpacity: 0.75 } : {})}
        style={{
          width: `${ancho * 100}%`,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: activo ? 42 : 34,
          marginBottom: 3,
          borderRadius: 8,
          paddingHorizontal: 10,
          backgroundColor: activo ? info.color : pasado ? info.color + '26' : c.divider,
          borderWidth: activo ? 0 : 1,
          borderColor: pasado ? info.color + '55' : 'transparent',
        }}
      >
        {pasado ? <Ionicons name="checkmark" size={13} color={info.color} /> : null}
        <Text
          numberOfLines={1}
          style={{
            fontSize: activo ? 13.5 : 12,
            fontWeight: activo ? '800' : pasado ? '700' : '600',
            color: activo ? '#fff' : pasado ? info.color : c.textMute,
          }}
        >
          {info.label}
        </Text>
      </Caja>
    )
  }

  const infoSalida = estados[salida] ?? { label: 'Descartado', color: '#9b2020', bg: '#fff1f2' }
  const CajaSalida = onElegir ? TouchableOpacity : View

  return (
    <View>
      {cuerpo.map((e, i) => (
        <Escalon key={e} etapa={e} i={i} total={cuerpo.length} />
      ))}

      {/* La salida, separada del embudo por una línea: no es el final del
          camino, es salirse de él. */}
      {etapas.includes(salida) ? (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.divider, alignItems: 'center' }}>
          <CajaSalida
            {...(onElegir ? { onPress: () => onElegir(salida), activeOpacity: 0.75 } : {})}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: esSalida ? infoSalida.color : 'transparent',
              borderWidth: 1,
              borderColor: esSalida ? infoSalida.color : c.border,
            }}
          >
            <Ionicons name="exit-outline" size={13} color={esSalida ? '#fff' : c.textMute} />
            <Text style={{
              fontSize: 12,
              fontWeight: esSalida ? '800' : '600',
              color: esSalida ? '#fff' : c.textMute,
            }}>
              {infoSalida.label}
            </Text>
          </CajaSalida>
        </View>
      ) : null}
    </View>
  )
}
