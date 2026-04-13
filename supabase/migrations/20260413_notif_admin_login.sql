-- =========================================================
-- Función para notificar a todos los admins cuando un
-- prospectador inicia sesión en la aplicación
-- =========================================================

CREATE OR REPLACE FUNCTION notificar_admins_login_prospectador(
  p_prospectador_nombre TEXT DEFAULT 'Un prospectador'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notificaciones (user_id, titulo, mensaje)
  SELECT
    p.id,
    'Prospectador conectado',
    p_prospectador_nombre || ' inició sesión'
  FROM profiles p
  WHERE p.role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
