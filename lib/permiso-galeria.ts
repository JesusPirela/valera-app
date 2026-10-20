// Pedir el permiso de la galería de forma que la gente entienda qué le están
// pidiendo y por qué.
//
// Antes se llamaba a requestPermissionsAsync() en seco, justo al picar
// "descargar". Android suelta su ventana de permisos sin contexto, mucha gente
// le da a "Permitir solo esta vez" o a "Seleccionar fotos", y a partir de ahí
// la app guarda en un rincón que la app de Galería no indexa. El sintoma que
// llega es "elijo las fotos y no se guardan en mi galería, pero sí aparecen en
// Facebook" — que es exactamente eso.
//
// Tres cosas que esto arregla:
//
//  1. Explica ANTES de pedir. Una ventana del sistema sin contexto se cierra
//     por reflejo; una con motivo se acepta.
//  2. Detecta el acceso LIMITADO. El sistema lo reporta como concedido, así
//     que el código viejo lo daba por bueno y la persona se quedaba sin
//     entender por qué no veía sus fotos.
//  3. Cuando ya no se puede volver a preguntar, lleva a los Ajustes en vez de
//     dejar un mensaje sin salida.
import { Alert, Linking, Platform } from 'react-native'
import * as MediaLibrary from 'expo-media-library'

/** Lo de "acceso limitado" se avisa una vez por sesión, no en cada descarga. */
let yaAvisadoDeLimitado = false

function preguntar(titulo: string, cuerpo: string, textoSi: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(titulo, cuerpo, [
      { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
      { text: textoSi, onPress: () => resolve(true) },
    ])
  })
}

/**
 * Deja la galería lista para guardar, o explica por qué no se puede.
 *
 * @param queSeGuarda  "las fotos" / "el video" — va dentro del texto, para que
 *                     el mensaje diga exactamente lo que la persona pidió.
 * @returns true si se puede guardar.
 */
export async function asegurarPermisoGaleria(queSeGuarda = 'las fotos'): Promise<boolean> {
  if (Platform.OS === 'web') return true

  let permiso = await MediaLibrary.getPermissionsAsync()

  // ── Primera vez: explicar antes de que salga la ventana del sistema ──────
  if (!permiso.granted && permiso.canAskAgain) {
    const quiere = await preguntar(
      'Permiso para guardar',
      `Para guardar ${queSeGuarda} en tu teléfono, la app necesita acceso a tus fotos.\n\n` +
      'En la siguiente ventana elige "Permitir todo". Si eliges "Seleccionar fotos", ' +
      'lo que guardes no va a aparecer en tu galería.',
      'Entendido',
    )
    if (!quiere) return false
    permiso = await MediaLibrary.requestPermissionsAsync()
  }

  // ── Dijo que no y ya no se puede volver a preguntar ──────────────────────
  if (!permiso.granted) {
    Alert.alert(
      'Falta el permiso',
      `Sin acceso a tus fotos no se puede guardar ${queSeGuarda}.\n\n` +
      'Actívalo en Ajustes › Valera › Fotos, y elige "Permitir todo".',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
      ],
    )
    return false
  }

  // ── Concedido, pero a medias ─────────────────────────────────────────────
  // El sistema lo reporta como concedido y guardar "funciona", pero el archivo
  // va a un sitio que la Galería no muestra. Se avisa y se deja seguir: la
  // persona se queda con sus fotos y además sabe cómo arreglarlo.
  if (permiso.accessPrivileges === 'limited' && !yaAvisadoDeLimitado) {
    yaAvisadoDeLimitado = true
    Alert.alert(
      'Tus fotos podrían no aparecer',
      'Diste acceso solo a algunas fotos. Lo que guardes puede no salir en tu galería ' +
      'aunque la app diga que se guardó.\n\n' +
      'Para que salgan: Ajustes › Valera › Fotos › "Permitir todo".',
      [
        { text: 'Seguir así', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
      ],
    )
  }

  return true
}
