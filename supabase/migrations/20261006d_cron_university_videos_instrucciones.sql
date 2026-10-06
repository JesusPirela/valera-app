-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCCIONES: cron semanal de búsqueda de videos para Valera University
--
-- Igual que 20260611_cron_instrucciones.sql: esto NO se aplica solo porque
-- lleva tu service_role key, que no se commitea a git. Ejecuta esto a mano:
--   1. Ve a https://supabase.com/dashboard/project/ystxicgrryyzhrxinsbq
--   2. Antes que nada: Project Settings → Edge Functions → Secrets →
--      agrega YOUTUBE_API_KEY con tu API key de Google Cloud (YouTube Data API v3).
--   3. Despliega la función: npx supabase functions deploy university-buscar-videos
--   4. Click en "SQL Editor" y pega y ejecuta el siguiente bloque:
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('university-buscar-videos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'university-buscar-videos');

-- Cada lunes a las 8:00 am — trae candidatos frescos para la semana.
SELECT cron.schedule(
  'university-buscar-videos',
  '0 8 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/university-buscar-videos',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Reemplaza TU_SERVICE_ROLE_KEY con el valor de:
-- Supabase Dashboard → Project Settings → API → service_role key

-- Para probarlo de inmediato sin esperar al lunes, corre esto una vez (con tu
-- key real en vez de TU_SERVICE_ROLE_KEY):
--   SELECT net.http_post(
--     url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/university-buscar-videos',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_SERVICE_ROLE_KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
