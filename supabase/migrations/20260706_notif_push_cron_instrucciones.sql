-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCCIONES: Crear cron job para enviar push notifications pendientes
--
-- Ejecuta este SQL en el Supabase Dashboard:
--   1. Ve a https://supabase.com/dashboard/project/ystxicgrryyzhrxinsbq
--   2. Click en "SQL Editor" en el menú izquierdo
--   3. Pega y ejecuta el siguiente bloque (reemplaza TU_SERVICE_ROLE_KEY):
-- ─────────────────────────────────────────────────────────────────────────────

-- Eliminar si ya existe (idempotente):
SELECT cron.unschedule('procesar-pushes-pendientes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procesar-pushes-pendientes');

-- Cron que corre cada minuto: envía push de notificaciones con push_enviado=FALSE
SELECT cron.schedule(
  'procesar-pushes-pendientes',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/procesar-pushes',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Reemplaza TU_SERVICE_ROLE_KEY con el valor de:
-- Supabase Dashboard → Project Settings → API → service_role key
--
-- NOTAS:
-- • El cron corre cada minuto. Las notificaciones se empujan con ~0-60 segundos de delay.
-- • Solo procesa notificaciones de las últimas 24 horas con push_enviado=FALSE.
-- • chatbot-eventos y recordatorio-notificaciones insertan con push_enviado=TRUE
--   (ellos mismos envían el push en el momento) para evitar duplicados.
-- • La Edge Function procesar-pushes está en supabase/functions/procesar-pushes/index.ts
