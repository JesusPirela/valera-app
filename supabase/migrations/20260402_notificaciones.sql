-- =========================================================
-- Tabla de notificaciones para usuarios prospectadores
-- =========================================================

CREATE TABLE IF NOT EXISTS notificaciones (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  propiedad_id  UUID        REFERENCES propiedades(id) ON DELETE SET NULL,
  titulo        TEXT        NOT NULL,
  mensaje       TEXT        NOT NULL,
  leida         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas por usuario
CREATE INDEX IF NOT EXISTS idx_notificaciones_user_id ON notificaciones(user_id);

-- RLS: cada usuario solo ve y modifica sus propias notificaciones
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON notificaciones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notif_update_own" ON notificaciones
  FOR UPDATE USING (auth.uid() = user_id);

-- El trigger necesita poder insertar sin restricciones de RLS
CREATE POLICY "notif_insert_service" ON notificaciones
  FOR INSERT WITH CHECK (true);

-- =========================================================
-- Función que genera notificaciones al publicar una propiedad
-- =========================================================

CREATE OR REPLACE FUNCTION notify_prospectadors_nueva_propiedad()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje)
  SELECT
    p.id,
    NEW.id,
    'Nueva propiedad disponible',
    'Se publicó: ' || NEW.titulo || ' (' || COALESCE(NEW.codigo, '—') || ') en ' || NEW.direccion
  FROM profiles p
  WHERE p.role = 'prospectador';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: se ejecuta después de cada INSERT en propiedades
DROP TRIGGER IF EXISTS trigger_nueva_propiedad ON propiedades;

CREATE TRIGGER trigger_nueva_propiedad
  AFTER INSERT ON propiedades
  FOR EACH ROW
  EXECUTE FUNCTION notify_prospectadors_nueva_propiedad();
