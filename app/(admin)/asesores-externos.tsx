// Asesores externos: agenda de asesores que nos apoyan por zona. Guarda
// nombre, teléfono y la zona por la que apoyan. CRUD simple (admin/gerencia).
import { useState, useCallback } from 'react'
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

type Tipo = 'alianza' | 'independiente'
type Asesor = {
  id: string; nombre: string; telefono: string | null; zona: string | null
  estado_mx: string | null; tipo: Tipo | null; created_at: string
}
const TEAL = '#1a6470'
const TODOS = '__todos__'

/**
 * Los dos tipos de asesor externo.
 *
 * No son lo mismo y hasta ahora vivian revueltos: una ALIANZA es un acuerdo
 * con otra inmobiliaria, y un INDEPENDIENTE es alguien que nos apoya por su
 * cuenta. Al repartir una propiedad por zona importa saber cual es cual.
 */
const TIPOS: { valor: Tipo; etiqueta: string; color: string; desc: string }[] = [
  { valor: 'alianza',       etiqueta: 'Alianza',       color: '#5e35b1', desc: 'Acuerdo con otra inmobiliaria' },
  { valor: 'independiente', etiqueta: 'Independiente', color: '#1a6470', desc: 'Asesor por su cuenta que nos apoya' },
]
const tipoDe = (t: Tipo | null | undefined) => TIPOS.find(x => x.valor === t)

/** "hace 3 días", "el 22 sep" — para saber de cuando es cada registro. */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function cuandoSeRegistro(iso: string): string {
  const d = new Date(iso)
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}
function soloTel(t: string | null | undefined) { return (t ?? '').replace(/[^\d+]/g, '') }

