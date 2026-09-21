// Solicitudes que llegan de la landing page pública (proyecto aparte, sitio
// estático) — a propósito SEPARADAS del CRM (tabla `clientes`): son
// solicitudes crudas sin perfilar, no se mezclan con el pipeline de ventas.
// Dos pestañas: "Solicitudes" (contacto general / interés en propiedad) y
// "Reclutamiento" (aspirantes a asesor/prospectador).
import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Linking, Alert } from 'react-native'
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { usePullRefresh } from '../../hooks/usePullRefresh'

const BUCKET_DOCUMENTOS = 'candidatos-documentos'

type Documento = { tipo: string; ruta: string; nombre: string }

type Estado = 'nuevo' | 'contactado' | 'descartado'

type Solicitud = {
  id: string
  tipo: 'contacto_general' | 'interes_propiedad'
  nombre: string
  telefono: string
  mensaje: string | null
  presupuesto: string | null
  zona: string | null
  propiedad_codigo: string | null
  propiedad_titulo: string | null
  estado: Estado
  created_at: string
}

type Candidato = {
  id: string
  nombre: string
  telefono: string
  email: string | null
  mensaje: string | null
  documentos: Documento[]
  estado: Estado
  created_at: string
}

const ESTADO_LABEL: Record<Estado, string> = { nuevo: 'Nuevo', contactado: 'Contactado', descartado: 'Descartado' }
const ESTADO_COLOR: Record<Estado, string> = { nuevo: '#c9a84c', contactado: '#16A34A', descartado: '#94A3B8' }

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// El formulario de reclutamiento manda el mensaje como texto plano con una
// línea "Etiqueta: valor" por campo (fecha de nacimiento, domicilio,
// experiencia...). Si TODAS las líneas encajan en ese patrón se muestra como
// una lista de campos ordenada; si no (mensaje libre, como en contacto
// general), se muestra tal cual entre comillas — sin inventar estructura
// donde no la hay.
type MensajePar = { label: string; valor: string }
function parsearMensaje(mensaje: string): MensajePar[] | null {
  const lineas = mensaje.split('\n').map(l => l.trim()).filter(Boolean)
  if (lineas.length < 2) return null
  const pares: MensajePar[] = []
  for (const linea of lineas) {
    const m = linea.match(/^([^:]{2,60}):\s*(.+)$/)
    if (!m) return null
    pares.push({ label: m[1].trim(), valor: m[2].trim() })
  }
  return pares
}

