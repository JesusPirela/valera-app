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
import android.provider.Settings
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
    const val EXTRA_TITULO  = "titulo"
    const val EXTRA_CUERPO  = "cuerpo"
    const val EXTRA_NOMBRE  = "nombre"    // el nombre del lead, en el recuadro lila
    const val EXTRA_DETALLE = "detalle"   // zona · presupuesto, debajo del nombre

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

    // Abierta a mano desde el botón de "Mi día" (valera-alarma://), no por un
    // push. Además de probar, sirve de diagnóstico: en Android moderno NO hay
    // forma de dibujar encima de otras apps sin el permiso de superposición
    // —ni con servicio en primer plano ni por otra vía—, así que si falta, el
    // cuadro jamás va a salir por un aviso. Aquí es donde se entera la persona.
    if (intent?.data?.scheme == "valera-alarma") {
      if (puedeSuperponerse()) {
        setContentView(construirVista(
          "✓ Todo listo",
          "El permiso ya está activo. Así vas a ver tus leads nuevos, encima de lo que estés usando.",
          nombreLead = "Así se verá cuando entre un lead",
          detalle = "zona_sur_(milenio,_el_mirador) · $2m_a_$2,4m",
        ))
        empezarASonar()
        cronometro.postDelayed(cerrarSolo, MAX_SONANDO_MS)
      } else {
        // Sin sonido: no es una alarma, es un aviso de configuración.
        //
        // Se nombra el interruptor EXACTO. Decir "falta un permiso" a secas
        // obliga a adivinar entre una lista larga, y la gente lo abandona ahí.
        setContentView(construirVista(
          "Falta activar un permiso",
          "Para que el aviso te salga encima de WhatsApp o de cualquier otra app, " +
          "Android pide tu autorización. Toca el botón y activa el interruptor que dice:",
          nombreLead = "Mostrar sobre otras apps",
          detalle = "En Xiaomi se llama “Mostrar ventanas emergentes mientras se ejecuta en segundo plano”",
          textoBoton = "Llévame ahí",
          alTocar = { abrirAjustesDePermiso() },
        ))
      }
      return
    }

    setContentView(construirVista(
      intent?.getStringExtra(EXTRA_TITULO) ?: "¡Nuevo lead de campaña!",
      intent?.getStringExtra(EXTRA_CUERPO) ?: "Atiéndelo lo antes posible para no perder la oportunidad.",
      nombreLead = intent?.getStringExtra(EXTRA_NOMBRE),
      detalle = intent?.getStringExtra(EXTRA_DETALLE),
    ))
    empezarASonar()
    cronometro.postDelayed(cerrarSolo, MAX_SONANDO_MS)
  }

  private fun puedeSuperponerse(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)

  /**
   * Abre la pantalla de ajustes del permiso YA POSICIONADA en Valera.
   *
   * La diferencia con lanzar la acción a secas es grande: sin el "package:" se
   * abre la lista de todas las apps del teléfono y hay que buscar Valera a
   * mano entre decenas. Con él, se abre su interruptor directo.
   */
  private fun abrirAjustesDePermiso() {
    try {
      startActivity(Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:$packageName"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo abrir los ajustes del permiso", e)
      // Algunos fabricantes no aceptan el package: en esa acción. Se cae a la
      // ficha de la app, desde donde el permiso queda a un par de toques.
      try {
        startActivity(Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse("package:$packageName"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (e2: Throwable) { Log.e(TAG, "Tampoco se pudo abrir la ficha", e2) }
    }
    cerrar()
  }

  /** Si llega otra alarma con esta pantalla abierta, se refresca en vez de apilarse. */
  override fun onNewIntent(nuevo: Intent?) {
    super.onNewIntent(nuevo)
    nuevo?.let {
      setIntent(it)
      setContentView(construirVista(
        it.getStringExtra(EXTRA_TITULO) ?: "¡Nuevo lead de campaña!",
        it.getStringExtra(EXTRA_CUERPO) ?: "Atiéndelo lo antes posible para no perder la oportunidad.",
        nombreLead = it.getStringExtra(EXTRA_NOMBRE),
        detalle = it.getStringExtra(EXTRA_DETALLE),
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

  /**
   * El cuadro, calcado del popup que la app ya muestra por dentro
   * (components/PopupLeadsCampania.tsx): tarjeta blanca, morado #7c3aed,
   * megáfono y los mismos dos botones.
   *
   * Se copia a propósito en vez de inventar otro diseño. La persona ya conoce
   * ese cuadro y sabe qué hacer con él; que el de fuera se vea distinto solo
   * haría dudar si es de Valera o de otra app. Los valores de color y tamaño
   * son los mismos del archivo de la app, para que no se despeguen.
   *
   * `detalle` es la línea de zona y presupuesto, en su recuadro lila.
   * `textoBoton` reemplaza los dos botones por uno solo: lo usa la pantalla de
   * permiso, donde no hay ningún lead que atender ni que posponer.
   */
  private fun construirVista(
    titulo: String,
    cuerpo: String,
    detalle: String? = null,
    nombreLead: String? = null,
    textoBoton: String? = null,
    alTocar: (() -> Unit)? = null,
  ): ViewGroup {
    val fondo = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#8C000000"))   // igual que el de dentro
      setPadding(dp(24f), dp(24f), dp(24f), dp(24f))
    }

    val tarjeta = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(20f).toFloat()
      }
      setPadding(dp(22f), dp(22f), dp(22f), dp(22f))
    }

    // Megáfono dentro del círculo lila.
    tarjeta.addView(TextView(this).apply {
      text = if (textoBoton != null) "🔒" else "📣"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#f3e8ff"))
        cornerRadius = dp(31f).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(dp(62f), dp(62f))
        .apply { bottomMargin = dp(10f) }
    })

    tarjeta.addView(TextView(this).apply {
      text = titulo
      setTextColor(Color.parseColor("#4c1d95"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 19f)
      gravity = Gravity.CENTER
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    })

    tarjeta.addView(TextView(this).apply {
      text = cuerpo
      setTextColor(Color.parseColor("#555555"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      gravity = Gravity.CENTER
      setPadding(0, dp(6f), 0, dp(12f))
    })

    if (!nombreLead.isNullOrBlank() || !detalle.isNullOrBlank()) {
      val caja = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply {
          setColor(Color.parseColor("#faf5ff"))
          cornerRadius = dp(12f).toFloat()
        }
        setPadding(dp(12f), dp(12f), dp(12f), dp(12f))
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(16f) }
      }
      if (!nombreLead.isNullOrBlank()) caja.addView(TextView(this).apply {
        text = "• $nombreLead"
        setTextColor(Color.parseColor("#3b0764"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        typeface = android.graphics.Typeface.DEFAULT_BOLD
      })
      if (!detalle.isNullOrBlank()) caja.addView(TextView(this).apply {
        text = detalle
        setTextColor(Color.parseColor("#7c3aed"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        setPadding(0, dp(3f), 0, 0)
      })
      tarjeta.addView(caja)
    }

    if (textoBoton != null) {
      tarjeta.addView(botonMorado(textoBoton) { alTocar?.invoke() })
      tarjeta.addView(botonTexto("Ahora no") { cerrar() })
    } else {
      tarjeta.addView(botonMorado("📋  Atender ahora") { abrir(ENLACE_LEADS) })
      tarjeta.addView(botonTexto("Posponer 1 hora") { abrir(ENLACE_POSPONER) })
    }

    fondo.addView(tarjeta, LinearLayout.LayoutParams(
      Math.min(dp(380f), resources.displayMetrics.widthPixels - dp(48f)),
      LinearLayout.LayoutParams.WRAP_CONTENT))
    return fondo
  }

  /** El botón principal, morado. Mismo color y medidas que el de la app. */
  private fun botonMorado(texto: String, alTocar: () -> Unit) =
    Button(this).apply {
      text = texto
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      isAllCaps = false
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#7c3aed"))
        cornerRadius = dp(12f).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(48f)
      ).apply { topMargin = dp(2f) }
      setOnClickListener { alTocar() }
    }

  /** El secundario: solo texto gris, sin fondo, como el "Después" de la app. */
  private fun botonTexto(texto: String, alTocar: () -> Unit) =
    Button(this).apply {
      text = texto
      setTextColor(Color.parseColor("#888888"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      isAllCaps = false
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      background = null
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(42f)
      ).apply { topMargin = dp(4f) }
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
        // Se arma a mano en vez de con MediaPlayer.create(). create() devuelve
        // el reproductor YA preparado, y setAudioAttributes() después de
        // prepare() lanza IllegalStateException: el orden correcto es
        // atributos → fuente → prepare → start. Los atributos no son opcionales,
        // son los que hacen que suene como alarma aunque el timbre esté bajo.
        reproductor = MediaPlayer().apply {
          setAudioAttributes(AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build())
          resources.openRawResourceFd(id).use { fd ->
            setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
          }
          isLooping = true
          prepare()
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

  /**
   * Se calla y se cierra cuando la pantalla deja de verse: si el usuario se va
   * al inicio o abre otra app, la alarma no puede seguir sonando a ciegas.
   *
   * Va en onStop y NO en onPause a propósito. onPause también se dispara por
   * cosas que no ocultan la pantalla —desbloquear el teléfono con la alarma
   * encima del bloqueo es la típica—, y ahí el sonido se cortaría justo en el
   * momento en que la persona está a punto de leerla.
   */
  override fun onStop() {
    super.onStop()
    cerrar()
  }

  override fun onDestroy() {
    super.onDestroy()
    callar()
    cronometro.removeCallbacks(cerrarSolo)
  }
}
