-- ══════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA Y LIMPIEZA: publicaciones históricas incorrectas
--
-- Contexto: antes del 19-jun-2026 (publicar_propiedad_atomico), el cliente
-- escribía directamente en propiedad_publicacion con veces_publicada calculado
-- en cliente (susceptible a lost-update, caché desactualizado, multi-cuenta).
-- Antes del 29-may-2026 no había RLS activo en la tabla. Esos datos persisten.
--
-- Esta migración:
--   1. Elimina filas "seed" acumuladas desde jun-2026 (veces=0, publicada=false,
--      sin fecha): las crea publicar_propiedad_atomico al intentar publicar, el
--      cleanup original fue one-time y no cubre las nuevas.
--   2. Encuentra y reporta usuarios con conteo de publicacion_log < veces_publicada
--      (candidatos a datos inflados): útil para auditoría manual.
--   3. Para el caso más claro (veces_publicada=1 Y publicacion_log=0 registros),
--      que indica una fila creada por el sistema antiguo antes del trigger, resetea
--      a 0 — son las más probablemente erróneas (el trigger no las registró porque
--      no estaba activo o el trigger viejo creó duplicados pero no el entry).
--      NOTA: esto es conservador; no toca veces_publicada >= 2 ni las que SÍ tienen
--      entradas en publicacion_log (aunque puedan ser backfill).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Eliminar filas seed (veces=0, publicada=false, sin fecha) ─────────────
-- Estas acumulan desde cada intento de publicar que falla antes del FOR UPDATE.
DELETE FROM public.propiedad_publicacion
WHERE veces_publicada = 0
  AND publicada = false
  AND fecha_publicacion IS NULL;

-- ── 2. Log de diagnóstico: usuarios con discrepancia log vs veces_publicada ──
-- Ejecutar en psql o SQL Editor de Supabase para auditoría manual:
--
-- SELECT
--   pp.user_id,
--   prof.nombre,
--   au.email,
--   pp.propiedad_id,
--   prop.codigo,
--   pp.veces_publicada,
--   COUNT(pl.id) AS entradas_log,
--   pp.fecha_publicacion
-- FROM public.propiedad_publicacion pp
-- JOIN public.propiedades prop ON prop.id = pp.propiedad_id
-- JOIN public.profiles    prof ON prof.id = pp.user_id
-- JOIN auth.users         au   ON au.id   = pp.user_id
-- LEFT JOIN public.publicacion_log pl
--        ON pl.propiedad_id = pp.propiedad_id AND pl.user_id = pp.user_id
-- WHERE pp.veces_publicada > 0
-- GROUP BY pp.user_id, prof.nombre, au.email, pp.propiedad_id, prop.codigo,
--          pp.veces_publicada, pp.fecha_publicacion
-- HAVING COUNT(pl.id) = 0   -- tiene veces_publicada pero ninguna entrada en log
--    OR COUNT(pl.id) < pp.veces_publicada  -- log incompleto vs contador
-- ORDER BY pp.user_id, pp.veces_publicada DESC;

-- ── 3. Reset conservador: veces=1 sin ningún entry en publicacion_log ─────────
-- Estas son las más probablemente falsas: el sistema antiguo (sin trigger activo)
-- las creó con veces=1 pero nunca hubo una publicación real registrada en el log.
-- Si una prospectadora reporta que una propiedad le aparece como publicada
-- y ella no la publicó, lo más probable es que sea una de estas filas.
--
-- ADVERTENCIA: esto revierte a "no publicada" para esas filas. Si el trigger
-- simplemente no logró registrar la publicación real, se pierde el historial.
-- Para ser más conservadores, comentar este bloque y hacer la limpieza manual
-- por usuario/propiedad según el diagnóstico del paso 2.

UPDATE public.propiedad_publicacion pp
SET veces_publicada   = 0,
    publicada         = false,
    fecha_publicacion = NULL
WHERE pp.veces_publicada = 1
  AND pp.publicada = true
  AND NOT EXISTS (
    SELECT 1 FROM public.publicacion_log pl
    WHERE pl.propiedad_id = pp.propiedad_id
      AND pl.user_id = pp.user_id
  );

-- ── 4. Sincronizar publicada con veces_publicada (mantenimiento) ─────────────
-- Garantiza consistencia después de cualquier cambio manual o edge case futuro.
UPDATE public.propiedad_publicacion
SET publicada = (veces_publicada > 0)
WHERE publicada IS DISTINCT FROM (veces_publicada > 0);

SELECT pg_notify('pgrst', 'reload schema');
