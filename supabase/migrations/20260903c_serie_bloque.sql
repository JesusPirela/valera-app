-- Serie diaria AGREGADA por bloque (suma de sus miembros): publicaciones,
-- seguimientos y clientes por día. Para las gráficas del sub-apartado de
-- estadísticas de cada bloque.
CREATE OR REPLACE FUNCTION public.get_actividad_diaria_serie_bloque(p_bloque_id uuid, p_desde date, p_hasta date)
 RETURNS TABLE(dia date, publicaciones integer, seguimientos integer, clientes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;
  IF (p_hasta - p_desde) > 366 THEN
    RAISE EXCEPTION 'El rango no puede ser mayor a 366 días';
  END IF;

  RETURN QUERY
  WITH miembros AS (
    SELECT id FROM profiles WHERE bloque_id = p_bloque_id
  ),
  dias AS (
    SELECT generate_series(p_desde, p_hasta, INTERVAL '1 day')::date AS d
  ),
  pub AS (
    SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM publicacion_log
    WHERE user_id IN (SELECT id FROM miembros)
      AND (created_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
  ),
  seg AS (
    SELECT (completado_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM recordatorios
    WHERE user_id IN (SELECT id FROM miembros) AND completado = true AND completado_at IS NOT NULL
      AND (completado_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
  ),
  cli AS (
    SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS d, COUNT(*) n
    FROM clientes
    WHERE responsable_id IN (SELECT id FROM miembros) AND eliminado_at IS NULL
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
$function$;
GRANT EXECUTE ON FUNCTION public.get_actividad_diaria_serie_bloque(uuid, date, date) TO authenticated;
