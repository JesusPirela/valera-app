-- =========================================================
-- Rol Supervisor + Inmobiliarias (colaboradores) + exclusividad
-- =========================================================

-- ── Inmobiliarias: campos mínimos adicionales ────────────
ALTER TABLE inmobiliarias ADD COLUMN IF NOT EXISTS asesor_referencia TEXT;
ALTER TABLE inmobiliarias ADD COLUMN IF NOT EXISTS exclusiva BOOLEAN NOT NULL DEFAULT false;

-- ── Backfill: preservar registros ya existentes en "asesores" ──
-- Cada asesor con campo "inmobiliaria" (texto) se convierte en un
-- registro de inmobiliarias (nombre = inmobiliaria, asesor_referencia = nombre del asesor)
INSERT INTO inmobiliarias (nombre, asesor_referencia, telefono)
SELECT DISTINCT ON (a.inmobiliaria) a.inmobiliaria, a.nombre, a.telefono
FROM asesores a
WHERE a.inmobiliaria IS NOT NULL AND a.inmobiliaria <> ''
  AND NOT EXISTS (SELECT 1 FROM inmobiliarias i WHERE i.nombre = a.inmobiliaria);

-- ── Seed: colaboradores exclusivos para Prospectador Plus ────
-- (Prospectador/Nuevo no ven propiedades de estas inmobiliarias)
INSERT INTO inmobiliarias (nombre, exclusiva)
SELECT n, true FROM (VALUES
  ('Andrés Segura'),
  ('Terrafirme'),
  ('Century21 Giba'),
  ('Carvi'),
  ('Verde Olivo'),
  ('Vivendo'),
  ('Tory')
) AS v(n)
WHERE NOT EXISTS (SELECT 1 FROM inmobiliarias i WHERE i.nombre = v.n);

UPDATE inmobiliarias SET exclusiva = true
WHERE nombre IN ('Andrés Segura', 'Terrafirme', 'Century21 Giba', 'Carvi', 'Verde Olivo', 'Vivendo', 'Tory');

-- ── RLS clientes (CRM): el rol Supervisor ve/gestiona como admin ──
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

-- ── Notificar reload schema ───────────────────────────────
SELECT pg_notify('pgrst', 'reload schema');
