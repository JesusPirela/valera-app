// El titular (aliado_admin) da de baja a uno de SUS agentes. Nunca a sí
// mismo ni a nadie de otra agencia — eso lo comprueba esta función, no la
// pantalla que la llama.
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

    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('role, inmobiliaria_id')
      .eq('id', user.id)
      .single()

    if (perfil?.role !== 'aliado_admin' || !perfil.inmobiliaria_id) {
      return json({ error: 'Solo el titular de una inmobiliaria aliada puede hacer esto.' }, 403)
    }

    const { userId } = await req.json()
    if (!userId) return json({ error: 'userId es requerido' }, 400)
    if (userId === user.id) return json({ error: 'No puedes eliminarte a ti mismo.' }, 400)

    const { data: objetivo } = await supabaseAdmin
      .from('profiles')
      .select('role, inmobiliaria_id')
      .eq('id', userId)
      .single()

    if (!objetivo || objetivo.inmobiliaria_id !== perfil.inmobiliaria_id) {
      return json({ error: 'Ese usuario no es de tu inmobiliaria.' }, 403)
    }
    if (objetivo.role === 'aliado_admin') {
      return json({ error: 'No se puede eliminar a otro titular desde aquí.' }, 400)
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) return json({ error: deleteError.message }, 500)

    return json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
