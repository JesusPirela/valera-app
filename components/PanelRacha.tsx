import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getEstadoRacha, comprarProtectorRacha, repararRacha } from '../lib/gamification'
import { useColors } from '../lib/ThemeContext'

function avisar(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Racha', msg)
}

// Panel de racha estilo Duolingo:
//   • la llama sube al cumplir la META DIARIA (1 misión diaria), no por entrar;
//   • los protectores se compran con coins y salvan la racha si faltas un día;
//   • si la perdiste hace poco, la puedes reparar pagando coins.
export default function PanelRacha() {
  const c = useColors()
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState<'comprar' | 'reparar' | null>(null)

  const { data: r, refetch } = useQuery({
    queryKey: ['estado-racha'],
    queryFn: getEstadoRacha,
    staleTime: 1000 * 30,
    networkMode: 'offlineFirst',
  })

  if (!r) return null

  const refrescar = async () => {
    await refetch()
    qc.invalidateQueries({ queryKey: ['misiones'] })
    qc.invalidateQueries({ queryKey: ['user-stats'] })
  }

  async function comprar() {
    setOcupado('comprar')
    const res = await comprarProtectorRacha()
    setOcupado(null)
    if (!res.ok) { avisar(res.error ?? 'No se pudo comprar'); return }
    await refrescar()
    avisar('🛡️ Protector comprado. Si faltas un día, tu racha se salva sola.')
  }

  async function reparar() {
    setOcupado('reparar')
    const res = await repararRacha()
    setOcupado(null)
    if (!res.ok) { avisar(res.error ?? 'No se pudo reparar'); return }
    await refrescar()
    avisar('🔥 ¡Racha recuperada!')
  }

  // Tener no tiene tope; comprar sí (cupo semanal). Los ?? son por si la app
  // corre antes de que la migración esté aplicada: mejor degradar que romper.
  const maxCompras       = r.max_compras_semana ?? 2
  const comprasRestantes = r.compras_restantes ?? maxCompras
  const puedeComprar     = comprasRestantes > 0 && r.coins >= r.costo_protector

  return (
    <View style={{ gap: 10, marginBottom: 14 }}>
      {/* Racha perdida pero aún recuperable */}
      {r.reparable && r.racha_perdida != null && (
        <View style={[s.repararCard]}>
          <Text style={s.repararTitulo}>💔 Perdiste tu racha de {r.racha_perdida} días</Text>
          <Text style={s.repararSub}>Puedes recuperarla, pero solo por unos días.</Text>
          <TouchableOpacity
            style={[s.repararBtn, (ocupado != null || r.coins < (r.costo_reparar ?? 0)) && { opacity: 0.5 }]}
            onPress={reparar}
            disabled={ocupado != null || r.coins < (r.costo_reparar ?? 0)}
          >
            {ocupado === 'reparar'
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.repararBtnTxt}>
                  {r.coins < (r.costo_reparar ?? 0)
                    ? `Te faltan ${((r.costo_reparar ?? 0) - r.coins).toLocaleString()} 💰`
                    : `Reparar racha · ${(r.costo_reparar ?? 0).toLocaleString()} 💰`}
                </Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Racha actual */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.filaTop}>
          <View style={s.llamaWrap}>
            <Text style={s.llama}>{r.meta_cumplida_hoy ? '🔥' : '🕯️'}</Text>
            <View>
              <Text style={[s.rachaNum, { color: c.text }]}>{r.racha}</Text>
              <Text style={[s.rachaLbl, { color: c.textMute }]}>
                {r.racha === 1 ? 'día de racha' : 'días de racha'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.record, { color: c.textMute }]}>Récord</Text>
            <Text style={[s.recordNum, { color: '#c9a84c' }]}>🏆 {r.racha_maxima}</Text>
          </View>
        </View>

        {/* Meta diaria */}
        {r.meta_cumplida_hoy ? (
          <View style={[s.meta, { backgroundColor: '#16a34a18', borderColor: '#16a34a55' }]}>
            <Text style={[s.metaTxt, { color: '#16a34a' }]}>
              ✅ Meta de hoy cumplida. Tu racha está a salvo.
            </Text>
          </View>
        ) : (
          <View style={[s.meta, { backgroundColor: '#d9770618', borderColor: '#d9770655' }]}>
            <Text style={[s.metaTxt, { color: '#d97706' }]}>
              {r.en_riesgo
                ? '⚠️ Tu racha está en riesgo: completa 1 misión diaria hoy para no perderla.'
                : '🎯 Completa 1 misión diaria para encender tu racha.'}
            </Text>
          </View>
        )}

        {/* Protectores: se acumulan sin tope; comprarlos tiene cupo semanal */}
        <View style={s.protRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.protTitulo, { color: c.text }]}>
              🛡️ Protectores: {r.protectores}
            </Text>
            <Text style={[s.protSub, { color: c.textMute }]}>
              Si faltas un día, se usa uno solo y tu racha sobrevive.
            </Text>
            {r.proximo_protector_nivel != null && (
              <Text style={[s.protSub, { color: c.textMute }]}>
                🎁 Ganas 1 al llegar al nivel {r.proximo_protector_nivel} (vas en el {r.nivel}).
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'center', gap: 3 }}>
            <TouchableOpacity
              style={[s.protBtn, !puedeComprar && { opacity: 0.45 }]}
              onPress={comprar}
              disabled={!puedeComprar || ocupado != null}
            >
              {ocupado === 'comprar'
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={s.protBtnTxt}>
                    {comprasRestantes === 0 ? 'Sin cupo' : `${r.costo_protector} 💰`}
                  </Text>}
            </TouchableOpacity>
            <Text style={[s.protCupo, { color: c.textMute }]}>
              {comprasRestantes}/{maxCompras} esta semana
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  llamaWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  llama: { fontSize: 40 },
  rachaNum: { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  rachaLbl: { fontSize: 12, fontWeight: '600' },
  record: { fontSize: 11, fontWeight: '700' },
  recordNum: { fontSize: 15, fontWeight: '900', marginTop: 2 },

  meta: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 },
  metaTxt: { fontSize: 12.5, fontWeight: '700', lineHeight: 17 },

  protRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  protTitulo: { fontSize: 13.5, fontWeight: '800' },
  protSub: { fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  protBtn: {
    backgroundColor: '#c9a84c', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9, minWidth: 78, alignItems: 'center',
  },
  protBtnTxt: { color: '#000', fontWeight: '800', fontSize: 12.5 },
  protCupo: { fontSize: 10, fontWeight: '600' },

  repararCard: {
    backgroundColor: '#7b1e3a', borderRadius: 16, padding: 14, gap: 6,
  },
  repararTitulo: { color: '#fff', fontSize: 14.5, fontWeight: '900' },
  repararSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  repararBtn: {
    backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginTop: 4,
  },
  repararBtnTxt: { color: '#000', fontWeight: '900', fontSize: 13.5 },
})
