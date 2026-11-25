// Publicaciones repetidas: la misma propiedad metida dos veces.
//
// Esta pantalla NO borra nada y no debe hacerlo nunca. Señala parejas
// sospechosas, las ordena por qué tan seguro está, y una persona entra a la
// ficha, compara y decide. Medido sobre las 2,727 propiedades: 922 parejas
// sospechosas que tocan 1,005 propiedades — con esos números, borrar en
// automático sería tirar inventario bueno.
//
// Las señales y por qué unas pesan más que otras están en la migración
// 20261124_propiedades_duplicadas.sql.
import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Alert, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors } from '../../lib/ThemeContext'
import { legibleSobre, mezclar } from '../../lib/color'
import { normalizar } from '../../lib/texto'
import { ThumbImage } from '../../components/ThumbImage'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Par = { a_id: string; b_id: string; motivos: string[]; puntos: number }
type Prop = {
  id: string; codigo: string | null; titulo: string | null; precio: number | null
  estado: string | null; tipo: string | null; operacion: string | null
  recamaras: number | null; banos: number | null; m2: number | null
  zona: string | null; direccion: string | null; created_at: string
  foto: string | null; publicaciones: number | null; fotos: number | null
}
/** Un grupo: las propiedades que quedaron enlazadas entre sí. */
type Grupo = {
  clave: string
  ids: string[]
  pares: Par[]
  motivos: string[]
  /** Los puntos de la pareja más fuerte del grupo. */
  puntos: number
}

const TEAL = '#1a6470'

/**
 * Qué tan seguro está de que es la misma propiedad.
 *
 * Los cortes salen de cómo se reparten los puntos (ver la migración): una
 * sola señal fuerte —la misma foto, la misma liga de origen— ya vale 80+, y
 * dos señales flojas juntas (dirección + título, 85) también. Una sola señal
 * floja se queda en "puede ser", que es justo lo que hay que ir a revisar.
 */
const NIVELES = [
  { id: 'seguro',   desde: 80, etiqueta: 'Casi seguro',  color: '#b91c1c', desc: 'La misma foto, la misma liga o la misma descripción' },
  { id: 'probable', desde: 60, etiqueta: 'Muy probable', color: '#b45309', desc: 'Varias señales juntas' },
  { id: 'quiza',    desde: 0,  etiqueta: 'Puede ser',    color: '#4b5563', desc: 'Una sola señal: hay que verla' },
] as const
type NivelId = typeof NIVELES[number]['id']
const nivelDe = (puntos: number) => NIVELES.find(n => puntos >= n.desde)!

const COLOR_ESTADO: Record<string, string> = {
  disponible: '#1e7e34', vendida: '#b91c1c', rentada: '#b91c1c',
  apartada: '#b45309', pausada: '#b45309',
}

const pesos = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX')

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })

/**
 * Junta las parejas en grupos.
 *
 * Si A es repetida de B y B de C, las tres son el mismo anuncio y tienen que
 * salir en UNA tarjeta: en tres parejas sueltas se borraría dos veces lo
 * mismo o se dejaría una copia sin querer. Es un union-find de toda la vida.
 */
function agrupar(pares: Par[]): Grupo[] {
  const padre = new Map<string, string>()
  const raiz = (x: string): string => {
    const p = padre.get(x)
    if (!p || p === x) { padre.set(x, x); return x }
    const r = raiz(p)
    padre.set(x, r)
    return r
  }
  const unir = (a: string, b: string) => { padre.set(raiz(a), raiz(b)) }
  for (const p of pares) { raiz(p.a_id); raiz(p.b_id); unir(p.a_id, p.b_id) }

  const porRaiz = new Map<string, Grupo>()
  for (const p of pares) {
    const r = raiz(p.a_id)
    const g = porRaiz.get(r) ?? { clave: r, ids: [], pares: [], motivos: [], puntos: 0 }
    g.pares.push(p)
    for (const id of [p.a_id, p.b_id]) if (!g.ids.includes(id)) g.ids.push(id)
    for (const m of p.motivos) if (!g.motivos.includes(m)) g.motivos.push(m)
    g.puntos = Math.max(g.puntos, p.puntos)
    porRaiz.set(r, g)
  }
  return [...porRaiz.values()].sort((a, b) => b.puntos - a.puntos || b.ids.length - a.ids.length)
}

