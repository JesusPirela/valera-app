// La hoja de ruta abierta desde su link, sin entrar a la app.
//
// El asesor la abre en el teléfono el día del recorrido: ve a quién visita, en
// qué orden, a qué hora, cuáles están confirmadas y a quién llamarle. Lo mismo
// que el PDF, pero sin descargar nada y actualizándose si se corrige.
//
// No pide sesión —para eso es un link— así que la única protección es que el
// token no se adivina. El propio documento dice que es de uso interno: el link
// se manda al equipo, no al cliente.
import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Linking,
  TouchableOpacity, useWindowDimensions, Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { thumb } from '../../lib/img'
import { normalizarTelefono } from '../../lib/telefono'

const AZUL = '#0a2a5e'
const AZUL_MED = '#1e3a5f'
const ORO = '#FFD700'
const FONDO = '#f5f8fc'

type Parada = {
  hora: string; titulo: string; ubicacion: string; precio: string
  caracteristicas: string; mapaUrl: string; linkPropiedad: string
  asesorNombre: string; asesorTel: string; fotoUrl: string; confirmada: boolean
}
type Perfil = {
  nombre: string; telefono: string; correo: string; origen: string
  formaPago: string; presupuesto: string; busca: string
}
type Hoja = { fecha: string; perfil: Perfil; paradas: Parada[]; actualizada: string }

const hay = (v?: string | null) => !!(v && String(v).trim())

function abrir(url: string) {
  Linking.openURL(url).catch(() => {})
}

