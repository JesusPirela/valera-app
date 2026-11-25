// Asesores externos: quienes nos ATIENDEN LAS CITAS por zona. (A quién le
// pedimos opciones para subir es la otra pantalla, "Colaboradores".)
//
// Las dos listas usan la misma fila (components/FilaDirectorio) para que se
// lean como dos vistas de lo mismo y no como dos apps.
import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
  Modal, Alert, Platform, Linking, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { normalizar } from '../../lib/texto'
import { useColors } from '../../lib/ThemeContext'
import { ESTADOS_MEXICO, ESTADO_PRINCIPAL } from '../../lib/estados-mexico'
import { ZONAS_INTERES } from '../../lib/zonas-interes'
import FilaDirectorio, { MetaFila, fondoFila } from '../../components/FilaDirectorio'
import HojaOrden, { type OpcionOrden } from '../../components/HojaOrden'
import { legibleSobre } from '../../lib/color'

type Tipo = 'alianza' | 'independiente'
type Asesor = {
  id: string; nombre: string; telefono: string | null; zona: string | null
  estado_mx: string | null; tipo: Tipo | null; created_at: string
}
const TEAL = '#1a6470'
/** El morado de las alianzas. El mismo que marca "Por entrar" en
 *  Colaboradores, para que se reconozcan al cambiar de pantalla. */
const MORADO = '#5e35b1'
const TODOS = '__todos__'
/** Pastilla aparte en la fila de zonas: 23 de 41 no tienen una zona con la que
 *  se les pueda mandar una cita. Son dos casos y por eso la pastilla NO dice
 *  "sin zona": 11 traen el campo vacío y 12 traen un recado ahí metido ("por
 *  verse", "Es para alianza"), que en la fila se ve como si fuera una zona. */
const SIN_ZONA = '__sin_zona__'
const DIAS_NUEVO = 7

/**
 * Los dos tipos de asesor externo.
 *
 * No son lo mismo y hasta ahora vivian revueltos: una ALIANZA es un acuerdo
 * con otra inmobiliaria, y un INDEPENDIENTE es alguien que nos apoya por su
 * cuenta. Al mandarle una cita por zona importa saber cual es cual.
 *
 * Las ALIANZAS ya no se quedan en esta lista: una alianza no nos atiende
 * citas, esta a nada de ser COLABORADOR. El 24/nov/2026 las 14 que habia se
 * pasaron a Colaboradores -> Por entrar, y al marcar una nueva como alianza
 * la hoja de edicion ofrece pasarla tambien.
 */
const TIPOS: { valor: Tipo; etiqueta: string; color: string; desc: string }[] = [
  { valor: 'alianza',       etiqueta: 'Alianza',       color: MORADO,    desc: 'Acuerdo con otra inmobiliaria; su lugar es Colaboradores → Por entrar' },
  { valor: 'independiente', etiqueta: 'Independiente', color: '#1a6470', desc: 'Asesor por su cuenta que nos apoya' },
]
const tipoDe = (t: Tipo | null | undefined) => TIPOS.find(x => x.valor === t)
const SIN_TIPO = '#64748b'

const DIA = 86_400_000
function soloTel(t: string | null | undefined) { return (t ?? '').replace(/[^\d+]/g, '') }

