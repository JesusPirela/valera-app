-- gerente ve TODOS los chatbot_leads, igual que admin/supervisor. Lo
-- necesita citas-venta (pantalla exclusiva admin/gerente) para saber, por
-- teléfono, si un cliente ya se mandó al chatbot y pintar el botón en gris
-- -- antes gerente solo veía sus propios leads (ninguno, porque ahí siempre
-- se asigna a OTRO prospectador).

DROP POLICY IF EXISTS "chatbot_leads_select" ON chatbot_leads;
CREATE POLICY "chatbot_leads_select" ON chatbot_leads FOR SELECT USING (
  auth.uid() = prospectador_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'gerente'))
);

DROP POLICY IF EXISTS "chatbot_leads_update" ON chatbot_leads;
CREATE POLICY "chatbot_leads_update" ON chatbot_leads FOR UPDATE USING (
  auth.uid() = prospectador_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'gerente'))
);

SELECT pg_notify('pgrst', 'reload schema');
