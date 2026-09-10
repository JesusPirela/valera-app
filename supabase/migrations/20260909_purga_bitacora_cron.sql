-- Purga automática de la bitácora de pg_cron (cron.job_run_details).
--
-- Contexto: el 2026-09-09 el instance (Micro, 1 GB RAM) se ahogó ~1h y devolvió
-- 504 en el login. Causa de fondo: falta de recursos. Esta tabla no fue la causa,
-- pero crecía sin límite desde abril (112,768 filas / 83 MB) porque
-- 'procesar-pushes-pendientes' corre cada minuto (~1,440 filas/día) y nada la
-- borraba. Es peso muerto que conviene quitar de un instance chico.
--
-- Se deja solo una semana de historial y se programa una purga diaria.

-- Purga inicial: conservar 7 días.
DELETE FROM cron.job_run_details
WHERE end_time < now() - interval '7 days'
   OR (end_time IS NULL AND start_time < now() - interval '7 days');

-- Cron diario (05:30 GMT, hueco libre entre los demás jobs).
SELECT cron.schedule(
  'purgar-bitacora-cron',
  '30 5 * * *',
  $$ DELETE FROM cron.job_run_details
     WHERE end_time < now() - interval '7 days'
        OR (end_time IS NULL AND start_time < now() - interval '7 days') $$
);
