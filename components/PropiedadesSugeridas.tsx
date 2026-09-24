import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Linking, Share, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { getUsuarioActual } from '../lib/sesion'
import { useColors } from '../lib/ThemeContext'
import { parsePresupuesto, parseZonas, formatPrecioCorto } from '../lib/match-propiedades'
import { avisar } from '../lib/db'

// Propiedades que le quedan a este cliente, dentro de su propia ficha.
//
// El asesor ya tenía el presupuesto y la zona escritos aquí, y el inventario en
// otra pantalla; cruzarlos era trabajo a mano. Esto lo resuelve en el sitio y
// enlaza con lo que ya existía: de aquí salen directo a la colección del
// cliente, que es como se le mandan.
//
// Los resultados vienen en tres niveles (ver la migración
// 20260927_sugerencias_propiedades_cliente.sql). Cada tanda dice POR QUÉ
// aparece: si no se avisa, el asesor puede pensar que todo está en la zona que
// pidió el cliente y enseñarle algo que no le sirve.

type Sugerencia = {
  id: string; codigo: string | null; titulo: string | null; direccion: string | null
  precio: number; operacion: string; tipo: string | null
  recamaras: number | null; banos: number | null; m2: number | null; nivel: number
}

type Props = {
  clienteId: string
  clienteNombre: string
  clienteTelefono?: string | null
  presupuesto: string | null | undefined
  zonaBusqueda: string | null | undefined
  tipoOperacion: string | null | undefined
  /** Ruta base según quién mira, para abrir la ficha de la propiedad. */
  rutaDetalle?: string
}

const NIVELES: Record<number, { etiqueta: string; icono: string; color: string }> = {
  1: { etiqueta: 'En su zona y en su presupuesto', icono: '🎯', color: '#0f9d58' },
  2: { etiqueta: 'En su zona, un poco arriba de su presupuesto', icono: '↗️', color: '#e8a33d' },
  3: { etiqueta: 'En su presupuesto, pero en otra zona', icono: '📍', color: '#5b8def' },
}

function waNumero(tel: string | null | undefined): string | null {
  if (!tel) return null
  let p = tel.replace(/\D/g, '')
  if (p.startsWith('5252')) p = p.slice(2)
  if (p.startsWith('521') && p.length === 13) p = '52' + p.slice(3)
  if (p.length === 10) p = '52' + p
  return p.length >= 12 ? p : null
}

const precioLargo = (n: number) => `$${Number(n).toLocaleString('es-MX')}`