export default function Duplicados() {
  const c = useColors()
  const [pares, setPares] = useState<Par[]>([])
  const [props, setProps] = useState<Map<string, Prop>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [niveles, setNiveles] = useState<NivelId[]>([])
  const [soloDisponibles, setSoloDisponibles] = useState(false)
  const [descartando, setDescartando] = useState<string | null>(null)

  const enCard = (col: string) => legibleSobre(col, c.card, 4.5)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase.rpc('propiedades_duplicadas')
    if (err) { setError(err.message); setLoading(false); return }
    const lista = (data ?? []) as Par[]
    setPares(lista)

    const ids = [...new Set(lista.flatMap(p => [p.a_id, p.b_id]))]
    if (ids.length === 0) { setProps(new Map()); setLoading(false); return }
    const { data: det, error: err2 } = await supabase.rpc('duplicados_detalle', { ids })
    if (err2) { setError(err2.message); setLoading(false); return }
    setProps(new Map(((det ?? []) as Prop[]).map(p => [p.id, p])))
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const { refreshControl } = usePullRefresh(cargar)

  const grupos = useMemo(() => agrupar(pares), [pares])

  const gruposVisibles = useMemo(() => {
    const q = normalizar(busca)
    return grupos.filter(g => {
      if (niveles.length > 0 && !niveles.includes(nivelDe(g.puntos).id)) return false
      const fichas = g.ids.map(id => props.get(id)).filter(Boolean) as Prop[]
      // Una repetida entre dos vendidas ya no estorba al publicar; con el
      // filtro puesto solo quedan las que siguen saliendo en la app.
      if (soloDisponibles && !fichas.some(f => f.estado === 'disponible')) return false
      if (!q) return true
      return fichas.some(f =>
        normalizar(f.codigo).includes(q) || normalizar(f.titulo).includes(q) ||
        normalizar(f.zona).includes(q) || normalizar(f.direccion).includes(q))
    })
  }, [grupos, niveles, soloDisponibles, busca, props])

  const nPropiedades = useMemo(
    () => new Set(gruposVisibles.flatMap(g => g.ids)).size, [gruposVisibles])

  const conteoNivel = (id: NivelId) => grupos.filter(g => nivelDe(g.puntos).id === id).length

  /** Marca el grupo entero como revisado: no son la misma propiedad. */
  async function descartar(g: Grupo) {
    const fichas = g.ids.map(id => props.get(id)).filter(Boolean) as Prop[]
    const nombres = fichas.map(f => f.codigo ?? '—').join(', ')
    const msg = `${nombres}\n\n¿Marcar que NO son la misma propiedad? Dejan de salir en esta lista. No se borra nada.`
    const seguir = await new Promise<boolean>(res => {
      if (Platform.OS === 'web') { res(window.confirm(msg)); return }
      Alert.alert('No son la misma', msg, [
        { text: 'Cancelar', style: 'cancel', onPress: () => res(false) },
        { text: 'No son la misma', onPress: () => res(true) },
      ])
    })
    if (!seguir) return

    setDescartando(g.clave)
    const uid = (await getUsuarioActual()).data.user?.id ?? null
    // Se descartan TODAS las parejas del grupo: si solo se guardara una, el
    // grupo se volvería a armar con las demás y saldría otra vez.
    const filas = g.pares.map(p => ({ a_id: p.a_id, b_id: p.b_id, user_id: uid }))
    const { error: err } = await supabase
      .from('propiedad_duplicado_descartado')
      .upsert(filas, { onConflict: 'a_id,b_id' })
    setDescartando(null)
    if (err) {
      const m = 'No se pudo guardar: ' + err.message
      if (Platform.OS === 'web') window.alert(m); else Alert.alert('No se guardó', m)
      return
    }
    const fuera = new Set(g.pares.map(p => p.a_id + p.b_id))
    setPares(prev => prev.filter(p => !fuera.has(p.a_id + p.b_id)))
  }

  if (loading) {
    return (
      <View style={[st.centro, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={{ color: c.textSub, marginTop: 10, fontSize: 13 }}>
          Comparando las 2,700 propiedades…
        </Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={st.header}>
        <Text style={[st.h1, { color: c.text }]}>Publicaciones repetidas</Text>
        <Text style={[st.sub, { color: c.textSub }]}>
          {grupos.length === 0
            ? 'No encontré ninguna repetida.'
            : `${gruposVisibles.length} casos · ${nPropiedades} propiedades. Entra a la ficha, compara y borra la que sobre.`}
        </Text>
      </View>

      {error && (
        <View style={[st.error, { borderColor: enCard('#b91c1c') }]}>
          <Ionicons name="warning-outline" size={15} color={enCard('#b91c1c')} />
          <Text style={[st.errorTxt, { color: enCard('#b91c1c') }]}>{error}</Text>
        </View>
      )}

      <View style={[st.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <Ionicons name="search-outline" size={16} color={c.textSub} />
        <TextInput
          style={[st.buscaInp, { color: c.text }]}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por código, título o zona…"
          placeholderTextColor={c.placeholder}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipsScroll} contentContainerStyle={st.chipsRow}>
        {NIVELES.map(n => {
          const on = niveles.includes(n.id)
          const cuantos = conteoNivel(n.id)
          if (cuantos === 0 && !on) return null
          return (
            <TouchableOpacity
              key={n.id}
              style={[st.chip, { borderColor: on ? n.color : c.border, backgroundColor: on ? n.color : c.card }]}
              onPress={() => setNiveles(p => p.includes(n.id) ? p.filter(x => x !== n.id) : [...p, n.id])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[st.chipTxt, { color: on ? '#fff' : c.textSub }]}>{n.etiqueta} · {cuantos}</Text>
            </TouchableOpacity>
          )
        })}
        <View style={[st.separador, { backgroundColor: c.border }]} />
        <TouchableOpacity
          style={[st.chip, { borderColor: soloDisponibles ? TEAL : c.border, backgroundColor: soloDisponibles ? TEAL : c.card }]}
          onPress={() => setSoloDisponibles(v => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: soloDisponibles }}
        >
          <Text style={[st.chipTxt, { color: soloDisponibles ? '#fff' : c.textSub }]}>Solo las que siguen disponibles</Text>
        </TouchableOpacity>
        {(niveles.length > 0 || soloDisponibles) && (
          <TouchableOpacity
            style={[st.chip, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => { setNiveles([]); setSoloDisponibles(false) }}
          >
            <Text style={[st.chipTxt, { color: c.textSub }]}>Quitar filtros</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ScrollView contentContainerStyle={st.lista} refreshControl={refreshControl}>
        {gruposVisibles.length === 0 ? (
          <Text style={[st.vacio, { color: c.textSub }]}>
            {grupos.length === 0
              ? 'Ninguna propiedad parece estar repetida. '
                + 'Si borras una repetida y vuelves a entrar, la lista se recalcula sola.'
              : 'Ningún caso con esos filtros.'}
          </Text>
        ) : gruposVisibles.map(g => {
          const nivel = nivelDe(g.puntos)
          // Ordenadas por fecha de alta: la primera es la que suele tener el
          // historial de publicaciones encima y conviene conservar.
          const fichas = g.ids
            .map(id => props.get(id))
            .filter(Boolean)
            .sort((a, b) => new Date(a!.created_at).getTime() - new Date(b!.created_at).getTime()) as Prop[]

          // Más de cuatro juntas casi nunca son cuatro veces la misma casa:
          // es un desarrollo publicando sus modelos con las mismas fotos y la
          // misma liga. Decir "casi seguro" ahí sería mentir, aunque la
          // pareja más fuerte del grupo lo sea: el encabezado cambia.
          const muchas = fichas.length > 4
          const color = muchas ? '#b45309' : nivel.color
          const tinta = enCard(color)

          return (
            <View key={g.clave} style={[st.grupo, { backgroundColor: c.card, borderColor: mezclar(color, c.border, 0.45) }]}>
              <View style={[st.grupoCabeza, { backgroundColor: mezclar(color, c.card, 0.12) }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.grupoNivel, { color: tinta }]}>
                    {muchas ? `Revísalas una por una · ${fichas.length} fichas` : nivel.etiqueta}
                    {!muchas && fichas.length > 2 ? ` · ${fichas.length} copias` : ''}
                  </Text>
                  <Text style={[st.grupoMotivos, { color: c.textSub }]}>
                    {g.motivos.join(' · ')}
                  </Text>
                  {/* Un caso de muchas copias casi siempre es un desarrollo
                      que publica sus modelos con las mismas fotos, no cinco
                      veces la misma casa. Se avisa en vez de esconderlo. */}
                  {muchas && (
                    <Text style={[st.grupoOjo, { color: tinta }]}>
                      Puede ser un desarrollo que usa las mismas fotos y la misma liga en varios modelos, no la misma casa repetida.
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[st.noEs, { borderColor: c.border }]}
                  onPress={() => descartar(g)}
                  disabled={descartando === g.clave}
                >
                  {descartando === g.clave
                    ? <ActivityIndicator size="small" color={c.textSub} />
                    : <Text style={[st.noEsTxt, { color: c.textSub }]}>No son la misma</Text>}
                </TouchableOpacity>
              </View>

              {fichas.map((f, i) => (
                <View key={f.id} style={[st.ficha, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={st.fotoCaja}>
                    {f.foto
                      ? <ThumbImage url={f.foto} opts={{ width: 220 }} style={st.foto} resizeMode="cover" />
                      : <View style={[st.foto, st.sinFoto, { backgroundColor: mezclar('#64748b', c.card, 0.14) }]}>
                          <Ionicons name="image-outline" size={18} color={c.textSub} />
                        </View>}
                    {/* La más vieja suele ser la buena: es la que lleva
                        historial de publicaciones encima. */}
                    {i === 0 && fichas.length > 1 && (
                      <Text style={[st.masVieja, { color: c.textSub, backgroundColor: c.card }]}>la 1ª</Text>
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={st.fichaCabeza}>
                      <Text style={[st.codigo, { color: c.text }]}>{f.codigo ?? '—'}</Text>
                      <Text style={[st.estado, { color: enCard(COLOR_ESTADO[f.estado ?? ''] ?? '#64748b') }]}>
                        {f.estado ?? 'sin estado'}
                      </Text>
                    </View>
                    <Text style={[st.titulo, { color: c.textSub }]} numberOfLines={2}>{f.titulo ?? 'Sin título'}</Text>
                    <Text style={[st.datos, { color: c.text }]}>
                      {pesos(f.precio)}
                      {f.recamaras != null ? ` · ${f.recamaras} rec` : ''}
                      {f.banos != null ? ` · ${f.banos} baños` : ''}
                      {f.m2 != null ? ` · ${Math.round(Number(f.m2))} m²` : ''}
                    </Text>
                    <Text style={[st.datosSub, { color: c.textSub }]} numberOfLines={1}>
                      Alta {fecha(f.created_at)} · {f.fotos ?? 0} fotos
                      {(f.publicaciones ?? 0) > 0 ? ` · la han publicado ${f.publicaciones}` : ' · nunca publicada'}
                    </Text>

                    <View style={st.botones}>
                      <TouchableOpacity
                        style={[st.btn, { borderColor: enCard(TEAL) }]}
                        onPress={() => router.push(`/(prospectador)/detalle-propiedad?id=${f.id}`)}
                      >
                        <Ionicons name="eye-outline" size={13} color={enCard(TEAL)} />
                        <Text style={[st.btnTxt, { color: enCard(TEAL) }]}>Ver ficha</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.btn, { borderColor: enCard('#b91c1c') }]}
                        onPress={() => router.push(`/(admin)/editar-propiedad?id=${f.id}`)}
                      >
                        <Ionicons name="create-outline" size={13} color={enCard('#b91c1c')} />
                        <Text style={[st.btnTxt, { color: enCard('#b91c1c') }]}>Editar o borrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 16,
    borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  errorTxt: { fontSize: 12.5, fontWeight: '700', flex: 1 },
  buscaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  chipsScroll: { marginTop: 9, height: 46, flexGrow: 0, flexShrink: 0 },
  chipsRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingRight: 24, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  separador: { width: 1, height: 22, opacity: 0.8, marginHorizontal: 2 },
  lista: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20, marginTop: 30 },
  grupo: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  grupoCabeza: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  grupoNivel: { fontSize: 13, fontWeight: '900' },
  grupoMotivos: { fontSize: 11.5, marginTop: 1, lineHeight: 15 },
  grupoOjo: { fontSize: 11.5, fontWeight: '700', marginTop: 4, lineHeight: 15 },
  noEs: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  noEsTxt: { fontSize: 11.5, fontWeight: '800' },
  ficha: { flexDirection: 'row', gap: 10, padding: 11 },
  fotoCaja: { alignItems: 'center' },
  foto: { width: 74, height: 60, borderRadius: 8 },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  masVieja: { fontSize: 9.5, fontWeight: '800', marginTop: 3 },
  fichaCabeza: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  codigo: { fontSize: 14, fontWeight: '900' },
  estado: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  titulo: { fontSize: 12, marginTop: 1 },
  datos: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  datosSub: { fontSize: 11.5, marginTop: 1 },
  botones: { flexDirection: 'row', gap: 7, marginTop: 7 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6,
  },
  btnTxt: { fontSize: 11.5, fontWeight: '800' },
})
