-- ═══════════════════════════════════════════════════════════════════════════
-- Campo "Atiende / Atendido por" en citas_coordinacion: permite asignar
-- un perfil con rol 'asesor' a cada cita, y restringe la visibilidad de
-- citas_coordinacion para 'asesor' a solo las citas que tiene asignadas
-- (antes veía todas, igual que admin/supervisor).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.citas_coordinacion
  ADD COLUMN IF NOT EXISTS asesor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_citas_asesor ON public.citas_coordinacion(asesor_id);

-- Admin/supervisor: acceso total (se quita 'asesor' de esta policy; ahora
-- tiene su propia policy más abajo, restringida a sus citas asignadas)
DROP POLICY IF EXISTS "citas_admin_all" ON public.citas_coordinacion;
CREATE POLICY "citas_admin_all" ON public.citas_coordinacion
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

-- Asesor: solo ve/gestiona las citas donde es el "atendido por" asignado
DROP POLICY IF EXISTS "citas_asesor_all" ON public.citas_coordinacion;
CREATE POLICY "citas_asesor_all" ON public.citas_coordinacion
  FOR ALL
  USING (auth.uid() = asesor_id)
  WITH CHECK (auth.uid() = asesor_id);

SELECT pg_notify('pgrst', 'reload schema');
