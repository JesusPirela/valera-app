-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCCIONES: cron de chatbot automático para leads de campaña sin respuesta
--
-- Igual que otros crons que llaman una edge function (ver
-- 20260611_cron_instrucciones.sql): esto NO se aplica solo porque lleva tu
-- service_role key, que no se commitea a git. Ejecuta esto a mano:
--   1. Despliega la función: npx supabase functions deploy revisar-respuesta-campania
--   2. Ve a https://supabase.com/dashboard/project/ystxicgrryyzhrxinsbq → SQL Editor
--   3. Pega y ejecuta el siguiente bloque (reemplazando TU_SERVICE_ROLE_KEY):
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('revisar-respuesta-campania')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'revisar-respuesta-campania');

-- Cada 30 min: de sobra para un plazo de 24h, sin golpear la función sin necesidad.
SELECT cron.schedule(
  'revisar-respuesta-campania',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/revisar-respuesta-campania',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Reemplaza TU_SERVICE_ROLE_KEY con el valor de:
-- Supabase Dashboard → Project Settings → API → service_role key

-- Para probarlo de inmediato sin esperar al cron (con tu key real en vez de
-- TU_SERVICE_ROLE_KEY):
--   SELECT net.http_post(
--     url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/revisar-respuesta-campania',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
