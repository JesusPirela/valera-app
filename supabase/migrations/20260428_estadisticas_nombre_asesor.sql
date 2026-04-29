-- Corregir top_prospectadores para mostrar el nombre del perfil en lugar del email
CREATE OR REPLACE FUNCTION get_estadisticas_admin()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(

    -- Resumen general
    'resumen', json_build_object(
      'total_propiedades',    (SELECT COUNT(*)::INT FROM propiedades),
      'total_prospectadores', (SELECT COUNT(*)::INT FROM profiles WHERE role = 'prospectador'),
      'total_vistas',         (SELECT COUNT(*)::INT FROM propiedad_actividad WHERE tipo = 'vista'),
      'total_descargas',      (SELECT COUNT(*)::INT FROM propiedad_actividad WHERE tipo = 'descarga')
    ),

    -- Top 5 propiedades más activas
    'top_propiedades', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT
          pr.codigo,
          pr.titulo,
          COUNT(*)::INT                                                       AS total,
          SUM(CASE WHEN pa.tipo = 'vista'     THEN 1 ELSE 0 END)::INT        AS vistas,
          SUM(CASE WHEN pa.tipo = 'descarga'  THEN 1 ELSE 0 END)::INT        AS descargas
        FROM propiedad_actividad pa
        JOIN propiedades pr ON pr.id = pa.propiedad_id
        GROUP BY pr.id, pr.codigo, pr.titulo
        ORDER BY total DESC
        LIMIT 5
      ) t
    ),

    -- Top 5 prospectadores más activos (con nombre del perfil)
    'top_prospectadores', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT
          au.email::TEXT                                                       AS email,
          pf.nombre                                                            AS nombre,
          COUNT(*)::INT                                                        AS total,
          SUM(CASE WHEN pa.tipo = 'vista'    THEN 1 ELSE 0 END)::INT          AS vistas,
          SUM(CASE WHEN pa.tipo = 'descarga' THEN 1 ELSE 0 END)::INT          AS descargas
        FROM propiedad_actividad pa
        JOIN auth.users au ON au.id = pa.user_id
        LEFT JOIN profiles pf ON pf.id = pa.user_id
        GROUP BY au.id, au.email, pf.nombre
        ORDER BY total DESC
        LIMIT 5
      ) t
    ),

    -- Actividad de los últimos 7 días
    'actividad_7dias', (
      SELECT COALESCE(json_agg(t ORDER BY t.dia), '[]'::json) FROM (
        SELECT
          TO_CHAR(DATE(created_at), 'DD/MM') AS dia,
          COUNT(*)::INT                       AS total
        FROM propiedad_actividad
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
