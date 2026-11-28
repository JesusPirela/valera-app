// El espacio de una INMOBILIARIA ALIADA dentro de Valera App.
//
// Es un grupo de pantallas aparte, no una variante de (admin) ni de
// (prospectador), y eso es a propósito: esos dos layouts arrastran nuestro
// logo, nuestro menú, las misiones, la racha y el chat interno. Aquí no entra
// nada de eso. Lo que esta gente ve es SU marca y SU operación.
//
// Lo que decide qué puede tocar NO es este archivo: son las reglas de la base
// (ver las migraciones 20261127_aliados_*). Una pantalla escondida sigue
// siendo una puerta abierta si la base deja pasar; esto solo evita enseñarles
// cosas que no son suyas.
import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native'
import { Stack, router, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { cerrarSesionUsuario } from '../../lib/cuentas'
import { useColors, useTheme } from '../../lib/ThemeContext'

type Agencia = { nombre: string; logo_url: string | null }

// 'mis-propiedades' y no 'propiedades': en web la URL NO lleva el grupo, y
// ya hay una pantalla 'propiedades' en (admin) y otra en (prospectador). Con
// el mismo nombre, al recargar el router entra por la de admin y el aliado
// pasaba un instante por NUESTRA app antes de que lo devolvieran a la suya.
const TABS_BASE = [
  { ruta: 'mis-propiedades', icono: 'home' as const, texto: 'Propiedades' },
  { ruta: 'catalogo',    icono: 'albums' as const, texto: 'Catálogo' },
  { ruta: 'clientes',    icono: 'people' as const, texto: 'Clientes' },
  { ruta: 'mis-citas',   icono: 'calendar' as const, texto: 'Citas' },
]
// Solo el titular ve esta pestaña: es desde donde edita el logo/sitio de su
// agencia e invita a su propia gente. Un agente no pinta nada ahí.
const TAB_TITULAR = { ruta: 'mi-agencia', icono: 'business' as const, texto: 'Mi agencia' }

export default function AliadoLayout() {
  const c = useColors()
  const { darkMode } = useTheme()
  const pathname = usePathname()
  const [agencia, setAgencia] = useState<Agencia | null>(null)
  const [esTitular, setEsTitular] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/(auth)/login'); return }
      const { data: perfil } = await supabase
        .from('profiles').select('role, inmobiliaria_id').eq('id', session.user.id).single()
      // Quien no es aliado no pinta nada aquí: se le devuelve a su app.
      if (!perfil || !['aliado_admin', 'aliado_agente'].includes(perfil.role)) {
        router.replace(perfil?.role === 'admin' ? '/(admin)/propiedades' : '/(prospectador)/propiedades')
        return
      }
      if (vivo) setEsTitular(perfil.role === 'aliado_admin')
      if (!perfil.inmobiliaria_id) return
      const { data } = await supabase
        .from('inmobiliarias').select('nombre, logo_url').eq('id', perfil.inmobiliaria_id).single()
      if (vivo && data) setAgencia(data as Agencia)
    })()
    return () => { vivo = false }
  }, [])

  const TABS = esTitular ? [...TABS_BASE, TAB_TITULAR] : TABS_BASE

  const actual = (pathname || '').replace(/^\/+/, '').split('?')[0]

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* La cabecera lleva SU marca. Si todavía no subieron logo, va una marca
          neutra con su inicial — nunca la nuestra, que es justo lo que se
          pidió: que no se sientan dentro de otra empresa. */}
      <View style={[s.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {agencia?.logo_url
          ? <Image source={{ uri: agencia.logo_url }} style={s.logo} resizeMode="contain" />
          : (
            <View style={[s.logoLetra, { backgroundColor: c.border }]}>
              <Text style={{ fontWeight: '900', fontSize: 15, color: c.text }}>
                {(agencia?.nombre ?? '·').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        <Text style={[s.nombre, { color: c.text }]} numberOfLines={1}>
          {agencia?.nombre ?? 'Mi inmobiliaria'}
        </Text>
        <TouchableOpacity
          onPress={() => cerrarSesionUsuario()}
          style={s.salir}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
        >
          <Ionicons name="log-out-outline" size={18} color={c.textMute} />
        </TouchableOpacity>
      </View>

      <Stack screenOptions={{ headerShown: false }} />

      <View style={[s.tabs, { backgroundColor: c.card, borderTopColor: c.border }]}>
        {TABS.map(t => {
          const on = actual === t.ruta
          return (
            <TouchableOpacity
              key={t.ruta}
              style={s.tab}
              onPress={() => router.replace(`/(aliado)/${t.ruta}` as any)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={on ? t.icono : (`${t.icono}-outline` as any)} size={21}
                        color={on ? c.text : c.textMute} />
              <Text style={[s.tabTxt, { color: on ? c.text : c.textMute, fontWeight: on ? '800' : '600' }]}>
                {t.texto}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
    paddingTop: Platform.OS === 'web' ? 14 : 48,
    borderBottomWidth: 1,
  },
  logo: { width: 30, height: 30, borderRadius: 7 },
  logoLetra: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  nombre: { flex: 1, fontSize: 16, fontWeight: '900' },
  salir: { padding: 6 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Platform.OS === 'web' ? 6 : 22, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabTxt: { fontSize: 11 },
})
