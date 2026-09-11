-- ═══════════════════════════════════════════════════════════════════════════
-- Rol GERENTE: acceso de LECTURA a los datos de sus 7 pantallas de gerencia.
--
-- Dos capas:
--  A) Políticas RLS ADITIVAS (permissive) que dan SELECT al gerente en las
--     tablas que leen directamente las pantallas. Se AGREGAN sin tocar las
--     políticas existentes de admin/supervisor (no pueden romper nada previo).
--  B) Redefinición de las RPCs de LECTURA que hoy filtran a admin/supervisor,
--     agregando 'gerente'. Cada una se reproduce desde su versión VIGENTE
--     (no la original) y solo se cambia el gate de rol.
--
-- NO incluye las RPCs de ESCRITURA de bloque (marcar_asistencia_bloque,
-- marcar_reunion_bloque, marcar_metrica_bloque, marcar_contesto_hoy,
-- asignar_bloque): el gerente VE los bloques pero, por ahora, marcar
-- asistencia/reuniones sigue siendo acción de admin/supervisor. Se pueden
-- abrir en un follow-up si se requiere que el gerente también las opere.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A) Políticas RLS aditivas de SELECT para gerente ───────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes', 'citas_coordinacion', 'citas_venta', 'cierres',
    'proyectos', 'proyecto_actividades', 'proyecto_archivos',
    'bloques', 'bloque_notas', 'bloque_diario'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'gerente_select_' || t, t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'gerente'))
    $f$, 'gerente_select_' || t, t);
  END LOOP;
END $$;

-- ── B) RPCs de lectura: agregar 'gerente' al gate ──────────────────────────

