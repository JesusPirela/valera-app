import { supabase } from './supabase'

export type CrmEstadoCount = { estado: string; count: number }
export type CrmFuenteCount = { fuente: string; count: number }
export type CrmMetricas = {
  userId: string | null
  nombre: string
  totalLeads: number
  leadsActivos: number
  cerrados: number
  leadsEsteMes: number
  porEstado: CrmEstadoCount[]
  porFuente: CrmFuenteCount[]
  totalInteracciones: number
  recordatoriosPendientes: number
}

// userId === null -> métricas del equipo completo (todos los clientes)
export async function calcularCrmMetricas(userId: string | null, nombre: string): Promise<CrmMetricas> {
  let q = supabase.from('clientes').select('estado, fuente_lead, created_at')
  if (userId) q = q.eq('responsable_id', userId)
  const { data: clientes } = await q

  const estadoMap: Record<string, number> = {}
  const fuenteMap: Record<string, number> = {}
  let leadsActivos = 0, cerrados = 0, leadsEsteMes = 0
  const mesInicio = new Date()
  mesInicio.setDate(1); mesInicio.setHours(0, 0, 0, 0)

  for (const c of clientes ?? []) {
    estadoMap[c.estado] = (estadoMap[c.estado] ?? 0) + 1
    const f = c.fuente_lead ?? 'otro'
    fuenteMap[f] = (fuenteMap[f] ?? 0) + 1
    if (c.estado !== 'descartado' && c.estado !== 'compro') leadsActivos++
    if (c.estado === 'compro') cerrados++
    if (new Date(c.created_at) >= mesInicio) leadsEsteMes++
  }

  let qi = supabase.from('interacciones').select('id', { count: 'exact', head: true })
  if (userId) qi = qi.eq('user_id', userId)
  const { count: intCount } = await qi

  let qr = supabase.from('recordatorios').select('id', { count: 'exact', head: true }).eq('completado', false)
  if (userId) qr = qr.eq('user_id', userId)
  const { count: recCount } = await qr

  const porEstado = Object.entries(estadoMap)
    .map(([estado, count]) => ({ estado, count }))
    .sort((a, b) => b.count - a.count)
  const porFuente = Object.entries(fuenteMap)
    .map(([fuente, count]) => ({ fuente, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return {
    userId,
    nombre,
    totalLeads: clientes?.length ?? 0,
    leadsActivos,
    cerrados,
    leadsEsteMes,
    porEstado,
    porFuente,
    totalInteracciones: intCount ?? 0,
    recordatoriosPendientes: recCount ?? 0,
  }
}
