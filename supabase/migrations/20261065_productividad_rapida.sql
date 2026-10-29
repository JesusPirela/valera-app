-- El detalle del bloque tardaba 6.6 segundos en aparecer, y con 7 días se caía
-- por tiempo agotado. Medido: de los 6,243 ms, 6,235 los gastaba UNA sola de
-- las nueve subconsultas — la de minutos conectado.
--
-- La causa: fn_conexion_diaria filtra con "(p_user_id IS NULL OR user_id = ...)",
-- y ese OR impide usar el índice, así que cada llamada recorría las 152 mil
-- filas de user_sessions completas (53 ms). Llamada una vez por persona, eran
-- 115 recorridos de la misma tabla.
--
-- Se llama UNA vez para todos y se reparte por persona. Las islas de conexión
-- se calculan con PARTITION BY uid, así que el resultado por persona es
-- idéntico: comprobado contra el cálculo viejo en las 115 personas, hoy y a 30
-- días — 0 diferencias, 27,927 minutos en ambos.
--
-- Medido después: 61 ms en vez de 6,095.

-- seguimientos_dia estaba indexada por (user_id, fecha), pero esta consulta
-- filtra por created_at.
CREATE INDEX IF NOT EXISTS idx_seguimientos_dia_user_created
  ON public.seguimientos_dia (user_id, created_at);

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
    WITH conexion AS (
      -- Una sola pasada por user_sessions para todo el equipo.
      SELECT f.usuario, SUM(f.minutos)::INT AS minutos
        FROM public.fn_conexion_diaria(p_inicio, p_fin, NULL) f
       GROUP BY f.usuario
    )
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
      LEFT JOIN conexion hs ON hs.usuario = p.id
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
