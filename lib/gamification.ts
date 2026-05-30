import { supabase } from './supabase'

// ── Tipos ──────────────────────────────────────────────────────
export type AccionGamificacion =
  | 'publicar_propiedad'
  | 'agregar_cliente'
  | 'completar_seguimiento'
  | 'agregar_interaccion'
  | 'agendar_cita'
  | 'cerrar_venta'
  | 'completar_leccion'
  | 'completar_curso'

type CfgAccion = {
  xp: number
  coins: number
  concepto: string
  categoria: string | null
  contadorCampo: string | null
}

export type UserStats = {
  id: string
  xp: number
  valera_coins: number
  streak_dias: number
  ultimo_acceso: string | null
  total_propiedades: number
  total_clientes: number
  total_cursos: number
  total_seguimientos: number
  total_ventas: number
  total_interacciones: number
}

// ── Recompensas por acción ─────────────────────────────────────
const ACCIONES: Record<AccionGamificacion, CfgAccion> = {
  publicar_propiedad:    { xp: 10,  coins: 2,  concepto: 'Publicar propiedad 🏠',     categoria: 'propiedad',    contadorCampo: 'total_propiedades'   },
  agregar_cliente:       { xp: 25,  coins: 5,  concepto: 'Nuevo cliente en CRM 👤',   categoria: 'crm',          contadorCampo: 'total_clientes'      },
  completar_seguimiento: { xp: 15,  coins: 3,  concepto: 'Seguimiento completado ✅', categoria: 'seguimiento',  contadorCampo: 'total_seguimientos'  },
  agregar_interaccion:   { xp: 10,  coins: 2,  concepto: 'Interacción registrada 💬', categoria: 'interaccion',  contadorCampo: 'total_interacciones' },
  agendar_cita:          { xp: 50,  coins: 10, concepto: 'Cita agendada 📅',          categoria: null,           contadorCampo: null                  },
  cerrar_venta:          { xp: 200, coins: 50, concepto: 'Venta cerrada 🎉',          categoria: null,           contadorCampo: 'total_ventas'        },
  completar_leccion:     { xp: 30,  coins: 10, concepto: 'Lección completada 📚',     categoria: 'curso',        contadorCampo: null                  },
  completar_curso:       { xp: 100, coins: 20, concepto: 'Curso completado 🎓',       categoria: null,           contadorCampo: 'total_cursos'        },
}

// ── Sistema de niveles progresivo ─────────────────────────────
// Nivel 1→2: 500 XP, cada nivel siguiente +30 XP más
// XP para ir de nivel L a L+1: 500 + 30*(L-1)
// XP total para LLEGAR al nivel L desde cero: (L-1)*(470 + 15*L)
// Fórmula inversa: L = 1 + floor((-485 + sqrt(235225 + 60*XP)) / 30)
export function calcularNivel(xp: number): number {
  if (xp <= 0) return 1
  return 1 + Math.floor((-485 + Math.sqrt(235225 + 60 * xp)) / 30)
}

export function infoNivel(xp: number) {
  const nivel = calcularNivel(xp)
  // XP acumulado al inicio del nivel actual: (nivel-1)*(470+15*nivel)
  const xpInicio    = (nivel - 1) * (470 + 15 * nivel)
  // XP necesario para este nivel: 500 + 30*(nivel-1)
  const xpNecesario = 500 + 30 * (nivel - 1)
  const xpActual    = xp - xpInicio
  return {
    nivel,
    xpActual,
    xpNecesario,
    porcentaje: Math.min(100, Math.round((xpActual / xpNecesario) * 100)),
  }
}

export function tituloPorNivel(nivel: number): string {
  if (nivel <= 2)  return 'Nuevo ingreso'
  if (nivel <= 4)  return 'Prospectador activo'
  if (nivel <= 7)  return 'Agente inmobiliario'
  if (nivel <= 11) return 'Prospectador Elite'
  if (nivel <= 15) return 'Top Closer'
  if (nivel <= 19) return 'CRM Master'
  if (nivel <= 24) return 'Rey de publicaciones'
  if (nivel <= 29) return 'Leyenda inmobiliaria'
  return 'Maestro Valera ✨'
}

// ── Registrar una acción y otorgar recompensas ─────────────────
export async function registrarAccion(userId: string, accion: AccionGamificacion): Promise<void> {
  try {
    const cfg = ACCIONES[accion]

    await supabase.rpc('award_xp_coins', {
      p_user_id:         userId,
      p_xp:              cfg.xp,
      p_coins:           cfg.coins,
      p_concepto:        cfg.concepto,
      p_campo_contador:  cfg.contadorCampo,
    })

    if (cfg.categoria) {
      await actualizarMisionesPorCategoria(userId, cfg.categoria)
    }
  } catch (e) {
    console.warn('[Gamification] registrarAccion:', e)
  }
}

