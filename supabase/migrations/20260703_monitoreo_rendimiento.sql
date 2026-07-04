-- ═══════════════════════════════════════════════════════════════════════════
-- Monitoreo de rendimiento (Fase 3 de la auditoría 03/jul/2026)
--
-- Dos vistas para detectar problemas ANTES de que afecten a usuarios:
--   • v_slow_queries : consultas más lentas (pg_stat_statements) por tiempo medio.
--   • v_index_health : tablas dominadas por escaneos secuenciales (índice faltante).
--
-- Revisar cada semana desde el SQL editor de Supabase (o vía Management API):
--   SELECT * FROM v_slow_queries LIMIT 25;
--   SELECT * FROM v_index_health WHERE pct_seq > 50 AND filas > 500;
--
-- Para medir una ventana limpia: SELECT pg_stat_statements_reset(); y revisar
-- pasados unos días de uso normal.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_slow_queries AS
SELECT
  calls,
  round(mean_exec_time::numeric,2)  AS mean_ms,
  round(total_exec_time::numeric,0) AS total_ms,
  round(max_exec_time::numeric,0)   AS max_ms,
  rows,
  left(regexp_replace(query,'\s+',' ','g'),200) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%' AND query NOT ILIKE '%pg_catalog%' AND query NOT ILIKE '%information_schema%'
ORDER BY mean_exec_time DESC;

CREATE OR REPLACE VIEW public.v_index_health AS
SELECT
  relname AS tabla,
  n_live_tup AS filas,
  seq_scan, idx_scan,
  CASE WHEN seq_scan+idx_scan>0 THEN round(100.0*seq_scan/(seq_scan+idx_scan),1) ELSE 0 END AS pct_seq
FROM pg_stat_user_tables
WHERE n_live_tup > 100
ORDER BY seq_scan DESC;

REVOKE ALL ON public.v_slow_queries FROM anon, authenticated;
REVOKE ALL ON public.v_index_health FROM anon, authenticated;
