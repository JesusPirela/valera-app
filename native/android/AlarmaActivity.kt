package com.valerarealestate.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.util.Log

/**
 * La pantalla del botón "Probar el cuadro de alarma" de Mi día.
 *
 * Ya NO dibuja el cuadro de los avisos: de eso se encarga CuadroOverlay como
 * ventana superpuesta. El motivo es una regla de Android 15 en adelante: una
 * app no puede abrir pantallas desde segundo plano solo por tener el permiso de
 * superposición, necesita además una ventana superpuesta ya visible. Por eso el
 * diseño anterior —abrir esta Activity desde el servicio del push— fallaba en
 * silencio aunque el permiso estuviera concedido.
 *
 * Lo que hace esta pantalla ahora es poner a prueba el camino REAL:
 *   · Si falta el permiso, lo nombra exacto y lleva a su interruptor.
 *   · Si lo hay, programa el cuadro para dentro de unos segundos y manda a la
 *     pantalla de inicio. Así se comprueba con la app en segundo plano, que es
 *     donde fallaba, sin depender de que entre un lead de verdad.
 */
class AlarmaActivity : Activity() {

  companion object {
    private const val TAG = "ValeraAlarma"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (!CuadroOverlay.hayPermiso(this)) {
      // Se nombra el interruptor EXACTO. Decir "falta un permiso" a secas
      // obliga a adivinar entre una lista larga, y la gente lo abandona ahí.
      setContentView(CuadroVista.construir(
        this,
        "Falta activar un permiso",
        "Para que el aviso salga encima de WhatsApp o de cualquier otra app, " +
        "Android pide tu autorización. Toca el botón y activa el interruptor que dice:",
        nombreLead = "Mostrar sobre otras apps",
        detalle = "En Xiaomi se llama “Mostrar ventanas emergentes mientras se ejecuta en segundo plano”",
        textoBoton = "Llévame ahí",
        alPrincipal = { abrirAjustesDePermiso() },
        alSecundario = { finish() },
      ))
      return
    }

    setContentView(CuadroVista.construir(
      this,
      "Sal de la app ahora",
      "El cuadro va a salir solo en 8 segundos, encima de lo que estés usando. " +
      "Te mando a la pantalla de inicio al tocar el botón.",
      nombreLead = "Último aviso recibido",
      detalle = ultimoDiagnostico(),
      textoBoton = "Empezar la prueba",
      alPrincipal = { lanzarPrueba() },
      alSecundario = { finish() },
    ))
  }

  private fun lanzarPrueba() {
    try {
      startService(Intent(this, ProbarFueraService::class.java))
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo programar la prueba", e)
    }
    // Se manda a la pantalla de inicio sin pedirlo: la prueba solo vale si la
    // app queda en segundo plano, y dejarlo a la memoria de la persona es la
    // forma más fácil de sacar una conclusión equivocada.
    try {
      startActivity(Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      })
    } catch (e: Throwable) { Log.w(TAG, "No se pudo ir al inicio", e) }
    finish()
  }

  /**
   * Abre los ajustes del permiso YA POSICIONADOS en Valera.
   *
   * Sin el "package:" se abre la lista de todas las apps del teléfono y hay que
   * buscar Valera entre decenas; con él, se abre su interruptor directo.
   */
  private fun abrirAjustesDePermiso() {
    try {
      startActivity(Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:$packageName"),
      ))
    } catch (e: Throwable) {
      Log.e(TAG, "No se pudo abrir los ajustes del permiso", e)
      // Algunos fabricantes no aceptan el package: en esa acción. Se cae a la
      // ficha de la app, desde donde el permiso queda a un par de toques.
      try {
        startActivity(Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse("package:$packageName"),
        ))
      } catch (e2: Throwable) { Log.e(TAG, "Tampoco se pudo abrir la ficha", e2) }
    }
    finish()
  }

  /**
   * Qué pasó con el último aviso que llegó al servicio.
   *
   * Es lo que faltaba para poder depurar esto a distancia: si el cuadro no
   * sale, aquí queda escrito si el aviso llegó siquiera, si traía la bandera,
   * si el permiso estaba y con qué error falló.
   */
  private fun ultimoDiagnostico(): String = try {
    val p = getSharedPreferences(ValeraMessagingService.PREFS, MODE_PRIVATE)
    val cuando = p.getLong("cuando", 0L)
    if (cuando == 0L) {
      "Todavía no ha llegado ningún aviso"
    } else {
      val mins = ((System.currentTimeMillis() - cuando) / 60000L).toInt()
      val hace = when {
        mins < 1    -> "hace menos de un minuto"
        mins < 60   -> "hace $mins min"
        mins < 1440 -> "hace " + (mins / 60) + " h"
        else        -> "hace " + (mins / 1440) + " días"
      }
      "$hace · pedía cuadro: " + (if (p.getBoolean("bandera", false)) "sí" else "NO") +
      " · permiso: " + (if (p.getBoolean("permiso", false)) "sí" else "NO") +
      " · " + (p.getString("desenlace", "?") ?: "?")
    }
  } catch (e: Throwable) {
    "No se pudo leer el diagnóstico"
  }
}
