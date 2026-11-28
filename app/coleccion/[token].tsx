import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform, Linking, useWindowDimensions, TextInput, Alert,
} from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { thumb } from '../../lib/img'
import { formatPrecioLang, tipoLabel } from '../../lib/ficha-i18n'

const TEAL = '#1a6470'
const MORADO = '#5e35b1'

type Item = {
  propiedad_id: string
  codigo: string
  titulo: string
  precio: number | null
  direccion: string
  operacion: string | null
  tipo: string | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  m2: number | null
  m2_terreno: number | null
  estacionamientos: number | null
  imagen: string | null
  favorito: boolean
}
type Coleccion = {
  titulo: string | null
  mensaje: string | null
  cliente_nombre: string | null
  es_invitacion: boolean
  agente: { nombre: string | null; telefono: string | null } | null
  items: Item[]
}

export default function ColeccionPublica() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const [col, setCol] = useState<Coleccion | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [favs, setFavs] = useState<Record<string, boolean>>({})
  const { width } = useWindowDimensions()
  const cardW = Math.min(width - 32, 560)

  // Formulario "Quiero probarlo" — solo para el link de invitación.
  const [formAbierto, setFormAbierto] = useState(false)
  const [fNombre, setFNombre] = useState('')
  const [fInmobiliaria, setFInmobiliaria] = useState('')
  const [fTelefono, setFTelefono] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => { if (token) cargar() }, [token])

  async function cargar() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('coleccion_publica', { p_token: token })
      if (error || !data) { setNotFound(true); return }
      const c = data as Coleccion
      setCol(c)
      const map: Record<string, boolean> = {}
      for (const it of c.items ?? []) map[it.propiedad_id] = it.favorito
      setFavs(map)
    } catch { setNotFound(true) } finally { setLoading(false) }
  }

  const toggleFav = useCallback(async (it: Item) => {
    const nuevo = !favs[it.propiedad_id]
    setFavs(f => ({ ...f, [it.propiedad_id]: nuevo }))   // optimista
    try {
      await supabase.rpc('coleccion_toggle_favorito', {
        p_token: token, p_propiedad_id: it.propiedad_id, p_favorito: nuevo,
      })
    } catch { setFavs(f => ({ ...f, [it.propiedad_id]: !nuevo })) }  // revertir
  }, [favs, token])

  function abrirFicha(it: Item) {
    supabase.rpc('coleccion_registrar_vista_item', {
      p_token: token, p_propiedad_id: it.propiedad_id,
    }).then(undefined, () => {})
    router.push(`/ficha/${it.codigo}`)
  }

  async function enviarSolicitud() {
    if (!fNombre.trim() || !fInmobiliaria.trim()) {
      const msg = 'Falta tu nombre o el de tu inmobiliaria.'
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Falta algo', msg)
      return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.rpc('solicitar_prueba_aliado', {
        p_token: token, p_nombre: fNombre.trim(), p_inmobiliaria: fInmobiliaria.trim(),
        p_telefono: fTelefono.trim() || null,
      })
      if (error) throw error
      setEnviado(true)
      setFormAbierto(false)
    } catch (e: any) {
      const msg = e?.message || 'No se pudo enviar. Intenta de nuevo.'
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg)
    } finally {
      setEnviando(false)
    }
  }

  function contactarAgente() {
    const tel = (col?.agente?.telefono ?? '').replace(/\D/g, '')
    if (!tel) return
    const num = tel.length === 10 ? `52${tel}` : tel
    const favCodigos = (col?.items ?? []).filter(i => favs[i.propiedad_id]).map(i => i.codigo)
    const msg = favCodigos.length
      ? `Hola${col?.agente?.nombre ? ' ' + col.agente.nombre : ''}, me interesan estas propiedades de la colección: ${favCodigos.join(', ')}`
      : `Hola${col?.agente?.nombre ? ' ' + col.agente.nombre : ''}, vi la colección que me enviaste y me gustaría más información.`
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
    if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url)
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={TEAL} /></View>
  }
  if (notFound || !col) {
    return (
      <View style={s.center}>
        <Text style={s.nfTitulo}>Colección no disponible</Text>
        <Text style={s.nfSub}>Es posible que el enlace haya cambiado. Pídele uno nuevo a tu asesor.</Text>
      </View>
    )
  }

  const numFav = (col.items ?? []).filter(i => favs[i.propiedad_id]).length

  return (
    <ScrollView style={s.page} contentContainerStyle={{ alignItems: 'center', paddingBottom: 120 }}>
      <View style={[s.wrap, { width: cardW }]}>
        <Text style={s.marca}>VALERA REAL ESTATE</Text>
        <Text style={s.titulo}>
          {col.es_invitacion ? 'Nuestro catálogo, en una sola app' : (col.titulo || 'Propiedades seleccionadas para ti')}
        </Text>
        {col.cliente_nombre ? <Text style={s.saludo}>Para {col.cliente_nombre}</Text> : null}
        {col.mensaje ? <Text style={s.mensaje}>{col.mensaje}</Text> : null}
        {col.es_invitacion ? (
          <Text style={s.mensaje}>
            Una muestra de lo que publicamos todos los días. Si quieres que tu inmobiliaria
            también publique y prospecte desde Valera App, pide tu cuenta de prueba.
          </Text>
        ) : null}
        <View style={s.hintBox}>
          <Text style={s.hintTxt}>♥  Toca el corazón para marcar tus favoritas</Text>
          <Text style={s.hintTxt}>👆  Toca una tarjeta para ver todos los detalles</Text>
        </View>

        {(col.items ?? []).map((it) => {
          const fav = !!favs[it.propiedad_id]
          return (
            <TouchableOpacity key={it.propiedad_id} style={s.card} activeOpacity={0.9} onPress={() => abrirFicha(it)}>
              <View style={s.imgWrap}>
                {it.imagen ? (
                  <Image
                    source={{ uri: thumb(it.imagen, { width: Math.round(cardW * 2), quality: 72 }) ?? it.imagen }}
                    style={s.img} contentFit="cover" transition={150}
                  />
                ) : <View style={[s.img, s.imgPlaceholder]}><Text style={{ color: '#9aa5ab' }}>Sin foto</Text></View>}
                <TouchableOpacity
                  style={[s.heart, fav && s.heartOn]}
                  onPress={(e) => { e.stopPropagation?.(); toggleFav(it) }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[s.heartTxt, fav && { color: '#fff' }]}>{fav ? '♥' : '♡'}</Text>
                </TouchableOpacity>
                {it.operacion ? (
                  <View style={s.opBadge}><Text style={s.opBadgeTxt}>
                    {it.operacion === 'renta' ? 'Renta' : 'Venta'}
                  </Text></View>
                ) : null}
              </View>
              <View style={s.cardBody}>
                <Text style={s.precio}>{formatPrecioLang(it.precio, 'es')}</Text>
                <Text style={s.cardTitulo} numberOfLines={2}>{it.titulo}</Text>
                <Text style={s.dir} numberOfLines={1}>{it.direccion}</Text>
                <View style={s.specs}>
                  {it.tipo ? <Text style={s.spec}>{tipoLabel(it.tipo, 'es')}</Text> : null}
                  {it.recamaras != null ? <Text style={s.spec}>🛏 {it.recamaras}</Text> : null}
                  {it.banos != null ? <Text style={s.spec}>🛁 {it.banos}{it.medios_banos ? `+${it.medios_banos}` : ''}</Text> : null}
                  {it.estacionamientos != null ? <Text style={s.spec}>🚗 {it.estacionamientos}</Text> : null}
                  {it.m2 != null ? <Text style={s.spec}>📐 {it.m2} m²</Text> : null}
                </View>
                <Text style={s.verFicha}>Ver ficha completa →</Text>
              </View>
            </TouchableOpacity>
          )
        })}

        <Text style={s.footer}>Valera Real Estate</Text>
      </View>

      {col.es_invitacion ? (
        enviado ? (
          <View style={[s.cta, { backgroundColor: TEAL }]}>
            <Text style={s.ctaTxt}>✓ Listo, te contactamos pronto</Text>
          </View>
        ) : formAbierto ? (
          <View style={[s.wrap, { width: cardW, marginTop: 0 }]}>
            <View style={s.formBox}>
              <Text style={s.formTitulo}>Cuéntanos de ti</Text>
              <TextInput style={s.formInput} value={fNombre} onChangeText={setFNombre}
                placeholder="Tu nombre *" placeholderTextColor="#9aa5ab" />
              <TextInput style={s.formInput} value={fInmobiliaria} onChangeText={setFInmobiliaria}
                placeholder="Tu inmobiliaria *" placeholderTextColor="#9aa5ab" />
              <TextInput style={s.formInput} value={fTelefono} onChangeText={setFTelefono}
                placeholder="Teléfono (opcional)" placeholderTextColor="#9aa5ab" keyboardType="phone-pad" />
              <TouchableOpacity
                style={[s.formBtn, enviando && { opacity: 0.6 }]}
                onPress={enviarSolicitud}
                disabled={enviando}
              >
                {enviando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.formBtnTxt}>Enviar</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFormAbierto(false)}>
                <Text style={s.formCancelar}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[s.cta, { backgroundColor: MORADO }]} onPress={() => setFormAbierto(true)} activeOpacity={0.9}>
            <Text style={s.ctaTxt}>Quiero probarlo</Text>
          </TouchableOpacity>
        )
      ) : col.agente?.telefono ? (
        <TouchableOpacity style={s.cta} onPress={contactarAgente} activeOpacity={0.9}>
          <Text style={s.ctaTxt}>
            {numFav > 0 ? `Contactar por mis ${numFav} favorita${numFav > 1 ? 's' : ''}` : 'Contactar al asesor'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f6f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f4f6f7' },
  wrap: { paddingTop: 24 },
  marca: { fontSize: 11, letterSpacing: 2, color: TEAL, fontWeight: '800', textAlign: 'center' },
  titulo: { fontSize: 22, fontWeight: '800', color: '#0f2b30', textAlign: 'center', marginTop: 6 },
  saludo: { fontSize: 15, color: '#0f2b30', textAlign: 'center', marginTop: 4, fontWeight: '600' },
  mensaje: { fontSize: 14, color: '#4a5b60', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  hintBox: { backgroundColor: '#e9f4f5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16, marginBottom: 4, gap: 6 },
  hintTxt: { fontSize: 13.5, color: '#215a64', fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginTop: 16,
    borderWidth: 1, borderColor: '#e6eaec',
    ...Platform.select({ web: { boxShadow: '0 2px 10px rgba(0,0,0,0.06)' } as any, default: { elevation: 2 } }),
  },
  imgWrap: { position: 'relative', width: '100%', aspectRatio: 4 / 3, backgroundColor: '#e9edef' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heart: {
    position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.2)' } as any, default: { elevation: 3 } }),
  },
  heartOn: { backgroundColor: '#e11d48' },
  heartTxt: { fontSize: 22, color: '#e11d48', lineHeight: 24 },
  opBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: TEAL, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  opBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardBody: { padding: 14 },
  precio: { fontSize: 20, fontWeight: '800', color: TEAL },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#17323a', marginTop: 4 },
  dir: { fontSize: 13, color: '#6a797e', marginTop: 3 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  spec: { fontSize: 13, color: '#4a5b60' },
  verFicha: { fontSize: 13, color: TEAL, fontWeight: '700', marginTop: 12 },
  footer: { textAlign: 'center', color: '#9aa5ab', fontSize: 12, marginTop: 28 },
  cta: {
    position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: '#25D366',
    paddingHorizontal: 26, paddingVertical: 14, borderRadius: 30,
    ...Platform.select({ web: { boxShadow: '0 4px 14px rgba(0,0,0,0.2)' } as any, default: { elevation: 5 } }),
  },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  nfTitulo: { fontSize: 18, fontWeight: '800', color: '#0f2b30' },
  nfSub: { fontSize: 14, color: '#6a797e', textAlign: 'center', marginTop: 8 },
  formBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: '#e6eaec', gap: 10,
  },
  formTitulo: { fontSize: 16, fontWeight: '800', color: '#0f2b30', marginBottom: 2 },
  formInput: {
    borderWidth: 1, borderColor: '#dfe5e7', borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: '#17323a',
  },
  formBtn: { backgroundColor: MORADO, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  formBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  formCancelar: { textAlign: 'center', color: '#9aa5ab', fontSize: 13, paddingVertical: 4 },
})
