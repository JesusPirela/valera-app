package com.valerarealestate.app

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * Intercepta los push de alarma para abrir la pantalla de AlarmaActivity encima
 * de lo que el usuario esté haciendo, y le deja TODO lo demás a Expo.
 *
 * Por qué se puede heredar en vez de reemplazar:
 * ExpoFirebaseMessagingService es `open` y sus tres métodos delegan. Llamando a
 * super() al final, los avisos normales —propiedades, citas, anuncios— siguen
 * saliendo exactamente igual que antes. Esta clase solo AÑADE la pantalla.
 *
 * Por qué gana este servicio y no el de Expo:
 * Expo declara el suyo con android:priority="-1", a propósito bajo para que un
 * servicio de la app pueda ponerse delante. El nuestro va con prioridad por
 * defecto (0).
 */
class ValeraMessagingService : ExpoFirebaseMessagingService() {

  companion object {
    private const val TAG = "ValeraAlarma"

    /**
     * Interruptor de emergencia.
     *
     * La pantalla NO se abre por el tipo del aviso, sino porque el servidor
     * manda esta bandera. Si la pantalla resultara molesta o diera problemas en
     * algún celular, basta con dejar de mandarla desde procesar-pushes y deja
     * de salir en todos los aparatos en el acto. Lo nativo no se puede arreglar
     * por OTA: sin esto, cualquier problema costaría otra build y otra revisión
     * de Google, con días de por medio.
     */
    private const val BANDERA_PANTALLA = "pantalla_alarma"
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // Pase lo que pase aquí, el aviso normal tiene que salir. Por eso todo el
    // bloque va en try/catch y super() se llama SIEMPRE, incluso si la pantalla
    // falla: es preferible una alarma sin pantalla que una alarma perdida.
    try {
      if (debeAbrirPantalla(remoteMessage)) abrirPantalla(remoteMessage)
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo abrir la pantalla de alarma", e)
    }
    super.onMessageReceived(remoteMessage)
  }

  private fun debeAbrirPantalla(msg: RemoteMessage): Boolean {
    if (leerDato(msg, BANDERA_PANTALLA) != "1") return false

    // Sin "mostrar sobre otras apps" Android bloquea arrancar una pantalla
    // desde segundo plano. Intentarlo igual no muestra nada y además ensucia el
    // log con una excepción por cada push.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      Log.w(TAG, "Falta el permiso de mostrar sobre otras apps; solo sale la notificación")
      return false
    }
    return true
  }

  /**
   * Busca una clave dentro del push, mire donde mire.
   *
   * Expo mete el `data` del push dentro de message.data["body"] como un JSON en
   * texto, no como claves sueltas. Ese detalle es interno de la librería y
   * puede cambiar entre versiones, y si cambia la pantalla deja de salir SIN
   * ningún error visible: la bandera simplemente no se encuentra.
   *
   * Por eso se busca en tres sitios, de lo más probable a lo menos: la clave
   * suelta, el JSON de "body", y por último cualquier otro valor del mapa que
   * resulte ser un JSON. Cuesta microsegundos y evita que una alarma se pierda
   * por un cambio de formato.
   */
  private fun leerDato(msg: RemoteMessage, clave: String): String? {
    msg.data[clave]?.let { if (it.isNotEmpty()) return it }

    msg.data["body"]?.let { body ->
      leerDeJson(body, clave)?.let { return it }
    }

    for ((k, v) in msg.data) {
      if (k == "body" || !v.startsWith("{")) continue
      leerDeJson(v, clave)?.let { return it }
    }
    return null
  }

  private fun leerDeJson(texto: String, clave: String): String? = try {
    JSONObject(texto).optString(clave).ifEmpty { null }
  } catch (e: Throwable) {
    null
  }

  private fun abrirPantalla(msg: RemoteMessage) {
    val intent = Intent(this, AlarmaActivity::class.java).apply {
      // NEW_TASK es obligatorio: un Service no tiene pila de pantallas propia.
      // CLEAR_TOP evita que se apilen cinco alarmas si llegan cinco push.
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra(AlarmaActivity.EXTRA_TITULO, msg.notification?.title ?: titulo(msg))
      putExtra(AlarmaActivity.EXTRA_CUERPO, msg.notification?.body ?: cuerpo(msg))
    }
    startActivity(intent)
  }

  private fun titulo(msg: RemoteMessage): String =
    msg.data["title"] ?: "Tienes un lead sin atender"

  private fun cuerpo(msg: RemoteMessage): String =
    msg.data["message"] ?: "Contáctalo por WhatsApp o llámalo."
}
