import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-make-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mismo algoritmo que buscar-propiedades: WaId de WhatsApp (521XXXXXXXXXX) a
// 12 dígitos (52XXXXXXXXXX), formato guardado en chatbot_leads.
function normalizarWaId(waId: string): string {
  let phone = waId.replace(/\D/g, '')
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

// "$2,500,000" -> "$2.5 mdp" / "$950,000" -> "$950 mil" / resto -> "$X,XXX".
function formatearPrecioCorto(precio: number): string {
  if (precio >= 1_000_000) {
    const mdp = (precio / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `$${mdp} mdp`
  }
  if (precio >= 1_000) {
    return `$${Math.round(precio / 1_000)} mil`
  }
  return `$${precio.toLocaleString('es-MX')}`
}

// Resuelve telefono_cliente → el asesor DUEÑO del lead (mismo algoritmo que
// resolverAsesorDueno en buscar-propiedades). Devuelve null si cualquier paso
// falla — el ?t= se omite en ese caso, no se cae a un asesor default.
// deno-lint-ignore no-explicit-any
async function resolverWhatsappDueno(supabase: any, telefonoCliente: string): Promise<string | null> {
  try {
    const telefonoNorm = normalizarWaId(telefonoCliente)
    if (telefonoNorm.length !== 12) return null

    const { data: lead } = await supabase
      .from('chatbot_leads')
      .select('prospectador_id')
      .eq('telefono', telefonoNorm)
      .maybeSingle()
    if (!lead?.prospectador_id) return null

    const { data: authUser } = await supabase.auth.admin.getUserById(lead.prospectador_id)
    const email = authUser?.user?.email
    if (!email) return null

    const { data: asesor } = await supabase
      .from('prospectadores')
      .select('whatsapp')
      .eq('email', email)
      .maybeSingle()

    return asesor?.whatsapp ?? null
  } catch (e) {
    console.error('[propiedades-campana] error resolviendo dueño del lead:', e)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ error: 'No autorizado' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const telefono = String(body.telefono ?? '').trim()
    const zona = body.zona ? String(body.zona).trim() : null
    const presupuesto = body.presupuesto != null ? Number(body.presupuesto) : null
    const tipoOperacion = body.tipo_operacion ? String(body.tipo_operacion).trim().toLowerCase() : null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: props, error } = await supabase.rpc('propiedades_campana_buscar', {
      p_zona: zona,
      p_operacion: tipoOperacion,
      p_tipo: null,
      p_presupuesto: Number.isFinite(presupuesto) ? presupuesto : null,
    })

    if (error) {
      console.error('[propiedades-campana] query error:', error)
      return json({ error: 'Error al consultar propiedades' }, 500)
    }

    if (!props || props.length < 3) {
      return json({ ok: false, motivo: 'menos_de_3' })
    }

    const asesorWhatsapp = await resolverWhatsappDueno(supabase, telefono)

    const propiedades = props.map((p: { codigo: string; titulo: string; precio: number; foto_path: string }) => ({
      foto_path: p.foto_path,
      nombre: p.titulo.slice(0, 40),
      precio: formatearPrecioCorto(p.precio),
      ficha_path: asesorWhatsapp
        ? `/ficha/${p.codigo}?t=${encodeURIComponent(asesorWhatsapp)}`
        : `/ficha/${p.codigo}`,
    }))

    return json({ ok: true, propiedades })
  } catch (err) {
    console.error('[propiedades-campana] error inesperado:', err)
    return json({ error: 'Error interno' }, 500)
  }
})
