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

    const body = await req.json().catch(() => ({}))
    const {
      colonia,
      tipo,
      operacion,
      precio_min,
      precio_max,
      telefono_prospectador,
    } = body as {
      colonia?: string
      tipo?: string
      operacion?: string
      precio_min?: number
      precio_max?: number
      telefono_prospectador?: string
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let query = supabase
      .from('propiedades')
      .select('codigo, titulo, precio, tipo, operacion, recamaras, banos, direccion, descripcion_corta')
      .eq('estado', 'disponible')
      .eq('es_inventario', false)
      .order('precio', { ascending: true })
      .limit(3)

    if (tipo) query = query.eq('tipo', tipo)
    if (operacion) query = query.eq('operacion', operacion)
    if (precio_min != null) query = query.gte('precio', precio_min)
    if (precio_max != null) query = query.lte('precio', precio_max)
    if (colonia) {
      query = query.or(`titulo.ilike.%${colonia}%,direccion.ilike.%${colonia}%`)
    }

    const { data: props, error } = await query

    if (error) {
      console.error('[buscar-propiedades] error query:', error)
      return json({ error: 'Error al consultar propiedades' }, 500)
    }

    const BASE_URL = 'https://valeraapp.valerarealestate.com/ficha'

    if (!props || props.length === 0) {
      return json({
        cantidad: 0,
        mensaje: 'Por ahora no encontré propiedades disponibles que coincidan con eso. ¿Quieres que amplíe la zona o el presupuesto, o te conecto con un asesor?',
        propiedades: [],
      })
    }

    const propiedades = props.map((p) => {
      const url = telefono_prospectador
        ? `${BASE_URL}/${p.codigo}?t=${encodeURIComponent(telefono_prospectador)}`
        : `${BASE_URL}/${p.codigo}`
      return { codigo: p.codigo, titulo: p.titulo, precio: p.precio, url }
    })

    const lineas = props.map((p, i) => {
      const url = propiedades[i].url
      const recamaras = p.recamaras != null ? `${p.recamaras} rec · ` : ''
      const banos = p.banos != null ? `${p.banos} baños · ` : ''
      const precio = p.precio != null ? `$${formatearPrecio(p.precio)} MXN` : 'Precio a consultar'
      return `${i + 1}. ${p.titulo}\n💰 ${precio} · ${recamaras}${banos}\n🔗 ${url}`
    })

    const mensaje =
      `🏡 Encontré estas opciones para ti:\n\n` +
      lineas.join('\n\n') +
      `\n\n¿Te interesa alguna? Con gusto te doy más detalles o te conecto con un asesor.`

    return json({ cantidad: props.length, mensaje, propiedades })
  } catch (err) {
    console.error('[buscar-propiedades] error inesperado:', err)
    return json({ error: 'Error interno' }, 500)
  }
})
