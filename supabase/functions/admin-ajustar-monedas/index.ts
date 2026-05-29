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

    // Verificar que el que llama es admin
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

    const { targetUserId, cantidad, concepto } = await req.json()
    if (!targetUserId) return json({ error: 'targetUserId es requerido' }, 400)
    if (typeof cantidad !== 'number' || cantidad === 0) return json({ error: 'cantidad inválida' }, 400)
    if (!concepto?.trim()) return json({ error: 'concepto es requerido' }, 400)

    // Usar service role para operar sin restricciones de RLS
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Obtener saldo actual
    const { data: stats } = await admin
      .from('user_stats')
      .select('valera_coins')
      .eq('id', targetUserId)
      .maybeSingle()

    const saldoActual = stats?.valera_coins ?? 0

    // Validar que no quede negativo
    if (cantidad < 0 && saldoActual + cantidad < 0) {
      return json({ error: `Saldo insuficiente. Tiene ${saldoActual} coins.` }, 400)
    }

    const nuevoSaldo = Math.max(0, saldoActual + cantidad)

    // Upsert user_stats
    const { error: statsError } = await admin
      .from('user_stats')
      .upsert({ id: targetUserId, valera_coins: nuevoSaldo }, { onConflict: 'id' })

    if (statsError) return json({ error: statsError.message }, 500)

    // Registrar transacción
    const { error: txError } = await admin
      .from('coin_transactions')
      .insert({ user_id: targetUserId, cantidad, concepto: concepto.trim() })

    if (txError) return json({ error: txError.message }, 500)

    return json({ success: true, nuevoSaldo })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