export default function HojaDeRutaPublica() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const [hoja, setHoja] = useState<Hoja | null>(null)
  const [cargando, setCargando] = useState(true)
  const { width } = useWindowDimensions()
  const ancho = Math.min(width, 720)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase.rpc('hoja_de_ruta_publica', { p_token: token })
      setHoja(error || !data ? null : (data as Hoja))
    } catch {
      setHoja(null)
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => { if (token) cargar() }, [token, cargar])

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={AZUL} size="large" /></View>
  }
  if (!hoja) {
    return (
      <View style={s.centro}>
        <Ionicons name="map-outline" size={40} color="#94a3b8" />
        <Text style={s.vacioTit}>No encontramos esta hoja de ruta</Text>
        <Text style={s.vacioSub}>El link puede estar incompleto o la hoja ya no existe.</Text>
      </View>
    )
  }

  const { perfil, paradas = [] } = hoja
  const confirmadas = paradas.filter(p => p.confirmada).length

  const dato = (etiqueta: string, valor: string, fuerte = false) => hay(valor) ? (
    <View style={s.fila}>
      <Text style={s.filaEtq}>{etiqueta}</Text>
      <Text style={[s.filaVal, fuerte && s.filaValFuerte]}>{valor}</Text>
    </View>
  ) : null

  return (
    <ScrollView style={{ backgroundColor: FONDO }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 48 }}>
      <View style={{ width: ancho }}>
        {/* Cabecera */}
        <View style={s.cab}>
          <Text style={s.sello}>VALERA REAL ESTATE · DOCUMENTO INTERNO</Text>
          <Text style={s.titulo}>Recorrido de propiedades</Text>
          <Text style={s.cliente}>{perfil?.nombre}</Text>
          <Text style={s.fecha}>{hoja.fecha}</Text>
          <View style={s.resumenChips}>
            <View style={s.chip}>
              <Text style={s.chipTxt}>{paradas.length} {paradas.length === 1 ? 'propiedad' : 'propiedades'}</Text>
            </View>
            <View style={[s.chip, s.chipOk]}>
              <Text style={[s.chipTxt, { color: '#15803d' }]}>{confirmadas} confirmadas</Text>
            </View>
            {paradas.length - confirmadas > 0 && (
              <View style={[s.chip, s.chipPend]}>
                <Text style={[s.chipTxt, { color: '#a16207' }]}>{paradas.length - confirmadas} por confirmar</Text>
              </View>
            )}
          </View>
        </View>

        {/* Perfil del cliente */}
        <View style={s.barra}><Text style={s.barraTxt}>PERFIL DEL CLIENTE</Text></View>
        <View style={s.caja}>
          {dato('Nombre', perfil?.nombre, true)}
          {hay(perfil?.telefono) && (
            <TouchableOpacity style={s.fila} onPress={() => abrir(`tel:${perfil.telefono}`)}>
              <Text style={s.filaEtq}>Teléfono</Text>
              <Text style={[s.filaVal, s.enlace]}>{perfil.telefono}</Text>
            </TouchableOpacity>
          )}
          {dato('Correo', perfil?.correo)}
          {dato('Origen', perfil?.origen)}
          {dato('Forma de pago', perfil?.formaPago)}
          {dato('Presupuesto máximo', perfil?.presupuesto, true)}
          {dato('Busca', perfil?.busca)}
        </View>

        {/* Las paradas */}
        {paradas.map((p, i) => {
          const tel = normalizarTelefono(p.asesorTel ?? '')
          return (
            <View key={i} style={s.parada}>
              <View style={[s.paradaCab, p.confirmada ? s.cabOk : s.cabPend]}>
                <View style={s.num}><Text style={s.numTxt}>{i + 1}</Text></View>
                <Text style={s.paradaHora}>{hay(p.hora) ? p.hora : `Propiedad ${i + 1}`}</Text>
                <View style={[s.estado, p.confirmada ? s.estadoOk : s.estadoPend]}>
                  <Ionicons
                    name={p.confirmada ? 'checkmark-circle' : 'ellipse-outline'}
                    size={13}
                    color={p.confirmada ? '#15803d' : '#a16207'}
                  />
                  <Text style={[s.estadoTxt, { color: p.confirmada ? '#15803d' : '#a16207' }]}>
                    {p.confirmada ? 'Confirmada' : 'Por confirmar'}
                  </Text>
                </View>
              </View>

              {hay(p.fotoUrl) && (
                <Image source={{ uri: thumb(p.fotoUrl, { width: 900, quality: 80 }) }}
                       style={[s.foto, { width: ancho - 24 }]} contentFit="cover" transition={150} />
              )}

              <View style={s.paradaCuerpo}>
                {hay(p.precio) && <Text style={s.precio}>{p.precio}</Text>}
                {hay(p.titulo) && <Text style={s.propTit}>{p.titulo}</Text>}
                {hay(p.ubicacion) && <Text style={s.propUbi}>{p.ubicacion}</Text>}
                {hay(p.caracteristicas) && (
                  <View style={s.cars}>
                    {p.caracteristicas.split('·').map(x => x.trim()).filter(Boolean).map((cRaw, k) => (
                      <View key={k} style={s.car}><Text style={s.carTxt}>{cRaw}</Text></View>
                    ))}
                  </View>
                )}

                <View style={s.acciones}>
                  {hay(p.mapaUrl) && (
                    <TouchableOpacity style={s.accion} onPress={() => abrir(p.mapaUrl)}>
                      <Ionicons name="navigate-outline" size={15} color={AZUL} />
                      <Text style={s.accionTxt}>Cómo llegar</Text>
                    </TouchableOpacity>
                  )}
                  {hay(p.linkPropiedad) && (
                    <TouchableOpacity style={s.accion} onPress={() => abrir(p.linkPropiedad)}>
                      <Ionicons name="open-outline" size={15} color={AZUL} />
                      <Text style={s.accionTxt}>Ver la propiedad</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {(hay(p.asesorNombre) || hay(p.asesorTel)) && (
                  <View style={s.asesor}>
                    <Text style={s.asesorLbl}>ASESOR A CARGO</Text>
                    {hay(p.asesorNombre) && <Text style={s.asesorNom}>{p.asesorNombre}</Text>}
                    {hay(p.asesorTel) && (
                      <TouchableOpacity
                        style={s.wa}
                        onPress={() => abrir(tel.length === 12 ? `https://wa.me/${tel}` : `tel:${p.asesorTel}`)}
                      >
                        <Ionicons name="logo-whatsapp" size={15} color="#25d366" />
                        <Text style={s.waTxt}>{p.asesorTel}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          )
        })}

        <Text style={s.pie}>
          Valera Real Estate · Documento interno de uso exclusivo del equipo{'\n'}
          No se comparte con el cliente ni con asesores externos
        </Text>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, backgroundColor: FONDO },
  vacioTit: { fontSize: 16, fontWeight: '800', color: AZUL, textAlign: 'center' },
  vacioSub: { fontSize: 13, color: '#64748b', textAlign: 'center' },

  cab: { backgroundColor: AZUL, padding: 22, alignItems: 'center' },
  sello: { fontSize: 9.5, letterSpacing: 1.6, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  titulo: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 8 },
  cliente: { fontSize: 23, fontWeight: '800', color: ORO, marginTop: 10, textAlign: 'center' },
  fecha: { fontSize: 13.5, color: 'rgba(255,255,255,0.8)', marginTop: 3, fontWeight: '600' },
  resumenChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14, justifyContent: 'center' },
  chip: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 5 },
  chipOk: { backgroundColor: '#dcfce7' },
  chipPend: { backgroundColor: '#fef3c7' },
  chipTxt: { fontSize: 11.5, fontWeight: '800', color: '#fff' },

  barra: { backgroundColor: AZUL_MED, paddingHorizontal: 18, paddingVertical: 10, borderLeftWidth: 5, borderLeftColor: '#c9a84c' },
  barraTxt: { color: '#fff', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.3 },
  caja: { backgroundColor: '#fff', margin: 12, borderRadius: 12, paddingHorizontal: 14 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#eaf0f6' },
  filaEtq: { fontSize: 10.5, fontWeight: '800', color: '#8a94a6', letterSpacing: 0.4, width: 112, textTransform: 'uppercase', paddingTop: 2 },
  filaVal: { fontSize: 14, color: '#243b53', flex: 1 },
  filaValFuerte: { fontWeight: '800', color: AZUL, fontSize: 15 },
  enlace: { color: '#2563eb', fontWeight: '700' },

  parada: { backgroundColor: '#fff', margin: 12, marginTop: 0, borderRadius: 14, overflow: 'hidden' },
  paradaCab: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 11 },
  cabOk: { backgroundColor: '#f0fdf4' },
  cabPend: { backgroundColor: '#fffbeb' },
  num: { width: 25, height: 25, borderRadius: 13, backgroundColor: AZUL, alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  paradaHora: { fontSize: 15, fontWeight: '800', color: AZUL, flex: 1 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  estadoOk: { backgroundColor: '#dcfce7' },
  estadoPend: { backgroundColor: '#fef3c7' },
  estadoTxt: { fontSize: 11, fontWeight: '800' },

  foto: { height: 220, margin: 12, marginTop: 0, borderRadius: 10, backgroundColor: '#dde6ef' },
  paradaCuerpo: { paddingHorizontal: 14, paddingBottom: 14 },
  precio: { fontSize: 21, fontWeight: '800', color: AZUL },
  propTit: { fontSize: 15, fontWeight: '800', color: '#243b53', marginTop: 5 },
  propUbi: { fontSize: 13, color: '#64748b', marginTop: 2 },
  cars: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  car: { backgroundColor: FONDO, borderLeftWidth: 3, borderLeftColor: AZUL, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  carTxt: { fontSize: 12, fontWeight: '700', color: AZUL },

  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  accionTxt: { fontSize: 12.5, fontWeight: '800', color: AZUL },

  asesor: { backgroundColor: AZUL, borderRadius: 11, padding: 13, marginTop: 12 },
  asesorLbl: { fontSize: 9.5, letterSpacing: 1.3, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  asesorNom: { fontSize: 14.5, fontWeight: '800', color: '#fff', marginTop: 4 },
  wa: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  waTxt: { fontSize: 13.5, fontWeight: '800', color: ORO },

  pie: { fontSize: 10.5, color: '#94a3b8', textAlign: 'center', marginTop: 10, paddingHorizontal: 24, lineHeight: 16 },
})
