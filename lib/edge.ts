// Sacarle a una Edge Function el motivo DE VERDAD cuando falla.
//
// supabase-js, cuando una función devuelve 4xx o 5xx, pone en error.message un
// texto genérico: "Edge Function returned a non-2xx status code". El mensaje
// bueno —el que la función se molestó en escribir— viaja en el cuerpo de la
// respuesta, guardado en error.context, y hay que leerlo a mano.
//
// Sin esto, el usuario ve "⚠️ Edge Function returned a non-2xx status code" y
// no tiene forma de saber si le falta la descripción, si la colonia no existe
// en el catálogo o si la llave de la API caducó. Son problemas muy distintos y
// se veían todos igual.

/**
 * El mensaje de error real de una Edge Function.
 *
 * @param error  lo que devolvió supabase.functions.invoke
 * @param porOmision  qué decir si no se pudo sacar nada
 */
export async function mensajeDeEdge(error: any, porOmision = 'No se pudo completar la operación.'): Promise<string> {
  if (!error) return porOmision

  // El cuerpo de la respuesta: aquí viene lo bueno.
  try {
    const ctx = error?.context
    if (ctx) {
      // context es una Response; se puede leer una sola vez, así que se clona
      // por si alguien más la necesita después.
      const resp = typeof ctx.clone === 'function' ? ctx.clone() : ctx
      if (typeof resp.json === 'function') {
        const cuerpo = await resp.json()
        const msg = cuerpo?.error ?? cuerpo?.message ?? cuerpo?.msg
        if (msg) return String(msg)
      } else if (typeof resp.text === 'function') {
        const txt = await resp.text()
        if (txt) return txt.slice(0, 400)
      }
    }
  } catch { /* el cuerpo no era json, o ya se había leído */ }

  // Si no hubo cuerpo, al menos no enseñar el texto en inglés de la librería.
  const m = String(error?.message ?? '')
  if (!m || /non-2xx status code/i.test(m)) return porOmision
  return m
}