/** Alert.alert no pinta nada en web. */
function avisar(titulo: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${msg}`)
  else Alert.alert(titulo, msg)
}

/**
 * ¿Este texto de "zona" sirve como filtro?
 *
 * El campo es libre y ahí acabó de todo: zonas de verdad ("Juriquilla"),
 * recados ("Es para alianza", "NOS DIO SU CATALOGO") y hasta un mensaje de
 * WhatsApp completo de 131 caracteres. Como pastilla de filtro se veían todas
 * igual de válidas y la fila quedaba ilegible: 22 pastillas, una de ellas de
 * un renglón entero.
 *
 * Medido sobre los 30 textos que hay: el largo tumba los 4 mensajes y la lista
 * negra los 4 recados, y quedan 13 zonas reales.
 */
const NOTA_NO_ZONA = /alianza|catalogo|cat[aá]logo|por verse|pendiente|compartir|requerimient|^no\b|^si\b/i
function zonaFiltrable(z: string | null | undefined): boolean {
  const t = (z ?? '').trim()
  return t.length > 0 && t.length <= 24 && !NOTA_NO_ZONA.test(t)
}

/**
 * Las formas de ordenar la lista.
 *
 * "Por zona" es el que hacía falta: la pantalla existe para repartir citas por
 * zona, y agrupado se ve de un jalón a quién se le puede mandar Juriquilla.
 * Deja al final a los 11 que no tienen zona escrita, que son los que no se le
 * pueden mandar a nadie así.
 */
const ORDENES = [
  { valor: 'recientes', etiqueta: 'Más recientes', desc: 'Lo último que se dio de alta, arriba',      icono: 'time-outline' as const },
  { valor: 'zona',      etiqueta: 'Por zona',      desc: 'Agrupados por zona; sin zona, al final',    icono: 'location-outline' as const },
  { valor: 'estado',    etiqueta: 'Por estado',    desc: `${ESTADO_PRINCIPAL} primero, luego los demás`, icono: 'map-outline' as const },
  { valor: 'nombre',    etiqueta: 'Nombre (A–Z)',  desc: 'Alfabético, para buscar uno que ya sabes',  icono: 'text-outline' as const },
] as const
type Orden = typeof ORDENES[number]['valor']

/** Clave de zona para ordenar. Lo que no es zona de verdad se va al final. */
const claveZona = (a: Asesor) => zonaFiltrable(a.zona) ? normalizar(a.zona) : '￿'
/** Igual con el estado: el principal primero, los nulos al final. */
const claveEstado = (a: Asesor) =>
  !a.estado_mx ? '￿' : a.estado_mx === ESTADO_PRINCIPAL ? '' : normalizar(a.estado_mx)

const porNombre = (a: Asesor, b: Asesor) => a.nombre.localeCompare(b.nombre, 'es')

const COMPARA: Record<Orden, (a: Asesor, b: Asesor) => number> = {
  recientes: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  nombre: porNombre,
  zona: (a, b) => claveZona(a).localeCompare(claveZona(b), 'es') || porNombre(a, b),
  estado: (a, b) => claveEstado(a).localeCompare(claveEstado(b), 'es') || claveZona(a).localeCompare(claveZona(b), 'es') || porNombre(a, b),
}

export default function AsesoresExternos() {
  const c = useColors()
  const [lista, setLista] = useState<Asesor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>(TODOS)
  const [filtroZona, setFiltroZona] = useState<string>(TODOS)
  // Los tipos se COMBINAN (alianza + sin clasificar a la vez): antes era uno a
  // la vez y para ver dos había que mirar dos listas.
  const [tiposSel, setTiposSel] = useState<(Tipo | 'sin')[]>([])
  const [soloNuevos, setSoloNuevos] = useState(false)
  // Por fecha de registro de entrada: lo que se acaba de dar de alta es lo que
  // se quiere ver. Las otras cuatro formas están en la hoja de orden.
  const [orden, setOrden] = useState<Orden>('recientes')
  const [hojaOrden, setHojaOrden] = useState(false)
  const [editando, setEditando] = useState<Partial<Asesor> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [pasando, setPasando] = useState(false)
  const [selectorEstadoAbierto, setSelectorEstadoAbierto] = useState(false)
  // El teal está elegido para fondo claro: sobre la tarjeta oscura hay que
  // subirle el brillo sin cambiarle el tono (4.5:1 texto, 3:1 iconos).
  // El morado crudo sobre la hoja oscura queda en 2.08:1 —ilegible—, así que
  // se ajusta como todo lo demás: en claro se queda igual (8.02:1) y en
  // oscuro sube a #9676d6 (4.65:1). Medido, no a ojo.
  const tintaMorado = legibleSobre(MORADO, c.card, 4.5)
  const tintaTeal = legibleSobre(TEAL, c.card, 4.5)
  const iconoTeal = legibleSobre(TEAL, c.card, 3)

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await supabase.from('asesores_externos')
        .select('id, nombre, telefono, zona, estado_mx, tipo, created_at')
        .order('created_at', { ascending: false })
      setLista((data ?? []) as Asesor[])
    } catch { /* red */ } finally { setLoading(false); setRefreshing(false) }
  }, [])
  useFocusEffect(useCallback(() => { cargar(true) }, [cargar]))

  async function guardar() {
    if (!editando || !editando.nombre?.trim()) { Alert.alert('Falta el nombre', 'Escribe al menos el nombre del asesor.'); return }
    setGuardando(true)
    const payload = {
      nombre: editando.nombre.trim(),
      telefono: editando.telefono?.trim() || null,
      zona: editando.zona?.trim() || null,
      estado_mx: editando.estado_mx?.trim() || null,
      tipo: editando.tipo ?? null,
    }
    // Se mira el error. Antes se guardaba a ciegas: si la base rechazaba algo,
    // la hoja se cerraba igual y parecia que habia guardado.
    const { error } = editando.id
      ? await supabase.from('asesores_externos').update(payload).eq('id', editando.id)
      : await supabase.from('asesores_externos')
          .insert({ ...payload, created_by: (await getUsuarioActual()).data.user?.id ?? null })
    setGuardando(false)
    if (error) { Alert.alert('No se pudo guardar', error.message); return }
    setEditando(null); cargar(true)
  }

  /**
   * Pasa una alianza a Colaboradores → Por entrar.
   *
   * El orden importa: primero se crea del otro lado y SOLO si eso sale bien se
   * borra de aquí. Las dos tablas no dejan pasar a la misma gente —un gerente
   * puede borrar en asesores_externos pero no escribir en colaboradores— y al
   * revés el registro se perdería sin dejar rastro.
   */
  async function pasarAColaboradores(a: Partial<Asesor>) {
    if (!a.id || !a.nombre) return
    // Sin "venía de asesores externos": la etiqueta morada "Por entrar" ya lo
    // dice, y repetido en cada fila solo tapa lo que sí importa. Lo que traía
    // escrito en la zona sí se lleva: en varias no era una zona sino el recado
    // del trato ("Quieren que le digamos cuáles nos interesan...").
    const notas = [
      a.zona?.trim() ? `Zona/nota: ${a.zona.trim()}` : null,
      a.estado_mx && a.estado_mx !== ESTADO_PRINCIPAL ? `Estado: ${a.estado_mx}` : null,
    ].filter(Boolean).join(' · ') || null

    setPasando(true)
    const { error } = await supabase.from('colaboradores').insert({
      nombre: a.nombre.trim(),
      contacto: a.telefono?.trim() || null,
      en_app: null,
      etapa: 'por_entrar',
      relevancia: 0,
      notas,
    })
    if (error) {
      setPasando(false)
      avisar('No se pudo pasar', error.message)
      return
    }
    const { error: errBorrar } = await supabase.from('asesores_externos').delete().eq('id', a.id)
    setPasando(false)
    if (errBorrar) {
      // Se dice la verdad: quedó en las dos listas y hay que quitarla a mano.
      avisar('Quedó en las dos listas', `Ya está en Colaboradores, pero no se pudo borrar de aquí: ${errBorrar.message}`)
      cargar(true)
      return
    }
    setLista(prev => prev.filter(x => x.id !== a.id))
    setEditando(null)
    avisar('Listo', `"${a.nombre.trim()}" ya está en Colaboradores → Por entrar.`)
  }

  function confirmarPaso(a: Partial<Asesor>) {
    const msg = `"${a.nombre}" sale de Asesores externos y entra en Colaboradores, en el apartado "Por entrar". Se lleva su teléfono y lo que tenga escrito en la zona.`
    if (Platform.OS === 'web') { if (window.confirm(msg)) pasarAColaboradores(a) }
    else Alert.alert('Pasar a Colaboradores', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pasarla', onPress: () => pasarAColaboradores(a) },
    ])
  }

  function borrar(a: Partial<Asesor>) {
    const go = async () => {
      setLista(prev => prev.filter(x => x.id !== a.id))
      setEditando(null)
      await supabase.from('asesores_externos').delete().eq('id', a.id!)
    }
    if (Platform.OS === 'web') { if (window.confirm(`¿Borrar a ${a.nombre}?`)) go() }
    else Alert.alert('Borrar asesor', `¿Borrar a ${a.nombre}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  // Estados/zonas presentes en los datos (no el catálogo completo de 32 estados),
  // para que el filtro solo muestre pastillas con resultados reales.
  const estadosPresentes = useMemo(() =>
    [...new Set(lista.map(a => a.estado_mx).filter((e): e is string => !!e))]
      .sort((a, b) => a === ESTADO_PRINCIPAL ? -1 : b === ESTADO_PRINCIPAL ? 1 : a.localeCompare(b, 'es')),
    [lista])

  /** Sale la fila de estados solo si el estado deja de ser un detalle: al
   *  menos 3 registros fuera del estado principal, o un filtro ya puesto. */
  const hayVariosEstados = useMemo(() => {
    if (filtroEstado !== TODOS) return true
    if (estadosPresentes.length < 2) return false
    return lista.filter(a => a.estado_mx && a.estado_mx !== ESTADO_PRINCIPAL).length >= 3
  }, [lista, estadosPresentes, filtroEstado])

  const listaPorEstado = useMemo(() =>
    filtroEstado === TODOS ? lista : lista.filter(a => a.estado_mx === filtroEstado),
    [lista, filtroEstado])

  // Las zonas se agrupan sin acentos ni mayúsculas, porque "Queretaro" y
  // "queretaro" se escribieron las dos y salían como dos pastillas distintas.
  // De cada grupo se enseña la versión mejor escrita (la que trae mayúscula).
  const zonasPresentes = useMemo(() => {
    const grupos = new Map<string, { etiqueta: string; n: number }>()
    for (const a of listaPorEstado) {
      if (!zonaFiltrable(a.zona)) continue
      const t = a.zona!.trim()
      const clave = normalizar(t)
      const prev = grupos.get(clave)
      const mejor = !prev || (/[A-ZÁÉÍÓÚÑ]/.test(t) && !/[A-ZÁÉÍÓÚÑ]/.test(prev.etiqueta))
        ? t : prev.etiqueta
      grupos.set(clave, { etiqueta: mejor, n: (prev?.n ?? 0) + 1 })
    }
    return [...grupos.entries()]
      .map(([clave, v]) => ({ clave, ...v }))
      .sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es'))
  }, [listaPorEstado])

  const filtrados = useMemo(() => {
    const q = normalizar(busca)
    const qDig = busca.replace(/\D/g, '')
    return listaPorEstado.filter(a =>
      (!q || normalizar(a.nombre).includes(q) || normalizar(a.zona).includes(q)
          || normalizar(a.estado_mx).includes(q)) &&
      (qDig.length === 0 || soloTel(a.telefono).includes(qDig)) &&
      (filtroZona === TODOS
        || (filtroZona === SIN_ZONA ? !zonaFiltrable(a.zona) : normalizar(a.zona) === filtroZona)) &&
      // Varios tipos a la vez suman entre ellos, y se cruzan con la zona y el
      // estado: "alianzas de Juriquilla" es una sola lista.
      (tiposSel.length === 0 || tiposSel.some(t => t === 'sin' ? !a.tipo : a.tipo === t)) &&
      (!soloNuevos || Date.now() - new Date(a.created_at).getTime() < DIAS_NUEVO * DIA)
    ).sort(COMPARA[orden])
  }, [listaPorEstado, busca, filtroZona, tiposSel, soloNuevos, orden])

  const nuevos = useMemo(() =>
    listaPorEstado.filter(a => Date.now() - new Date(a.created_at).getTime() < DIAS_NUEVO * DIA).length,
    [listaPorEstado])
  const sinZona = useMemo(() => listaPorEstado.filter(a => !zonaFiltrable(a.zona)).length, [listaPorEstado])
  const hayFiltro = tiposSel.length > 0 || soloNuevos || filtroZona !== TODOS || filtroEstado !== TODOS || !!busca.trim()
  const ordenActual = ORDENES.find(o => o.valor === orden)!

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  const conTipo = (v: Tipo | 'sin') =>
    v === 'sin' ? listaPorEstado.filter(a => !a.tipo).length
    : listaPorEstado.filter(a => a.tipo === v).length

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={[st.h1, { color: c.text }]}>Asesores externos</Text>
          <Text style={[st.sub, { color: c.textSub }]}>
            {/* Con filtros puestos el subtítulo dice cuántos quedaron: si no,
                una lista corta parece una lista sin registros. */}
            {hayFiltro
              ? `${filtrados.length} de ${lista.length} · ${ordenActual.etiqueta.toLowerCase()}`
              : `Nos atienden las citas por zona. ${lista.length} registrados.`}
          </Text>
        </View>
        <TouchableOpacity
          style={st.btnNuevo}
          onPress={() => setEditando({ nombre: '', telefono: '', zona: '', estado_mx: ESTADO_PRINCIPAL })}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={st.btnNuevoTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={[st.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <Ionicons name="search-outline" size={16} color={c.textSub} />
        <TextInput style={[st.buscaInp, { color: c.text }]} value={busca} onChangeText={setBusca}
          placeholder="Buscar por nombre, zona o teléfono…" placeholderTextColor={c.placeholder} />
      </View>

      {/* Tipo y orden en UNA sola fila. Antes el tipo llevaba su propio título
          en mayúsculas y el orden iba en otro renglón: tres renglones de
          controles antes de ver al primer asesor. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipsScroll} contentContainerStyle={st.chipsRow}>
        <TouchableOpacity
          style={[st.chip, st.chipOrden, { borderColor: tintaTeal, backgroundColor: c.card }]}
          onPress={() => setHojaOrden(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ordenar por. Ahora: ${ordenActual.etiqueta}`}
        >
          <Ionicons name="swap-vertical" size={13} color={iconoTeal} />
          <Text style={[st.chipTxt, { color: tintaTeal }]}>{ordenActual.etiqueta}</Text>
          <Ionicons name="chevron-down" size={12} color={iconoTeal} />
        </TouchableOpacity>

        <View style={[st.separador, { backgroundColor: c.border }]} />

        {/* Los tipos se combinan. El color activo es el del propio tipo, que ya
            se midió sobre blanco; "Sin clasificar" lleva su ámbar. */}
        {([...TIPOS.map(t => [t.valor, t.etiqueta, t.color] as const),
           ['sin', 'Sin clasificar', '#b45309'] as const,
          ]).map(([valor, etiqueta, color]) => {
          const on = tiposSel.includes(valor as Tipo | 'sin')
          const n = conTipo(valor as Tipo | 'sin')
          if (n === 0 && !on) return null
          return (
            <TouchableOpacity
              key={valor}
              style={[st.chip, { borderColor: on ? color : c.border, backgroundColor: on ? color : c.card }]}
              onPress={() => setTiposSel(prev => prev.includes(valor as Tipo | 'sin')
                ? prev.filter(x => x !== valor)
                : [...prev, valor as Tipo | 'sin'])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[st.chipTxt, { color: on ? '#fff' : c.textSub }]}>{etiqueta} · {n}</Text>
            </TouchableOpacity>
          )
        })}

        {nuevos > 0 && (
          <TouchableOpacity
            style={[st.chip, st.chipOrden, { borderColor: c.border, backgroundColor: c.card }, soloNuevos && st.chipOn]}
            onPress={() => setSoloNuevos(v => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: soloNuevos }}
          >
            <Ionicons name="sparkles-outline" size={12} color={soloNuevos ? '#fff' : c.textSub} />
            <Text style={[st.chipTxt, { color: c.textSub }, soloNuevos && st.chipTxtOn]}>De esta semana · {nuevos}</Text>
          </TouchableOpacity>
        )}

        {hayFiltro && !busca.trim() && (
          <TouchableOpacity
            style={[st.chip, st.chipOrden, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={() => { setTiposSel([]); setSoloNuevos(false); setFiltroZona(TODOS); setFiltroEstado(TODOS) }}
          >
            <Ionicons name="close" size={12} color={c.textSub} />
            <Text style={[st.chipTxt, { color: c.textSub }]}>Quitar filtros</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <HojaOrden
        visible={hojaOrden}
        opciones={ORDENES as unknown as OpcionOrden<Orden>[]}
        valor={orden}
        onElegir={setOrden}
        onCerrar={() => setHojaOrden(false)}
      />

      {/* La fila de estados solo sale cuando de verdad hay varios estados que
          separar. Hoy 39 de 41 son de Querétaro y los otros dos son uno de
          Nuevo León y uno de Quintana Roo: un renglón fijo de filtros para
          dos registros. Esos dos se encuentran escribiendo el estado en el
          buscador, que ahora también busca por estado. */}
      {hayVariosEstados && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipsScroll} contentContainerStyle={st.chipsRow}>
          <TouchableOpacity
            style={[st.chip, { borderColor: c.border, backgroundColor: c.card }, filtroEstado === TODOS && st.chipOn]}
            onPress={() => { setFiltroEstado(TODOS); setFiltroZona(TODOS) }}
          >
            <Text style={[st.chipTxt, { color: c.textSub }, filtroEstado === TODOS && st.chipTxtOn]}>Todos los estados</Text>
          </TouchableOpacity>
          {estadosPresentes.map(e => (
            <TouchableOpacity
              key={e}
              style={[st.chip, { borderColor: c.border, backgroundColor: c.card }, filtroEstado === e && st.chipOn]}
              onPress={() => { setFiltroEstado(prev => prev === e ? TODOS : e); setFiltroZona(TODOS) }}
            >
              <Text style={[st.chipTxt, { color: c.textSub }, filtroEstado === e && st.chipTxtOn]}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(zonasPresentes.length > 1 || sinZona > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipsScroll} contentContainerStyle={st.chipsRow}>
          <Ionicons name="location-outline" size={14} color={c.textSub} style={{ marginRight: 2 }} />
          <TouchableOpacity
            style={[st.chip, { borderColor: c.border, backgroundColor: c.card }, filtroZona === TODOS && st.chipOn]}
            onPress={() => setFiltroZona(TODOS)}
          >
            <Text style={[st.chipTxt, { color: c.textSub }, filtroZona === TODOS && st.chipTxtOn]}>Todas las zonas</Text>
          </TouchableOpacity>
          {zonasPresentes.map(z => (
            <TouchableOpacity
              key={z.clave}
              style={[st.chip, { borderColor: c.border, backgroundColor: c.card }, filtroZona === z.clave && st.chipOn]}
              onPress={() => setFiltroZona(prev => prev === z.clave ? TODOS : z.clave)}
            >
              <Text style={[st.chipTxt, { color: c.textSub }, filtroZona === z.clave && st.chipTxtOn]}>
                {z.etiqueta}{z.n > 1 ? ` · ${z.n}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Al final, los que no tienen una zona con la que repartirles una
              cita, y hasta ahora no había forma de sacarlos de la lista para
              irlos completando. */}
          {sinZona > 0 && (
            <TouchableOpacity
              style={[st.chip, { borderColor: c.border, backgroundColor: c.card }, filtroZona === SIN_ZONA && st.chipOn]}
              onPress={() => setFiltroZona(prev => prev === SIN_ZONA ? TODOS : SIN_ZONA)}
            >
              <Text style={[st.chipTxt, { color: c.textSub }, filtroZona === SIN_ZONA && st.chipTxtOn]}>
                Zona por definir · {sinZona}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={st.lista}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(true) }} tintColor={TEAL} />}
      >
        {filtrados.length === 0 ? (
          <Text style={[st.vacio, { color: c.textSub }]}>
            {lista.length === 0 ? 'Aún no hay asesores externos. Toca "Nuevo" para registrar el primero.' : 'Sin resultados.'}
          </Text>
        ) : filtrados.map(a => {
          const t = tipoDe(a.tipo)
          const tel = soloTel(a.telefono)
          const reciente = Date.now() - new Date(a.created_at).getTime() < 7 * DIA
          const acento = t?.color ?? SIN_TIPO
          // El rectángulo va teñido con su color, así que el gris del segundo
          // renglón se mide contra ESE fondo: sobre el ámbar en tema oscuro
          // el c.textSub de siempre caía a 4.30:1.
          const sub = legibleSobre(c.textSub, fondoFila(acento, c.card), 4.5)
          return (
            <FilaDirectorio
              key={a.id}
              acento={acento}
              inicial={a.nombre.trim().charAt(0).toUpperCase() || '?'}
              titulo={a.nombre}
              onPress={() => setEditando(a)}
              // Junto al nombre va UNA sola pastilla, y solo cuando SÍ está
              // clasificado: 23 de 41 no tienen tipo, y poner "Sin clasificar"
              // en más de la mitad de las filas no informa, nomás llena. Esos
              // se reconocen por el gris del borde y se buscan con su pastilla
              // de filtro.
              pastillas={[t && { texto: t.etiqueta, color: t.color }]}
              meta={
                <MetaFila partes={[
                  a.zona || a.estado_mx
                    ? <View key="z" style={st.zonaRow}>
                        <Ionicons name="location-outline" size={12} color={sub} />
                        <Text style={[st.zonaTxt, { color: sub }]} numberOfLines={1}>
                          {[a.zona, a.estado_mx].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    : null,
                  a.telefono,
                  // "Nuevo" como texto y no como pastilla: con el orden por
                  // más recientes ya salen arriba, no hace falta que además
                  // le quiten ancho al nombre.
                  reciente ? 'Nuevo' : null,
                ]} />
              }
              acciones={[
                !!tel && {
                  icono: 'logo-whatsapp' as const, color: '#128C7E',
                  onPress: () => Linking.openURL(`https://wa.me/${tel.replace(/^\+/, '')}`),
                  etiqueta: 'WhatsApp',
                },
                !!tel && {
                  icono: 'call' as const, color: TEAL,
                  onPress: () => Linking.openURL(`tel:${tel}`),
                  etiqueta: 'Llamar',
                },
              ]}
            />
          )
        })}
      </ScrollView>

      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <View style={st.overlay}>
          <ScrollView style={[st.sheet, { backgroundColor: c.card }]} contentContainerStyle={{ paddingBottom: 10 }}>
            <View style={st.handle} />
            <Text style={[st.mTit, { color: c.text }]}>{editando?.id ? 'Editar asesor' : 'Nuevo asesor externo'}</Text>

            <Text style={[st.lbl, { color: c.textSub }]}>Nombre</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.nombre ?? ''} onChangeText={v => setEditando(e => ({ ...e, nombre: v }))}
              placeholder="Nombre del asesor" placeholderTextColor={c.placeholder} autoCapitalize="words" />

            <Text style={[st.lbl, { color: c.textSub }]}>Teléfono</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.telefono ?? ''} onChangeText={v => setEditando(e => ({ ...e, telefono: v }))}
              placeholder="Ej. 442 123 4567" placeholderTextColor={c.placeholder} keyboardType="phone-pad" />

            <Text style={[st.lbl, { color: c.textSub }]}>¿Qué tipo de asesor es?</Text>
            <View style={st.tipoOpciones}>
              {TIPOS.map(t => {
                const on = editando?.tipo === t.valor
                return (
                  <TouchableOpacity
                    key={t.valor}
                    style={[st.tipoOpcion, { borderColor: on ? t.color : c.inputBorder, backgroundColor: on ? t.color + '12' : c.input }]}
                    onPress={() => setEditando(e => ({ ...e, tipo: on ? null : t.valor }))}
                  >
                    <View style={[st.tipoRadio, { borderColor: on ? t.color : c.border }]}>
                      {on && <View style={[st.tipoRadioDot, { backgroundColor: t.color }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.tipoOpcionTit, { color: on ? t.color : c.text }]}>{t.etiqueta}</Text>
                      <Text style={[st.tipoOpcionSub, { color: c.textSub }]}>{t.desc}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Solo con la alianza ya guardada: pasarla crea el registro del
                otro lado, y hacerlo con una que todavía no existe aquí
                dejaría dos formas de dar de alta lo mismo. */}
            {editando?.id && editando?.tipo === 'alianza' && (
              <TouchableOpacity
                style={[st.pasarBtn, { borderColor: legibleSobre(MORADO, c.card, 3) }, pasando && { opacity: 0.6 }]}
                onPress={() => confirmarPaso(editando)}
                disabled={pasando}
              >
                {pasando ? <ActivityIndicator color={tintaMorado} /> : (
                  <>
                    <Ionicons name="arrow-forward-circle-outline" size={17} color={legibleSobre(MORADO, c.card, 3)} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.pasarTxt, { color: tintaMorado }]}>Pasar a Colaboradores</Text>
                      <Text style={[st.pasarSub, { color: c.textSub }]}>
                        Una alianza no nos atiende citas: su lugar es "Por entrar".
                      </Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={[st.lbl, { color: c.textSub }]}>Estado</Text>
            <TouchableOpacity
              style={[st.inp, st.selectorBtn, { borderColor: c.inputBorder, backgroundColor: c.input }]}
              onPress={() => setSelectorEstadoAbierto(true)}
            >
              <Text style={{ color: editando?.estado_mx ? c.text : c.placeholder, fontSize: 15 }}>
                {editando?.estado_mx ?? 'Selecciona un estado'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={c.textSub} />
            </TouchableOpacity>

            <Text style={[st.lbl, { color: c.textSub }]}>Zona en la que atiende citas</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.zona ?? ''} onChangeText={v => setEditando(e => ({ ...e, zona: v }))}
              placeholder="Ej. Juriquilla, El Refugio…" placeholderTextColor={c.placeholder} autoCapitalize="words" />

            {editando?.estado_mx === ESTADO_PRINCIPAL && (
              <View style={st.zonaChipsWrap}>
                {ZONAS_INTERES.map(z => (
                  <TouchableOpacity
                    key={z}
                    style={[st.chip, { borderColor: c.border, backgroundColor: c.input }, editando?.zona === z && st.chipOn]}
                    onPress={() => setEditando(e => ({ ...e, zona: z }))}
                  >
                    <Text style={[st.chipTxt, { color: c.textSub }, editando?.zona === z && st.chipTxtOn]}>{z}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={[st.guardarBtn, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={st.guardarTxt}>{editando?.id ? 'Guardar cambios' : 'Agregar asesor'}</Text>}
            </TouchableOpacity>

            {/* Borrar vive aquí y no en la fila: antes era un bote de basura de
                32px pegado al de editar. */}
            {editando?.id && (
              <TouchableOpacity style={st.borrarBtn} onPress={() => borrar(editando)}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
                <Text style={st.borrarTxt}>Borrar asesor</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.cancelar} onPress={() => setEditando(null)}>
              <Text style={[st.cancelarTxt, { color: c.textSub }]}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={selectorEstadoAbierto} transparent animationType="slide" onRequestClose={() => setSelectorEstadoAbierto(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: c.card, maxHeight: '75%' }]}>
            <View style={st.handle} />
            <Text style={[st.mTit, { color: c.text }]}>Selecciona el estado</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ESTADOS_MEXICO.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[st.estadoRow, { borderColor: c.border }]}
                  onPress={() => {
                    setEditando(prev => ({ ...prev, estado_mx: e }))
                    setSelectorEstadoAbierto(false)
                  }}
                >
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: e === editando?.estado_mx ? '800' : '500' }}>{e}</Text>
                  {e === editando?.estado_mx && <Ionicons name="checkmark" size={18} color={TEAL} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={st.cancelar} onPress={() => setSelectorEstadoAbierto(false)}>
              <Text style={[st.cancelarTxt, { color: c.textSub }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12,
  },
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2 },
  btnNuevo: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: TEAL, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8,
  },
  btnNuevoTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  buscaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  // flexGrow/flexShrink en 0: sin eso la lista de abajo (que sí crece) le
  // robaba el alto a estas filas y las tres salían encimadas y cortadas.
  chipsScroll: { marginTop: 9, height: 46, flexGrow: 0, flexShrink: 0 },
  chipsRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingRight: 24, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  chipOrden: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Separa el control de orden de los filtros: pegados se leen como una sola
  // tira de pastillas iguales, y no hacen lo mismo.
  separador: { width: 1, height: 22, opacity: 0.8, marginHorizontal: 2 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  lista: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  zonaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
  zonaTxt: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginTop: 30 },
  tipoOpciones: { gap: 8, marginBottom: 4 },
  tipoOpcion: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 12,
  },
  tipoRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  tipoRadioDot: { width: 10, height: 10, borderRadius: 5 },
  tipoOpcionTit: { fontSize: 14.5, fontWeight: '800' },
  tipoOpcionSub: { fontSize: 11.5, marginTop: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  mTit: { fontSize: 19, fontWeight: '900', marginBottom: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  inp: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  guardarBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pasarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12,
    borderWidth: 1.5, borderRadius: 12, padding: 12,
  },
  pasarTxt: { fontWeight: '800', fontSize: 14 },
  pasarSub: { fontSize: 11.5, marginTop: 1 },
  borrarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  borrarTxt: { color: '#dc2626', fontWeight: '800', fontSize: 13.5 },
  cancelar: { alignItems: 'center', paddingVertical: 10 },
  cancelarTxt: { fontSize: 14, fontWeight: '700' },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zonaChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  estadoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
})
