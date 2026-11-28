// El titular de una inmobiliaria aliada (aliado_admin) invita a su propia
// gente, sin pasar por un admin de Valera. La cuenta nueva SIEMPRE nace
// aliado_agente y SIEMPRE de la misma inmobiliaria que el titular que la
// crea — nunca se le puede poner otra agencia ni dejarla como equipo Valera.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Solo el titular de una agencia aliada puede invitar, y solo a SU agencia.
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('role, inmobiliaria_id')
      .eq('id', user.id)
      .single()

    if (perfil?.role !== 'aliado_admin' || !perfil.inmobiliaria_id) {
      return json({ error: 'Solo el titular de una inmobiliaria aliada puede invitar.' }, 403)
    }

    const { email, password, nombre } = await req.json()
    if (!email || !password) return json({ error: 'Email y contraseña son requeridos' }, 400)
    if (!nombre?.trim()) return json({ error: 'El nombre es requerido' }, 400)
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)

    // El cupo lo decide un admin (inmobiliarias.limite_usuarios); se cuenta
    // a TODOS los que ya cuelgan de esa agencia, titular incluido.
    const [{ data: inmob }, { count: yaHay }] = await Promise.all([
      supabaseAdmin.from('inmobiliarias').select('limite_usuarios').eq('id', perfil.inmobiliaria_id).single(),
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('inmobiliaria_id', perfil.inmobiliaria_id),
    ])
    const limite = inmob?.limite_usuarios ?? 3
    if ((yaHay ?? 0) >= limite) {
      return json({ error: `Ya alcanzaste el límite de ${limite} cuenta${limite === 1 ? '' : 's'} de tu plan.` }, 400)
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      const msg = createError.message.includes('already registered')
        ? 'Ya existe un usuario con ese email.'
        : createError.message
      return json({ error: msg }, 400)
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user!.id,
        role: 'aliado_agente',
        nombre: nombre.trim(),
        inmobiliaria_id: perfil.inmobiliaria_id,
      })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user!.id)
      return json({ error: 'Error al crear el perfil del usuario.' }, 500)
    }

    return json({ success: true, id: newUser.user!.id, email: newUser.user!.email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
