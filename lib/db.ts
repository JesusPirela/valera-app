import { Platform } from 'react-native'
import { Alert } from 'react-native'

// ── Escrituras verificadas ──────────────────────────────────────────────────
//
// Hay un fallo que NO se ve desde el fetch (ver setReporteFallos en
// supabase.ts): cuando RLS filtra las filas de un UPDATE o un DELETE, la
// operación afecta a 0 filas pero PostgREST responde 204 OK. No hay error, no
// hay status 4xx: para la app el guardado fue un éxito y el dato nunca cambió.
// Así se perdían las retros y los campos de la tabla de citas, que volvían a su
// valor anterior al recargar sin que nadie viera un aviso.
//
// La única forma de detectarlo es pedir de vuelta las filas tocadas con
// .select() y contarlas. Eso es lo que hace guardar().
//
// Uso:
//   const r = await guardar(
//     supabase.from('citas_venta').update(patch).eq('id', id).select('id'),
//     'citas_venta.update',
//   )
//   if (!r.ok) { revertirEnPantalla(); avisar(r.mensaje); return }
//
// El .select() al final NO es opcional: sin él no hay filas que contar y
// guardar() no puede distinguir un guardado real de uno bloqueado.

type RespuestaSupabase<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export type ResultadoGuardado = {
  ok: boolean
  /** 'error' = la base rechazó; 'sin_permiso' = RLS no dejó tocar ninguna fila. */
  motivo?: 'error' | 'sin_permiso'
  /** Texto listo para enseñarle al usuario. */
  mensaje: string
}

export async function guardar<T>(consulta: RespuestaSupabase<T>, etiqueta: string): Promise<ResultadoGuardado> {
  try {
    const { data, error } = await consulta
    if (error) {
      return { ok: false, motivo: 'error', mensaje: error.message || 'No se pudo guardar.' }
    }
    if (!data || data.length === 0) {
      // El fetch no reporta esto porque el servidor respondió OK; se registra aquí.
      reportar(`Guardado bloqueado (0 filas) en ${etiqueta}`)
      return {
        ok: false,
        motivo: 'sin_permiso',
        mensaje: 'No se guardó: tu cuenta no tiene permiso para modificar este registro.',
      }
    }
    return { ok: true, mensaje: '' }
  } catch (e: any) {
    return { ok: false, motivo: 'error', mensaje: e?.message ?? 'No se pudo guardar.' }
  }
}

// El reporte se inyecta igual que en supabase.ts, para no importar monitor
// aquí y evitar un ciclo de imports.
type Reportero = (mensaje: string, contexto: string) => void
let reportero: Reportero | null = null
export function setReporteGuardados(fn: Reportero): void { reportero = fn }
function reportar(mensaje: string): void { try { reportero?.(mensaje, 'guardado') } catch { /* no-op */ } }

// Aviso al usuario que SÍ se ve en web. Alert.alert de React Native no hace
// nada en la web, así que los avisos de error eran invisibles justo donde más
// se usa la app; por eso cada pantalla se había hecho su propio ayudante.
export function avisar(mensaje: string, titulo = 'Aviso'): void {
  if (Platform.OS === 'web') { try { window.alert(mensaje) } catch { /* no-op */ } }
  else Alert.alert(titulo, mensaje)
}
