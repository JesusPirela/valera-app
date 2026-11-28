import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ROLES_VALIDOS = ['nuevo', 'prospectador', 'prospectador_plus', 'supervisor', 'asesor', 'gerente']
// Los roles de una inmobiliaria ALIADA. No son del equipo: la cuenta vive
// colgada de una inmobiliaria y ve otra app. Por eso exigen decir CUAL: un
// aliado sin inmobiliaria seria alguien de fuera suelto en nuestro sistema.
const ROLES_ALIADO = ['aliado_admin', 'aliado_agente']

// Solo estos roles generan notificación de ascenso dentro de la app.
const ROLES_CON_NOTIF_ASCENSO = ['prospectador', 'prospectador_plus']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') return json({ error: 'Acceso denegado' }, 403)

    const { userId, role, inmobiliariaId } = await req.json()
    if (!userId) return json({ error: 'userId es requerido' }, 400)
    const esAliado = ROLES_ALIADO.includes(role)
    if (!ROLES_VALIDOS.includes(role) && !esAliado) return json({ error: 'Rol inválido' }, 400)
    if (esAliado && !inmobiliariaId) {
      return json({ error: 'Falta decir de qué inmobiliaria es esta cuenta.' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Obtener rol anterior para saber si es realmente un ascenso
    const { data: perfilActual } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    // La pertenencia va JUNTO con el rol, en la misma escritura: un aliado
    // siempre tiene inmobiliaria, y al devolver a alguien al equipo se le
    // quita (si no, se quedaria viendo solo a la agencia de la que salio).
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role, inmobiliaria_id: esAliado ? inmobiliariaId : null })
      .eq('id', userId)

    if (updateError) return json({ error: updateError.message }, 500)

    // Una inmobiliaria con cuentas colgando pasa a ser "aliada": es lo que la
    // distingue de las otras 19, que solo son el nombre que sale en una propiedad.
    if (esAliado) {
      await supabaseAdmin.from('inmobiliarias').update({ es_aliada: true }).eq('id', inmobiliariaId)
    }

    // Notificación de ascenso solo si el rol nuevo es un ascenso real
    if (
      ROLES_CON_NOTIF_ASCENSO.includes(role) &&
      perfilActual?.role !== role
    ) {
      const esPlus = role === 'prospectador_plus'
      const titulo = esPlus
        ? '🚀 ¡Ascendiste a Prospectador Plus!'
        : '🎉 ¡Ascendiste a Prospectador!'

      // El mensaje lleva el nuevo rol como dato para que el modal lo use
      await supabaseAdmin.from('notificaciones').insert({
        user_id: userId,
        titulo,
        mensaje: role,  // 'prospectador' | 'prospectador_plus'
        tipo: 'ascenso_rol',
        leida: false,
      })
    }

    return json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
