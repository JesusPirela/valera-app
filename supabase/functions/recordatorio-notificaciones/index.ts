import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function enviarPushExpo(mensajes: { to: string; title: string; body: string }[]) {
  if (!mensajes.length) return
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(mensajes),
    })
  } catch (e) {
    console.error('[Push] Error enviando:', e)
  }
}

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const ahora = new Date()
  const VENTANA_MS = 20 * 60 * 1000

  const notificaciones: {
    user_id: string
    titulo: string
    mensaje: string
    tipo: string
    leida: boolean
  }[] = []

  // ─── Recordatorios a 24 horas ────────────────────────────────────────────
  const centro24 = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
  const desde24  = new Date(centro24.getTime() - VENTANA_MS).toISOString()
  const hasta24  = new Date(centro24.getTime() + VENTANA_MS).toISOString()

  const { data: recs24, error: err24 } = await supabase
    .from('recordatorios')
    .select('id, user_id, titulo, descripcion, fecha_hora')
    .eq('completado', false)
    .eq('notificado_24h', false)
    .gte('fecha_hora', desde24)
    .lte('fecha_hora', hasta24)

  if (err24) console.error('Error recs24:', err24.message)

  for (const rec of recs24 ?? []) {
    const hora = new Date(rec.fecha_hora).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
    })
    const descripcion = rec.descripcion ? ` — ${rec.descripcion}` : ''
    notificaciones.push({
      user_id: rec.user_id,
      titulo: '⏰ Recordatorio mañana',
      mensaje: `Tienes "${rec.titulo}" agendado para mañana a las ${hora}.${descripcion}`,
      tipo: 'recordatorio',
      leida: false,
    })
    await supabase.from('recordatorios').update({ notificado_24h: true }).eq('id', rec.id)
  }

  // ─── Recordatorios a 2 horas ─────────────────────────────────────────────
  const centro2 = new Date(ahora.getTime() + 2 * 60 * 60 * 1000)
  const desde2  = new Date(centro2.getTime() - VENTANA_MS).toISOString()
  const hasta2  = new Date(centro2.getTime() + VENTANA_MS).toISOString()

  const { data: recs2, error: err2 } = await supabase
    .from('recordatorios')
    .select('id, user_id, titulo, descripcion, fecha_hora')
    .eq('completado', false)
    .eq('notificado_2h', false)
    .gte('fecha_hora', desde2)
    .lte('fecha_hora', hasta2)

  if (err2) console.error('Error recs2:', err2.message)

  for (const rec of recs2 ?? []) {
    const hora = new Date(rec.fecha_hora).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
    })
    const descripcion = rec.descripcion ? ` — ${rec.descripcion}` : ''
    notificaciones.push({
      user_id: rec.user_id,
      titulo: '⏰ Cita en 2 horas',
      mensaje: `Tu cita "${rec.titulo}" empieza en aproximadamente 2 horas, a las ${hora}.${descripcion}`,
      tipo: 'recordatorio',
      leida: false,
    })
    await supabase.from('recordatorios').update({ notificado_2h: true }).eq('id', rec.id)
  }

  // ─── Insertar notificaciones en DB ───────────────────────────────────────
  if (notificaciones.length > 0) {
    const { error: errInsert } = await supabase.from('notificaciones').insert(notificaciones)
    if (errInsert) console.error('Error inserting notificaciones:', errInsert.message)

    // ─── Enviar push a cada usuario ──────────────────────────────────────
    const userIds = [...new Set(notificaciones.map(n => n.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', userIds)
      .not('push_token', 'is', null)

    const pushMensajes = notificaciones
      .map(n => {
        const profile = profiles?.find(p => p.id === n.user_id)
        if (!profile?.push_token) return null
        return { to: profile.push_token, title: n.titulo, body: n.mensaje, sound: 'default' }
      })
      .filter(Boolean) as { to: string; title: string; body: string; sound: string }[]

    await enviarPushExpo(pushMensajes)
  }

  return new Response(
    JSON.stringify({ ok: true, enviadas: notificaciones.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
