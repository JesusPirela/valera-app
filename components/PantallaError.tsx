import { useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { ErrorBoundaryProps } from 'expo-router'
import { captureError } from '../lib/monitor'

// ErrorBoundary de expo-router: si una pantalla LANZA un error al renderizar,
// en producción se veía la pantalla en blanco/negro (sin nada). Con esto, en su
// lugar se muestra un aviso con botón "Reintentar" y —clave— se REGISTRA el
// error en el monitoreo, así sabemos qué lo causó en vez de quedarnos a ciegas.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    captureError(error, 'pantalla-crash')
  }, [error])

  return (
    <View style={s.wrap}>
      <Text style={s.emoji}>😕</Text>
      <Text style={s.title}>Se atoró al cargar esta pantalla</Text>
      <Text style={s.sub}>Ya registramos el error. Intenta de nuevo.</Text>
      <TouchableOpacity style={s.btn} activeOpacity={0.85} onPress={() => retry()}>
        <Text style={s.btnTxt}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: '#f1f5f9' },
  emoji: { fontSize: 44 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a1a2e', textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 8 },
  btn: { backgroundColor: '#1a6470', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
