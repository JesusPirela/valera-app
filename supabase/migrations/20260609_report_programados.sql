-- Tabla para programaciones de envío automático de reportes
CREATE TABLE IF NOT EXISTS public.report_programados (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frecuencia    TEXT        NOT NULL DEFAULT 'diario'
                            CHECK (frecuencia IN ('diario', 'semanal', 'mensual')),
  hora_envio    TEXT        NOT NULL DEFAULT '09:00',
  dia_semana    INT         DEFAULT 1,   -- 0=Dom...6=Sab (solo para 'semanal')
  destinatarios TEXT[]      NOT NULL DEFAULT '{}',
  activo        BOOLEAN     NOT NULL DEFAULT true,
  ultimo_envio  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_programados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_report_programados" ON public.report_programados;
CREATE POLICY "admins_manage_report_programados"
  ON public.report_programados FOR ALL
  TO authenticated
  USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

-- NOTA: Para ejecutar las programaciones automáticamente, configura un cron job
-- en Supabase Dashboard → Database → Cron Jobs, o usa pg_cron + pg_net:
-- SELECT cron.schedule('enviar-reportes', '0 * * * *', $$
--   SELECT net.http_post(
--     url := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/enviar-reporte',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{"check_schedules":true}'::jsonb
--   );
-- $$);
