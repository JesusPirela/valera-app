import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ── Quién es el usuario, SIN pegarle a la red ────────────────────────────────
//
// `supabase.auth.getUser()` NO lee la sesión local: hace un GET /auth/v1/user
// al servidor, y lo hace DENTRO del lock de auth (que serializa todas las
// operaciones de auth). En la app hay decenas de llamadas así, y al volver de
// tener la app un rato en segundo plano varias pantallas se recargan a la vez:
// cada getUser() se forma en la fila y bloquea a las demás mientras dura su
// viaje de red. Con la red lenta o el socket muerto tras el idle, eso deja los
// botones de guardar "muertos" durante minutos, justo el síntoma de "vuelvo,
// le doy guardar y no hace nada hasta que recargo".
//
// `getSession()` lee del almacenamiento local (y solo va a la red si el token
// ya venció, para refrescarlo). El id del usuario ya viene dentro de la sesión,
// así que no hay ninguna razón para preguntarle al servidor quiénes somos.
//
// Devuelve la MISMA forma que getUser() para poder sustituirlo tal cual:
//     const { data: { user } } = await getUsuarioActual()
export async function getUsuarioActual(): Promise<{
  data: { user: User | null }
  error: null
}> {
  try {
    const { data } = await supabase.auth.getSession()
    return { data: { user: data.session?.user ?? null }, error: null }
  } catch (e: any) {
    // El lock puede rendirse si otra operación de auth se está tardando. No es
    // fatal: la operación real termina igual, así que un reintento corto basta.
    if (String(e?.message ?? '').includes('auth lock timeout')) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const { data } = await supabase.auth.getSession()
        return { data: { user: data.session?.user ?? null }, error: null }
      } catch { /* se cae al return de abajo */ }
    }
    return { data: { user: null }, error: null }
  }
}

// Atajo para cuando solo hace falta el id.
export async function getUserId(): Promise<string | null> {
  const { data } = await getUsuarioActual()
  return data.user?.id ?? null
}
