import { useEffect, useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, PanResponder, Image, Platform, ActivityIndicator, Dimensions, Alert } from 'react-native'
import { WebView } from 'react-native-webview'
import { prepararFuenteImagen, aplicarCensuraWeb, htmlCensuraWebView, CajaCensura } from '../lib/censura'
import { conTimeout } from '../lib/redIntentos'

type Props = {
  visible: boolean
  uri: string | null
  onCancelar: () => void
  onAplicar: (nuevaUri: string) => void
}

const PANTALLA = Dimensions.get('window')
const MAX_W = Math.min(PANTALLA.width - 48, 420)
const MAX_H = 420

export default function CensorEditorModal({ visible, uri, onCancelar, onAplicar }: Props) {
  const [tamañoImg, setTamañoImg] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef(box)
  boxRef.current = box
  const dispRef = useRef({ w: 0, h: 0 })
  const webviewRef = useRef<WebView>(null)
  const resolverRef = useRef<((d: { ok: boolean; data?: string; error?: string }) => void) | null>(null)

  useEffect(() => {
    setError(null)
    if (!visible || !uri) { setTamañoImg(null); return }
    Image.getSize(
      uri,
      (w, h) => setTamañoImg({ w, h }),
      () => setTamañoImg({ w: 1, h: 1 }),
    )
  }, [visible, uri])

  const disp = (() => {
    if (!tamañoImg) return { w: MAX_W, h: MAX_H }
    const ratio = tamañoImg.w / tamañoImg.h
    let w = MAX_W, h = MAX_W / ratio
    if (h > MAX_H) { h = MAX_H; w = MAX_H * ratio }
    return { w, h }
  })()
  dispRef.current = disp

  useEffect(() => {
    if (!tamañoImg) return
    const w = disp.w * 0.4, h = disp.h * 0.25
    setBox({ x: (disp.w - w) / 2, y: (disp.h - h) / 2, w, h })
  }, [tamañoImg])

  // PanResponder con acceso al delta acumulado real (gestureState.dx/dy son
  // relativos al inicio del gesto, no al frame anterior) — se recalcula la
  // caja base en cada onPanResponderGrant para que el arrastre sea estable.
  const baseBoxRef = useRef(box)
  const panArrastrar = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { baseBoxRef.current = boxRef.current },
      onPanResponderMove: (_e, g) => {
        const base = baseBoxRef.current
        const d = dispRef.current
        const x = Math.min(Math.max(0, base.x + g.dx), d.w - base.w)
        const y = Math.min(Math.max(0, base.y + g.dy), d.h - base.h)
        setBox((b) => ({ ...b, x, y }))
      },
    })
  ).current

  const panRedimensionar = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { baseBoxRef.current = boxRef.current },
      onPanResponderMove: (_e, g) => {
        const base = baseBoxRef.current
        const d = dispRef.current
        const w = Math.min(Math.max(30, base.w + g.dx), d.w - base.x)
        const h = Math.min(Math.max(30, base.h + g.dy), d.h - base.y)
        setBox((b) => ({ ...b, w, h }))
      },
    })
  ).current

  async function aplicar() {
    if (!uri || !tamañoImg) return
    setProcesando(true)
    try {
      const caja: CajaCensura = {
        x: box.x / disp.w,
        y: box.y / disp.h,
        w: box.w / disp.w,
        h: box.h / disp.h,
      }
      const src = await conTimeout(prepararFuenteImagen(uri), 15000)
      let resultado: string
      if (Platform.OS === 'web') {
        resultado = await conTimeout(aplicarCensuraWeb(src, caja), 15000)
      } else {
        resultado = await conTimeout(
          new Promise<string>((resolve, reject) => {
            resolverRef.current = (r) => (r.ok && r.data ? resolve(r.data) : reject(new Error(r.error ?? 'falló')))
            const payload = JSON.stringify({ src, caja })
            webviewRef.current?.postMessage(payload)
          }),
          15000,
        )
      }
      onAplicar(resultado)
    } catch (e: any) {
      console.warn('[CensorEditorModal] error aplicando censura:', e)
      const msg = String(e?.message ?? e)
      const detalle = msg.toLowerCase().includes('timeout')
        ? 'Tardó demasiado en procesar la imagen (conexión lenta).'
        : msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('cors')
        ? 'No se pudo descargar la imagen (bloqueo de CORS o conexión).'
        : `No se pudo censurar la imagen: ${msg}`
      if (Platform.OS === 'web') {
        setError(detalle)
      } else {
        Alert.alert('No se pudo censurar la imagen', detalle)
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Censurar parte de la imagen</Text>
          <Text style={styles.ayuda}>Arrastra el recuadro y ajusta su tamaño con la esquina inferior derecha.</Text>

          {!tamañoImg ? (
            <View style={[styles.imgBox, { width: MAX_W, height: MAX_H, justifyContent: 'center' }]}>
              <ActivityIndicator color="#1a6470" />
            </View>
          ) : (
            <View style={[styles.imgBox, { width: disp.w, height: disp.h }]}>
              <Image source={{ uri: uri ?? undefined }} style={{ width: disp.w, height: disp.h, borderRadius: 8 }} resizeMode="contain" />
              <View
                {...panArrastrar.panHandlers}
                style={[styles.box, { left: box.x, top: box.y, width: box.w, height: box.h }]}
              >
                <View {...panRedimensionar.panHandlers} style={styles.handle} />
              </View>
            </View>
          )}

          {Platform.OS !== 'web' && (
            <View style={styles.webviewOculto}>
              <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: htmlCensuraWebView }}
                onMessage={(ev) => {
                  try {
                    const r = JSON.parse(ev.nativeEvent.data)
                    resolverRef.current?.(r)
                  } catch {
                    resolverRef.current?.({ ok: false, error: 'respuesta inválida' })
                  }
                  resolverRef.current = null
                }}
              />
            </View>
          )}

          <View style={styles.botones}>
            <TouchableOpacity style={[styles.btn, styles.btnCancelar]} onPress={onCancelar} disabled={procesando}>
              <Text style={styles.btnCancelarText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnAplicar]} onPress={aplicar} disabled={procesando || !tamañoImg}>
              {procesando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnAplicarText}>Aplicar</Text>}
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', maxWidth: 460 },
  titulo: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 },
  ayuda: { fontSize: 12, color: '#777', marginBottom: 12, textAlign: 'center' },
  error: { fontSize: 12, color: '#c0392b', marginTop: 10, textAlign: 'center' },
  imgBox: { position: 'relative', backgroundColor: '#eee', borderRadius: 8, overflow: 'hidden' },
  box: {
    position: 'absolute',
    backgroundColor: 'rgba(26,100,112,0.35)',
    borderWidth: 2,
    borderColor: '#1a6470',
    borderRadius: 4,
  },
  handle: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1a6470',
    borderWidth: 2,
    borderColor: '#fff',
  },
  webviewOculto: { width: 1, height: 1, opacity: 0, position: 'absolute' },
  botones: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnCancelar: { backgroundColor: '#f0f0f0' },
  btnCancelarText: { color: '#444', fontWeight: '700' },
  btnAplicar: { backgroundColor: '#1a6470' },
  btnAplicarText: { color: '#fff', fontWeight: '700' },
})
