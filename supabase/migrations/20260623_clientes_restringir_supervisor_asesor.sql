-- =========================================================
-- Revertir: supervisor y asesor ya NO ven/editan/borran los
-- clientes de todo el equipo, solo los propios (responsable_id).
-- Antes (20260618_asesor_rls_y_rpcs.sql) se les había dado
-- visibilidad total como al admin; el usuario pidió que vuelvan
-- a estar limitados a sus propios clientes, igual que un
-- prospectador normal. Solo 'admin' conserva visibilidad total.
-- =========================================================

DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

SELECT pg_notify('pgrst', 'reload schema');
