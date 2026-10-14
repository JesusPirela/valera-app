/**
 * El ajuste extra que pide el fabricante, si es que pide alguno.
 *
 * Varias marcas chinas añaden sus propios candados encima de Android: apagan
 * de fábrica un permiso que el sistema sí concede, y sin él la app no puede
 * mostrar nada con la pantalla cerrada. Cada una lo llama distinto y lo
 * entierra en otro menú, así que hay que nombrarlo tal cual aparece o no se
 * encuentra.
 *
 * Vive aquí y no dentro de una pantalla porque lo piden dos: el panel de lo
 * pendiente y la configuración de la alarma en el perfil. Si cada una llevara
 * su copia, se arreglaría el texto en una y la otra seguiría mandando a la
 * gente a un menú que no existe.
 */
import { Platform } from 'react-native'

/** La marca del teléfono, en minúsculas. Vacío en web. */
export const marcaDelTelefono: string = Platform.OS !== 'android' ? '' : String(
  (Platform.constants as any)?.Manufacturer ?? (Platform.constants as any)?.Brand ?? '',
).toLowerCase()

/** True si la marca es de las que apagan permisos por su cuenta. */
export const marcaConCandados: boolean =
  /xiaomi|redmi|poco|huawei|honor|oppo|realme|oneplus|vivo/.test(marcaDelTelefono)

/**
 * Las instrucciones exactas de esta marca, o null si no tiene candado extra.
 *
 * Se calcula una sola vez: el fabricante no cambia mientras corre la app.
 */
export const notaDelFabricante: string | null = (() => {
  if (Platform.OS !== 'android') return null
  const marca = marcaDelTelefono

  if (/xiaomi|redmi|poco/.test(marca)) {
    return 'En tu Xiaomi activa además: Ajustes › Aplicaciones › Valera › Permisos › ' +
           'Otros permisos › “Mostrar ventanas emergentes mientras se ejecuta en segundo ' +
           'plano”, y el Inicio automático.'
  }
  if (/huawei|honor/.test(marca)) {
    return 'En tu Huawei activa además: Ajustes › Aplicaciones › Valera › Inicio de aplicación › ' +
           'gestionar manualmente, con “Inicio automático” y “Ejecutar en segundo plano” encendidos.'
  }
  if (/oppo|realme|oneplus/.test(marca)) {
    return 'En tu teléfono activa además: Ajustes › Aplicaciones › Valera › Inicio automático, ' +
           'y en Batería elige “No restringir”.'
  }
  if (/vivo/.test(marca)) {
    return 'En tu vivo activa además: Ajustes › Batería › Consumo en segundo plano › Valera, ' +
           'y permite el inicio automático.'
  }
  // Samsung, Motorola, Google y el resto no tienen candado extra: no se les
  // dice nada en vez de darles instrucciones de un menú que no existe.
  return null
})()
