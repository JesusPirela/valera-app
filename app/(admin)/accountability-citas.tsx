// Accountability de citas — admin / gerencia / supervisión.
//
// Para qué: de septiembre en adelante hay cientos de citas y nadie sabe en qué
// acabaron. Aquí se le pregunta al asesor o al prospectador qué pasó con cada
// una, se deja por escrito, y las gráficas dicen cuántas siguen vivas y
// cuántas se perdieron.
//
// Lee las citas de la tabla de citas de venta (no las copia: así una cita que
// se corrija allá se ve corregida aquí) y les agrega su propio estado, que
// vive en seguimiento_citas. Ver lib/accountability-citas.ts para por qué son
// dos campos distintos.
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Platform, Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import Svg, { Rect, Text as SvgText } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { getUsuarioActual } from '../../lib/sesion'
import { useColors, useTheme } from '../../lib/ThemeContext'
import { normalizar } from '../../lib/texto'
import { legibleSobre, luminancia, mezclar } from '../../lib/color'
import {
  ESTADOS_SEGUIMIENTO, ORDEN_SEGUIMIENTO, infoSeguimiento, GRUPOS, DESDE,
  fechaEfectivaCita, mesDe, mesLegible, colorEstadoCita, PREGUNTAS_RETRO,
  mensajeAccountability, ESTADOS_CITA_VENTA, infoEstadoCita, type EstadoSeguimiento,
} from '../../lib/accountability-citas'
import * as Clipboard from 'expo-clipboard'
import { LinearGradient } from 'expo-linear-gradient'

const TEAL = '#1a6470'
/** Etiqueta de las citas a las que nadie les puso estado. */
const SIN_ESTADO = 'Sin estado'

/** Agrega o quita un valor del conjunto, devolviendo uno nuevo (React lo exige). */
function alternar(set: Set<string>, v: string): Set<string> {
  const n = new Set(set)
  if (n.has(v)) n.delete(v); else n.add(v)
  return n
}

type Fila = {
  id: string
  cliente_nombre: string | null
  telefono: string | null
  detalles_pago: string | null
  interesado_en: string | null
  zona_interesada: string | null
  dia_cita: string | null
  fecha_cita: string | null
  fecha_apartado: string | null
  prospecto: string | null
  coordino: string | null
  atendio: string | null
  estado_seguimiento: string | null
  retro_como_estuvo: string | null
  retro_info_extra: string | null
  retro_plan_accion: string | null
  retro_completada_at: string | null
  // PostgREST devuelve el embebido como objeto o como arreglo segun la
  // relacion; se normaliza con seguimientoDe().
  seguimiento_citas: unknown
}

type Seg = {
  estado: string; notas: string | null; quien_respondio: string | null; actualizado_at: string
  /** Marca NUESTRA: ya se le escribió a alguien por esta cita. */
  contactado?: boolean | null; contactado_at?: string | null
}

function seguimientoDe(f: Fila): Seg | null {
  const s: any = f.seguimiento_citas
  if (!s) return null
  return Array.isArray(s) ? (s[0] ?? null) : s
}

/**
 * El estado de accountability de una cita.
 *
 * Si alguien lo capturó, manda lo capturado. Si no, y la cita ya quedó como
 * "Apartó" en la tabla de citas de venta, se da por cerrada sola: no hay nada
 * que preguntarle al asesor de un cliente que ya apartó.
 *
 * Se DERIVA en vez de escribirse: así una cita que aparte la semana que entra
 * se refleja sin que nadie la toque, y si alguien lo cambia a mano, lo suyo
 * gana sobre esta regla.
 */
function estadoDe(f: Fila): EstadoSeguimiento {
  const guardado = seguimientoDe(f)?.estado
  if (guardado) return guardado as EstadoSeguimiento
  if (infoEstadoCita(f.estado_seguimiento)?.label === 'Apartó') return 'aparto_compro'
  return 'sin_contactar'
}

