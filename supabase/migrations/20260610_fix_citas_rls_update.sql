-- ─────────────────────────────────────────────────────────────────────────────
-- Corregir RLS de citas_coordinacion para garantizar que admins y supervisores
-- pueden actualizar el estado (UPDATE silencioso bloqueado con la política anterior)
-- ─────────────────────────────────────────────────────────────────────────────

-- Recrear política ALL de admin para incluir supervisor también
DROP POLICY IF EXISTS "citas_admin_all" ON public.citas_coordinacion;
CREATE POLICY "citas_admin_all" ON public.citas_coordinacion
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );

-- Prospectadores: actualizar sólo sus propias citas (para estados básicos desde su app)
DROP POLICY IF EXISTS "citas_prospectador_update" ON public.citas_coordinacion;
CREATE POLICY "citas_prospectador_update" ON public.citas_coordinacion
  FOR UPDATE
  USING (auth.uid() = prospectador_id)
  WITH CHECK (auth.uid() = prospectador_id);

SELECT pg_notify('pgrst', 'reload schema');