export default function PropiedadesSugeridas({
  clienteId, clienteNombre, clienteTelefono, presupuesto, zonaBusqueda, tipoOperacion,
  rutaDetalle = '/(prospectador)/detalle-propiedad',
}: Props) {
  const c = useColors()
  const operacion: 'venta' | 'renta' = tipoOperacion === 'renta' ? 'renta' : 'venta'

  const rangoFicha = useMemo(() => parsePresupuesto(presupuesto, operacion), [presupuesto, operacion])
  const zonasFicha = useMemo(() => parseZonas(zonaBusqueda), [zonaBusqueda])

  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [error, setError] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [creando, setCreando] = useState(false)

  // Filtro ajustable: arranca con lo que dice la ficha del cliente y se puede
  // mover aquí mismo para explorar, sin tener que editar al cliente.
  const [ajustando, setAjustando] = useState(false)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [zonasTxt, setZonasTxt] = useState('')

  useEffect(() => {
    if (rangoFicha) { setMin(String(rangoFicha.min)); setMax(String(rangoFicha.max)) }
    setZonasTxt(zonasFicha.join(', '))
  }, [rangoFicha, zonasFicha])

  const cargar = useCallback(async () => {
    const nMin = Number(min), nMax = Number(max)
    if (!isFinite(nMin) || !isFinite(nMax) || nMax <= 0) { setError('Falta el presupuesto.'); return }
    setCargando(true); setError(null)
    const { data, error: err } = await supabase.rpc('sugerir_propiedades', {
      p_cliente_id: clienteId,
      p_min: nMin,
      p_max: nMax,
      p_zonas: zonasTxt.split(',').map(z => z.trim()).filter(z => z.length >= 4),
      p_operacion: operacion,
      p_limite: 24,
    })
    if (err) { setError(err.message); setSugerencias([]) }
    else setSugerencias((data ?? []) as Sugerencia[])
    setCargando(false)
  }, [clienteId, min, max, zonasTxt, operacion])

  // Solo se consulta al abrir la sección: si no, cada visita a la ficha pagaría
  // una consulta que casi nadie mira.
  useEffect(() => { if (abierto && !sugerencias.length && !cargando && !error) cargar() }, [abierto])

  async function descartar(p: Sugerencia) {
    setSugerencias(prev => prev.filter(s => s.id !== p.id))
    setSeleccion(prev => { const s = new Set(prev); s.delete(p.id); return s })
    const { data: { user } } = await getUsuarioActual()
    const { error: err } = await supabase.from('sugerencias_descartadas')
      .upsert({ cliente_id: clienteId, propiedad_id: p.id, descartado_por: user?.id ?? null })
    if (err) { avisar('No se pudo descartar: ' + err.message); cargar() }
  }

  function mandarAlCliente(p: Sugerencia) {
    const link = `https://valeraapp.valerarealestate.com/ficha/${p.codigo}`
    const msg = `${p.titulo ?? 'Propiedad'}\n${precioLargo(p.precio)}\n\n${link}`
    const num = waNumero(clienteTelefono)
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (Platform.OS === 'web') window.open(url, '_blank')
    else Linking.openURL(url).catch(() => Share.share({ message: msg, url: link }).catch(() => {}))
  }

  // Manda las seleccionadas a una colección nueva del cliente, que es el
  // camino que ya existía para enseñarle varias propiedades de una vez.
  async function armarColeccion() {
    if (!seleccion.size) return
    setCreando(true)
    try {
      const { data: colId, error: err } = await supabase.rpc('crear_coleccion', {
        p_titulo: `Opciones para ${clienteNombre}`,
        p_cliente_id: clienteId,
        p_cliente_nombre: clienteNombre,
      })
      if (err || !colId) { avisar('No se pudo crear la colección: ' + (err?.message ?? 'sin respuesta')); return }
      for (const propiedadId of seleccion) {
        const { error: e2 } = await supabase.rpc('coleccion_agregar_item', {
          p_coleccion_id: colId, p_propiedad_id: propiedadId,
        })
        if (e2) { avisar('Se creó la colección pero no se pudieron agregar todas: ' + e2.message); break }
      }
      setSeleccion(new Set())
      router.push(`/(prospectador)/coleccion-detalle?id=${colId}`)
    } finally {
      setCreando(false)
    }
  }

  // Sin presupuesto no hay nada que buscar: se dice y se ofrece el ajuste
  // manual, en vez de esconder la sección y dejar al asesor sin saber por qué.
  const sinDatos = !rangoFicha

  const porNivel = useMemo(() => {
    const g: Record<number, Sugerencia[]> = { 1: [], 2: [], 3: [] }
    for (const s of sugerencias) (g[s.nivel] ??= []).push(s)
    return g
  }, [sugerencias])

  return (
    <View style={[st.caja, { backgroundColor: c.card, borderColor: c.border }]}>
      <TouchableOpacity style={st.cabecera} onPress={() => setAbierto(v => !v)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={[st.titulo, { color: c.text }]}>🏘️  Propiedades para este cliente</Text>
          <Text style={[st.sub, { color: c.textMute }]}>
            {sinDatos
              ? 'Sin presupuesto en su ficha — tócalo para buscar a mano'
              : `${operacion === 'renta' ? 'Renta' : 'Venta'} · ${formatPrecioCorto(rangoFicha!.min)} a ${formatPrecioCorto(rangoFicha!.max)}${zonasFicha.length ? ` · ${zonasFicha.slice(0, 2).join(', ')}` : ' · sin zona'}`}
          </Text>
        </View>
        {abierto && !!sugerencias.length && (
          <View style={[st.contador, { backgroundColor: '#1a647015' }]}>
            <Text style={st.contadorTxt}>{sugerencias.length}</Text>
          </View>
        )}
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMute} />
      </TouchableOpacity>

      {abierto && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          {/* Ajustar la búsqueda sin tocar la ficha del cliente */}
          <TouchableOpacity onPress={() => setAjustando(v => !v)} style={st.ajustarLink}>
            <Ionicons name="options-outline" size={14} color="#1a6470" />
            <Text style={st.ajustarTxt}>{ajustando ? 'Ocultar ajustes' : 'Ajustar búsqueda'}</Text>
          </TouchableOpacity>

          {ajustando && (
            <View style={[st.ajustes, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.lbl, { color: c.textMute }]}>Desde</Text>
                  <TextInput value={min} onChangeText={setMin} keyboardType="numeric"
                    style={[st.input, { color: c.text, borderColor: c.border }]} placeholder="0" placeholderTextColor={c.textMute} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.lbl, { color: c.textMute }]}>Hasta</Text>
                  <TextInput value={max} onChangeText={setMax} keyboardType="numeric"
                    style={[st.input, { color: c.text, borderColor: c.border }]} placeholder="0" placeholderTextColor={c.textMute} />
                </View>
              </View>
              <Text style={[st.lbl, { color: c.textMute, marginTop: 8 }]}>Zonas (separadas por coma)</Text>
              <TextInput value={zonasTxt} onChangeText={setZonasTxt}
                style={[st.input, { color: c.text, borderColor: c.border }]}
                placeholder="Real Solare, Juriquilla" placeholderTextColor={c.textMute} />
              <TouchableOpacity style={st.btnBuscar} onPress={cargar}>
                <Text style={st.btnBuscarTxt}>Buscar con estos datos</Text>
              </TouchableOpacity>
            </View>
          )}

          {cargando ? (
            <ActivityIndicator color="#1a6470" style={{ marginVertical: 24 }} />
          ) : error ? (
            <View style={st.vacio}>
              <Text style={[st.vacioTxt, { color: '#c0392b' }]}>{error}</Text>
              <TouchableOpacity onPress={cargar}><Text style={st.reintentar}>Reintentar</Text></TouchableOpacity>
            </View>
          ) : !sugerencias.length ? (
            <View style={st.vacio}>
              <Text style={{ fontSize: 30 }}>🤷</Text>
              <Text style={[st.vacioTxt, { color: c.textMute }]}>
                No hay propiedades disponibles que le queden con esos datos. Prueba a ampliar el
                presupuesto o quitar la zona en "Ajustar búsqueda".
              </Text>
            </View>
          ) : (
            <>
              {[1, 2, 3].map(nivel => {
                const lista = porNivel[nivel] ?? []
                if (!lista.length) return null
                const info = NIVELES[nivel]
                return (
                  <View key={nivel} style={{ marginTop: 10 }}>
                    <Text style={[st.nivelLbl, { color: info.color }]}>
                      {info.icono}  {info.etiqueta}  ({lista.length})
                    </Text>
                    {lista.map(p => {
                      const elegida = seleccion.has(p.id)
                      return (
                        <View key={p.id} style={[st.fila, { borderColor: elegida ? '#1a6470' : c.border, backgroundColor: elegida ? '#1a647008' : 'transparent' }]}>
                          <TouchableOpacity
                            style={[st.check, elegida && st.checkOn]}
                            onPress={() => setSeleccion(prev => {
                              const s = new Set(prev); elegida ? s.delete(p.id) : s.add(p.id); return s
                            })}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {elegida && <Text style={st.checkTick}>✓</Text>}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={{ flex: 1 }}
                            activeOpacity={0.7}
                            onPress={() => router.push({ pathname: rutaDetalle as any, params: { id: p.id } })}
                          >
                            <Text style={[st.filaTitulo, { color: c.text }]} numberOfLines={2}>{p.titulo ?? 'Sin título'}</Text>
                            <Text style={[st.filaMeta, { color: c.textMute }]} numberOfLines={1}>
                              {precioLargo(p.precio)}
                              {p.recamaras ? ` · ${p.recamaras} rec` : ''}
                              {p.m2 ? ` · ${p.m2} m²` : ''}
                              {p.codigo ? ` · ${p.codigo}` : ''}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity onPress={() => mandarAlCliente(p)} style={st.iconoBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="paper-plane-outline" size={16} color="#1a6470" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => descartar(p)} style={st.iconoBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="close" size={17} color="#b9c4c6" />
                          </TouchableOpacity>
                        </View>
                      )
                    })}
                  </View>
                )
              })}

              {seleccion.size > 0 && (
                <TouchableOpacity style={st.btnColeccion} onPress={armarColeccion} disabled={creando}>
                  {creando
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="albums-outline" size={16} color="#fff" />
                        <Text style={st.btnColeccionTxt}>
                          Armar colección con {seleccion.size} {seleccion.size === 1 ? 'propiedad' : 'propiedades'}
                        </Text>
                      </>}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: 14, marginHorizontal: 16, marginTop: 12, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  titulo: { fontSize: 15, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 3 },
  contador: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  contadorTxt: { color: '#1a6470', fontWeight: '800', fontSize: 12 },

  ajustarLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4 },
  ajustarTxt: { color: '#1a6470', fontSize: 12.5, fontWeight: '700' },
  ajustes: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6, marginBottom: 4 },
  lbl: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13.5 },
  btnBuscar: { backgroundColor: '#1a6470', borderRadius: 9, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  btnBuscarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  nivelLbl: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 10, padding: 9, marginBottom: 6 },
  filaTitulo: { fontSize: 13, fontWeight: '600' },
  filaMeta: { fontSize: 11.5, marginTop: 2 },
  iconoBtn: { padding: 4 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#c8d2d4', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  checkTick: { color: '#fff', fontSize: 12, fontWeight: '900' },

  btnColeccion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a6470', borderRadius: 11, paddingVertical: 12, marginTop: 12 },
  btnColeccionTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  vacio: { alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 14 },
  vacioTxt: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  reintentar: { color: '#1a6470', fontWeight: '800', fontSize: 13 },
})
