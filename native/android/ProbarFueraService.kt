package com.valerarealestate.app

import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * Espera unos segundos y muestra el cuadro, para poder probarlo ESTANDO FUERA
 * de la app.
 *
 * Es la prueba que de verdad importa: dentro de la app el cuadro siempre se vio
 * bien, y aun así con un aviso real no salía. Esperando unos segundos a que la
 * persona salga a otra app, se reproduce exactamente la condición del push —la
 * app en segundo plano— sin depender de que entre un lead.
 *
 * Deja constancia del resultado igual que un aviso real, así que si el cuadro
 * no se ve, el motivo queda anotado y se puede leer después.
 */
class ProbarFueraService : Service() {

  companion object {
    private const val TAG = "ValeraAlarma"
    const val EXTRA_ESPERA_MS = "espera_ms"
    const val ESPERA_POR_DEFECTO = 8_000L
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val espera = intent?.getLongExtra(EXTRA_ESPERA_MS, ESPERA_POR_DEFECTO) ?: ESPERA_POR_DEFECTO

    Handler(Looper.getMainLooper()).postDelayed({
      val fallo = CuadroOverlay.mostrar(
        applicationContext,
        "¡Nuevo lead de campaña!",
        "Atiéndelo lo antes posible para no perder la oportunidad.",
        "Prueba desde segundo plano",
        "Si ves esto fuera de la app, ya funciona",
      )
      try {
        getSharedPreferences(ValeraMessagingService.PREFS, MODE_PRIVATE).edit()
          .putLong("cuando", System.currentTimeMillis())
          .putBoolean("bandera", true)
          .putBoolean("permiso", CuadroOverlay.hayPermiso(applicationContext))
          .putString("desenlace", "PRUEBA fuera de la app: " + (fallo ?: "se mostró el cuadro"))
          .apply()
      } catch (e: Throwable) { Log.w(TAG, "No se pudo anotar la prueba", e) }
      stopSelf()
    }, espera)

    // Prueba puntual: si el sistema lo mata, no debe revivir.
    return START_NOT_STICKY
  }
}
