-- =========================================================
-- Función para notificar a todos los admins cuando se
-- registra un nuevo cliente en el CRM
-- =========================================================

CREATE OR REPLACE FUNCTION notificar_admins_nuevo_cliente(
  p_cliente_nombre  TEXT,
  p_cliente_id      UUID,
  p_prospectador_nombre TEXT DEFAULT 'Un prospectador'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notificaciones (user_id, titulo, mensaje)
  SELECT
    p.id,
    'Nuevo cliente registrado',
    p_prospectador_nombre || ' registró a: ' || p_cliente_nombre
  FROM profiles p
  WHERE p.role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
