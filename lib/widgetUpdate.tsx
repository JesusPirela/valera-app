// Fuerza un refresco inmediato del widget "Mi Día" desde dentro de la app —
// por ejemplo justo después de publicar una propiedad, para que el número no
// se quede esperando el ciclo automático de Android (mínimo 30 min).
// Si el usuario no tiene el widget agregado a su pantalla de inicio, esta
// llamada simplemente no hace nada (react-native-android-widget la ignora).
import { Platform } from 'react-native'
import { obtenerDatosWidget } from '../widgets/datos'

export async function actualizarWidgetMiDia(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    // require() dinámico y solo tras el early-return de arriba: ver el
    // comentario en index.ts sobre por qué react-native-android-widget no se
    // importa de forma estática (registra un Turbo Module nativo que no
    // existe en iOS/web con solo importarlo).
    const { requestWidgetUpdate } = require('react-native-android-widget')
    const { MiDiaWidget, WIDGET_NAME } = require('../widgets/MiDiaWidget')
    const datos = await obtenerDatosWidget()
    if (!datos) return
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => <MiDiaWidget {...datos} />,
    })
  } catch {
    // Silencioso a propósito: el widget se pondrá al día solo con el
    // siguiente ciclo automático o la próxima acción que sí funcione.
  }
}