// Mapeo categoria → campo en user_stats (fuente de verdad para misiones base)
const STATS_CAMPO: Partial<Record<string, keyof UserStats>> = {
  propiedad:   'total_propiedades',
  crm:         'total_clientes',
  seguimiento: 'total_seguimientos',
  interaccion: 'total_interacciones',
  curso:       'total_cursos',
}

// Fecha de hoy en zona horaria de México (UTC-6)
function getHoyMX(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' })
}

// ── Actualizar progreso de misiones para una categoría ─────────
async function actualizarMisionesPorCategoria(userId: string, categoria: string): Promise<void> {
  const hoy = getHoyMX()

  const { data: misiones } = await supabase
    .from('misiones')
    .select('id, tipo, meta, recompensa_xp, recompensa_coins')
    .eq('categoria', categoria)
    .eq('activa', true)

  if (!misiones?.length) return

  // Para misiones base: leer user_stats como fuente de verdad (auto-correctivo)
  let statsActual: number | null = null
  const campoStats = STATS_CAMPO[categoria]
  if (campoStats) {
    const { data: stats } = await supabase
      .from('user_stats').select(campoStats).eq('id', userId).maybeSingle()
    statsActual = (stats as any)?.[campoStats] ?? null
  }

  for (const m of misiones) {
    const { data: um } = await supabase
      .from('user_misiones')
      .select('id, progreso, completada, fecha_reset')
      .eq('user_id', userId)
      .eq('mision_id', m.id)
      .maybeSingle()

    // Saltar misiones base ya completadas
    if (m.tipo === 'base' && um?.completada) continue

    let nuevoProg: number
    let yaCompletada: boolean

    if (m.tipo === 'base') {
      // Misiones base: usar contador real de user_stats (se auto-corrige si hubo fallos)
      nuevoProg    = Math.min(statsActual ?? (um?.progreso ?? 0) + 1, m.meta)
      yaCompletada = um?.completada ?? false
    } else {
      // Misiones diarias: reset por fecha; yaCompletada SOLO si fue hoy
      const yaReset = um?.fecha_reset === hoy
      const progDiario = (um && !yaReset) ? 0 : (um?.progreso ?? 0)
      yaCompletada = !!(um?.completada && yaReset)  // solo "completada hoy"
      if (yaCompletada) continue
      nuevoProg = Math.min(progDiario + 1, m.meta)
    }

    const nuevaCompl = nuevoProg >= m.meta

    if (!um) {
      await supabase.from('user_misiones').insert({
        user_id: userId, mision_id: m.id, progreso: nuevoProg,
        completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl ? new Date().toISOString() : null,
      })
    } else {
      await supabase.from('user_misiones').update({
        progreso: nuevoProg, completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl && !yaCompletada ? new Date().toISOString() : null,
      }).eq('id', um.id)
    }

    if (nuevaCompl && !yaCompletada) {
      await supabase.rpc('award_xp_coins', {
        p_user_id: userId,
        p_xp:      m.recompensa_xp,
        p_coins:   m.recompensa_coins,
        p_concepto: '¡Misión completada! 🎯',
        p_campo_contador: null,
      })
    }
  }
}

// ── Sincronizar progreso de misiones base desde user_stats ─────
// Corrige misiones base desincronizadas sin necesidad de nuevas acciones
export async function sincronizarMisionesBase(userId: string): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: stats } = await supabase
    .from('user_stats')
    .select('total_propiedades, total_clientes, total_seguimientos, total_interacciones, total_cursos')
    .eq('id', userId)
    .maybeSingle()

  if (!stats) return

  const { data: misiones } = await supabase
    .from('misiones')
    .select('id, categoria, meta, recompensa_xp, recompensa_coins')
    .eq('tipo', 'base')
    .eq('activa', true)

  if (!misiones?.length) return

  for (const m of misiones) {
    const campoStats = STATS_CAMPO[m.categoria]
    if (!campoStats) continue

    const progresoCorrecto = Math.min((stats as any)[campoStats] ?? 0, m.meta)
    if (progresoCorrecto === 0) continue

    const { data: um } = await supabase
      .from('user_misiones')
      .select('id, progreso, completada')
      .eq('user_id', userId)
      .eq('mision_id', m.id)
      .maybeSingle()

    if (um?.completada) continue
    if (um && um.progreso >= progresoCorrecto) continue

    const nuevaCompl = progresoCorrecto >= m.meta

    if (!um) {
      await supabase.from('user_misiones').insert({
        user_id: userId, mision_id: m.id, progreso: progresoCorrecto,
        completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl ? new Date().toISOString() : null,
      })
    } else {
      await supabase.from('user_misiones').update({
        progreso: progresoCorrecto, completada: nuevaCompl,
        fecha_completada: nuevaCompl && !um.completada ? new Date().toISOString() : null,
      }).eq('id', um.id)
    }

    if (nuevaCompl && !(um?.completada)) {
      await supabase.rpc('award_xp_coins', {
        p_user_id: userId,
        p_xp:      m.recompensa_xp,
        p_coins:   m.recompensa_coins,
        p_concepto: '¡Misión completada! 🎯',
        p_campo_contador: null,
      })
    }
  }
}

