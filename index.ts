import 'expo-router/entry'
import { AppRegistry, Platform } from 'react-native'

// Registra el manejador del widget "Mi Día" de Android.
//
// react-native-android-widget registra un Turbo Module NATIVO en el momento
// del import (TurboModuleRegistry.getEnforcing dentro de NativeAndroidWidget),
// que solo existe en Android. Un `import` estático de este módulo arriba del
// archivo haría que la llamada corra SIEMPRE al arrancar el bundle — incluida
// la app de iOS/web, donde ese Turbo Module no existe y tronaría el arranque.
// Por eso el require() es dinámico y va DENTRO del if: así el código de
// react-native-android-widget nunca se ejecuta fuera de Android, aunque Metro
// sí lo incluya en el bundle de todas las plataformas.
if (Platform.OS === 'android') {
  const { widgetTaskHandler } = require('./widgets/widget-task-handler')
  AppRegistry.registerHeadlessTask('WidgetTaskHandler', () => widgetTaskHandler)
}
