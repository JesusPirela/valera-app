-- ══════════════════════════════════════════════════════════════
-- INVENTARIO — estados adicionales de seguimiento
-- Checkboxes independientes que complementan la checklist existente:
--   • inv_asesor_no_contesto → el asesor no me contestó
--   • inv_apartada           → la casa ya está apartada
--   • inv_no_autorizada      → no me dejaron publicarla
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS inv_asesor_no_contesto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inv_apartada           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inv_no_autorizada      boolean NOT NULL DEFAULT false;

SELECT pg_notify('pgrst', 'reload schema');
