package com.valerarealestate.app

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowManager

/**
 * Muestra el cuadro como VENTANA SUPERPUESTA, encima de cualquier app.
 *
 * ── Por qué así y no abriendo una pantalla ─────────────────────────────────
 * El primer intento abría una Activity desde el servicio que recibe el push.
 * No funcionaba y no daba ningún error. La causa está documentada por Google:
 * desde Android 15, la excepción que permitía lanzar pantallas en segundo
 * plano teniendo SYSTEM_ALERT_WINDOW se estrechó, y ahora exige que la app YA
 * tenga una ventana superpuesta VISIBLE. Nuestra app apunta a SDK 36, así que
 * cae de lleno en esa regla: el permiso concedido no basta y startActivity se
 * ignora en silencio.
 *
 * Añadir la ventana superpuesta, en cambio, NO es lanzar una pantalla: es un
 * WindowManager.addView, que solo pide SYSTEM_ALERT_WINDOW —el permiso que la
 * persona ya concedió— y sigue permitido desde segundo plano.
 *
 * Como efecto secundario util, con la ventana ya visible la app SÍ recupera el
 * derecho a abrir pantallas: por eso el botón "Atender ahora" puede llevar a la
 * app sin pelearse con la restricción.
 *
 * ── Lo que esta vía no cubre ───────────────────────────────────────────────
 * Una ventana superpuesta no se dibuja encima de la pantalla de BLOQUEO: ahí
 * manda el sistema. Con el teléfono bloqueado sigue saliendo la notificación
 * normal, que es lo que ya pasaba.
 */
object CuadroOverlay {

  private const val TAG = "ValeraAlarma"
  /** Techo sonando. Si nadie lo toca, se quita solo: una ventana pegada encima
   *  de todo sin forma de quitarla sería motivo para desinstalar la app. */
  private const val MAX_MS = 60_000L

  /** Cuánto se puede posponer. Las etiquetas son las que lee la persona. */
  private val OPCIONES_POSPONER = listOf(
    "15 minutos" to 15,
    "1 hora" to 60,
    "4 horas" to 240,
    "Hasta mañana" to 60 * 20,
  )

  private var vista: View? = null
  private var reproductor: MediaPlayer? = null
  private var vibrador: Vibrator? = null
  private val reloj = Handler(Looper.getMainLooper())
  private val quitarSolo = Runnable { quitar() }

  fun hayPermiso(c: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(c)

  /**
   * @return null si salió bien, o el motivo del fallo (para el diagnóstico).
   */
  fun mostrar(c: Context, titulo: String, cuerpo: String, nombre: String?, detalle: String?): String? {
    if (!hayPermiso(c)) return "falta el permiso de superposición"

    // Todo en el hilo principal: WindowManager no admite otro.
    var error: String? = null
    ejecutarEnPrincipal {
      try {
        quitar()   // si quedaba uno, se reemplaza en vez de apilarse

        val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val v = CuadroVista.construir(
          c, titulo, cuerpo, nombre, detalle,
          alPrincipal = { abrir(c, "valera-app://leads-campania") },
          // "Posponer" ya no decide por la persona: abre las opciones.
          alSecundario = { mostrarOpciones(c, titulo, cuerpo, nombre, detalle) },
        )

        wm.addView(v, parametrosVentana())
        vista = v
        sonar(c)
        reloj.removeCallbacks(quitarSolo)
        reloj.postDelayed(quitarSolo, MAX_MS)
      } catch (e: Throwable) {
        Log.e(TAG, "No se pudo mostrar la ventana superpuesta", e)
        error = "ERROR al mostrar: " + (e.message ?: e.javaClass.simpleName)
      }
    }
    return error
  }

  // Cuerpo de bloque y no de expresión: con "fun quitar() = ..." el tipo de
  // retorno se infiere, y como quitarSolo llama a quitar(), Kotlin entra en una
  // inferencia circular y no compila.
  fun quitar() {
    ejecutarEnPrincipal {
      callar()
      reloj.removeCallbacks(quitarSolo)
      vista?.let { v ->
        try {
          val wm = v.context.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
          wm.removeView(v)
        } catch (e: Throwable) { Log.w(TAG, "No se pudo quitar la ventana", e) }
      }
      vista = null
    }
  }

  /**
   * Cambia el contenido de la ventana por las opciones de tiempo.
   *
   * Se reemplaza la vista en la MISMA ventana en vez de abrir otra: así no hace
   * falta otro permiso ni otro arranque, y "Volver" devuelve al cuadro sin que
   * la alarma se haya perdido por el camino.
   */
  private fun mostrarOpciones(c: Context, titulo: String, cuerpo: String, nombre: String?, detalle: String?) {
    ejecutarEnPrincipal {
      val anterior = vista ?: return@ejecutarEnPrincipal
      try {
        val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val nueva = CuadroVista.construirOpciones(
          c, OPCIONES_POSPONER,
          alElegir = { minutos -> abrir(c, "valera-app://mi-dia?alarma=posponer&minutos=$minutos") },
          alVolver = { mostrar(c, titulo, cuerpo, nombre, detalle) },
        )
        wm.removeView(anterior)
        wm.addView(nueva, parametrosVentana())
        vista = nueva
      } catch (e: Throwable) {
        Log.e(TAG, "No se pudieron mostrar las opciones de posponer", e)
      }
    }
  }

  private fun parametrosVentana(): WindowManager.LayoutParams {
    val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      tipo,
      // Sin NOT_TOUCHABLE: los botones tienen que poder tocarse.
      // Sin NOT_FOCUSABLE: así el botón "atrás" también lo cierra.
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      PixelFormat.TRANSLUCENT,
    )
  }