-- B1) get_bloques_resumen (list de bloques). Estaba gateada solo a 'admin'.
CREATE OR REPLACE FUNCTION public.get_bloques_resumen(
  p_dias int DEFAULT 1
)
RETURNS TABLE (
  user_id         uuid,
  nombre          text,
  bloque_id       uuid,
  publicaciones   integer,
  clientes_nuevos integer,
  seguimientos    integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fin    timestamptz;
  v_inicio timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gerente')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.bloque_id,
    (SELECT COUNT(*)::int FROM public.publicacion_log pl
       WHERE pl.user_id = p.id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.clientes cl
       WHERE cl.responsable_id = p.id AND cl.created_at >= v_inicio AND cl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.recordatorios r
       WHERE r.user_id = p.id AND r.completado = true
         AND r.completado_at >= v_inicio AND r.completado_at < v_fin)
  FROM public.profiles p
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor')
  ORDER BY p.nombre;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_bloques_resumen(int) TO authenticated;

-- B2) get_actividad_diaria_serie_bloque (gráfica del bloque). Base: 20260903c.
CREATE OR REPLACE FUNCTION public.get_actividad_diaria_serie_bloque(p_bloque_id uuid, p_desde date, p_hasta date)
 RETURNS TABLE(dia date, publicaciones integer, seguimientos integer, clientes integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','gerente')) THEN
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

-- B3) get_actividad_diaria_serie + get_actividad_dia_detalle (drill-down por
--     usuario). Base: 20260714. Gate admin/supervisor → +gerente.
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
  IF p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'gerente')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_actividad_dia_detalle(
  p_user_id uuid,
  p_dia     date
)
RETURNS TABLE(tipo text, titulo text, hora text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'gerente')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 'publicacion'::text,
         COALESCE(p.codigo, 'Propiedad'),
         to_char(pl.created_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM publicacion_log pl
  LEFT JOIN propiedades p ON p.id = pl.propiedad_id
  WHERE pl.user_id = p_user_id
    AND (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  UNION ALL
  SELECT 'seguimiento'::text,
         COALESCE(r.titulo, 'Seguimiento'),
         to_char(r.completado_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM recordatorios r
  WHERE r.user_id = p_user_id AND r.completado = true AND r.completado_at IS NOT NULL
    AND (r.completado_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  UNION ALL
  SELECT 'cliente'::text,
         COALESCE(c.nombre, 'Cliente'),
         to_char(c.created_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI')
  FROM clientes c
  WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
    AND (c.created_at AT TIME ZONE 'America/Mexico_City')::date = p_dia

  ORDER BY 3;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_actividad_diaria_serie(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_actividad_dia_detalle(uuid, date)        TO authenticated, service_role;

-- B4) bloque_calendario (calendario de asistencia del bloque). Base: 20260801f.
CREATE OR REPLACE FUNCTION public.bloque_calendario(
  p_bloque_id uuid, p_desde date, p_hasta date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_res jsonb;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor', 'gerente') THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.nombre), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT p.id AS user_id, p.nombre, p.role,
      (SELECT jsonb_object_agg(to_char(d.g, 'YYYY-MM-DD'), d.m)
       FROM (
         SELECT g::date AS g, jsonb_build_object(
           'reunion', CASE
             WHEN NOT EXISTS (SELECT 1 FROM public.bloque_reuniones r
                              WHERE r.bloque_id = p_bloque_id AND r.fecha = g::date) THEN NULL
             WHEN EXISTS (SELECT 1 FROM public.bloque_asistencia a
                          WHERE a.user_id = p.id AND a.fecha = g::date AND a.asistio) THEN 'fue'
             WHEN EXISTS (SELECT 1 FROM public.bloque_asistencia a
                          WHERE a.user_id = p.id AND a.fecha = g::date AND NOT a.asistio) THEN 'no_fue'
             ELSE 'pendiente'
           END,
           'cita',    EXISTS (SELECT 1 FROM public.citas_coordinacion c
                              WHERE c.prospectador_id = p.id
                                AND (c.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'cliente', EXISTS (SELECT 1 FROM public.clientes cl
                              WHERE cl.responsable_id = p.id AND cl.eliminado_at IS NULL
                                AND (cl.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'uso',     EXISTS (SELECT 1 FROM public.user_sessions s
                              WHERE s.user_id = p.id
                                AND (s.inicio AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'publico', EXISTS (SELECT 1 FROM public.publicacion_log pl
                              WHERE pl.user_id = p.id
                                AND (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'm_cita',      EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'cita'      AND bm.valor),
           'm_cliente',   EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'cliente'   AND bm.valor),
           'm_actividad', EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'actividad' AND bm.valor)
         ) AS m
         FROM generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') g
       ) d) AS dias
    FROM public.profiles p
    WHERE p.bloque_id = p_bloque_id
      AND (p_user_id IS NULL OR p.id = p_user_id)
  ) t;
  RETURN v_res;
END $$;
GRANT EXECUTE ON FUNCTION public.bloque_calendario(uuid, date, date, uuid) TO authenticated;

-- B5) get_productividad_equipo: agregar 'gerente' al gate. Base: 20260910
--     (la versión vigente, con p.role en la salida y fn_conexion_diaria).
CREATE OR REPLACE FUNCTION public.get_productividad_equipo(p_inicio timestamp with time zone, p_fin timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rol TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin'
     AND v_rol IS DISTINCT FROM 'supervisor'
     AND v_rol IS DISTINCT FROM 'gerente'
     AND current_setting('request.jwt.claims', true)::jsonb->>'role' IS DISTINCT FROM 'service_role'
  THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(u))
    FROM (
      SELECT
        p.id,
        p.nombre,
        p.role,
        COALESCE(cl.n,  0)             AS clientes_nuevos,
        COALESCE(pub.total, 0)         AS propiedades_publicadas,
        COALESCE(pub.unicas, 0)        AS propiedades_unicas,
        COALESCE(se.n,  0)             AS seguimientos,
        COALESCE(it.n,  0)             AS interacciones,
        COALESCE(ci.n,  0)             AS citas,
        COALESCE(cu.n,  0)             AS cursos_completados,
        COALESCE(va.vistas,    0)      AS vistas_propiedades,
        COALESCE(va.descargas, 0)      AS descargas_propiedades,
        COALESCE(hs.minutos,   0)      AS minutos_conexion,
        ha.primer_acceso,
        ha.ultimo_acceso,
        (
          COALESCE(cl.n,0)     * 8 +
          COALESCE(pub.total,0)* 4 +
          COALESCE(pub.unicas,0)*5 +
          COALESCE(se.n,0)     * 5 +
          COALESCE(ci.n,0)     * 8 +
          COALESCE(cu.n,0)     * 3 +
          LEAST(COALESCE(hs.minutos,0), 600) * 0.1 +
          COALESCE(va.vistas,0)   * 0.2 +
          COALESCE(va.descargas,0)* 0.3
        )::NUMERIC(10,1) AS actividad_total
      FROM profiles p
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n
        FROM clientes c
        WHERE c.responsable_id = p.id
          AND c.created_at BETWEEN p_inicio AND p_fin
      ) cl ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INT                AS total,
          COUNT(DISTINCT pl.propiedad_id)::INT AS unicas
        FROM publicacion_log pl
        WHERE pl.user_id = p.id
          AND pl.created_at BETWEEN p_inicio AND p_fin
      ) pub ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n
        FROM seguimientos_dia sd
        WHERE sd.user_id = p.id
          AND sd.created_at BETWEEN p_inicio AND p_fin
      ) se ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n
        FROM interacciones i
        WHERE i.user_id = p.id
          AND i.created_at BETWEEN p_inicio AND p_fin
      ) it ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n
        FROM citas_coordinacion cc
        WHERE cc.prospectador_id = p.id
          AND cc.created_at BETWEEN p_inicio AND p_fin
      ) ci ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n
        FROM vu_certificados vc
        WHERE vc.user_id = p.id
          AND vc.emitido_at BETWEEN p_inicio AND p_fin
      ) cu ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT pa.propiedad_id) FILTER (WHERE pa.tipo = 'vista')::INT    AS vistas,
          COUNT(DISTINCT pa.propiedad_id) FILTER (WHERE pa.tipo = 'descarga')::INT AS descargas
        FROM propiedad_actividad pa
        WHERE pa.user_id = p.id
          AND pa.created_at BETWEEN p_inicio AND p_fin
      ) va ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(f.minutos), 0)::INT AS minutos
        FROM public.fn_conexion_diaria(p_inicio, p_fin, p.id) f
      ) hs ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MIN(us.inicio) AS primer_acceso,
          MAX(LEAST(
            COALESCE(us.fin, us.inicio + INTERVAL '10 minutes'),
            us.inicio + INTERVAL '4 hours',
            NOW()
          )) AS ultimo_acceso
        FROM user_sessions us
        WHERE us.user_id = p.id
          AND us.inicio BETWEEN p_inicio AND p_fin
      ) ha ON TRUE
      WHERE p.role IS DISTINCT FROM 'admin'
      ORDER BY (
        COALESCE(cl.n,0)     * 8 +
        COALESCE(pub.total,0)* 4 +
        COALESCE(pub.unicas,0)*5 +
        COALESCE(se.n,0)     * 5 +
        COALESCE(ci.n,0)     * 8 +
        COALESCE(cu.n,0)     * 3 +
        LEAST(COALESCE(hs.minutos,0), 600) * 0.1 +
        COALESCE(va.vistas,0)   * 0.2 +
        COALESCE(va.descargas,0)* 0.3
      ) DESC
    ) u
  ), '[]'::jsonb);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_productividad_equipo(timestamp with time zone, timestamp with time zone) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
