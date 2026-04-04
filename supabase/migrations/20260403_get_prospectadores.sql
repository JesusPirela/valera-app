-- =========================================================
-- RPC para listar prospectadores con su email (SECURITY DEFINER
-- para poder acceder a auth.users)
-- =========================================================

CREATE OR REPLACE FUNCTION get_prospectadores()
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, au.email::TEXT, p.created_at
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.role = 'prospectador'
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
