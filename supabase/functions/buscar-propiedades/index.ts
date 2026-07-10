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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = req.headers.get('x-make-secret')
    if (!secret || secret !== Deno.env.get('MAKE_WEBHOOK_SECRET')) {
      return json({ error: 'No autorizado' }, 401)
    }

    let resultado: string | undefined
    let telefono_prospectador: string | undefined

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
    } else {
      // Fallback: parsear como JSON
      try {
        const body = JSON.parse(rawText)
        resultado             = body.resultado
        telefono_prospectador = body.telefono_prospectador
      } catch { /* resultado queda undefined → 400 abajo */ }
    }

    if (!resultado) return json({ error: 'Campo resultado requerido' }, 400)

    // 1. Quitar [ENVIAR_CONTACTO] del texto en todos los casos
    const resultadoLimpio = resultado.replace('[ENVIAR_CONTACTO]', '').trim()

    // 2. Detectar marcador [BUSCAR]{...}
    const buscarIdx = resultadoLimpio.indexOf('[BUSCAR]')
    if (buscarIdx === -1) {
      // Sin búsqueda: devolver el texto limpio tal cual
      return json({ buscado: false, cantidad: 0, mensaje: resultadoLimpio })
    }

    // 3. intro = texto antes de [BUSCAR], sin marcador
    const intro = resultadoLimpio.slice(0, buscarIdx).trim()

    // 4. Extraer y parsear criterios
    const afterMarker = resultadoLimpio.slice(buscarIdx + '[BUSCAR]'.length).trim()
    const braceStart = afterMarker.indexOf('{')
    const braceEnd = afterMarker.indexOf('}')
    if (braceStart === -1 || braceEnd === -1) {
      return json({ buscado: false, cantidad: 0, mensaje: intro })
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

    // 5. Buscar propiedades
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let query = supabase
      .from('propiedades')
      .select('codigo, titulo, precio, recamaras, banos')
      .eq('estado', 'disponible')
      .eq('es_inventario', false)
      .order('precio', { ascending: true })
      .limit(3)

    if (criterios.tipo)                query = query.eq('tipo', criterios.tipo)
    if (criterios.operacion)           query = query.eq('operacion', criterios.operacion)
    if (criterios.precio_min != null)  query = query.gte('precio', criterios.precio_min)
    if (criterios.precio_max != null)  query = query.lte('precio', criterios.precio_max)
    if (criterios.colonia) {
      query = query.or(`titulo.ilike.%${criterios.colonia}%,direccion.ilike.%${criterios.colonia}%`)
    }

    const { data: props, error } = await query
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

    return json({ buscado: true, cantidad: props?.length ?? 0, mensaje: mensajeFinal })
  } catch (err) {
    console.error('[buscar-propiedades] error inesperado:', err)
    return json({ error: 'Error interno' }, 500)
  }
})
