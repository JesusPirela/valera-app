package com.valerarealestate.app

import android.content.Intent
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * Intercepta los push de alarma para mostrar el cuadro encima de lo que el
 * usuario esté haciendo, y le deja TODO lo demás a Expo.
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

    /** Donde queda el registro del último aviso, para la pantalla de prueba. */
    const val PREFS = "valera_alarma_diag"
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // Pase lo que pase aquí, el aviso normal tiene que salir. Por eso todo el
    // bloque va en try/catch y super() se llama SIEMPRE, incluso si la pantalla
    // falla: es preferible una alarma sin pantalla que una alarma perdida.
    try {
      val bandera = leerDato(remoteMessage, BANDERA_PANTALLA) == "1"
      val permiso = CuadroOverlay.hayPermiso(this)
      // Android degrada la prioridad del mensaje si cree que la app abusa de
      // ella, y con la prioridad degradada NO se puede arrancar un servicio en
      // primer plano: el intento lanzaría ForegroundServiceStartNotAllowedException.
      // Por eso se comprueba antes de intentarlo.
      val altaPrioridad = remoteMessage.priority == RemoteMessage.PRIORITY_HIGH

      val desenlace = when {
        !bandera -> "el aviso no pedía cuadro"
        !permiso -> "falta el permiso de superposición"
        else -> try {
          // Se delega en un servicio EN PRIMER PLANO en vez de dibujar aquí.
          //
          // Dibujar desde este servicio no funcionaba: el cuadro salía al
          // probarlo desde la app pero nunca con un aviso real, y la diferencia
          // entre los dos casos es el estado del proceso. Recibir un mensaje de
          // alta prioridad por FCM da permiso para arrancar un servicio en
          // primer plano, y con eso el proceso deja de estar en segundo plano.
          val i = Intent(this, AlarmaForegroundService::class.java).apply {
            putExtra(AlarmaForegroundService.EXTRA_NOMBRE, leerDato(remoteMessage, "lead_nombre"))
            putExtra(AlarmaForegroundService.EXTRA_DETALLE, leerDato(remoteMessage, "lead_detalle"))
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i)
          else startService(i)
          "lanzado el servicio en primer plano" + (if (!altaPrioridad) " (prioridad NO alta)" else "")
        } catch (e: Throwable) {
          Log.e(TAG, "No se pudo arrancar el servicio en primer plano", e)
          // Último recurso: intentarlo desde aquí. En segundo plano es probable
          // que no se vea, pero perder la alarma en silencio es peor.
          val r = CuadroOverlay.mostrar(
            this,
            "¡Nuevo lead de campaña!",
            "Atiéndelo lo antes posible para no perder la oportunidad.",
            leerDato(remoteMessage, "lead_nombre"),
            leerDato(remoteMessage, "lead_detalle"),
          )
          "ERROR al lanzar el servicio (" + (e.message ?: e.javaClass.simpleName) + ") · directo: " + (r ?: "ok")
        }
      }
      anotar(bandera, permiso, desenlace)
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo abrir la pantalla de alarma", e)
      anotar(false, false, "ERROR antes de intentar: " + (e.message ?: e.javaClass.simpleName))
    }
    super.onMessageReceived(remoteMessage)
  }

  /**
   * Deja constancia de lo que pasó con el último aviso, para que la pantalla de
   * prueba pueda enseñarlo.
   *
   * Nace de una sesión entera a ciegas: el permiso estaba bien y la pantalla
   * abría al probarla a mano, pero con un aviso de verdad no salía nada, y
   * desde fuera no había forma de saber si el mensaje siquiera llegaba hasta
   * aquí. Un servicio que falla en silencio no se puede depurar.
   *
   * En SharedPreferences y no en la base: esto corre con la app cerrada y sin
   * sesión, así que no hay a quién preguntarle el token. Son cuatro datos y se
   * leen desde el mismo teléfono.
   */
  private fun anotar(bandera: Boolean, permiso: Boolean, desenlace: String) {
    try {
      getSharedPreferences(PREFS, MODE_PRIVATE).edit()
        .putLong("cuando", System.currentTimeMillis())
        .putBoolean("bandera", bandera)
        .putBoolean("permiso", permiso)
        .putString("desenlace", desenlace)
        .apply()
    } catch (e: Throwable) { Log.w(TAG, "No se pudo anotar el diagnóstico", e) }
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

}
