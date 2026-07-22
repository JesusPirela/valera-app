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

function formatearPrecio(valor: string | null): string {
  if (!valor) return 'a consultar'
  const num = Number(String(valor).replace(/\D/g, ''))
  return isNaN(num) ? valor : `$${num.toLocaleString('es-MX')}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Validar secreto compartido con Make
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ ok: false, error: 'No autorizado' }, 401)
    }

    // 2. Parsear payload form-urlencoded (mismo formato que buscar-propiedades)
    const rawText = await req.text()
    const params = new URLSearchParams(rawText)

    const emailAsesor    = params.get('email_asesor')?.trim()    ?? ''
    const telefonoCliente = params.get('telefono_cliente')?.trim() ?? ''
    const nombreCliente  = params.get('nombre_cliente')?.trim()  ?? 'Cliente'
    const tipo           = params.get('tipo')?.trim()            ?? ''
    const operacion      = params.get('operacion')?.trim()       ?? ''
    const colonia        = params.get('colonia')?.trim()         ?? ''
    const precioMax      = params.get('precio_max')?.trim()      ?? ''

    // Si no hay email de asesor, no hay a quién notificar — decisión de Chucho.
    if (!emailAsesor) {
      console.warn('[notificar-asesor] email_asesor vacío, sin notificación')
      return json({ ok: true, motivo: 'sin_email_asesor' })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 3. Resolver email → user_id via auth.users (service role)
    //    listUsers trae hasta 200; el equipo es pequeño, cabe de sobra.
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
    if (listError) {
      console.error('[notificar-asesor] listUsers error:', listError)
      return json({ ok: false, error: 'Error al buscar usuario' }, 500)
    }

    const asesorUser = users.find(u => u.email === emailAsesor)
    if (!asesorUser) {
      console.warn('[notificar-asesor] no se encontró usuario con email:', emailAsesor)
      return json({ ok: true, motivo: 'asesor_no_encontrado' })
    }

    const userId = asesorUser.id

    // 4. Armar contenido de la notificación
    const titulo  = '🔔 Lead para búsqueda personalizada'
    const resumen = [
      tipo && `${tipo}`,
      colonia && `en ${colonia}`,
      operacion && `(${operacion})`,
      precioMax && `hasta ${formatearPrecio(precioMax)}`,
    ].filter(Boolean).join(' ')

    const cuerpo = `${nombreCliente}${telefonoCliente ? ` (+${telefonoCliente})` : ''} busca ${resumen}. Sin match en inventario — contáctalo.`

    // 5. Insertar notificación in-app
    const { error: notifError } = await supabaseAdmin
      .from('notificaciones')
      .insert({
        user_id: userId,
        titulo,
        mensaje: cuerpo,
        tipo: 'sistema',
        leida: false,
      })

    if (notifError) {
      console.error('[notificar-asesor] error insertando notificación:', notifError)
      return json({ ok: false, error: notifError.message }, 500)
    }

    // 6. Push Expo si el asesor tiene token registrado
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle()

    if (perfil?.push_token) {
      const pushPayload = {
        to: perfil.push_token,
        title: titulo,
        body: cuerpo,
        sound: 'default',
        data: {
          tipo: 'sistema',
          // Deep link: abrir WhatsApp directo al cliente
          url: telefonoCliente ? `https://wa.me/${telefonoCliente}` : undefined,
        },
      }

      const pushResp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(pushPayload),
      })

      const pushResult = await pushResp.json()

      // Limpiar token si Expo lo reporta como inválido/no registrado
      const ticketError = pushResult?.data?.details?.error
      if (ticketError === 'DeviceNotRegistered') {
        await supabaseAdmin.from('profiles').update({ push_token: null }).eq('id', userId)
        console.warn('[notificar-asesor] token inválido limpiado para:', userId)
      } else {
        console.log('[notificar-asesor] push enviado:', pushResult?.data?.status)
      }
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[notificar-asesor] error inesperado:', err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
