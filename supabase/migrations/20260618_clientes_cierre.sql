-- =========================================================
-- Documentación y cierre: flag/checklist simple en clientes
-- (sin storage de archivos por ahora)
-- =========================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cierre_completado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cierre_notas text;

SELECT pg_notify('pgrst', 'reload schema');
