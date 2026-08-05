-- Exponer el estado de la cuenta (activo / inhabilitada_en) en la lista de usuarios.
DROP FUNCTION IF EXISTS get_prospectadores();

CREATE FUNCTION get_prospectadores()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  nombre          TEXT,
  created_at      TIMESTAMPTZ,
  last_seen       TIMESTAMPTZ,
  role            TEXT,
  valera_coins    INTEGER,
  app_version     TEXT,
  app_platform    TEXT,
  activo          BOOLEAN,
  inhabilitada_en TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    au.email::TEXT,
    p.nombre,
    p.created_at,
    p.last_seen,
    p.role,
    COALESCE(us.valera_coins, 0)::INTEGER,
    p.app_version,
    p.app_platform,
    p.activo,
    p.inhabilitada_en
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor', 'asesor')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT pg_notify('pgrst', 'reload schema');
