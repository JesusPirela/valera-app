-- =========================================================
-- Incluir 'supervisor' en get_prospectadores para que los
-- usuarios promovidos a supervisor sigan apareciendo en
-- la pantalla de gestión de prospectadores
-- =========================================================

CREATE OR REPLACE FUNCTION get_prospectadores()
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  nombre        TEXT,
  created_at    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ,
  role          TEXT,
  valera_coins  INTEGER
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
    COALESCE(us.valera_coins, 0)::INTEGER
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT pg_notify('pgrst', 'reload schema');
