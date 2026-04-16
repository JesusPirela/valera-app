-- =========================================================
-- Valera University — LMS completo
-- =========================================================

-- ── Cursos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_cursos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          TEXT        NOT NULL,
  descripcion     TEXT,
  descripcion_corta TEXT,
  imagen_url      TEXT,
  instructor      TEXT        DEFAULT 'Valera University',
  duracion_texto  TEXT,
  categoria       TEXT        NOT NULL DEFAULT 'general',
  nivel           TEXT        NOT NULL DEFAULT 'basico',
  publicado       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        REFERENCES auth.users(id),
  orden           INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vu_cursos_publicado ON vu_cursos(publicado);
ALTER TABLE vu_cursos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_cursos_admin_all" ON vu_cursos FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "vu_cursos_prosp_select" ON vu_cursos FOR SELECT
  USING (publicado = TRUE);

-- ── Lecciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_lecciones (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id        UUID        NOT NULL REFERENCES vu_cursos(id) ON DELETE CASCADE,
  titulo          TEXT        NOT NULL,
  descripcion     TEXT,
  youtube_url     TEXT,
  contenido       TEXT,
  orden           INT         NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vu_lecciones_curso ON vu_lecciones(curso_id, orden);
ALTER TABLE vu_lecciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_lecciones_admin_all" ON vu_lecciones FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "vu_lecciones_prosp_select" ON vu_lecciones FOR SELECT
  USING (EXISTS (SELECT 1 FROM vu_cursos WHERE id = curso_id AND publicado = TRUE));

-- ── Progreso ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_progreso (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leccion_id      UUID        NOT NULL REFERENCES vu_lecciones(id) ON DELETE CASCADE,
  curso_id        UUID        NOT NULL REFERENCES vu_cursos(id)   ON DELETE CASCADE,
  completada_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, leccion_id)
);

CREATE INDEX IF NOT EXISTS idx_vu_progreso_user_curso ON vu_progreso(user_id, curso_id);
ALTER TABLE vu_progreso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_progreso_own" ON vu_progreso FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vu_progreso_admin" ON vu_progreso FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Certificados ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_certificados (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curso_id        UUID        NOT NULL REFERENCES vu_cursos(id)  ON DELETE CASCADE,
  emitido_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, curso_id)
);

CREATE INDEX IF NOT EXISTS idx_vu_cert_user ON vu_certificados(user_id);
ALTER TABLE vu_certificados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_cert_own" ON vu_certificados FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "vu_cert_admin" ON vu_certificados FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Puntos (ledger) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vu_puntos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curso_id        UUID        REFERENCES vu_cursos(id)  ON DELETE SET NULL,
  leccion_id      UUID        REFERENCES vu_lecciones(id) ON DELETE SET NULL,
  puntos          INT         NOT NULL,
  concepto        TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vu_puntos_user ON vu_puntos(user_id);
ALTER TABLE vu_puntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_puntos_own" ON vu_puntos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "vu_puntos_insert_service" ON vu_puntos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "vu_puntos_admin" ON vu_puntos FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── auto updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_vu_cursos_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vu_cursos_updated_at ON vu_cursos;
CREATE TRIGGER vu_cursos_updated_at
  BEFORE UPDATE ON vu_cursos
  FOR EACH ROW EXECUTE FUNCTION update_vu_cursos_updated_at();

