-- ─────────────────────────────────────────────────────────────────────────────
-- Corrección: propiedades_publicadas en get_productividad_equipo
-- Antes: COUNT(*) FROM propiedad_publicacion → devolvía 1 aunque la propiedad
--        se publicara 10 veces (UNIQUE constraint por propiedad+usuario).
-- Ahora: COUNT(*) FROM publicacion_log → cada publicación es una fila real
--        con su timestamp exacto (tabla creada en 20260611_publicacion_log.sql).
-- ─────────────────────────────────────────────────────────────────────────────

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
        hs.primer_acceso,
        hs.ultimo_acceso,
        (
          COALESCE(cl.n,0)*5 + COALESCE(pp.n,0)*3 +
          COALESCE(se.n,0)*2 + COALESCE(it.n,0)*1 +
          COALESCE(ci.n,0)*4 + COALESCE(cu.n,0)*3
        ) AS actividad_total
      FROM profiles p
      -- Clientes nuevos
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM clientes c
        WHERE c.responsable_id = p.id
          AND c.created_at BETWEEN p_inicio AND p_fin
      ) cl ON TRUE
      -- CORREGIDO: usar publicacion_log (una fila por evento) en vez de
      -- propiedad_publicacion (una fila por propiedad — undercounting)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM publicacion_log pl
        WHERE pl.user_id = p.id
          AND pl.created_at BETWEEN p_inicio AND p_fin
      ) pp ON TRUE
      -- Seguimientos completados
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM recordatorios r
        WHERE r.user_id = p.id
          AND r.completado = TRUE
          AND r.completado_at BETWEEN p_inicio AND p_fin
      ) se ON TRUE
      -- Interacciones
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM interacciones i
        WHERE i.user_id = p.id
          AND i.created_at BETWEEN p_inicio AND p_fin
      ) it ON TRUE
      -- Citas coordinadas
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM citas_coordinacion cc
        WHERE cc.prospectador_id = p.id
          AND cc.created_at BETWEEN p_inicio AND p_fin
      ) ci ON TRUE
      -- Cursos completados (certificados)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM vu_certificados vc
        WHERE vc.user_id = p.id
          AND vc.emitido_at BETWEEN p_inicio AND p_fin
      ) cu ON TRUE
      -- Vistas y descargas de propiedades
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pa.tipo = 'vista')::INT    AS vistas,
          COUNT(*) FILTER (WHERE pa.tipo = 'descarga')::INT AS descargas
        FROM propiedad_actividad pa
        WHERE pa.user_id = p.id
          AND pa.created_at BETWEEN p_inicio AND p_fin
      ) va ON TRUE
      -- Tiempo de conexión con triple cap: sesión→10min, sesión→4h, día→24h
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(daily_mins), 0)::INT AS minutos,
          MIN(primer_inicio)                AS primer_acceso,
          MAX(ultimo_acceso_dia)            AS ultimo_acceso
        FROM (
          SELECT
            DATE(us.inicio) AS dia,
            LEAST(
              SUM(LEAST(
                EXTRACT(EPOCH FROM (
                  COALESCE(us.fin, us.inicio + INTERVAL '10 minutes') - us.inicio
                )) / 60,
                240
              )),
              1440
            ) AS daily_mins,
            MIN(us.inicio)                                                 AS primer_inicio,
            MAX(COALESCE(us.fin, us.inicio + INTERVAL '10 minutes'))       AS ultimo_acceso_dia
          FROM user_sessions us
          WHERE us.user_id = p.id
            AND us.inicio BETWEEN p_inicio AND p_fin
          GROUP BY DATE(us.inicio)
        ) daily_data
      ) hs ON TRUE
      WHERE p.role NOT IN ('admin', 'supervisor')
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
