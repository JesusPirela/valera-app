const fs = require('fs')
const path = require('path')
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins')

// Monta la pantalla de alarma que sale ENCIMA de otras apps y sobre el bloqueo.
//
// Tres piezas:
//   1. El permiso de "mostrar sobre otras apps". Es lo que permite arrancar una
//      pantalla desde segundo plano, con la app cerrada. Lo concede el usuario
//      a mano en ajustes y Google NO lo revoca, al revés que
//      USE_FULL_SCREEN_INTENT, que Play quita al instalar a toda app que no sea
//      de alarmas o de llamadas.
//   2. ValeraMessagingService, que se pone delante del de Expo para ver pasar
//      los push de alarma. Expo declara el suyo con priority="-1" justo para
//      dejar sitio; el nuestro va con la prioridad por defecto.
//   3. AlarmaActivity, la pantalla en sí.
//
// Es config NATIVA: aplica al reconstruir con eas build, nunca por OTA.
const PAQUETE = 'com.valerarealestate.app'
const FUENTES = ['ValeraMessagingService.kt', 'AlarmaActivity.kt']

function withPermisoYComponentes(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults
    AndroidConfig.Permissions.ensurePermission(manifest, 'android.permission.SYSTEM_ALERT_WINDOW')

    const app = manifest.manifest.application?.[0]
    if (!app) throw new Error('withAlarmaOverlay: no se encontró <application> en el manifiesto')

    // ── El servicio ──
    app.service = app.service || []
    const nombreServicio = `${PAQUETE}.ValeraMessagingService`
    app.service = app.service.filter((s) => s.$?.['android:name'] !== nombreServicio)
    app.service.push({
      $: { 'android:name': nombreServicio, 'android:exported': 'false' },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
      }],
    })

    // ── La pantalla ──
    //
    // excludeFromRecents + taskAffinity vacío: la alarma no debe quedarse en la
    // lista de apps recientes ni mezclarse con la pila de la app, o al volver a
    // Valera el usuario se encontraría la alarma otra vez.
    //
    // singleTask: si llegan cinco push seguidos se reutiliza la misma pantalla
    // (onNewIntent) en vez de apilar cinco.
    //
    // showWhenLocked + turnScreenOn: esto es lo que la saca sobre el bloqueo y
    // enciende la pantalla, sin el permiso que Google revoca.
    app.activity = app.activity || []
    const nombrePantalla = `${PAQUETE}.AlarmaActivity`
    app.activity = app.activity.filter((a) => a.$?.['android:name'] !== nombrePantalla)
    //
    // El intent-filter con el esquema valera-alarma existe para poder abrir la
    // pantalla A MANO desde la app, con un botón de prueba. Sin él no había
    // forma de saber en qué punto se cortaba la cadena: si el push no llegaba
    // al código nativo, si faltaba el permiso, o si MIUI bloqueaba el arranque
    // en segundo plano. Abriéndola desde la app —que es un arranque en primer
    // plano y no necesita permiso— se separan esos casos en un toque.
    //
    // exported=true es obligatorio para que un intent implícito resuelva. Lo
    // único que otra app podría hacer con esto es mostrar el cuadro de alarma;
    // no lee ni escribe nada.
    app.activity.push({
      $: {
        'android:name': nombrePantalla,
        'android:exported': 'true',
        'android:excludeFromRecents': 'true',
        'android:launchMode': 'singleTask',
        'android:taskAffinity': '',
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
        'android:showWhenLocked': 'true',
        'android:turnScreenOn': 'true',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [{ $: { 'android:scheme': 'valera-alarma' } }],
      }],
    })

    return cfg
  })
}

// Copia los .kt del repo al proyecto Android que genera el prebuild. Viven en
// native/android/ y no dentro de android/, porque esa carpeta está en
// .gitignore y se borra entera en cada prebuild.
function withFuentesKotlin(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const origen = path.join(cfg.modRequest.projectRoot, 'native', 'android')
    const destino = path.join(
      cfg.modRequest.platformProjectRoot,
      'app', 'src', 'main', 'java', ...PAQUETE.split('.'),
    )
    fs.mkdirSync(destino, { recursive: true })
    for (const archivo of FUENTES) {
      const desde = path.join(origen, archivo)
      if (!fs.existsSync(desde)) {
        throw new Error(`withAlarmaOverlay: falta ${desde}`)
      }
      fs.copyFileSync(desde, path.join(destino, archivo))
    }
    return cfg
  }])
}

module.exports = function withAlarmaOverlay(config) {
  return withFuentesKotlin(withPermisoYComponentes(config))
}
