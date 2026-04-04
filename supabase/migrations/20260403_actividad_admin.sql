-- =========================================================
-- RPC para que el admin vea actividad de prospectadores
-- (necesita SECURITY DEFINER para leer auth.users)
-- =========================================================

CREATE OR REPLACE FUNCTION get_actividad_prospectadores()
RETURNS TABLE (
  id                  UUID,
  propiedad_id        UUID,
  user_id             UUID,
  tipo                TEXT,
  created_at          TIMESTAMPTZ,
  propiedad_codigo    TEXT,
  propiedad_titulo    TEXT,
  prospectador_email  TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.id,
    pa.propiedad_id,
    pa.user_id,
    pa.tipo,
    pa.created_at,
    pr.codigo::TEXT,
    pr.titulo::TEXT,
    au.email::TEXT
  FROM propiedad_actividad pa
  JOIN propiedades pr ON pr.id = pa.propiedad_id
  JOIN auth.users au  ON au.id = pa.user_id
  ORDER BY pa.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
