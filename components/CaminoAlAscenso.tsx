// Quién va a ascender, quién está cerca y quién no se ha movido.
//
// El ascenso es automático: cada día a las 6:10 de la mañana el cron
// evaluar-ascensos sube a quien cumplió, y a esa persona le sale el modal de
// "¡Ascendiste!" al abrir la app. Esta pantalla no asciende a nadie: es para
// VER venir las cosas, que es lo que sirve para empujar a alguien a tiempo.
//
// Los números salen de la MISMA función que usa el cron (ver_constancia_equipo
// envuelve a medir_constancia). Si esta pantalla contara por su cuenta, tarde
// o temprano diría una cosa y el cron haría otra, y nadie sabría cuál creer.
import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'

// Los mismos cortes que trae la función en la base. Están aquí solo para
// dibujar la barra; quien manda es la base.
const DIAS_META = 12

type Fila = {
  persona_id: string
  persona_nombre: string | null
  rol_actual: string
  rol_siguiente: string
  dias_activos: number
  n_publicaciones: number
  n_seguimientos: number
  n_clientes: number
  n_citas: number
  ultimo_ascenso: string | null
  cumple: boolean
  le_falta: string
}

const ETIQUETA_ROL: Record<string, string> = {
  nuevo: 'Nuevo',
  prospectador: 'Prospectador',
  prospectador_plus: 'Prospectador Plus',
}

export default function CaminoAlAscenso({ onAbrirPersona }: {
  onAbrirPersona?: (id: string, nombre: string) => void
}) {
  const c = useColors()
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [verParados, setVerParados] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('ver_constancia_equipo')
    setFilas((data ?? []) as Fila[])
    setCargando(false)
  }, [])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))

  if (cargando) return <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />

  const listos = filas.filter(f => f.cumple)
  // "Cerca" es quien ya trabajó al menos la mitad del mes: son a los que vale
  // la pena empujar. Por debajo de eso no es que les falte poco, es que no
  // han empezado.
  const cerca = filas.filter(f => !f.cumple && f.dias_activos >= DIAS_META / 2)
  const parados = filas.filter(f => !f.cumple && f.dias_activos < DIAS_META / 2)

  const Tarjeta = ({ f, color }: { f: Fila; color: string }) => (
    <TouchableOpacity
      activeOpacity={onAbrirPersona ? 0.7 : 1}
      onPress={() => onAbrirPersona?.(f.persona_id, f.persona_nombre ?? '')}
      style={[s.fila, { backgroundColor: c.card, borderColor: c.border }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>
            {f.persona_nombre ?? 'Sin nombre'}
          </Text>
          <Text style={[s.rol, { color: c.textMute }]} numberOfLines={1}>
            {ETIQUETA_ROL[f.rol_actual] ?? f.rol_actual} → {ETIQUETA_ROL[f.rol_siguiente] ?? f.rol_siguiente}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.dias, { color }]}>{f.dias_activos}</Text>
          <Text style={[s.diasLbl, { color: c.textMute }]}>de {DIAS_META} días</Text>
        </View>
      </View>

      {/* La barra de días, con la meta marcada. Pasarse de 12 no suma: lo que
          importa es si llegó, no cuánto se pasó. */}
      <View style={[s.pista, { backgroundColor: c.divider }]}>
        <View style={{
          width: `${Math.min((f.dias_activos / DIAS_META) * 100, 100)}%`,
          height: '100%', backgroundColor: color, borderRadius: 4,
        }} />
      </View>

      <View style={s.crudos}>
        <Text style={[s.crudo, { color: c.textMute }]}>📤 {f.n_publicaciones}</Text>
        <Text style={[s.crudo, { color: c.textMute }]}>✅ {f.n_seguimientos}</Text>
        <Text style={[s.crudo, {
          color: f.n_clientes >= 3 ? color : c.textMute,
          fontWeight: f.n_clientes >= 3 ? '800' : '600',
        }]}>👤 {f.n_clientes}</Text>
        <Text style={[s.crudo, {
          color: f.n_citas >= 2 ? color : c.textMute,
          fontWeight: f.n_citas >= 2 ? '800' : '600',
        }]}>📅 {f.n_citas}</Text>
      </View>

      <Text style={[s.falta, { color: f.cumple ? color : c.textSub }]} numberOfLines={2}>
        {f.le_falta}
      </Text>
    </TouchableOpacity>
  )

  return (
    <View>
      <View style={[s.regla, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.reglaTitulo, { color: c.text }]}>Cómo se sube de nivel</Text>
        <Text style={[s.reglaTxt, { color: c.textSub }]}>
          En los últimos 30 días: <Text style={{ fontWeight: '800', color: c.text }}>12 días distintos </Text>
          trabajados <Text style={{ fontWeight: '800', color: c.text }}>y</Text> al menos 3 clientes o 2 citas.
          Son dos puertas y no una: con solo constancia subiría quien publica mucho sin prospectar a nadie.
        </Text>
        <Text style={[s.reglaTxt, { color: c.textMute, marginTop: 7 }]}>
          Sube solo, cada mañana. Nadie baja de nivel por este camino, y entre un ascenso y el
          siguiente pasa un mes.
        </Text>
      </View>

      <Seccion
        titulo="Suben mañana"
        sub="Ya cumplieron las dos puertas. El aviso les llega al abrir la app."
        n={listos.length}
        color="#2e9e5b"
        c={c}
        vacio="Ninguno todavía."
      >
        {listos.map(f => <Tarjeta key={f.persona_id} f={f} color="#2e9e5b" />)}
      </Seccion>

      <Seccion
        titulo="Cerca"
        sub="Llevan medio mes o más trabajando. Son a los que vale la pena empujar."
        n={cerca.length}
        color="#c9a84c"
        c={c}
        vacio="Nadie va a medio camino."
      >
        {cerca.map(f => <Tarjeta key={f.persona_id} f={f} color="#c9a84c" />)}
      </Seccion>

      <TouchableOpacity onPress={() => setVerParados(v => !v)} style={s.verMas}>
        <Text style={s.verMasTxt}>
          {verParados ? 'Ocultar' : `Ver los ${parados.length} que no han arrancado`}
        </Text>
      </TouchableOpacity>
      {verParados ? parados.map(f => <Tarjeta key={f.persona_id} f={f} color="#94a3b8" />) : null}
    </View>
  )
}

