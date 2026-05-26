-- =========================================================
-- RPC para listar prospectadores con su email (SECURITY DEFINER
-- para poder acceder a auth.users)
-- =========================================================

CREATE OR REPLACE FUNCTION get_prospectadores()
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  created_at TIMESTAMPTZ,
  last_seen  TIMESTAMPTZ,
  role       TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, au.email::TEXT, p.created_at, p.last_seen, p.role
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
