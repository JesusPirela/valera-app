-- ═══════════════════════════════════════════════════════════════════════════
-- Rendimiento del inicio: descripción recortada para el listado (07/jul/2026)
--
-- El home del prospectador trae las 1,521 propiedades disponibles al entrar.
-- Las descripciones completas (promedio ~998 chars) pesaban ~1.5 MB, pero la
-- tarjeta solo muestra un preview de 2 líneas. Esta columna generada da los
-- primeros 180 chars; el listado la usa en vez de `descripcion` (la completa se
-- sigue trayendo en el detalle). Reduce el payload ~1.2 MB y hace que el cache
-- persistido rehidrate más rápido al abrir la app.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS descripcion_corta text
  GENERATED ALWAYS AS (left(descripcion, 180)) STORED;
