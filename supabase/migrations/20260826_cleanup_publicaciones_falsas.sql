-- CLEANUP: publicaciones sin fecha real (código viejo anterior al 19 jun 2026)
--
-- Dos usuarios tenían propiedad_publicacion.publicada = true con veces_publicada > 0
-- pero sin fecha_publicacion (nunca pasaron por publicar_propiedad_atomico) y
-- sus únicos publicacion_log entries son del backfill del 23 jun 2026 (falsos).
-- Resultado visible: la propiedad les aparecía como "✅ Publicada" aunque nunca
-- la publicaron intencionalmente.
--
-- Criterio de seguridad: solo toca filas donde:
--   1. fecha_publicacion IS NULL (no pasó por el RPC nuevo)
--   2. veces_publicada > 0 (marcada como publicada por código viejo)
--   3. NO existe ningún publicacion_log anterior al 23 jun (no hay publicación real)

-- Paso 1: eliminar los log entries del backfill (son los únicos que existen)
DELETE FROM public.publicacion_log pl
WHERE EXISTS (
  SELECT 1 FROM public.propiedad_publicacion pp
  WHERE pp.propiedad_id = pl.propiedad_id
    AND pp.user_id      = pl.user_id
    AND pp.fecha_publicacion IS NULL
    AND pp.veces_publicada > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.publicacion_log pl2
      WHERE pl2.propiedad_id = pp.propiedad_id
        AND pl2.user_id      = pp.user_id
        AND pl2.created_at   < '2026-06-23T00:00:00Z'
    )
);

-- Paso 2: resetear el contador y la bandera de publicación
UPDATE public.propiedad_publicacion pp
SET
  veces_publicada  = 0,
  publicada        = false
WHERE pp.fecha_publicacion IS NULL
  AND pp.veces_publicada > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.publicacion_log pl
    WHERE pl.propiedad_id = pp.propiedad_id
      AND pl.user_id      = pp.user_id
      AND pl.created_at   < '2026-06-23T00:00:00Z'
  );
