// Configurar la alarma de leads en el propio teléfono.
//
// Solo la ve quien tiene una campaña asignada. Al resto no le entra ningún
// lead de campaña, así que una lista de permisos que no necesita solo le
// estorba —y le invita a tocar interruptores del sistema por curiosidad—.
//
// Por qué existe: la alarma depende de permisos que Android pide uno por uno,
// cada marca los esconde en un menú distinto, y cuando falta alguno no falla
// con un error: simplemente no pasa nada. Hasta ahora la única forma de saber
// cuál faltaba era probar y adivinar. Aquí están los cuatro en orden, cada uno
// con el botón que lleva a su pantalla, y una prueba al final.
//
// Qué se puede comprobar de verdad y qué no:
//   · Los avisos (notificaciones) se consultan desde aquí, y se ven con su ✓.
//   · El permiso de superponerse, la batería y el candado del fabricante NO se
//     pueden leer desde JavaScript. Por eso ninguno dice "activado": sería
//     mentira. Lo que sí hay es el botón que lleva al interruptor exacto, y la
//     prueba del final, que es la que responde de verdad.
import { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking, Alert } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { supabase } from '../lib/supabase'
import { useColors } from '../lib/ThemeContext'
import { notaDelFabricante } from '../lib/fabricante'

const AMBAR = '#b45309'
const VERDE = '#2e7d32'

function aviso(titulo: string, texto: string) {
  if (Platform.OS === 'web') window.alert(titulo + '\n\n' + texto)
  else Alert.alert(titulo, texto)
}

