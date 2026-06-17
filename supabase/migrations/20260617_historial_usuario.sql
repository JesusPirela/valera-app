-- ══════════════════════════════════════════════════════════════
-- Historial completo por usuario (panel admin → Usuarios).
-- Dos funciones SECURITY DEFINER (solo admin/supervisor):
--   • get_resumen_usuario     → totales (tiempo conectado, publicaciones, etc.)
--   • get_historial_usuario   → timeline unificado de TODO lo que hizo el usuario
-- ══════════════════════════════════════════════════════════════

-- ── Resumen / totales ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_resumen_usuario(p_user_id uuid)
RETURNS TABLE (
  minutos_total           numeric,
  publicaciones           integer,
  clientes                integer,
  seguimientos_completados integer,
  seguimientos_pendientes integer,
  vistas                  integer,
  descargas               integer,
  certificados            integer,
  ultima_conexion         timestamptz,
  alta                    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(f.minutos) FROM public.fn_conexion_diaria('2020-01-01'::timestamptz, NULL, p_user_id) f), 0)::numeric,
    (SELECT COUNT(*) FROM public.publicacion_log     WHERE user_id = p_user_id)::int,
    (SELECT COUNT(*) FROM public.clientes            WHERE responsable_id = p_user_id)::int,
    (SELECT COUNT(*) FROM public.recordatorios       WHERE user_id = p_user_id AND completado = true)::int,
    (SELECT COUNT(*) FROM public.recordatorios       WHERE user_id = p_user_id AND completado = false)::int,
    (SELECT COUNT(*) FROM public.propiedad_actividad WHERE user_id = p_user_id AND tipo = 'vista')::int,
    (SELECT COUNT(*) FROM public.propiedad_actividad WHERE user_id = p_user_id AND tipo = 'descarga')::int,
    (SELECT COUNT(*) FROM public.vu_certificados     WHERE user_id = p_user_id)::int,
    (SELECT MAX(COALESCE(s.fin, s.inicio)) FROM public.user_sessions s WHERE s.user_id = p_user_id),
    (SELECT created_at FROM public.profiles WHERE id = p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resumen_usuario(uuid) TO authenticated;

-- ── Timeline unificado ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_historial_usuario(
  p_user_id uuid,
  p_limit   integer DEFAULT 150,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  tipo    text,
  icono   text,
  titulo  text,
  detalle text,
  fecha   timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH eventos AS (
    -- Publicaciones
    SELECT 'publicacion'::text AS tipo, '📤'::text AS icono,
           ('Publicó ' || COALESCE(pr.codigo, 'propiedad'))::text AS titulo,
           pr.titulo::text AS detalle, pl.created_at AS fecha
    FROM public.publicacion_log pl
    LEFT JOIN public.propiedades pr ON pr.id = pl.propiedad_id
    WHERE pl.user_id = p_user_id

    UNION ALL
    -- Clientes registrados
    SELECT 'cliente', '👤',
           'Registró cliente', cl.nombre::text, cl.created_at
    FROM public.clientes cl
    WHERE cl.responsable_id = p_user_id

    UNION ALL
    -- Seguimientos completados
    SELECT 'seguimiento', '✅',
           'Completó seguimiento', re.titulo::text, re.completado_at
    FROM public.recordatorios re
    WHERE re.user_id = p_user_id AND re.completado = true AND re.completado_at IS NOT NULL

    UNION ALL
    -- Recordatorios creados
    SELECT 'recordatorio', '🔔',
           'Creó recordatorio', re.titulo::text, re.created_at
    FROM public.recordatorios re
    WHERE re.user_id = p_user_id

    UNION ALL
    -- Vistas / descargas de fichas
    SELECT CASE WHEN pa.tipo = 'descarga' THEN 'descarga' ELSE 'vista' END,
           CASE WHEN pa.tipo = 'descarga' THEN '⬇️' ELSE '👁️' END,
           CASE WHEN pa.tipo = 'descarga' THEN 'Descargó ficha' ELSE 'Vio ficha' END,
           COALESCE(pr.codigo, 'propiedad')::text, pa.created_at
    FROM public.propiedad_actividad pa
    LEFT JOIN public.propiedades pr ON pr.id = pa.propiedad_id
    WHERE pa.user_id = p_user_id

    UNION ALL
    -- Certificados obtenidos
    SELECT 'certificado', '🎓',
           'Obtuvo certificado', vc.nombre_completo::text, vc.emitido_at
    FROM public.vu_certificados vc
    WHERE vc.user_id = p_user_id

    UNION ALL
    -- Conexiones
    SELECT 'conexion', '🟢',
           'Se conectó',
           (ROUND(EXTRACT(EPOCH FROM (
              LEAST(COALESCE(us.fin, us.inicio + INTERVAL '10 minutes'), us.inicio + INTERVAL '4 hours') - us.inicio
            )) / 60)::int || ' min conectado')::text,
           us.inicio
    FROM public.user_sessions us
    WHERE us.user_id = p_user_id
  )
  SELECT e.tipo, e.icono, e.titulo, e.detalle, e.fecha
  FROM eventos e
  WHERE e.fecha IS NOT NULL
  ORDER BY e.fecha DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_historial_usuario(uuid, integer, integer) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
