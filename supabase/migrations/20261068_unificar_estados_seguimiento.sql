-- Un solo nombre por estado en la tabla de Citas de venta.
--
-- Había 16 formas distintas para 10 estados reales, y por eso el filtro de la
-- columna enseñaba la misma cosa dos y tres veces:
--
--   Realizada           «Realizada» 44 · «realizada» 22 · «Esperando retroalimentación» 32
--   Cancelada/Reagenda  «Cancelada/Reagenda» 42 · «REAGENDADA» 36 · «Reagendada» 25 · «Cancelada» 3
--   Apartó              «Apartó» 16 · «APARTADO» 5
--   Por atender         «coordinada» 5
--
-- Cancelada y reagenda van juntas en un solo estado, que es como el equipo lo
-- decidió: cuando una cita no se da se reporta como cancelada o por reagendar
-- y se resuelve después.
--
-- «Esperando retroalimentación» se funde en «Realizada» porque decían lo
-- mismo del desenlace; lo que las diferenciaba (si la retro ya está escrita o
-- no) no se pierde: eso vive en retro_completada_at, que es su lugar, y la
-- tabla ya tiene los filtros «Con retro» y «Falta retro».
--
-- No basta con limpiar lo que hay. Lo escriben seis caminos distintos (la
-- tabla, el asistente de retro, el importador de Excel, el disparador que las
-- crea desde el CRM, y dos funciones más), y los celulares siguen con la
-- versión vieja de la app durante semanas. Por eso la normalización vive en un
-- DISPARADOR: venga de donde venga, entra ya con su nombre bueno.

-- ─── Respaldo, por si hay que volver atrás ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.respaldo_estados_citas_20261029 AS
SELECT id, estado_seguimiento, now() AS respaldado_at
  FROM public.citas_venta
 WHERE estado_seguimiento IS NOT NULL;

-- Para deshacerlo todo:
--   UPDATE public.citas_venta cv
--      SET estado_seguimiento = r.estado_seguimiento
--     FROM public.respaldo_estados_citas_20261029 r
--    WHERE r.id = cv.id;
--   DROP TRIGGER IF EXISTS trg_canonizar_estado_seguimiento ON public.citas_venta;

-- ─── El nombre bueno de cada estado ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estado_seguimiento_canonico(p_txt TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE k TEXT;
BEGIN
  IF p_txt IS NULL OR btrim(p_txt) = '' THEN
    RETURN NULL;
  END IF;

  -- Minúsculas y sin acentos, para que «Apartó», «APARTADO» y «aparto» den lo
  -- mismo. Se usa translate y no la extensión unaccent para no depender de que
  -- esté instalada.
  k := lower(translate(btrim(p_txt),
        'áéíóúüÁÉÍÓÚÜñÑ',
        'aeiouuAEIOUUnN'));

  -- El orden importa. «Cancelada/Reagenda» lleva las dos palabras dentro, así
  -- que la regla de cancelada/reagenda tiene que ir antes que nada que mire
  -- sólo una de las dos.
  IF k LIKE '%apart%'                              THEN RETURN 'Apartó'; END IF;
  IF k LIKE '%cancel%' OR k LIKE '%reagend%'       THEN RETURN 'Cancelada/Reagenda'; END IF;
  IF k LIKE '%realizada%' OR k LIKE '%esperando retro%' THEN RETURN 'Realizada'; END IF;
  IF k LIKE '%no responde%' OR k LIKE '%no contesta%'   THEN RETURN 'No responde el cliente'; END IF;
  IF k LIKE '%cierre%' AND k LIKE '%alto%'         THEN RETURN 'Seguim. cierre · alto interés'; END IF;
  IF k LIKE '%cierre%' AND k LIKE '%bajo%'         THEN RETURN 'Seguim. cierre · bajo interés'; END IF;
  IF k LIKE '%perfil%'                             THEN RETURN 'Falta perfilar / crédito'; END IF;
  IF k LIKE '%futuro%'                             THEN RETURN 'Compra a futuro'; END IF;
  IF k LIKE '%opciones%'                           THEN RETURN 'Buscar más opciones'; END IF;
  IF k LIKE '%coordinada%' OR k LIKE '%por atender%' THEN RETURN 'Por atender'; END IF;

  -- Un estado que nadie previó se deja TAL CUAL. Tirarlo o meterlo a la fuerza
  -- en un cajón que no le toca sería perder información que alguien escribió a
  -- propósito; así al menos se ve y se puede decidir qué hacer con él.
  RETURN btrim(p_txt);
END;
$function$;

-- ─── El disparador ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_canonizar_estado_seguimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.estado_seguimiento := public.estado_seguimiento_canonico(NEW.estado_seguimiento);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_canonizar_estado_seguimiento ON public.citas_venta;
CREATE TRIGGER trg_canonizar_estado_seguimiento
  BEFORE INSERT OR UPDATE OF estado_seguimiento ON public.citas_venta
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_canonizar_estado_seguimiento();

-- ─── Limpiar lo que ya está ──────────────────────────────────────────────────
UPDATE public.citas_venta
   SET estado_seguimiento = public.estado_seguimiento_canonico(estado_seguimiento)
 WHERE estado_seguimiento IS NOT NULL
   AND estado_seguimiento IS DISTINCT FROM public.estado_seguimiento_canonico(estado_seguimiento);
