package com.valerarealestate.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Dibuja el cuadro de alarma. Nada más: ni ventanas, ni sonido, ni pantallas.
 *
 * Vive aparte porque el mismo cuadro se usa de dos formas muy distintas:
 *   · como ventana superpuesta encima de otras apps (el caso real), y
 *   · dentro de una pantalla propia, para el botón de prueba de "Mi día".
 *
 * Teniéndolo en un solo sitio, el de fuera y el de dentro no se despegan.
 */
object CuadroVista {

  private fun dp(c: Context, v: Float): Int = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP, v, c.resources.displayMetrics).toInt()

  /**
   * @param textoBoton  reemplaza los dos botones por uno solo (pantalla de permiso).
   * @param alPrincipal qué hacer con el botón grande.
   * @param alSecundario qué hacer con el de abajo.
   */
  fun construir(
    c: Context,
    titulo: String,
    cuerpo: String,
    nombreLead: String? = null,
    detalle: String? = null,
    textoBoton: String? = null,
    alPrincipal: () -> Unit,
    alSecundario: () -> Unit,
  ): ViewGroup {

    val fondo = LinearLayout(c).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      // Casi opaco: esto interrumpe, no acompaña.
      setBackgroundColor(Color.parseColor("#E0140000"))
      setPadding(dp(c, 24f), dp(c, 24f), dp(c, 24f), dp(c, 24f))
    }

    val tarjeta = LinearLayout(c).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#1A0505"))
        cornerRadius = dp(c, 20f).toFloat()
        setStroke(dp(c, 3f), Color.parseColor("#FF2222"))
      }
      setPadding(dp(c, 22f), dp(c, 24f), dp(c, 22f), dp(c, 22f))
    }

    tarjeta.addView(TextView(c).apply {
      text = if (textoBoton != null) "🔒" else "🔔"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#D11A1A"))
        cornerRadius = dp(c, 34f).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(dp(c, 68f), dp(c, 68f))
        .apply { bottomMargin = dp(c, 12f) }
    })

    tarjeta.addView(TextView(c).apply {
      text = titulo.uppercase()
      setTextColor(Color.parseColor("#FF4D4D"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 21f)
      gravity = Gravity.CENTER
      letterSpacing = 0.02f
      typeface = Typeface.DEFAULT_BOLD
    })

    tarjeta.addView(TextView(c).apply {
      text = cuerpo
      setTextColor(Color.parseColor("#E8C4C4"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
      setPadding(0, dp(c, 6f), 0, dp(c, 12f))
    })

    if (!nombreLead.isNullOrBlank() || !detalle.isNullOrBlank()) {
      val caja = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply {
          setColor(Color.parseColor("#2E0A0A"))
          cornerRadius = dp(c, 12f).toFloat()
          setStroke(dp(c, 1f), Color.parseColor("#7A1F1F"))
        }
        setPadding(dp(c, 12f), dp(c, 12f), dp(c, 12f), dp(c, 12f))
        layoutParams = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(c, 16f) }
      }
      if (!nombreLead.isNullOrBlank()) caja.addView(TextView(c).apply {
        text = "• $nombreLead"
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        typeface = Typeface.DEFAULT_BOLD
      })
      if (!detalle.isNullOrBlank()) caja.addView(TextView(c).apply {
        text = detalle
        setTextColor(Color.parseColor("#FF8A8A"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
        setPadding(0, dp(c, 3f), 0, 0)
      })
      tarjeta.addView(caja)
    }

    tarjeta.addView(botonRojo(c, textoBoton ?: "📋  Atender ahora", alPrincipal))
    tarjeta.addView(botonTexto(c, if (textoBoton != null) "Ahora no" else "Posponer 1 hora", alSecundario))

    fondo.addView(tarjeta, LinearLayout.LayoutParams(
      minOf(dp(c, 380f), c.resources.displayMetrics.widthPixels - dp(c, 48f)),
      LinearLayout.LayoutParams.WRAP_CONTENT))
    return fondo
  }

  /** El botón principal: rojo encendido, alto, imposible de no ver. */
  private fun botonRojo(c: Context, texto: String, alTocar: () -> Unit): View =
    Button(c).apply {
      text = texto
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      isAllCaps = false
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#E01B1B"))
        cornerRadius = dp(c, 12f).toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(c, 54f)
      ).apply { topMargin = dp(c, 4f) }
      setOnClickListener { alTocar() }
    }

  /** El secundario: solo texto, sin fondo. */
  private fun botonTexto(c: Context, texto: String, alTocar: () -> Unit): View =
    Button(c).apply {
      text = texto
      setTextColor(Color.parseColor("#C98A8A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
      isAllCaps = false
      typeface = Typeface.DEFAULT_BOLD
      background = null
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(c, 42f)
      ).apply { topMargin = dp(c, 4f) }
      setOnClickListener { alTocar() }
    }
}
