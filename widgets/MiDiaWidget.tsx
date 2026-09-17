// Widget de pantalla de inicio (Android) "Mi Día": publicaciones de hoy contra
// la meta de 20, seguimientos pendientes y la racha — el mismo resumen que ya
// existe en app/(prospectador)/mi-dia.tsx, pero visible sin abrir la app.
//
// Se construye con los componentes de react-native-android-widget (NO son
// componentes de React Native normales: se convierten a RemoteViews nativas de
// Android, así que solo soportan el subconjunto de estilos que documenta la
// librería — nada de flexbox completo ni imágenes remotas sin declarar).
import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'

const BG = '#0d1b2a'
const GOLD = '#c9a84c'
const TEXT = '#e8f0f4'
const SUB = '#9fb3c0'

export type DatosWidgetMiDia = {
  publicacionesHoy: number
  metaPublicaciones: number
  seguimientosHoy: number
  racha: number
}

// Deep link al que abre el widget al tocarlo — mismo scheme que app.json
// ("valera-app"). El grupo de rutas (prospectador) no forma parte de la URL.
export const WIDGET_DEEP_LINK = 'valera-app://mi-dia'
export const WIDGET_NAME = 'MiDia'

export function MiDiaWidget(props: Partial<DatosWidgetMiDia> & { sinSesion?: boolean }) {
  if (props.sinSesion) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent', width: 'match_parent',
          backgroundColor: BG, borderRadius: 16,
          paddingLeft: 14, paddingTop: 12, paddingRight: 14, paddingBottom: 12,
          justifyContent: 'center', alignItems: 'center',
        }}
      >
        <TextWidget
          text="Abre Valera para ver tu día"
          style={{ fontSize: 12, color: SUB, textAlign: 'center' }}
        />
      </FlexWidget>
    )
  }

  const publicacionesHoy = props.publicacionesHoy ?? 0
  const metaPublicaciones = props.metaPublicaciones ?? 20
  const seguimientosHoy = props.seguimientosHoy ?? 0
  const racha = props.racha ?? 0

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_DEEP_LINK }}
      style={{
        height: 'match_parent', width: 'match_parent',
        backgroundColor: BG, borderRadius: 16,
        paddingLeft: 14, paddingTop: 12, paddingRight: 14, paddingBottom: 10,
        flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      {/* Encabezado: marca + racha */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="VALERA · MI DÍA" style={{ fontSize: 10, fontWeight: 'bold', color: GOLD, letterSpacing: 1 }} />
        {racha > 0 && (
          <TextWidget text={`🔥 ${racha}`} style={{ fontSize: 12, fontWeight: 'bold', color: TEXT }} />
        )}
      </FlexWidget>

      {/* Número principal: publicaciones de hoy / meta */}
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <TextWidget
          text={`${publicacionesHoy}/${metaPublicaciones}`}
          style={{ fontSize: 30, fontWeight: 'bold', color: publicacionesHoy >= metaPublicaciones ? '#4ade80' : TEXT }}
        />
        <TextWidget text="publicaciones hoy" style={{ fontSize: 11, color: SUB }} />
      </FlexWidget>

      {/* Seguimientos pendientes */}
      <TextWidget
        text={`📞 ${seguimientosHoy} seguimiento${seguimientosHoy === 1 ? '' : 's'} hoy`}
        style={{ fontSize: 11, color: TEXT }}
      />
    </FlexWidget>
  )
}
