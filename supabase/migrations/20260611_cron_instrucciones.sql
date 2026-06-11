-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCCIONES: Crear cron job para envíos automáticos de reportes
--
-- Ejecuta este SQL en el Supabase Dashboard:
--   1. Ve a https://supabase.com/dashboard/project/ystxicgrryyzhrxinsbq
--   2. Click en "SQL Editor" en el menú izquierdo
--   3. Pega y ejecuta el siguiente bloque:
-- ─────────────────────────────────────────────────────────────────────────────

-- Primero eliminarlo si ya existe (idempotente):
SELECT cron.unschedule('enviar-reportes-automaticos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enviar-reportes-automaticos');

-- Crear job que se ejecuta cada hora en punto:
SELECT cron.schedule(
  'enviar-reportes-automaticos',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/enviar-reporte',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{"check_schedules":true}'::jsonb
    );
  $$
);

-- Reemplaza TU_SERVICE_ROLE_KEY con el valor de:
-- Supabase Dashboard → Project Settings → API → service_role key
