-- Fix get_productividad_equipo:
-- • vistas_propiedades: ahora cuenta propiedades DISTINTAS con >=30s de vista
--   (la UI solo inserta 'vista' tras 30 segundos a partir de ahora; los
--    registros viejos quedan pero también cuentan como propiedades distintas)
-- • descargas_propiedades: cuenta propiedades DISTINTAS con al menos
--   una descarga de foto o ficha (no suma cada foto individualmente)

CREATE OR REPLACE FUNCTION public.get_productividad_equipo(
  p_inicio TIMESTAMPTZ,
  p_fin    TIMESTAMPTZ
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        COALESCE(cl.n,  0)             AS clientes_nuevos,
        COALESCE(pub.total, 0)         AS propiedades_publicadas,
        COALESCE(pub.unicas, 0)        AS propiedades_unicas,
        COALESCE(se.n,  0)             AS seguimientos,
        COALESCE(it.n,  0)             AS interacciones,
        COALESCE(ci.n,  0)             AS citas,
        COALESCE(cu.n,  0)             AS cursos_completados,
        -- Propiedades DISTINTAS vistas ≥30s (la UI inserta 'vista' solo tras 30s)
        COALESCE(va.vistas,    0)      AS vistas_propiedades,
        -- Propiedades DISTINTAS con al menos una descarga de foto/ficha
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
        FROM recordatorios r
        WHERE r.user_id = p.id
          AND r.completado = TRUE
          AND r.completado_at BETWEEN p_inicio AND p_fin
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
          -- Propiedades distintas vistas (una sola por propiedad aunque entren varias veces)
          COUNT(DISTINCT pa.propiedad_id) FILTER (WHERE pa.tipo = 'vista')::INT    AS vistas,
          -- Propiedades distintas descargadas (foto o ficha)
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
$$;
