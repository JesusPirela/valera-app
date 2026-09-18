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
const CARD_SUB = '#12283b'
const GOLD = '#c9a84c'
const GREEN = '#4ade80'
const TEXT = '#e8f0f4'
const SUB = '#9fb3c0'
const TRACK = '#1e3448'

export type DatosWidgetMiDia = {
  publicacionesHoy: number
  metaPublicaciones: number
  seguimientosHoy: number
  racha: number
  misionesHoy: number
  metaMisiones: number
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
          backgroundColor: BG, borderRadius: 18,
          paddingLeft: 16, paddingTop: 14, paddingRight: 16, paddingBottom: 14,
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
  const misionesHoy = props.misionesHoy ?? 0
  const metaMisiones = props.metaMisiones ?? 1
  const misionesCumplidas = misionesHoy >= metaMisiones

  const cumplida = publicacionesHoy >= metaPublicaciones
  const colorNumero = cumplida ? GREEN : TEXT
  // Fracción de la barra de progreso: mínimo 4% visible (una barra en 0 se
  // sentía "vacía", como si el widget estuviera roto) hasta 100%.
  const pct = Math.max(0.04, Math.min(1, publicacionesHoy / Math.max(metaPublicaciones, 1)))

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_DEEP_LINK }}
      style={{
        height: 'match_parent', width: 'match_parent',
        backgroundColor: BG, borderRadius: 18,
        paddingLeft: 16, paddingTop: 14, paddingRight: 16, paddingBottom: 14,
        flexDirection: 'column', justifyContent: 'flex-start',
      }}
    >
      {/* Encabezado: marca + racha */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="VALERA · MI DÍA" style={{ fontSize: 10, fontWeight: 'bold', color: GOLD, letterSpacing: 1 }} />
        {racha > 0 && (
          <FlexWidget style={{
            backgroundColor: CARD_SUB, borderRadius: 10,
            paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
          }}>
            <TextWidget text={`🔥 ${racha}`} style={{ fontSize: 11, fontWeight: 'bold', color: TEXT }} />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* Número principal: publicaciones de hoy / meta */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <TextWidget text="📤" style={{ fontSize: 22 }} />
        <FlexWidget style={{ flexDirection: 'column', marginLeft: 8 }}>
          <TextWidget text={`${publicacionesHoy}/${metaPublicaciones}`} style={{ fontSize: 26, fontWeight: 'bold', color: colorNumero }} />
          <TextWidget text={cumplida ? '¡meta cumplida hoy! 🎉' : 'publicaciones hoy'} style={{ fontSize: 11, color: cumplida ? GREEN : SUB }} />
        </FlexWidget>
      </FlexWidget>

      {/* Barra de progreso — dos segmentos con flex proporcional al avance. */}
      <FlexWidget style={{
        flexDirection: 'row', width: 'match_parent', height: 7,
        borderRadius: 4, overflow: 'hidden', backgroundColor: TRACK,
        marginTop: 10,
      }}>
        <FlexWidget style={{ flex: pct, height: 7, backgroundColor: cumplida ? GREEN : GOLD }} />
        <FlexWidget style={{ flex: 1 - pct, height: 7 }} />
      </FlexWidget>

      {/* Seguimientos pendientes + misiones del día, lado a lado para no
          alargar demasiado el widget. */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, width: 'match_parent' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text="⏰" style={{ fontSize: 13 }} />
          <TextWidget
            text={`${seguimientosHoy} seguimiento${seguimientosHoy === 1 ? '' : 's'}`}
            style={{ fontSize: 12, color: TEXT, marginLeft: 6 }}
          />
        </FlexWidget>
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text={misionesCumplidas ? '✅' : '⚡'} style={{ fontSize: 13 }} />
          <TextWidget
            text={`${misionesHoy}/${metaMisiones} misiones`}
            style={{ fontSize: 12, color: misionesCumplidas ? GREEN : TEXT, marginLeft: 6 }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