function Seccion({ titulo, sub, n, color, c, vacio, children }: {
  titulo: string; sub: string; n: number; color: string
  c: ReturnType<typeof useColors>; vacio: string; children: any
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={s.secHeader}>
        <Text style={[s.secTitulo, { color: c.text }]}>{titulo}</Text>
        <Text style={[s.secBadge, { color, borderColor: color }]}>{n}</Text>
      </View>
      <Text style={[s.secSub, { color: c.textMute }]}>{sub}</Text>
      {n === 0 ? <Text style={[s.secVacio, { color: c.textMute }]}>{vacio}</Text> : children}
    </View>
  )
}

const s = StyleSheet.create({
  regla: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 18 },
  reglaTitulo: { fontSize: 14.5, fontWeight: '800', marginBottom: 6 },
  reglaTxt: { fontSize: 12, lineHeight: 17 },

  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  secTitulo: { fontSize: 15.5, fontWeight: '800' },
  secBadge: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2 },
  secSub: { fontSize: 11.5, marginBottom: 9, lineHeight: 16 },
  secVacio: { fontSize: 12.5, fontStyle: 'italic', paddingVertical: 6, paddingLeft: 4 },

  fila: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  nombre: { fontSize: 14.5, fontWeight: '700' },
  rol: { fontSize: 11.5, marginTop: 2 },
  dias: { fontSize: 22, fontWeight: '900' },
  diasLbl: { fontSize: 10 },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  crudos: { flexDirection: 'row', gap: 14, marginTop: 9 },
  crudo: { fontSize: 11.5, fontWeight: '600' },
  falta: { fontSize: 11.5, marginTop: 8, lineHeight: 16, fontWeight: '600' },

  verMas: { paddingVertical: 10, alignItems: 'center' },
  verMasTxt: { fontSize: 12.5, color: '#1a6470', fontWeight: '700' },
})
