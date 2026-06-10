-- =========================================================
-- Agregar m2_terreno (m² de terreno) a propiedades
-- =========================================================

ALTER TABLE public.propiedades ADD COLUMN IF NOT EXISTS m2_terreno NUMERIC;

SELECT pg_notify('pgrst', 'reload schema');
