import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Envía un push real a Expo para un usuario específico. Hasta ahora la app
// solo registraba push_token en profiles pero nunca lo usaba — esta función
// es la primera que de verdad llama a la API de push de Expo, y está hecha
// genérica (userId + titulo + mensaje) para poder reusarse en otros avisos
// futuros, no solo en el registro con constructora.

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

    const { userId, titulo, mensaje } = await req.json()
    if (!userId || !titulo || !mensaje) {
      return json({ error: 'userId, titulo y mensaje son requeridos' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle()

    if (!perfil?.push_token) {
      return json({ ok: false, motivo: 'sin_push_token' })
    }

    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: perfil.push_token,
        title: titulo,
        body: mensaje,
        sound: 'default',
      }),
    })
    const result = await resp.json()
    return json({ ok: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
