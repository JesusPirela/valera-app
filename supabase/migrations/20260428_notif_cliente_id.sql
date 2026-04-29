-- Agregar cliente_id a notificaciones para poder navegar al cliente al tocar
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

-- Ampliar el CHECK de tipo para incluir todos los valores usados en la app
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN ('nueva_propiedad', 'destacada', 'exclusiva', 'recordatorio', 'nuevo_cliente', 'login'));

-- Actualizar la función de nuevo cliente para guardar cliente_id
CREATE OR REPLACE FUNCTION notificar_admins_nuevo_cliente(
  p_cliente_nombre      TEXT,
  p_cliente_id          UUID,
  p_prospectador_nombre TEXT DEFAULT 'Un prospectador'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
  SELECT
    p.id,
    p_cliente_id,
    'Nuevo cliente registrado',
    p_prospectador_nombre || ' registró a: ' || p_cliente_nombre,
    'nuevo_cliente'
  FROM profiles p
  WHERE p.role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar la función de login para que use tipo correcto
CREATE OR REPLACE FUNCTION notificar_admins_login_prospectador(
  p_prospectador_nombre TEXT DEFAULT 'Un prospectador'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT
    p.id,
    'Prospectador conectado',
    p_prospectador_nombre || ' inició sesión',
    'login'
  FROM profiles p
  WHERE p.role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