-- ── completar_leccion (RPC) ───────────────────────────────
CREATE OR REPLACE FUNCTION completar_leccion(p_leccion_id UUID, p_curso_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_ya_completada   BOOLEAN;
  v_total           INT;
  v_completadas     INT;
  v_curso_done      BOOLEAN := FALSE;
  v_cert_nuevo      BOOLEAN := FALSE;
  v_titulo          TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vu_progreso WHERE user_id = v_user_id AND leccion_id = p_leccion_id
  ) INTO v_ya_completada;

  IF v_ya_completada THEN
    RETURN json_build_object('ya_completada', TRUE, 'curso_completado', FALSE, 'certificado_nuevo', FALSE, 'puntos', 0);
  END IF;

  INSERT INTO vu_progreso (user_id, leccion_id, curso_id) VALUES (v_user_id, p_leccion_id, p_curso_id);

  INSERT INTO vu_puntos (user_id, curso_id, leccion_id, puntos, concepto)
  VALUES (v_user_id, p_curso_id, p_leccion_id, 10, 'leccion_completada');

  SELECT COUNT(*) INTO v_total FROM vu_lecciones WHERE curso_id = p_curso_id;
  SELECT COUNT(*) INTO v_completadas FROM vu_progreso WHERE user_id = v_user_id AND curso_id = p_curso_id;

  IF v_total > 0 AND v_completadas >= v_total THEN
    v_curso_done := TRUE;
    INSERT INTO vu_puntos (user_id, curso_id, puntos, concepto)
    VALUES (v_user_id, p_curso_id, 50, 'curso_completado');

    INSERT INTO vu_certificados (user_id, curso_id) VALUES (v_user_id, p_curso_id) ON CONFLICT DO NOTHING;

    SELECT titulo INTO v_titulo FROM vu_cursos WHERE id = p_curso_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje)
    VALUES (v_user_id, '🎓 ¡Certificado obtenido!', 'Completaste "' || v_titulo || '" y obtuviste tu certificado. +60 puntos.');

    v_cert_nuevo := TRUE;
  END IF;

  RETURN json_build_object('ya_completada', FALSE, 'curso_completado', v_curso_done, 'certificado_nuevo', v_cert_nuevo, 'puntos', 10);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger: notificar al publicar curso ──────────────────
CREATE OR REPLACE FUNCTION notify_prospectadores_nuevo_curso()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.publicado = FALSE AND NEW.publicado = TRUE) THEN
    INSERT INTO notificaciones (user_id, titulo, mensaje)
    SELECT p.id,
      '🎓 Nuevo curso en Valera University',
      'Se publicó: "' || NEW.titulo || '". ¡Entra y gana puntos!'
    FROM profiles p
    WHERE p.role IN ('prospectador', 'prospectador_plus');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_nuevo_curso ON vu_cursos;
CREATE TRIGGER trigger_nuevo_curso
  AFTER UPDATE ON vu_cursos
  FOR EACH ROW EXECUTE FUNCTION notify_prospectadores_nuevo_curso();

-- ── RPC stats para admin ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_vu_stats_admin()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'total_cursos',      (SELECT COUNT(*)::INT FROM vu_cursos),
    'cursos_publicados', (SELECT COUNT(*)::INT FROM vu_cursos WHERE publicado = TRUE),
    'total_cert',        (SELECT COUNT(*)::INT FROM vu_certificados),
    'total_puntos',      (SELECT COALESCE(SUM(puntos),0)::INT FROM vu_puntos),
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

-- ── Datos semilla: curso inicial con las 4 lecciones ─────
INSERT INTO vu_cursos (id, titulo, descripcion, descripcion_corta, instructor, duracion_texto, categoria, nivel, publicado, orden)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Introducción a Valera Real Estate',
  'Aprende todo lo que necesitas saber para comenzar como prospectador en Valera Real Estate. Desde los fundamentos de prospección hasta el cierre de ventas exitoso.',
  'Fundamentos y mejores prácticas para prospectadores',
  'Valera University',
  '~60 min · 4 lecciones',
  'Fundamentos',
  'basico',
  TRUE,
  1
) ON CONFLICT (id) DO NOTHING;

INSERT INTO vu_lecciones (curso_id, titulo, descripcion, youtube_url, orden)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'Bienvenida al equipo Valera',
   'Introducción a la empresa, valores y misión de Valera Real Estate. Conoce la cultura y lo que se espera de ti como prospectador.',
   'https://www.youtube.com/embed/OefqBTBREgY', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'El proceso de prospección',
   'Aprende las técnicas fundamentales para identificar y contactar prospectos de manera efectiva.',
   'https://www.youtube.com/embed/EG56NdrR8AU', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'Manejo del CRM',
   'Domina el sistema CRM para gestionar tus clientes, dar seguimiento y no perder ninguna oportunidad.',
   'https://www.youtube.com/embed/OsvyD_obYyI', 3),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'Cierre de ventas',
   'Estrategias probadas para cerrar ventas exitosamente y convertir prospectos en clientes.',
   'https://www.youtube.com/embed/UvrREGnYa-w', 4)
ON CONFLICT DO NOTHING;
