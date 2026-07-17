const { withAndroidManifest } = require('@expo/config-plugins')

// Sube el límite de tamaño de AsyncStorage en Android. Por defecto son ~6 MB;
// si el caché persistido de React Query (home ~4.5MB + CRM + detalles) lo pasa,
// la ESCRITURA falla en silencio y NADA queda cacheado → cada arranque baja
// todo de cero (lento, sobre todo en redes móviles). Con 30 MB hay margen de
// sobra y los arranques posteriores al primero son instantáneos.
//
// Nota: es config NATIVA, aplica al reconstruir la app (eas build), no por OTA.
const META_NAME = 'AsyncStorage_db_size_in_MB'
const SIZE_MB = '30'

module.exports = function withAsyncStorageSize(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0]
    if (!app) return cfg
    app['meta-data'] = app['meta-data'] || []
    const existing = app['meta-data'].find(
      (m) => m.$ && m.$['android:name'] === META_NAME,
    )
    if (existing) {
      existing.$['android:value'] = SIZE_MB
    } else {
      app['meta-data'].push({ $: { 'android:name': META_NAME, 'android:value': SIZE_MB } })
    }
    return cfg
  })
}
