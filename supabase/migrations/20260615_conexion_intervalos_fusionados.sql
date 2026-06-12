-- =============================================================================
-- Fix definitivo de tiempo conectado: fusion de intervalos solapados.
--
-- Problema raiz: cada pestana/dispositivo abre su propia fila en user_sessions.
-- Las funciones anteriores SUMABAN sesiones paralelas: 3 pestanas x 4h = 12h
-- "conectado" cuando el usuario real estuvo 4h. Los caps (4h/sesion, 24h/dia)
-- no corrigen el solapamiento.
--
-- Solucion: fusionar intervalos solapados (gaps-and-islands) ANTES de sumar.
-- Garantias matematicas tras la fusion:
--   - El total de un dia nunca supera 24h.
--   - El total de "hoy" nunca supera el tiempo transcurrido desde medianoche.
--   - Sesiones duplicadas/paralelas cuentan una sola vez.
-- Reglas que se conservan:
--   - Sesion sin cerrar (fin IS NULL) -> se trata como 10 minutos.
--   - Cap defensivo de 4h por sesion individual (sesiones zombi).
--   - Dias calendario en hora de Mexico City (UTC-6 fijo, sin DST).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper interno: minutos de conexion por usuario y dia, con fusion
--    de intervalos. NO se expone a clientes (sin grant a authenticated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conexion_diaria(
  p_desde   TIMESTAMPTZ,
  p_hasta   TIMESTAMPTZ DEFAULT NULL,
  p_user_id UUID        DEFAULT NULL
)
RETURNS TABLE (usuario UUID, fecha DATE, minutos NUMERIC)
LANGUAGE sql STABLE
AS $$
WITH limites AS (
  SELECT p_desde AS desde, LEAST(COALESCE(p_hasta, NOW()), NOW()) AS hasta
),
-- Recortar cada sesion al rango pedido y aplicar caps individuales
sesiones AS (
  SELECT
    s.user_id AS uid,
    GREATEST(s.inicio, l.desde) AS ini,
    LEAST(
      COALESCE(s.fin, s.inicio + INTERVAL '10 minutes'),  -- sesion sin cerrar = 10 min
      s.inicio + INTERVAL '4 hours',                       -- cap por sesion: 4h
      l.hasta                                              -- nunca contar el futuro
    ) AS fin
  FROM public.user_sessions s
  CROSS JOIN limites l
  WHERE (p_user_id IS NULL OR s.user_id = p_user_id)
    AND s.inicio < l.hasta
    AND COALESCE(s.fin, s.inicio + INTERVAL '4 hours') > l.desde
),
validas AS (
  SELECT * FROM sesiones WHERE fin > ini
),
-- Gaps-and-islands: marcar inicio de cada bloque continuo de conexion
marcadas AS (
  SELECT uid, ini, fin,
    CASE WHEN ini <= MAX(fin) OVER (
           PARTITION BY uid ORDER BY ini, fin
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         )
         THEN 0 ELSE 1 END AS isla_nueva
  FROM validas
),
islas AS (
  SELECT uid, ini, fin,
    SUM(isla_nueva) OVER (PARTITION BY uid ORDER BY ini, fin) AS isla
  FROM marcadas
),
-- Cada isla = un intervalo real de conexion sin solapamientos
fusionadas AS (
  SELECT uid, MIN(ini) AS ini, MAX(fin) AS fin
  FROM islas
  GROUP BY uid, isla
),
-- Repartir cada intervalo entre los dias calendario (hora CDMX) que cruza
por_dia AS (
  SELECT
    f.uid,
    d::DATE AS dia,
    EXTRACT(EPOCH FROM (
      LEAST(f.fin AT TIME ZONE 'America/Mexico_City', d + INTERVAL '1 day')
      - GREATEST(f.ini AT TIME ZONE 'America/Mexico_City', d)
    )) / 60 AS mins
  FROM fusionadas f
  CROSS JOIN LATERAL generate_series(
    date_trunc('day', f.ini AT TIME ZONE 'America/Mexico_City'),
    date_trunc('day', f.fin AT TIME ZONE 'America/Mexico_City'),
    INTERVAL '1 day'
  ) AS d
)
SELECT uid AS usuario, dia AS fecha,
       LEAST(ROUND(SUM(mins)::NUMERIC, 0), 1440) AS minutos
FROM por_dia
WHERE mins > 0
GROUP BY uid, dia
$$;

REVOKE ALL ON FUNCTION public.fn_conexion_diaria(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_conexion_diaria(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_horas_conexion (Mi Actividad - prospectador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_horas_conexion(
  p_user_id UUID    DEFAULT NULL,
  p_dias    INTEGER DEFAULT 30
)
RETURNS TABLE (fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_desde   TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_desde := (
    ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
    AT TIME ZONE 'America/Mexico_City'
  ) AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT f.fecha, f.minutos
  FROM public.fn_conexion_diaria(v_desde, NULL, v_user_id) f
  ORDER BY f.fecha;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horas_conexion(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_conexion_todos_usuarios (vista admin "Tiempo conectado")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_conexion_todos_usuarios(p_dias INTEGER DEFAULT 7)
RETURNS TABLE (user_id UUID, nombre TEXT, fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_desde TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_desde := (((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
               AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT f.usuario, p.nombre::TEXT, f.fecha, f.minutos
  FROM public.fn_conexion_diaria(v_desde) f
  JOIN public.profiles p ON p.id = f.usuario
  ORDER BY f.fecha DESC, f.minutos DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conexion_todos_usuarios(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_total_minutos_conexion (Mi Historial - total de toda la vida)
--    Antes el frontend descargaba TODAS las filas de user_sessions y sumaba
--    en JS con reglas distintas a las del SQL. Ahora una sola llamada RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_total_minutos_conexion(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_desde   TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT MIN(inicio) INTO v_desde FROM public.user_sessions WHERE user_id = v_user_id;
  IF v_desde IS NULL THEN RETURN 0; END IF;

  RETURN COALESCE((
    SELECT SUM(f.minutos)::INTEGER
    FROM public.fn_conexion_diaria(v_desde, NULL, v_user_id) f
  ), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_minutos_conexion(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_productividad_equipo (Reportes admin) - minutos_conexion con fusion.
--    Identica a la version 20260612 salvo el bloque hs (tiempo de conexion).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_productividad_equipo(
  p_inicio TIMESTAMPTZ,
  p_fin    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_rol TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin'
     AND v_rol IS DISTINCT FROM 'supervisor'
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
        COALESCE(cl.n,  0) AS clientes_nuevos,
        COALESCE(pp.n,  0) AS propiedades_publicadas,
        COALESCE(se.n,  0) AS seguimientos,
        COALESCE(it.n,  0) AS interacciones,
        COALESCE(ci.n,  0) AS citas,
        COALESCE(cu.n,  0) AS cursos_completados,
        COALESCE(va.vistas,    0) AS vistas_propiedades,
        COALESCE(va.descargas, 0) AS descargas_propiedades,
        COALESCE(hs.minutos,   0) AS minutos_conexion,
        ha.primer_acceso,
        ha.ultimo_acceso,
        (
          COALESCE(cl.n,0)*5 + COALESCE(pp.n,0)*3 +
          COALESCE(se.n,0)*2 + COALESCE(it.n,0)*1 +
          COALESCE(ci.n,0)*4 + COALESCE(cu.n,0)*3
        ) AS actividad_total
      FROM profiles p
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM clientes c
        WHERE c.responsable_id = p.id
          AND c.created_at BETWEEN p_inicio AND p_fin
      ) cl ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM publicacion_log pl
        WHERE pl.user_id = p.id
          AND pl.created_at BETWEEN p_inicio AND p_fin
      ) pp ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM recordatorios r
        WHERE r.user_id = p.id
          AND r.completado = TRUE
          AND r.completado_at BETWEEN p_inicio AND p_fin
      ) se ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM interacciones i
        WHERE i.user_id = p.id
          AND i.created_at BETWEEN p_inicio AND p_fin
      ) it ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM citas_coordinacion cc
        WHERE cc.prospectador_id = p.id
          AND cc.created_at BETWEEN p_inicio AND p_fin
      ) ci ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM vu_certificados vc
        WHERE vc.user_id = p.id
          AND vc.emitido_at BETWEEN p_inicio AND p_fin
      ) cu ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pa.tipo = 'vista')::INT    AS vistas,
          COUNT(*) FILTER (WHERE pa.tipo = 'descarga')::INT AS descargas
        FROM propiedad_actividad pa
        WHERE pa.user_id = p.id
          AND pa.created_at BETWEEN p_inicio AND p_fin
      ) va ON TRUE
      -- Tiempo de conexion: intervalos fusionados (sin doble conteo)
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
        COALESCE(cl.n,0)*5 + COALESCE(pp.n,0)*3 +
        COALESCE(se.n,0)*2 + COALESCE(it.n,0)*1 +
        COALESCE(ci.n,0)*4 + COALESCE(cu.n,0)*3
      ) DESC
    ) u
  ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION get_productividad_equipo(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Indices para acelerar todas las consultas de tiempo y estadisticas
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_inicio  ON public.user_sessions (user_id, inicio);
CREATE INDEX IF NOT EXISTS idx_user_sessions_inicio       ON public.user_sessions (inicio);
CREATE INDEX IF NOT EXISTS idx_clientes_resp_created      ON public.clientes (responsable_id, created_at);
CREATE INDEX IF NOT EXISTS idx_interacciones_user_created ON public.interacciones (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recordatorios_user_comp    ON public.recordatorios (user_id, completado);
CREATE INDEX IF NOT EXISTS idx_prop_pub_user_fecha        ON public.propiedad_publicacion (user_id, fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_prop_actividad_user_created ON public.propiedad_actividad (user_id, created_at);
