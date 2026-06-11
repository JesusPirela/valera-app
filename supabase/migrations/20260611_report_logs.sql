-- ─────────────────────────────────────────────────────────────────────────────
-- report_logs: historial de cada envío de reporte (éxito o error)
-- Permite auditar envíos fallidos: cuándo, a quién, qué error.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_logs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_programado_id UUID        REFERENCES public.report_programados(id) ON DELETE SET NULL,
  admin_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  destinatarios        TEXT[]      NOT NULL DEFAULT '{}',
  enviados             INT         NOT NULL DEFAULT 0,
  estado               TEXT        NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'error')),
  error_msg            TEXT,
  proveedor            TEXT,
  rango_inicio         TIMESTAMPTZ,
  rango_fin            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_logs_created ON public.report_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_logs_programado ON public.report_logs (report_programado_id);

ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver los logs
CREATE POLICY "report_logs_admin" ON public.report_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
-- La edge function usa service_role y no pasa por RLS para INSERT
