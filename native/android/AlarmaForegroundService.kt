package com.valerarealestate.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * Muestra el cuadro desde un servicio EN PRIMER PLANO.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 * El servicio normal que recibe el push no lograba dibujar la ventana: el
 * cuadro salía al probarlo desde la app, pero nunca con un aviso real. La
 * diferencia entre los dos casos es el estado del proceso, no el código.
 *
 * Android documenta una excepción justo para esto: recibir un mensaje de ALTA
 * PRIORIDAD por FCM permite arrancar un servicio en primer plano aunque la app
 * esté en segundo plano. Los push de alarma ya salen con prioridad alta, así
 * que la puerta estaba abierta sin usar. Con el servicio en primer plano el
 * proceso deja de estar en segundo plano y la ventana sí se puede dibujar.
 *
 * ── Dos reglas que hay que respetar o el sistema mata la app ───────────────
 *  · startForeground() tiene que llamarse de inmediato, antes de hacer nada
 *    más. Si se tarda, salta ForegroundServiceStartNotAllowedException.
 *  · La excepción por FCM es breve: si el mensaje no era de alta prioridad, el
 *    sistema puede haberla degradado y entonces no se puede arrancar. Por eso
 *    quien llama comprueba la prioridad antes.
 *
 * ── La notificación como diagnóstico ───────────────────────────────────────
 * Un servicio en primer plano está OBLIGADO a mostrar una notificación. En vez
 * de poner un texto de relleno, dice qué pasó con el cuadro. Si algo falla, el
 * motivo queda a la vista en la bandeja sin tener que entrar a ningún lado.
 */
class AlarmaForegroundService : Service() {

  companion object {
    private const val TAG = "ValeraAlarma"
    private const val CANAL = "alarma_servicio"
    private const val ID_NOTIF = 77001

    const val EXTRA_NOMBRE  = "nombre"
    const val EXTRA_DETALLE = "detalle"

    /** Techo de vida del servicio, un poco mayor que el del cuadro. */
    private const val MAX_MS = 70_000L
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // PRIMERO la notificación, siempre. Cualquier otra cosa antes de esto
    // arriesga que el sistema mate la app por no cumplir el contrato.
    arrancarEnPrimerPlano("Mostrando el aviso…")

    val fallo = try {
      CuadroOverlay.mostrar(
        applicationContext,
        "¡Nuevo lead de campaña!",
        "Atiéndelo lo antes posible para no perder la oportunidad.",
        intent?.getStringExtra(EXTRA_NOMBRE),
        intent?.getStringExtra(EXTRA_DETALLE),
      )
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo mostrar el cuadro", e)
      "ERROR: " + (e.message ?: e.javaClass.simpleName)
    }

    anotar(fallo ?: "se mostró el cuadro")

    if (fallo != null) {
      // Se deja escrito en la bandeja, que es donde la persona lo va a ver sin
      // que nadie se lo pida.
      arrancarEnPrimerPlano("No se pudo mostrar el cuadro: $fallo")
      Handler(Looper.getMainLooper()).postDelayed({ detener() }, 12_000L)
    } else {
      Handler(Looper.getMainLooper()).postDelayed({ detener() }, MAX_MS)
    }

    return START_NOT_STICKY
  }

  private fun arrancarEnPrimerPlano(texto: String) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Importancia baja: es el aviso obligatorio del servicio, no la alarma.
        // La alarma ya suena por su cuenta; dos sonidos serían ruido.
        nm.createNotificationChannel(NotificationChannel(
          CANAL, "Aviso de lead en curso", NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Mientras se muestra el cuadro de un lead nuevo" })
      }

      val n: Notification =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
          Notification.Builder(this, CANAL)
            .setContentTitle("Valera")
            .setContentText(texto)
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .build()
        else
          @Suppress("DEPRECATION")
          Notification.Builder(this)
            .setContentTitle("Valera")
            .setContentText(texto)
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .build()

      // En Android 14+ todo servicio en primer plano debe declarar su tipo.
      // shortService es el adecuado: tarea corta y acotada, sin pedir permisos
      // especiales ni justificar un uso continuo.
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(ID_NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
      } else {
        startForeground(ID_NOTIF, n)
      }
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo arrancar en primer plano", e)
      anotar("ERROR al arrancar en primer plano: " + (e.message ?: e.javaClass.simpleName))
    }
  }

  private fun anotar(desenlace: String) {
    try {
      getSharedPreferences(ValeraMessagingService.PREFS, MODE_PRIVATE).edit()
        .putLong("cuando", System.currentTimeMillis())
        .putBoolean("bandera", true)
        .putBoolean("permiso", CuadroOverlay.hayPermiso(this))
        .putString("desenlace", desenlace)
        .apply()
    } catch (e: Throwable) { Log.w(TAG, "No se pudo anotar", e) }
  }

  private fun detener() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (e: Throwable) { Log.w(TAG, "", e) }
    stopSelf()
  }
}
