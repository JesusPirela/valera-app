import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { CAMPOS_FORM } from '../../lib/formulario-campos'
import { thumb } from '../../lib/img'
import { formatPrecioLang, tipoLabel } from '../../lib/ficha-i18n'

const TEAL = '#1a6470'
const TEAL_D = '#123c44'

type Form = { id: string; tipo: string; ref: string; titulo: string | null; campos: string[]; activo: boolean }

type Prop = {
  id: string; codigo: string; titulo: string; precio: number | null; direccion: string
  operacion: string | null; tipo: string | null; recamaras: number | null; banos: number | null
  medios_banos: number | null; m2: number | null; m2_terreno: number | null
  estacionamientos: number | null; descripcion: string | null
  propiedad_imagenes: { url: string; orden: number }[]
}
type ColItem = {
  propiedad_id: string; codigo: string; titulo: string; precio: number | null; direccion: string
  operacion: string | null; tipo: string | null; recamaras: number | null; banos: number | null
  m2: number | null; imagen: string | null
}
type Col = { titulo: string | null; mensaje: string | null; items: ColItem[] }

export default function FormularioCaptura() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { width } = useWindowDimensions()
  const imgW = Math.min(width, 640)
  const cardW = Math.min(width - 32, 600)

  const [form, setForm] = useState<Form | null>(null)
  const [prop, setProp] = useState<Prop | null>(null)
  const [col, setCol] = useState<Col | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgIdx, setImgIdx] = useState(0)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef<ScrollView>(null)
  const carRef = useRef<ScrollView>(null)
  const formY = useRef(0)

  const cargar = useCallback(async () => {
    if (!token) return
    const { data } = await supabase.from('formularios_captura')
      .select('id, tipo, ref, titulo, campos, activo').eq('id', token).maybeSingle()
    const f = (data as Form) ?? null
    setForm(f)
    if (f?.activo) {
      try {
        if (f.tipo === 'ficha') {
          const { data: p } = await supabase.from('propiedades')
            .select('id, codigo, titulo, precio, direccion, operacion, tipo, recamaras, banos, medios_banos, m2, m2_terreno, estacionamientos, descripcion, propiedad_imagenes(url, orden)')
            .eq('codigo', f.ref).maybeSingle()
          if (p) setProp({ ...p, propiedad_imagenes: [...(p.propiedad_imagenes ?? [])].sort((a: any, b: any) => a.orden - b.orden) } as Prop)
        } else if (f.tipo === 'coleccion') {
          const { data: c } = await supabase.rpc('coleccion_publica', { p_token: f.ref })
          if (c) setCol(c as Col)
        }
      } catch { /* el preview es opcional; el formulario sigue */ }
    }
    setLoading(false)
  }, [token])
  useEffect(() => { cargar() }, [cargar])

  const camposMostrar = CAMPOS_FORM.filter(c => c.fijo || (form?.campos ?? []).includes(c.key))

  function irAlFormulario() {
    scrollRef.current?.scrollTo({ y: Math.max(0, formY.current - 12), animated: true })
  }
  function onScrollImg(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setImgIdx(Math.round(e.nativeEvent.contentOffset.x / imgW))
  }
  function irAImagen(idx: number) {
    const total = prop?.propiedad_imagenes.length ?? 0
    const next = Math.max(0, Math.min(total - 1, idx))
    setImgIdx(next)
    carRef.current?.scrollTo({ x: next * imgW, animated: true })
  }

  async function enviar() {
    setError('')
    if (!(valores.nombre ?? '').trim() || !(valores.telefono ?? '').trim()) {
      setError('Por favor llena tu nombre y teléfono.'); return
    }
    setEnviando(true)
    try {
      const { data, error: e } = await supabase.functions.invoke('registrar-lead-formulario', { body: { token, respuestas: valores } })
      if (e) { setError('No se pudo enviar. Intenta de nuevo.'); return }
      if ((data as any)?.ok === false) { setError((data as any).error ?? 'No se pudo enviar.'); return }
      setEnviado(true)
    } catch {
      setError('No se pudo enviar. Revisa tu conexión.')
    } finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={TEAL} /></View>
  if (!form || !form.activo) return (
    <View style={s.center}>
      <Text style={{ fontSize: 42 }}>🔗</Text>
      <Text style={s.msg}>Este enlace ya no está disponible.</Text>
      <Text style={s.msgSub}>Pídele uno nuevo a tu asesor de Valera Real Estate.</Text>
    </View>
  )

  if (enviado) return (
    <View style={s.center}>
      <View style={s.okCircle}><Text style={{ fontSize: 44 }}>✓</Text></View>
      <Text style={s.graciasTit}>¡Gracias por registrarte!</Text>
      <Text style={s.gracias}>Un asesor de Valera Real Estate te contactará muy pronto para atenderte.</Text>
    </View>
  )

  const imagenes = prop?.propiedad_imagenes ?? []

  const chips: { icon: string; val: string }[] = []
  if (prop) {
    if (prop.recamaras != null) chips.push({ icon: '🛏️', val: `${prop.recamaras} rec.` })
    if (prop.banos != null) chips.push({ icon: '🚿', val: `${prop.banos}${prop.medios_banos ? ` + ${prop.medios_banos}½` : ''} baños` })
    if (prop.m2 != null) chips.push({ icon: '📐', val: `${prop.m2} m²` })
    if (prop.m2_terreno != null) chips.push({ icon: '🌳', val: `${prop.m2_terreno} m² terreno` })
    if (prop.estacionamientos != null) chips.push({ icon: '🚗', val: `${prop.estacionamientos} autos` })
  }

  const tieneCTA = !!prop || !!col

  return (
    <View style={s.root}>
      <ScrollView ref={scrollRef} style={s.page} contentContainerStyle={{ paddingBottom: tieneCTA ? 96 : 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Marca */}
        <View style={s.brandBar}>
          <Text style={s.brand}>VALERA REAL ESTATE</Text>
        </View>

        {/* ── Preview: PROPIEDAD ── */}
        {prop && (
          <View style={{ alignItems: 'center' }}>
            {imagenes.length > 0 ? (
              <View style={[s.carousel, { width: imgW }]}>
                <ScrollView ref={carRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollImg} scrollEventThrottle={16} style={{ width: imgW }}>
                  {imagenes.map((img, i) => (
                    <Image key={i} source={{ uri: thumb(img.url, { width: Math.round(imgW * 2), quality: 72 }) ?? img.url }}
                      style={{ width: imgW, height: imgW * 0.66 }} contentFit="cover" cachePolicy="memory-disk" priority={i === 0 ? 'high' : 'normal'} transition={120} />
                  ))}
                </ScrollView>
                {imagenes.length > 1 && imgIdx > 0 && (
                  <TouchableOpacity style={[s.arrow, { left: 10 }]} onPress={() => irAImagen(imgIdx - 1)} activeOpacity={0.8}><Text style={s.arrowTxt}>‹</Text></TouchableOpacity>
                )}
                {imagenes.length > 1 && imgIdx < imagenes.length - 1 && (
                  <TouchableOpacity style={[s.arrow, { right: 10 }]} onPress={() => irAImagen(imgIdx + 1)} activeOpacity={0.8}><Text style={s.arrowTxt}>›</Text></TouchableOpacity>
                )}
                {imagenes.length > 1 && (
                  <View style={s.counter}><Text style={s.counterTxt}>{imgIdx + 1} / {imagenes.length}</Text></View>
                )}
              </View>
            ) : (
              <View style={[s.noImg, { width: imgW, height: imgW * 0.5 }]}><Text style={{ fontSize: 46 }}>🏠</Text></View>
            )}

            <View style={[s.propBody, { width: cardW }]}>
              <View style={s.badgeRow}>
                <View style={s.badge}><Text style={s.badgeTxt}>{prop.codigo}</Text></View>
                {prop.tipo ? <View style={s.badgeOut}><Text style={s.badgeOutTxt}>{tipoLabel(prop.tipo, 'es')} {prop.operacion === 'renta' ? 'en renta' : 'en venta'}</Text></View> : null}
              </View>
              <Text style={s.propTitulo}>{prop.titulo}</Text>
              <Text style={s.propDir}>📍 {prop.direccion}</Text>
              <View style={s.precioBox}>
                <Text style={s.precioLbl}>PRECIO</Text>
                <Text style={s.precioVal}>{formatPrecioLang(prop.precio, 'es')}</Text>
              </View>
              {chips.length > 0 && (
                <View style={s.chipsWrap}>
                  {chips.map((c, i) => (
                    <View key={i} style={s.chipP}><Text style={{ fontSize: 13 }}>{c.icon}</Text><Text style={s.chipPTxt}>{c.val}</Text></View>
                  ))}
                </View>
              )}
              {prop.descripcion ? (
                <View style={s.descBox}>
                  <Text style={s.descTitle}>Descripción</Text>
                  <Text style={s.descTxt}>{prop.descripcion}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Preview: COLECCIÓN ── */}
        {col && (
          <View style={{ alignItems: 'center' }}>
            <View style={[s.propBody, { width: cardW, paddingTop: 4 }]}>
              <Text style={s.colTitulo}>{col.titulo || 'Propiedades seleccionadas para ti'}</Text>
              {col.mensaje ? <Text style={s.colMsg}>{col.mensaje}</Text> : null}
              <Text style={s.colHint}>{(col.items ?? []).length} propiedades elegidas para ti 👇</Text>
            </View>
            <View style={{ width: cardW, gap: 14 }}>
              {(col.items ?? []).map(it => (
                <View key={it.propiedad_id} style={s.colCard}>
                  {it.imagen ? (
                    <Image source={{ uri: thumb(it.imagen, { width: Math.round(cardW * 2), quality: 72 }) ?? it.imagen }} style={s.colImg} contentFit="cover" transition={150} />
                  ) : <View style={[s.colImg, s.colImgPh]}><Text style={{ color: '#9aa5ab' }}>Sin foto</Text></View>}
                  <View style={{ padding: 12 }}>
                    <View style={s.badgeRow}>
                      <View style={s.badge}><Text style={s.badgeTxt}>{it.codigo}</Text></View>
                    </View>
                    <Text style={s.colCardTit} numberOfLines={2}>{it.titulo}</Text>
                    <Text style={s.colCardPrecio}>{formatPrecioLang(it.precio, 'es')}</Text>
                    <View style={s.colCardMeta}>
                      {it.recamaras != null ? <Text style={s.colCardMetaTxt}>🛏️ {it.recamaras}</Text> : null}
                      {it.banos != null ? <Text style={s.colCardMetaTxt}>🚿 {it.banos}</Text> : null}
                      {it.m2 != null ? <Text style={s.colCardMetaTxt}>📐 {it.m2} m²</Text> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Formulario ── */}
        <View style={{ alignItems: 'center' }} onLayout={e => { formY.current = e.nativeEvent.layout.y }}>
          <View style={[s.formCard, { width: cardW }]}>
            <Text style={s.formKicker}>{tieneCTA ? '¿TE INTERESA?' : 'DÉJANOS TUS DATOS'}</Text>
            <Text style={s.formTitulo}>{form.titulo || 'Déjanos tus datos'}</Text>
            <Text style={s.formSub}>Completa el formulario y un asesor te contactará para atenderte personalmente.</Text>

            {camposMostrar.map(campo => (
              <View key={campo.key} style={{ marginBottom: 14 }}>
                <Text style={s.label}>{campo.label}{campo.fijo ? ' *' : ''}</Text>
                {campo.tipo === 'opciones' ? (
                  <View style={s.chips}>
                    {(campo.opciones ?? []).map(op => {
                      const activo = valores[campo.key] === op.valor
                      return (
                        <TouchableOpacity key={op.valor} style={[s.chip, activo && s.chipOn]} onPress={() => setValores(v => ({ ...v, [campo.key]: op.valor }))}>
                          <Text style={[s.chipTxt, activo && s.chipTxtOn]}>{op.etiqueta}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={[s.input, campo.key === 'notas' && { height: 90, textAlignVertical: 'top' }]}
                    value={valores[campo.key] ?? ''}
                    onChangeText={t => setValores(v => ({ ...v, [campo.key]: t }))}
                    placeholder={campo.tipo === 'email' ? 'tu@correo.com' : campo.tipo === 'telefono' ? '10 dígitos' : ''}
                    placeholderTextColor="#9aa8b3"
                    keyboardType={campo.tipo === 'telefono' ? 'phone-pad' : campo.tipo === 'email' ? 'email-address' : 'default'}
                    autoCapitalize={campo.tipo === 'email' ? 'none' : 'sentences'}
                    multiline={campo.key === 'notas'}
                  />
                )}
              </View>
            ))}

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity style={[s.btn, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando} activeOpacity={0.85}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Enviar mis datos</Text>}
            </TouchableOpacity>
            <Text style={s.aviso}>🔒 Tus datos se comparten solo con tu asesor de Valera Real Estate.</Text>
          </View>
        </View>
      </ScrollView>

      {/* CTA sticky: baja al formulario (solo si hay preview arriba) */}
      {tieneCTA && (
        <View style={s.ctaBar}>
          <TouchableOpacity style={s.ctaBtn} onPress={irAlFormulario} activeOpacity={0.9}>
            <Text style={s.ctaTxt}>💬  Me interesa</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f4' },
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#eef2f4', gap: 8 },
  msg: { fontSize: 16, color: '#334', fontWeight: '800', textAlign: 'center', marginTop: 8 },
  msgSub: { fontSize: 13.5, color: '#5f7690', textAlign: 'center' },

  brandBar: { alignItems: 'center', paddingTop: Platform.OS === 'web' ? 14 : 44, paddingBottom: 10, backgroundColor: TEAL_D },
  brand: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2 },

  // Carrusel propiedad
  carousel: { backgroundColor: '#1e3448', alignSelf: 'center' },
  arrow: { position: 'absolute', top: '50%' as any, marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  arrowTxt: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 36, marginTop: -2 },
  counter: { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  counterTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  noImg: { backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },

  propBody: { alignSelf: 'center', paddingHorizontal: 4, paddingTop: 16 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  badge: { backgroundColor: TEAL, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  badgeOut: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#cbd5e1' },
  badgeOutTxt: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  propTitulo: { fontSize: 21, fontWeight: '900', color: '#1e293b', lineHeight: 27, marginBottom: 6 },
  propDir: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  precioBox: { backgroundColor: TEAL + '15', borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: TEAL },
  precioLbl: { fontSize: 11, color: TEAL, fontWeight: '700', marginBottom: 2 },
  precioVal: { fontSize: 23, fontWeight: '900', color: TEAL },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chipP: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  chipPTxt: { fontSize: 13, color: '#334155', fontWeight: '600' },
  descBox: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  descTitle: { fontSize: 13, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  descTxt: { fontSize: 14, color: '#475569', lineHeight: 22 },

  // Colección
  colTitulo: { fontSize: 22, fontWeight: '900', color: '#1e293b', lineHeight: 28 },
  colMsg: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 21 },
  colHint: { fontSize: 13, color: TEAL, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  colCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', ...Platform.select({ web: { boxShadow: '0 2px 10px rgba(0,0,0,0.06)' } as any, default: { elevation: 2 } }) },
  colImg: { width: '100%', height: 190, backgroundColor: '#dfe6ea' },
  colImgPh: { alignItems: 'center', justifyContent: 'center' },
  colCardTit: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  colCardPrecio: { fontSize: 18, fontWeight: '900', color: TEAL, marginBottom: 8 },
  colCardMeta: { flexDirection: 'row', gap: 14 },
  colCardMetaTxt: { fontSize: 13, color: '#64748b', fontWeight: '600' },

  // Formulario
  formCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginTop: 22, borderWidth: 1, borderColor: '#e2e8f0', ...Platform.select({ web: { boxShadow: '0 4px 20px rgba(18,60,68,0.08)' } as any, default: { elevation: 3 } }) },
  formKicker: { color: TEAL, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  formTitulo: { color: '#123', fontSize: 21, fontWeight: '900', marginTop: 4 },
  formSub: { color: '#5f7690', fontSize: 13.5, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  label: { color: '#334', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  input: { backgroundColor: '#f8fafb', borderWidth: 1, borderColor: '#d5dee3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#123' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: '#f1f5f7', borderWidth: 1, borderColor: '#d5dee3', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipTxt: { color: '#334', fontSize: 14, fontWeight: '700' },
  chipTxtOn: { color: '#fff' },
  error: { color: '#c0392b', fontSize: 13, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  btn: { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  aviso: { color: '#8fa0ab', fontSize: 11.5, textAlign: 'center', marginTop: 12 },

  // CTA sticky
  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  ctaBtn: { backgroundColor: TEAL, borderRadius: 14, paddingVertical: 15, alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center', ...Platform.select({ web: { boxShadow: '0 4px 14px rgba(26,100,112,0.4)' } as any, default: { elevation: 5 } }) },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },

  // Éxito
  okCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#e6f7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  graciasTit: { fontSize: 22, fontWeight: '900', color: '#123', marginTop: 8 },
  gracias: { fontSize: 14.5, color: '#5f7690', marginTop: 8, textAlign: 'center', lineHeight: 21, maxWidth: 340 },
})
