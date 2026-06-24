-- =========================================================
-- Revertir: supervisor ya NO ve/gestiona todas las citas del
-- equipo en citas_coordinacion, solo las propias (donde
-- prospectador_id = auth.uid(), vía la policy genérica
-- "citas_prospectador_select/insert/update" ya existente).
-- Solo 'admin' conserva acceso total.
--
-- 'asesor' ya estaba correctamente restringido a sus citas
-- asignadas (asesor_id = auth.uid()) desde 20260618_citas_asesor_id.sql
-- y no se toca aquí.
-- =========================================================

DROP POLICY IF EXISTS "citas_admin_all" ON public.citas_coordinacion;
CREATE POLICY "citas_admin_all" ON public.citas_coordinacion
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

SELECT pg_notify('pgrst', 'reload schema');
