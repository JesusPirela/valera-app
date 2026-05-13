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
  completar_leccion:     { xp: 30,  coins: 5,  concepto: 'Lección completada 📚',     categoria: 'curso',        contadorCampo: null                  },
  completar_curso:       { xp: 100, coins: 20, concepto: 'Curso completado 🎓',       categoria: null,           contadorCampo: 'total_cursos'        },
}

// ── Sistema de niveles infinito ────────────────────────────────
// Nivel N requiere N*100 XP para subir al siguiente
// XP total para llegar al nivel N: N*(N-1)/2 * 100
export function calcularNivel(xp: number): number {
  if (xp <= 0) return 1
  return Math.floor((1 + Math.sqrt(1 + 8 * xp / 100)) / 2)
}

export function infoNivel(xp: number) {
  const nivel = calcularNivel(xp)
  const xpInicio = nivel * (nivel - 1) / 2 * 100
  const xpFin    = (nivel + 1) * nivel / 2 * 100
  const xpActual   = xp - xpInicio
  const xpNecesario = xpFin - xpInicio
  return {
    nivel,
    xpActual,
    xpNecesario,
    porcentaje: xpNecesario > 0 ? Math.min(100, Math.round((xpActual / xpNecesario) * 100)) : 100,
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

// ── Actualizar progreso de misiones para una categoría ─────────
async function actualizarMisionesPorCategoria(userId: string, categoria: string): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: misiones } = await supabase
    .from('misiones')
    .select('id, tipo, meta, recompensa_xp, recompensa_coins')
    .eq('categoria', categoria)
    .eq('activa', true)

  if (!misiones?.length) return

  for (const m of misiones) {
    const { data: um } = await supabase
      .from('user_misiones')
      .select('id, progreso, completada, fecha_reset')
      .eq('user_id', userId)
      .eq('mision_id', m.id)
      .maybeSingle()

    // Saltar misiones base ya completadas
    if (m.tipo === 'base' && um?.completada) continue

    // Para diarias: resetear si es un día distinto
    const yaReset     = um?.fecha_reset === hoy
    const progreso    = (m.tipo === 'diaria' && !yaReset) ? 0 : (um?.progreso ?? 0)
    const completada  = (m.tipo === 'diaria' && !yaReset) ? false : (um?.completada ?? false)

    if (completada) continue

    const nuevoProg   = Math.min(progreso + 1, m.meta)
    const nuevaCompl  = nuevoProg >= m.meta

    if (!um) {
      await supabase.from('user_misiones').insert({
        user_id: userId, mision_id: m.id, progreso: nuevoProg,
        completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl ? new Date().toISOString() : null,
      })
    } else {
      await supabase.from('user_misiones').update({
        progreso: nuevoProg, completada: nuevaCompl, fecha_reset: hoy,
        fecha_completada: nuevaCompl && !um.completada ? new Date().toISOString() : null,
      }).eq('id', um.id)
    }

    if (nuevaCompl && !completada) {
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
    const hoy = new Date().toISOString().slice(0, 10)

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
    const hoy = new Date().toISOString().slice(0, 10)

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

// ── Obtener stats del usuario ──────────────────────────────────
export async function getUserStats(userId: string): Promise<UserStats | null> {
  const { data } = await supabase
    .from('user_stats')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data as UserStats | null
}

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
