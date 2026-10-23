// Armador de la hoja de ruta: el documento que el asesor lleva el día del
// recorrido, con el perfil del cliente y las paradas en orden.
//
// Se arma con lo que ya está registrado, pero TODO queda editable — hasta la
// ubicación y el precio. Son datos que cambian entre que se capturan y el día
// de la cita, y el asesor es quien lo sabe en ese momento.
//
// Lo que se edite aquí vale SOLO para el documento: no reescribe la ficha del
// cliente ni la de la propiedad. Corregir un presupuesto para una hoja no
// debería cambiarle el CRM a nadie sin avisar.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'
import { esStaffSupervision } from '../lib/permisos'
import {
  generarPdfHojaDeRuta, imagenABase64, bajarComoBase64, type ParadaHoja, type PerfilHoja,
} from '../lib/hoja-de-ruta'

const TEAL = '#1a6470'
const AZUL = '#1e3a5f'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`
}
/** "hace 10 min", "ayer", "14 oct" — para la lista de hojas ya hechas. */
function cuandoFue(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const dias = Math.floor(hrs / 24)
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`
}

function horaCorta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
}

// Mismas etiquetas que el resto de la app, para que el documento no hable
// distinto a la pantalla de donde salió.
const CREDITO: Record<string, string> = {
  infonavit: 'Crédito hipotecario (Infonavit)', fovisste: 'Crédito hipotecario (Fovisste)',
  bancario: 'Crédito bancario', contado: 'De contado', otro: 'Otro',
}
const FUENTE: Record<string, string> = {
  marketplace: 'Marketplace', tokko: 'Tokko Broker', campana_fb: 'Campaña Facebook',
  cofre_lead_meta: 'Campaña Meta', grupo_fb: 'Grupo de Facebook',
  ficha_compartida: 'Ficha compartida', coleccion_compartida: 'Colección compartida',
  referido: 'Referido', redes_sociales: 'Redes sociales', sitio_web: 'Sitio web',
  llamada_fria: 'Llamada fría', evento: 'Evento', otro: 'Otro',
}
const bonito = (v: string) => {
  const t = (v ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}
const legible = (v: string | null) => (v ?? '').replace(/_a_/g, ' a ').replace(/_/g, ' ').trim()

type ClienteLite = { id: string; nombre: string; telefono: string | null }
type HojaGuardada = {
  token: string; fecha: string; cliente: string; paradas: number
  actualizada: string; clienteId: string | null
}
/** Una parada, más lo que la pantalla necesita para gestionarla. */
type Parada = ParadaHoja & { clave: string; fotoUrl: string }

/**
 * Un campo editable.
 *
 * Va FUERA del componente a propósito. Definido adentro, React lo trata como
 * un componente distinto en cada render y vuelve a montar el TextInput: el
 * campo perdía el foco al escribir cada letra.
 */
function Campo({ etiqueta, valor, alCambiar, placeholder, multi }: {
  etiqueta: string; valor: string; alCambiar: (v: string) => void
  placeholder?: string; multi?: boolean
}) {
  const c = useColors()
  return (
    <View style={s.campo}>
      <Text style={[s.lbl, { color: c.textSub }]}>{etiqueta}</Text>
      <TextInput
        style={[s.input, multi && s.inputMulti,
          { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
        value={valor}
        onChangeText={alCambiar}
        placeholder={placeholder}
        placeholderTextColor={c.placeholder}
        multiline={multi}
      />
    </View>
  )
}

const PARADA_VACIA = (): Parada => ({
  clave: Math.random().toString(36).slice(2),
  hora: '', titulo: '', ubicacion: '', precio: '', caracteristicas: '',
  mapaUrl: '', linkPropiedad: '', asesorNombre: '', asesorTel: '', fotoUrl: '', fotoBase64: '',
  confirmada: false,
})

export default function HojaDeRutaView() {
  const c = useColors()
  const { clienteId, token: tokenUrl } = useLocalSearchParams<{ clienteId?: string; token?: string }>()

  const [permitido, setPermitido] = useState<boolean | null>(null)
  const [cliente, setCliente] = useState<ClienteLite | null>(null)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ClienteLite[]>([])
  const [fecha, setFecha] = useState(fechaLarga(new Date()))
  const [perfil, setPerfil] = useState<PerfilHoja>({
    nombre: '', telefono: '', correo: '', origen: '', formaPago: '', presupuesto: '', busca: '',
  })
  const [paradas, setParadas] = useState<Parada[]>([])
  const [dias, setDias] = useState<{ dia: string; etiqueta: string; n: number }[]>([])
  const [cargando, setCargando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [creandoLink, setCreandoLink] = useState(false)
  // El token se guarda para que al volver a crear el link se SOBRESCRIBA la
  // misma hoja: así el que ya se mandó por WhatsApp sigue sirviendo y muestra
  // la versión corregida, en vez de dejar links viejos con datos viejos.
  const [token, setToken] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [buscaProp, setBuscaProp] = useState('')
  const [propsEncontradas, setPropsEncontradas] = useState<any[]>([])
  const [link, setLink] = useState('')
  const [importando, setImportando] = useState(false)
  const [avisoImport, setAvisoImport] = useState('')
  const [guardadas, setGuardadas] = useState<HojaGuardada[]>([])
  const [verGuardadas, setVerGuardadas] = useState(false)
  const [clienteIdHoja, setClienteIdHoja] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const temporizadorProp = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = (t: string, m: string) =>
    Platform.OS === 'web' ? window.alert(`${t}\n\n${m}`) : Alert.alert(t, m)

  // ── Quién puede entrar: de asesor para arriba ────────────────────────────
  // Un prospectador no coordina recorridos, y la hoja lleva el teléfono directo
  // del asesor externo de cada propiedad.
  useFocusEffect(useCallback(() => {
    let vivo = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !vivo) { if (vivo) setPermitido(false); return }
      supabase.from('profiles').select('role').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (!vivo) return
          const ok = esStaffSupervision(data?.role)
          setPermitido(ok)
          if (!ok) router.replace('/(prospectador)/propiedades')
        })
    })
    return () => { vivo = false }
  }, []))

  useEffect(() => {
    if (tokenUrl) abrirGuardada(String(tokenUrl))
    else if (clienteId) cargarCliente(String(clienteId))
  }, [clienteId, tokenUrl])

  useEffect(() => { listarGuardadas() }, [])

  /** Las hojas que ya hizo, para volver a abrirlas. */
  async function listarGuardadas() {
    const { data } = await supabase.from('hojas_de_ruta')
      .select('token, fecha, perfil, paradas, updated_at, cliente_id')
      .order('updated_at', { ascending: false })
      .limit(20)
    setGuardadas(((data ?? []) as any[]).map(h => ({
      token: h.token,
      fecha: h.fecha,
      cliente: h.perfil?.nombre ?? 'Sin nombre',
      paradas: Array.isArray(h.paradas) ? h.paradas.length : 0,
      actualizada: h.updated_at,
      clienteId: h.cliente_id ?? null,
    })))
  }

  /**
   * Vuelve a abrir una hoja ya hecha para corregirla.
   *
   * Al guardarla se le quitan `clave` (sólo sirve dentro de la pantalla) y
   * `fotoBase64` (pesa de más y se vuelve a calcular), así que hay que
   * devolvérselos o la lista de paradas no se puede editar.
   */
  async function abrirGuardada(tk: string) {
    setCargando(true)
    try {
      const { data, error } = await supabase.rpc('hoja_de_ruta_publica', { p_token: tk })
      if (error || !data) { avisar('No se encontró', 'Esa hoja de ruta ya no existe.'); return }
      const h: any = data
      setToken(tk)
      setFecha(h.fecha ?? '')
      setPerfil({ nombre: '', telefono: '', correo: '', origen: '', formaPago: '', presupuesto: '', busca: '', ...(h.perfil ?? {}) })
      setParadas((h.paradas ?? []).map((p: any) => ({
        ...PARADA_VACIA(), ...p,
        clave: Math.random().toString(36).slice(2),
        fotoBase64: '',
      })))
      const guardada = guardadas.find(g => g.token === tk)
      setClienteIdHoja(guardada?.clienteId ?? null)
      setCliente(h.perfil?.nombre
        ? { id: guardada?.clienteId ?? '', nombre: h.perfil.nombre, telefono: h.perfil.telefono ?? null }
        : null)
      setDias([])
    } catch {
      avisar('No se pudo abrir', 'Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  // ── Cliente ──────────────────────────────────────────────────────────────
  async function cargarCliente(id: string) {
    setCargando(true)
    const { data } = await supabase.from('clientes')
      .select('id, nombre, telefono, email, fuente_lead, tipo_credito, presupuesto, zona_busqueda, notas')
      .eq('id', id).single()
    if (data) {
      setCliente({ id: data.id, nombre: data.nombre, telefono: data.telefono })
      setPerfil({
        nombre: data.nombre ?? '',
        telefono: data.telefono ?? '',
        correo: data.email ?? '',
        origen: FUENTE[(data.fuente_lead ?? '').toLowerCase()] ?? bonito(data.fuente_lead ?? ''),
        formaPago: CREDITO[(data.tipo_credito ?? '').toLowerCase()] ?? bonito(data.tipo_credito ?? ''),
        presupuesto: legible(data.presupuesto),
        // "Busca 2 recámaras, 2 baños" no existe como campo: se deja la zona
        // registrada como punto de partida y el asesor lo completa.
        busca: data.zona_busqueda ?? '',
      })
      setResultados([]); setBusca(''); setClienteIdHoja(id)
      await cargarDias(id)
    }
    setCargando(false)
  }

  function buscarClientes(txt: string) {
    setBusca(txt)
    if (temporizador.current) clearTimeout(temporizador.current)
    if (txt.trim().length < 2) { setResultados([]); return }
    temporizador.current = setTimeout(async () => {
      const dig = txt.replace(/\D/g, '')
      const { data } = await supabase.from('clientes')
        .select('id, nombre, telefono')
        .or(`nombre.ilike.%${txt.trim()}%${dig.length >= 4 ? `,telefono.ilike.%${dig}%` : ''}`)
        .is('eliminado_at', null).limit(8)
      setResultados((data ?? []) as ClienteLite[])
    }, 300)
  }

  /** Los días en que ese cliente tiene citas, para traer el recorrido de uno. */
  async function cargarDias(id: string) {
    const { data } = await supabase.from('citas_coordinacion')
      .select('fecha_cita').eq('cliente_id', id).not('fecha_cita', 'is', null)
    const cuenta = new Map<string, number>()
    for (const r of (data ?? []) as any[]) {
      const d = new Date(r.fecha_cita)
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
    setDias([...cuenta.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, n]) => {
        const [a, m, d] = dia.split('-').map(Number)
        return { dia, n, etiqueta: fechaLarga(new Date(a, m - 1, d)) }
      }))
  }

  // ── Traer las citas de un día como paradas ───────────────────────────────
  async function traerCitasDelDia(dia: string) {
    if (!cliente) return
    setCargando(true)
    const [a, m, d] = dia.split('-').map(Number)
    const desde = new Date(a, m - 1, d, 0, 0, 0).toISOString()
    const hasta = new Date(a, m - 1, d + 1, 0, 0, 0).toISOString()
    const { data } = await supabase.from('citas_coordinacion')
      .select('fecha_cita, propiedad_id, propiedad_externa, estado, confirmada_at')
      .eq('cliente_id', cliente.id)
      .gte('fecha_cita', desde).lt('fecha_cita', hasta)
      .order('fecha_cita')

    const nuevas: Parada[] = []
    for (const cita of (data ?? []) as any[]) {
      // Confirmada = alguien la confirmó explícitamente, o la cita ya está en
      // estado "coordinada". Se trae el dato en vez de dejarlo en blanco para
      // que la hoja salga ya con la verdad del CRM; igual se puede cambiar.
      const confirmada = !!cita.confirmada_at || cita.estado === 'coordinada'
      if (cita.propiedad_id) {
        const p = await traerPropiedad(cita.propiedad_id)
        if (p) { nuevas.push({ ...p, hora: horaCorta(cita.fecha_cita), confirmada }); continue }
      }
      nuevas.push({
        ...PARADA_VACIA(),
        hora: horaCorta(cita.fecha_cita),
        titulo: cita.propiedad_externa ?? '',
        confirmada,
      })
    }
    setFecha(fechaLarga(new Date(a, m - 1, d)))
    setParadas(nuevas)
    setCargando(false)
    if (nuevas.length === 0) avisar('Sin citas', 'Ese día no tiene citas con propiedad.')
  }

  // ── Una propiedad de la app → parada ─────────────────────────────────────
  async function traerPropiedad(id: string): Promise<Parada | null> {
    const { data } = await supabase.from('propiedades')
      .select(`id, titulo, direccion, precio, operacion, recamaras, banos, medios_banos, m2, m2_terreno,
               lat, lng, codigo, url_origen,
               asesores ( nombre, inmobiliaria, telefono ),
               propiedad_imagenes ( url, orden )`)
      .eq('id', id).single()
    if (!data) return null
    const p: any = data

    const car: string[] = []
    if (p.recamaras) car.push(`${p.recamaras} recámaras`)
    if (p.banos) car.push(`${p.banos} baños`)
    if (p.medios_banos) car.push(`${p.medios_banos} medios baños`)
    if (p.m2) car.push(`${p.m2} m² construcción`)
    if (p.m2_terreno) car.push(`${p.m2_terreno} m² terreno`)

    const fotos = (p.propiedad_imagenes ?? []).slice().sort((x: any, y: any) => (x.orden ?? 0) - (y.orden ?? 0))
    const ases = Array.isArray(p.asesores) ? p.asesores[0] : p.asesores

    return {
      ...PARADA_VACIA(),
      titulo: p.titulo ?? '',
      ubicacion: p.direccion ?? '',
      precio: p.precio ? `$${Number(p.precio).toLocaleString('es-MX')} MXN ${p.operacion === 'renta' ? 'Renta' : 'Venta'}` : '',
      caracteristicas: car.join(' · '),
      mapaUrl: p.lat && p.lng
        ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
        : p.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.direccion)}` : '',
      // El link de la ficha es el que de verdad sirve: se abre y se ve la
      // propiedad. Si no tiene código, queda el anuncio de donde se importó.
      linkPropiedad: p.codigo
        ? `https://valeraapp.valerarealestate.com/ficha/${p.codigo}`
        : (p.url_origen ?? ''),
      asesorNombre: ases?.nombre ? `${ases.nombre}${ases.inmobiliaria ? ' — ' + ases.inmobiliaria : ''}` : '',
      asesorTel: ases?.telefono ?? '',
      fotoUrl: fotos[0]?.url ?? '',
    }
  }

  function buscarPropiedades(txt: string) {
    setBuscaProp(txt)
    if (temporizadorProp.current) clearTimeout(temporizadorProp.current)
    if (txt.trim().length < 2) { setPropsEncontradas([]); return }
    temporizadorProp.current = setTimeout(async () => {
      const { data } = await supabase.from('propiedades')
        .select('id, titulo, codigo, direccion')
        .or(`titulo.ilike.%${txt.trim()}%,codigo.ilike.%${txt.trim()}%`)
        .limit(8)
      setPropsEncontradas(data ?? [])
    }, 300)
  }

  async function agregarDeLaApp(id: string) {
    setCargando(true)
    const p = await traerPropiedad(id)
    setCargando(false)
    if (p) { setParadas(prev => [...prev, p]); setBuscaProp(''); setPropsEncontradas([]) }
  }

  // ── Una propiedad por link ───────────────────────────────────────────────
  // Reaprovecha el mismo importador del alta de propiedades, así que sirve con
  // EasyBroker, inmuebles24, Tokko y lo demás que ya sabe leer.
  async function agregarPorLink() {
    const url = link.trim()
    if (!/^https?:\/\//i.test(url)) { avisar('Link inválido', 'Pega un link que empiece con https://'); return }
    setAvisoImport('')
    setImportando(true)
    try {
      // Hasta dos intentos. Medido contra el mismo anuncio de EasyBroker: una
      // de cada seis veces la página no se alcanza y vuelve la ficha vacía,
      // aunque el anuncio esté bien. Reintentar la rescata sin que nadie tenga
      // que volver a pegar el link.
      let d: any = null
      for (let intento = 0; intento < 2; intento++) {
        const { data, error } = await supabase.functions.invoke('importar-propiedad', { body: { url } })
        if (error) throw error
        d = data
        if (d?.error) throw new Error(d.error)
        if (d?.titulo || d?.precio || d?.direccion) break
        if (intento === 0) setAvisoImport('Ese anuncio no respondió a la primera. Reintentando…')
      }

      const car: string[] = []
      if (d.recamaras) car.push(`${d.recamaras} recámaras`)
      if (d.banos) car.push(`${d.banos} baños`)
      if (d.m2) car.push(`${d.m2} m² construcción`)
      if (d.m2Terreno) car.push(`${d.m2Terreno} m² terreno`)

      const nueva: Parada = {
        ...PARADA_VACIA(),
        titulo: d.titulo ?? '',
        ubicacion: d.direccion ?? '',
        precio: d.precio ? `$${Number(d.precio).toLocaleString('es-MX')} MXN ${d.operacion === 'renta' ? 'Renta' : 'Venta'}` : '',
        caracteristicas: car.join(' · '),
        mapaUrl: d.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.direccion)}` : '',
        linkPropiedad: url,
        fotoUrl: d.imagenes?.[0] ?? '',
      }
      setParadas(prev => [...prev, nueva])
      setLink('')

      // Decir qué se trajo y qué no.
      //
      // Antes se agregaba la parada en silencio con lo que hubiera salido. Si
      // el anuncio era de un sitio que el importador no entiende y sólo sacaba
      // el título, quedaban cinco campos vacíos sin ninguna explicación y
      // parecía que la pantalla estaba rota.
      const trajo = [
        nueva.titulo && 'título', nueva.ubicacion && 'ubicación', nueva.precio && 'precio',
        nueva.caracteristicas && 'características', nueva.fotoUrl && 'foto',
      ].filter(Boolean) as string[]
      setAvisoImport(
        trajo.length === 0
          ? '⚠ De ese link no se pudo sacar nada. Llénala a mano aquí abajo, o prueba con otro anuncio de la misma propiedad.'
          : trajo.length === 1
            ? `⚠ De ese link sólo salió el ${trajo[0]}. Llena el resto a mano aquí abajo.`
            : `✓ Se trajo: ${trajo.join(' · ')}.`)
    } catch (e: any) {
      avisar('No se pudo leer el link', e?.message ?? 'Intenta con otro, o agrégala a mano.')
    } finally {
      setImportando(false)
    }
  }

  // ── Editar / mover / quitar ──────────────────────────────────────────────
  const editar = (clave: string, campo: keyof ParadaHoja, valor: string) =>
    setParadas(prev => prev.map(p => (p.clave === clave ? { ...p, [campo]: valor } : p)))

  const mover = (i: number, delta: number) => setParadas(prev => {
    const j = i + delta
    if (j < 0 || j >= prev.length) return prev
    const copia = [...prev]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    return copia
  })

  const quitar = (clave: string) => setParadas(prev => prev.filter(p => p.clave !== clave))

  // ── Generar ──────────────────────────────────────────────────────────────
  async function generar() {
    if (!perfil.nombre.trim()) { avisar('Falta el cliente', 'Escribe al menos el nombre del cliente.'); return }
    if (paradas.length === 0) { avisar('Sin propiedades', 'Agrega al menos una propiedad al recorrido.'); return }
    setGenerando(true)
    try {
      const logoBase64 = await cargarLogo()
      const conFoto = await Promise.all(paradas.map(async p => ({
        ...p, fotoBase64: p.fotoBase64 || await imagenABase64(p.fotoUrl),
      })))
      const limpio = perfil.nombre.trim().replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '-')
      await generarPdfHojaDeRuta(
        { fecha, perfil, paradas: conFoto, logoBase64 },
        `Hoja-de-ruta-${limpio}.pdf`,
      )
    } catch (e: any) {
      avisar('No se pudo generar', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  /** Suelta la hoja abierta para armar otra desde cero sin pisar el link. */
  function empezarDeCero() {
    setToken(''); setParadas([]); setCliente(null); setDias([]); setClienteIdHoja(null)
    setPerfil({ nombre: '', telefono: '', correo: '', origen: '', formaPago: '', presupuesto: '', busca: '' })
    setFecha(fechaLarga(new Date()))
    setAvisoImport('')
  }

  async function crearLink() {
    if (!perfil.nombre.trim()) { avisar('Falta el cliente', 'Escribe al menos el nombre del cliente.'); return }
    if (paradas.length === 0) { avisar('Sin propiedades', 'Agrega al menos una propiedad al recorrido.'); return }
    setCreandoLink(true)
    try {
      // Se guarda el documento tal cual quedó, con lo editado a mano. No se
      // reconstruye leyendo las citas al abrir el link: eso perdería las
      // correcciones.
      const { data, error } = await supabase.rpc('guardar_hoja_de_ruta', {
        // Un id vacío no es un uuid: va null. Al reabrir una hoja se conserva
        // el cliente con el que se creó.
        p_cliente_id: clienteIdHoja || cliente?.id || null,
        p_fecha: fecha,
        p_perfil: perfil,
        p_paradas: paradas.map(({ clave, fotoBase64, ...resto }) => resto),
        p_token: token || null,
      })
      if (error) throw error
      const d: any = data
      // Si la hoja la creo otra persona no se puede sobrescribir; se ofrece
      // guardarla como una nueva en vez de dejar al usuario atorado.
      if (d?.error === 'ajena') {
        avisar('Esa hoja es de otra persona', (d.mensaje ?? '') + ' Se va a crear una copia tuya.')
        setToken('')
        setCreandoLink(false)
        return crearLink()
      }
      if (!d?.ok) throw new Error(d?.error ?? 'No se pudo guardar.')
      setToken(d.token)
      const url = `https://valeraapp.valerarealestate.com/ruta/${d.token}`
      try { await Clipboard.setStringAsync(url) } catch { /* se muestra igual */ }
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 4000)
      listarGuardadas()
    } catch (e: any) {
      avisar('No se pudo crear el link', e?.message ?? 'Intenta de nuevo.')
    } finally {
      setCreandoLink(false)
    }
  }

  async function cargarLogo(): Promise<string> {
    try {
      const mod = require('../assets/logo-recortado.png')
      if (Platform.OS === 'web') {
        const uri = typeof mod === 'string' ? mod : (mod?.uri ?? '')
        // bajarComoBase64 y NO imagenABase64: esa pasa por el proxy, que
        // entrega JPG, y el logo —dorado sobre transparente— desaparecía.
        return uri ? await bajarComoBase64(uri) : ''
      }
      const { Asset } = await import('expo-asset')
      const asset = Asset.fromModule(mod)
      await asset.downloadAsync()
      if (!asset.localUri) return ''
      const FileSystem = await import('expo-file-system')
      const b64 = await FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 })
      return 'data:image/png;base64,' + b64
    } catch { return '' }
  }

  // ── Pintado ──────────────────────────────────────────────────────────────
  if (permitido === null) {
    return <View style={[s.centro, { backgroundColor: c.bg }]}><ActivityIndicator color={TEAL} /></View>
  }
  if (!permitido) {
    return (
      <View style={[s.centro, { backgroundColor: c.bg }]}>
        <Ionicons name="lock-closed-outline" size={34} color={c.textMute} />
        <Text style={[s.bloqueo, { color: c.textSub }]}>Esta pantalla es para asesores y coordinación.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.cont} keyboardShouldPersistTaps="handled">
      <Text style={[s.titulo, { color: c.text }]}>Hoja de ruta</Text>
      <Text style={[s.sub, { color: c.textSub }]}>
        Se arma con lo que ya está registrado y puedes cambiar cualquier campo.
        Lo que edites aquí vale sólo para este documento.
      </Text>

      {/* Volver a abrir una hoja ya hecha. Sin esto, el link quedaba
          congelado: se creaba, se mandaba, y no había forma de corregirlo. */}
      {guardadas.length > 0 && (
        <View style={[s.tarjeta, { backgroundColor: c.card, borderColor: c.border }]}>
          <TouchableOpacity style={s.guardadasCab} onPress={() => setVerGuardadas(v => !v)} activeOpacity={0.7}>
            <Ionicons name="time-outline" size={17} color={TEAL} />
            <Text style={[s.guardadasTit, { color: c.text }]}>
              Hojas de ruta recientes ({guardadas.length})
            </Text>
            <Ionicons name={verGuardadas ? 'chevron-up' : 'chevron-down'} size={17} color={c.textMute} />
          </TouchableOpacity>

          {verGuardadas && guardadas.map(h => (
            <TouchableOpacity
              key={h.token}
              style={[s.guardadaFila, { borderColor: c.border }, h.token === token && s.guardadaAbierta]}
              onPress={() => abrirGuardada(h.token)}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.guardadaNom, { color: c.text }]} numberOfLines={1}>{h.cliente}</Text>
                <Text style={[s.guardadaSub, { color: c.textMute }]} numberOfLines={1}>
                  {h.fecha} · {h.paradas} {h.paradas === 1 ? 'propiedad' : 'propiedades'} · editada {cuandoFue(h.actualizada)}
                </Text>
              </View>
              {h.token === token
                ? <Text style={s.guardadaAqui}>abierta</Text>
                : <Ionicons name="create-outline" size={16} color={TEAL} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!token && (
        <View style={s.editandoAviso}>
          <Ionicons name="pencil" size={14} color="#1d4ed8" />
          <Text style={s.editandoTxt}>
            Estás editando una hoja ya creada. Al guardar se actualiza el mismo link.
          </Text>
          <TouchableOpacity onPress={empezarDeCero}>
            <Text style={s.editandoNueva}>Nueva</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Cliente ─────────────────────────────────────────────────────── */}
      <View style={[s.tarjeta, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.seccion, { color: AZUL }]}>1 · Cliente</Text>
        {cliente ? (
          <View style={s.elegido}>
            <Ionicons name="person-circle-outline" size={20} color={TEAL} />
            <Text style={[s.elegidoTxt, { color: c.text }]} numberOfLines={1}>{cliente.nombre}</Text>
            <TouchableOpacity onPress={() => { setCliente(null); setDias([]) }}>
              <Text style={s.cambiar}>Cambiar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
              value={busca} onChangeText={buscarClientes}
              placeholder="Busca por nombre o teléfono…" placeholderTextColor={c.placeholder}
            />
            {resultados.map(r => (
              <TouchableOpacity key={r.id} style={[s.resultado, { borderColor: c.border }]} onPress={() => cargarCliente(r.id)}>
                <Text style={[s.resultadoNom, { color: c.text }]}>{r.nombre}</Text>
                {!!r.telefono && <Text style={[s.resultadoTel, { color: c.textMute }]}>{r.telefono}</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}

        {dias.length > 0 && (
          <>
            <Text style={[s.lbl, { color: c.textSub, marginTop: 12 }]}>Traer las citas de un día</Text>
            <View style={s.chips}>
              {dias.map(d => (
                <TouchableOpacity key={d.dia} style={[s.chip, { borderColor: c.border }]} onPress={() => traerCitasDelDia(d.dia)}>
                  <Text style={[s.chipTxt, { color: c.textSub }]}>{d.etiqueta} · {d.n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Perfil ──────────────────────────────────────────────────────── */}
      <View style={[s.tarjeta, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.seccion, { color: AZUL }]}>2 · Perfil del cliente</Text>
        <Campo etiqueta="Fecha del recorrido" valor={fecha} alCambiar={setFecha} />
        <Campo etiqueta="Nombre"         valor={perfil.nombre}      alCambiar={v => setPerfil(p => ({ ...p, nombre: v }))} />
        <Campo etiqueta="Teléfono"       valor={perfil.telefono}    alCambiar={v => setPerfil(p => ({ ...p, telefono: v }))} />
        <Campo etiqueta="Correo"         valor={perfil.correo}      alCambiar={v => setPerfil(p => ({ ...p, correo: v }))} placeholder="Pendiente" />
        <Campo etiqueta="Origen"         valor={perfil.origen}      alCambiar={v => setPerfil(p => ({ ...p, origen: v }))} />
        <Campo etiqueta="Forma de pago"  valor={perfil.formaPago}   alCambiar={v => setPerfil(p => ({ ...p, formaPago: v }))} />
        <Campo etiqueta="Presupuesto máximo" valor={perfil.presupuesto} alCambiar={v => setPerfil(p => ({ ...p, presupuesto: v }))} />
        <Campo etiqueta="Busca" valor={perfil.busca} alCambiar={v => setPerfil(p => ({ ...p, busca: v }))}
          placeholder="Ej. 2 recámaras, 2 baños" multi />
      </View>

      {/* ── Paradas ─────────────────────────────────────────────────────── */}
      <View style={[s.tarjeta, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.seccion, { color: AZUL }]}>3 · Propiedades del recorrido</Text>

        {paradas.map((p, i) => (
          <View key={p.clave} style={[s.parada, { borderColor: c.border }]}>
            <View style={s.paradaCab}>
              <Text style={[s.paradaNum, { color: TEAL }]}>Propiedad {i + 1}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => mover(i, -1)} disabled={i === 0} style={s.iconoBtn}>
                <Ionicons name="arrow-up" size={15} color={i === 0 ? c.textMute : TEAL} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => mover(i, 1)} disabled={i === paradas.length - 1} style={s.iconoBtn}>
                <Ionicons name="arrow-down" size={15} color={i === paradas.length - 1 ? c.textMute : TEAL} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => quitar(p.clave)} style={s.iconoBtn}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
              </TouchableOpacity>
            </View>
            {/* Lo primero de cada parada: a cuáles se puede llegar derecho. */}
            <TouchableOpacity
              style={[s.confirmaFila, p.confirmada ? s.confirmaOk : s.confirmaPend]}
              onPress={() => setParadas(prev => prev.map(x => x.clave === p.clave ? { ...x, confirmada: !x.confirmada } : x))}
              activeOpacity={0.75}
            >
              <Ionicons
                name={p.confirmada ? 'checkmark-circle' : 'ellipse-outline'}
                size={19}
                color={p.confirmada ? '#15803d' : '#a16207'}
              />
              <Text style={[s.confirmaTxt, { color: p.confirmada ? '#15803d' : '#a16207' }]}>
                {p.confirmada ? 'Cita confirmada' : 'Por confirmar'}
              </Text>
              <Text style={s.confirmaHint}>toca para cambiar</Text>
            </TouchableOpacity>
            <Campo etiqueta="Hora de la cita" valor={p.hora} alCambiar={v => editar(p.clave, 'hora', v)} placeholder="11:00 AM" />
            <Campo etiqueta="Propiedad" valor={p.titulo} alCambiar={v => editar(p.clave, 'titulo', v)} />
            <Campo etiqueta="Ubicación" valor={p.ubicacion} alCambiar={v => editar(p.clave, 'ubicacion', v)} multi />
            <Campo etiqueta="Precio" valor={p.precio} alCambiar={v => editar(p.clave, 'precio', v)} placeholder="$1,860,000 MXN Venta" />
            <Campo etiqueta="Características" valor={p.caracteristicas} alCambiar={v => editar(p.clave, 'caracteristicas', v)} placeholder="2 recámaras · 2 baños" />
            <Campo etiqueta="Link del mapa" valor={p.mapaUrl} alCambiar={v => editar(p.clave, 'mapaUrl', v)} />
            <Campo etiqueta="Link de la propiedad" valor={p.linkPropiedad} alCambiar={v => editar(p.clave, 'linkPropiedad', v)} />
            <Campo etiqueta="Asesor a cargo" valor={p.asesorNombre} alCambiar={v => editar(p.clave, 'asesorNombre', v)} placeholder="Nombre — Inmobiliaria" />
            <Campo etiqueta="Teléfono del asesor" valor={p.asesorTel} alCambiar={v => editar(p.clave, 'asesorTel', v)} />
            <Campo etiqueta="Foto (link)" valor={p.fotoUrl} alCambiar={v => setParadas(prev => prev.map(x => x.clave === p.clave ? { ...x, fotoUrl: v, fotoBase64: '' } : x))} />
          </View>
        ))}

        <Text style={[s.lbl, { color: c.textSub, marginTop: 6 }]}>Agregar una propiedad de la app</Text>
        <TextInput
          style={[s.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
          value={buscaProp} onChangeText={buscarPropiedades}
          placeholder="Busca por título o código…" placeholderTextColor={c.placeholder}
        />
        {propsEncontradas.map(p => (
          <TouchableOpacity key={p.id} style={[s.resultado, { borderColor: c.border }]} onPress={() => agregarDeLaApp(p.id)}>
            <Text style={[s.resultadoNom, { color: c.text }]} numberOfLines={1}>{p.titulo}</Text>
            <Text style={[s.resultadoTel, { color: c.textMute }]} numberOfLines={1}>
              {[p.codigo, p.direccion].filter(Boolean).join(' · ')}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={[s.lbl, { color: c.textSub, marginTop: 14 }]}>…o pega el link de un anuncio</Text>
        <View style={s.linkRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
            value={link} onChangeText={setLink} autoCapitalize="none"
            placeholder="https://…" placeholderTextColor={c.placeholder}
          />
          <TouchableOpacity style={[s.btnChico, importando && { opacity: 0.6 }]} onPress={agregarPorLink} disabled={importando}>
            {importando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnChicoTxt}>Traer</Text>}
          </TouchableOpacity>
        </View>

        {!!avisoImport && (
          <Text style={[s.avisoImport, { color: avisoImport.startsWith('⚠') ? '#b45309' : '#15803d' }]}>
            {avisoImport}
          </Text>
        )}

        <TouchableOpacity style={[s.btnVacio, { borderColor: c.border }]} onPress={() => setParadas(prev => [...prev, PARADA_VACIA()])}>
          <Ionicons name="add" size={16} color={TEAL} />
          <Text style={[s.btnVacioTxt, { color: TEAL }]}>Agregar una en blanco y llenarla a mano</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[s.btnPdf, generando && { opacity: 0.6 }]} onPress={generar} disabled={generando}>
        {generando
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="document-text-outline" size={17} color="#fff" />
              <Text style={s.btnPdfTxt}>Descargar en PDF</Text></>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btnLink, { borderColor: TEAL }, creandoLink && { opacity: 0.6 }]}
        onPress={crearLink}
        disabled={creandoLink}
      >
        {creandoLink
          ? <ActivityIndicator color={TEAL} />
          : <><Ionicons name={token ? 'refresh-outline' : 'link-outline'} size={17} color={TEAL} />
              <Text style={[s.btnLinkTxt, { color: TEAL }]}>
                {token ? 'Actualizar el link' : 'Crear un link para compartir'}
              </Text></>}
      </TouchableOpacity>

      {!!token && (
        <View style={[s.linkCaja, { borderColor: c.border, backgroundColor: c.card }]}>
          <Text style={[s.linkUrl, { color: c.textSub }]} numberOfLines={2} selectable>
            valeraapp.valerarealestate.com/ruta/{token}
          </Text>
          <Text style={s.linkAviso}>
            {linkCopiado
              ? '✓ Copiado. Pégalo en WhatsApp.'
              : 'Cualquiera con el link la ve, sin entrar a la app. Mándalo sólo al equipo.'}
          </Text>
        </View>
      )}

      {cargando && <ActivityIndicator color={TEAL} style={{ marginTop: 10 }} />}
      <View style={{ height: 60 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  cont: { padding: 16, paddingBottom: 40 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  bloqueo: { fontSize: 14, textAlign: 'center' },
  titulo: { fontSize: 23, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 5, marginBottom: 16, lineHeight: 18 },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 14 },
  guardadasCab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guardadasTit: { flex: 1, fontSize: 14, fontWeight: '800' },
  guardadaFila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 9,
  },
  guardadaAbierta: { borderColor: TEAL, borderWidth: 1.5 },
  guardadaNom: { fontSize: 13.5, fontWeight: '800' },
  guardadaSub: { fontSize: 11.5, marginTop: 2 },
  guardadaAqui: { fontSize: 11, fontWeight: '800', color: TEAL },
  editandoAviso: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#93c5fd',
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  editandoTxt: { flex: 1, fontSize: 12, fontWeight: '700', color: '#1d4ed8', lineHeight: 16 },
  editandoNueva: { fontSize: 12, fontWeight: '800', color: '#1d4ed8', textDecorationLine: 'underline' },
  seccion: { fontSize: 13.5, fontWeight: '800', letterSpacing: 0.4, marginBottom: 12 },
  campo: { marginBottom: 10 },
  lbl: { fontSize: 11.5, fontWeight: '700', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  inputMulti: { minHeight: 62, textAlignVertical: 'top' },
  elegido: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elegidoTxt: { flex: 1, fontSize: 15, fontWeight: '700' },
  cambiar: { fontSize: 12, fontWeight: '700', color: TEAL },
  resultado: { borderWidth: 1, borderRadius: 9, padding: 10, marginBottom: 6 },
  resultadoNom: { fontSize: 13.5, fontWeight: '700' },
  resultadoTel: { fontSize: 11.5, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  parada: { borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 12 },
  confirmaFila: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10,
  },
  confirmaOk:   { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  confirmaPend: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  confirmaTxt:  { fontSize: 13.5, fontWeight: '800', flex: 1 },
  confirmaHint: { fontSize: 10.5, color: '#94a3b8', fontWeight: '600' },
  paradaCab: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  paradaNum: { fontSize: 13, fontWeight: '800' },
  iconoBtn: { padding: 6 },
  linkRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  btnChico: { backgroundColor: TEAL, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 11 },
  btnChicoTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  avisoImport: { fontSize: 12, fontWeight: '700', marginBottom: 10, lineHeight: 17 },
  btnVacio: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 11, marginTop: 4,
  },
  btnVacioTxt: { fontSize: 12.5, fontWeight: '700' },
  btnPdf: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: AZUL, borderRadius: 12, paddingVertical: 15,
  },
  btnPdfTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 2, borderRadius: 12, paddingVertical: 13, marginTop: 10,
  },
  btnLinkTxt: { fontSize: 14.5, fontWeight: '800' },
  linkCaja: { borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 10 },
  linkUrl: { fontSize: 12, fontWeight: '700' },
  linkAviso: { fontSize: 11, color: '#94a3b8', marginTop: 5, lineHeight: 15 },
})