export default function ConfigAlarma() {
  const c = useColors()
  const [mostrar, setMostrar] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [permiso, setPermiso] = useState<string | null>(null)
  const [probando, setProbando] = useState(false)

  // Se vuelve a mirar al volver a la pantalla: la gente sale a Ajustes, toca el
  // interruptor y regresa, y el estado tiene que reflejarlo sin recargar nada.
  useFocusEffect(useCallback(() => {
    supabase.rpc('tengo_campania_asignada').then(({ data }) => setMostrar(data === true))
    if (Platform.OS !== 'web') {
      Notifications.getPermissionsAsync().then(p => setPermiso(p.status)).catch(() => setPermiso(null))
    }
  }, []))

  if (!mostrar) return null

  const avisosOk = permiso === 'granted'

  async function pedirAvisos() {
    const p = await Notifications.requestPermissionsAsync()
    setPermiso(p.status)
    if (p.status !== 'granted') {
      // Android no vuelve a preguntar una vez que se negó: desde ahí solo se
      // arregla en Ajustes, así que se lleva directo en vez de dejar el botón
      // sin hacer nada.
      aviso('Siguen apagados', 'Android ya no vuelve a preguntar. Actívalos en Ajustes › Notificaciones.')
      Linking.openSettings()
    }
  }

  async function abrirCuadro() {
    try {
      await Linking.openURL('valera-alarma://probar')
    } catch {
      aviso('Falta actualizar', 'Esta parte llegó en una versión más nueva. Cierra la app del todo y vuelve a abrirla para que se actualice.')
    }
  }

  async function mandarPrueba() {
    setProbando(true)
    const { data, error } = await supabase.rpc('probar_alarma_push')
    // Se empuja el envío en el momento. Sin esto habría que esperar al cron, y
    // una prueba que tarda minutos no se usa.
    if (!error) await supabase.functions.invoke('procesar-pushes').catch(() => {})
    setProbando(false)
    aviso(error ? 'No se pudo' : 'Aviso mandado', error ? error.message : String(data ?? ''))
  }

  const Paso = ({ n, titulo, texto, boton, onPress, listo }: {
    n: number; titulo: string; texto: string; boton: string; onPress: () => void; listo?: boolean
  }) => (
    <View style={[e.paso, { borderColor: c.border }]}>
      <View style={e.pasoTop}>
        <View style={[e.num, { backgroundColor: listo ? VERDE : AMBAR }]}>
          <Text style={e.numTxt}>{listo ? '✓' : String(n)}</Text>
        </View>
        <Text style={[e.pasoTitulo, { color: c.text }]}>{titulo}</Text>
      </View>
      <Text style={[e.pasoTexto, { color: c.textMute }]}>{texto}</Text>
      <TouchableOpacity style={[e.pasoBtn, { borderColor: listo ? VERDE : AMBAR }]} onPress={onPress}>
        <Text style={[e.pasoBtnTxt, { color: listo ? VERDE : AMBAR }]}>{boton}</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <View>
      <Text style={e.seccion}>ALARMA DE LEADS</Text>

      <TouchableOpacity style={[e.cabecera, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => setAbierto(v => !v)}>
        <Text style={[e.cabeceraTxt, { color: c.text }]}>🔔 Configurar la alarma en este teléfono</Text>
        <Text style={[e.cabeceraFlecha, { color: c.textMute }]}>{abierto ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {abierto && (
        <View style={{ marginTop: 10, gap: 10 }}>
          <Text style={[e.intro, { color: c.textMute }]}>
            Tienes una campaña asignada, así que te entran leads. La alarma suena y saca un cuadro en
            pantalla hasta que lo atiendes o lo pospones.
            {Platform.OS === 'web' ? '' : ' Para que salga con el teléfono bloqueado o en otra app, hay que dar estos permisos:'}
          </Text>

          {Platform.OS === 'web' ? (
            <Text style={[e.intro, { color: c.textMute }]}>
              Esto se configura desde el celular. Abre la app en tu teléfono y entra aquí otra vez.
            </Text>
          ) : Platform.OS === 'ios' ? (
            <>
              <Paso
                n={1}
                listo={avisosOk}
                titulo="Permitir los avisos"
                texto={avisosOk ? 'Listo, los avisos están permitidos.' : 'Sin esto no llega nada al teléfono.'}
                boton={avisosOk ? 'Revisar en Ajustes' : 'Permitir avisos'}
                onPress={avisosOk ? () => Linking.openSettings() : pedirAvisos}
              />
              <Paso
                n={2}
                titulo="Dejar que suene en Concentración"
                texto={'En Ajustes › Notificaciones › Valera, enciende “Avisos urgentes”. Es lo que deja ' +
                       'sonar un lead aunque tengas el modo Concentración o No molestar puesto.'}
                boton="Abrir ajustes de Valera"
                onPress={() => Linking.openSettings()}
              />
            </>
          ) : (
            <>
              <Paso
                n={1}
                listo={avisosOk}
                titulo="Permitir los avisos"
                texto={avisosOk ? 'Listo, los avisos están permitidos.' : 'Sin esto no llega nada al teléfono.'}
                boton={avisosOk ? 'Revisar en Ajustes' : 'Permitir avisos'}
                onPress={avisosOk ? () => Linking.openSettings() : pedirAvisos}
              />
              <Paso
                n={2}
                titulo="Mostrar sobre otras apps"
                texto={'Es el que hace que el cuadro salga encima de WhatsApp o de lo que tengas abierto. ' +
                       'El botón te lleva al interruptor y de paso te enseña el cuadro, para que veas que quedó.'}
                boton="Ir y probar el cuadro"
                onPress={abrirCuadro}
              />
              <Paso
                n={3}
                titulo="Que no la duerma la batería"
                texto={'En Ajustes › Batería, pon Valera en “Sin restricciones”. Con el ahorro puesto, ' +
                       'Android guarda el aviso y lo suelta cuando le parece, y un lead llega tarde.'}
                boton="Abrir ajustes de Valera"
                onPress={() => Linking.openSettings()}
              />
              {!!notaDelFabricante && (
                <Paso
                  n={4}
                  titulo="El candado de tu marca"
                  texto={notaDelFabricante}
                  boton="Abrir ajustes de Valera"
                  onPress={() => Linking.openSettings()}
                />
              )}
            </>
          )}

          {Platform.OS !== 'web' && (
            <>
              <TouchableOpacity
                style={[e.probar, probando && { opacity: 0.6 }]}
                disabled={probando}
                onPress={mandarPrueba}
              >
                <Text style={e.probarTxt}>{probando ? 'Mandando…' : '🔔 Mandarme un aviso de prueba'}</Text>
              </TouchableOpacity>
              <Text style={[e.nota, { color: c.textMute }]}>
                Esta prueba recorre el mismo camino que un lead de verdad: sale del servidor y llega a
                tu teléfono. Mándalo y bloquea la pantalla o cambia de app; si el cuadro sale ahí, está
                bien configurado.
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  )
}

const e = StyleSheet.create({
  seccion: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  cabeceraTxt: { fontSize: 14.5, fontWeight: '800', flex: 1 },
  cabeceraFlecha: { fontSize: 12, fontWeight: '800', marginLeft: 8 },
  intro: { fontSize: 13, lineHeight: 19 },
  paso: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  pasoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  pasoTitulo: { fontSize: 14, fontWeight: '800', flex: 1 },
  pasoTexto: { fontSize: 12.5, lineHeight: 18 },
  pasoBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  pasoBtnTxt: { fontSize: 13, fontWeight: '800' },
  probar: { backgroundColor: '#1a6470', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  probarTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  nota: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
})
