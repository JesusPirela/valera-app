-- ══════════════════════════════════════════════════════════════════════════════
-- Fix crítico: inconsistencias en propiedad_publicacion
--
-- Problema: filas donde publicada=TRUE pero veces_publicada=0 se cuentan como
-- "publicada" en queries de tareas (.eq('publicada', true)) aunque el usuario
-- no ha publicado realmente. Además filas donde veces_publicada>0 pero
-- publicada=FALSE hacen que las estadísticas de tareas no cuenten.
--
-- Causa: función de publicación anterior a publicar_propiedad_atomico podía
-- poner publicada=true sin incrementar veces_publicada en ciertos edge cases.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Sincronizar publicada con veces_publicada (la fuente de verdad)
UPDATE public.propiedad_publicacion
SET publicada = (veces_publicada > 0)
WHERE publicada IS DISTINCT FROM (veces_publicada > 0);

-- 2. Eliminar filas "fantasma" (seed rows nunca usadas: veces=0, nunca publicó)
--    Estas se crean con ON CONFLICT DO NOTHING en publicar_propiedad_atomico
--    cuando el usuario intenta publicar pero falla. Son ruido.
DELETE FROM public.propiedad_publicacion
WHERE veces_publicada = 0 AND publicada = false AND fecha_publicacion IS NULL;

-- 3. Asegurar que el trigger solo dispare en incrementos reales de veces_publicada
--    (ya estaba así en 20260615, pero aseguramos la versión correcta)
CREATE OR REPLACE FUNCTION public.fn_log_publicacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo loguear cuando veces_publicada aumenta (publicación real, no undo ni update sin cambio)
  IF NEW.veces_publicada > COALESCE(OLD.veces_publicada, 0) THEN
    INSERT INTO public.publicacion_log (propiedad_id, user_id)
    VALUES (NEW.propiedad_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Sincronizar publicacion_log con veces_publicada para usuarios desincronizados:
--    Si un usuario tiene veces_publicada=N pero solo M entradas en publicacion_log
--    con M < N (por entradas borradas o no logueadas), agregar entradas faltantes.
--    Esto es raro pero lo cerramos aquí.
INSERT INTO public.publicacion_log (propiedad_id, user_id, created_at)
SELECT pp.propiedad_id, pp.user_id,
       NOW() - (gs.n * INTERVAL '1 minute')
FROM public.propiedad_publicacion pp
CROSS JOIN generate_series(1,
  GREATEST(0,
    pp.veces_publicada - (
      SELECT COUNT(*) FROM public.publicacion_log pl
      WHERE pl.propiedad_id = pp.propiedad_id AND pl.user_id = pp.user_id
    )
  )
) AS gs(n)
WHERE pp.veces_publicada > 0
  AND pp.veces_publicada > (
    SELECT COUNT(*) FROM public.publicacion_log pl
    WHERE pl.propiedad_id = pp.propiedad_id AND pl.user_id = pp.user_id
  );
