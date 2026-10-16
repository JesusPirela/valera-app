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

// Tarjeta de contacto "completa" (campo `contacto` de la respuesta) — se
// mantiene igual que antes, por compatibilidad con quien ya la consuma.
function construirContacto(nombre: string, whatsapp: string): string {
  return (
    'Hola! Ya que hemos platicado un poco, te quiero conectar con uno de nuestros ' +
    'asesores expertos en Queretaro.\n\n' +
    `${nombre} - Asesor Valera Real Estate\n` +
    `https://wa.me/${whatsapp}\n\n` +
    'El te puede mostrar opciones, agendar visitas y resolver todas tus dudas!'
  )
}

// Bloque COMPACTO que se agrega al final de `mensaje` cuando Gemini puso
// [ENVIAR_CONTACTO] — a diferencia de `construirContacto` (que saluda de
// nuevo), este no repite saludo porque va pegado a un mensaje que Gemini ya
// armó con su propio tono.
function armarBloqueContacto(nombre: string, whatsapp: string): string {
  return (
    `👤 ${nombre} – Asesor Valera Real Estate\n` +
    `📲 https://wa.me/${whatsapp}\n\n` +
    'Él te puede mostrar opciones, agendar visitas y resolver todas tus dudas.'
  )
}

// Heurística: ¿el texto de Gemini ya invita a platicar con el asesor, o el
// bloque de contacto caería "pegado" sin ninguna transición? Se mira solo la
// cola del texto (no hace falta analizar todo el mensaje).
function yaInvitaAlContacto(texto: string): boolean {
  const cola = texto.slice(-140).toLowerCase()
  return /contact|conectar|conexi[oó]n|comunicar|asesor/.test(cola)
}

// Fallback corto por si, pase lo que pase, el mensaje final queda vacío — el
// cliente nunca se debe quedar sin ninguna respuesta de WhatsApp.
const MENSAJE_FALLBACK = '¡Gracias! En un momento te ayudo.'

// Limpia cualquier resto de los marcadores que usa el prompt de Gemini
// ([ENVIAR_CONTACTO], [BUSCAR]{...}) y nunca deja el mensaje vacío. Se aplica
// a CUALQUIER texto que vaya a salir como `mensaje`, aunque en teoría ya venga
// limpio — defensivo a propósito: un marcador suelto llegando a Twilio es
// justo lo que no se quiere que vea el cliente.
function limpiarMensaje(texto: string | null | undefined): string {
  const limpio = (texto ?? '')
    .replace(/\[ENVIAR_CONTACTO\]/g, '')
    .replace(/\[BUSCAR\][\s\S]*$/, '') // por si quedó un [BUSCAR]{...} sin cerrar bien
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return limpio || MENSAJE_FALLBACK
}

// Arma el `mensaje` final: limpia el texto base y, si corresponde (vino
// [ENVIAR_CONTACTO]), le pega el bloque de contacto al final — con una línea
// de transición antes SOLO si el texto no invitaba ya al contacto por su cuenta.
function construirMensajeConContacto(
  base: string | null | undefined,
  incluirContacto: boolean,
  dueno: { nombre: string; whatsapp: string } | null,
): { mensaje: string; contactoIncluido: boolean } {
  const baseLimpia = limpiarMensaje(base)
  if (!incluirContacto) return { mensaje: baseLimpia, contactoIncluido: false }

  const asesor = dueno ?? ASESOR_DEFAULT
  const bloque = armarBloqueContacto(asesor.nombre, asesor.whatsapp)
  const partes = [baseLimpia]
  if (!yaInvitaAlContacto(baseLimpia)) {
    partes.push('Te comparto el contacto de tu asesor para darte seguimiento:')
  }
  partes.push(bloque)
  return { mensaje: partes.join('\n\n'), contactoIncluido: true }
}

