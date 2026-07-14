import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput, Platform, Alert, Modal, Linking,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../lib/ThemeContext'
import { ThumbImage } from '../../components/ThumbImage'
import { normalizar } from '../../lib/texto'
import { zonaDetallada } from '../../lib/zonas-interes'
import { usePullRefresh } from '../../hooks/usePullRefresh'

type Modelo = {
  id: string
  codigo: string | null
  titulo: string
  precio: number | null
  nombre_constructora: string | null
  zona: string | null
  direccion: string | null
  exclusiva: boolean | null
  inmobiliarias: { exclusiva: boolean } | null
  propiedad_imagenes: { url: string; orden: number }[]
}

type ModeloZona = Modelo & { zonaDet: string; ciudad: string }

const CIUDAD_LABELS: Record<string, string> = {
  queretaro: 'Querétaro', monterrey: 'Monterrey', puebla: 'Puebla',
}
const SIN_ZONA = 'Otras zonas'

type Contacto = {
  id: string
  nombre: string
  coordinador_nombre: string | null
  telefono_contacto: string | null
  email: string | null
  cargo: string | null
  notas: string | null
}

const SIN_CONSTRUCTORA = 'Sin constructora'
const EMPTY_CONTACTO: Omit<Contacto, 'id'> = {
  nombre: '',
  coordinador_nombre: null,
  telefono_contacto: null,
  email: null,
  cargo: null,
  notas: null,
}

function formatPrecio(precio: number | null) {
  if (precio == null) return 'Precio a consultar'
  return `$${precio.toLocaleString('es-MX')} MXN`
}

function alerta(msg: string) {
  if (Platform.OS === 'web') window.alert(msg)
  else Alert.alert('Aviso', msg)
}

