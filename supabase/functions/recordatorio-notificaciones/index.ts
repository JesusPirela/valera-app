import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// deno-lint-ignore no-explicit-any
async function enviarPushExpo(supabase: any, mensajes: { to: string; title: string; body: string }[]) {
  if (!mensajes.length) return
  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(mensajes),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      console.error('[Push] Expo respondió con error HTTP', resp.status, json)
      return
    }
    // Cada ticket en json.data corresponde al mensaje en la misma posición.
    // DeviceNotRegistered = el token ya no es válido (app desinstalada, etc.) -> limpiarlo.
    const tickets = json?.data ?? []
    const tokensInvalidos: string[] = []
    tickets.forEach((ticket: { status: string; message?: string; details?: { error?: string } }, i: number) => {
      if (ticket.status === 'error') {
        console.error('[Push] Error en ticket:', mensajes[i]?.to, ticket.message, ticket.details)
        if (ticket.details?.error === 'DeviceNotRegistered') tokensInvalidos.push(mensajes[i].to)
      }
    })
    if (tokensInvalidos.length > 0) {
      await supabase.from('profiles').update({ push_token: null }).in('push_token', tokensInvalidos)
    }
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
    cita_id?: string
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

  // ─── Citas: aviso 2 horas antes ──────────────────────────────────────────
  // Sobre citas_coordinacion (las citas reales del CRM), no sobre recordatorios.
  const cita2 = new Date(ahora.getTime() + 2 * 60 * 60 * 1000)
  const { data: citasProximas, error: errCitas2 } = await supabase
    .from('citas_coordinacion')
    .select('id, prospectador_id, fecha_cita, clientes(nombre), propiedades(codigo)')
    .is('notif_previa_at', null)
    .in('estado', ['coordinada', 'reagendada'])
    .gte('fecha_cita', new Date(cita2.getTime() - VENTANA_MS).toISOString())
    .lte('fecha_cita', new Date(cita2.getTime() + VENTANA_MS).toISOString())

  if (errCitas2) console.error('Error citas 2h:', errCitas2.message)

  for (const cita of citasProximas ?? []) {
    // deno-lint-ignore no-explicit-any
    const c = cita as any
    const hora = new Date(c.fecha_cita).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
    })
    const cliente = c.clientes?.nombre ?? 'tu cliente'
    const propiedad = c.propiedades?.codigo ? ` (${c.propiedades.codigo})` : ''
    notificaciones.push({
      user_id: c.prospectador_id,
      titulo: '📅 Cita en 2 horas',
      mensaje: `Tu cita con ${cliente}${propiedad} es a las ${hora}.`,
      tipo: 'cita',
      leida: false,
      cita_id: c.id,
    })
    await supabase.from('citas_coordinacion')
      .update({ notif_previa_at: ahora.toISOString() }).eq('id', c.id)
  }

  // ─── Citas: pedir confirmación 30-60 min después ─────────────────────────
  // Agendar una cita NO la cuenta como realizada: solo se suma cuando el asesor
  // confirma aquí que ocurrió (RPC confirmar_cita).
  const { data: citasPasadas, error: errCitasConf } = await supabase
    .from('citas_coordinacion')
    .select('id, prospectador_id, fecha_cita, clientes(nombre), propiedades(codigo)')
    .is('notif_confirmacion_at', null)
    .is('confirmada_at', null)
    .in('estado', ['coordinada', 'reagendada'])
    .gte('fecha_cita', new Date(ahora.getTime() - 60 * 60 * 1000).toISOString())
    .lte('fecha_cita', new Date(ahora.getTime() - 30 * 60 * 1000).toISOString())

  if (errCitasConf) console.error('Error citas confirmación:', errCitasConf.message)

  for (const cita of citasPasadas ?? []) {
    // deno-lint-ignore no-explicit-any
    const c = cita as any
    const cliente = c.clientes?.nombre ?? 'tu cliente'
    const propiedad = c.propiedades?.codigo ? ` (${c.propiedades.codigo})` : ''
    notificaciones.push({
      user_id: c.prospectador_id,
      titulo: '❓ ¿La cita se realizó?',
      mensaje: `Confirma qué pasó con la cita de ${cliente}${propiedad}.`,
      tipo: 'cita',
      leida: false,
      cita_id: c.id,
    })
    await supabase.from('citas_coordinacion')
      .update({ notif_confirmacion_at: ahora.toISOString() }).eq('id', c.id)
  }

  // ─── Racha en riesgo: aviso de la tarde ──────────────────────────────────
  // A quien tiene una racha viva pero aún no cumple su meta de hoy. Es el aviso
  // que más recupera gente (Duolingo vive de esto): sin él, la racha solo la
  // cuidan los que ya son constantes.
  //
  // Se manda una sola vez al día, en la franja de las 19:00–20:59 hora de México
  // (el cron corre cada 30 min; la RPC marca a quién ya se le avisó, así que
  // aunque el cron pase varias veces en la franja, nadie recibe dos avisos).
  const horaMX = Number(
    new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Mexico_City' })
  )
  if (horaMX === 19 || horaMX === 20) {
    const { data: enRiesgo, error: errRacha } = await supabase.rpc('rachas_en_riesgo')
    if (errRacha) console.error('Error rachas_en_riesgo:', errRacha.message)

    for (const u of enRiesgo ?? []) {
      // deno-lint-ignore no-explicit-any
      const r = u as any
      const faltan = Math.max((r.meta_diaria ?? 1) - (r.misiones_hoy ?? 0), 1)
      notificaciones.push({
        user_id: r.user_id,
        titulo: `🔥 Tu racha de ${r.racha} ${r.racha === 1 ? 'día' : 'días'} está en riesgo`,
        mensaje: faltan === 1
          ? 'Te falta 1 misión diaria para mantenerla. ¡Aún estás a tiempo!'
          : `Te faltan ${faltan} misiones diarias para mantenerla. ¡Aún estás a tiempo!`,
        tipo: 'recordatorio',
        leida: false,
      })
    }
  }

  // ─── Insertar notificaciones en DB ───────────────────────────────────────
  if (notificaciones.length > 0) {
    // push_enviado=true porque este mismo handler envía el push justo abajo.
    const notificacionesConFlag = notificaciones.map(n => ({ ...n, push_enviado: true }))
    const { error: errInsert } = await supabase.from('notificaciones').insert(notificacionesConFlag)
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

    await enviarPushExpo(supabase, pushMensajes)
  }

  return new Response(
    JSON.stringify({ ok: true, enviadas: notificaciones.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