export default function AccountabilityCitas() {
  const c = useColors()
  const { darkMode } = useTheme()
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState<'lista' | 'graficas'>('lista')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Record<string, string>>({})

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('')
  // Todos los filtros son CONJUNTOS: se acumulan. Tocar "Realizada" y
  // "Cancelada/Reagenda" enseña las dos, en vez de que la segunda reemplace a
  // la primera. Un conjunto vacio significa "todas".
  const [fEstado, setFEstado] = useState<Set<string>>(new Set())
  const [fEstadoCita, setFEstadoCita] = useState<Set<string>>(new Set())
  const [fGrupo, setFGrupo] = useState<Set<string>>(new Set())
  const [fAsesor, setFAsesor] = useState<Set<string>>(new Set())
  const [fProspecto, setFProspecto] = useState<Set<string>>(new Set())
  const [fMes, setFMes] = useState<Set<string>>(new Set())
  const [fCoordino, setFCoordino] = useState<Set<string>>(new Set())
  const [fRetro, setFRetro] = useState<'con' | 'sin' | null>(null)
  // ¿Ya le escribimos por esta cita? Sirve para repartirse el trabajo sin
  // perseguir dos veces a la misma persona.
  const [fContacto, setFContacto] = useState<'si' | 'no' | null>(null)
  // Arranca de la MAS VIEJA a la mas nueva: la revision empieza por la primera
  // cita de septiembre y se avanza hacia hoy, que es como se va a trabajar.
  const [orden, setOrden] = useState<'asc' | 'desc'>('asc')
  // Los filtros arrancan PLEGADOS. Son seis grupos y con 32 asesores y 42
  // prospectadores llenaban la pantalla entera antes de la primera cita.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  // Qué botón acaba de copiar, para confirmarlo ahí mismo: "idDeLaCita|quien".
  const [copiado, setCopiado] = useState<string | null>(null)
  const limpiar = () => {
    setBusqueda(''); setFEstado(new Set()); setFEstadoCita(new Set()); setFGrupo(new Set())
    setFAsesor(new Set()); setFProspecto(new Set()); setFMes(new Set())
    setFCoordino(new Set()); setFRetro(null); setFContacto(null)
  }
  const hayFiltros = !!(busqueda.trim() || fRetro || fContacto) ||
    [fEstado, fEstadoCita, fGrupo, fAsesor, fProspecto, fMes, fCoordino].some(s => s.size > 0)

  const montado = useRef(true)
  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('citas_venta')
      .select(`id, cliente_nombre, telefono, detalles_pago, interesado_en, zona_interesada,
               dia_cita, fecha_cita, fecha_apartado, prospecto, coordino, atendio,
               estado_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion,
               retro_completada_at, seguimiento_citas(estado, notas, quien_respondio, actualizado_at, contactado, contactado_at)`)
      .or(`fecha_cita.gte.${DESDE},fecha_apartado.gte.${DESDE}`)
      .order('fecha_cita', { ascending: false, nullsFirst: false })
      .limit(2000)
    if (montado.current) {
      setFilas((data ?? []) as unknown as Fila[])
      setCargando(false)
    }
  }, [])
  useFocusEffect(useCallback(() => {
    montado.current = true
    cargar()
    return () => { montado.current = false }
  }, [cargar]))

  /**
   * COPIA el mensaje armado para quien atendió o prospectó.
   *
   * No abre WhatsApp a propósito: así se pega donde se quiera —el chat del
   * equipo, un grupo, un correo— y deja de depender de que esa persona tenga
   * su teléfono capturado en el perfil, que es la mitad de la gente.
   */
  async function escribirA(f: Fila, quien: 'asesor' | 'prospectador') {
    const nombre = (quien === 'asesor' ? f.atendio : f.prospecto) ?? ''
    const mensaje = mensajeAccountability({
      paraQuien: nombre,
      cliente: f.cliente_nombre ?? 'el cliente',
      telefono: f.telefono, dia: f.dia_cita,
      propiedad: f.interesado_en, zona: f.zona_interesada,
      estadoCita: f.estado_seguimiento,
    })
    try {
      await Clipboard.setStringAsync(mensaje)
      // La confirmación va en el propio botón: un cuadro de diálogo por cada
      // mensaje estorbaría al ir cita por cita.
      const clave = `${f.id}|${quien}`
      setCopiado(clave)
      setTimeout(() => setCopiado(c2 => (c2 === clave ? null : c2)), 2200)
    } catch {
      // Si el navegador no deja copiar, al menos se enseña para copiarlo a mano.
      Platform.OS === 'web' ? window.alert(mensaje) : Alert.alert('Mensaje', mensaje)
    }
  }

  // ── Guardar lo capturado de una cita ──────────────────────────────────────
  // Recibe SOLO lo que cambia y conserva el resto. Antes pedía estado, notas y
  // quién en cada llamada, y marcar el check habría obligado a reenviar las
  // notas: si alguien las estaba escribiendo en ese momento, se pisaban.
  type Parche = { estado?: EstadoSeguimiento; notas?: string | null; quien?: string | null; contactado?: boolean }
  async function guardar(id: string, cambios: Parche) {
    setGuardando(id)
    const previo = filas
    const ahora = new Date().toISOString()
    const armar = (f: Fila) => {
      const a = seguimientoDe(f)
      const contactado = cambios.contactado ?? a?.contactado ?? false
      return {
        estado: cambios.estado ?? (a?.estado as EstadoSeguimiento | undefined) ?? estadoDe(f),
        notas: cambios.notas !== undefined ? cambios.notas : (a?.notas ?? null),
        quien_respondio: cambios.quien !== undefined ? cambios.quien : (a?.quien_respondio ?? null),
        contactado,
        // La fecha solo se escribe cuando se marca; al desmarcar se borra, para
        // que no quede una fecha de algo que ya decimos que no pasó.
        contactado_at: cambios.contactado === undefined ? (a?.contactado_at ?? null)
                     : cambios.contactado ? ahora : null,
      }
    }
    // Optimista: la pildora cambia al instante y la lista no parpadea.
    setFilas(fs => fs.map(f => f.id !== id ? f : {
      ...f, seguimiento_citas: { ...armar(f), actualizado_at: ahora },
    }))
    try {
      const { data: { user } } = await getUsuarioActual()
      const fila = previo.find(f => f.id === id)!
      const fin = armar(fila)
      const { error } = await supabase.from('seguimiento_citas').upsert({
        cita_venta_id: id,
        ...fin,
        contactado_por: fin.contactado ? (user?.id ?? null) : null,
        actualizado_por: user?.id ?? null,
        actualizado_at: ahora,
      }, { onConflict: 'cita_venta_id' })
      if (error) {
        setFilas(previo)   // revertir: que no se vea guardado algo que no se guardo
        const m = `No se pudo guardar: ${error.message}`
        Platform.OS === 'web' ? window.alert(m) : Alert.alert('Error', m)
      }
    } finally {
      setGuardando(null)
    }
  }

  // ── Listas para los filtros, con su conteo ────────────────────────────────
  const { asesores, prospectadores, meses, coordinadores, estadosCita } = useMemo(() => {
    const cuenta = (sel: (f: Fila) => string | null) => {
      const m = new Map<string, number>()
      for (const f of filas) {
        const v = (sel(f) ?? '').trim()
        if (v) m.set(v, (m.get(v) ?? 0) + 1)
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    return {
      asesores: cuenta(f => f.atendio),
      prospectadores: cuenta(f => f.prospecto),
      coordinadores: cuenta(f => f.coordino),
      // El estado con el que quedo la cita: realizada, reagenda, aparto...
      // Faltaba y es justo por el que se busca ("¿donde estan las realizadas?").
      estadosCita: cuenta(f => f.estado_seguimiento ?? SIN_ESTADO),
      meses: cuenta(f => mesDe(fechaEfectivaCita(f))).sort((a, b) => b[0].localeCompare(a[0])),
    }
  }, [filas])

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return filas.filter(f => {
      const seg = seguimientoDe(f)
      const est = estadoDe(f)
      // Un conjunto vacio no filtra nada; con elementos, basta con pertenecer.
      if (fEstado.size && !fEstado.has(est)) return false
      if (fEstadoCita.size && !fEstadoCita.has((f.estado_seguimiento ?? SIN_ESTADO).trim())) return false
      if (fGrupo.size && !fGrupo.has(infoSeguimiento(est).grupo)) return false
      if (fAsesor.size && !fAsesor.has((f.atendio ?? '').trim())) return false
      if (fProspecto.size && !fProspecto.has((f.prospecto ?? '').trim())) return false
      if (fCoordino.size && !fCoordino.has((f.coordino ?? '').trim())) return false
      if (fMes.size && !fMes.has(mesDe(fechaEfectivaCita(f)) ?? '')) return false
      if (fRetro === 'con' && !f.retro_completada_at) return false
      if (fRetro === 'sin' && f.retro_completada_at) return false
      if (fContacto === 'si' && !seguimientoDe(f)?.contactado) return false
      if (fContacto === 'no' && seguimientoDe(f)?.contactado) return false
      if (q) {
        const heno = normalizar([f.cliente_nombre, f.telefono, f.interesado_en, f.zona_interesada,
          f.prospecto, f.coordino, f.atendio, seg?.notas].filter(Boolean).join(' | '))
        if (!q.split(/\s+/).every(p => heno.includes(p))) return false
      }
      return true
    })
    // Por fecha de la cita. Las que no tienen fecha van al final: no se pueden
    // ordenar y mezclarlas entre las fechadas solo confunde.
    .sort((a, b) => {
      const fa = fechaEfectivaCita(a), fb = fechaEfectivaCita(b)
      if (!fa && !fb) return 0
      if (!fa) return 1
      if (!fb) return -1
      return orden === 'asc' ? fa.localeCompare(fb) : fb.localeCompare(fa)
    })
  }, [filas, busqueda, fEstado, fEstadoCita, fGrupo, fAsesor, fProspecto, fCoordino, fMes, fRetro, fContacto, orden])

  // Los conteos de los chips de estado se calculan sobre lo filtrado por TODO
  // lo demas: asi el numero que ves es el que vas a obtener al tocarlo.
  const conteoEstados = useMemo(() => {
    const base = filas.filter(f => {
      if (fAsesor.size && !fAsesor.has((f.atendio ?? '').trim())) return false
      if (fProspecto.size && !fProspecto.has((f.prospecto ?? '').trim())) return false
      if (fCoordino.size && !fCoordino.has((f.coordino ?? '').trim())) return false
      if (fMes.size && !fMes.has(mesDe(fechaEfectivaCita(f)) ?? '')) return false
      if (fRetro === 'con' && !f.retro_completada_at) return false
      if (fRetro === 'sin' && f.retro_completada_at) return false
      if (fContacto === 'si' && !seguimientoDe(f)?.contactado) return false
      if (fContacto === 'no' && seguimientoDe(f)?.contactado) return false
      return true
    })
    const m = new Map<string, number>()
    for (const f of base) {
      const e = estadoDe(f)
      m.set(e, (m.get(e) ?? 0) + 1)
    }
    return m
  }, [filas, fAsesor, fProspecto, fCoordino, fMes, fRetro, fContacto])

  const fondoPildora = (color: string) => mezclar(color, c.card, darkMode ? 0.22 : 0.12)
  const tintaPildora = (color: string) => legibleSobre(color, fondoPildora(color), 4.5)

  // ── Render ────────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <View style={[s.centro, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={{ color: c.textMute, marginTop: 10 }}>Cargando citas…</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.cabeza, { borderBottomColor: c.border, backgroundColor: c.card }]}>
        <Text style={[s.titulo, { color: c.text }]}>Accountability de citas</Text>
        <Text style={[s.sub, { color: c.textMute }]}>
          {filas.length} citas desde septiembre · {visibles.length} en pantalla
        </Text>
        {/* Sin esto nadie adivina que la tarjeta trae dos colores. */}
        <Text style={[s.leyenda, { color: c.textSub }]}>
          Cada tarjeta va partida: a la izquierda, cómo quedó la cita · a la derecha, en qué quedó el cliente
        </Text>
        <View style={s.tabs}>
          {(['lista', 'graficas'] as const).map(v => (
            <TouchableOpacity
              key={v}
              style={[s.tab, { borderColor: c.border }, vista === v && { backgroundColor: TEAL, borderColor: TEAL }]}
              onPress={() => setVista(v)}
            >
              <Ionicons
                name={v === 'lista' ? 'list-outline' : 'bar-chart-outline'}
                size={14} color={vista === v ? '#fff' : c.textSub}
              />
              <Text style={[s.tabTxt, { color: vista === v ? '#fff' : c.textSub }]}>
                {v === 'lista' ? 'Citas' : 'Gráficas'}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {/* Orden por fecha de la cita. Va aqui arriba y no dentro de los
              filtros porque se cambia a cada rato al revisar. */}
          <TouchableOpacity
            style={[s.tab, { borderColor: c.border }]}
            onPress={() => setOrden(o => (o === 'asc' ? 'desc' : 'asc'))}
          >
            <Ionicons name={orden === 'asc' ? 'arrow-up' : 'arrow-down'} size={14} color={c.textSub} />
            <Text style={[s.tabTxt, { color: c.textSub }]}>
              {orden === 'asc' ? 'Más viejas' : 'Más nuevas'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {vista === 'graficas' ? (
        <Graficas filas={visibles} c={c} fondoPildora={fondoPildora} tintaPildora={tintaPildora} />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={f => f.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          removeClippedSubviews
          initialNumToRender={12}
          ListHeaderComponent={
            <Filtros
              c={c} busqueda={busqueda} setBusqueda={setBusqueda}
              fEstado={fEstado} setFEstado={setFEstado}
              fGrupo={fGrupo} setFGrupo={setFGrupo}
              fAsesor={fAsesor} setFAsesor={setFAsesor}
              fProspecto={fProspecto} setFProspecto={setFProspecto}
              fMes={fMes} setFMes={setFMes}
              fRetro={fRetro} setFRetro={setFRetro}
              fContacto={fContacto} setFContacto={setFContacto}
              fCoordino={fCoordino} setFCoordino={setFCoordino}
              fEstadoCita={fEstadoCita} setFEstadoCita={setFEstadoCita}
              estadosCita={estadosCita}
              abiertos={filtrosAbiertos} setAbiertos={setFiltrosAbiertos}
              asesores={asesores} prospectadores={prospectadores} meses={meses}
              coordinadores={coordinadores}
              conteoEstados={conteoEstados} hayFiltros={hayFiltros} limpiar={limpiar}
              fondoPildora={fondoPildora} tintaPildora={tintaPildora}
            />
          }
          ListEmptyComponent={
            <View style={s.vacio}>
              <Text style={{ fontSize: 34 }}>🔎</Text>
              <Text style={{ color: c.textSub, fontWeight: '700', marginTop: 8 }}>Ninguna cita con esos filtros</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TarjetaCita
              f={item} c={c} abierta={abierta === item.id}
              onAbrir={() => setAbierta(a => a === item.id ? null : item.id)}
              onEstado={(e: EstadoSeguimiento) => guardar(item.id, { estado: e })}
              onNotas={(t: string | null) => guardar(item.id, { notas: t })}
              onContactado={(v: boolean) => guardar(item.id, { contactado: v })}
              guardando={guardando === item.id}
              borrador={borrador[item.id] ?? seguimientoDe(item)?.notas ?? ''}
              setBorrador={(t: string) => setBorrador(b => ({ ...b, [item.id]: t }))}
              fondoPildora={fondoPildora} tintaPildora={tintaPildora}
              onEscribir={escribirA}
              copiado={copiado}
            />
          )}
        />
      )}
    </View>
  )
}

// ── Filtros ─────────────────────────────────────────────────────────────────
// Chips con su conteo en vez de menús: se ve de un golpe cuántas hay de cada
// cosa, y tocar uno nunca deja la lista vacía sin avisar — el número ya lo
// dijo. Los de asesor y prospectador van en un carrusel porque son 32 y 42.
function Filtros(p: any) {
  const { c, conteoEstados, fondoPildora, tintaPildora } = p
  const Chip = ({ activo, label, n, color, onPress }: any) => (
    <TouchableOpacity
      style={[s.chip, { borderColor: c.border },
        activo && { backgroundColor: fondoPildora(color ?? TEAL), borderColor: color ?? TEAL }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.chipTxt, { color: activo ? tintaPildora(color ?? TEAL) : c.textSub }]}>
        {activo ? '✓ ' : ''}{label}{n != null ? ` (${n})` : ''}
      </Text>
    </TouchableOpacity>
  )
  // Los chips ENVUELVEN en vez de deslizarse de lado. Antes se salían por la
  // derecha y no había forma de alcanzarlos: en la computadora la rueda del
  // ratón no mueve una fila horizontal.
  const Grupo = ({ titulo, nota, children }: any) => (
    <>
      <Text style={[s.fLbl, { color: c.textMute }]}>{titulo}</Text>
      {nota ? <Text style={[s.fNota, { color: c.textMute }]}>{nota}</Text> : null}
      <View style={s.chipFila}>{children}</View>
    </>
  )

  // Qué hay puesto, para poder leerlo con el panel cerrado.
  const puestos: string[] = []
  for (const g of p.fGrupo) puestos.push(GRUPOS[g as keyof typeof GRUPOS].label)
  for (const e of p.fEstado) puestos.push(ESTADOS_SEGUIMIENTO[e as EstadoSeguimiento].label)
  for (const e of p.fEstadoCita) puestos.push(e)
  for (const m of p.fMes) puestos.push(mesLegible(m))
  for (const a of p.fCoordino) puestos.push(`Coordinó ${a}`)
  for (const a of p.fAsesor) puestos.push(`Atendió ${a}`)
  for (const a of p.fProspecto) puestos.push(`Prospectó ${a}`)
  if (p.fRetro) puestos.push(p.fRetro === 'con' ? 'Con retro' : 'Sin retro')
  if (p.fContacto) puestos.push(p.fContacto === 'si' ? 'Ya contactadas' : 'Falta contactar')

  return (
    <View style={[s.filtros, { backgroundColor: c.card, borderBottomColor: c.border }]}>
      <View style={s.buscaFila}>
        <Ionicons name="search" size={15} color={c.textMute} />
        <TextInput
          style={[s.busca, { color: c.text }]}
          value={p.busqueda} onChangeText={p.setBusqueda}
          placeholder="Cliente, teléfono, propiedad, asesor, notas…"
          placeholderTextColor={c.textMute}
        />
        {p.hayFiltros && (
          <TouchableOpacity onPress={p.limpiar}>
            <Text style={{ color: '#c0392b', fontWeight: '800', fontSize: 12 }}>✕ Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[s.filtrosCabeza, { borderColor: c.border }]}
        onPress={() => p.setAbiertos(!p.abiertos)}
        activeOpacity={0.7}
      >
        <Ionicons name="options-outline" size={16} color={TEAL} />
        <Text style={[s.filtrosCabezaTxt, { color: c.text }]} numberOfLines={1}>
          {puestos.length === 0 ? 'Filtros' : puestos.join(' · ')}
        </Text>
        <Ionicons name={p.abiertos ? 'chevron-up' : 'chevron-down'} size={16} color={c.textMute} />
      </TouchableOpacity>

      {p.abiertos && (
        <>
          {/* El estado con el que quedó la cita. Faltaba, y es por el que más
              se busca: "¿dónde están las realizadas?". */}
          <Grupo titulo="EN QUÉ QUEDÓ LA CITA" nota="Se pueden marcar varios a la vez">
            <Chip activo={p.fEstadoCita.size === 0} label="Todas" onPress={() => p.setFEstadoCita(new Set())} />
            {ESTADOS_CITA_VENTA.map(e => (
              <Chip
                key={e.label}
                activo={p.fEstadoCita.has(e.label)}
                label={`${e.emoji} ${e.label}`}
                n={p.estadosCita.find(([k]: any) => k === e.label)?.[1] ?? 0}
                color={e.color}
                onPress={() => p.setFEstadoCita(alternar(p.fEstadoCita, e.label))}
              />
            ))}
            <Chip
              activo={p.fEstadoCita.has(SIN_ESTADO)}
              label={SIN_ESTADO}
              n={p.estadosCita.find(([k]: any) => k === SIN_ESTADO)?.[1] ?? 0}
              onPress={() => p.setFEstadoCita(alternar(p.fEstadoCita, SIN_ESTADO))}
            />
          </Grupo>

          <Grupo titulo="EN QUÉ QUEDÓ EL CLIENTE" nota="Lo que contestó el asesor cuando le preguntamos">
            <Chip activo={p.fEstado.size === 0 && p.fGrupo.size === 0} label="Todas"
                  onPress={() => { p.setFEstado(new Set()); p.setFGrupo(new Set()) }} />
            {Object.entries(GRUPOS).map(([k, g]: any) => (
              <Chip key={k} activo={p.fGrupo.has(k)} label={g.label} color={g.color}
                    onPress={() => p.setFGrupo(alternar(p.fGrupo, k))} />
            ))}
            {ORDEN_SEGUIMIENTO.map(e => (
              <Chip key={e} activo={p.fEstado.has(e)} label={ESTADOS_SEGUIMIENTO[e].label}
                    n={conteoEstados.get(e) ?? 0} color={ESTADOS_SEGUIMIENTO[e].color}
                    onPress={() => p.setFEstado(alternar(p.fEstado, e))} />
            ))}
          </Grupo>

          <Grupo titulo="MES DE LA CITA">
            <Chip activo={p.fMes.size === 0} label="Todos" onPress={() => p.setFMes(new Set())} />
            {p.meses.map(([m, n]: any) => (
              <Chip key={m} activo={p.fMes.has(m)} label={mesLegible(m)} n={n}
                    onPress={() => p.setFMes(alternar(p.fMes, m))} />
            ))}
          </Grupo>

          {/* Coordinó va primero: es el dato que más se usa para pedir cuentas. */}
          <Grupo titulo="QUIÉN COORDINÓ">
            <Chip activo={p.fCoordino.size === 0} label="Todos" onPress={() => p.setFCoordino(new Set())} />
            {p.coordinadores.map(([a, n]: any) => (
              <Chip key={a} activo={p.fCoordino.has(a)} label={a} n={n}
                    onPress={() => p.setFCoordino(alternar(p.fCoordino, a))} />
            ))}
          </Grupo>

          <Grupo titulo="ASESOR QUE ATENDIÓ">
            <Chip activo={p.fAsesor.size === 0} label="Todos" onPress={() => p.setFAsesor(new Set())} />
            {p.asesores.map(([a, n]: any) => (
              <Chip key={a} activo={p.fAsesor.has(a)} label={a} n={n}
                    onPress={() => p.setFAsesor(alternar(p.fAsesor, a))} />
            ))}
          </Grupo>

          <Grupo titulo="QUIÉN PROSPECTÓ">
            <Chip activo={p.fProspecto.size === 0} label="Todos" onPress={() => p.setFProspecto(new Set())} />
            {p.prospectadores.map(([a, n]: any) => (
              <Chip key={a} activo={p.fProspecto.has(a)} label={a} n={n}
                    onPress={() => p.setFProspecto(alternar(p.fProspecto, a))} />
            ))}
          </Grupo>

          <Grupo titulo="¿YA LE ESCRIBIMOS?" nota="Nuestra gestión, no lo que contestó el asesor.">
            <Chip activo={p.fContacto === 'si'} label="Ya le escribimos" color="#188741"
                  onPress={() => p.setFContacto(p.fContacto === 'si' ? null : 'si')} />
            <Chip activo={p.fContacto === 'no'} label="Falta escribirle" color="#9a7018"
                  onPress={() => p.setFContacto(p.fContacto === 'no' ? null : 'no')} />
          </Grupo>

          <Grupo titulo="RETRO">
            <Chip activo={p.fRetro === 'con'} label="Con retro escrita"
                  onPress={() => p.setFRetro(p.fRetro === 'con' ? null : 'con')} />
            <Chip activo={p.fRetro === 'sin'} label="Sin retro"
                  onPress={() => p.setFRetro(p.fRetro === 'sin' ? null : 'sin')} />
          </Grupo>
        </>
      )}
    </View>
  )
}

// ── Una cita ────────────────────────────────────────────────────────────────
// Cerrada enseña lo mínimo para reconocerla; abierta, todo lo demás y el
// editor. Así caben muchas en pantalla sin perder el detalle.
function TarjetaCita({ f, c, abierta, onAbrir, onEstado, onNotas, onContactado, guardando, borrador, setBorrador, fondoPildora, tintaPildora, onEscribir, copiado }: any) {
  const seg = seguimientoDe(f)
  const est = estadoDe(f)
  const info = infoSeguimiento(est)
  const fondo = fondoPildora(info.color)
  const tinta = tintaPildora(info.color)

  // Los DOS colores de la tarjeta, partida.
  //
  // Una cita tiene dos estados y los dos importan: con el que QUEDÓ LA CITA
  // (reagenda, realizada, apartó…) y en qué QUEDÓ EL CLIENTE después
  // (descartado, hay que mandarle opciones…). Antes la tarjeta pintaba uno
  // solo: mientras nadie capturara el nuevo mandaba el de la cita, y en cuanto
  // alguien lo capturaba el de la cita desaparecía — una reagenda ya marcada
  // como descartada se veía igual que una realizada descartada.
  //
  // Así que el cuadro va partido en el ancho: el tercio izquierdo lleva el
  // color de la cita y el resto el del cliente, con una franja a todo color en
  // cada orilla. Izquierda = antes, derecha = ahora, como se lee. Cuando falta
  // uno de los dos, el que hay pinta la tarjeta completa y no hay partición:
  // media tarjeta gris no diría nada.
  const colorCita = f.estado_seguimiento ? colorEstadoCita(f.estado_seguimiento) : null
  const sinCapturar = est === 'sin_contactar'
  const colorNuevo = sinCapturar ? null : info.color
  // Aclarado lo justo para que se vea sobre la tarjeta: el rojo de
  // 'Descartado' (#9b2020) quedaba en 2.08:1 contra el fondo oscuro y la
  // franja prácticamente desaparecía. Sube la luminosidad, no cambia el tono:
  // sigue siendo rojo. En tema claro ninguno lo necesita y no se toca nada.
  const visible = (col: string) => legibleSobre(col, c.card, 3)
  const colorIzq = visible(colorCita ?? colorNuevo ?? '#8a94a6')
  const colorDer = visible(colorNuevo ?? colorCita ?? '#8a94a6')
  const partida = !!colorCita && !!colorNuevo && colorCita !== colorNuevo
  // La mezcla es suave a propósito: el texto va encima y tiene que seguir
  // leyéndose. Las franjas de las orillas van a todo color para que el tono se
  // distinga aunque el fondo sea tenue.
  // En oscuro la mezcla tiene que ser más fuerte: sobre un fondo casi negro
  // un 13% de color no se distingue, y entonces la partición —que es justo lo
  // que hay que ver de un vistazo— se pierde.
  //
  // Y las cerradas van más cargadas todavía: el oro es el color más apagado
  // de la lista y una venta cerrada es la única tarjeta que tiene que gritar
  // mientras uno baja. El tono no cambia, solo cuánto se carga.
  const alfa = (luminancia(c.card) < 0.18 ? 0.2 : 0.13) * (info.grupo === 'cerrada' ? 1.6 : 1)
  const tinteIzq = mezclar(colorIzq, c.card, alfa)
  const tinteDer = mezclar(colorDer, c.card, alfa)
  // El texto cruza las dos mitades, así que tiene que leerse sobre las dos: se
  // ajusta contra una y luego contra la otra. Los dos tintes son mezclas sobre
  // la MISMA tarjeta, así que los dos ajustes van para el mismo lado (los dos
  // oscurecen en claro, los dos aclaran en oscuro) y la segunda pasada no
  // deshace la primera.
  const enAmbos = (col: string, minimo = 4.5) =>
    legibleSobre(legibleSobre(col, tinteIzq, minimo), tinteDer, minimo)

  const Dato = ({ lbl, val }: { lbl: string; val: any }) =>
    val ? (
      <View style={s.dato}>
        <Text style={[s.datoLbl, { color: c.textMute }]}>{lbl}</Text>
        <Text style={[s.datoVal, { color: c.text }]}>{String(val)}</Text>
      </View>
    ) : null

  return (
    <View style={[s.tarjeta, { backgroundColor: tinteDer, borderColor: mezclar(colorDer, c.border, 0.4) }]}>
      {/* El degradado: un tercio del color de la cita, el resto del color del
          cliente, con una banda corta en medio para que el corte no se vea
          como una raya. Va detrás de todo (no recibe toques) y el detalle,
          cuando se abre, lo tapa con fondo liso: son párrafos largos y leerlos
          sobre color cansa. */}
      {partida && (
        <LinearGradient
          colors={[tinteIzq, tinteIzq, tinteDer, tinteDer]}
          locations={[0, 0.26, 0.44, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {/* Las franjas de color, para leer los dos estados sin abrir nada. */}
      <View style={[s.franja, { backgroundColor: colorIzq }]} />
      <View style={{ flex: 1 }}>
      <TouchableOpacity style={s.filaCerrada} onPress={onAbrir} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[s.nombre, { color: enAmbos(c.text) }]} numberOfLines={1}>{f.cliente_nombre ?? 'Sin nombre'}</Text>
          <Text style={[s.sublinea, { color: enAmbos(c.textMute) }]} numberOfLines={1}>
            {f.dia_cita ?? '—'}
          </Text>
          <Text style={[s.sublinea, { color: enAmbos(c.textSub) }]} numberOfLines={1}>
            {f.coordino ? `Coordinó ${f.coordino}` : 'Sin coordinador'}
            {f.atendio ? ` · Atendió ${f.atendio}` : ''}
          </Text>
          {/* El estado con el que quedó la cita, en su color. Es lo que
              pidieron para ver cuáles son reagendas. */}
          {f.estado_seguimiento ? (
            <Text style={[s.estadoCita, { color: enAmbos(colorEstadoCita(f.estado_seguimiento)) }]} numberOfLines={1}>
              {f.estado_seguimiento}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={[s.pildora, { backgroundColor: fondo }]}>
            <Text style={[s.pildoraTxt, { color: tinta }]} numberOfLines={1}>{info.label}</Text>
          </View>
          {/* La marca de "ya le escribimos", visible SIN abrir: es lo que se
              mira al repartirse a quién perseguir hoy. */}
          {seg?.contactado ? (
            <View style={s.yaFila}>
              <Ionicons name="checkmark-circle" size={13} color={enAmbos('#188741', 3)} />
              <Text style={[s.yaTxt, { color: enAmbos('#188741') }]}>Ya le escribimos</Text>
            </View>
          ) : null}
          <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={17} color={enAmbos(c.textMute, 3)} />
        </View>
      </TouchableOpacity>

      {abierta && (
        // Al abrir, el detalle va sobre el fondo normal: son párrafos largos y
        // leerlos sobre un tinte de color cansa.
        <View style={[s.detalle, { borderTopColor: c.border, backgroundColor: c.card }]}>
          {/* Escribirle a quien sepa qué pasó con el cliente: el asesor que lo
              atendió o quien lo prospectó. Al coordinador NO: él armó la cita,
              no estuvo en ella. Va arriba porque es la acción por la que se
              abre esta cita.
              Cada botón trae el nombre para no mandarle el mensaje a quien no
              era: en muchas citas el asesor y el prospectador son distintos. */}
          <View style={s.escribirFila}>
            {(['asesor', 'prospectador'] as const).map(q => {
              const nombre = q === 'asesor' ? f.atendio : f.prospecto
              if (!nombre) return null
              return (
                <TouchableOpacity key={q} style={s.btnEscribir} onPress={() => onEscribir(f, q)}>
                  <Ionicons
                    name={copiado === `${f.id}|${q}` ? 'checkmark-circle' : 'copy-outline'}
                    size={14} color="#188741"
                  />
                  <Text style={s.btnEscribirTxt} numberOfLines={1}>
                    {copiado === `${f.id}|${q}`
                      ? '¡Copiado!'
                      : `Copiar para ${q === 'asesor' ? 'el asesor' : 'quien prospectó'}: ${String(nombre).split(' ')[0]}`}
                  </Text>
                </TouchableOpacity>
              )
            })}
            {!f.atendio && !f.prospecto && (
              <Text style={{ fontSize: 11.5, color: c.textMute, fontStyle: 'italic' }}>
                Esta cita no tiene asesor ni prospectador capturado, no hay para quién armar el mensaje.
              </Text>
            )}
          </View>

          {/* El check de gestión. Va junto a los botones de copiar porque es el
              paso siguiente: copié el mensaje, lo mandé, lo marco.
              Es distinto del estado de abajo: ese es lo que CONTESTÓ la otra
              persona y puede tardar días; esto es lo que hicimos nosotros. */}
          {(() => {
            const ok = !!seg?.contactado
            const verde = '#188741'
            const fondoCk = ok ? fondoPildora(verde) : 'transparent'
            const cuando = seg?.contactado_at
              ? new Date(seg.contactado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
              : null
            return (
              <TouchableOpacity
                style={[s.check, { borderColor: ok ? verde : c.border, backgroundColor: fondoCk }]}
                onPress={() => onContactado(!ok)}
                disabled={guardando}
                activeOpacity={0.7}
              >
                <Ionicons name={ok ? 'checkbox' : 'square-outline'} size={19}
                          color={ok ? tintaPildora(verde) : c.textMute} />
                <Text style={[s.checkTxt, { color: ok ? tintaPildora(verde) : c.textSub }]}>
                  {ok
                    ? `Ya le escribimos por esta cita${cuando ? ` · ${cuando}` : ''}`
                    : 'Marcar que ya le escribimos por esta cita'}
                </Text>
              </TouchableOpacity>
            )
          })()}

          <Dato lbl="Coordinó la cita" val={f.coordino} />
          <Dato lbl="Atendió" val={f.atendio} />
          <Dato lbl="Prospectó" val={f.prospecto} />
          <Dato lbl="Teléfono del cliente" val={f.telefono} />
          <Dato lbl="Propiedad" val={f.interesado_en} />
          <Dato lbl="Zona" val={f.zona_interesada} />
          <Dato lbl="Forma de pago" val={f.detalles_pago} />
          {f.estado_seguimiento ? (
            <View style={s.dato}>
              <Text style={[s.datoLbl, { color: c.textMute }]}>EN QUÉ QUEDÓ LA CITA</Text>
              <View style={[s.pildora, { backgroundColor: fondoPildora(colorEstadoCita(f.estado_seguimiento)), alignSelf: 'flex-start', marginTop: 3 }]}>
                <Text style={[s.pildoraTxt, { color: tintaPildora(colorEstadoCita(f.estado_seguimiento)) }]}>
                  {f.estado_seguimiento}
                </Text>
              </View>
            </View>
          ) : null}

          {/* La retro, con las 3 preguntas tal cual se le hicieron al asesor. */}
          {PREGUNTAS_RETRO.some(q => f[q.campo]) ? (
            <View style={[s.retro, { backgroundColor: c.bg, borderLeftColor: '#c9a84c' }]}>
              <Text style={[s.retroLbl, { color: '#8a6410' }]}>RETRO DE LA CITA</Text>
              {PREGUNTAS_RETRO.map(q => (
                <Dato key={q.campo} lbl={q.titulo} val={f[q.campo]} />
              ))}
            </View>
          ) : (
            <Text style={[s.sinRetro, { color: c.textMute }]}>Esta cita no tiene retro escrita.</Text>
          )}

          <Text style={[s.fLbl, { color: c.textMute, marginTop: 14 }]}>¿EN QUÉ QUEDÓ EL CLIENTE?</Text>
          <View style={s.opciones}>
            {ORDEN_SEGUIMIENTO.map(e => {
              const i2 = ESTADOS_SEGUIMIENTO[e]
              const on = est === e
              return (
                <TouchableOpacity
                  key={e}
                  style={[s.opcion, { borderColor: c.border },
                    on && { backgroundColor: fondoPildora(i2.color), borderColor: i2.color }]}
                  onPress={() => onEstado(e)}
                  disabled={guardando}
                  activeOpacity={0.7}
                >
                  <Text style={[s.opcionTxt, { color: on ? tintaPildora(i2.color) : c.textSub }]}>{i2.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={[s.ayuda, { color: c.textMute }]}>{info.ayuda}</Text>

          <Text style={[s.fLbl, { color: c.textMute, marginTop: 12 }]}>NOTAS DE LO QUE CONTESTÓ</Text>
          <TextInput
            style={[s.notas, { color: c.text, backgroundColor: c.bg, borderColor: c.border }]}
            value={borrador}
            onChangeText={setBorrador}
            multiline
            placeholder="Qué dijo, qué quedó pendiente…"
            placeholderTextColor={c.textMute}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <TouchableOpacity style={s.btnGuardar} onPress={() => onNotas(borrador.trim() || null)} disabled={guardando}>
              {guardando ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnGuardarTxt}>Guardar notas</Text>}
            </TouchableOpacity>
            {seg?.actualizado_at && (
              <Text style={{ fontSize: 11, color: c.textMute }}>
                Actualizado {new Date(seg.actualizado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
              </Text>
            )}
          </View>
        </View>
      )}
      </View>
      {/* La orilla derecha, del color de ahora. Solo cuando los dos estados
          existen y son distintos: si no, la tarjeta ya es de ese color. */}
      {partida && <View style={[s.franja, { backgroundColor: colorDer }]} />}
    </View>
  )
}

// ── Gráficas ────────────────────────────────────────────────────────────────
// Respetan los filtros de la lista: si filtras un asesor, las gráficas son de
// ese asesor. Barras horizontales porque las etiquetas son largas y en
// vertical se encimarían.
function Graficas({ filas, c, fondoPildora, tintaPildora }: any) {
  const total = filas.length
  const porEstado = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of filas) {
      const e = estadoDe(f)
      m.set(e, (m.get(e) ?? 0) + 1)
    }
    return ORDEN_SEGUIMIENTO.map(e => ({ e, n: m.get(e) ?? 0, info: ESTADOS_SEGUIMIENTO[e] }))
  }, [filas])

  const porGrupo = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of filas) {
      const g = infoSeguimiento(estadoDe(f)).grupo
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return Object.entries(GRUPOS).map(([k, g]: any) => ({ k, g, n: m.get(k) ?? 0 }))
  }, [filas])

  const porAsesor = useMemo(() => {
    const m = new Map<string, { total: number; perdidas: number; cerradas: number }>()
    for (const f of filas) {
      const a = (f.atendio ?? '').trim()
      if (!a) continue
      const g = infoSeguimiento(estadoDe(f)).grupo
      const r = m.get(a) ?? { total: 0, perdidas: 0, cerradas: 0 }
      r.total++
      if (g === 'perdida') r.perdidas++
      if (g === 'cerrada') r.cerradas++
      m.set(a, r)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 12)
  }, [filas])

  if (total === 0) {
    return (
      <View style={s.vacio}>
        <Text style={{ fontSize: 34 }}>📊</Text>
        <Text style={{ color: c.textSub, fontWeight: '700', marginTop: 8 }}>Nada que graficar con esos filtros</Text>
      </View>
    )
  }

  const maxEstado = Math.max(...porEstado.map(x => x.n), 1)
  const maxAsesor = Math.max(...porAsesor.map(x => x[1].total), 1)

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 16 }}>
      <View style={[s.panel, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.panelTit, { color: c.text }]}>Dónde están las {total} citas</Text>
        <View style={s.resumen}>
          {porGrupo.map(({ k, g, n }: any) => (
            <View key={k} style={[s.resItem, { backgroundColor: fondoPildora(g.color) }]}>
              <Text style={[s.resNum, { color: tintaPildora(g.color) }]}>{n}</Text>
              <Text style={[s.resLbl, { color: tintaPildora(g.color) }]} numberOfLines={2}>{g.label}</Text>
              {/* "1" con "0%" al lado se lee como un error. Si hay aunque sea
                  una, nunca se dice 0%. */}
              <Text style={[s.resPct, { color: tintaPildora(g.color) }]}>
                {n === 0 ? '0%' : Math.round((n / total) * 100) === 0 ? '<1%' : `${Math.round((n / total) * 100)}%`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.panel, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.panelTit, { color: c.text }]}>En qué quedaron</Text>
        {porEstado.map(({ e, n, info }) => (
          <View key={e} style={s.barraFila}>
            <Text style={[s.barraLbl, { color: c.textSub }]} numberOfLines={1}>{info.label}</Text>
            <View style={[s.barraPista, { backgroundColor: c.border }]}>
              <View style={[s.barra, { width: `${Math.max(2, (n / maxEstado) * 100)}%`, backgroundColor: info.color }]} />
            </View>
            <Text style={[s.barraNum, { color: c.text }]}>{n}</Text>
          </View>
        ))}
      </View>

      {porAsesor.length > 0 && (
        <View style={[s.panel, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.panelTit, { color: c.text }]}>Por asesor que atendió</Text>
          <Text style={[s.panelSub, { color: c.textMute }]}>
            Barra completa = citas atendidas. En verde las que cerraron, en rojo las perdidas.
          </Text>
          {porAsesor.map(([a, r]: any) => (
            <View key={a} style={s.barraFila}>
              <Text style={[s.barraLbl, { color: c.textSub }]} numberOfLines={1}>{a}</Text>
              <View style={[s.barraPista, { backgroundColor: c.border }]}>
                <View style={[s.barra, { width: `${(r.total / maxAsesor) * 100}%`, backgroundColor: TEAL, flexDirection: 'row' }]}>
                  <View style={{ width: `${(r.cerradas / r.total) * 100}%`, backgroundColor: '#1a5e32' }} />
                  <View style={{ width: `${(r.perdidas / r.total) * 100}%`, backgroundColor: '#9b2020' }} />
                </View>
              </View>
              <Text style={[s.barraNum, { color: c.text }]}>{r.total}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabeza: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1 },
  titulo: { fontSize: 19, fontWeight: '900' },
  sub: { fontSize: 12, marginTop: 2 },
  leyenda: { fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7 },
  tabTxt: { fontSize: 13, fontWeight: '800' },

  filtros: { paddingBottom: 10, borderBottomWidth: 1 },
  buscaFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  busca: { flex: 1, fontSize: 14, paddingVertical: 6 },
  fLbl: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.9, paddingHorizontal: 14, marginTop: 10 },
  fNota: { fontSize: 10.5, paddingHorizontal: 14, marginTop: 2, fontStyle: 'italic' },
  chipFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 14, paddingTop: 6 },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipTxt: { fontSize: 12, fontWeight: '700' },

  filtrosCabeza: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 9, borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  filtrosCabezaTxt: { flex: 1, fontSize: 12.5, fontWeight: '700' },

  tarjeta: { marginHorizontal: 12, marginTop: 10, borderWidth: 1, borderRadius: 12, overflow: 'hidden', flexDirection: 'row' },
  franja: { width: 7 },
  estadoCita: { fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  escribirFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  check: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9,
    marginBottom: 13, alignSelf: 'flex-start',
  },
  checkTxt: { fontSize: 12.5, fontWeight: '700' },
  yaFila: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  yaTxt: { fontSize: 10.5, fontWeight: '800' },
  btnEscribir: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: '#188741', borderRadius: 9,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  btnEscribirTxt: { fontSize: 12, fontWeight: '800', color: '#188741' },
  filaCerrada: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  nombre: { fontSize: 14.5, fontWeight: '800' },
  sublinea: { fontSize: 11.5, marginTop: 2 },
  pildora: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 150 },
  pildoraTxt: { fontSize: 11, fontWeight: '800' },

  detalle: { borderTopWidth: 1, padding: 12, paddingTop: 10 },
  dato: { marginBottom: 8 },
  datoLbl: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  datoVal: { fontSize: 13.5, lineHeight: 19, marginTop: 1 },
  retro: { borderLeftWidth: 4, borderRadius: 8, padding: 10, marginTop: 4, marginBottom: 4 },
  retroLbl: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  sinRetro: { fontSize: 12, fontStyle: 'italic', marginVertical: 6 },

  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 6 },
  opcion: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  opcionTxt: { fontSize: 12, fontWeight: '700' },
  ayuda: { fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  notas: { borderWidth: 1.5, borderRadius: 10, padding: 10, fontSize: 14, minHeight: 72, textAlignVertical: 'top', marginTop: 6 },
  btnGuardar: { backgroundColor: TEAL, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  btnGuardarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  vacio: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 2 },

  panel: { borderWidth: 1, borderRadius: 14, padding: 14 },
  panelTit: { fontSize: 15, fontWeight: '900' },
  panelSub: { fontSize: 11.5, marginTop: 3, marginBottom: 6, lineHeight: 16 },
  resumen: { flexDirection: 'row', gap: 8, marginTop: 10 },
  resItem: { flex: 1, borderRadius: 10, padding: 9, alignItems: 'center' },
  resNum: { fontSize: 21, fontWeight: '900' },
  resLbl: { fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 1 },
  resPct: { fontSize: 10.5, fontWeight: '800', marginTop: 2, opacity: 0.85 },
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  barraLbl: { fontSize: 11.5, width: 118, fontWeight: '600' },
  barraPista: { flex: 1, height: 15, borderRadius: 8, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 8 },
  barraNum: { fontSize: 12.5, fontWeight: '800', width: 32, textAlign: 'right' },
})
