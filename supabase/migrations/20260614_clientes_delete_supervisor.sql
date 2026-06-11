-- Permitir que el rol Supervisor también pueda borrar clientes desde el CRM,
-- igual que admin (antes solo admin podía).
DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

SELECT pg_notify('pgrst', 'reload schema');
