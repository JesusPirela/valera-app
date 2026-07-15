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

function formatearPrecio(precio: number): string {
  return precio.toLocaleString('es-MX')
}

// Normaliza el WaId de WhatsApp (521XXXXXXXXXX, 13 dígitos) a 12 dígitos (52XXXXXXXXXX),
// que es el formato guardado en chatbot_leads por chatbot-eventos.
function normalizarWaId(waId: string): string {
  let phone = waId.replace(/\D/g, '')
  if (phone.startsWith('521') && phone.length === 13) phone = '52' + phone.slice(3)
  if (phone.length === 10) phone = '52' + phone
  return phone
}

const ASESOR_DEFAULT = { nombre: 'Ruben Lopez', whatsapp: '5214428157256' }

function construirContacto(nombre: string, whatsapp: string): string {
  return (
    'Hola! Ya que hemos platicado un poco, te quiero conectar con uno de nuestros ' +
    'asesores expertos en Queretaro.\n\n' +
    `${nombre} - Asesor Valera Real Estate\n` +
    `https://wa.me/${whatsapp}\n\n` +
    'El te puede mostrar opciones, agendar visitas y resolver todas tus dudas!'
  )
}

// Resuelve telefono_cliente → prospectadores.nombre/whatsapp
// Cadena: chatbot_leads(telefono) → prospectador_id → auth.users(email) → prospectadores
// Devuelve siempre un contacto (default si cualquier paso falla).
// deno-lint-ignore no-explicit-any
async function resolverContacto(supabase: any, telefonoCliente: string): Promise<string> {
  try {
    const telefonoNorm = normalizarWaId(telefonoCliente)
    if (telefonoNorm.length !== 12) return construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)

    const { data: lead } = await supabase
      .from('chatbot_leads')
      .select('prospectador_id')
      .eq('telefono', telefonoNorm)
      .maybeSingle()

    if (!lead?.prospectador_id) return construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)

    // email está en auth.users (profiles no tiene la columna)
    const { data: authUser } = await supabase.auth.admin.getUserById(lead.prospectador_id)
    const email = authUser?.user?.email
    if (!email) return construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)

    const { data: asesor } = await supabase
      .from('prospectadores')
      .select('nombre, whatsapp')
      .eq('email', email)
      .maybeSingle()

    if (!asesor) return construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)

    return construirContacto(asesor.nombre, asesor.whatsapp)
  } catch (e) {
    console.error('[buscar-propiedades] error resolviendo contacto:', e)
    return construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ error: 'No autorizado' }, 401)
    }

    let resultado: string | undefined
    let telefono_prospectador: string | undefined
    let telefono_cliente: string | undefined

    const rawText = await req.text()
    console.log('CONTENT-TYPE:', req.headers.get('content-type'))
    console.log('RAW BODY (primeros 400):', rawText.slice(0, 400))
    const params = new URLSearchParams(rawText)
    console.log('KEYS:', [...params.keys()])
    console.log('RESULTADO:', params.get('resultado')?.slice(0, 80))

    // Intentar form-urlencoded primero (cubre charset=utf-8 y cualquier variante)
    if (params.get('resultado')) {
      resultado             = params.get('resultado')             ?? undefined
      telefono_prospectador = params.get('telefono_prospectador') ?? undefined
      telefono_cliente      = params.get('telefono_cliente')      ?? undefined
    } else {
      // Fallback: parsear como JSON
      try {
        const body = JSON.parse(rawText)
        resultado             = body.resultado
        telefono_prospectador = body.telefono_prospectador
        telefono_cliente      = body.telefono_cliente
      } catch { /* resultado queda undefined → 400 abajo */ }
    }

    if (!resultado) return json({ error: 'Campo resultado requerido' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolver contacto del asesor asignado al cliente (nunca falla — devuelve default).
    const contacto = await resolverContacto(supabase, telefono_cliente ?? '')

    // 1. Quitar [ENVIAR_CONTACTO] del texto en todos los casos
    const resultadoLimpio = resultado.replace('[ENVIAR_CONTACTO]', '').trim()

    // 2. Detectar marcador [BUSCAR]{...}
    const buscarIdx = resultadoLimpio.indexOf('[BUSCAR]')
    if (buscarIdx === -1) {
      // Sin búsqueda: devolver el texto limpio tal cual
      return json({ buscado: false, cantidad: 0, mensaje: resultadoLimpio, contacto })
    }

    // 3. intro = texto antes de [BUSCAR], sin marcador
    const intro = resultadoLimpio.slice(0, buscarIdx).trim()

    // 4. Extraer y parsear criterios
    const afterMarker = resultadoLimpio.slice(buscarIdx + '[BUSCAR]'.length).trim()
    const braceStart = afterMarker.indexOf('{')
    const braceEnd = afterMarker.indexOf('}')
    if (braceStart === -1 || braceEnd === -1) {
      return json({ buscado: false, cantidad: 0, mensaje: intro, contacto })
    }

    let criterios: {
      tipo?: string
      operacion?: string
      colonia?: string
      precio_min?: number
      precio_max?: number
    } = {}
    try {
      criterios = JSON.parse(afterMarker.slice(braceStart, braceEnd + 1))
    } catch {
      return json({ error: 'JSON de criterios inválido', buscado: false }, 400)
    }

    // 5. Buscar propiedades vía RPC con unaccent (insensible a acentos y mayúsculas).
    // Cuando viene precio_min el cliente quiere opciones de mayor valor → orden DESC.
    const { data: props, error } = await supabase.rpc('buscar_propiedades_chatbot', {
      p_colonia:    criterios.colonia    ?? null,
      p_tipo:       criterios.tipo       ?? null,
      p_operacion:  criterios.operacion  ?? null,
      p_precio_min: criterios.precio_min ?? null,
      p_precio_max: criterios.precio_max ?? null,
      p_orden_asc:  criterios.precio_min == null,
    })
    if (error) {
      console.error('[buscar-propiedades] query error:', error)
      return json({ error: 'Error al consultar propiedades' }, 500)
    }

    // 6. Armar mensaje final
    const BASE_URL = 'https://valeraapp.valerarealestate.com/ficha'
    let mensajeFinal: string

    if (!props || props.length === 0) {
      mensajeFinal = intro + '\n\nPor ahora no encontré opciones con esos criterios, pero te aviso en cuanto entren. ¿Ajustamos zona o presupuesto?'
    } else {
      const fichas = props.map((p) => {
        const url = telefono_prospectador
          ? `${BASE_URL}/${p.codigo}?t=${encodeURIComponent(telefono_prospectador)}`
          : `${BASE_URL}/${p.codigo}`
        const precio = p.precio != null ? `💰 $${formatearPrecio(p.precio)} MXN` : '💰 Precio a consultar'
        const detalle = [
          p.recamaras != null ? `${p.recamaras} rec.` : null,
          p.banos != null     ? `${p.banos} baños`    : null,
        ].filter(Boolean).join(' · ')
        return `🏠 ${p.titulo}\n${precio}\n${detalle}\n🔗 ${url}`
      })
      mensajeFinal = intro + '\n\n' + fichas.join('\n\n')
    }

    return json({ buscado: true, cantidad: props?.length ?? 0, mensaje: mensajeFinal, contacto })
  } catch (err) {
    console.error('[buscar-propiedades] error inesperado:', err)
    return json({ error: 'Error interno' }, 500)
  }
})
