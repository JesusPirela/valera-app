-- ═══════════════════════════════════════════════════════════════════════════
-- Actividad diaria de un usuario para gráficas (14/jul/2026)
--
-- Objetivo: que el admin vea el rendimiento de cada usuario por día en un rango
-- (típicamente el mes) — publicaciones y seguimientos por día — y al tocar un
-- día, ver qué hizo exactamente ese día. Si la gráfica va de bajada, el usuario
-- bajó su actividad y hay que darle atención.
--
-- Los días se agrupan en calendario de MÉXICO (no UTC), consistente con el
-- resto de la app.
-- ═══════════════════════════════════════════════════════════════════════════

-- Serie diaria: una fila por día del rango (con ceros en los días sin actividad,
-- para que la gráfica no tenga huecos).
CREATE OR REPLACE FUNCTION public.get_actividad_diaria_serie(
  p_user_id uuid,
  p_desde   date,
  p_hasta   date
)
RETURNS TABLE(dia date, publicaciones integer, seguimientos integer, clientes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_dias integer;
BEGIN
  -- Solo admin/supervisor (o el propio usuario) puede ver esto.
  IF p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  -- Tope de seguridad: máximo ~1 año para no generar series gigantes.
  v_dias := (p_hasta - p_desde);
  IF v_dias > 366 THEN
    RAISE EXCEPTION 'El rango no puede ser mayor a 366 días';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(p_desde, p_hasta, INTERVAL '1 day')::date AS d
  ),
  pub AS (
    SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM publicacion_log
    WHERE user_id = p_user_id
      AND (created_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
  ),
  seg AS (
    SELECT (completado_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM recordatorios
    WHERE user_id = p_user_id AND completado = true AND completado_at IS NOT NULL
      AND (completado_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
  ),
  cli AS (
    SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM clientes
    WHERE responsable_id = p_user_id AND eliminado_at IS NULL
      AND (created_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
  )
  SELECT dias.d,
         COALESCE(pub.n, 0)::integer,
         COALESCE(seg.n, 0)::integer,
         COALESCE(cli.n, 0)::integer
  FROM dias
  LEFT JOIN pub ON pub.d = dias.d
  LEFT JOIN seg ON seg.d = dias.d
  LEFT JOIN cli ON cli.d = dias.d
  ORDER BY dias.d;
END;
$fn$;

-- Detalle de UN día: qué publicó, qué seguimientos cerró y qué clientes registró.
CREATE OR REPLACE FUNCTION public.get_actividad_dia_detalle(
  p_user_id uuid,
  p_dia     date
)
RETURNS TABLE(tipo text, titulo text, hora text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  -- Publicaciones (código de la propiedad)
  SELECT 'publicacion'::text,
         COALESCE(p.codigo, 'Propiedad'),
         to_char(pl.created_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM publicacion_log pl
  LEFT JOIN propiedades p ON p.id = pl.propiedad_id
  WHERE pl.user_id = p_user_id
    AND (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  UNION ALL
  -- Seguimientos completados
  SELECT 'seguimiento'::text,
         COALESCE(r.titulo, 'Seguimiento'),
         to_char(r.completado_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM recordatorios r
  WHERE r.user_id = p_user_id AND r.completado = true AND r.completado_at IS NOT NULL
    AND (r.completado_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  UNION ALL
  -- Clientes registrados
  SELECT 'cliente'::text,
         COALESCE(c.nombre, 'Cliente'),
         to_char(c.created_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM clientes c
  WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
    AND (c.created_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  ORDER BY 3;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_actividad_diaria_serie(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_actividad_dia_detalle(uuid, date)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_actividad_diaria_serie(uuid, date, date) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_actividad_dia_detalle(uuid, date)        TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
