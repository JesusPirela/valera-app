-- ─────────────────────────────────────────────────────────────────────────────
-- lona_contactada: clasificación de propiedades para el mapa de lonas.
-- Permite distinguir en el mapa qué propiedades ya fueron contactadas y cuáles
-- aún no, agrupando por zonas (queretaro / monterrey / puebla).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS lona_contactada BOOLEAN NOT NULL DEFAULT false;

SELECT pg_notify('pgrst', 'reload schema');