export default function AsesoresExternos() {
  const c = useColors()
  const [lista, setLista] = useState<Asesor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>(TODOS)
  const [filtroZona, setFiltroZona] = useState<string>(TODOS)
  const [filtroTipo, setFiltroTipo] = useState<Tipo | 'sin' | typeof TODOS>(TODOS)
  // Por fecha de registro de entrada: lo que se acaba de dar de alta es lo que
  // se quiere ver. El alfabetico sigue estando a un toque.
  const [orden, setOrden] = useState<'recientes' | 'nombre'>('recientes')
  const [editando, setEditando] = useState<Partial<Asesor> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [selectorEstadoAbierto, setSelectorEstadoAbierto] = useState(false)

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

  function borrar(a: Asesor) {
    const go = async () => { setLista(prev => prev.filter(x => x.id !== a.id)); await supabase.from('asesores_externos').delete().eq('id', a.id) }
    if (Platform.OS === 'web') { if (window.confirm(`¿Borrar a ${a.nombre}?`)) go() }
    else Alert.alert('Borrar asesor', `¿Borrar a ${a.nombre}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: go }])
  }

  // Estados/zonas presentes en los datos (no el catálogo completo de 32 estados),
  // para que el filtro solo muestre pastillas con resultados reales.
  const estadosPresentes = [...new Set(lista.map(a => a.estado_mx).filter((e): e is string => !!e))]
    .sort((a, b) => a === ESTADO_PRINCIPAL ? -1 : b === ESTADO_PRINCIPAL ? 1 : a.localeCompare(b, 'es'))
  const listaPorEstado = filtroEstado === TODOS ? lista : lista.filter(a => a.estado_mx === filtroEstado)
  const zonasPresentes = [...new Set(listaPorEstado.map(a => a.zona).filter((z): z is string => !!z))]
    .sort((a, b) => a.localeCompare(b, 'es'))

  const q = normalizar(busca)
  const qDig = busca.replace(/\D/g, '')
  const filtrados = listaPorEstado.filter(a =>
    (!q || normalizar(a.nombre).includes(q) || normalizar(a.zona).includes(q)) &&
    (qDig.length === 0 || soloTel(a.telefono).includes(qDig)) &&
    (filtroZona === TODOS || a.zona === filtroZona) &&
    (filtroTipo === TODOS || (filtroTipo === 'sin' ? !a.tipo : a.tipo === filtroTipo))
  ).sort((a, b) => orden === 'nombre'
    ? a.nombre.localeCompare(b.nombre, 'es')
    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (loading) return <View style={[st.center, { backgroundColor: c.bg }]}><ActivityIndicator size="large" color={TEAL} /></View>

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(true) }} tintColor={TEAL} />}
      >
        <Text style={[st.h1, { color: c.text }]}>Asesores externos</Text>
        <Text style={[st.sub, { color: c.textMute }]}>Asesores que nos apoyan por zona. {lista.length} registrado{lista.length !== 1 ? 's' : ''}.</Text>

        <View style={[st.buscaRow, { borderColor: c.border, backgroundColor: c.card }]}>
          <Ionicons name="search-outline" size={16} color={c.textMute} />
          <TextInput style={[st.buscaInp, { color: c.text }]} value={busca} onChangeText={setBusca}
            placeholder="Buscar por nombre, zona o teléfono…" placeholderTextColor={c.placeholder} />
        </View>

        {/* Orden y tipo. Van juntos porque son las dos preguntas que se hacen
            al abrir esta pantalla: "¿a quién di de alta hace poco?" y "¿quién
            es alianza y quién va por su cuenta?". */}
        <View style={st.barraRow}>
          <TouchableOpacity
            style={[st.ordenBtn, { borderColor: c.border }]}
            onPress={() => setOrden(o => o === 'recientes' ? 'nombre' : 'recientes')}
          >
            <Ionicons
              name={orden === 'recientes' ? 'time-outline' : 'text-outline'}
              size={14} color={TEAL}
            />
            <Text style={[st.ordenTxt, { color: c.textSub }]}>
              {orden === 'recientes' ? 'Más recientes' : 'Por nombre'}
            </Text>
          </TouchableOpacity>

          <View style={st.tipoFiltros}>
            {([[TODOS, 'Todos', c.textSub] as const,
               ...TIPOS.map(t => [t.valor, t.etiqueta, t.color] as const),
               ['sin', 'Sin clasificar', '#b45309'] as const,
              ]).map(([valor, etiqueta, color]) => {
              const on = filtroTipo === valor
              const n = valor === TODOS ? listaPorEstado.length
                : valor === 'sin' ? listaPorEstado.filter(a => !a.tipo).length
                : listaPorEstado.filter(a => a.tipo === valor).length
              if (n === 0 && !on && valor !== TODOS) return null
              return (
                <TouchableOpacity
                  key={valor}
                  style={[st.tipoChip, { borderColor: on ? color : c.border, backgroundColor: on ? color : 'transparent' }]}
                  onPress={() => setFiltroTipo(prev => prev === valor ? TODOS : valor as any)}
                >
                  <Text style={[st.tipoChipTxt, { color: on ? '#fff' : c.textSub }]}>{etiqueta} · {n}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {estadosPresentes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtroScroll} contentContainerStyle={st.filtroRow}>
            <TouchableOpacity
              style={[st.filtroChip, { borderColor: c.border }, filtroEstado === TODOS && st.filtroChipOn]}
              onPress={() => { setFiltroEstado(TODOS); setFiltroZona(TODOS) }}
            >
              <Text style={[st.filtroChipTxt, { color: c.textSub }, filtroEstado === TODOS && st.filtroChipTxtOn]}>Todos los estados</Text>
            </TouchableOpacity>
            {estadosPresentes.map(e => (
              <TouchableOpacity
                key={e}
                style={[st.filtroChip, { borderColor: c.border }, filtroEstado === e && st.filtroChipOn]}
                onPress={() => { setFiltroEstado(prev => prev === e ? TODOS : e); setFiltroZona(TODOS) }}
              >
                <Text style={[st.filtroChipTxt, { color: c.textSub }, filtroEstado === e && st.filtroChipTxtOn]}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {zonasPresentes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtroScroll} contentContainerStyle={st.filtroRow}>
            <TouchableOpacity
              style={[st.filtroChip, { borderColor: c.border }, filtroZona === TODOS && st.filtroChipOn]}
              onPress={() => setFiltroZona(TODOS)}
            >
              <Text style={[st.filtroChipTxt, { color: c.textSub }, filtroZona === TODOS && st.filtroChipTxtOn]}>Todas las zonas</Text>
            </TouchableOpacity>
            {zonasPresentes.map(z => (
              <TouchableOpacity
                key={z}
                style={[st.filtroChip, { borderColor: c.border }, filtroZona === z && st.filtroChipOn]}
                onPress={() => setFiltroZona(prev => prev === z ? TODOS : z)}
              >
                <Text style={[st.filtroChipTxt, { color: c.textSub }, filtroZona === z && st.filtroChipTxtOn]}>{z}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {filtrados.length === 0 ? (
          <Text style={[st.vacio, { color: c.textMute }]}>
            {lista.length === 0 ? 'Aún no hay asesores externos. Toca "＋ Agregar" para registrar el primero.' : 'Sin resultados.'}
          </Text>
        ) : filtrados.map(a => (
          <View key={a.id} style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[st.avatar, { backgroundColor: c.bg }]}>
              <Text style={st.avatarTxt}>{a.nombre.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={st.nombreRow}>
                <Text style={[st.nombre, { color: c.text }]} numberOfLines={1}>{a.nombre}</Text>
                {(() => {
                  const t = tipoDe(a.tipo)
                  return (
                    <View style={[st.tipoPill, { backgroundColor: (t?.color ?? '#b45309') + '1A' }]}>
                      <Text style={[st.tipoPillTxt, { color: t?.color ?? '#b45309' }]}>
                        {t?.etiqueta ?? 'Sin clasificar'}
                      </Text>
                    </View>
                  )
                })()}
              </View>
              {(a.zona || a.estado_mx) ? (
                <View style={st.zonaRow}>
                  <Ionicons name="location-outline" size={12} color={TEAL} />
                  <Text style={[st.zona, { color: c.textSub }]} numberOfLines={1}>
                    {[a.zona, a.estado_mx].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ) : null}
              {a.telefono ? <Text style={[st.tel, { color: c.textMute }]}>{a.telefono}</Text> : null}
              <Text style={[st.registrado, { color: c.textMute }]}>Registrado {cuandoSeRegistro(a.created_at)}</Text>
            </View>
            <View style={st.acciones}>
              {a.telefono ? (
                <>
                  <TouchableOpacity style={[st.accBtn, { backgroundColor: '#25D36622' }]} onPress={() => Linking.openURL(`https://wa.me/${soloTel(a.telefono).replace(/^\+/, '')}`)}>
                    <Ionicons name="logo-whatsapp" size={16} color="#128C7E" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.accBtn, { backgroundColor: TEAL + '22' }]} onPress={() => Linking.openURL(`tel:${soloTel(a.telefono)}`)}>
                    <Ionicons name="call" size={15} color={TEAL} />
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity style={[st.accBtn, { backgroundColor: c.bg }]} onPress={() => setEditando(a)}>
                <Ionicons name="create-outline" size={16} color={c.textSub} />
              </TouchableOpacity>
              <TouchableOpacity style={[st.accBtn, { backgroundColor: '#fee2e2' }]} onPress={() => borrar(a)}>
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={st.fab} onPress={() => setEditando({ nombre: '', telefono: '', zona: '', estado_mx: ESTADO_PRINCIPAL })} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={st.fabTxt}>Agregar</Text>
      </TouchableOpacity>

      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: c.card }]}>
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
                      <Text style={[st.tipoOpcionSub, { color: c.textMute }]}>{t.desc}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={[st.lbl, { color: c.textSub }]}>Estado</Text>
            <TouchableOpacity
              style={[st.inp, st.selectorBtn, { borderColor: c.inputBorder, backgroundColor: c.input }]}
              onPress={() => setSelectorEstadoAbierto(true)}
            >
              <Text style={{ color: editando?.estado_mx ? c.text : c.placeholder, fontSize: 15 }}>
                {editando?.estado_mx ?? 'Selecciona un estado'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={c.textMute} />
            </TouchableOpacity>

            <Text style={[st.lbl, { color: c.textSub }]}>Zona por la que nos apoya</Text>
            <TextInput style={[st.inp, { color: c.text, borderColor: c.inputBorder, backgroundColor: c.input }]}
              value={editando?.zona ?? ''} onChangeText={v => setEditando(e => ({ ...e, zona: v }))}
              placeholder="Ej. Juriquilla, El Refugio…" placeholderTextColor={c.placeholder} autoCapitalize="words" />

            {editando?.estado_mx === ESTADO_PRINCIPAL && (
              <View style={st.zonaChipsWrap}>
                {ZONAS_INTERES.map(z => (
                  <TouchableOpacity
                    key={z}
                    style={[st.zonaChip, { borderColor: c.border }, editando?.zona === z && st.filtroChipOn]}
                    onPress={() => setEditando(e => ({ ...e, zona: z }))}
                  >
                    <Text style={[st.filtroChipTxt, { color: c.textSub }, editando?.zona === z && st.filtroChipTxtOn]}>{z}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={[st.guardarBtn, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={st.guardarTxt}>{editando?.id ? 'Guardar cambios' : 'Agregar asesor'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={st.cancelar} onPress={() => setEditando(null)}><Text style={[st.cancelarTxt, { color: c.textSub }]}>Cancelar</Text></TouchableOpacity>
          </View>
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
  h1: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 12.5, marginTop: 2, marginBottom: 14 },
  barraRow: { marginTop: 10, gap: 8 },
  ordenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
  },
  ordenTxt: { fontSize: 12.5, fontWeight: '800' },
  tipoFiltros: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tipoChip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  tipoChipTxt: { fontSize: 12, fontWeight: '800' },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  tipoPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tipoPillTxt: { fontSize: 10.5, fontWeight: '800' },
  registrado: { fontSize: 11, marginTop: 3 },
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
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
  buscaInp: { flex: 1, fontSize: 14, padding: 0 },
  filtroScroll: { marginBottom: 10 },
  filtroRow: { flexDirection: 'row', gap: 7, paddingRight: 8 },
  filtroChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  filtroChipOn: { backgroundColor: TEAL, borderColor: TEAL },
  filtroChipTxt: { fontSize: 12.5, fontWeight: '700' },
  filtroChipTxtOn: { color: '#fff' },
  vacio: { fontSize: 13.5, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginTop: 30 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 17, fontWeight: '800', color: TEAL },
  nombre: { fontSize: 15, fontWeight: '800' },
  zonaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  zona: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  tel: { fontSize: 12, marginTop: 2 },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 18, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL, borderRadius: 26, paddingHorizontal: 18, paddingVertical: 13, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#88888855', alignSelf: 'center', marginBottom: 12 },
  mTit: { fontSize: 19, fontWeight: '900', marginBottom: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  inp: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  guardarBtn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  guardarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelar: { alignItems: 'center', paddingVertical: 12 },
  cancelarTxt: { fontSize: 14, fontWeight: '700' },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zonaChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  zonaChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  estadoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
})
