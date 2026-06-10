-- ─────────────────────────────────────────────────────────────────────────────
-- Cofres v2: historial de niveles + historial de entregas + RPCs corregidos
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabla para registrar qué niveles ya le dieron cofres a cada usuario
CREATE TABLE IF NOT EXISTS cofres_nivel_historia (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nivel          INT         NOT NULL,
  cofres_otorgados INT       NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nivel)
);
ALTER TABLE cofres_nivel_historia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_see_own_nivel" ON cofres_nivel_historia FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_all_nivel" ON cofres_nivel_historia FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. Tabla para historial de cofres entregados por admins
CREATE TABLE IF NOT EXISTS cofres_entregas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       UUID        NOT NULL REFERENCES profiles(id),
  target_user_id UUID        NOT NULL REFERENCES profiles(id),
  admin_nombre   TEXT,
  target_nombre  TEXT,
  cantidad       INT         NOT NULL,
  nota           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cofres_entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_entregas" ON cofres_entregas FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. RPC admin_regalar_cofre — versión corregida con historial y errores descriptivos
CREATE OR REPLACE FUNCTION admin_regalar_cofre(
  p_target_user_id UUID,
  p_cantidad       INT  DEFAULT 1,
  p_nota           TEXT DEFAULT 'El equipo Valera te regala este cofre misterioso 🎁'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rol          TEXT;
  v_admin_nombre TEXT;
  v_target_nombre TEXT;
BEGIN
  -- Validar admin
  SELECT role, nombre INTO v_rol, v_admin_nombre FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;

  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  IF p_cantidad > 999 THEN
    RAISE EXCEPTION 'La cantidad no puede superar 999';
  END IF;

  -- Verificar usuario destino
  SELECT nombre INTO v_target_nombre FROM profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario destino no encontrado';
  END IF;

  -- Incrementar cofres_pendientes (crea fila si no existe)
  INSERT INTO user_stats(id, cofres_pendientes)
  VALUES (p_target_user_id, p_cantidad)
  ON CONFLICT (id) DO UPDATE
    SET cofres_pendientes = user_stats.cofres_pendientes + EXCLUDED.cofres_pendientes;

  -- Registrar en historial
  INSERT INTO cofres_entregas(admin_id, target_user_id, admin_nombre, target_nombre, cantidad, nota)
  VALUES (auth.uid(), p_target_user_id, v_admin_nombre, v_target_nombre, p_cantidad, p_nota);

  -- Notificación al usuario
  INSERT INTO notificaciones(user_id, titulo, mensaje, tipo)
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

-- 4. RPC claim_cofres_nivel — reclamar cofres por subir de nivel (idempotente)
CREATE OR REPLACE FUNCTION claim_cofres_nivel(p_nivel INT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cofres INT := 0;
BEGIN
  -- Calcular cuántos cofres corresponden a este nivel
  IF    p_nivel = 1                              THEN v_cofres := 2;
  ELSIF p_nivel = 5                              THEN v_cofres := 1;
  ELSIF p_nivel >= 10 AND p_nivel % 10 = 0      THEN v_cofres := 2;
  ELSE  v_cofres := 0;
  END IF;

  IF v_cofres = 0 THEN RETURN 0; END IF;

  -- Insertar en historial; la restricción UNIQUE evita duplicados
  BEGIN
    INSERT INTO cofres_nivel_historia(user_id, nivel, cofres_otorgados)
    VALUES (auth.uid(), p_nivel, v_cofres);
  EXCEPTION WHEN unique_violation THEN
    RETURN 0;  -- Ya fue reclamado
  END;

  -- Otorgar cofres al usuario
  INSERT INTO user_stats(id, cofres_pendientes)
  VALUES (auth.uid(), v_cofres)
  ON CONFLICT (id) DO UPDATE
    SET cofres_pendientes = user_stats.cofres_pendientes + EXCLUDED.cofres_pendientes;

  RETURN v_cofres;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_cofres_nivel(INT) TO authenticated;

-- 5. RPC get_cofres_stats — estadísticas de cofres para un usuario
CREATE OR REPLACE FUNCTION get_cofres_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pendientes   INT;
  v_abiertos     INT;
  v_nivel_total  INT;
BEGIN
  SELECT COALESCE(cofres_pendientes, 0) INTO v_pendientes
  FROM user_stats WHERE id = auth.uid();

  SELECT COUNT(*)::INT INTO v_abiertos
  FROM store_compras
  WHERE user_id = auth.uid() AND es_ruleta = TRUE;

  SELECT COALESCE(SUM(cofres_otorgados), 0)::INT INTO v_nivel_total
  FROM cofres_nivel_historia
  WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'pendientes',   COALESCE(v_pendientes, 0),
    'abiertos',     COALESCE(v_abiertos, 0),
    'nivel_total',  COALESCE(v_nivel_total, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_cofres_stats() TO authenticated;
