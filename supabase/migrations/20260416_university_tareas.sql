-- =========================================================
-- Valera University — Tareas, Entregas y Configuración
-- =========================================================

-- ── Config global (video intro, etc.) ─────────────────────
CREATE TABLE IF NOT EXISTS vu_config (
  clave   TEXT PRIMARY KEY,
  valor   TEXT
);

ALTER TABLE vu_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_config_read_all" ON vu_config FOR SELECT USING (true);

CREATE POLICY "vu_config_admin_write" ON vu_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO vu_config (clave, valor)
VALUES
  ('intro_video_url', ''),
  ('intro_video_titulo', 'Bienvenido a Valera University')
ON CONFLICT DO NOTHING;

-- ── Tareas por lección ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_tareas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id      UUID        NOT NULL REFERENCES vu_lecciones(id) ON DELETE CASCADE,
  curso_id        UUID        NOT NULL REFERENCES vu_cursos(id)    ON DELETE CASCADE,
  titulo          TEXT        NOT NULL,
  descripcion     TEXT,
  requiere_archivo BOOLEAN    NOT NULL DEFAULT FALSE,
  obligatoria     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vu_tareas_leccion ON vu_tareas(leccion_id);
ALTER TABLE vu_tareas ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer tareas (para ver qué deben entregar)
CREATE POLICY "vu_tareas_select" ON vu_tareas FOR SELECT USING (true);

-- Solo admins pueden crear/editar/borrar
CREATE POLICY "vu_tareas_admin_write" ON vu_tareas FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Entregas / Submissions ────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_entregas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tarea_id        UUID        NOT NULL REFERENCES vu_tareas(id)  ON DELETE CASCADE,
  leccion_id      UUID        NOT NULL REFERENCES vu_lecciones(id) ON DELETE CASCADE,
  curso_id        UUID        NOT NULL REFERENCES vu_cursos(id)    ON DELETE CASCADE,
  respuesta_texto TEXT,
  archivo_url     TEXT,
  archivo_nombre  TEXT,
  estado          TEXT        NOT NULL DEFAULT 'pendiente',
  -- pendiente | aprobada | necesita_mejorar
  calificacion    INT,
  feedback        TEXT,
  revisado_at     TIMESTAMPTZ,
  revisado_por    UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tarea_id)
);

CREATE INDEX IF NOT EXISTS idx_vu_entregas_tarea   ON vu_entregas(tarea_id);
CREATE INDEX IF NOT EXISTS idx_vu_entregas_user    ON vu_entregas(user_id);
CREATE INDEX IF NOT EXISTS idx_vu_entregas_estado  ON vu_entregas(estado);
CREATE INDEX IF NOT EXISTS idx_vu_entregas_curso   ON vu_entregas(curso_id);
ALTER TABLE vu_entregas ENABLE ROW LEVEL SECURITY;

-- Usuarios ven y modifican sus propias entregas
CREATE POLICY "vu_entregas_own" ON vu_entregas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admins ven y modifican todas
CREATE POLICY "vu_entregas_admin" ON vu_entregas FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── auto updated_at en entregas ───────────────────────────
CREATE OR REPLACE FUNCTION update_vu_entregas_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vu_entregas_updated_at ON vu_entregas;
CREATE TRIGGER vu_entregas_updated_at
  BEFORE UPDATE ON vu_entregas
  FOR EACH ROW EXECUTE FUNCTION update_vu_entregas_updated_at();

