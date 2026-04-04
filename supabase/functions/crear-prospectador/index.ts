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
    // 1. Verificar que el llamante esté autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    // 2. Verificar que el llamante sea admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') return json({ error: 'Acceso denegado' }, 403)

    // 3. Validar body
    const { email, password } = await req.json()
    if (!email || !password) return json({ error: 'Email y contraseña son requeridos' }, 400)
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)

    // 4. Crear usuario con service_role (puede crear usuarios sin confirmación de email)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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

    // 5. Crear perfil con rol prospectador
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: newUser.user!.id, role: 'prospectador' })

    if (profileError) {
      // Revertir: borrar el usuario recién creado
      await supabaseAdmin.auth.admin.deleteUser(newUser.user!.id)
      return json({ error: 'Error al crear el perfil del usuario.' }, 500)
    }

    return json({ success: true, id: newUser.user!.id, email: newUser.user!.email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
