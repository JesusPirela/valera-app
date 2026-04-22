-- =========================================================
-- Personalización de perfil + Inmobiliarias + Asesores
-- =========================================================

-- ── Perfil: avatar y color de acento ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color_acento TEXT NOT NULL DEFAULT '#1a6470';

-- RLS: usuario puede actualizar su propio perfil
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (true);

-- ── Inmobiliarias / Empresas ──────────────────────────────
CREATE TABLE IF NOT EXISTS inmobiliarias (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  logo_url    TEXT,
  telefono    TEXT,
  email       TEXT,
  sitio_web   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE inmobiliarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inmobiliarias_read" ON inmobiliarias FOR SELECT USING (true);
CREATE POLICY "inmobiliarias_admin_write" ON inmobiliarias FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Asignar asesor e inmobiliaria a propiedades ───────────
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS asesor_id       UUID REFERENCES auth.users(id);
ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS inmobiliaria_id UUID REFERENCES inmobiliarias(id);

-- ── Notificar reload schema ───────────────────────────────
SELECT pg_notify('pgrst', 'reload schema');
