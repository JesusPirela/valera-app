-- Errores del monitoreo marcados como "revisados/atendidos" (check/uncheck).
-- Se guardan por `mensaje` (la firma con la que se agrupan en el panel), para
-- que el marcado persista entre sesiones y se pueda marcar automáticamente al
-- arreglar un error.
CREATE TABLE IF NOT EXISTS public.monitoreo_errores_revisados (
  mensaje text PRIMARY KEY,
  revisado_en timestamptz DEFAULT now(),
  revisado_por uuid
);

ALTER TABLE public.monitoreo_errores_revisados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins revisados" ON public.monitoreo_errores_revisados;
CREATE POLICY "admins revisados" ON public.monitoreo_errores_revisados FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