// ── Tracking de login diario y streak ─────────────────────────
export async function trackLoginDiario(userId: string): Promise<{ nuevo: boolean; streak: number }> {
  try {
    const hoy = getHoyMX()

    const { data: stats } = await supabase
      .from('user_stats')
      .select('streak_dias, ultimo_acceso')
      .eq('id', userId)
      .maybeSingle()

    // Ya registrado hoy
    if (stats?.ultimo_acceso === hoy) {
      return { nuevo: false, streak: stats.streak_dias ?? 0 }
    }

    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    const ayerStr    = ayer.toISOString().slice(0, 10)
    const nuevoStreak = stats?.ultimo_acceso === ayerStr
      ? (stats.streak_dias ?? 0) + 1
      : 1

    // Otorgar XP y coins del acceso diario
    await supabase.rpc('award_xp_coins', {
      p_user_id:        userId,
      p_xp:             20,
      p_coins:          5,
      p_concepto:       'Acceso diario 🔥',
      p_campo_contador: null,
    })

    // Actualizar streak en user_stats
    await supabase
      .from('user_stats')
      .update({ streak_dias: nuevoStreak, ultimo_acceso: hoy })
      .eq('id', userId)

    // Verificar misiones de streak
    await actualizarMisionesStreak(userId, nuevoStreak)

    return { nuevo: true, streak: nuevoStreak }
  } catch (e) {
    console.warn('[Gamification] trackLoginDiario:', e)
    return { nuevo: false, streak: 0 }
  }
}

async function actualizarMisionesStreak(userId: string, streakActual: number): Promise<void> {
  const { data: misiones } = await supabase
    .from('misiones')
    .select('id, meta, recompensa_xp, recompensa_coins')
    .eq('categoria', 'streak')
    .eq('tipo', 'base')
    .eq('activa', true)

  if (!misiones?.length) return

  for (const m of misiones) {
    const { data: um } = await supabase
      .from('user_misiones')
      .select('id, completada')
      .eq('user_id', userId)
      .eq('mision_id', m.id)
      .maybeSingle()

    if (um?.completada) continue

    const completada = streakActual >= m.meta
    const hoy = getHoyMX()

    if (!um) {
      await supabase.from('user_misiones').insert({
        user_id: userId, mision_id: m.id, progreso: streakActual,
        completada, fecha_reset: hoy,
        fecha_completada: completada ? new Date().toISOString() : null,
      })
    } else {
      await supabase.from('user_misiones').update({
        progreso: streakActual, completada,
        fecha_completada: completada ? new Date().toISOString() : null,
      }).eq('id', um.id)
    }

    if (completada) {
      await supabase.rpc('award_xp_coins', {
        p_user_id: userId,
        p_xp:      m.recompensa_xp,
        p_coins:   m.recompensa_coins,
        p_concepto: '¡Racha completada! 🔥',
        p_campo_contador: null,
      })
    }
  }
}