// Resuelve telefono_cliente → el asesor DUEÑO del lead (no un default).
// Cadena: chatbot_leads(telefono) → prospectador_id → auth.users(email) → prospectadores
// Devuelve null si cualquier paso falla — a diferencia de antes, aquí NO se cae
// al asesor default: eso lo decide quien llama, según para qué se use el dato.
// deno-lint-ignore no-explicit-any
async function resolverAsesorDueno(supabase: any, telefonoCliente: string): Promise<{ nombre: string; whatsapp: string } | null> {
  try {
    const telefonoNorm = normalizarWaId(telefonoCliente)
    if (telefonoNorm.length !== 12) return null

    const { data: lead } = await supabase
      .from('chatbot_leads')
      .select('prospectador_id')
      .eq('telefono', telefonoNorm)
      .maybeSingle()

    if (!lead?.prospectador_id) return null

    // email está en auth.users (profiles no tiene la columna)
    const { data: authUser } = await supabase.auth.admin.getUserById(lead.prospectador_id)
    const email = authUser?.user?.email
    if (!email) return null

    const { data: asesor } = await supabase
      .from('prospectadores')
      .select('nombre, whatsapp')
      .eq('email', email)
      .maybeSingle()

    if (!asesor) return null

    return { nombre: asesor.nombre, whatsapp: asesor.whatsapp }
  } catch (e) {
    console.error('[buscar-propiedades] error resolviendo dueño del lead:', e)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Declarados ANTES del try para que el catch-all de hasta abajo pueda
  // devolver `mensaje`/`contacto` si ya se habían calculado cuando algo truena
  // más adelante (requisito: nunca dejar al cliente sin mensaje).
  let introGemini: string | undefined
  let contacto: string | undefined
  let asesorWhatsapp: string | null = null
  let tieneEnviarContacto = false
  let duenoResuelto: { nombre: string; whatsapp: string } | null = null

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

    // Dueño real del lead (puede no resolver) y el texto de contacto para mostrar
    // (ese SÍ siempre cae al asesor default si no se resuelve — es solo texto).
    duenoResuelto = await resolverAsesorDueno(supabase, telefono_cliente ?? '')
    contacto = duenoResuelto
      ? construirContacto(duenoResuelto.nombre, duenoResuelto.whatsapp)
      : construirContacto(ASESOR_DEFAULT.nombre, ASESOR_DEFAULT.whatsapp)

    // Número usado en el ?t= de cada ficha: 1) el del dueño real resuelto,
    // 2) si no resolvió, el que mandó Make en telefono_prospectador,
    // 3) si tampoco vino, se omite el ?t= (nunca se usa el default aquí).
    asesorWhatsapp = duenoResuelto?.whatsapp ?? (telefono_prospectador || null)

    // 1. Detectar [ENVIAR_CONTACTO] ANTES de quitarlo, y quitarlo (todas las
    // ocurrencias) del texto en todos los casos.
    tieneEnviarContacto = resultado.includes('[ENVIAR_CONTACTO]')
    const resultadoLimpio = resultado.replace(/\[ENVIAR_CONTACTO\]/g, '').trim()

    // 2. Detectar marcador [BUSCAR]{...}
    const buscarIdx = resultadoLimpio.indexOf('[BUSCAR]')
    if (buscarIdx === -1) {
      // Sin búsqueda: devolver el texto limpio (+ contacto si aplicaba)
      introGemini = resultadoLimpio
      const { mensaje, contactoIncluido } = construirMensajeConContacto(introGemini, tieneEnviarContacto, duenoResuelto)
      return json({ buscado: false, cantidad: 0, mensaje, contacto, asesor_whatsapp: asesorWhatsapp, contacto_incluido: contactoIncluido })
    }

    // 3. intro = texto antes de [BUSCAR], sin marcador
    const intro = resultadoLimpio.slice(0, buscarIdx).trim()
    introGemini = intro

    // 4. Extraer y parsear criterios
    const afterMarker = resultadoLimpio.slice(buscarIdx + '[BUSCAR]'.length).trim()
    const braceStart = afterMarker.indexOf('{')
    const braceEnd = afterMarker.indexOf('}')
    if (braceStart === -1 || braceEnd === -1) {
      const { mensaje, contactoIncluido } = construirMensajeConContacto(intro, tieneEnviarContacto, duenoResuelto)
      return json({ buscado: false, cantidad: 0, mensaje, contacto, asesor_whatsapp: asesorWhatsapp, contacto_incluido: contactoIncluido })
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
      // Criterios inválidos: el cliente NO se queda sin respuesta — se le manda
      // el texto que Gemini ya había preparado, igual que el caso "sin búsqueda".
      // Status 200 a propósito: para Make/Twilio esto debe tratarse como un
      // mensaje normal a enviar, no como una falla de la llamada HTTP.
      const { mensaje, contactoIncluido } = construirMensajeConContacto(intro, tieneEnviarContacto, duenoResuelto)
      return json({
        buscado: false, cantidad: 0, mensaje, contacto,
        asesor_whatsapp: asesorWhatsapp, error_criterios: true, contacto_incluido: contactoIncluido,
      })
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
      // Aun en error de BD, si ya hay texto de Gemini se manda — mejor un
      // mensaje genérico al cliente que silencio total.
      const { mensaje, contactoIncluido } = construirMensajeConContacto(intro, tieneEnviarContacto, duenoResuelto)
      return json({
        error: 'Error al consultar propiedades', mensaje,
        contacto, asesor_whatsapp: asesorWhatsapp, contacto_incluido: contactoIncluido,
      }, 500)
    }

    // 6. Armar mensaje final
    const BASE_URL = 'https://valeraapp.valerarealestate.com/ficha'
    let mensajeFinal: string

    if (!props || props.length === 0) {
      // Sin resultados: avisar al cliente que un asesor lo contactará.
      // Make usará `criterios` (devuelto abajo) para armar el aviso al asesor por email.
      mensajeFinal =
        'Por ahora no tengo propiedades en el inventario que coincidan exactamente con esos criterios 🙏. ' +
        'Le voy a pedir a uno de nuestros asesores que haga una búsqueda personalizada para ti — en breve ' +
        'se pondrá en contacto contigo. ¿Hay algún horario en el que prefieras que te contacten?'
    } else {
      const fichas = props.map((p) => {
        const url = asesorWhatsapp
          ? `${BASE_URL}/${p.codigo}?t=${encodeURIComponent(asesorWhatsapp)}`
          : `${BASE_URL}/${p.codigo}`
        const precio = p.precio != null ? `💰 $${formatearPrecio(p.precio)} MXN` : '💰 Precio a consultar'
        const detalle = [
          p.recamaras != null ? `${p.recamaras} rec.` : null,
          p.banos != null     ? `${p.banos} baños`    : null,
        ].filter(Boolean).join(' · ')
        return `🏠 ${p.titulo}\n${precio}\n${detalle}\n🔗 ${url}`
      })
      // Si hay [ENVIAR_CONTACTO], el bloque de contacto va AL FINAL, después
      // de las fichas (construirMensajeConContacto lo pega después de `base`).
      mensajeFinal = intro + '\n\n' + fichas.join('\n\n')
    }

    const { mensaje: mensajeConContacto, contactoIncluido } = construirMensajeConContacto(mensajeFinal, tieneEnviarContacto, duenoResuelto)

    // Siempre devolver criterios para que Make pueda armar el aviso al asesor
    // cuando cantidad === 0 (filtro: buscado=true AND cantidad=0 AND Sheets(12) devolvió fila).
    return json({
      buscado: true, cantidad: props?.length ?? 0, mensaje: mensajeConContacto,
      contacto, asesor_whatsapp: asesorWhatsapp, criterios, contacto_incluido: contactoIncluido,
    })
  } catch (err) {
    console.error('[buscar-propiedades] error inesperado:', err)
    // Si ya se había calculado el texto de Gemini y/o el contacto antes de que
    // tronara, se incluyen igual — mejor eso que dejar al cliente sin nada.
    const resultadoMsg = introGemini !== undefined
      ? construirMensajeConContacto(introGemini, tieneEnviarContacto, duenoResuelto)
      : null
    return json({
      error: 'Error interno',
      ...(resultadoMsg ? { mensaje: resultadoMsg.mensaje, contacto_incluido: resultadoMsg.contactoIncluido } : {}),
      ...(contacto !== undefined ? { contacto } : {}),
      ...(asesorWhatsapp !== null ? { asesor_whatsapp: asesorWhatsapp } : {}),
    }, 500)
  }
})