export default function AdminConstructoras() {
  const c = useColors()
  const params = useLocalSearchParams<{ vista?: string }>()
  const [vista, setVista] = useState<'catalogo' | 'contactos'>(params.vista === 'contactos' ? 'contactos' : 'catalogo')
  const [rol, setRol] = useState<string | null>(null)

  // ── Catálogo (igual al que ve el prospectador) ──────────────────────────
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const [busqueda, setBusqueda] = useState('')
  const [zonaSel, setZonaSel] = useState<string | null>(null)

  // ── Contactos (coordinadores de constructoras — solo admin) ──────────────
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [loadingContactos, setLoadingContactos] = useState(true)
  const [busquedaContactos, setBusquedaContactos] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Contacto | null>(null)
  const [form, setForm] = useState<Omit<Contacto, 'id'>>(EMPTY_CONTACTO)
  const [guardando, setGuardando] = useState(false)

  useFocusEffect(useCallback(() => {
    cargarRol()
    cargarCatalogo()
    cargarContactos()
  }, []))
  const { refreshControl } = usePullRefresh(async () => { await Promise.all([cargarCatalogo(), cargarContactos()]) })

  async function cargarRol() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    setRol(data?.role ?? null)
  }

  async function cargarCatalogo() {
    setLoadingCatalogo(true)
    const { data } = await supabase
      .from('propiedades')
      .select('id, codigo, titulo, precio, nombre_constructora, zona, direccion, exclusiva, inmobiliarias(exclusiva), propiedad_imagenes(url, orden)')
      .eq('es_constructora', true)
      .eq('es_inventario', false)
      .order('nombre_constructora', { ascending: true, nullsFirst: false })
      .order('precio', { ascending: true, nullsFirst: false })

    const lista = (data ?? []).map((p: any) => ({
      ...p,
      inmobiliarias: Array.isArray(p.inmobiliarias) ? p.inmobiliarias[0] ?? null : p.inmobiliarias,
    })) as Modelo[]

    setModelos(lista)
    setLoadingCatalogo(false)
  }

  async function cargarContactos() {
    setLoadingContactos(true)
    const { data } = await supabase.from('constructoras').select('*').order('nombre')
    setContactos(data ?? [])
    setLoadingContactos(false)
  }

  // Cada modelo con su fraccionamiento/colonia (derivado de dirección + título).
  const enriquecidos: ModeloZona[] = useMemo(() => modelos.map(m => ({
    ...m,
    zonaDet: zonaDetallada(`${m.direccion ?? ''} ${m.titulo ?? ''}`) ?? SIN_ZONA,
    ciudad: m.zona ? (CIUDAD_LABELS[m.zona] ?? m.zona) : '',
  })), [modelos])

  const zonasDisponibles = useMemo(() => {
    const cont = new Map<string, number>()
    for (const m of enriquecidos) cont.set(m.zonaDet, (cont.get(m.zonaDet) ?? 0) + 1)
    return Array.from(cont.entries())
      .sort((a, b) => {
        if (a[0] === SIN_ZONA) return 1
        if (b[0] === SIN_ZONA) return -1
        return b[1] - a[1]
      })
      .map(([nombre, n]) => ({ nombre, n }))
  }, [enriquecidos])

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return enriquecidos.filter(m => {
      if (zonaSel && m.zonaDet !== zonaSel) return false
      if (!q) return true
      return (
        normalizar(m.nombre_constructora ?? '').includes(q) ||
        normalizar(m.titulo ?? '').includes(q) ||
        normalizar(m.codigo ?? '').includes(q) ||
        normalizar(m.zonaDet).includes(q) ||
        normalizar(m.direccion ?? '').includes(q)
      )
    })
  }, [enriquecidos, busqueda, zonaSel])

  // Agrupar: fraccionamiento → constructora
  const zonaGrupos = useMemo(() => {
    const porZona = new Map<string, ModeloZona[]>()
    for (const m of filtrados) {
      if (!porZona.has(m.zonaDet)) porZona.set(m.zonaDet, [])
      porZona.get(m.zonaDet)!.push(m)
    }
    const orden = new Map(zonasDisponibles.map((z, i) => [z.nombre, i]))
    return Array.from(porZona.entries())
      .sort((a, b) => (orden.get(a[0]) ?? 999) - (orden.get(b[0]) ?? 999))
      .map(([zona, mods]) => {
        const ciudad = mods[0]?.ciudad ?? ''
        const constMap = new Map<string, ModeloZona[]>()
        for (const m of mods) {
          const nombre = m.nombre_constructora?.trim() || SIN_CONSTRUCTORA
          if (!constMap.has(nombre)) constMap.set(nombre, [])
          constMap.get(nombre)!.push(m)
        }
        const grupos = Array.from(constMap.entries())
          .map(([nombre, ms]) => ({ nombre, modelos: ms }))
          .sort((a, b) => b.modelos.length - a.modelos.length)
        return { zona, ciudad, total: mods.length, grupos }
      })
  }, [filtrados, zonasDisponibles])

  function abrirNuevoContacto() {
    setEditando(null)
    setForm(EMPTY_CONTACTO)
    setModal(true)
  }

  function abrirEditarContacto(item: Contacto) {
    setEditando(item)
    setForm({
      nombre: item.nombre,
      coordinador_nombre: item.coordinador_nombre,
      telefono_contacto: item.telefono_contacto,
      email: item.email,
      cargo: item.cargo,
      notas: item.notas,
    })
    setModal(true)
  }

  async function guardarContacto() {
    if (!form.nombre.trim()) { alerta('El nombre de la constructora es obligatorio'); return }
    setGuardando(true)
    try {
      const payload = {
        nombre:              form.nombre.trim(),
        coordinador_nombre:  form.coordinador_nombre?.trim() || null,
        telefono_contacto:   form.telefono_contacto?.trim() || null,
        email:               form.email?.trim() || null,
        cargo:               form.cargo?.trim() || null,
        notas:               form.notas?.trim() || null,
      }
      if (editando) {
        const { error } = await supabase.from('constructoras').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('constructoras').insert(payload)
        if (error) throw error
      }
      setModal(false)
      cargarContactos()
    } catch (e: any) {
      alerta('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarContacto(item: Contacto) {
    const confirmar = async () => {
      const { error } = await supabase.from('constructoras').delete().eq('id', item.id)
      if (error) alerta('Error: ' + error.message)
      else cargarContactos()
    }
    const msg = `¿Eliminar "${item.nombre}"? Las propiedades que la usan no se borran, solo deja de poder generarse el mensaje de WhatsApp para ella.`
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) confirmar()
    } else {
      Alert.alert('Eliminar', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmar },
      ])
    }
  }

  const esAdmin = rol === 'admin'

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.headerRow}>
        {esAdmin && (
          <TouchableOpacity
            style={[styles.toggleBtn, vista === 'contactos' && styles.toggleBtnActivo]}
            onPress={() => setVista(vista === 'catalogo' ? 'contactos' : 'catalogo')}
          >
            <Text style={[styles.toggleBtnTxt, vista === 'contactos' && styles.toggleBtnTxtActivo]}>
              {vista === 'catalogo' ? '📞 Ver contactos de constructoras' : '🏗️ Ver catálogo'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {vista === 'catalogo' || !esAdmin ? (
        <>
          <View style={styles.intro}>
            <Text style={[styles.introTitle, { color: c.text }]}>🏗️ Constructoras</Text>
            <Text style={[styles.introSub, { color: c.textMute }]}>Filtra por fraccionamiento o busca una constructora.</Text>
          </View>

          <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Buscar constructora, modelo o zona…"
              placeholderTextColor={c.textMute}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={[styles.clearBtn, { color: c.textMute }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {!loadingCatalogo && zonasDisponibles.length > 0 && (
            <View style={styles.chipsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.chip, { borderColor: c.border }, zonaSel === null && styles.chipActivo]}
                  onPress={() => setZonaSel(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipTxt, { color: zonaSel === null ? '#fff' : c.textSub }]}>
                    Todas ({enriquecidos.length})
                  </Text>
                </TouchableOpacity>
                {zonasDisponibles.map(z => {
                  const activo = zonaSel === z.nombre
                  return (
                    <TouchableOpacity
                      key={z.nombre}
                      style={[styles.chip, { borderColor: c.border }, activo && styles.chipActivo]}
                      onPress={() => setZonaSel(activo ? null : z.nombre)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipTxt, { color: activo ? '#fff' : c.textSub }]}>
                        {z.nombre} ({z.n})
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {loadingCatalogo ? (
            <ActivityIndicator size="large" color="#1a6470" style={{ marginTop: 40 }} />
          ) : zonaGrupos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 46, marginBottom: 10 }}>🏗️</Text>
              <Text style={[styles.emptyText, { color: c.textMute }]}>
                {busqueda || zonaSel ? 'Sin resultados para ese filtro.' : 'No hay propiedades de constructora aún.'}
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
              {zonaGrupos.map(zg => (
                <View key={zg.zona}>
                  <View style={[styles.zonaSectionHeader, { borderBottomColor: c.border }]}>
                    <Text style={[styles.zonaSectionTitle, { color: c.text }]}>📍 {zg.zona}</Text>
                    <Text style={[styles.zonaSectionMeta, { color: c.textMute }]}>
                      {zg.ciudad ? `${zg.ciudad} · ` : ''}{zg.total} {zg.total === 1 ? 'modelo' : 'modelos'}
                    </Text>
                  </View>
                  {zg.grupos.map((g) => {
                    const aKey = `${zg.zona}_${g.nombre}`
                    const abierta = abiertas[aKey] ?? false
                    return (
                      <View key={aKey} style={styles.grupo}>
                        <TouchableOpacity
                          style={[styles.grupoHeader, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => setAbiertas((s) => ({ ...s, [aKey]: !abierta }))}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.grupoTitulo, { color: c.text }]}>{abierta ? '▼' : '▶'}  {g.nombre}</Text>
                          <Text style={styles.grupoMeta}>{g.modelos.length} {g.modelos.length === 1 ? 'modelo' : 'modelos'}</Text>
                        </TouchableOpacity>

                        {abierta && g.modelos.map((m) => {
                          const img = [...(m.propiedad_imagenes ?? [])].sort((a, b) => a.orden - b.orden)[0]
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[styles.modeloCard, { backgroundColor: c.card, borderColor: c.border }]}
                              onPress={() => router.push({ pathname: '/(admin)/editar-propiedad', params: { id: m.id } })}
                              activeOpacity={0.85}
                            >
                              {img?.url ? (
                                <ThumbImage url={img.url} opts={{ width: 200, quality: 60 }} style={styles.modeloImg} />
                              ) : (
                                <View style={[styles.modeloImg, styles.modeloImgPh]}><Text style={{ fontSize: 24 }}>🏠</Text></View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.modeloTitulo, { color: c.text }]} numberOfLines={2}>{m.titulo}</Text>
                                <Text style={styles.modeloPrecio}>{formatPrecio(m.precio)}</Text>
                                {m.codigo ? <Text style={styles.modeloCodigo}>{m.codigo}</Text> : null}
                              </View>
                              <Text style={styles.modeloChevron}>›</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          {/* Barra superior: búsqueda + botón nuevo */}
          <View style={styles.contactosTopRow}>
            <View style={[styles.searchBox, { flex: 1, backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="Buscar constructora o coordinador…"
                placeholderTextColor={c.textMute}
                value={busquedaContactos}
                onChangeText={setBusquedaContactos}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {busquedaContactos.length > 0 && (
                <TouchableOpacity onPress={() => setBusquedaContactos('')}>
                  <Text style={[styles.clearBtn, { color: c.textMute }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.btnNuevoCircle} onPress={abrirNuevoContacto}>
              <Text style={styles.btnNuevoCircleTxt}>+</Text>
            </TouchableOpacity>
          </View>

          {loadingContactos ? (
            <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 40 }} />
          ) : (() => {
            const q = normalizar(busquedaContactos.trim())
            const filtrados = contactos.filter(item =>
              !q ||
              normalizar(item.nombre).includes(q) ||
              normalizar(item.coordinador_nombre ?? '').includes(q) ||
              normalizar(item.cargo ?? '').includes(q) ||
              normalizar(item.email ?? '').includes(q)
            )
            if (contactos.length === 0) return (
              <View style={styles.empty}>
                <Text style={{ fontSize: 46, marginBottom: 10 }}>📋</Text>
                <Text style={[styles.emptyText, { color: c.textMute }]}>No hay contactos registrados aún.</Text>
                <TouchableOpacity style={styles.btnAdd} onPress={abrirNuevoContacto}>
                  <Text style={styles.btnAddText}>+ Agregar primero</Text>
                </TouchableOpacity>
              </View>
            )
            if (filtrados.length === 0) return (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: c.textMute }]}>Sin resultados para "{busquedaContactos}".</Text>
              </View>
            )
            return (
              <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: 12 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
                <Text style={[styles.contactosCount, { color: c.textMute }]}>
                  {filtrados.length} {filtrados.length === 1 ? 'constructora' : 'constructoras'}
                </Text>
                {filtrados.map(item => (
                  <View key={item.id} style={[styles.contactoCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    {/* Encabezado: empresa + acciones */}
                    <View style={styles.contactoHeaderRow}>
                      <View style={[styles.contactoIconBig, { backgroundColor: '#e8f4f0' }]}>
                        <Text style={{ fontSize: 24 }}>🏗️</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.contactoEmpresa, { color: c.text }]}>{item.nombre}</Text>
                        {item.cargo ? (
                          <Text style={[styles.contactoCargo, { color: '#1a6470' }]}>{item.cargo}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <TouchableOpacity style={styles.contactoAccionBtn} onPress={() => abrirEditarContacto(item)}>
                          <Text style={styles.contactoAccionIco}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.contactoAccionBtn} onPress={() => eliminarContacto(item)}>
                          <Text style={styles.contactoAccionIco}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Datos del coordinador */}
                    {item.coordinador_nombre ? (
                      <View style={styles.contactoRow}>
                        <Text style={styles.contactoRowIco}>👤</Text>
                        <Text style={[styles.contactoRowTxt, { color: c.text }]}>{item.coordinador_nombre}</Text>
                      </View>
                    ) : null}

                    {/* Teléfono + botón WhatsApp */}
                    {item.telefono_contacto ? (
                      <View style={styles.contactoRow}>
                        <Text style={styles.contactoRowIco}>📞</Text>
                        <Text style={[styles.contactoRowTxt, { color: c.text, flex: 1 }]}>{item.telefono_contacto}</Text>
                        <TouchableOpacity
                          style={styles.contactoWaBtn}
                          onPress={() => {
                            const tel = item.telefono_contacto!.replace(/\D/g, '')
                            const nombre = item.coordinador_nombre ? ` con ${item.coordinador_nombre}` : ''
                            const txt = encodeURIComponent(`Hola${nombre}, soy de Valera. Me gustaría agendar una cita para presentar a un prospecto interesado en ${item.nombre}.`)
                            Linking.openURL(`https://wa.me/52${tel}?text=${txt}`)
                          }}
                        >
                          <Text style={styles.contactoWaTxt}>WhatsApp</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.contactoRow}>
                        <Text style={styles.contactoRowIco}>📞</Text>
                        <Text style={styles.contactoFalta}>Sin teléfono de contacto</Text>
                      </View>
                    )}

                    {/* Email */}
                    {item.email ? (
                      <TouchableOpacity
                        style={styles.contactoRow}
                        onPress={() => Linking.openURL(`mailto:${item.email}`)}
                      >
                        <Text style={styles.contactoRowIco}>✉️</Text>
                        <Text style={[styles.contactoRowTxt, { color: '#1a6470', textDecorationLine: 'underline' }]}>{item.email}</Text>
                      </TouchableOpacity>
                    ) : null}

                    {/* Notas */}
                    {item.notas ? (
                      <View style={[styles.contactoNotas, { backgroundColor: c.bg }]}>
                        <Text style={[styles.contactoNotasTxt, { color: c.textMute }]}>{item.notas}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )
          })()}
        </>
      )}

      {/* Modal agregar/editar contacto */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
            keyboardShouldPersistTaps="always"
          >
            <View style={[styles.modalBox, { backgroundColor: c.card }]}>
              <Text style={[styles.modalTitulo, { color: c.text }]}>
                {editando ? 'Editar constructora' : 'Nueva constructora'}
              </Text>

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Nombre de la constructora *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.nombre}
                onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
                placeholder="Ej. Spacio Vitale"
                placeholderTextColor={c.placeholder}
                autoCapitalize="words"
              />

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Nombre del coordinador</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.coordinador_nombre ?? ''}
                onChangeText={v => setForm(f => ({ ...f, coordinador_nombre: v }))}
                placeholder="Ej. Ana García"
                placeholderTextColor={c.placeholder}
                autoCapitalize="words"
              />

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Cargo</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.cargo ?? ''}
                onChangeText={v => setForm(f => ({ ...f, cargo: v }))}
                placeholder="Ej. Coordinadora de ventas"
                placeholderTextColor={c.placeholder}
                autoCapitalize="sentences"
              />

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Teléfono (WhatsApp)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.telefono_contacto ?? ''}
                onChangeText={v => setForm(f => ({ ...f, telefono_contacto: v }))}
                placeholder="Ej. 4421234567"
                placeholderTextColor={c.placeholder}
                keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.email ?? ''}
                onChangeText={v => setForm(f => ({ ...f, email: v }))}
                placeholder="Ej. coordinacion@constructora.com"
                placeholderTextColor={c.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={[styles.fieldLabel, { color: c.textSub }]}>Notas</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline, { backgroundColor: c.input, borderColor: c.inputBorder, color: c.inputText }]}
                value={form.notas ?? ''}
                onChangeText={v => setForm(f => ({ ...f, notas: v }))}
                placeholder="Horario de atención, observaciones, etc."
                placeholderTextColor={c.placeholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.btnGuardar, guardando && { opacity: 0.5 }]}
                onPress={guardarContacto}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.btnGuardarText}>Guardar</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModal(false)}>
                <Text style={[styles.btnCancelarText, { color: c.textSub }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  toggleBtn: { backgroundColor: '#eef2f2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  toggleBtnActivo: { backgroundColor: '#1a6470' },
  toggleBtnTxt: { fontSize: 12, fontWeight: '700', color: '#1a6470' },
  toggleBtnTxtActivo: { color: '#fff' },

  intro: { marginBottom: 12 },
  introTitle: { fontSize: 22, fontWeight: '900' },
  introSub: { fontSize: 12, marginTop: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20, gap: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  btnAdd: { backgroundColor: '#c9a84c', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  btnAddText: { color: '#000', fontWeight: '700' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 42, marginBottom: 10,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14 },
  clearBtn: { fontSize: 16, paddingHorizontal: 4 },

  chipsWrap: { marginBottom: 10 },
  chipsRow: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipActivo: { backgroundColor: '#1a6470', borderColor: '#1a6470' },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },

  zonaSectionHeader: {
    paddingVertical: 8, marginTop: 6, marginBottom: 4, borderBottomWidth: 1,
  },
  zonaSectionTitle: { fontSize: 15, fontWeight: '900' },
  zonaSectionMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  grupo: { marginBottom: 14 },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  grupoTitulo: { fontSize: 15, fontWeight: '800' },
  grupoMeta: { fontSize: 12, fontWeight: '700', color: '#1a6470' },

  modeloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8,
  },
  modeloImg: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#e8f0f0' },
  modeloImgPh: { alignItems: 'center', justifyContent: 'center' },
  modeloTitulo: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  modeloPrecio: { fontSize: 14, fontWeight: '800', color: '#1a6470' },
  modeloCodigo: { fontSize: 11, color: '#aaa', marginTop: 2, fontWeight: '600' },
  modeloChevron: { fontSize: 26, color: '#c9a84c', fontWeight: '700' },

  contactosTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  contactosCount: { fontSize: 12, fontWeight: '600', marginBottom: 4, paddingLeft: 2 },

  btnNuevoCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  btnNuevoCircleTxt: { color: '#000', fontSize: 26, fontWeight: '700', lineHeight: 30 },

  contactoCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, gap: 10,
  },
  contactoHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactoIconBig: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  contactoEmpresa: { fontSize: 16, fontWeight: '800' },
  contactoCargo: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  contactoAccionBtn: { padding: 6 },
  contactoAccionIco: { fontSize: 18 },

  contactoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactoRowIco: { fontSize: 16, flexShrink: 0 },
  contactoRowTxt: { fontSize: 14, flex: 1 },

  contactoWaBtn: {
    backgroundColor: '#25D366', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 5, flexShrink: 0,
  },
  contactoWaTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  contactoNotas: { borderRadius: 8, padding: 10 },
  contactoNotasTxt: { fontSize: 13, lineHeight: 19 },

  contactoFalta: { fontSize: 12, color: '#c0392b', fontWeight: '600' },

  inputMultiline: { minHeight: 80 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 4 },
  modalTitulo: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderRadius: 8, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 10 },
  btnGuardar: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 15 },
  btnCancelar: { paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { fontSize: 14 },
})