// ── Sincronizar misiones diarias con actividad real del día ───
// Corrige progress usando los conteos reales, no los acumulados
export async function sincronizarMisionesDiarias(userId: string): Promise<void> {
  const hoy = getHoyMX()

  // Obtener actividad real del día (usa RPC con timezone México)
  const { data: actArr } = await supabase.rpc('get_actividad_diaria')
  const act = actArr?.[0] as {
    propiedades_hoy: number
    clientes_hoy: number
    interacciones_hoy: number
    seguimientos_hoy: number
  } | undefined

  if (!act) return

  // Mapa categoria → conteo real de hoy
  const conteosHoy: Record<string, number> = {
    propiedad:   act.propiedades_hoy   ?? 0,
    crm:         act.clientes_hoy      ?? 0,
    interaccion: act.interacciones_hoy ?? 0,
    seguimiento: act.seguimientos_hoy  ?? 0,
  }

  const { data: misiones } = await supabase
    .from('misiones')
    .select('id, categoria, meta, recompensa_xp, recompensa_coins')
    .eq('tipo', 'diaria')
    .eq('activa', true)

  if (!misiones?.length) return

  for (const m of misiones) {
    const conteoReal = conteosHoy[m.categoria] ?? 0
    if (conteoReal === 0) continue

    const { data: um } = await supabase
      .from('user_misiones')
      .select('id, progreso, completada, fecha_reset')
      .eq('user_id', userId)
      .eq('mision_id', m.id)
      .maybeSingle()

    // Si ya completó hoy, saltar
    if (um?.completada && um.fecha_reset === hoy) continue

    const nuevoProg  = Math.min(conteoReal, m.meta)
    const nuevaCompl = nuevoProg >= m.meta
    const yaCompletada = um?.completada && um.fecha_reset === hoy

    if (!um) {
      await supabase.from('user_misiones').insert({
        user_id: userId, mision_id: m.id, progreso: nuevoProg,
        completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl ? new Date().toISOString() : null,
      })
    } else {
      await supabase.from('user_misiones').update({
        progreso: nuevoProg, completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl && !yaCompletada ? new Date().toISOString() : null,
      }).eq('id', um.id)
    }

    if (nuevaCompl && !yaCompletada) {
      await supabase.rpc('award_xp_coins', {
        p_user_id:        userId,
        p_xp:             m.recompensa_xp,
        p_coins:          m.recompensa_coins,
        p_concepto:       '¡Misión diaria completada! ⚡',
        p_campo_contador: null,
      })
    }
  }
}

// ── Obtener stats del usuario ──────────────────────────────────
export async function getUserStats(userId: string): Promise<UserStats | null> {
  const { data } = await supabase
    .from('user_stats')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data as UserStats | null
}

// ── Admin: ajustar monedas de un usuario ──────────────────────
export async function adminAjustarMonedas(
  targetUserId: string,
  cantidad: number,
  concepto: string
): Promise<{ ok: boolean; error?: string; nuevoSaldo?: number }> {
  try {
    const { data, error } = await supabase.rpc('admin_ajustar_monedas', {
      p_target_user_id: targetUserId,
      p_cantidad:        cantidad,
      p_concepto:        concepto,
    })
    if (error) return { ok: false, error: error.message }
    if (data === false) return { ok: false, error: 'Saldo insuficiente' }

    // Leer el saldo actualizado
    const { data: stats } = await supabase
      .from('user_stats')
      .select('valera_coins')
      .eq('id', targetUserId)
      .maybeSingle()

    return { ok: true, nuevoSaldo: stats?.valera_coins }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

// ── Tabla de recompensas para UI dinámica ─────────────────────
export function getCoinsDisplay(): { icono: string; label: string; coins: number; xp: number }[] {
  return [
    { icono: '🏠', label: 'Publicar propiedad',     ...pick(ACCIONES.publicar_propiedad)    },
    { icono: '👤', label: 'Agregar cliente al CRM', ...pick(ACCIONES.agregar_cliente)       },
    { icono: '✅', label: 'Completar seguimiento',  ...pick(ACCIONES.completar_seguimiento) },
    { icono: '💬', label: 'Registrar interacción',  ...pick(ACCIONES.agregar_interaccion)   },
    { icono: '📅', label: 'Agendar cita',           ...pick(ACCIONES.agendar_cita)          },
    { icono: '🎉', label: 'Cerrar venta',           ...pick(ACCIONES.cerrar_venta)          },
    { icono: '📚', label: 'Ver lección',            ...pick(ACCIONES.completar_leccion)     },
  ]
}
function pick(a: CfgAccion) { return { coins: a.coins, xp: a.xp } }

// ── Comprar item de la tienda ──────────────────────────────────
export async function comprarItem(
  userId: string,
  itemId: string,
  nombre: string,
  costo: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: ok, error } = await supabase.rpc('gastar_coins', {
      p_user_id:  userId,
      p_cantidad: costo,
      p_concepto: `Tienda: ${nombre}`,
    })
    if (error || !ok) return { ok: false, error: 'No tienes suficientes Valera Coins' }

    const { data: perfil } = await supabase
      .from('profiles').select('nombre').eq('id', userId).maybeSingle()
    const userNombre = perfil?.nombre ?? 'Un prospectador'

    const { data: compra } = await supabase
      .from('store_compras')
      .insert({ user_id: userId, item_id: itemId, costo_coins: costo })
      .select('id')
      .single()

    await supabase.rpc('notificar_admins_compra_tienda', {
      p_user_id:     userId,
      p_user_nombre: userNombre,
      p_item_nombre: nombre,
      p_compra_id:   compra?.id ?? null,
      p_costo_coins: costo,
    }).catch(() => {})

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
