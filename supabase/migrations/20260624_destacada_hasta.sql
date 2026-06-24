-- =========================================================
-- Propiedades destacadas: columna de expiración + RPC con días
-- =========================================================

-- 1. Nueva columna: hasta cuándo estará destacada (NULL = indefinido)
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS destacada_hasta TIMESTAMPTZ;

-- 2. Actualizar RPC manual para aceptar duración en días (opcional)
CREATE OR REPLACE FUNCTION destacar_propiedad_manual(
  p_id      UUID,
  p_mensaje TEXT    DEFAULT NULL,
  p_dias    INT     DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_titulo TEXT;
  v_codigo TEXT;
  v_msg    TEXT;
BEGIN
  SELECT titulo, codigo INTO v_titulo, v_codigo FROM propiedades WHERE id = p_id;

  v_msg := COALESCE(
    NULLIF(TRIM(p_mensaje), ''),
    'El administrador ha destacado esta propiedad como una oportunidad especial.'
  );

  UPDATE propiedades
  SET destacada         = TRUE,
      destacada_mensaje = v_msg,
      destacada_hasta   = CASE
        WHEN p_dias IS NOT NULL THEN NOW() + (p_dias || ' days')::INTERVAL
        ELSE NULL
      END
  WHERE id = p_id;

  INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
  SELECT
    p.id,
    p_id,
    'Propiedad destacada',
    v_codigo || ' – ' || v_titulo || ': ' || v_msg,
    'destacada'
  FROM profiles p
  WHERE p.role = 'prospectador';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. quitar_destacada también limpia la fecha de expiración
CREATE OR REPLACE FUNCTION quitar_destacada(p_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE propiedades
  SET destacada         = FALSE,
      destacada_mensaje = NULL,
      destacada_hasta   = NULL
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Función para expirar propiedades cuyo plazo venció
--    Se puede llamar desde la app o programar con pg_cron.
CREATE OR REPLACE FUNCTION expirar_propiedades_destacadas()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expiradas AS (
    UPDATE propiedades
    SET destacada         = FALSE,
        destacada_mensaje = NULL,
        destacada_hasta   = NULL
    WHERE destacada = TRUE
      AND destacada_hasta IS NOT NULL
      AND destacada_hasta < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expiradas;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
