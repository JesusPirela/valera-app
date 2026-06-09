-- Agrega contador de cofres regalados a user_stats
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS cofres_pendientes INT NOT NULL DEFAULT 0;

-- Admin regala cofres a un usuario
CREATE OR REPLACE FUNCTION admin_regalar_cofre(
  p_target_user_id UUID,
  p_cantidad       INT  DEFAULT 1,
  p_nota           TEXT DEFAULT 'El equipo Valera te regala este cofre misterioso 🎁'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN RETURN FALSE; END IF;
  IF p_cantidad <= 0 OR p_cantidad > 100 THEN RETURN FALSE; END IF;

  INSERT INTO user_stats(id, cofres_pendientes)
  VALUES (p_target_user_id, p_cantidad)
  ON CONFLICT (id) DO UPDATE
    SET cofres_pendientes = user_stats.cofres_pendientes + EXCLUDED.cofres_pendientes;

  INSERT INTO notificaciones(user_id, titulo, cuerpo, tipo)
  VALUES (
    p_target_user_id,
    '🎁 ¡Te regalaron ' || p_cantidad || CASE WHEN p_cantidad = 1 THEN ' cofre gratis!' ELSE ' cofres gratis!' END,
    p_nota,
    'sistema'
  );

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_regalar_cofre(UUID, INT, TEXT) TO authenticated;

-- Usuario consume un cofre pendiente (gratis)
CREATE OR REPLACE FUNCTION usar_cofre_pendiente()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_stats
  SET cofres_pendientes = cofres_pendientes - 1
  WHERE id = auth.uid() AND cofres_pendientes > 0;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION usar_cofre_pendiente() TO authenticated;