function DetalleMensaje({ mensaje, c }: { mensaje: string | null; c: ReturnType<typeof useColors> }) {
  if (!mensaje) return null
  const pares = parsearMensaje(mensaje)
  if (!pares) {
    return <Text style={[s.mensaje, { color: c.textSub }]}>“{mensaje}”</Text>
  }
  return (
    <View style={[s.detalleBox, { backgroundColor: c.bg, borderColor: c.border }]}>
      {pares.map((p, i) => (
        <View key={p.label + i} style={[s.detalleRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
          <Text style={[s.detalleLabel, { color: c.textMute }]}>{p.label}</Text>
          <Text style={[s.detalleValor, { color: c.text }]}>{p.valor}</Text>
        </View>
      ))}
    </View>
  )
}

// Fila de "chips" para los campos cortos (zona, presupuesto, propiedad de
// interés) — antes iban uno debajo del otro y se sentía desordenado.
function MetaChips({ items, c }: { items: { icon: string; texto: string }[]; c: ReturnType<typeof useColors> }) {
  if (items.length === 0) return null
  return (
    <View style={s.metaChipsRow}>
      {items.map((it, i) => (
        <View key={i} style={[s.metaChip, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={[s.metaChipText, { color: c.textSub }]} numberOfLines={1}>{it.icon} {it.texto}</Text>
        </View>
      ))}
    </View>
  )
}

// Segmentado de 3 estados — mismo componente para ambas pestañas.
function EstadoSelector({ estado, onCambiar }: { estado: Estado; onCambiar: (e: Estado) => void }) {
  return (
    <View style={s.estadoRow}>
      {(['nuevo', 'contactado', 'descartado'] as const).map(e => (
        <TouchableOpacity
          key={e}
          onPress={() => onCambiar(e)}
          style={[
            s.estadoBtn,
            { borderColor: ESTADO_COLOR[e] },
            estado === e && { backgroundColor: ESTADO_COLOR[e] },
          ]}
        >
          <Text style={[s.estadoBtnText, { color: estado === e ? '#fff' : ESTADO_COLOR[e] }]}>
            {ESTADO_LABEL[e]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

export default function SolicitudesWeb() {
  const c = useColors()
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>()
  const [tab, setTab] = useState<'solicitudes' | 'reclutamiento'>(
    tabParam === 'reclutamiento' ? 'reclutamiento' : 'solicitudes'
  )

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true)
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [loadingCandidatos, setLoadingCandidatos] = useState(true)
  const [actualizando, setActualizando] = useState<string | null>(null)

  async function cargarSolicitudes() {
    setLoadingSolicitudes(true)
    const { data } = await supabase.from('solicitudes_sitio_web').select('*').order('created_at', { ascending: false })
    setSolicitudes((data as Solicitud[]) ?? [])
    setLoadingSolicitudes(false)
  }

  async function cargarCandidatos() {
    setLoadingCandidatos(true)
    const { data } = await supabase.from('candidatos_reclutamiento').select('*').order('created_at', { ascending: false })
    setCandidatos((data as Candidato[]) ?? [])
    setLoadingCandidatos(false)
  }

  useFocusEffect(useCallback(() => { cargarSolicitudes(); cargarCandidatos() }, []))
  const { refreshControl } = usePullRefresh(async () => { await Promise.all([cargarSolicitudes(), cargarCandidatos()]) })

  async function cambiarEstadoSolicitud(id: string, estado: Estado) {
    setActualizando(id)
    setSolicitudes(prev => prev.map(x => x.id === id ? { ...x, estado } : x)) // optimista
    const { error } = await supabase.from('solicitudes_sitio_web').update({ estado }).eq('id', id)
    setActualizando(null)
    if (error) cargarSolicitudes() // revertir si falló
  }

  async function cambiarEstadoCandidato(id: string, estado: Estado) {
    setActualizando(id)
    setCandidatos(prev => prev.map(x => x.id === id ? { ...x, estado } : x)) // optimista
    const { error } = await supabase.from('candidatos_reclutamiento').update({ estado }).eq('id', id)
    setActualizando(null)
    if (error) cargarCandidatos() // revertir si falló
  }

  // El bucket es privado: la URL se firma AL TOCAR (no se pre-generan al
  // cargar la lista), expira en ~60s — de sobra para que se abra en una
  // pestaña/visor y se descargue, pero no queda un link reusable después.
  const [abriendoDoc, setAbriendoDoc] = useState<string | null>(null)
  async function abrirDocumento(doc: Documento) {
    setAbriendoDoc(doc.ruta)
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(doc.ruta, 60)
    setAbriendoDoc(null)
    if (error || !data?.signedUrl) {
      const msg = 'No se pudo abrir el documento. Intenta de nuevo.'
      if (Platform.OS === 'web') window.alert(msg)
      else Alert.alert('Documento', msg)
      return
    }
    if (Platform.OS === 'web') window.open(data.signedUrl, '_blank')
    else Linking.openURL(data.signedUrl)
  }

  const nuevasSolicitudes = solicitudes.filter(x => x.estado === 'nuevo').length
  const nuevosCandidatos = candidatos.filter(x => x.estado === 'nuevo').length

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/propiedades')}>
          <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Solicitudes del sitio web 🌐</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {(['solicitudes', 'reclutamiento'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && { borderBottomColor: '#1a6470', borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? '#1a6470' : c.textMute }]}>
              {t === 'solicitudes' ? `Solicitudes${nuevasSolicitudes > 0 ? ` (${nuevasSolicitudes})` : ''}` : `Reclutamiento${nuevosCandidatos > 0 ? ` (${nuevosCandidatos})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'solicitudes' ? (
        loadingSolicitudes ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
        ) : solicitudes.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={[s.emptyText, { color: c.textMute }]}>Aún no hay solicitudes del sitio web</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll} refreshControl={refreshControl}>
            {solicitudes.map(item => (
              <View key={item.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.cardTopRow}>
                  <View style={[s.tipoChip, { backgroundColor: item.tipo === 'interes_propiedad' ? '#1a647018' : '#7C3AED18' }]}>
                    <Text style={[s.tipoChipText, { color: item.tipo === 'interes_propiedad' ? '#1a6470' : '#7C3AED' }]}>
                      {item.tipo === 'interes_propiedad' ? '🏠 Interés en propiedad' : '📩 Contacto general'}
                    </Text>
                  </View>
                  <Text style={[s.fecha, { color: c.textMute }]}>{formatFecha(item.created_at)}</Text>
                </View>

                <Text style={[s.nombre, { color: c.text }]}>{item.nombre}</Text>
                <Text style={[s.telefono, { color: c.textSub }]}>📞 {item.telefono}</Text>

                <MetaChips
                  c={c}
                  items={
                    item.tipo === 'interes_propiedad'
                      ? [{ icon: '🏷️', texto: item.propiedad_titulo ?? item.propiedad_codigo ?? '' }]
                      : [
                          ...(item.zona ? [{ icon: '📍', texto: item.zona }] : []),
                          ...(item.presupuesto ? [{ icon: '💰', texto: item.presupuesto }] : []),
                        ]
                  }
                />

                <DetalleMensaje mensaje={item.mensaje} c={c} />

                <View style={[s.divider, { borderColor: c.border }]} />
                <EstadoSelector
                  estado={item.estado}
                  onCambiar={(e) => cambiarEstadoSolicitud(item.id, e)}
                />
              </View>
            ))}
          </ScrollView>
        )
      ) : (
        loadingCandidatos ? (
          <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
        ) : candidatos.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🧑‍💼</Text>
            <Text style={[s.emptyText, { color: c.textMute }]}>Aún no hay candidatos registrados</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll} refreshControl={refreshControl}>
            {candidatos.map(item => (
              <View key={item.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={s.cardTopRow}>
                  <View style={[s.tipoChip, { backgroundColor: '#CA8A0418' }]}>
                    <Text style={[s.tipoChipText, { color: '#CA8A04' }]}>🧑‍💼 Candidato</Text>
                  </View>
                  <Text style={[s.fecha, { color: c.textMute }]}>{formatFecha(item.created_at)}</Text>
                </View>

                <Text style={[s.nombre, { color: c.text }]}>{item.nombre}</Text>
                <Text style={[s.telefono, { color: c.textSub }]}>📞 {item.telefono}</Text>

                <MetaChips c={c} items={item.email ? [{ icon: '✉️', texto: item.email }] : []} />

                <DetalleMensaje mensaje={item.mensaje} c={c} />

                {item.documentos?.length > 0 && (
                  <>
                    <Text style={[s.docsLabel, { color: c.textMute }]}>DOCUMENTOS</Text>
                    <View style={s.docsRow}>
                      {item.documentos.map((doc, i) => (
                        <TouchableOpacity
                          key={doc.ruta}
                          style={[s.docChip, { borderColor: c.border, backgroundColor: c.bg }]}
                          onPress={() => abrirDocumento(doc)}
                          disabled={abriendoDoc === doc.ruta}
                        >
                          {abriendoDoc === doc.ruta
                            ? <ActivityIndicator size="small" color="#1a6470" />
                            : <Text style={[s.docChipText, { color: '#1a6470' }]} numberOfLines={1}>
                                📎 {doc.nombre || `Documento ${i + 1}`}
                              </Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <View style={[s.divider, { borderColor: c.border }]} />
                <EstadoSelector
                  estado={item.estado}
                  onCambiar={(e) => cambiarEstadoCandidato(item.id, e)}
                />
              </View>
            ))}
          </ScrollView>
        )
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a6470', paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === 'web' ? 14 : 44 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700' },

  scroll: { padding: 16, gap: 10, paddingBottom: 40 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4, marginBottom: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tipoChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tipoChipText: { fontSize: 11.5, fontWeight: '800' },
  fecha: { fontSize: 11 },

  nombre: { fontSize: 16, fontWeight: '800' },
  telefono: { fontSize: 13.5, marginTop: 2 },
  mensaje: { fontSize: 13, fontStyle: 'italic', marginTop: 8, lineHeight: 18 },

  // Chips cortos (zona, presupuesto, propiedad de interés, email)
  metaChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaChip: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  metaChipText: { fontSize: 12, fontWeight: '600' },

  // Mensaje estructurado (Etiqueta: valor por línea) del formulario de reclutamiento
  detalleBox: { borderRadius: 10, borderWidth: 1, marginTop: 8, overflow: 'hidden' },
  detalleRow: { paddingHorizontal: 10, paddingVertical: 7 },
  detalleLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  detalleValor: { fontSize: 13, marginTop: 2, lineHeight: 17 },

  docsLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 10, marginBottom: 6 },
  docsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docChip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 200 },
  docChipText: { fontSize: 12, fontWeight: '700' },

  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 10 },
  estadoRow: { flexDirection: 'row', gap: 8 },
  estadoBtn: { flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center' },
  estadoBtnText: { fontSize: 12.5, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
})
