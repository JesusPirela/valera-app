-- =========================================================
-- Propiedades destacadas + tracking de actividad
-- =========================================================

-- 1. Columnas en propiedades
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS destacada         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS destacada_mensaje TEXT;

-- 2. Tipo en notificaciones
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'nueva_propiedad'
    CHECK (tipo IN ('nueva_propiedad', 'destacada'));

-- =========================================================
-- Tabla de actividad (vistas y descargas por prospectador)
-- =========================================================

CREATE TABLE IF NOT EXISTS propiedad_actividad (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id  UUID        NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo          TEXT        NOT NULL CHECK (tipo IN ('vista', 'descarga')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actividad_propiedad ON propiedad_actividad(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_actividad_user      ON propiedad_actividad(user_id);

-- RLS
ALTER TABLE propiedad_actividad ENABLE ROW LEVEL SECURITY;

-- Prospectadores insertan su propia actividad
CREATE POLICY "actividad_insert_own" ON propiedad_actividad
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins ven todo; prospectadores solo su propia
CREATE POLICY "actividad_select" ON propiedad_actividad
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================================
-- Trigger: auto-destacar cuando 3 prospectadores distintos
-- hayan visto o descargado la misma propiedad
-- =========================================================

CREATE OR REPLACE FUNCTION check_actividad_destacar()
RETURNS TRIGGER AS $$
DECLARE
  v_usuarios_distintos INT;
  v_titulo             TEXT;
  v_codigo             TEXT;
  v_ya_destacada       BOOLEAN;
BEGIN
  SELECT COUNT(DISTINCT user_id)
  INTO v_usuarios_distintos
  FROM propiedad_actividad
  WHERE propiedad_id = NEW.propiedad_id;

  IF v_usuarios_distintos >= 3 THEN
    SELECT destacada, titulo, codigo
    INTO v_ya_destacada, v_titulo, v_codigo
    FROM propiedades
    WHERE id = NEW.propiedad_id;

    IF NOT v_ya_destacada THEN
      UPDATE propiedades
      SET destacada         = TRUE,
          destacada_mensaje = 'Esta propiedad está siendo muy vista por los prospectadores'
      WHERE id = NEW.propiedad_id;

      INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
      SELECT
        p.id,
        NEW.propiedad_id,
        'Propiedad con mucho interés',
        v_codigo || ' – ' || v_titulo || ' está siendo muy vista y descargada por los prospectadores.'
      FROM profiles p
      WHERE p.role = 'prospectador';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_actividad_destacar ON propiedad_actividad;

CREATE TRIGGER trigger_actividad_destacar
  AFTER INSERT ON propiedad_actividad
  FOR EACH ROW
  EXECUTE FUNCTION check_actividad_destacar();

-- =========================================================
-- RPC: admin destaca manualmente con mensaje personalizado
-- =========================================================

CREATE OR REPLACE FUNCTION destacar_propiedad_manual(p_id UUID, p_mensaje TEXT DEFAULT NULL)
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
      destacada_mensaje = v_msg
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

-- =========================================================
-- RPC: admin quita el destacado
-- =========================================================

CREATE OR REPLACE FUNCTION quitar_destacada(p_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE propiedades
  SET destacada         = FALSE,
      destacada_mensaje = NULL
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