-- ── RPC: entregar_tarea ───────────────────────────────────
-- Guarda la entrega y si todas las tareas obligatorias están entregadas,
-- llama internamente a completar_leccion para registrar el progreso.
CREATE OR REPLACE FUNCTION entregar_tarea(
  p_tarea_id      UUID,
  p_leccion_id    UUID,
  p_curso_id      UUID,
  p_respuesta     TEXT DEFAULT NULL,
  p_archivo_url   TEXT DEFAULT NULL,
  p_archivo_nombre TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_total_oblig     INT;
  v_entregadas      INT;
  v_leccion_done    BOOLEAN := FALSE;
  v_res             JSON;
BEGIN
  -- Upsert entrega
  INSERT INTO vu_entregas (user_id, tarea_id, leccion_id, curso_id, respuesta_texto, archivo_url, archivo_nombre)
  VALUES (v_user_id, p_tarea_id, p_leccion_id, p_curso_id, p_respuesta, p_archivo_url, p_archivo_nombre)
  ON CONFLICT (user_id, tarea_id) DO UPDATE SET
    respuesta_texto = EXCLUDED.respuesta_texto,
    archivo_url     = EXCLUDED.archivo_url,
    archivo_nombre  = EXCLUDED.archivo_nombre,
    estado          = 'pendiente',
    updated_at      = NOW();

  -- Verificar si todas las tareas obligatorias de la lección están entregadas
  SELECT COUNT(*) INTO v_total_oblig
  FROM vu_tareas WHERE leccion_id = p_leccion_id AND obligatoria = TRUE;

  SELECT COUNT(*) INTO v_entregadas
  FROM vu_entregas ve
  JOIN vu_tareas vt ON vt.id = ve.tarea_id
  WHERE ve.user_id = v_user_id AND ve.leccion_id = p_leccion_id AND vt.obligatoria = TRUE;

  IF v_total_oblig > 0 AND v_entregadas >= v_total_oblig THEN
    -- Marcar lección como completada
    SELECT completar_leccion(p_leccion_id, p_curso_id) INTO v_res;
    v_leccion_done := TRUE;
  END IF;

  RETURN json_build_object(
    'ok', TRUE,
    'leccion_completada', v_leccion_done,
    'resultado', v_res
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: calificar_entrega (admin) ────────────────────────
CREATE OR REPLACE FUNCTION calificar_entrega(
  p_entrega_id    UUID,
  p_estado        TEXT,
  p_calificacion  INT DEFAULT NULL,
  p_feedback      TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  -- Verificar que es admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE vu_entregas
  SET
    estado        = p_estado,
    calificacion  = p_calificacion,
    feedback      = p_feedback,
    revisado_at   = NOW(),
    revisado_por  = v_admin_id
  WHERE id = p_entrega_id;

  -- Si fue aprobada, notificar al usuario
  IF p_estado = 'aprobada' THEN
    INSERT INTO notificaciones (user_id, titulo, mensaje)
    SELECT
      ve.user_id,
      '✅ Tarea aprobada',
      'Tu entrega para "' || vt.titulo || '" fue aprobada.' ||
      CASE WHEN p_calificacion IS NOT NULL THEN ' Calificación: ' || p_calificacion ELSE '' END
    FROM vu_entregas ve
    JOIN vu_tareas vt ON vt.id = ve.tarea_id
    WHERE ve.id = p_entrega_id;
  ELSIF p_estado = 'necesita_mejorar' THEN
    INSERT INTO notificaciones (user_id, titulo, mensaje)
    SELECT
      ve.user_id,
      '📝 Revisa tu tarea',
      'Tu entrega para "' || vt.titulo || '" necesita mejoras.' ||
      CASE WHEN p_feedback IS NOT NULL THEN ' Comentario: ' || p_feedback ELSE '' END
    FROM vu_entregas ve
    JOIN vu_tareas vt ON vt.id = ve.tarea_id
    WHERE ve.id = p_entrega_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Stats admin: agregar conteo de entregas pendientes ────
CREATE OR REPLACE FUNCTION get_vu_stats_admin()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'total_cursos',      (SELECT COUNT(*)::INT FROM vu_cursos),
    'cursos_publicados', (SELECT COUNT(*)::INT FROM vu_cursos WHERE publicado = TRUE),
    'total_cert',        (SELECT COUNT(*)::INT FROM vu_certificados),
    'total_puntos',      (SELECT COALESCE(SUM(puntos),0)::INT FROM vu_puntos),
    'entregas_pendientes', (SELECT COUNT(*)::INT FROM vu_entregas WHERE estado = 'pendiente'),
    'ranking', (
      SELECT COALESCE(json_agg(t ORDER BY t.puntos DESC), '[]'::json) FROM (
        SELECT
          pr.nombre,
          SUM(vp.puntos)::INT AS puntos,
          COUNT(DISTINCT vc.id)::INT AS certs
        FROM vu_puntos vp
        LEFT JOIN profiles pr ON pr.id = vp.user_id
        LEFT JOIN vu_certificados vc ON vc.user_id = vp.user_id
        GROUP BY pr.nombre
        ORDER BY puntos DESC
        LIMIT 10
      ) t
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
