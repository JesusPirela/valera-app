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
import { legibleSobre, mezclar } from '../../lib/color'
import {
  ESTADOS_SEGUIMIENTO, ORDEN_SEGUIMIENTO, infoSeguimiento, GRUPOS, DESDE,
  fechaEfectivaCita, mesDe, mesLegible, type EstadoSeguimiento,
} from '../../lib/accountability-citas'

const TEAL = '#1a6470'

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

type Seg = { estado: string; notas: string | null; quien_respondio: string | null; actualizado_at: string }

function seguimientoDe(f: Fila): Seg | null {
  const s: any = f.seguimiento_citas
  if (!s) return null
  return Array.isArray(s) ? (s[0] ?? null) : s
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
  const [fEstado, setFEstado] = useState<EstadoSeguimiento | null>(null)
  const [fGrupo, setFGrupo] = useState<string | null>(null)
  const [fAsesor, setFAsesor] = useState<string | null>(null)
  const [fProspecto, setFProspecto] = useState<string | null>(null)
  const [fMes, setFMes] = useState<string | null>(null)
  const [fRetro, setFRetro] = useState<'con' | 'sin' | null>(null)
  const limpiar = () => {
    setBusqueda(''); setFEstado(null); setFGrupo(null)
    setFAsesor(null); setFProspecto(null); setFMes(null); setFRetro(null)
  }
  const hayFiltros = !!(busqueda.trim() || fEstado || fGrupo || fAsesor || fProspecto || fMes || fRetro)

  const montado = useRef(true)
  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('citas_venta')
      .select(`id, cliente_nombre, telefono, detalles_pago, interesado_en, zona_interesada,
               dia_cita, fecha_cita, fecha_apartado, prospecto, coordino, atendio,
               estado_seguimiento, retro_como_estuvo, retro_info_extra, retro_plan_accion,
               retro_completada_at, seguimiento_citas(estado, notas, quien_respondio, actualizado_at)`)
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

  // ── Guardar el estado de una cita ─────────────────────────────────────────
  async function guardar(id: string, estado: EstadoSeguimiento, notas?: string, quien?: string) {
    setGuardando(id)
    const previo = filas
    // Optimista: la pildora cambia al instante y la lista no parpadea.
    setFilas(fs => fs.map(f => f.id !== id ? f : {
      ...f,
      seguimiento_citas: {
        estado,
        notas: notas ?? seguimientoDe(f)?.notas ?? null,
        quien_respondio: quien ?? seguimientoDe(f)?.quien_respondio ?? null,
        actualizado_at: new Date().toISOString(),
      },
    }))
    try {
      const { data: { user } } = await getUsuarioActual()
      const fila = previo.find(f => f.id === id)
      const { error } = await supabase.from('seguimiento_citas').upsert({
        cita_venta_id: id,
        estado,
        notas: notas ?? seguimientoDe(fila!)?.notas ?? null,
        quien_respondio: quien ?? seguimientoDe(fila!)?.quien_respondio ?? null,
        actualizado_por: user?.id ?? null,
        actualizado_at: new Date().toISOString(),
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
  const { asesores, prospectadores, meses } = useMemo(() => {
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
      meses: cuenta(f => mesDe(fechaEfectivaCita(f))).sort((a, b) => b[0].localeCompare(a[0])),
    }
  }, [filas])

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return filas.filter(f => {
      const seg = seguimientoDe(f)
      const est = (seg?.estado ?? 'sin_contactar') as EstadoSeguimiento
      if (fEstado && est !== fEstado) return false
      if (fGrupo && infoSeguimiento(est).grupo !== fGrupo) return false
      if (fAsesor && (f.atendio ?? '').trim() !== fAsesor) return false
      if (fProspecto && (f.prospecto ?? '').trim() !== fProspecto) return false
      if (fMes && mesDe(fechaEfectivaCita(f)) !== fMes) return false
      if (fRetro === 'con' && !f.retro_completada_at) return false
      if (fRetro === 'sin' && f.retro_completada_at) return false
      if (q) {
        const heno = normalizar([f.cliente_nombre, f.telefono, f.interesado_en, f.zona_interesada,
          f.prospecto, f.coordino, f.atendio, seg?.notas].filter(Boolean).join(' | '))
        if (!q.split(/\s+/).every(p => heno.includes(p))) return false
      }
      return true
    })
  }, [filas, busqueda, fEstado, fGrupo, fAsesor, fProspecto, fMes, fRetro])

  // Los conteos de los chips de estado se calculan sobre lo filtrado por TODO
  // lo demas: asi el numero que ves es el que vas a obtener al tocarlo.
  const conteoEstados = useMemo(() => {
    const base = filas.filter(f => {
      if (fAsesor && (f.atendio ?? '').trim() !== fAsesor) return false
      if (fProspecto && (f.prospecto ?? '').trim() !== fProspecto) return false
      if (fMes && mesDe(fechaEfectivaCita(f)) !== fMes) return false
      if (fRetro === 'con' && !f.retro_completada_at) return false
      if (fRetro === 'sin' && f.retro_completada_at) return false
      return true
    })
    const m = new Map<string, number>()
    for (const f of base) {
      const e = seguimientoDe(f)?.estado ?? 'sin_contactar'
      m.set(e, (m.get(e) ?? 0) + 1)
    }
    return m
  }, [filas, fAsesor, fProspecto, fMes, fRetro])

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
              asesores={asesores} prospectadores={prospectadores} meses={meses}
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
              onEstado={(e: EstadoSeguimiento) => guardar(item.id, e)}
              onNotas={(t: string | null) => guardar(item.id, (seguimientoDe(item)?.estado ?? 'sin_contactar') as EstadoSeguimiento, t ?? undefined)}
              guardando={guardando === item.id}
              borrador={borrador[item.id] ?? seguimientoDe(item)?.notas ?? ''}
              setBorrador={(t: string) => setBorrador(b => ({ ...b, [item.id]: t }))}
              fondoPildora={fondoPildora} tintaPildora={tintaPildora}
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
      <Text style={[s.chipTxt, { color: activo ? tintaPildora(color ?? TEAL) : c.textSub }]} numberOfLines={1}>
        {label}{n != null ? ` (${n})` : ''}
      </Text>
    </TouchableOpacity>
  )
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

      <Text style={[s.fLbl, { color: c.textMute }]}>EN QUÉ QUEDÓ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipFila}>
        <Chip activo={!p.fEstado && !p.fGrupo} label="Todas" onPress={() => { p.setFEstado(null); p.setFGrupo(null) }} />
        {Object.entries(GRUPOS).map(([k, g]: any) => (
          <Chip key={k} activo={p.fGrupo === k} label={g.label} color={g.color}
                onPress={() => { p.setFEstado(null); p.setFGrupo(p.fGrupo === k ? null : k) }} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipFila}>
        {ORDEN_SEGUIMIENTO.map(e => (
          <Chip key={e} activo={p.fEstado === e} label={ESTADOS_SEGUIMIENTO[e].label}
                n={conteoEstados.get(e) ?? 0} color={ESTADOS_SEGUIMIENTO[e].color}
                onPress={() => { p.setFGrupo(null); p.setFEstado(p.fEstado === e ? null : e) }} />
        ))}
      </ScrollView>

      <Text style={[s.fLbl, { color: c.textMute }]}>MES DE LA CITA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipFila}>
        <Chip activo={!p.fMes} label="Todos" onPress={() => p.setFMes(null)} />
        {p.meses.map(([m, n]: any) => (
          <Chip key={m} activo={p.fMes === m} label={mesLegible(m)} n={n}
                onPress={() => p.setFMes(p.fMes === m ? null : m)} />
        ))}
      </ScrollView>

      <Text style={[s.fLbl, { color: c.textMute }]}>ASESOR QUE ATENDIÓ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipFila}>
        <Chip activo={!p.fAsesor} label="Todos" onPress={() => p.setFAsesor(null)} />
        {p.asesores.map(([a, n]: any) => (
          <Chip key={a} activo={p.fAsesor === a} label={a} n={n}
                onPress={() => p.setFAsesor(p.fAsesor === a ? null : a)} />
        ))}
      </ScrollView>

      <Text style={[s.fLbl, { color: c.textMute }]}>QUIÉN PROSPECTÓ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipFila}>
        <Chip activo={!p.fProspecto} label="Todos" onPress={() => p.setFProspecto(null)} />
        {p.prospectadores.map(([a, n]: any) => (
          <Chip key={a} activo={p.fProspecto === a} label={a} n={n}
                onPress={() => p.setFProspecto(p.fProspecto === a ? null : a)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.chipFila, { paddingTop: 4 }]}>
        <Chip activo={p.fRetro === 'con'} label="Con retro escrita"
              onPress={() => p.setFRetro(p.fRetro === 'con' ? null : 'con')} />
        <Chip activo={p.fRetro === 'sin'} label="Sin retro"
              onPress={() => p.setFRetro(p.fRetro === 'sin' ? null : 'sin')} />
      </ScrollView>
    </View>
  )
}

