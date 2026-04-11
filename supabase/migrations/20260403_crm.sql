-- =========================================================
-- CRM: Clientes, Interacciones, Recordatorios
-- =========================================================

-- ── Tabla principal de clientes ──────────────────────────

CREATE TABLE IF NOT EXISTS clientes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT        NOT NULL,
  telefono          TEXT        NOT NULL,
  email             TEXT,
  empresa           TEXT,
  fuente_lead       TEXT        NOT NULL DEFAULT 'otro',
  -- Valores: referido | redes_sociales | sitio_web | llamada_fria | evento | otro
  notas             TEXT,
  estado            TEXT        NOT NULL DEFAULT 'por_perfilar',
  -- Valores: no_contesta | descartado | por_perfilar | cita_por_agendar | cita_agendada | seguimiento_cierre | compro
  proximo_contacto  TIMESTAMPTZ,
  responsable_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_responsable ON clientes(responsable_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estado      ON clientes(estado);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Prospectadores ven sus clientes; admins ven todos
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (
  auth.uid() = responsable_id
);
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_clientes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clientes_updated_at ON clientes;
CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_clientes();


-- ── Historial de interacciones ───────────────────────────

CREATE TABLE IF NOT EXISTS interacciones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL DEFAULT 'nota',
  -- Valores: nota | llamada | mensaje | visita | estado_cambiado
  descripcion TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interacciones_cliente ON interacciones(cliente_id);

ALTER TABLE interacciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interacciones_select" ON interacciones FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "interacciones_insert" ON interacciones FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY "interacciones_delete" ON interacciones FOR DELETE USING (
  auth.uid() = user_id
);


-- ── Recordatorios / Tareas de seguimiento ────────────────

CREATE TABLE IF NOT EXISTS recordatorios (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo      TEXT        NOT NULL,
  descripcion TEXT,
  fecha_hora  TIMESTAMPTZ NOT NULL,
  completado  BOOLEAN     NOT NULL DEFAULT FALSE,
  notificado  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_user    ON recordatorios(user_id);
CREATE INDEX IF NOT EXISTS idx_recordatorios_cliente ON recordatorios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendiente
  ON recordatorios(user_id, fecha_hora) WHERE completado = FALSE AND notificado = FALSE;

ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recordatorios_select" ON recordatorios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "recordatorios_insert" ON recordatorios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recordatorios_update" ON recordatorios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "recordatorios_delete" ON recordatorios FOR DELETE USING (auth.uid() = user_id);

-- ── Política de insert en notificaciones para recordatorios ──
-- (Los usuarios pueden insertar notificaciones para sí mismos)
-- Asegúrate de ejecutar también la migration de notificaciones si no está hecha.
-- Si ya existe la política, se puede ignorar este paso:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notificaciones' AND policyname = 'notif_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "notif_insert_own" ON notificaciones FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;