  private fun abrir(c: Context, enlace: String) {
    quitar()
    try {
      c.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(enlace)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      })
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo abrir $enlace", e)
      try {
        c.packageManager.getLaunchIntentForPackage(c.packageName)?.let {
          it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(it)
        }
      } catch (e2: Throwable) { Log.e(TAG, "Tampoco se pudo abrir la app", e2) }
    }
  }

  // ── Sonido ───────────────────────────────────────────────────────────────
  //
  // En bucle: es lo que una notificación no puede hacer. Android reproduce su
  // sonido una sola vez y no hay forma de pedirle que lo repita.
  private fun sonar(c: Context) {
    try {
      val id = c.resources.getIdentifier("alarma_valera", "raw", c.packageName)
      if (id != 0) {
        reproductor = MediaPlayer().apply {
          // El orden importa: atributos, fuente, prepare, start. Ponerlos
          // después de prepare() lanza IllegalStateException.
          setAudioAttributes(AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)          // suena aunque el timbre esté bajo
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build())
          c.resources.openRawResourceFd(id).use { fd ->
            setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
          }
          isLooping = true
          prepare()
          start()
        }
      }
    } catch (e: Throwable) { Log.e(TAG, "No se pudo sonar", e) }

    try {
      vibrador = c.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      val patron = longArrayOf(0, 600, 300, 600, 300)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrador?.vibrate(VibrationEffect.createWaveform(patron, 0))
      } else {
        @Suppress("DEPRECATION") vibrador?.vibrate(patron, 0)
      }
    } catch (e: Throwable) { Log.e(TAG, "No se pudo vibrar", e) }
  }

  private fun callar() {
    try { reproductor?.stop(); reproductor?.release() } catch (e: Throwable) { Log.w(TAG, "", e) }
    reproductor = null
    try { vibrador?.cancel() } catch (e: Throwable) { Log.w(TAG, "", e) }
    vibrador = null
  }

  /** Si ya venimos del hilo principal se ejecuta al momento, para poder
   *  devolver el error de mostrar() en vez de perderlo. */
  private inline fun ejecutarEnPrincipal(crossinline bloque: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) bloque()
    else {
      val listo = java.util.concurrent.CountDownLatch(1)
      Handler(Looper.getMainLooper()).post { try { bloque() } finally { listo.countDown() } }
      try { listo.await(5, java.util.concurrent.TimeUnit.SECONDS) } catch (e: InterruptedException) { }
    }
  }
}
