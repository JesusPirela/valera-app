-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo de Reportes de Productividad (solo admins)
-- ─────────────────────────────────────────────────────────────────────────────

-- RPC principal: métricas por usuario para un rango de fechas
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
  IF v_rol IS DISTINCT FROM 'admin' THEN RETURN '[]'::jsonb; END IF;

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
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM clientes c
        WHERE c.responsable_id = p.id
          AND c.created_at BETWEEN p_inicio AND p_fin
      ) cl ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT n FROM propiedad_publicacion pp2
        WHERE pp2.user_id = p.id
          AND pp2.publicada = TRUE
          AND pp2.fecha_publicacion BETWEEN p_inicio AND p_fin
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
        SELECT COUNT(DISTINCT vp.curso_id)::INT n FROM vu_progreso vp
        WHERE vp.user_id = p.id
          AND vp.completada_at BETWEEN p_inicio AND p_fin
      ) cu ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pa.tipo = 'vista')::INT    AS vistas,
          COUNT(*) FILTER (WHERE pa.tipo = 'descarga')::INT AS descargas
        FROM propiedad_actividad pa
        WHERE pa.user_id = p.id
          AND pa.created_at BETWEEN p_inicio AND p_fin
      ) va ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (COALESCE(us.fin, NOW()) - us.inicio)) / 60
          ), 0)::INT                    AS minutos,
          MIN(us.inicio)               AS primer_acceso,
          MAX(COALESCE(us.fin, NOW())) AS ultimo_acceso
        FROM user_sessions us
        WHERE us.user_id = p.id
          AND us.inicio BETWEEN p_inicio AND p_fin
      ) hs ON TRUE
      WHERE p.role != 'admin'
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

-- RPC tendencia diaria del equipo
CREATE OR REPLACE FUNCTION get_tendencia_equipo(
  p_inicio TIMESTAMPTZ,
  p_fin    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_rol TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(d ORDER BY d.fecha)
    FROM (
      SELECT
        g.fecha::DATE::TEXT AS fecha,
        COALESCE(act.total,    0)::INT AS total_actividad,
        COALESCE(act.usuarios, 0)::INT AS usuarios_activos
      FROM generate_series(p_inicio::DATE, p_fin::DATE, '1 day') g(fecha)
      LEFT JOIN (
        SELECT d, SUM(n) AS total, COUNT(DISTINCT uid) AS usuarios
        FROM (
          SELECT DATE(created_at)    AS d, COUNT(*)::INT AS n, user_id        AS uid FROM interacciones WHERE created_at BETWEEN p_inicio AND p_fin GROUP BY DATE(created_at), user_id
          UNION ALL
          SELECT DATE(created_at)    AS d, COUNT(*)::INT AS n, responsable_id AS uid FROM clientes      WHERE created_at BETWEEN p_inicio AND p_fin GROUP BY DATE(created_at), responsable_id
          UNION ALL
          SELECT DATE(completado_at) AS d, COUNT(*)::INT AS n, user_id        AS uid FROM recordatorios WHERE completado = TRUE AND completado_at BETWEEN p_inicio AND p_fin GROUP BY DATE(completado_at), user_id
        ) combined
        GROUP BY d
      ) act ON act.d = g.fecha::DATE
    ) d
  ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION get_tendencia_equipo(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
