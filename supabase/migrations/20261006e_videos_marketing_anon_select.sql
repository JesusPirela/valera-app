-- ══════════════════════════════════════════════════════════════════════════════
-- Lectura pública (sin login) de videos_marketing, para la landing page
-- pública (proyecto aparte, sitio estático). El bucket 'videos-marketing' ya
-- es público — esto es solo la tabla.
--
-- El GRANT es la puerta de entrada al motor de RLS: sin él, anon ni siquiera
-- llega a evaluar la policy (mismo patrón que solicitudes_sitio_web/
-- candidatos_reclutamiento en 20260918_solicitudes_sitio_web.sql).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "videos_anon_select" ON public.videos_marketing
  FOR SELECT TO anon
  USING (activo = true);

GRANT SELECT ON public.videos_marketing TO anon;

SELECT pg_notify('pgrst', 'reload schema');
