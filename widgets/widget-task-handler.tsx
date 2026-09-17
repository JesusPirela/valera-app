// Handler headless invocado por Android cada vez que el widget "Mi Día" se
// agrega, se pide refrescar, se redimensiona o se toca. Corre en un contexto
// SIN interfaz (registrado como HeadlessTask en index.ts) — no hay pantallas
// montadas ni contexto de React de la app, solo el bundle de JS.
import React from 'react'
import type { WidgetTaskHandler, WidgetTaskHandlerProps } from 'react-native-android-widget'
import { obtenerDatosWidget } from './datos'
import { MiDiaWidget, WIDGET_NAME } from './MiDiaWidget'

export const widgetTaskHandler: WidgetTaskHandler = async (props: WidgetTaskHandlerProps) => {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      // Si falla la consulta (sin red, sin sesión, lo que sea), se muestra el
      // estado "abre la app" en vez de dejar el widget en blanco o tronar la
      // tarea — un widget que nunca puede quedar roto es más importante que
      // uno que siempre tenga el dato más fresco.
      const datos = await obtenerDatosWidget().catch(() => null)
      if (!datos) {
        props.renderWidget(<MiDiaWidget sinSesion />)
      } else {
        props.renderWidget(<MiDiaWidget {...datos} />)
      }
      break
    }
    default:
      break
  }
}
