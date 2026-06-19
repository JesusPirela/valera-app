-- ═══════════════════════════════════════════════════════════════════════════
-- Registrar qué versión de la app y plataforma (ios/android/web) usa cada
-- usuario, para mostrarlo en la card de cada usuario en Usuarios.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_version  TEXT,
  ADD COLUMN IF NOT EXISTS app_platform TEXT;

DROP FUNCTION IF EXISTS get_prospectadores();

CREATE FUNCTION get_prospectadores()
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  nombre        TEXT,
  created_at    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ,
  role          TEXT,
  valera_coins  INTEGER,
  app_version   TEXT,
  app_platform  TEXT
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
    p.app_platform
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor', 'asesor')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT pg_notify('pgrst', 'reload schema');
