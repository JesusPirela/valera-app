package com.valerarealestate.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * El cuadro grande que sale encima de lo que estés usando, y también sobre la
 * pantalla de bloqueo, cuando llega un lead sin atender.
 *
 * Por qué una pantalla propia y no el "intent de pantalla completa":
 * desde el 31/mayo/2024 Google Play REVOCA al instalar el permiso
 * USE_FULL_SCREEN_INTENT a las apps que no son de alarmas ni de llamadas, y
 * para conservarlo hay que pasar una revisión que puede rechazarse. Valera es
 * un CRM. Arrancando la pantalla nosotros, con permiso de "mostrar sobre otras
 * apps" —que concede el usuario y Google no revoca— se consigue lo mismo sin
 * depender de esa revisión.
 *
 * La interfaz se construye en código a propósito: un layout XML obligaría al
 * plugin a copiar recursos y a tocar el build de Android. Menos piezas, menos
 * formas de que la build falle.
 */
class AlarmaActivity : Activity() {

  companion object {
    private const val TAG = "ValeraAlarma"
    const val EXTRA_TITULO = "titulo"
    const val EXTRA_CUERPO = "cuerpo"

    /**
     * Techo de 60 s sonando. La alarma vuelve sola a los 5 minutos, así que
     * perder este ciclo no pierde el aviso; en cambio una pantalla sonando sin
     * fin en un bolsillo sí sería motivo para desinstalar la app.
     */
    private const val MAX_SONANDO_MS = 60_000L

    private const val ENLACE_LEADS    = "valera-app://leads-campania"
    private const val ENLACE_POSPONER = "valera-app://mi-dia?alarma=posponer"
  }

  private var reproductor: MediaPlayer? = null
  private var vibrador: Vibrator? = null
  private val cronometro = Handler(Looper.getMainLooper())
  private val cerrarSolo = Runnable { cerrar() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    mostrarSobreElBloqueo()
    setContentView(construirVista(
      intent?.getStringExtra(EXTRA_TITULO) ?: "Lead sin atender",
      intent?.getStringExtra(EXTRA_CUERPO) ?: "Contáctalo por WhatsApp o llámalo.",
    ))
    empezarASonar()
    cronometro.postDelayed(cerrarSolo, MAX_SONANDO_MS)
  }

  /** Si llega otra alarma con esta pantalla abierta, se refresca en vez de apilarse. */
  override fun onNewIntent(nuevo: Intent?) {
    super.onNewIntent(nuevo)
    nuevo?.let {
      setIntent(it)
      setContentView(construirVista(
        it.getStringExtra(EXTRA_TITULO) ?: "Lead sin atender",
        it.getStringExtra(EXTRA_CUERPO) ?: "Contáctalo por WhatsApp o llámalo.",
      ))
    }
  }

  private fun mostrarSobreElBloqueo() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)
        ?.requestDismissKeyguard(this, null)
    } else {
      // En Android 8.0 y anteriores los métodos de arriba no existen y la única
      // vía son estas banderas de ventana, hoy marcadas como obsoletas.
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // ── Interfaz ───────────────────────────────────────────────────────────────

  private fun dp(valor: Float): Int = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP, valor, resources.displayMetrics).toInt()

  private fun construirVista(titulo: String, cuerpo: String): ViewGroup {
    val fondo = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#CC000000"))   // negro translúcido
      setPadding(dp(24f), dp(24f), dp(24f), dp(24f))
    }

    val tarjeta = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#102A3A"))
        cornerRadius = dp(22f).toFloat()
        setStroke(dp(2f), Color.parseColor("#C9A84C"))    // dorado de la marca
      }
      setPadding(dp(26f), dp(30f), dp(26f), dp(24f))
    }

    tarjeta.addView(TextView(this).apply {
      text = "🔔"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 46f)
      gravity = Gravity.CENTER
    })

    tarjeta.addView(TextView(this).apply {
      text = titulo
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 23f)
      gravity = Gravity.CENTER
      setPadding(0, dp(12f), 0, 0)
    })

    tarjeta.addView(TextView(this).apply {
      text = cuerpo
      setTextColor(Color.parseColor("#B9C9D2"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
      setPadding(0, dp(10f), 0, dp(26f))
    })

    tarjeta.addView(boton("Ver el lead", "#1A6470", Color.WHITE) { abrir(ENLACE_LEADS) })
    tarjeta.addView(boton("Posponer 1 hora", "#24405280", Color.parseColor("#B9C9D2")) { abrir(ENLACE_POSPONER) })

    fondo.addView(tarjeta, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return fondo
  }

  private fun boton(texto: String, fondoHex: String, colorTexto: Int, alTocar: () -> Unit) =
    Button(this).apply {
      text = texto
      setTextColor(colorTexto)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      isAllCaps = false
      background = GradientDrawable().apply {
        setColor(Color.parseColor(fondoHex))
        cornerRadius = dp(12f).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(52f)
      ).apply { topMargin = dp(10f) }
      setOnClickListener { alTocar() }
    }

  // ── Sonido ─────────────────────────────────────────────────────────────────

  /**
   * Aquí está el "hasta que lo atiendas": como la pantalla es nuestra, el
   * sonido se pone EN BUCLE. Una notificación normal no puede hacer esto —
   * Android reproduce su sonido una sola vez y no hay forma de pedirle que lo
   * repita.
   */
  private fun empezarASonar() {
    try {
      // Por id en vez de R.raw.alarma_valera: si algún día el wav no se
      // empaqueta, esto devuelve 0 y la alarma sale muda, en lugar de impedir
      // que el proyecto compile.
      val id = resources.getIdentifier("alarma_valera", "raw", packageName)
      if (id != 0) {
        reproductor = MediaPlayer.create(this, id)?.apply {
          isLooping = true
          setAudioAttributes(AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)            // suena aunque el timbre esté bajo
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build())
          start()
        }
      } else {
        Log.w(TAG, "No se encontró alarma_valera en res/raw")
      }
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo reproducir el sonido", e)
    }

    try {
      vibrador = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      val patron = longArrayOf(0, 600, 400, 600, 400)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrador?.vibrate(VibrationEffect.createWaveform(patron, 0))   // 0 = repetir
      } else {
        @Suppress("DEPRECATION")
        vibrador?.vibrate(patron, 0)
      }
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo vibrar", e)
    }
  }

  private fun callar() {
    try { reproductor?.stop(); reproductor?.release() } catch (e: Throwable) { Log.w(TAG, "", e) }
    reproductor = null
    try { vibrador?.cancel() } catch (e: Throwable) { Log.w(TAG, "", e) }
    vibrador = null
  }

  // ── Salidas ────────────────────────────────────────────────────────────────

  private fun abrir(enlace: String) {
    callar()
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(enlace)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      })
    } catch (e: Throwable) {
      // Si el enlace no resuelve, al menos que abra la app.
      Log.e(TAG, "No se pudo abrir $enlace", e)
      packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
    }
    cerrar()
  }

  private fun cerrar() {
    callar()
    cronometro.removeCallbacks(cerrarSolo)
    finish()
  }

  // El sonido se corta pase lo que pase: si el usuario sale con el botón atrás,
  // si Android mata la pantalla, o si llega una llamada.
  override fun onPause()   { super.onPause();   callar() }
  override fun onDestroy() { super.onDestroy(); callar(); cronometro.removeCallbacks(cerrarSolo) }
}