// ── Una cita ────────────────────────────────────────────────────────────────
// Cerrada enseña lo mínimo para reconocerla; abierta, todo lo demás y el
// editor. Así caben muchas en pantalla sin perder el detalle.
function TarjetaCita({ f, c, abierta, onAbrir, onEstado, onNotas, guardando, borrador, setBorrador, fondoPildora, tintaPildora }: any) {
  const seg = seguimientoDe(f)
  const est = (seg?.estado ?? 'sin_contactar') as EstadoSeguimiento
  const info = infoSeguimiento(est)
  const fondo = fondoPildora(info.color)
  const tinta = tintaPildora(info.color)
  const Dato = ({ lbl, val }: { lbl: string; val: any }) =>
    val ? (
      <View style={s.dato}>
        <Text style={[s.datoLbl, { color: c.textMute }]}>{lbl}</Text>
        <Text style={[s.datoVal, { color: c.text }]}>{String(val)}</Text>
      </View>
    ) : null

  return (
    <View style={[s.tarjeta, { backgroundColor: c.card, borderColor: c.border }]}>
      <TouchableOpacity style={s.filaCerrada} onPress={onAbrir} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>{f.cliente_nombre ?? 'Sin nombre'}</Text>
          <Text style={[s.sublinea, { color: c.textMute }]} numberOfLines={1}>
            {f.dia_cita ?? '—'}{f.atendio ? ` · ${f.atendio}` : ''}
          </Text>
        </View>
        <View style={[s.pildora, { backgroundColor: fondo }]}>
          <Text style={[s.pildoraTxt, { color: tinta }]} numberOfLines={1}>{info.label}</Text>
        </View>
        <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={17} color={c.textMute} />
      </TouchableOpacity>

      {abierta && (
        <View style={[s.detalle, { borderTopColor: c.border }]}>
          <Dato lbl="Teléfono" val={f.telefono} />
          <Dato lbl="Propiedad" val={f.interesado_en} />
          <Dato lbl="Zona" val={f.zona_interesada} />
          <Dato lbl="Forma de pago" val={f.detalles_pago} />
          <Dato lbl="Prospectó" val={f.prospecto} />
          <Dato lbl="Coordinó" val={f.coordino} />
          <Dato lbl="Atendió" val={f.atendio} />
          <Dato lbl="Estado de la cita" val={f.estado_seguimiento} />

          {(f.retro_como_estuvo || f.retro_info_extra || f.retro_plan_accion) ? (
            <View style={[s.retro, { backgroundColor: c.bg, borderLeftColor: '#c9a84c' }]}>
              <Text style={[s.retroLbl, { color: '#8a6410' }]}>RETRO DE LA CITA</Text>
              <Dato lbl="Cómo estuvo" val={f.retro_como_estuvo} />
              <Dato lbl="Información extra" val={f.retro_info_extra} />
              <Dato lbl="Plan de acción" val={f.retro_plan_accion} />
            </View>
          ) : (
            <Text style={[s.sinRetro, { color: c.textMute }]}>Esta cita no tiene retro escrita.</Text>
          )}

          <Text style={[s.fLbl, { color: c.textMute, marginTop: 14 }]}>¿EN QUÉ QUEDÓ?</Text>
          <View style={s.opciones}>
            {ORDEN_SEGUIMIENTO.map(e => {
              const i = ESTADOS_SEGUIMIENTO[e]
              const on = est === e
              return (
                <TouchableOpacity
                  key={e}
                  style={[s.opcion, { borderColor: c.border },
                    on && { backgroundColor: fondoPildora(i.color), borderColor: i.color }]}
                  onPress={() => onEstado(e)}
                  disabled={guardando}
                  activeOpacity={0.7}
                >
                  <Text style={[s.opcionTxt, { color: on ? tintaPildora(i.color) : c.textSub }]}>{i.label}</Text>
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
            placeholder="Qué dijo el asesor, qué quedó pendiente…"
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
      const e = seguimientoDe(f)?.estado ?? 'sin_contactar'
      m.set(e, (m.get(e) ?? 0) + 1)
    }
    return ORDEN_SEGUIMIENTO.map(e => ({ e, n: m.get(e) ?? 0, info: ESTADOS_SEGUIMIENTO[e] }))
  }, [filas])

  const porGrupo = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of filas) {
      const g = infoSeguimiento(seguimientoDe(f)?.estado).grupo
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return Object.entries(GRUPOS).map(([k, g]: any) => ({ k, g, n: m.get(k) ?? 0 }))
  }, [filas])

  const porAsesor = useMemo(() => {
    const m = new Map<string, { total: number; perdidas: number; cerradas: number }>()
    for (const f of filas) {
      const a = (f.atendio ?? '').trim()
      if (!a) continue
      const g = infoSeguimiento(seguimientoDe(f)?.estado).grupo
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
  tabs: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7 },
  tabTxt: { fontSize: 13, fontWeight: '800' },

  filtros: { paddingBottom: 10, borderBottomWidth: 1 },
  buscaFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  busca: { flex: 1, fontSize: 14, paddingVertical: 6 },
  fLbl: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.9, paddingHorizontal: 14, marginTop: 10 },
  chipFila: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingTop: 6 },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipTxt: { fontSize: 12, fontWeight: '700' },

  tarjeta: { marginHorizontal: 12, marginTop: 10, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
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
